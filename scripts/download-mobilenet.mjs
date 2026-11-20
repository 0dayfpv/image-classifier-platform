import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const BASE_URL =
  'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224';
const TARGET_DIR = path.join(
  PROJECT_ROOT,
  'public',
  'models',
  'mobilenet_v2_1.0_224',
);

const EMBEDDING_NODE_NAME = 'module_apply_default/MobilenetV2/Logits/AvgPool';

const EXPECTED_FILES = [
  { name: 'model.json', expectedBytes: 112_708 },
  { name: 'group1-shard1of4', expectedBytes: 4_194_304 },
  { name: 'group1-shard2of4', expectedBytes: 4_194_304 },
  { name: 'group1-shard3of4', expectedBytes: 4_194_304 },
  { name: 'group1-shard4of4', expectedBytes: 1_402_028 },
];

async function getFileSize(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : -1;
  } catch {
    return -1;
  }
}

async function verifyModelJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  const nodes = parsed?.modelTopology?.node;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Invalid model.json: missing modelTopology.node array');
  }

  const hasAvgPool = nodes.some((node) => node?.name === EMBEDDING_NODE_NAME);
  if (!hasAvgPool) {
    throw new Error(
      `Invalid model.json: missing embedding node "${EMBEDDING_NODE_NAME}"`,
    );
  }

  const manifestPaths = parsed?.weightsManifest?.[0]?.paths;
  if (!Array.isArray(manifestPaths)) {
    throw new Error('Invalid model.json: missing weightsManifest[0].paths');
  }

  const expectedShards = EXPECTED_FILES.slice(1).map((f) => f.name);
  for (const shard of expectedShards) {
    if (!manifestPaths.includes(shard)) {
      throw new Error(`Invalid model.json: weightsManifest missing ${shard}`);
    }
  }

  return nodes.length;
}

async function isFileValid(entry) {
  const filePath = path.join(TARGET_DIR, entry.name);
  const size = await getFileSize(filePath);
  if (size !== entry.expectedBytes) {
    return false;
  }
  if (entry.name === 'model.json') {
    try {
      await verifyModelJson(filePath);
    } catch {
      return false;
    }
  }
  return true;
}

async function downloadFile(entry, maxAttempts = 3) {
  const url = `${BASE_URL}/${entry.name}`;
  const destPath = path.join(TARGET_DIR, entry.name);
  const tmpPath = `${destPath}.tmp`;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength !== entry.expectedBytes) {
        throw new Error(
          `Size mismatch for ${entry.name}: expected ${entry.expectedBytes} bytes, got ${buffer.byteLength} bytes`,
        );
      }

      await writeFile(tmpPath, buffer);
      await rename(tmpPath, destPath);
      return;
    } catch (error) {
      lastError = error;
      await rm(tmpPath, { force: true }).catch(() => {});
      if (attempt < maxAttempts) {
        const delayMs = attempt * 1_000;
        console.warn(
          `[retry ${attempt}/${maxAttempts - 1}] ${entry.name}: ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');
  await mkdir(TARGET_DIR, { recursive: true });

  for (const entry of EXPECTED_FILES) {
    const valid = await isFileValid(entry);
    if (valid) {
      console.log(`[ok] ${entry.name} (${entry.expectedBytes} bytes)`);
      continue;
    }

    if (verifyOnly) {
      throw new Error(`Missing or invalid model artifact: ${entry.name}`);
    }

    console.log(`[download] ${entry.name} -> ${TARGET_DIR}`);
    await downloadFile(entry);
  }

  // Final strict verification across all files + AvgPool node
  let totalBytes = 0;
  for (const entry of EXPECTED_FILES) {
    const filePath = path.join(TARGET_DIR, entry.name);
    const size = await getFileSize(filePath);
    if (size !== entry.expectedBytes) {
      throw new Error(
        `Verification failed for ${entry.name}: expected ${entry.expectedBytes} bytes, got ${size}`,
      );
    }
    totalBytes += size;
  }

  const nodeCount = await verifyModelJson(path.join(TARGET_DIR, 'model.json'));
  console.log(
    `[verified] MobileNetV2 1.0_224 ready: ${totalBytes} bytes, ${nodeCount} nodes, AvgPool node present.`,
  );
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exit(1);
});
