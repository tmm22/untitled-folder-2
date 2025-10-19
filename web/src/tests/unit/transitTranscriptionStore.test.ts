import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { StreamTranscriptionOptions } from '@/modules/transitTranscription/service';

const mockHistoryStoreState = {
  hydrated: true,
  records: [] as unknown[],
  error: undefined as string | undefined,
  actions: {
    hydrate: vi.fn(async () => {}),
    record: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  },
};

vi.mock('@/modules/transitTranscription/historyStore', () => ({
  useTransitTranscriptionHistoryStore: {
    getState: () => mockHistoryStoreState,
  },
}));

const mockStream = vi.fn(async (options: StreamTranscriptionOptions) => {
  options.onEvent({ event: 'status', data: { stage: 'received' } });
  options.onEvent({
    event: 'cleanup',
    data: {
      instruction: 'Polish text',
      output: 'Cleaned transcript',
      label: 'Preset',
    },
  });
  options.onEvent({
    event: 'complete',
    data: {
      id: 'record-1',
      title: options.title ?? 'Untitled',
      transcript: 'Original transcript',
      segments: [
        {
          index: 1,
          startMs: 0,
          endMs: 1000,
          text: 'Original transcript',
        },
      ],
      summary: null,
      cleanup: {
        instruction: 'Polish text',
        output: 'Cleaned transcript',
        label: 'Preset',
      },
      language: null,
      durationMs: 1000,
      confidence: undefined,
      createdAt: new Date().toISOString(),
      source: options.source,
    },
  });
});

vi.mock('@/modules/transitTranscription/service', () => ({
  streamTransitTranscription: (options: StreamTranscriptionOptions) => mockStream(options),
}));

import { useTransitTranscriptionStore } from '@/modules/transitTranscription/store';

describe('useTransitTranscriptionStore cleanup workflow', () => {
  beforeEach(() => {
    mockStream.mockClear();
    Object.values(mockHistoryStoreState.actions).forEach((fn) => fn.mockClear?.());
    useTransitTranscriptionStore.setState({
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
      controller: undefined,
    });
  });

  test('passes cleanup instructions to the stream and stores the result', async () => {
    const actions = useTransitTranscriptionStore.getState().actions;
    actions.setCleanupInstruction('Polish text', 'Preset');

    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await actions.submit({ file: blob, title: 'Test Run' });

    expect(mockStream).toHaveBeenCalledTimes(1);
    const options = mockStream.mock.calls[0]?.[0];
    expect(options?.cleanupInstruction).toBe('Polish text');
    expect(options?.cleanupLabel).toBe('Preset');

    const state = useTransitTranscriptionStore.getState();
    expect(state.cleanupResult?.output).toBe('Cleaned transcript');
    expect(state.cleanupResult?.label).toBe('Preset');
    expect(mockHistoryStoreState.actions.record).toHaveBeenCalled();
  });
});
