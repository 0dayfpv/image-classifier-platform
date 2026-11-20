import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ImageProcessingError,
  resolveSupportedMimeType,
  isSupportedImageFile,
  computeScaledDimensions,
  loadImageElement,
  normalizeCanvasToImage,
  normalizeVideoFrameToImage,
  normalizeFileToImage,
} from '../../src/media/imageProcessor';

describe('imageProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveSupportedMimeType & isSupportedImageFile', () => {
    it('accepts supported MIME types including image/jpg alias', () => {
      expect(resolveSupportedMimeType({ type: 'image/jpeg', name: 'photo.jpg' })).toBe('image/jpeg');
      expect(resolveSupportedMimeType({ type: 'image/jpg', name: 'photo' })).toBe('image/jpeg');
      expect(resolveSupportedMimeType({ type: 'image/png', name: 'drawing.dat' })).toBe('image/png');
      expect(resolveSupportedMimeType({ type: 'image/webp', name: 'img' })).toBe('image/webp');
      expect(isSupportedImageFile({ type: 'IMAGE/PNG', name: 'test.bin' })).toBe(true);
    });

    it('falls back to file extension only when type is empty or application/octet-stream', () => {
      expect(resolveSupportedMimeType({ type: '', name: 'sample.JPG' })).toBe('image/jpeg');
      expect(resolveSupportedMimeType({ type: '', name: 'sample.jpeg' })).toBe('image/jpeg');
      expect(resolveSupportedMimeType({ type: 'application/octet-stream', name: 'pic.PNG' })).toBe('image/png');
      expect(resolveSupportedMimeType({ type: '', name: 'clip.webp' })).toBe('image/webp');
    });

    it('rejects unsupported MIME types and unsupported or spoofed extensions', () => {
      expect(isSupportedImageFile({ type: 'image/svg+xml', name: 'fake.png' })).toBe(false);
      expect(isSupportedImageFile({ type: 'image/gif', name: 'anim.jpg' })).toBe(false);
      expect(isSupportedImageFile({ type: 'text/plain', name: 'notes.txt' })).toBe(false);
      expect(isSupportedImageFile({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false);
      expect(isSupportedImageFile({ type: '', name: 'archive.svg' })).toBe(false);
      expect(isSupportedImageFile({ type: '', name: 'noextension' })).toBe(false);
    });
  });

  describe('computeScaledDimensions', () => {
    it('preserves dimensions <= maxSide without upscaling', () => {
      expect(computeScaledDimensions(240, 180)).toEqual({ width: 240, height: 180 });
      expect(computeScaledDimensions(320, 320)).toEqual({ width: 320, height: 320 });
    });

    it('scales landscape, portrait, square, and extreme aspect ratios proportionally', () => {
      expect(computeScaledDimensions(1280, 720)).toEqual({ width: 320, height: 180 });
      expect(computeScaledDimensions(400, 800)).toEqual({ width: 160, height: 320 });
      expect(computeScaledDimensions(1000, 1000)).toEqual({ width: 320, height: 320 });
      expect(computeScaledDimensions(10000, 1)).toEqual({ width: 320, height: 1 });
    });

    it('supports custom maxSide constraints', () => {
      expect(computeScaledDimensions(448, 224, 224)).toEqual({ width: 224, height: 112 });
    });

    it('throws EMPTY_SOURCE on invalid dimensions', () => {
      expect(() => computeScaledDimensions(0, 100)).toThrow(ImageProcessingError);
      expect(() => computeScaledDimensions(-10, 100)).toThrow(ImageProcessingError);
      expect(() => computeScaledDimensions(Number.NaN, 100)).toThrow(ImageProcessingError);

      try {
        computeScaledDimensions(0, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(ImageProcessingError);
        expect((err as ImageProcessingError).code).toBe('EMPTY_SOURCE');
      }
    });
  });

  describe('canvas normalization (mocked 2D context)', () => {
    function setupMockCanvas(expectedDataUrl = 'data:image/png;base64,AAAA') {
      const callOrder: string[] = [];
      const fillRectCalls: Array<[number, number, number, number]> = [];
      const drawImageCalls: unknown[][] = [];
      const toDataUrlCalls: Array<[string, number | undefined]> = [];
      let fillStyleDuringFillRect = '';

      const mockCtx = {
        fillStyle: '',
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
          callOrder.push('fillRect');
          fillStyleDuringFillRect = mockCtx.fillStyle;
          fillRectCalls.push([x, y, w, h]);
        }),
        drawImage: vi.fn((...args: unknown[]) => {
          callOrder.push('drawImage');
          drawImageCalls.push(args);
        }),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return {
            tagName: 'CANVAS',
            width: 0,
            height: 0,
            getContext: vi.fn(() => mockCtx),
            toDataURL: vi.fn((mime: string, quality?: number) => {
              toDataUrlCalls.push([mime, quality]);
              return expectedDataUrl;
            }),
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      }) as typeof document.createElement);

      return {
        callOrder,
        fillRectCalls,
        drawImageCalls,
        toDataUrlCalls,
        getFillStyleDuringFillRect: () => fillStyleDuringFillRect,
      };
    }

    it('fills #ffffff background before drawImage and encodes canvas as PNG by default', () => {
      const mock = setupMockCanvas('data:image/png;base64,CANVAS_PNG');
      const sourceCanvas = {
        tagName: 'CANVAS',
        width: 640,
        height: 480,
        toDataURL: () => 'data:image/png;base64,SRC',
      } as unknown as HTMLCanvasElement;

      const result = normalizeCanvasToImage(sourceCanvas);

      expect(result).toEqual({
        dataUrl: 'data:image/png;base64,CANVAS_PNG',
        mimeType: 'image/png',
        width: 320,
        height: 240,
      });
      expect(mock.callOrder).toEqual(['fillRect', 'drawImage']);
      expect(mock.getFillStyleDuringFillRect()).toBe('#ffffff');
      expect(mock.fillRectCalls).toEqual([[0, 0, 320, 240]]);
      expect(mock.toDataUrlCalls).toEqual([['image/png', undefined]]);
    });

    it('encodes video frames as JPEG with 0.85 quality by default', () => {
      const mock = setupMockCanvas('data:image/jpeg;base64,VIDEO_JPG');
      const sourceVideo = {
        videoWidth: 640,
        videoHeight: 360,
      } as unknown as HTMLVideoElement;

      const result = normalizeVideoFrameToImage(sourceVideo);

      expect(result).toEqual({
        dataUrl: 'data:image/jpeg;base64,VIDEO_JPG',
        mimeType: 'image/jpeg',
        width: 320,
        height: 180,
      });
      expect(mock.toDataUrlCalls).toEqual([['image/jpeg', 0.85]]);
    });

    it('throws CANVAS_CONTEXT_UNAVAILABLE when getContext("2d") returns null', () => {
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return {
            tagName: 'CANVAS',
            width: 0,
            height: 0,
            getContext: () => null,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      }) as typeof document.createElement);

      const sourceCanvas = {
        tagName: 'CANVAS',
        width: 100,
        height: 100,
        toDataURL: () => 'data:image/png;base64,SRC',
      } as unknown as HTMLCanvasElement;

      expect(() => normalizeCanvasToImage(sourceCanvas)).toThrowError(ImageProcessingError);
      try {
        normalizeCanvasToImage(sourceCanvas);
      } catch (err) {
        expect((err as ImageProcessingError).code).toBe('CANVAS_CONTEXT_UNAVAILABLE');
      }
    });

    it('validates file type, empty file, and oversized file in normalizeFileToImage', async () => {
      const badType = new File(['abc'], 'bad.svg', { type: 'image/svg+xml' });
      await expect(normalizeFileToImage(badType)).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
      });

      const emptyFile = new File([], 'empty.png', { type: 'image/png' });
      await expect(normalizeFileToImage(emptyFile)).rejects.toMatchObject({
        code: 'EMPTY_SOURCE',
      });

      const smallFileWithTinyCap = new File([new Uint8Array(64)], 'pic.jpg', {
        type: 'image/jpeg',
      });
      await expect(
        normalizeFileToImage(smallFileWithTinyCap, { maxFileSizeBytes: 16 }),
      ).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      });
    });

    it('normalizes a valid File via objectURL and revokes objectURL afterwards', async () => {
      const mock = setupMockCanvas('data:image/jpeg;base64,FILE_JPG');

      const createObjectUrlSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:http://localhost/fake-img');
      const revokeObjectUrlSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);

      class MockImage {
        onload: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        naturalWidth = 800;
        naturalHeight = 400;
        width = 800;
        height = 400;
        decode = vi.fn().mockResolvedValue(undefined);
        set src(_value: string) {
          queueMicrotask(() => {
            this.onload?.();
          });
        }
      }
      vi.stubGlobal('Image', MockImage);

      const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
      const result = await normalizeFileToImage(file);

      expect(result).toEqual({
        dataUrl: 'data:image/jpeg;base64,FILE_JPG',
        mimeType: 'image/jpeg',
        width: 320,
        height: 160,
      });
      expect(mock.toDataUrlCalls).toEqual([['image/jpeg', 0.85]]);
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:http://localhost/fake-img');
      vi.unstubAllGlobals();
    });
  });

  describe('loadImageElement', () => {
    it('rejects immediately on empty src', async () => {
      await expect(loadImageElement('')).rejects.toMatchObject({
        code: 'IMAGE_DECODE_FAILED',
      });
    });

    it('resolves with decode() and also when decode is undefined (jsdom)', async () => {
      class ImageWithDecode {
        onload: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        decode = vi.fn().mockResolvedValue(undefined);
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      vi.stubGlobal('Image', ImageWithDecode);
      const img1 = await loadImageElement('data:image/png;base64,123');
      expect(img1).toBeInstanceOf(ImageWithDecode);

      class ImageWithoutDecode {
        onload: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      vi.stubGlobal('Image', ImageWithoutDecode);
      const img2 = await loadImageElement('data:image/png;base64,456');
      expect(img2).toBeInstanceOf(ImageWithoutDecode);
      vi.unstubAllGlobals();
    });

    it('rejects with IMAGE_DECODE_FAILED on onerror or decode() rejection', async () => {
      class ErrorImage {
        onload: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.(new Event('error')));
        }
      }
      vi.stubGlobal('Image', ErrorImage);
      await expect(loadImageElement('https://example.invalid/bad.png')).rejects.toMatchObject({
        code: 'IMAGE_DECODE_FAILED',
      });

      class DecodeRejectImage {
        onload: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        decode = vi.fn().mockRejectedValue(new Error('Corrupt bitmap'));
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      vi.stubGlobal('Image', DecodeRejectImage);
      await expect(loadImageElement('data:image/png;base64,bad')).rejects.toMatchObject({
        code: 'IMAGE_DECODE_FAILED',
      });
      vi.unstubAllGlobals();
    });
  });
});
