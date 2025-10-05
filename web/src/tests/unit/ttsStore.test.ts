import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useTTSStore } from '@/modules/tts/store';
import type { ProviderSynthesisResponse, Voice } from '@/modules/tts/types';

const mockVoices: Voice[] = [
  { id: 'test-voice', name: 'Test Voice', language: 'en-US', gender: 'neutral', provider: 'openAI' },
];

const mockAudioResponse: ProviderSynthesisResponse = {
  audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
  audioContentType: 'audio/wav',
  requestId: 'mock-request',
  transcript: undefined,
  durationMs: 1200,
};

describe('useTTSStore', () => {
  beforeEach(() => {
    useTTSStore.getState().actions.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('setInputText updates the state', () => {
    const { setInputText } = useTTSStore.getState().actions;
    setInputText('Hello world');
    expect(useTTSStore.getState().inputText).toBe('Hello world');
  });

  test('generate stores history when synthesis succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/voices')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockVoices), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }

      if (url.includes('/synthesize')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockAudioResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    const store = useTTSStore.getState();
    store.actions.setInputText('Sample text');
    await store.actions.loadVoices('openAI');
    store.actions.selectVoice('test-voice');

    await store.actions.generate();

    expect(fetchMock).toHaveBeenCalledWith('/api/providers/openAI/synthesize', expect.any(Object));
    expect(useTTSStore.getState().recentGenerations).toHaveLength(1);
    expect(useTTSStore.getState().recentGenerations[0]?.metadata.characterCount).toBe(11);
  });

  test('loadVoices surfaces errors gracefully when requests fail', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'No credentials' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await useTTSStore.getState().actions.loadVoices('openAI');

    const state = useTTSStore.getState();
    expect(state.availableVoices).toHaveLength(0);
    expect(state.voiceLoadError).toBe('Unable to load voices. Please try again.');
    expect(state.isLoadingVoices).toBe(false);
  });

  test('loadVoices reports when providers return an empty voice list', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await useTTSStore.getState().actions.loadVoices('openAI');

    const state = useTTSStore.getState();
    expect(state.availableVoices).toHaveLength(0);
    expect(state.voiceLoadError).toBe('No voices available for this provider.');
    expect(state.isLoadingVoices).toBe(false);
  });

  test('generate surfaces errors from failed requests', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'No key' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    useTTSStore.setState((state) => ({
      ...state,
      availableVoices: mockVoices,
      selectedVoice: mockVoices[0],
    }));

    const store = useTTSStore.getState();
    store.actions.setInputText('Hello');

    await store.actions.generate();

    expect(useTTSStore.getState().errorMessage).toBeDefined();
  });
});
