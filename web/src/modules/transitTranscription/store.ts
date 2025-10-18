'use client';

import { create } from 'zustand';
import type {
  TransitStreamPayload,
  TransitSummaryBlock,
  TransitTranscriptSegment,
  TransitTranscriptionRecord,
  TransitTranscriptionSource,
} from '@/modules/transitTranscription/types';
import { streamTransitTranscription } from './service';

type TransitStage =
  | 'idle'
  | 'uploading'
  | 'received'
  | 'transcribing'
  | 'summarising'
  | 'persisting'
  | 'complete'
  | 'error';

const STAGE_PROGRESS: Record<Exclude<TransitStage, 'idle' | 'error'>, number> = {
  uploading: 0.1,
  received: 0.2,
  transcribing: 0.5,
  summarising: 0.75,
  persisting: 0.9,
  complete: 1,
};

export interface TransitTranscriptionState {
  stage: TransitStage;
  segments: TransitTranscriptSegment[];
  summary: TransitSummaryBlock | null;
  record: TransitTranscriptionRecord | null;
  transcriptText: string;
  error?: string;
  isStreaming: boolean;
  progress: number;
  source: TransitTranscriptionSource;
  title: string;
  languageHint?: string;
  actions: {
    reset: () => void;
    setSource: (source: TransitTranscriptionSource) => void;
    setTitle: (title: string) => void;
    setLanguageHint: (language?: string) => void;
    submit: (input: { file: Blob; title?: string }) => Promise<void>;
    cancel: () => void;
  };
}

interface InternalState {
  controller?: AbortController;
}

const initialState: Omit<TransitTranscriptionState, 'actions'> = {
  stage: 'idle',
  segments: [],
  summary: null,
  record: null,
  transcriptText: '',
  error: undefined,
  isStreaming: false,
  progress: 0,
  source: 'microphone',
  title: '',
  languageHint: undefined,
};

export const useTransitTranscriptionStore = create<TransitTranscriptionState & InternalState>((set, get) => ({
  ...initialState,
  actions: {
    reset: () => {
      const controller = get().controller;
      if (controller) {
        controller.abort();
      }
      set({ ...initialState, controller: undefined });
    },
    setSource: (source) => set({ source }),
    setTitle: (title) => set({ title }),
    setLanguageHint: (languageHint) => set({ languageHint }),
    cancel: () => {
      const controller = get().controller;
      if (controller) {
        controller.abort();
      }
      set({ stage: 'idle', isStreaming: false, progress: 0, controller: undefined });
    },
    submit: async ({ file, title }) => {
      const { controller: existingController, source, languageHint } = get();
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();

      set({
        stage: 'uploading',
        segments: [],
        summary: null,
        record: null,
        transcriptText: '',
        error: undefined,
        isStreaming: true,
        progress: STAGE_PROGRESS.uploading,
        controller,
        title: title ?? get().title ?? '',
      });

      try {
        await streamTransitTranscription({
          file,
          title: title ?? get().title ?? '',
          source,
          languageHint,
          signal: controller.signal,
          onEvent: (payload: TransitStreamPayload) => {
            if (payload.event === 'status') {
              const stage = payload.data.stage;
              set((state) => ({
                stage,
                progress: STAGE_PROGRESS[stage] ?? state.progress,
              }));
              return;
            }

            if (payload.event === 'segment') {
              set((state) => ({
                segments: [...state.segments, payload.data],
                transcriptText: `${state.transcriptText}${state.transcriptText ? ' ' : ''}${payload.data.text}`,
              }));
              return;
            }

            if (payload.event === 'summary') {
              set({ summary: payload.data });
              return;
            }

            if (payload.event === 'complete') {
              set({
                record: payload.data,
                stage: 'complete',
                isStreaming: false,
                progress: STAGE_PROGRESS.complete,
                controller: undefined,
              });
              return;
            }

            if (payload.event === 'error') {
              set({
                stage: 'error',
                error: payload.data.message,
                isStreaming: false,
                controller: undefined,
              });
            }
          },
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          set({
            stage: 'idle',
            isStreaming: false,
            progress: 0,
            controller: undefined,
          });
          return;
        }
        set({
          stage: 'error',
          error: error instanceof Error ? error.message : 'Transcription failed',
          isStreaming: false,
          controller: undefined,
        });
      }
    },
  },
}));
