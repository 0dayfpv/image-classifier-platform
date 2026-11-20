import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isAudioSupported,
  getAudioContextState,
  playSound,
  disposeAudioContext,
} from '../../src/media/soundSynth';

interface MockAudioNodeTracker {
  ramps: number[];
  oscillatorsCreated: number;
  resumeCalls: number;
  closeCalls: number;
  state: AudioContextState;
}

describe('soundSynth', () => {
  afterEach(async () => {
    await disposeAudioContext();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false immediately for "none" without constructing AudioContext', () => {
    const ctorSpy = vi.fn();
    vi.stubGlobal('AudioContext', ctorSpy);

    expect(playSound('none')).toBe(false);
    expect(ctorSpy).not.toHaveBeenCalled();
  });

  it('handles missing AudioContext in jsdom cleanly with zero console.error calls', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);

    expect(isAudioSupported()).toBe(false);
    expect(getAudioContextState()).toBe('unsupported');
    expect(playSound('chime')).toBe(false);
    await expect(disposeAudioContext()).resolves.toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('handles hostile AudioContext errors (throwing ctor, rejected resume, throwing createOscillator) silently', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    class ThrowingAudioContext {
      constructor() {
        throw new Error('Audio blocked');
      }
    }
    vi.stubGlobal('AudioContext', ThrowingAudioContext);
    expect(playSound('beep')).toBe(false);

    class RejectingResumeAndBrokenOscContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn().mockRejectedValue(new Error('Autoplay denied'));
      createOscillator = vi.fn(() => {
        throw new Error('Node failure');
      });
      close = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', RejectingResumeAndBrokenOscContext);
    expect(playSound('alert')).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('manages lazy singleton AudioContext lifecycle, resumes suspended state, and uses strictly > 0 exponential ramps', async () => {
    const tracker: MockAudioNodeTracker = {
      ramps: [],
      oscillatorsCreated: 0,
      resumeCalls: 0,
      closeCalls: 0,
      state: 'suspended',
    };
    let ctorCount = 0;

    class MockAudioContext {
      state: AudioContextState = tracker.state;
      currentTime = 0;
      destination = {};

      constructor() {
        ctorCount += 1;
      }

      resume = vi.fn(() => {
        tracker.resumeCalls += 1;
        this.state = 'running';
        return Promise.resolve();
      });

      createOscillator = vi.fn(() => {
        tracker.oscillatorsCreated += 1;
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn((val: number) => {
              tracker.ramps.push(val);
            }),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
      });

      createGain = vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn((val: number) => {
            tracker.ramps.push(val);
          }),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));

      close = vi.fn(() => {
        tracker.closeCalls += 1;
        this.state = 'closed';
        return Promise.resolve();
      });
    }

    vi.stubGlobal('AudioContext', MockAudioContext);
    expect(isAudioSupported()).toBe(true);
    expect(getAudioContextState()).toBe('uninitialized');

    expect(playSound('chime')).toBe(true);
    expect(playSound('beep')).toBe(true);
    expect(playSound('success')).toBe(true);
    expect(playSound('alert')).toBe(true);
    expect(playSound('pop')).toBe(true);

    expect(ctorCount).toBe(1);
    expect(tracker.resumeCalls).toBe(1);
    expect(tracker.oscillatorsCreated).toBe(2 + 1 + 3 + 2 + 1);
    expect(tracker.ramps.length).toBeGreaterThan(0);
    for (const targetValue of tracker.ramps) {
      expect(targetValue).toBeGreaterThan(0);
    }

    await disposeAudioContext();
    expect(tracker.closeCalls).toBe(1);
    expect(getAudioContextState()).toBe('uninitialized');

    expect(playSound('beep')).toBe(true);
    expect(ctorCount).toBe(2);
  });
});
