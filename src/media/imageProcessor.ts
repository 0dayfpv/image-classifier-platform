import type { SampleRecord } from '../types/domain';

export type SupportedImageMimeType = SampleRecord['mimeType']; // 'image/jpeg' | 'image/png' | 'image/webp'
export type NormalizedOutputMimeType = 'image/jpeg' | 'image/png';

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

export const DEFAULT_MAX_IMAGE_SIDE = 320;
export const DEFAULT_JPEG_QUALITY = 0.85;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type ImageProcessingErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_SOURCE'
  | 'IMAGE_DECODE_FAILED'
  | 'CANVAS_CONTEXT_UNAVAILABLE'
  | 'CANVAS_ENCODE_FAILED';

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorCode;

  constructor(code: ImageProcessingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

export interface NormalizeImageOptions {
  maxSide?: number;
  mimeType?: NormalizedOutputMimeType;
  quality?: number;
  backgroundColor?: string;
  maxFileSizeBytes?: number;
}

export interface NormalizedImageResult {
  dataUrl: string;
  mimeType: NormalizedOutputMimeType;
  width: number;
  height: number;
}

export type RasterSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

const MIME_ALIASES: Record<string, SupportedImageMimeType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const EXTENSION_TO_MIME: Record<string, SupportedImageMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function resolveSupportedMimeType(
  file: Pick<File, 'type' | 'name'>
): SupportedImageMimeType | null {
  const rawType = (file.type ?? '').trim().toLowerCase();

  if (rawType && rawType !== 'application/octet-stream') {
    return MIME_ALIASES[rawType] ?? null;
  }

  const lowerName = (file.name ?? '').trim().toLowerCase();
  const lastDot = lowerName.lastIndexOf('.');
  if (lastDot < 0) return null;

  const ext = lowerName.slice(lastDot);
  return EXTENSION_TO_MIME[ext] ?? null;
}

export function isSupportedImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  return resolveSupportedMimeType(file) !== null;
}

export function computeScaledDimensions(
  srcWidth: number,
  srcHeight: number,
  maxSide: number = DEFAULT_MAX_IMAGE_SIDE
): { width: number; height: number } {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0
  ) {
    throw new ImageProcessingError(
      'EMPTY_SOURCE',
      `Invalid source dimensions: ${srcWidth}x${srcHeight}.`
    );
  }

  if (!Number.isFinite(maxSide) || maxSide < 1) {
    throw new ImageProcessingError(
      'EMPTY_SOURCE',
      `Invalid maxSide constraint: ${maxSide}.`
    );
  }

  if (srcWidth <= maxSide && srcHeight <= maxSide) {
    return {
      width: Math.max(1, Math.round(srcWidth)),
      height: Math.max(1, Math.round(srcHeight)),
    };
  }

  const scale = maxSide / Math.max(srcWidth, srcHeight);
  return {
    width: Math.min(maxSide, Math.max(1, Math.round(srcWidth * scale))),
    height: Math.min(maxSide, Math.max(1, Math.round(srcHeight * scale))),
  };
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  if (!src || typeof src !== 'string') {
    return Promise.reject(
      new ImageProcessingError('IMAGE_DECODE_FAILED', 'Image source URL is empty.')
    );
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    const fail = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new ImageProcessingError('IMAGE_DECODE_FAILED', 'Failed to decode image.', {
          cause,
        })
      );
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(img);
    };

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(succeed, fail);
      } else {
        succeed();
      }
    };

    img.onerror = (event) => {
      fail(event);
    };

    img.src = src;
  });
}

function isCanvasSource(source: RasterSource): source is HTMLCanvasElement {
  return (
    typeof (source as HTMLCanvasElement).toDataURL === 'function' &&
    'tagName' in source &&
    source.tagName === 'CANVAS'
  );
}

function getSourceDimensions(source: RasterSource): { srcWidth: number; srcHeight: number } {
  if ('videoWidth' in source) {
    return { srcWidth: source.videoWidth, srcHeight: source.videoHeight };
  }
  if ('naturalWidth' in source) {
    return {
      srcWidth: source.naturalWidth || source.width,
      srcHeight: source.naturalHeight || source.height,
    };
  }
  return { srcWidth: source.width, srcHeight: source.height };
}

export function normalizeSourceToDataUrl(
  source: RasterSource,
  options?: NormalizeImageOptions
): NormalizedImageResult {
  const maxSide = options?.maxSide ?? DEFAULT_MAX_IMAGE_SIDE;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;
  const backgroundColor = options?.backgroundColor ?? '#ffffff';
  const outputMime: NormalizedOutputMimeType =
    options?.mimeType ?? (isCanvasSource(source) ? 'image/png' : 'image/jpeg');

  const { srcWidth, srcHeight } = getSourceDimensions(source);
  const { width, height } = computeScaledDimensions(srcWidth, srcHeight, maxSide);

  if (typeof document === 'undefined') {
    throw new ImageProcessingError(
      'CANVAS_CONTEXT_UNAVAILABLE',
      'Document is unavailable for offscreen canvas normalization.'
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageProcessingError(
      'CANVAS_CONTEXT_UNAVAILABLE',
      'Could not acquire 2D canvas rendering context.'
    );
  }

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if ('imageSmoothingEnabled' in ctx) {
    ctx.imageSmoothingEnabled = true;
  }
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high';
  }

  ctx.drawImage(source, 0, 0, width, height);

  let dataUrl: string;
  try {
    dataUrl =
      outputMime === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', quality)
        : canvas.toDataURL('image/png');
  } catch (err) {
    throw new ImageProcessingError('CANVAS_ENCODE_FAILED', 'Failed to encode normalized canvas.', {
      cause: err,
    });
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new ImageProcessingError(
      'CANVAS_ENCODE_FAILED',
      'Canvas returned an invalid image data URL.'
    );
  }

  return { dataUrl, mimeType: outputMime, width, height };
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new ImageProcessingError('IMAGE_DECODE_FAILED', 'FileReader produced non-string output.'));
      }
    };
    reader.onerror = () => {
      reject(
        new ImageProcessingError('IMAGE_DECODE_FAILED', 'Failed to read image file.', {
          cause: reader.error,
        })
      );
    };
    reader.readAsDataURL(blob);
  });
}

export async function normalizeFileToImage(
  file: File,
  options?: NormalizeImageOptions
): Promise<NormalizedImageResult> {
  if (!isSupportedImageFile(file)) {
    throw new ImageProcessingError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported image file type: ${file.type || file.name}`
    );
  }

  if (file.size <= 0) {
    throw new ImageProcessingError('EMPTY_SOURCE', 'Image file is empty.');
  }

  const maxBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  if (file.size > maxBytes) {
    throw new ImageProcessingError(
      'FILE_TOO_LARGE',
      `Image file exceeds maximum allowed size (${maxBytes} bytes).`
    );
  }

  const canUseObjectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

  if (canUseObjectUrl) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(objectUrl);
      return normalizeSourceToDataUrl(img, { mimeType: 'image/jpeg', ...options });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const rawDataUrl = await readBlobAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);
  return normalizeSourceToDataUrl(img, { mimeType: 'image/jpeg', ...options });
}

export function normalizeCanvasToImage(
  canvas: HTMLCanvasElement,
  options?: NormalizeImageOptions
): NormalizedImageResult {
  return normalizeSourceToDataUrl(canvas, { mimeType: 'image/png', ...options });
}

export function normalizeVideoFrameToImage(
  video: HTMLVideoElement,
  options?: NormalizeImageOptions
): NormalizedImageResult {
  return normalizeSourceToDataUrl(video, { mimeType: 'image/jpeg', ...options });
}
