import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useTTSStore } from '@/modules/tts/store';
import type { ProviderSynthesisResponse, Voice } from '@/modules/tts/types';

const mockVoices: Voice[] = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openAI' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openAI' },
];

const mockSynthesisResponse: ProviderSynthesisResponse = {
  audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
  audioContentType: 'audio/wav',
  requestId: 'integration-request',
  transcript: undefined,
  durationMs: 1500,
};

describe('TTS workflow integration', () => {
  beforeEach(() => {
    useTTSStore.getState().actions.reset();
    vi.restoreAllMocks();
  });

  test('loadVoices hydrates store and selects default voice', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockVoices), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await useTTSStore.getState().actions.loadVoices('openAI');

    const state = useTTSStore.getState();
    expect(state.availableVoices).toHaveLength(mockVoices.length);
    expect(state.selectedVoice?.id).toBe('alloy');
    expect(state.isLoadingVoices).toBe(false);
    expect(state.voiceLoadError).toBeUndefined();
  });

  test('complete generate flow appends history entry', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
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
          new Response(JSON.stringify(mockSynthesisResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const store = useTTSStore.getState();
    await store.actions.loadVoices('openAI');
    store.actions.setInputText('Integration scenario');
    store.actions.selectVoice('nova');

    await store.actions.generate();

    const history = useTTSStore.getState().recentGenerations;
    expect(history).toHaveLength(1);
    expect(history[0]?.metadata.voiceId).toBe('nova');
  });
});
