import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  loadBrowserVoiceDescriptors,
  isSpeechSynthesisSupported,
  getBrowserSpeechController,
} from '@/lib/browserSpeech/controller';

describe('browser speech helpers', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as typeof globalThis & { window?: typeof window }).window;
    }
  });

  test('isSpeechSynthesisSupported returns false without window', () => {
    delete (globalThis as typeof globalThis & { window?: typeof window }).window;
    expect(isSpeechSynthesisSupported()).toBe(false);
  });

  test('loadBrowserVoiceDescriptors returns descriptors when supported', async () => {
    const mockVoice = {
      voiceURI: 'custom-voice',
      name: 'Custom Voice',
      lang: 'en-AU',
      default: false,
      localService: true,
    } as SpeechSynthesisVoice;

    const speechSynthesis = {
      getVoices: vi.fn().mockReturnValue([mockVoice]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn(),
      paused: false,
      speaking: false,
      resume: vi.fn(),
      pause: vi.fn(),
    } as unknown as SpeechSynthesis;

    (globalThis as typeof globalThis & { window?: typeof window }).window = {
      speechSynthesis,
    } as typeof window;

    const voices = await loadBrowserVoiceDescriptors();
    expect(voices).toHaveLength(1);
    expect(voices[0]?.id).toBe('custom-voice');
    expect(voices[0]?.name).toBe('Custom Voice');
  });

  test('controller cancel does not throw when not speaking', () => {
    const speechSynthesis = {
      getVoices: vi.fn().mockReturnValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn(),
      paused: false,
      speaking: false,
      resume: vi.fn(),
      pause: vi.fn(),
    } as unknown as SpeechSynthesis;

    (globalThis as typeof globalThis & { window?: typeof window }).window = {
      speechSynthesis,
    } as typeof window;

    expect(() => getBrowserSpeechController().cancel()).not.toThrow();
  });
});
