import {
  ImageProcessingError,
  normalizeVideoFrameToImage,
  type NormalizeImageOptions,
  type NormalizedImageResult,
} from './imageProcessor';

export type WebcamErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA'
  | 'DEVICE_IN_USE'
  | 'UNSUPPORTED_CONTEXT'
  | 'UNKNOWN';

export class WebcamError extends Error {
  readonly code: WebcamErrorCode;

  constructor(code: WebcamErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebcamError';
    this.code = code;
  }
}

export interface WebcamDeviceInfo {
  deviceId: string;
  label: string;
}

export interface StartWebcamOptions {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
}

export function isWebcamSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return false;
  }
  return Boolean(
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function classifyWebcamError(error: unknown): WebcamError {
  if (error instanceof WebcamError) {
    return error;
  }

  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'Unable to access webcam.';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new WebcamError('PERMISSION_DENIED', message, { cause: error });
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new WebcamError('NO_CAMERA', message, { cause: error });
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new WebcamError('DEVICE_IN_USE', message, { cause: error });
    case 'NotSupportedError':
    case 'TypeError':
      return new WebcamError('UNSUPPORTED_CONTEXT', message, { cause: error });
    default:
      return new WebcamError('UNKNOWN', message, { cause: error });
  }
}

export async function listVideoDevices(): Promise<WebcamDeviceInfo[]> {
  if (
    !isWebcamSupported() ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
  } catch {
    return [];
  }
}

export async function startWebcamStream(
  options?: StartWebcamOptions
): Promise<MediaStream> {
  if (!isWebcamSupported()) {
    throw new WebcamError(
      'UNSUPPORTED_CONTEXT',
      'Camera API is unavailable in this browser context.'
    );
  }

  const idealWidth = options?.width ?? 640;
  const idealHeight = options?.height ?? 480;

  const videoConstraints: MediaTrackConstraints = options?.deviceId
    ? {
        deviceId: { exact: options.deviceId },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      }
    : {
        facingMode: options?.facingMode ?? 'user',
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
  } catch (err) {
    throw classifyWebcamError(err);
  }
}

export function stopWebcamStream(
  stream: MediaStream | null | undefined,
  videoElement?: HTMLVideoElement | null
): void {
  if (stream) {
    try {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        try {
          track.stop();
        } catch {
          // Ignore individual track disposal errors
        }
      }
    } catch {
      // Ignore getTracks errors on closed/mock streams
    }
  }

  if (videoElement) {
    try {
      videoElement.pause();
    } catch {
      // Ignore pause errors
    }
    try {
      videoElement.srcObject = null;
    } catch {
      // Ignore srcObject reset errors
    }
  }
}

export async function attachStreamToVideo(
  videoElement: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.autoplay = true;
  videoElement.srcObject = stream;

  if (typeof videoElement.play === 'function') {
    try {
      await videoElement.play();
    } catch {
      // React StrictMode unmount or autoplay policy interruptions must not leak uncaught rejections
    }
  }
}

export function captureWebcamFrame(
  videoElement: HTMLVideoElement,
  options?: NormalizeImageOptions
): NormalizedImageResult {
  if (
    typeof videoElement.readyState === 'number' &&
    videoElement.readyState < 2 &&
    (videoElement.videoWidth <= 0 || videoElement.videoHeight <= 0)
  ) {
    throw new ImageProcessingError(
      'EMPTY_SOURCE',
      'Webcam video stream does not have an active frame yet.'
    );
  }
  return normalizeVideoFrameToImage(videoElement, options);
}
