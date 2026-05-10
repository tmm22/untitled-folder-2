import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateRealtimeSession,
  mockResolveProviderAuthorization,
  MockOpenAIClientError,
  MockOpenAIUnavailableError,
} = vi.hoisted(() => {
  class HoistedOpenAIClientError extends Error {
    status?: number;
    constructor(message: string, options?: { status?: number }) {
      super(message);
      this.status = options?.status;
    }
  }
  class HoistedOpenAIUnavailableError extends Error {}
  return {
    mockCreateRealtimeSession: vi.fn(),
    mockResolveProviderAuthorization: vi.fn(),
    MockOpenAIClientError: HoistedOpenAIClientError,
    MockOpenAIUnavailableError: HoistedOpenAIUnavailableError,
  };
});

vi.mock('@/lib/openai/client', () => ({
  OpenAIClient: class {
    constructor(_config?: unknown) {}
    createRealtimeSession = mockCreateRealtimeSession;
  },
  OpenAIClientError: MockOpenAIClientError,
  OpenAIUnavailableError: MockOpenAIUnavailableError,
}));

vi.mock('@/app/api/_lib/providerAuth', () => ({
  resolveProviderAuthorization: (...args: unknown[]) => mockResolveProviderAuthorization(...args),
}));

import { POST } from '@/app/api/providers/[provider]/realtime/session/route';

describe('/api/providers/[provider]/realtime/session', () => {
  beforeEach(() => {
    mockCreateRealtimeSession.mockReset();
    mockResolveProviderAuthorization.mockReset();
    mockResolveProviderAuthorization.mockResolvedValue({ apiKey: 'test-key' });
    process.env.OPENAI_USE_REALTIME_TTS = 'true';
  });

  it('creates openai realtime sessions when enabled', async () => {
    mockCreateRealtimeSession.mockResolvedValue({
      id: 'sess_tts_1',
      model: 'gpt-4o-realtime-preview',
      client_secret: { value: 'secret' },
    });

    const response = await POST(
      new Request('https://example.com/api/providers/openAI/realtime/session', {
        method: 'POST',
        body: JSON.stringify({ voice: 'alloy' }),
      }),
      { params: Promise.resolve({ provider: 'openAI' }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(true);
    expect(payload.session.id).toBe('sess_tts_1');
    expect(mockResolveProviderAuthorization).toHaveBeenCalled();
  });

  it('rejects non-openai providers', async () => {
    const response = await POST(
      new Request('https://example.com/api/providers/google/realtime/session', {
        method: 'POST',
      }),
      { params: Promise.resolve({ provider: 'google' }) },
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 when realtime tts feature is disabled', async () => {
    process.env.OPENAI_USE_REALTIME_TTS = 'false';

    const response = await POST(
      new Request('https://example.com/api/providers/openAI/realtime/session', {
        method: 'POST',
      }),
      { params: Promise.resolve({ provider: 'openAI' }) },
    );

    expect(response.status).toBe(404);
  });
});
