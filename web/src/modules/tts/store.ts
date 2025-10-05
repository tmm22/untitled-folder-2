'use client';

import { create, StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { getAudioEngine } from '@/lib/audio/AudioEngine';
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

interface TTSBaseState {
  inputText: string;
  selectedProvider: ProviderType;
  selectedVoice?: Voice;
  availableVoices: Voice[];
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
  selectedProvider: 'openAI',
  selectedVoice: undefined,
  availableVoices: [],
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
};

const computeState = (state: TTSBaseState): TTSComputedState => {
  const provider = providerRegistry.get(state.selectedProvider);
  return {
    characterLimit: provider.limits.maxCharacters,
  };
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
      set((prev) => ({
        ...prev,
        selectedProvider: provider,
        generationProgress: 0,
        errorMessage: undefined,
        playbackSpeed: descriptor.defaultSettings.speed,
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
      set((prev) => ({ ...prev, availableVoices: [], selectedVoice: undefined }));
      try {
        const voices = await fetchVoices(provider);
        set((prev) => ({
          ...prev,
          availableVoices: voices,
          selectedVoice: voices.find((voice) => voice.id === providerRegistry.get(provider).defaultVoiceId) ?? voices[0],
        }));
      } catch (error) {
        console.error('Failed to load voices', error);
        set((prev) => ({ ...prev, errorMessage: 'Unable to load voices. Please try again.' }));
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

      set((prev) => ({
        ...prev,
        isGenerating: true,
        generationProgress: 0.05,
        errorMessage: undefined,
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
          audioUrl: snapshot.sourceUrl ?? '',
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
      try {
        const engine = getAudioEngine();
        await engine.play();
        set((prev) => ({ ...prev, isPlaying: true }));
      } catch (error) {
        console.error('Failed to play audio', error);
      }
    },
    pause: () => {
      try {
        const engine = getAudioEngine();
        engine.pause();
        set((prev) => ({ ...prev, isPlaying: false }));
      } catch (error) {
        console.error('Failed to pause audio', error);
      }
    },
    stop: () => {
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
  devtools(withPersist(createStore), { name: 'TTSStore' }),
);
