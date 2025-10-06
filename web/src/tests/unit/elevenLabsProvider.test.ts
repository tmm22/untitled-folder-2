import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createElevenLabsAdapter } from '@/lib/providers/elevenLabs';

const originalFetch = global.fetch;

const buildResponse = <T>(body: T, init?: { ok?: boolean; status?: number; text?: string }) => ({
  ok: init?.ok ?? true,
  status: init?.status ?? 200,
  json: async () => body,
  text: async () => init?.text ?? JSON.stringify(body),
}) as unknown as Response;

describe('ElevenLabsAdapter listVoices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MOCK_TTS;
    (global.fetch as unknown) = originalFetch;
  });

  afterEach(() => {
    (global.fetch as unknown) = originalFetch;
  });

  test('returns fallback voices when no API key is available', async () => {
    const adapter = createElevenLabsAdapter({ provider: 'elevenLabs' });

    const voices = await adapter.listVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]?.id).toBe('21m00Tcm4TlvDq8ikWAM');
  });

  test('fetches voices from ElevenLabs when an API key is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      buildResponse({
        voices: [
          {
            voice_id: 'demo-voice',
            name: 'Demo Voice',
            preview_url: 'https://example.com/preview.mp3',
            labels: { language: 'fr-FR', gender: 'female' },
            available_models: ['eleven_multilingual_v2'],
            category: 'premade',
          },
        ],
      }),
    );

    (global.fetch as unknown) = mockFetch;

    const adapter = createElevenLabsAdapter({ provider: 'elevenLabs', apiKey: 'test-key' });

    const voices = await adapter.listVoices();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': 'test-key' },
      cache: 'no-store',
    });

    expect(voices).toEqual([
      expect.objectContaining({
        id: 'demo-voice',
        name: 'Demo Voice',
        language: 'fr-FR',
        gender: 'female',
        provider: 'elevenLabs',
        previewUrl: 'https://example.com/preview.mp3',
      }),
    ]);

    expect(voices[0]?.metadata).toMatchObject({
      availableModels: ['eleven_multilingual_v2'],
      category: 'premade',
    });
  });

  test('reuses cached voices for subsequent calls within the TTL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        buildResponse({
          voices: [
            {
              voice_id: 'first-voice',
              name: 'First Voice',
              labels: { language: 'en-GB', gender: 'male' },
            },
          ],
        }),
      );

    (global.fetch as unknown) = mockFetch;

    const adapter = createElevenLabsAdapter({ provider: 'elevenLabs', apiKey: 'cache-key' });

    const firstCall = await adapter.listVoices();
    const secondCall = await adapter.listVoices();

    expect(firstCall[0]?.id).toBe('first-voice');
    expect(secondCall[0]?.id).toBe('first-voice');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('falls back to the default voice list when the network request fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        buildResponse(
          { error: 'Unauthorized' },
          { ok: false, status: 401, text: 'Unauthorized' },
        ),
      );

    (global.fetch as unknown) = mockFetch;

    const adapter = createElevenLabsAdapter({ provider: 'elevenLabs', apiKey: 'bad-key' });

    const voices = await adapter.listVoices();

    expect(voices[0]?.id).toBe('21m00Tcm4TlvDq8ikWAM');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
