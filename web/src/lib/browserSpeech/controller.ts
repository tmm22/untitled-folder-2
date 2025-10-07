import type { Voice } from '@/modules/tts/types';

export type BrowserPlaybackCallbacks = {
  onStart?: () => void;
  onEnd?: (durationMs: number) => void;
  onError?: (message: string) => void;
};

export interface BrowserSpeechRequest {
  text: string;
  voiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isSpeechSynthesisSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

const getSynth = () => {
  if (!isSpeechSynthesisSupported()) {
    throw new Error('Speech synthesis is not supported in this environment');
  }
  return window.speechSynthesis;
};

const toDurationMs = (elapsedSeconds?: number) =>
  Number.isFinite(elapsedSeconds) ? Math.round((elapsedSeconds ?? 0) * 1000) : undefined;

const waitForVoices = (timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> =>
  new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve([]);
      return;
    }

    const synth = getSynth();
    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let settled = false;
    const handle = () => {
      const voices = synth.getVoices();
      if (voices.length > 0 && !settled) {
        settled = true;
        synth.removeEventListener('voiceschanged', handle as EventListener);
        resolve(voices);
      }
    };

    synth.addEventListener('voiceschanged', handle as EventListener);

    setTimeout(() => {
      if (!settled) {
        settled = true;
        synth.removeEventListener('voiceschanged', handle as EventListener);
        resolve(synth.getVoices());
      }
    }, timeoutMs);
  });

export const loadBrowserVoices = async (): Promise<SpeechSynthesisVoice[]> => waitForVoices();

export const mapSpeechVoiceToDescriptor = (voice: SpeechSynthesisVoice): Voice => ({
  id: voice.voiceURI ?? voice.name,
  name: voice.name,
  language: voice.lang || 'en-US',
  gender: 'neutral' as const,
  provider: 'tightAss' as const,
  metadata: {
    voiceURI: voice.voiceURI,
    default: voice.default,
    localService: voice.localService,
    lang: voice.lang,
    name: voice.name,
  },
});

export const loadBrowserVoiceDescriptors = async (): Promise<Voice[]> => {
  if (!isSpeechSynthesisSupported()) {
    return [];
  }
  const voices = await loadBrowserVoices();
  return voices.map(mapSpeechVoiceToDescriptor);
};

class BrowserSpeechController {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private lastRequest: BrowserSpeechRequest | null = null;

  speak(request: BrowserSpeechRequest, callbacks: BrowserPlaybackCallbacks = {}): Promise<number> {
    if (!isSpeechSynthesisSupported()) {
      return Promise.reject(new Error('Speech synthesis is not supported in this browser'));
    }

    const synth = getSynth();
    this.cancel();
    this.lastRequest = request;

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      const voices = synth.getVoices();

      if (request.voiceId) {
        const matching = voices.find(
          (voice) => voice.voiceURI === request.voiceId || voice.name === request.voiceId,
        );
        if (matching) {
          utterance.voice = matching;
        }
      }

      utterance.rate = clamp(request.rate, 0.2, 2.5);
      utterance.pitch = clamp(request.pitch, 0.1, 2);
      utterance.volume = clamp(request.volume, 0, 1);

      utterance.onstart = () => {
        callbacks.onStart?.();
      };

      utterance.onend = (event) => {
        this.currentUtterance = null;
        const durationMs = toDurationMs(event.elapsedTime);
        callbacks.onEnd?.(durationMs ?? 0);
        resolve(durationMs ?? 0);
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        synth.cancel();
        const message = typeof event.error === 'string' ? event.error : 'Speech synthesis failed';
        callbacks.onError?.(message);
        reject(new Error(message));
      };

      utterance.onpause = () => {
        // no-op placeholder to keep reference until resumed or cancelled
      };

      this.currentUtterance = utterance;
      synth.speak(utterance);
    });
  }

  resume(callbacks: BrowserPlaybackCallbacks = {}) {
    if (!isSpeechSynthesisSupported()) {
      return;
    }
    const synth = getSynth();

    if (synth.paused) {
      synth.resume();
      callbacks.onStart?.();
      return;
    }

    if (!synth.speaking && this.lastRequest) {
      void this.speak(this.lastRequest, callbacks);
    }
  }

  pause() {
    if (!isSpeechSynthesisSupported()) {
      return;
    }
    const synth = getSynth();
    if (synth.speaking && !synth.paused) {
      synth.pause();
    }
  }

  cancel() {
    if (!isSpeechSynthesisSupported()) {
      return;
    }
    const synth = getSynth();
    if (this.currentUtterance || synth.speaking) {
      synth.cancel();
    }
    this.currentUtterance = null;
  }

  isSpeaking() {
    if (!isSpeechSynthesisSupported()) {
      return false;
    }
    const synth = getSynth();
    return synth.speaking && !synth.paused;
  }

  isPaused() {
    if (!isSpeechSynthesisSupported()) {
      return false;
    }
    return getSynth().paused;
  }

  getLastRequest(): BrowserSpeechRequest | null {
    return this.lastRequest;
  }
}

let sharedController: BrowserSpeechController | null = null;

export const getBrowserSpeechController = () => {
  if (!isSpeechSynthesisSupported()) {
    throw new Error('Speech synthesis is unavailable');
  }

  if (!sharedController) {
    sharedController = new BrowserSpeechController();
  }

  return sharedController;
};
