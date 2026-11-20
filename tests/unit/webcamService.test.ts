import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  WebcamError,
  isWebcamSupported,
  classifyWebcamError,
  listVideoDevices,
  startWebcamStream,
  stopWebcamStream,
  attachStreamToVideo,
  captureWebcamFrame,
} from '../../src/media/webcamService';
import { ImageProcessingError } from '../../src/media/imageProcessor';

describe('webcamService', () => {
  const originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'mediaDevices',
  );
  const originalIsSecureContextDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'isSecureContext',
  );

  function setNavigatorMediaDevices(value: MediaDevices | undefined) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value,
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }

    if (originalIsSecureContextDescriptor) {
      Object.defineProperty(window, 'isSecureContext', originalIsSecureContextDescriptor);
    } else {
      Reflect.deleteProperty(window, 'isSecureContext');
    }
  });

  describe('classifyWebcamError', () => {
    it('classifies DOMException error names accurately', () => {
      expect(classifyWebcamError({ name: 'NotAllowedError', message: 'denied' }).code).toBe(
        'PERMISSION_DENIED',
      );
      expect(classifyWebcamError({ name: 'PermissionDeniedError' }).code).toBe(
        'PERMISSION_DENIED',
      );
      expect(classifyWebcamError({ name: 'SecurityError' }).code).toBe('PERMISSION_DENIED');

      expect(classifyWebcamError({ name: 'NotFoundError' }).code).toBe('NO_CAMERA');
      expect(classifyWebcamError({ name: 'DevicesNotFoundError' }).code).toBe('NO_CAMERA');
      expect(classifyWebcamError({ name: 'OverconstrainedError' }).code).toBe('NO_CAMERA');

      expect(classifyWebcamError({ name: 'NotReadableError' }).code).toBe('DEVICE_IN_USE');
      expect(classifyWebcamError({ name: 'TrackStartError' }).code).toBe('DEVICE_IN_USE');
      expect(classifyWebcamError({ name: 'AbortError' }).code).toBe('DEVICE_IN_USE');

      expect(classifyWebcamError({ name: 'NotSupportedError' }).code).toBe('UNSUPPORTED_CONTEXT');
      expect(classifyWebcamError({ name: 'TypeError' }).code).toBe('UNSUPPORTED_CONTEXT');

      expect(classifyWebcamError(new Error('weird error')).code).toBe('UNKNOWN');
      expect(classifyWebcamError('string-error').code).toBe('UNKNOWN');
    });
  });

  describe('missing navigator.mediaDevices', () => {
    it('handles absent mediaDevices cleanly with zero console.error calls', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      setNavigatorMediaDevices(undefined);

      expect(isWebcamSupported()).toBe(false);
      await expect(listVideoDevices()).resolves.toEqual([]);
      await expect(startWebcamStream()).rejects.toMatchObject({
        name: 'WebcamError',
        code: 'UNSUPPORTED_CONTEXT',
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('returns false when window.isSecureContext is false', () => {
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        value: false,
      });
      setNavigatorMediaDevices({
        getUserMedia: vi.fn(),
      } as unknown as MediaDevices);

      expect(isWebcamSupported()).toBe(false);
    });
  });

  describe('startWebcamStream, listVideoDevices, attachStreamToVideo & stopWebcamStream', () => {
    it('passes default facingMode or exact deviceId constraints to getUserMedia', async () => {
      const mockStream = { getTracks: () => [] } as unknown as MediaStream;
      const getUserMedia = vi.fn().mockResolvedValue(mockStream);
      const enumerateDevices = vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Front Camera' },
        { kind: 'videoinput', deviceId: 'cam-2', label: '' },
      ]);

      setNavigatorMediaDevices({
        getUserMedia,
        enumerateDevices,
      } as unknown as MediaDevices);

      expect(isWebcamSupported()).toBe(true);
      await expect(listVideoDevices()).resolves.toEqual([
        { deviceId: 'cam-1', label: 'Front Camera' },
        { deviceId: 'cam-2', label: 'Camera 2' },
      ]);

      await expect(startWebcamStream()).resolves.toBe(mockStream);
      expect(getUserMedia).toHaveBeenCalledWith({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      await startWebcamStream({ deviceId: 'cam-2', width: 320, height: 240 });
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: {
          deviceId: { exact: 'cam-2' },
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
        audio: false,
      });
    });

    it('translates getUserMedia NotAllowedError without console.error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      setNavigatorMediaDevices({
        getUserMedia: vi.fn().mockRejectedValue(
          Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
        ),
      } as unknown as MediaDevices);

      await expect(startWebcamStream()).rejects.toBeInstanceOf(WebcamError);
      await expect(startWebcamStream()).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('stops all tracks resiliently and clears video srcObject', async () => {
      const track1Stop = vi.fn(() => {
        throw new Error('Track already stopped');
      });
      const track2Stop = vi.fn();
      const mockStream = {
        getTracks: () => [{ stop: track1Stop }, { stop: track2Stop }],
      } as unknown as MediaStream;

      const mockVideo = {
        muted: false,
        playsInline: false,
        autoplay: false,
        srcObject: null as MediaStream | null,
        play: vi.fn().mockRejectedValue(new DOMException('Interrupted', 'AbortError')),
        pause: vi.fn(),
      } as unknown as HTMLVideoElement;

      await expect(attachStreamToVideo(mockVideo, mockStream)).resolves.toBeUndefined();
      expect(mockVideo.muted).toBe(true);
      expect(mockVideo.playsInline).toBe(true);
      expect(mockVideo.autoplay).toBe(true);
      expect(mockVideo.srcObject).toBe(mockStream);

      stopWebcamStream(mockStream, mockVideo);
      expect(track1Stop).toHaveBeenCalledTimes(1);
      expect(track2Stop).toHaveBeenCalledTimes(1);
      expect(mockVideo.pause).toHaveBeenCalledTimes(1);
      expect(mockVideo.srcObject).toBeNull();
    });
  });

  describe('captureWebcamFrame', () => {
    it('throws ImageProcessingError(EMPTY_SOURCE) when video is not ready', () => {
      const unreadyVideo = {
        readyState: 0,
        videoWidth: 0,
        videoHeight: 0,
      } as unknown as HTMLVideoElement;

      expect(() => captureWebcamFrame(unreadyVideo)).toThrow(ImageProcessingError);
      try {
        captureWebcamFrame(unreadyVideo);
      } catch (err) {
        expect((err as ImageProcessingError).code).toBe('EMPTY_SOURCE');
      }
    });
  });
});
