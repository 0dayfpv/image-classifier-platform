import type { SynthSoundId } from '../types/domain';

type AudioContextConstructor = new () => AudioContext;

interface AudioGlobal {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

interface ToneSpec {
  frequency: number;
  endFrequency?: number;
  durationSec: number;
  delaySec?: number;
  type?: OscillatorType;
  peakGain?: number;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContextConstructor(): AudioContextConstructor | null {
  const g = globalThis as unknown as AudioGlobal;
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function isAudioSupported(): boolean {
  return getAudioContextConstructor() !== null;
}

export function getAudioContextState(): AudioContextState | 'uninitialized' | 'unsupported' {
  if (!isAudioSupported()) return 'unsupported';
  if (!sharedAudioContext) return 'uninitialized';
  return sharedAudioContext.state;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }

  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;

  try {
    sharedAudioContext = new Ctor();
    return sharedAudioContext;
  } catch {
    sharedAudioContext = null;
    return null;
  }
}

function scheduleTone(ctx: AudioContext, spec: ToneSpec): void {
  const startTime = (ctx.currentTime ?? 0) + (spec.delaySec ?? 0);
  const duration = Math.max(0.02, spec.durationSec);
  const peakGain = spec.peakGain ?? 0.16;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = spec.type ?? 'sine';
  osc.frequency.setValueAtTime(spec.frequency, startTime);
  if (spec.endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, spec.endFrequency),
      startTime + duration
    );
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    startTime + Math.min(0.015, duration * 0.25)
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore disconnection errors after node disposal
    }
  };

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

const SOUND_RECIPES: Record<Exclude<SynthSoundId, 'none'>, readonly ToneSpec[]> = {
  chime: [
    { frequency: 523.25, durationSec: 0.18, delaySec: 0, type: 'sine', peakGain: 0.16 },
    { frequency: 659.25, durationSec: 0.26, delaySec: 0.09, type: 'sine', peakGain: 0.16 },
  ],
  beep: [
    { frequency: 880, durationSec: 0.12, delaySec: 0, type: 'sine', peakGain: 0.14 },
  ],
  success: [
    { frequency: 523.25, durationSec: 0.12, delaySec: 0, type: 'triangle', peakGain: 0.14 },
    { frequency: 659.25, durationSec: 0.12, delaySec: 0.08, type: 'triangle', peakGain: 0.14 },
    { frequency: 783.99, durationSec: 0.24, delaySec: 0.16, type: 'triangle', peakGain: 0.16 },
  ],
  alert: [
    {
      frequency: 660,
      endFrequency: 440,
      durationSec: 0.16,
      delaySec: 0,
      type: 'triangle',
      peakGain: 0.16,
    },
    {
      frequency: 660,
      endFrequency: 440,
      durationSec: 0.16,
      delaySec: 0.18,
      type: 'triangle',
      peakGain: 0.16,
    },
  ],
  pop: [
    {
      frequency: 280,
      endFrequency: 680,
      durationSec: 0.09,
      delaySec: 0,
      type: 'sine',
      peakGain: 0.18,
    },
  ],
};

export function playSound(id: SynthSoundId): boolean {
  if (id === 'none') return false;

  const recipe = SOUND_RECIPES[id];
  if (!recipe) return false;

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void Promise.resolve(ctx.resume()).catch(() => undefined);
    }

    for (const tone of recipe) {
      scheduleTone(ctx, tone);
    }
    return true;
  } catch {
    return false;
  }
}

export async function disposeAudioContext(): Promise<void> {
  const ctx = sharedAudioContext;
  sharedAudioContext = null;
  if (!ctx) return;

  try {
    if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
      await ctx.close();
    }
  } catch {
    // Ignore errors when closing unavailable/suspended contexts
  }
}
