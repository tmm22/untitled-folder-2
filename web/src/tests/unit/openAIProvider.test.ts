import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOpenAIAdapter } from '@/lib/providers/openAI';

const originalFetch = global.fetch;

const buildResponse = <T>(body: T, init?: { ok?: boolean; status?: number; text?: string }) => ({
  ok: init?.ok ?? true,
  status: init?.status ?? 200,
  json: async () => body,
  text: async () => init?.text ?? JSON.stringify(body),
}) as unknown as Response;

describe('OpenAIAdapter listVoices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MOCK_TTS;
    (global.fetch as unknown) = originalFetch;
  });

  afterEach(() => {
    (global.fetch as unknown) = originalFetch;
  });

  test('returns fallback voices when no API key is available', async () => {
    const adapter = createOpenAIAdapter({ provider: 'openAI' });

    const voices = await adapter.listVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]?.id).toBe('alloy');
  });

  test('fetches voices from OpenAI when an API key is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      buildResponse({
        voices: [
          {
            voice_id: 'solis',
            display_name: 'Solis',
            gender: 'female',
            language: 'es-ES',
            preview_url: 'https://example.com/solis.mp3',
            description: 'Warm Spanish narration',
            settings: { timbre: 'warm' },
          },
        ],
      }),
    );

    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', apiKey: 'test-key' });

    const voices = await adapter.listVoices();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/audio/voices', {
      headers: { Authorization: 'Bearer test-key' },
      cache: 'no-store',
    });

    expect(voices).toEqual([
      expect.objectContaining({
        id: 'solis',
        name: 'Solis',
        language: 'es-ES',
        gender: 'female',
        provider: 'openAI',
        previewUrl: 'https://example.com/solis.mp3',
      }),
    ]);

    expect(voices[0]?.metadata).toMatchObject({ description: 'Warm Spanish narration', settings: { timbre: 'warm' } });
  });

  test('reuses cached voices for subsequent calls within the TTL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        buildResponse({
          voices: [
            {
              voice_id: 'emerald',
              display_name: 'Emerald',
            },
          ],
        }),
      );

    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', apiKey: 'cache-key' });

    const firstCall = await adapter.listVoices();
    const secondCall = await adapter.listVoices();

    expect(firstCall[0]?.id).toBe('emerald');
    expect(secondCall[0]?.id).toBe('emerald');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('falls back to default voices when the request fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        buildResponse({ error: 'Unauthorized' }, { ok: false, status: 401, text: 'Unauthorized' }),
      );

    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', apiKey: 'bad-key' });

    const voices = await adapter.listVoices();

    expect(voices[0]?.id).toBe('alloy');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
