import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import {
  getActiveBackend,
  initTfBackend,
  isWebGLAvailable,
  resetBackendForTests,
} from '../../src/ml/backend';
import {
  MOBILENET_RELATIVE_MODEL_PATH,
  MobileNetLoadError,
  REMOTE_MOBILENET_MODEL_URL,
  getLocalMobileNetUrl,
  isValidMobileNetModelJson,
  loadMobileNetExtractor,
  resetMobileNetLoaderForTests,
  resolveMobileNetModelUrl,
} from '../../src/ml/mobilenetLoader';
import { FeatureCache, buildFeatureCacheKey } from '../../src/ml/featureCache';

vi.mock('@tensorflow/tfjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tensorflow/tfjs')>();
  return {
    ...actual,
    setBackend: vi.fn(actual.setBackend),
    ready: vi.fn(actual.ready),
    getBackend: vi.fn(actual.getBackend),
  };
});

vi.mock('@tensorflow-models/mobilenet', () => ({
  load: vi.fn(),
}));

const VALID_SAVED_MODEL_JSON = {
  modelTopology: {
    node: [{ name: 'Placeholder', op: 'Placeholder' }],
  },
  weightsManifest: [
    {
      paths: ['group1-shard1of4'],
      weights: [],
    },
  ],
};

function createMockCanvasWithContext(
  getContextImpl: (
    contextId: string,
    options?: WebGLContextAttributes
  ) => unknown
): HTMLCanvasElement {
  return {
    getContext: vi.fn(getContextImpl),
  } as unknown as HTMLCanvasElement;
}

describe('backend, mobilenetLoader & featureCache', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const actualTf = await vi.importActual<typeof import('@tensorflow/tfjs')>('@tensorflow/tfjs');
    vi.mocked(tf.setBackend).mockImplementation(actualTf.setBackend);
    vi.mocked(tf.ready).mockImplementation(actualTf.ready);
    vi.mocked(tf.getBackend).mockImplementation(actualTf.getBackend);
    resetBackendForTests();
    resetMobileNetLoaderForTests();
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    resetBackendForTests();
    resetMobileNetLoaderForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('backend.ts (WebGL probe & CPU fallback)', () => {
    it('selects webgl when webgl2 context and MAX_TEXTURE_SIZE > 0 are available, releasing probe context', async () => {
      const loseContext = vi.fn();
      const mockGl = {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter: vi.fn((param: number) => (param === 0x0d33 ? 4096 : null)),
        getExtension: vi.fn((name: string) =>
          name === 'WEBGL_lose_context' ? { loseContext } : null
        ),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return createMockCanvasWithContext((id) =>
            id === 'webgl2' ? mockGl : null
          );
        }
        return originalCreateElement(tagName);
      });

      let backendState = 'cpu';
      vi.mocked(tf.setBackend).mockImplementation(async (name: string) => {
        backendState = name;
        return true;
      });
      vi.mocked(tf.ready).mockResolvedValue();
      vi.mocked(tf.getBackend).mockImplementation(() => backendState);

      const backend = await initTfBackend();

      expect(backend).toBe('webgl');
      expect(getActiveBackend()).toBe('webgl');
      expect(tf.setBackend).toHaveBeenCalledWith('webgl');
      expect(loseContext).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('falls back to webgl1 when webgl2 returns null', async () => {
      const loseContext = vi.fn();
      const mockGl = {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter: vi.fn(() => 2048),
        getExtension: vi.fn(() => ({ loseContext })),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return createMockCanvasWithContext((id) =>
            id === 'webgl' ? mockGl : null
          );
        }
        return originalCreateElement(tagName);
      });

      let backendState = 'cpu';
      vi.mocked(tf.setBackend).mockImplementation(async (name: string) => {
        backendState = name;
        return true;
      });
      vi.mocked(tf.ready).mockResolvedValue();
      vi.mocked(tf.getBackend).mockImplementation(() => backendState);

      const backend = await initTfBackend();

      expect(backend).toBe('webgl');
      expect(getActiveBackend()).toBe('webgl');
      expect(loseContext).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('falls back to cpu without attempting webgl when MAX_TEXTURE_SIZE <= 0 or null', async () => {
      const mockGl = {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter: vi.fn(() => 0),
        getExtension: vi.fn(() => null),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return createMockCanvasWithContext(() => mockGl);
        }
        return originalCreateElement(tagName);
      });

      const backend = await initTfBackend();

      expect(backend).toBe('cpu');
      expect(getActiveBackend()).toBe('cpu');
      expect(tf.setBackend).not.toHaveBeenCalledWith('webgl');
      expect(tf.setBackend).toHaveBeenCalledWith('cpu');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('falls back to cpu when canvas.getContext returns null or throws', async () => {
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return createMockCanvasWithContext(() => {
            throw new Error('Context creation failed');
          });
        }
        return originalCreateElement(tagName);
      });

      expect(isWebGLAvailable()).toBe(false);
      const backend = await initTfBackend();
      expect(backend).toBe('cpu');
      expect(tf.setBackend).not.toHaveBeenCalledWith('webgl');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('quietly detects unmocked jsdom canvas and falls back to cpu with zero console.error', async () => {
      expect(isWebGLAvailable()).toBe(false);
      const backend = await initTfBackend();

      expect(backend).toBe('cpu');
      expect(getActiveBackend()).toBe('cpu');
      expect(tf.setBackend).toHaveBeenCalledWith('cpu');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('falls back to cpu when tf.setBackend("webgl") returns false or rejects', async () => {
      const mockGl = {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter: vi.fn(() => 4096),
        getExtension: vi.fn(() => null),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return createMockCanvasWithContext(() => mockGl);
        }
        return originalCreateElement(tagName);
      });

      let backendState = 'cpu';
      vi.mocked(tf.setBackend).mockImplementation(async (name: string) => {
        if (name === 'webgl') {
          return false;
        }
        backendState = name;
        return true;
      });
      vi.mocked(tf.ready).mockResolvedValue();
      vi.mocked(tf.getBackend).mockImplementation(() => backendState);

      expect(await initTfBackend()).toBe('cpu');

      resetBackendForTests();
      vi.mocked(tf.setBackend).mockImplementation(async (name: string) => {
        if (name === 'webgl') {
          throw new Error('WebGL shader compile failed');
        }
        backendState = name;
        return true;
      });

      expect(await initTfBackend()).toBe('cpu');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('shares a singleton promise for concurrent initTfBackend calls and supports resetBackendForTests', async () => {
      const p1 = initTfBackend();
      const p2 = initTfBackend();
      expect(p1).toBe(p2);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('cpu');
      expect(r2).toBe('cpu');
      expect(tf.setBackend).toHaveBeenCalledTimes(1);

      resetBackendForTests();
      expect(getActiveBackend()).toBeNull();

      await initTfBackend();
      expect(tf.setBackend).toHaveBeenCalledTimes(2);
    });
  });

  describe('mobilenetLoader.ts (SavedModel validation, local-first & GCS fallback)', () => {
    it('validates classic SavedModel JSON without a "format" field and rejects malformed structures', () => {
      expect(isValidMobileNetModelJson(VALID_SAVED_MODEL_JSON)).toBe(true);
      expect(isValidMobileNetModelJson(null)).toBe(false);
      expect(isValidMobileNetModelJson({})).toBe(false);
      expect(isValidMobileNetModelJson({ modelTopology: {} })).toBe(false);
      expect(isValidMobileNetModelJson({ modelTopology: { node: [] } })).toBe(false);
      expect(
        isValidMobileNetModelJson({
          modelTopology: { node: [{}] },
          weightsManifest: [],
        })
      ).toBe(false);
    });

    it('loads local MobileNetV2 with inputRange: [0, 1] when local fetch returns valid SavedModel JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => VALID_SAVED_MODEL_JSON,
      });
      vi.stubGlobal('fetch', fetchMock);

      const inferMock = vi.fn(() => tf.zeros([1, 1280]) as tf.Tensor2D);
      vi.mocked(mobilenet.load).mockResolvedValue({
        infer: inferMock,
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      const extractor = await loadMobileNetExtractor();

      expect(getLocalMobileNetUrl()).toContain(MOBILENET_RELATIVE_MODEL_PATH);
      expect(fetchMock).toHaveBeenCalledWith(getLocalMobileNetUrl(), {
        method: 'GET',
      });
      expect(mobilenet.load).toHaveBeenCalledWith({
        version: 2,
        alpha: 1.0,
        modelUrl: getLocalMobileNetUrl(),
        inputRange: [0, 1],
      });
      expect(extractor.embeddingDim).toBe(1280);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('falls back to GCS URL with inputRange: [0, 1] on 404, network error, or non-model JSON', async () => {
      // Case 1: 404
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404 })
      );
      expect(await resolveMobileNetModelUrl()).toBe(REMOTE_MOBILENET_MODEL_URL);

      // Case 2: network rejection
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network down'))
      );
      expect(await resolveMobileNetModelUrl()).toBe(REMOTE_MOBILENET_MODEL_URL);

      // Case 3: SPA HTML fallback / unexpected JSON
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ unexpected: true }),
        })
      );
      expect(await resolveMobileNetModelUrl()).toBe(REMOTE_MOBILENET_MODEL_URL);

      // Verify mobilenet.load uses GCS URL + inputRange: [0, 1]
      vi.mocked(mobilenet.load).mockResolvedValue({
        infer: vi.fn(() => tf.zeros([1, 1280])),
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      await loadMobileNetExtractor();
      expect(mobilenet.load).toHaveBeenCalledWith({
        version: 2,
        alpha: 1.0,
        modelUrl: REMOTE_MOBILENET_MODEL_URL,
        inputRange: [0, 1],
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('probes embeddingDim inside tf.tidy() with zero leaked tensors and cleans up extractEmbedding outputs', async () => {
      await initTfBackend();
      const baselineTensors = tf.memory().numTensors;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => VALID_SAVED_MODEL_JSON,
        })
      );

      vi.mocked(mobilenet.load).mockResolvedValue({
        infer: vi.fn((input: tf.Tensor | HTMLCanvasElement) => {
          return tf.tidy(() => {
            if (input instanceof tf.Tensor) {
              expect(input.shape).toEqual([224, 224, 3]);
            }
            return tf.ones([1, 1280]);
          });
        }),
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      const extractor = await loadMobileNetExtractor();
      expect(extractor.embeddingDim).toBe(1280);
      expect(tf.memory().numTensors).toBe(baselineTensors);

      const canvas = document.createElement('canvas');
      const embedding = extractor.extractEmbedding(canvas);
      expect(embedding.shape).toEqual([1, 1280]);
      expect(tf.memory().numTensors).toBe(baselineTensors + 1);

      embedding.dispose();
      expect(tf.memory().numTensors).toBe(baselineTensors);
    });

    it('deduplicates concurrent loadMobileNetExtractor calls and clears failed singleton promise for retry', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => VALID_SAVED_MODEL_JSON,
        })
      );

      let resolveLoad!: (m: mobilenet.MobileNet) => void;
      vi.mocked(mobilenet.load).mockImplementationOnce(
        () =>
          new Promise<mobilenet.MobileNet>((resolve) => {
            resolveLoad = resolve;
          })
      );

      const p1 = loadMobileNetExtractor();
      const p2 = loadMobileNetExtractor();
      expect(p1).toBe(p2);

      // Flush initTfBackend & resolveMobileNetModelUrl microtasks before resolving mobilenet.load
      await vi.waitFor(() => {
        expect(mobilenet.load).toHaveBeenCalledTimes(1);
      });

      resolveLoad({
        infer: vi.fn(() => tf.zeros([1, 1280])),
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      const [e1, e2] = await Promise.all([p1, p2]);
      expect(e1).toBe(e2);

      // Now test error -> retry
      resetMobileNetLoaderForTests();
      vi.mocked(mobilenet.load).mockRejectedValueOnce(new Error('Transient failure'));

      await expect(loadMobileNetExtractor()).rejects.toMatchObject({
        name: 'MobileNetLoadError',
        code: 'MODEL_LOAD_FAILED',
      });

      vi.mocked(mobilenet.load).mockResolvedValueOnce({
        infer: vi.fn(() => tf.zeros([1, 1280])),
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      const retried = await loadMobileNetExtractor();
      expect(retried.embeddingDim).toBe(1280);
      expect(mobilenet.load).toHaveBeenCalledTimes(3);
    });

    it('throws MobileNetLoadError(INVALID_EMBEDDING_SHAPE) if probed embedding is invalid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => VALID_SAVED_MODEL_JSON,
        })
      );

      vi.mocked(mobilenet.load).mockResolvedValueOnce({
        infer: vi.fn(() => tf.zeros([1280])),
        classify: vi.fn(),
      } as unknown as mobilenet.MobileNet);

      await expect(loadMobileNetExtractor()).rejects.toThrow(MobileNetLoadError);
    });
  });

  describe('featureCache.ts', () => {
    it('supports get, set, has, overwrite, delete, clear, and buildFeatureCacheKey', () => {
      const cache = new FeatureCache();
      expect(cache.size).toBe(0);
      expect(cache.has('missing')).toBe(false);
      expect(cache.get('missing')).toBeUndefined();

      const key1 = buildFeatureCacheKey({ id: 'sample-1', createdAt: 1000 });
      const key2 = buildFeatureCacheKey({ id: 'sample-1', createdAt: 2000 });
      expect(key1).toBe('sample-1:1000');
      expect(key2).toBe('sample-1:2000');
      expect(key1).not.toBe(key2);

      const vecA = new Float32Array([1, 2, 3]);
      const vecB = new Float32Array([4, 5, 6]);

      cache.set(key1, vecA);
      expect(cache.size).toBe(1);
      expect(cache.has(key1)).toBe(true);
      expect(cache.get(key1)).toBe(vecA);

      // Overwrite
      cache.set(key1, vecB);
      expect(cache.size).toBe(1);
      expect(cache.get(key1)).toBe(vecB);

      // Delete
      expect(cache.delete('non-existent')).toBe(false);
      expect(cache.delete(key1)).toBe(true);
      expect(cache.size).toBe(0);
      expect(cache.has(key1)).toBe(false);

      // Clear
      cache.set(key1, vecA);
      cache.set(key2, vecB);
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
