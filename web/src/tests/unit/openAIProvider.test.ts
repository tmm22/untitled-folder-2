import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOpenAIAdapter } from '@/lib/providers/openAI';

const originalFetch = global.fetch;

describe('OpenAIAdapter listVoices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MOCK_TTS;
    (global.fetch as unknown) = originalFetch;
  });

  afterEach(() => {
    (global.fetch as unknown) = originalFetch;
  });

  test('returns the curated voice list without calling the network', async () => {
    const mockFetch = vi.fn();
    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', apiKey: 'test-key' });

    const voices = await adapter.listVoices();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]?.id).toBe('alloy');
    expect(voices.every((voice) => voice.provider === 'openAI')).toBe(true);
  });

  test('returns voices when no API key is available', async () => {
    const adapter = createOpenAIAdapter({ provider: 'openAI' });

    const voices = await adapter.listVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]?.id).toBe('alloy');
  });
});

describe('OpenAIAdapter synthesize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.MOCK_TTS;
    delete process.env.OPENAI_API_KEY;
    (global.fetch as unknown) = originalFetch;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    (global.fetch as unknown) = originalFetch;
  });

  const payload = {
    text: 'Hello world',
    voiceId: 'alloy',
    settings: { format: 'mp3', speed: 1, styleValues: {} },
  } as Parameters<ReturnType<typeof createOpenAIAdapter>['synthesize']>[0];

  test('posts only supported fields to the speech endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'audio/mpeg' }),
      arrayBuffer: async () => new ArrayBuffer(4),
    } as unknown as Response);
    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', apiKey: 'test-key' });
    await adapter.synthesize(payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'tts-1',
      input: 'Hello world',
      voice: 'alloy',
      response_format: 'mp3',
      speed: 1,
    });
    expect(body).not.toHaveProperty('style');
  });

  test('never uses a managed pseudo token as the upstream key', async () => {
    const mockFetch = vi.fn();
    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({
      provider: 'openAI',
      managedCredential: {
        source: 'provisioned',
        credentialId: 'cred-1',
        token: 'tts-proxy-pseudo-token',
        expiresAt: Date.now() + 60_000,
      },
    });

    // No BYOK key and no env key: managed credential alone must not become
    // the bearer token, so synthesis falls back to the mock provider.
    const result = await adapter.synthesize(payload);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.audioBase64.length).toBeGreaterThan(0);
  });

  test('does not fall back to the server env key when allowServerKey is false', async () => {
    process.env.OPENAI_API_KEY = 'server-secret-key';
    const mockFetch = vi.fn();
    (global.fetch as unknown) = mockFetch;

    const adapter = createOpenAIAdapter({ provider: 'openAI', allowServerKey: false });
    await adapter.synthesize(payload);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
