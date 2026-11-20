import * as tf from '@tensorflow/tfjs';
import type { BackendName } from '../types/ml';

let initPromise: Promise<BackendName> | null = null;
let activeBackend: BackendName | null = null;

function isUnmockedJsdomCanvas(canvas: HTMLCanvasElement): boolean {
  if (typeof navigator === 'undefined' || !/\bjsdom\b/i.test(navigator.userAgent)) {
    return false;
  }
  if (typeof canvas.getContext !== 'function') {
    return false;
  }
  try {
    return Function.prototype.toString.call(canvas.getContext).includes('$requireImpl');
  } catch {
    return false;
  }
}

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    if (isUnmockedJsdomCanvas(canvas)) {
      return false;
    }

    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false };
    const gl =
      (canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null);

    if (!gl || typeof gl.getParameter !== 'function') {
      return false;
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    try {
      if (typeof gl.getExtension === 'function') {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      // Ignore cleanup errors on temporary probe context
    }

    return (
      typeof maxTextureSize === 'number' &&
      Number.isFinite(maxTextureSize) &&
      maxTextureSize > 0
    );
  } catch {
    return false;
  }
}

async function resolveBackend(): Promise<BackendName> {
  if (isWebGLAvailable()) {
    try {
      const switched = await tf.setBackend('webgl');
      if (switched) {
        await tf.ready();
        if (tf.getBackend() === 'webgl') {
          activeBackend = 'webgl';
          return 'webgl';
        }
      }
    } catch {
      // Quietly fall back to CPU backend
    }
  }

  try {
    const cpuSwitched = await tf.setBackend('cpu');
    await tf.ready();
    if (!cpuSwitched && tf.getBackend() !== 'cpu') {
      throw new Error('Failed to initialize TensorFlow.js CPU backend.');
    }
    activeBackend = 'cpu';
    return 'cpu';
  } catch (error) {
    initPromise = null;
    activeBackend = null;
    throw error;
  }
}

export function initTfBackend(): Promise<BackendName> {
  if (initPromise) {
    return initPromise;
  }
  initPromise = resolveBackend();
  return initPromise;
}

export function getActiveBackend(): BackendName | null {
  return activeBackend;
}

export function resetBackendForTests(): void {
  initPromise = null;
  activeBackend = null;
}
