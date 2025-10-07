'use client';

import { create, StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { getAudioEngine } from '@/lib/audio/AudioEngine';
import {
  getBrowserSpeechController,
  loadBrowserVoiceDescriptors,
  isSpeechSynthesisSupported,
} from '@/lib/browserSpeech/controller';
import { useHistoryStore } from '@/modules/history/store';
import { usePronunciationStore } from '@/modules/pronunciation/store';
import { fetchVoices, synthesizeSpeech } from './services/ttsService';
import { providerRegistry } from './providerRegistry';
import type {
  AudioSettings,
  GenerationHistoryItem,
  ProviderType,
  ProviderSynthesisPayload,
  ProviderSynthesisResponse,
  Voice,
} from './types';

interface TTSComputedState {
  characterLimit: number;
}

type PlaybackMode = 'audio' | 'browserSpeech';

interface BrowserSpeechState {
  payload: ProviderSynthesisPayload;
  voice: Voice;
  requestId: string;
  lastDurationMs?: number;
}

interface TTSBaseState {
  inputText: string;
  selectedProvider: ProviderType;
  selectedVoice?: Voice;
  availableVoices: Voice[];
  isLoadingVoices: boolean;
  voiceLoadError?: string;
  isGenerating: boolean;
  isPlaying: boolean;
  isLoopEnabled: boolean;
  playbackSpeed: number;
  volume: number;
  generationProgress: number;
  errorMessage?: string;
  recentGenerations: GenerationHistoryItem[];
  currentAudio?: ProviderSynthesisResponse;
  defaultSettingsByProvider: Record<ProviderType, AudioSettings>;
  playbackMode: PlaybackMode;
  browserSpeechState?: BrowserSpeechState;
}

interface TTSActions {
  setInputText: (text: string) => void;
  selectProvider: (provider: ProviderType) => Promise<void>;
  selectVoice: (voiceId: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  toggleLoop: () => void;
  loadVoices: (provider: ProviderType) => Promise<void>;
  generate: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  clearError: () => void;
  reset: () => void;
}

type TTSState = TTSBaseState & TTSComputedState & { actions: TTSActions };

const initialDefaultSettings = providerRegistry
  .all()
  .reduce<Record<ProviderType, AudioSettings>>((acc, provider) => {
    acc[provider.id] = provider.defaultSettings;
    return acc;
  }, {} as Record<ProviderType, AudioSettings>);

const baseState: TTSBaseState = {
  inputText: '',
  selectedProvider: 'tightAss',
  selectedVoice: undefined,
  availableVoices: [],
  isLoadingVoices: false,
  voiceLoadError: undefined,
  isGenerating: false,
  isPlaying: false,
  isLoopEnabled: false,
  playbackSpeed: 1,
  volume: 0.75,
  generationProgress: 0,
  errorMessage: undefined,
  recentGenerations: [],
  currentAudio: undefined,
  defaultSettingsByProvider: initialDefaultSettings,
  playbackMode: 'audio',
  browserSpeechState: undefined,
};

const computeState = (state: TTSBaseState): TTSComputedState => {
  const provider = providerRegistry.get(state.selectedProvider);
  return {
    characterLimit: provider.limits.maxCharacters,
  };
};

const generateRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const createStore: StateCreator<TTSState> = (set, get) => ({
  ...baseState,
  ...computeState(baseState),
  actions: {
    setInputText: (text) => {
      set((prev) => ({
        ...prev,
        inputText: text,
      }));
    },
    selectProvider: async (provider) => {
      const descriptor = providerRegistry.get(provider);
      const previousMode = get().playbackMode;
      if (previousMode === 'browserSpeech' && typeof window !== 'undefined' && isSpeechSynthesisSupported()) {
        try {
          getBrowserSpeechController().cancel();
        } catch (error) {
          console.warn('Failed to cancel browser speech when switching provider', error);
        }
      }
      set((prev) => ({
        ...prev,
        selectedProvider: provider,
        generationProgress: 0,
        errorMessage: undefined,
        voiceLoadError: undefined,
        playbackSpeed: descriptor.defaultSettings.speed,
        playbackMode: 'audio',
        browserSpeechState: undefined,
      }));
      await get().actions.loadVoices(provider);
    },
    selectVoice: (voiceId) => {
      const { availableVoices } = get();
      set((prev) => ({
        ...prev,
        selectedVoice: availableVoices.find((voice) => voice.id === voiceId),
      }));
    },
    setPlaybackSpeed: (speed) => {
      try {
        const engine = getAudioEngine();
        engine.setPlaybackRate(speed);
      } catch (error) {
        console.error('Failed to set playback speed', error);
      }
      set((prev) => ({ ...prev, playbackSpeed: speed }));
    },
    setVolume: (volume) => {
      try {
        const engine = getAudioEngine();
        engine.setVolume(volume);
      } catch (error) {
        console.error('Failed to set volume', error);
      }
      set((prev) => ({ ...prev, volume }));
    },
    toggleLoop: () => {
      set((prev) => {
        const nextLoop = !prev.isLoopEnabled;
        try {
          const engine = getAudioEngine();
          engine.setLoop(nextLoop);
        } catch (error) {
          console.error('Failed to set loop mode', error);
        }
        return { ...prev, isLoopEnabled: nextLoop };
      });
    },
    loadVoices: async (provider) => {
      set((prev) => ({
        ...prev,
        isLoadingVoices: true,
        voiceLoadError: undefined,
        availableVoices: [],
        selectedVoice: undefined,
      }));
      try {
        let voices: Voice[] = [];
        const canUseBrowserSpeech =
          provider === 'tightAss' && typeof window !== 'undefined' && isSpeechSynthesisSupported();

        if (canUseBrowserSpeech) {
          try {
            voices = await loadBrowserVoiceDescriptors();
          } catch (voiceError) {
            console.warn('Failed to load browser voices, falling back to server voices', voiceError);
          }
        }

        if (voices.length === 0) {
          voices = await fetchVoices(provider);
        }

        const uniqueVoices = Array.from(new Map(voices.map((voice) => [voice.id, voice])).values());
        set((prev) => ({
          ...prev,
          availableVoices: uniqueVoices,
          selectedVoice:
            uniqueVoices.find((voice) => voice.id === providerRegistry.get(provider).defaultVoiceId) ?? uniqueVoices[0],
          voiceLoadError:
            uniqueVoices.length === 0 ? 'No voices available for this provider.' : undefined,
        }));
      } catch (error) {
        console.error('Failed to load voices', error);
        set((prev) => ({
          ...prev,
          voiceLoadError: 'Unable to load voices. Please try again.',
        }));
      } finally {
        set((prev) => ({ ...prev, isLoadingVoices: false }));
      }
    },
    generate: async () => {
      const state = get();
      if (!state.inputText.trim()) {
        set((prev) => ({ ...prev, errorMessage: 'Enter some text to synthesize speech.' }));
        return;
      }

      const providerDescriptor = providerRegistry.get(state.selectedProvider);
      const voice = state.selectedVoice;

      if (!voice) {
        set((prev) => ({ ...prev, errorMessage: 'Select a voice before generating speech.' }));
        return;
      }

      const styleDefaults = providerDescriptor.styleControls.reduce<Record<string, number>>((acc, control) => {
        acc[control.id] = control.defaultValue;
        return acc;
      }, {});

      const settings: AudioSettings = {
        ...providerDescriptor.defaultSettings,
        styleValues: {
          ...styleDefaults,
          ...providerDescriptor.defaultSettings.styleValues,
        },
      };

      const pronunciationState = usePronunciationStore.getState();
      if (typeof window !== 'undefined' && !pronunciationState.hydrated) {
        await pronunciationState.actions.hydrate();
      }
      const glossaryRules = pronunciationState.actions.getApplicableRules(state.selectedProvider);

      const payload: ProviderSynthesisPayload = {
        text: state.inputText.trim(),
        voiceId: voice.id,
        settings,
        glossaryRules,
      };

      const useBrowserSpeech =
        state.selectedProvider === 'tightAss' &&
        typeof window !== 'undefined' &&
        isSpeechSynthesisSupported();

      if (useBrowserSpeech) {
        const requestIdFallback = payload.requestId ?? generateRequestId();
        let usagePromise: Promise<ProviderSynthesisResponse | null> | null = null;

        try {
          usagePromise = synthesizeSpeech(state.selectedProvider, payload).catch((error) => {
            console.warn('Failed to record usage for browser speech synthesis', error);
            return null;
          });
        } catch (error) {
          console.warn('Unable to initiate usage tracking request', error);
        }

        set((prev) => ({
          ...prev,
          isGenerating: true,
          generationProgress: 0.1,
          errorMessage: undefined,
          playbackMode: 'browserSpeech',
          currentAudio: undefined,
          browserSpeechState: {
            payload,
            voice,
            requestId: requestIdFallback,
          },
        }));

        try {
          const controller = getBrowserSpeechController();
          controller
            .speak(
              {
                text: payload.text,
                voiceId: voice.id,
                rate: payload.settings.speed,
                pitch: payload.settings.pitch,
                volume: payload.settings.volume,
              },
              {
                onStart: () => {
                  set((prev) => ({
                    ...prev,
                    isGenerating: false,
                    generationProgress: Math.max(prev.generationProgress, 0.6),
                    isPlaying: true,
                  }));
                },
                onEnd: (durationMs) => {
                  void (async () => {
                    const resolvedResponse = usagePromise ? await usagePromise : null;
                    const resolvedRequestId = resolvedResponse?.requestId ?? requestIdFallback;
                    const resolvedDuration = Number.isFinite(durationMs) && durationMs > 0
                      ? durationMs
                      : Math.round(payload.text.length * 60);
                    const createdAt = new Date().toISOString();

                    const historyItem: GenerationHistoryItem = {
                      metadata: {
                        id: resolvedRequestId,
                        provider: state.selectedProvider,
                        voiceId: voice.id,
                        createdAt,
                        durationMs: resolvedDuration,
                        characterCount: payload.text.length,
                      },
                      text: payload.text,
                      audioUrl: '',
                      audioContentType: 'browser/speech',
                      transcript: undefined,
                    };

                    const historyState = useHistoryStore.getState();
                    if (typeof window !== 'undefined' && !historyState.hydrated) {
                      await historyState.actions.hydrate();
                    }
                    await historyState.actions.record({
                      id: historyItem.metadata.id,
                      provider: historyItem.metadata.provider,
                      voiceId: historyItem.metadata.voiceId,
                      text: payload.text,
                      createdAt,
                      durationMs: resolvedDuration,
                      transcript: historyItem.transcript,
                    });

                    set((prev) => ({
                      ...prev,
                      isPlaying: false,
                      isGenerating: false,
                      generationProgress: 1,
                      currentAudio: undefined,
                      recentGenerations: [historyItem, ...prev.recentGenerations].slice(0, 25),
                      browserSpeechState: {
                        payload,
                        voice,
                        requestId: resolvedRequestId,
                        lastDurationMs: resolvedDuration,
                      },
                    }));
                  })().catch((historyError) => {
                    console.error('Failed to finalise browser speech synthesis', historyError);
                    set((prev) => ({
                      ...prev,
                      isPlaying: false,
                      isGenerating: false,
                      generationProgress: 0,
                      errorMessage: 'Unable to finalise system voice playback.',
                    }));
                  });
                },
                onError: (message) => {
                  set((prev) => ({
                    ...prev,
                    isGenerating: false,
                    generationProgress: 0,
                    isPlaying: false,
                    errorMessage: message ?? 'Unable to use system voices on this device.',
                    browserSpeechState: undefined,
                  }));
                },
              },
            )
            .catch((error) => {
              console.error('Browser speech synthesis failed', error);
              set((prev) => ({
                ...prev,
                isGenerating: false,
                generationProgress: 0,
                isPlaying: false,
                errorMessage:
                  error instanceof Error ? error.message : 'Unable to use system voices on this device.',
                browserSpeechState: undefined,
              }));
            });
        } catch (error) {
          console.error('Failed to start browser speech synthesis', error);
          set((prev) => ({
            ...prev,
            isGenerating: false,
            generationProgress: 0,
            isPlaying: false,
            errorMessage:
              error instanceof Error ? error.message : 'Unable to use system voices on this device.',
            playbackMode: 'audio',
            browserSpeechState: undefined,
          }));
        }

        return;
      }

      set((prev) => ({
        ...prev,
        isGenerating: true,
        generationProgress: 0.05,
        errorMessage: undefined,
        playbackMode: 'audio',
      }));

      try {
        const response = await synthesizeSpeech(state.selectedProvider, payload);
        const engine = getAudioEngine();
        await engine.loadFromBase64(response.audioBase64, response.audioContentType);
        await engine.play();

        const snapshot = engine.getSnapshot();
        const historyItem: GenerationHistoryItem = {
          metadata: {
            id: response.requestId,
            provider: state.selectedProvider,
            voiceId: voice.id,
            createdAt: new Date().toISOString(),
            durationMs: response.durationMs ?? Math.round(snapshot.duration * 1000),
            characterCount: payload.text.length,
          },
          text: payload.text,
          audioUrl: snapshot.sourceUrl ?? '',
          audioContentType: response.audioContentType,
          transcript: response.transcript,
        };

        const historyState = useHistoryStore.getState();
        if (typeof window !== 'undefined' && !historyState.hydrated) {
          await historyState.actions.hydrate();
        }
        await historyState.actions.record({
          id: historyItem.metadata.id,
          provider: historyItem.metadata.provider,
          voiceId: historyItem.metadata.voiceId,
          text: payload.text,
          createdAt: historyItem.metadata.createdAt,
          durationMs: historyItem.metadata.durationMs,
          transcript: historyItem.transcript,
        });

        set((prev) => ({
          ...prev,
          isGenerating: false,
          isPlaying: true,
          generationProgress: 1,
          currentAudio: response,
          recentGenerations: [historyItem, ...prev.recentGenerations].slice(0, 25),
        }));
      } catch (error) {
        console.error('Generation failed', error);
        set((prev) => ({
          ...prev,
          isGenerating: false,
          generationProgress: 0,
          errorMessage:
            error instanceof Error ? error.message : 'Unable to generate speech. Please try again.',
        }));
      }
    },
    play: async () => {
      const state = get();
      if (state.playbackMode === 'browserSpeech') {
        if (typeof window === 'undefined' || !isSpeechSynthesisSupported()) {
          return;
        }

        try {
          const controller = getBrowserSpeechController();
          const snapshot = state.browserSpeechState;
          if (!snapshot) {
            console.warn('No system voice payload available for playback');
            return;
          }

          if (controller.isPaused()) {
            controller.resume({
              onStart: () => set((prev) => ({ ...prev, isPlaying: true })),
            });
            return;
          }

          controller
            .speak(
              {
                text: snapshot.payload.text,
                voiceId: snapshot.voice.id,
                rate: snapshot.payload.settings.speed,
                pitch: snapshot.payload.settings.pitch,
                volume: snapshot.payload.settings.volume,
              },
              {
                onStart: () => set((prev) => ({ ...prev, isPlaying: true })),
                onEnd: (durationMs) => {
                  set((prev) => ({
                    ...prev,
                    isPlaying: false,
                    browserSpeechState: prev.browserSpeechState
                      ? { ...prev.browserSpeechState, lastDurationMs: durationMs }
                      : prev.browserSpeechState,
                  }));
                },
                onError: (message) => {
                  set((prev) => ({
                    ...prev,
                    isPlaying: false,
                    errorMessage: message ?? 'Unable to use system voices on this device.',
                  }));
                },
              },
            )
            .catch((error) => {
              console.error('Failed to play system voice audio', error);
              set((prev) => ({
                ...prev,
                isPlaying: false,
                errorMessage:
                  error instanceof Error ? error.message : 'Unable to use system voices on this device.',
              }));
            });
        } catch (error) {
          console.error('Failed to initialise system voice playback', error);
        }
        return;
      }

      try {
        const engine = getAudioEngine();
        await engine.play();
        set((prev) => ({ ...prev, isPlaying: true }));
      } catch (error) {
        console.error('Failed to play audio', error);
      }
    },
    pause: () => {
      const state = get();
      if (state.playbackMode === 'browserSpeech') {
        if (typeof window !== 'undefined' && isSpeechSynthesisSupported()) {
          try {
            getBrowserSpeechController().pause();
          } catch (error) {
            console.warn('Unable to pause system voice playback', error);
          }
        }
        set((prev) => ({ ...prev, isPlaying: false }));
        return;
      }

      try {
        const engine = getAudioEngine();
        engine.pause();
        set((prev) => ({ ...prev, isPlaying: false }));
      } catch (error) {
        console.error('Failed to pause audio', error);
      }
    },
    stop: () => {
      const state = get();
      if (state.playbackMode === 'browserSpeech') {
        if (typeof window !== 'undefined' && isSpeechSynthesisSupported()) {
          try {
            getBrowserSpeechController().cancel();
          } catch (error) {
            console.warn('Unable to cancel system voice playback', error);
          }
        }
        set((prev) => ({ ...prev, isPlaying: false, generationProgress: 0 }));
        return;
      }

      try {
        const engine = getAudioEngine();
        engine.stop();
        set((prev) => ({ ...prev, isPlaying: false, generationProgress: 0 }));
      } catch (error) {
        console.error('Failed to stop audio', error);
      }
    },
    clearError: () => {
      set((prev) => ({ ...prev, errorMessage: undefined }));
    },
    reset: () => {
      const actions = get().actions;
      if (typeof window !== 'undefined') {
        if (isSpeechSynthesisSupported()) {
          try {
            getBrowserSpeechController().cancel();
          } catch (error) {
            console.warn('Failed to cancel system voice playback during reset', error);
          }
        }
        try {
          const engine = getAudioEngine();
          engine.stop();
        } catch (error) {
          // Ignore if engine is not initialised
        }
      }
      set(() => ({
        ...baseState,
        ...computeState(baseState),
        actions,
      }));
    },
  },
});

const persistOptions = {
  name: 'tts-store',
  partialize: (state: TTSState) => ({
    recentGenerations: state.recentGenerations,
    defaultSettingsByProvider: state.defaultSettingsByProvider,
  }),
};

const withPersist = (fn: StateCreator<TTSState>) => {
  if (process.env.NODE_ENV === 'test') {
    return fn;
  }
  return persist(fn, persistOptions);
};

export const useTTSStore = create<TTSState>()(
  devtools(withPersist(createStore) as unknown as StateCreator<TTSState>, { name: 'TTSStore' }),
);
