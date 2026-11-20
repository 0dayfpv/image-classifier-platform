import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

export type ShapeKind = 'red-circle' | 'blue-square' | 'green-triangle';

const __filename = fileURLToPath(import.meta.url);
export const FIXTURES_DIR = path.dirname(__filename);

// Precompute IEEE 802.3 CRC32 lookup table for valid PNG chunk encoding
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodeRgbaToPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // filter type 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number
): void {
  const idx = (y * width + x) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = 255;
}

export function renderShapeRgba(
  shape: ShapeKind,
  width: number,
  height: number,
  variantIndex = 0
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255); // solid #FFFFFF background

  const jitterX = ((variantIndex % 3) - 1) * Math.round(width * 0.03);
  const jitterY = ((Math.floor(variantIndex / 3) % 2) * 2 - 1) * Math.round(height * 0.025);
  const scaleFactor = 0.92 + (variantIndex % 4) * 0.05;
  const cx = Math.round(width / 2) + jitterX;
  const cy = Math.round(height / 2) + jitterY;
  const minDim = Math.min(width, height);

  if (shape === 'red-circle') {
    const outerR = minDim * 0.31 * scaleFactor;
    const midR = outerR * 0.62;
    const innerR = outerR * 0.42;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= outerR) {
          if (d <= midR && d >= innerR) {
            setPixel(rgba, width, x, y, 153, 27, 27); // #991B1B accent ring
          } else {
            setPixel(rgba, width, x, y, 220, 38, 38); // #DC2626 crimson
          }
        }
      }
    }
  } else if (shape === 'blue-square') {
    const half = Math.round(minDim * 0.29 * scaleFactor);
    const stripeHalf = Math.max(6, Math.round(half * 0.22));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        if (dx <= half && dy <= half) {
          if (dy <= stripeHalf && dx <= half * 0.72) {
            setPixel(rgba, width, x, y, 255, 255, 255); // white horizontal bar
          } else if (dy >= half * 0.75) {
            setPixel(rgba, width, x, y, 30, 58, 138); // #1E3A8A border band
          } else {
            setPixel(rgba, width, x, y, 37, 99, 235); // #2563EB royal blue
          }
        }
      }
    }
  } else {
    // green-triangle (upright equilateral)
    const triH = minDim * 0.64 * scaleFactor;
    const topY = cy - triH * 0.55;
    const botY = cy + triH * 0.45;
    const halfBase = triH * 0.58;
    for (let y = 0; y < height; y += 1) {
      if (y < topY || y > botY) continue;
      const t = (y - topY) / (botY - topY);
      const span = halfBase * t;
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - cx);
        if (dx <= span) {
          const inCore = t > 0.45 && t < 0.72 && dx < halfBase * 0.16;
          if (inCore) {
            setPixel(rgba, width, x, y, 254, 240, 138); // #FEF08A inner contrast
          } else {
            setPixel(rgba, width, x, y, 22, 163, 74); // #16A34A emerald
          }
        }
      }
    }
  }
  return rgba;
}

export async function generateEncodedImageViaChromium(
  outputs: Array<{
    filePath: string;
    shape: ShapeKind;
    mimeType: 'image/jpeg' | 'image/webp';
    variantIndex: number;
  }>
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const item of outputs) {
      const rgba = renderShapeRgba(item.shape, 224, 224, item.variantIndex);
      const dataUrl = await page.evaluate(
        ({ bytes, mimeType }) => {
          const canvas = document.createElement('canvas');
          canvas.width = 224;
          canvas.height = 224;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Could not create 2D context in Chromium');
          }
          const imgData = new ImageData(new Uint8ClampedArray(bytes), 224, 224);
          ctx.putImageData(imgData, 0, 0);
          return canvas.toDataURL(mimeType, 0.92);
        },
        { bytes: Array.from(rgba), mimeType: item.mimeType }
      );
      const base64 = dataUrl.split(',')[1] ?? '';
      writeFileSync(item.filePath, Buffer.from(base64, 'base64'));
    }
  } finally {
    await browser.close();
  }
}

export async function ensureAllFixturesExist(force = false): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const shapes: ShapeKind[] = ['red-circle', 'blue-square', 'green-triangle'];

  for (const shape of shapes) {
    for (let i = 1; i <= 6; i += 1) {
      const target = path.join(FIXTURES_DIR, `${shape}-${i}.png`);
      if (force || !existsSync(target) || statSync(target).size === 0) {
        const rgba = renderShapeRgba(shape, 224, 224, i - 1);
        writeFileSync(target, encodeRgbaToPng(224, 224, rgba));
      }
    }
    const testPng = path.join(FIXTURES_DIR, `${shape}-test.png`);
    if (force || !existsSync(testPng) || statSync(testPng).size === 0) {
      const rgba = renderShapeRgba(shape, 224, 224, 7);
      writeFileSync(testPng, encodeRgbaToPng(224, 224, rgba));
    }
  }

  const oversized = path.join(FIXTURES_DIR, 'oversized-circle.png');
  if (force || !existsSync(oversized) || statSync(oversized).size === 0) {
    writeFileSync(
      oversized,
      encodeRgbaToPng(640, 480, renderShapeRgba('red-circle', 640, 480, 0))
    );
  }

  const invalidTxt = path.join(FIXTURES_DIR, 'invalid-sample.txt');
  if (force || !existsSync(invalidTxt)) {
    writeFileSync(invalidTxt, 'Not a valid image file for E2E negative upload test.\n', 'utf8');
  }

  const invalidSvg = path.join(FIXTURES_DIR, 'invalid-icon.svg');
  if (force || !existsSync(invalidSvg)) {
    writeFileSync(
      invalidSvg,
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="20"/></svg>\n',
      'utf8'
    );
  }

  const corruptPng = path.join(FIXTURES_DIR, 'corrupted-image.png');
  if (force || !existsSync(corruptPng)) {
    writeFileSync(corruptPng, Buffer.from('corrupt-non-png-bytes-payload', 'utf8'));
  }

  const binaryTargets = [
    {
      filePath: path.join(FIXTURES_DIR, 'red-circle.jpg'),
      shape: 'red-circle' as const,
      mimeType: 'image/jpeg' as const,
      variantIndex: 6,
    },
    {
      filePath: path.join(FIXTURES_DIR, 'blue-square.webp'),
      shape: 'blue-square' as const,
      mimeType: 'image/webp' as const,
      variantIndex: 6,
    },
    {
      filePath: path.join(FIXTURES_DIR, 'green-triangle.jpg'),
      shape: 'green-triangle' as const,
      mimeType: 'image/jpeg' as const,
      variantIndex: 6,
    },
  ];

  const missingBinary = binaryTargets.filter(
    (item) => force || !existsSync(item.filePath) || statSync(item.filePath).size === 0
  );
  if (missingBinary.length > 0) {
    await generateEncodedImageViaChromium(missingBinary);
  }
}

export async function verifyImageFixturesInChromium(): Promise<
  Array<{ fileName: string; width: number; height: number; byteSize: number }>
> {
  const expectedImages: Array<{
    fileName: string;
    mimeType: string;
    expectedWidth: number;
    expectedHeight: number;
  }> = [];

  const shapes: ShapeKind[] = ['red-circle', 'blue-square', 'green-triangle'];
  for (const shape of shapes) {
    for (let i = 1; i <= 6; i += 1) {
      expectedImages.push({
        fileName: `${shape}-${i}.png`,
        mimeType: 'image/png',
        expectedWidth: 224,
        expectedHeight: 224,
      });
    }
    expectedImages.push({
      fileName: `${shape}-test.png`,
      mimeType: 'image/png',
      expectedWidth: 224,
      expectedHeight: 224,
    });
  }
  expectedImages.push(
    {
      fileName: 'red-circle.jpg',
      mimeType: 'image/jpeg',
      expectedWidth: 224,
      expectedHeight: 224,
    },
    {
      fileName: 'blue-square.webp',
      mimeType: 'image/webp',
      expectedWidth: 224,
      expectedHeight: 224,
    },
    {
      fileName: 'green-triangle.jpg',
      mimeType: 'image/jpeg',
      expectedWidth: 224,
      expectedHeight: 224,
    },
    {
      fileName: 'oversized-circle.png',
      mimeType: 'image/png',
      expectedWidth: 640,
      expectedHeight: 480,
    }
  );

  const browser = await chromium.launch({ headless: true });
  const results: Array<{ fileName: string; width: number; height: number; byteSize: number }> = [];
  try {
    const page = await browser.newPage();
    for (const item of expectedImages) {
      const fullPath = path.join(FIXTURES_DIR, item.fileName);
      const buf = readFileSync(fullPath);
      const dataUrl = `data:${item.mimeType};base64,${buf.toString('base64')}`;
      const dims = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      }, dataUrl);

      if (dims.width !== item.expectedWidth || dims.height !== item.expectedHeight) {
        throw new Error(
          `Fixture ${item.fileName} decoded as ${dims.width}x${dims.height}, expected ${item.expectedWidth}x${item.expectedHeight}`
        );
      }
      results.push({
        fileName: item.fileName,
        width: dims.width,
        height: dims.height,
        byteSize: buf.byteLength,
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const force = process.argv.includes('--force');
  await ensureAllFixturesExist(force);
  const verified = await verifyImageFixturesInChromium();
  console.log(`Generated & Chromium-verified ${verified.length} image fixtures in ${FIXTURES_DIR}.`);
}
