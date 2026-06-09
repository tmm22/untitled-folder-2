import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAIClient,
  OpenAIClientError,
  OpenAIUnavailableError,
  extractTextFromResponsesPayload,
} from '@/lib/openai/client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAIClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.OPENAI_USE_RESPONSES_API;
    delete process.env.OPENAI_TRANSCRIPTION_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_USE_RESPONSES_API;
  });

  it('throws OpenAIUnavailableError when no API key is configured', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => new OpenAIClient()).toThrow(OpenAIUnavailableError);
  });

  describe('generateText (Responses API)', () => {
    it('parses output_text from a completed response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'completed', output_text: 'hello' }));

      const client = new OpenAIClient();
      const result = await client.generateText([{ role: 'user', content: 'hi' }]);

      expect(result).toBe('hello');
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/v1/responses');
      expect(init.headers.Authorization).toBe('Bearer test-key');
    });

    it('does not retry non-retryable 4xx errors', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'bad request' } }, 400));

      const client = new OpenAIClient();
      await expect(client.generateText([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
        name: 'OpenAIClientError',
        status: 400,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries retryable 5xx errors before succeeding', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'oops' } }, 500))
        .mockResolvedValueOnce(jsonResponse({ status: 'completed', output_text: 'recovered' }));

      const client = new OpenAIClient();
      const result = await client.generateText([{ role: 'user', content: 'hi' }]);

      expect(result).toBe('recovered');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sends structured output format when responseFormat is provided', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'completed', output_text: '{}' }));

      const client = new OpenAIClient();
      await client.generateText([{ role: 'user', content: 'hi' }], {
        responseFormat: { type: 'json_schema', name: 'insights', schema: { type: 'object' } },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'insights', strict: true });
    });
  });

  describe('generateText (Chat Completions fallback)', () => {
    beforeEach(() => {
      process.env.OPENAI_USE_RESPONSES_API = 'false';
    });

    it('passes response_format through to chat completions', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"a":1}' } }] }));

      const client = new OpenAIClient();
      const result = await client.generateText([{ role: 'user', content: 'hi' }], {
        responseFormat: { type: 'json_schema', name: 'insights', schema: { type: 'object' } },
      });

      expect(result).toBe('{"a":1}');
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/v1/chat/completions');
      const body = JSON.parse(init.body as string);
      expect(body.response_format.json_schema.name).toBe('insights');
    });
  });

  describe('createTranscription', () => {
    it('requests verbose_json with segment timestamps for whisper models', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ text: 'hello world', segments: [] }));

      const client = new OpenAIClient();
      await client.createTranscription({
        file: new Blob(['audio'], { type: 'audio/webm' }),
        fileName: 'clip.webm',
        mimeType: 'audio/webm',
      });

      const formData = fetchMock.mock.calls[0][1].body as FormData;
      expect(formData.get('model')).toBe('whisper-1');
      expect(formData.get('response_format')).toBe('verbose_json');
      expect(formData.getAll('timestamp_granularities[]')).toEqual(['segment']);
    });

    it('falls back to json response format for non-whisper models', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ text: 'hello world' }));

      const client = new OpenAIClient();
      await client.createTranscription({
        file: new Blob(['audio'], { type: 'audio/webm' }),
        fileName: 'clip.webm',
        model: 'gpt-4o-mini-transcribe',
      });

      const formData = fetchMock.mock.calls[0][1].body as FormData;
      expect(formData.get('response_format')).toBe('json');
      expect(formData.get('timestamp_granularities[]')).toBeNull();
    });
  });

  describe('createRealtimeSession', () => {
    it('mints a client secret via the GA client_secrets endpoint', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ value: 'ek_secret', expires_at: 999, session: { model: 'gpt-realtime' } }),
      );

      const client = new OpenAIClient();
      const session = await client.createRealtimeSession({ type: 'realtime', voice: 'alloy' });

      expect(session).toEqual({ clientSecret: 'ek_secret', expiresAt: 999, model: 'gpt-realtime' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/v1/realtime/client_secrets');
      const body = JSON.parse(init.body as string);
      expect(body.session.type).toBe('realtime');
      expect(body.session.audio.output.voice).toBe('alloy');
    });

    it('omits audio output config for transcription sessions', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ value: 'ek_secret' }));

      const client = new OpenAIClient();
      await client.createRealtimeSession({ type: 'transcription' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.session.type).toBe('transcription');
      expect(body.session.output_modalities).toBeUndefined();
      expect(body.session.audio).toBeUndefined();
    });

    it('throws when no client secret is returned', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));

      const client = new OpenAIClient();
      await expect(client.createRealtimeSession()).rejects.toThrow(OpenAIClientError);
    });
  });
});

describe('extractTextFromResponsesPayload', () => {
  it('throws on error payloads', () => {
    expect(() =>
      extractTextFromResponsesPayload({ error: { message: 'rate limited' } }),
    ).toThrow(/rate limited/);
  });

  it('throws on incomplete responses with the reason attached', () => {
    expect(() =>
      extractTextFromResponsesPayload({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    ).toThrow(/max_output_tokens/);
  });

  it('collects text from output content parts', () => {
    const text = extractTextFromResponsesPayload({
      status: 'completed',
      output: [
        { content: [{ type: 'output_text', text: 'part one' }] },
        { content: [{ type: 'output_text', text: 'part two' }] },
      ],
    });
    expect(text).toBe('part one\npart two');
  });

  it('throws on non-object payloads', () => {
    expect(() => extractTextFromResponsesPayload(null)).toThrow(OpenAIClientError);
  });
});
