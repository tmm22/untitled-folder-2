'use client';

import { create } from 'zustand';
import type {
  TransitCleanupResult,
  TransitStreamPayload,
  TransitSummaryBlock,
  TransitTranscriptSegment,
  TransitTranscriptionRecord,
  TransitTranscriptionSource,
} from '@/modules/transitTranscription/types';
import { streamTransitTranscription } from './service';
import { useTransitTranscriptionHistoryStore } from '@/modules/transitTranscription/historyStore';

type TransitStage =
  | 'idle'
  | 'uploading'
  | 'received'
  | 'transcribing'
  | 'summarising'
  | 'cleaning'
  | 'persisting'
  | 'complete'
  | 'error';

const STAGE_PROGRESS: Record<Exclude<TransitStage, 'idle' | 'error'>, number> = {
  uploading: 0.1,
  received: 0.2,
  transcribing: 0.5,
  summarising: 0.75,
  cleaning: 0.82,
  persisting: 0.9,
  complete: 1,
};

export interface TransitTranscriptionState {
  stage: TransitStage;
  segments: TransitTranscriptSegment[];
  summary: TransitSummaryBlock | null;
  cleanupResult: TransitCleanupResult | null;
  record: TransitTranscriptionRecord | null;
  transcriptText: string;
  error?: string;
  isStreaming: boolean;
  progress: number;
  source: TransitTranscriptionSource;
  title: string;
  languageHint?: string;
  cleanupInstruction: string;
  cleanupLabel?: string;
  actions: {
    reset: () => void;
    setSource: (source: TransitTranscriptionSource) => void;
    setTitle: (title: string) => void;
    setLanguageHint: (language?: string) => void;
    setCleanupInstruction: (instruction: string, label?: string) => void;
    submit: (input: { file: Blob; title?: string }) => Promise<void>;
    cancel: () => void;
    loadFromHistory: (record: TransitTranscriptionRecord) => void;
  };
}

interface InternalState {
  controller?: AbortController;
}

const initialState: Omit<TransitTranscriptionState, 'actions'> = {
  stage: 'idle',
  segments: [],
  summary: null,
  cleanupResult: null,
  record: null,
  transcriptText: '',
  error: undefined,
  isStreaming: false,
  progress: 0,
  source: 'microphone',
  title: '',
  languageHint: undefined,
  cleanupInstruction: '',
  cleanupLabel: undefined,
};

export const useTransitTranscriptionStore = create<TransitTranscriptionState & InternalState>((set, get) => ({
  ...initialState,
  actions: {
    reset: () => {
      const { controller, cleanupInstruction, cleanupLabel } = get();
      if (controller) {
        controller.abort();
      }
      set({
        ...initialState,
        controller: undefined,
        cleanupInstruction,
        cleanupLabel,
      });
    },
    setSource: (source) => set({ source }),
    setTitle: (title) => set({ title }),
    setLanguageHint: (languageHint) => set({ languageHint }),
    setCleanupInstruction: (instruction, label) =>
      set({
        cleanupInstruction: instruction,
        cleanupLabel: label,
      }),
    cancel: () => {
      const controller = get().controller;
      if (controller) {
        controller.abort();
      }
      set({ stage: 'idle', isStreaming: false, progress: 0, controller: undefined });
    },
    loadFromHistory: (record) => {
      const { cleanupInstruction, cleanupLabel } = get();
      set({
        stage: 'complete',
        segments: record.segments,
        summary: record.summary,
        cleanupResult: record.cleanup,
        record,
        transcriptText: record.transcript,
        error: undefined,
        isStreaming: false,
        progress: STAGE_PROGRESS.complete,
        controller: undefined,
        title: record.title,
        languageHint: record.language ?? undefined,
        source: record.source,
        cleanupInstruction: record.cleanup?.instruction ?? cleanupInstruction,
        cleanupLabel: record.cleanup?.label ?? cleanupLabel,
      });
    },
    submit: async ({ file, title }) => {
      const state = get();
      const { controller: existingController, source, languageHint, cleanupInstruction, cleanupLabel } = state;
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();

      set({
        stage: 'uploading',
        segments: [],
        summary: null,
        cleanupResult: null,
        record: null,
        transcriptText: '',
        error: undefined,
        isStreaming: true,
        progress: STAGE_PROGRESS.uploading,
        controller,
        title: title ?? state.title ?? '',
      });

      try {
        const normalizedCleanupInstruction = cleanupInstruction.trim();
        const cleanupInstructionToSend = normalizedCleanupInstruction.length > 0 ? normalizedCleanupInstruction : undefined;
        const cleanupLabelToSend = cleanupInstructionToSend ? cleanupLabel : undefined;

        await streamTransitTranscription({
          file,
          title: title ?? state.title ?? '',
          source,
          languageHint,
          cleanupInstruction: cleanupInstructionToSend,
          cleanupLabel: cleanupLabelToSend,
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

            if (payload.event === 'cleanup') {
              set({
                cleanupResult: payload.data,
                cleanupInstruction: payload.data.instruction,
                cleanupLabel: payload.data.label,
              });
              return;
            }

            if (payload.event === 'complete') {
              set((current) => ({
                record: payload.data,
                stage: 'complete',
                isStreaming: false,
                progress: STAGE_PROGRESS.complete,
                controller: undefined,
                summary: payload.data.summary,
                segments: payload.data.segments,
                transcriptText: payload.data.transcript,
                cleanupResult: payload.data.cleanup,
                cleanupInstruction: payload.data.cleanup?.instruction ?? current.cleanupInstruction,
                cleanupLabel: payload.data.cleanup?.label ?? current.cleanupLabel,
              }));
              void (async () => {
                try {
                  const historyState = useTransitTranscriptionHistoryStore.getState();
                  if (typeof window !== 'undefined' && !historyState.hydrated) {
                    await historyState.actions.hydrate();
                  }
                  await historyState.actions.record(payload.data);
                } catch (historyError) {
                  console.error('Failed to persist transit transcription history', historyError);
                }
              })();
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
