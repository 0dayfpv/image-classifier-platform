import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const FIXTURES_DIR = path.dirname(__filename);

export function fixturePath(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

export const RED_CIRCLE_TRAIN_PNGS = [1, 2, 3, 4, 5, 6].map((i) =>
  fixturePath(`red-circle-${i}.png`)
);
export const BLUE_SQUARE_TRAIN_PNGS = [1, 2, 3, 4, 5, 6].map((i) =>
  fixturePath(`blue-square-${i}.png`)
);
export const GREEN_TRIANGLE_TRAIN_PNGS = [1, 2, 3, 4, 5, 6].map((i) =>
  fixturePath(`green-triangle-${i}.png`)
);

export const RED_CIRCLE_TEST_PNG = fixturePath('red-circle-test.png');
export const BLUE_SQUARE_TEST_PNG = fixturePath('blue-square-test.png');
export const GREEN_TRIANGLE_TEST_PNG = fixturePath('green-triangle-test.png');

export const RED_CIRCLE_JPG = fixturePath('red-circle.jpg');
export const BLUE_SQUARE_WEBP = fixturePath('blue-square.webp');
export const GREEN_TRIANGLE_JPG = fixturePath('green-triangle.jpg');

export const OVERSIZED_CIRCLE_PNG = fixturePath('oversized-circle.png');

export const INVALID_TXT = fixturePath('invalid-sample.txt');
export const INVALID_SVG = fixturePath('invalid-icon.svg');
export const CORRUPTED_PNG = fixturePath('corrupted-image.png');
