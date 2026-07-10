import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveProviderAdapterMock } = vi.hoisted(() => ({
  resolveProviderAdapterMock: vi.fn(),
}));

vi.mock('@/lib/providers', () => ({
  resolveProviderAdapter: resolveProviderAdapterMock,
}));

import { POST } from '@/app/api/providers/[provider]/synthesize/route';

const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4]);
const AUDIO_BASE64 = Buffer.from(AUDIO_BYTES).toString('base64');

function buildRequest(options: { accept?: string; userId?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.accept) {
    headers.set('accept', options.accept);
  }
  if (options.userId) {
    headers.set('authorization', `Bearer dev:${options.userId}`);
  }
  return new Request('http://localhost/api/providers/openAI/synthesize', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: 'Hello world',
      voiceId: 'alloy',
      settings: { format: 'mp3', speed: 1, styleValues: {}, volume: 0.75, sampleRate: 44100 },
    }),
  });
}

const routeContext = { params: Promise.resolve({ provider: 'openAI' }) };

describe('synthesize route content negotiation', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_TOKENS = '1';
    resolveProviderAdapterMock.mockReset();
  });

  afterEach(() => {
    delete process.env.AUTH_DEV_TOKENS;
  });

  it('rejects unverified callers without their own credential', async () => {
    const response = await POST(buildRequest(), routeContext);
    expect(response.status).toBe(401);
    expect(resolveProviderAdapterMock).not.toHaveBeenCalled();
  });

  it('streams binary audio when the client accepts audio and the adapter can stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(AUDIO_BYTES);
        controller.close();
      },
    });
    resolveProviderAdapterMock.mockReturnValue({
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(async () => ({
        stream,
        contentType: 'audio/mpeg',
        requestId: 'req-stream',
      })),
    });

    const response = await POST(buildRequest({ accept: 'audio/mpeg', userId: 'user-1' }), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('X-Request-Id')).toBe('req-stream');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([...AUDIO_BYTES]);
  });

  it('falls back to buffered binary when the adapter cannot stream', async () => {
    resolveProviderAdapterMock.mockReturnValue({
      synthesize: vi.fn(async () => ({
        audioBase64: AUDIO_BASE64,
        audioContentType: 'audio/wav',
        requestId: 'req-buffered',
      })),
      synthesizeStream: vi.fn(async () => null),
    });

    const response = await POST(buildRequest({ accept: 'audio/mpeg', userId: 'user-1' }), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(response.headers.get('Content-Length')).toBe(String(AUDIO_BYTES.byteLength));
    expect(response.headers.get('X-Request-Id')).toBe('req-buffered');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([...AUDIO_BYTES]);
  });

  it('returns the legacy JSON shape when the client does not accept audio', async () => {
    resolveProviderAdapterMock.mockReturnValue({
      synthesize: vi.fn(async () => ({
        audioBase64: AUDIO_BASE64,
        audioContentType: 'audio/mpeg',
        requestId: 'req-json',
      })),
    });

    const response = await POST(buildRequest({ accept: 'application/json', userId: 'user-1' }), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = (await response.json()) as { audioBase64: string; requestId: string };
    expect(body.audioBase64).toBe(AUDIO_BASE64);
    expect(body.requestId).toBe('req-json');
  });
});
