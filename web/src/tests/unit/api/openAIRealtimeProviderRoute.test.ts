import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateRealtimeSession,
  mockResolveProviderAuthorization,
  mockResolveRequestIdentity,
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
    mockResolveRequestIdentity: vi.fn(),
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

vi.mock('@/lib/auth/identity', () => ({
  resolveRequestIdentity: mockResolveRequestIdentity,
}));

import { POST } from '@/app/api/providers/[provider]/realtime/session/route';

describe('/api/providers/[provider]/realtime/session', () => {
  beforeEach(() => {
    mockCreateRealtimeSession.mockReset();
    mockResolveProviderAuthorization.mockReset();
    mockResolveProviderAuthorization.mockResolvedValue({ apiKey: 'test-key' });
    mockResolveRequestIdentity.mockReset();
    mockResolveRequestIdentity.mockReturnValue({ userId: 'user-1', isVerified: true, source: 'clerk' });
    process.env.OPENAI_USE_REALTIME_TTS = 'true';
  });

  it('creates openai realtime sessions when enabled', async () => {
    mockCreateRealtimeSession.mockResolvedValue({
      clientSecret: 'secret',
      expiresAt: 1234,
      model: 'gpt-realtime',
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
    expect(payload.clientSecret).toBe('secret');
    expect(payload.model).toBe('gpt-realtime');
    expect(mockResolveProviderAuthorization).toHaveBeenCalled();
  });

  it('never sends managed pseudo tokens upstream', async () => {
    mockResolveProviderAuthorization.mockResolvedValue({
      apiKey: undefined,
      managedCredential: { token: 'tts-proxy-pseudo-token' },
    });
    process.env.OPENAI_API_KEY = 'server-key';
    mockCreateRealtimeSession.mockResolvedValue({ clientSecret: 'secret', model: 'gpt-realtime' });

    const response = await POST(
      new Request('https://example.com/api/providers/openAI/realtime/session', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ provider: 'openAI' }) },
    );

    expect(response.status).toBe(200);
    delete process.env.OPENAI_API_KEY;
  });

  it('requires a verified identity when minting on the server key', async () => {
    mockResolveProviderAuthorization.mockResolvedValue({ apiKey: undefined });
    mockResolveRequestIdentity.mockReturnValue({ userId: 'guest-1', isVerified: false, source: 'cookie' });

    const response = await POST(
      new Request('https://example.com/api/providers/openAI/realtime/session', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ provider: 'openAI' }) },
    );

    expect(response.status).toBe(401);
    expect(mockCreateRealtimeSession).not.toHaveBeenCalled();
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
