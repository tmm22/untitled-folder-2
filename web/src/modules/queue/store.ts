'use client';

import { create } from 'zustand';
import { generateId } from '@/lib/utils/id';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { usePronunciationStore } from '@/modules/pronunciation/store';
import { useHistoryStore } from '@/modules/history/store';
import { synthesizeSpeech } from '@/modules/tts/services/ttsService';
import { decodeBase64 } from '@/lib/utils/base64';
import type {
  BatchGenerationItem,
  GenerationHistoryItem,
  ProviderSynthesisPayload,
  ProviderType,
} from '@/modules/tts/types';
import type { AudioSettings } from '@/modules/tts/types';

interface QueueItem extends BatchGenerationItem {
  provider: ProviderType;
  voiceId: string;
  createdAt: string;
  result?: GenerationHistoryItem;
  audioContentType?: string;
}

interface QueueState {
  items: QueueItem[];
  isRunning: boolean;
  cancelRequested: boolean;
  currentItemId?: string;
  actions: {
    enqueueSegments: (segments: string[], options: { provider: ProviderType; voiceId: string }) => void;
    start: () => Promise<void>;
    cancel: () => void;
    clear: () => void;
    remove: (id: string) => void;
    retryFailed: () => void;
  };
}

const createdObjectUrls = new Map<string, string>();

const revokeUrl = (id: string) => {
  const url = createdObjectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    createdObjectUrls.delete(id);
  }
};

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  isRunning: false,
  cancelRequested: false,
  currentItemId: undefined,
  actions: {
    enqueueSegments: (segments, { provider, voiceId }) => {
      const trimmed = segments
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter((segment) => segment.length > 0);

      if (trimmed.length === 0) {
        return;
      }

      set((state) => ({
        items: [
          ...state.items,
          ...trimmed.map((segment) => ({
            id: generateId('batch'),
            text: segment,
            provider,
            voiceId,
            createdAt: new Date().toISOString(),
            status: 'pending',
            progress: 0,
          } as QueueItem)),
        ],
      }));
    },
    start: async () => {
      await processQueue();
    },
    cancel: () => {
      set({ cancelRequested: true });
    },
    clear: () => {
      get().items.forEach((item) => revokeUrl(item.id));
      set({ items: [], cancelRequested: false, isRunning: false, currentItemId: undefined });
    },
    remove: (id) => {
      revokeUrl(id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      }));
    },
    retryFailed: () => {
      set((state) => ({
        items: state.items.map((item) =>
          item.status === 'failed'
            ? { ...item, status: 'pending', progress: 0, errorMessage: undefined }
            : item,
        ),
      }));
    },
  },
}));

let processingPromise: Promise<void> | null = null;

async function processQueue(): Promise<void> {
  if (processingPromise) {
    return processingPromise;
  }

  processingPromise = (async () => {
    const { setState, getState } = { setState: useQueueStore.setState, getState: useQueueStore.getState };

    if (getState().isRunning) {
      return;
    }

    setState({ isRunning: true, cancelRequested: false });

    try {
      while (true) {
        const state = getState();
        if (state.cancelRequested) {
          setState((prev) => ({
            items: prev.items.map((item) =>
              item.status === 'pending'
                ? { ...item, status: 'cancelled', progress: 0 }
                : item,
            ),
          }));
          break;
        }

        const nextItem = state.items.find((item) => item.status === 'pending');
        if (!nextItem) {
          break;
        }

        setState((prev) => ({
          currentItemId: nextItem.id,
          items: prev.items.map((item) =>
            item.id === nextItem.id ? { ...item, status: 'running', progress: 0.1 } : item,
          ),
        }));

        try {
          const result = await runBatchItem(nextItem);

          setState((prev) => ({
            items: prev.items.map((item) =>
              item.id === nextItem.id
                ? {
                    ...item,
                    status: 'completed',
                    progress: 1,
                    result: result.historyItem,
                    audioContentType: result.audioContentType,
                    errorMessage: undefined,
                  }
                : item,
            ),
            currentItemId: undefined,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to complete item';
          setState((prev) => ({
            items: prev.items.map((item) =>
              item.id === nextItem.id
                ? { ...item, status: 'failed', progress: 0, errorMessage: message }
                : item,
            ),
            currentItemId: undefined,
          }));
        }
      }
    } finally {
      setState({ isRunning: false, cancelRequested: false, currentItemId: undefined });
      processingPromise = null;
    }
  })();

  await processingPromise;
}

async function runBatchItem(item: QueueItem): Promise<{ historyItem: GenerationHistoryItem; audioContentType: string }> {
  const pronunciationState = usePronunciationStore.getState();
  if (typeof window !== 'undefined' && !pronunciationState.hydrated) {
    await pronunciationState.actions.hydrate();
  }

  const historyState = useHistoryStore.getState();
  if (typeof window !== 'undefined' && !historyState.hydrated) {
    await historyState.actions.hydrate();
  }

  const providerDescriptor = providerRegistry.get(item.provider);
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

  const glossaryRules = pronunciationState.actions.getApplicableRules(item.provider);

  const payload: ProviderSynthesisPayload = {
    text: item.text,
    voiceId: item.voiceId,
    settings,
    glossaryRules,
  };

  const response = await synthesizeSpeech(item.provider, payload);

  const audioUrl = createObjectUrl(response.audioBase64, response.audioContentType);
  createdObjectUrls.set(item.id, audioUrl);

  const historyItem: GenerationHistoryItem = {
    metadata: {
      id: response.requestId,
      provider: item.provider,
      voiceId: item.voiceId,
      createdAt: new Date().toISOString(),
      durationMs: response.durationMs ?? 0,
      characterCount: payload.text.length,
    },
    text: payload.text,
    audioUrl,
    audioContentType: response.audioContentType,
    transcript: response.transcript,
  };

  await historyState.actions.record({
    id: historyItem.metadata.id,
    provider: historyItem.metadata.provider,
    voiceId: historyItem.metadata.voiceId,
    text: payload.text,
    createdAt: historyItem.metadata.createdAt,
    durationMs: historyItem.metadata.durationMs,
    transcript: historyItem.transcript,
  });

  return { historyItem, audioContentType: response.audioContentType };
}

function createObjectUrl(base64: string, contentType: string): string {
  const binary = decodeBase64(base64);
  const blob = new Blob([binary], { type: contentType });
  return URL.createObjectURL(blob);
}
