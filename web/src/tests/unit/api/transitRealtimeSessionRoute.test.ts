import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateRealtimeSession, mockResolveRequestIdentity, MockOpenAIClientError, MockOpenAIUnavailableError } =
  vi.hoisted(() => {
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
      mockResolveRequestIdentity: vi.fn(),
      MockOpenAIClientError: HoistedOpenAIClientError,
      MockOpenAIUnavailableError: HoistedOpenAIUnavailableError,
    };
  });

vi.mock('@/lib/openai/client', () => ({
  OpenAIClient: class {
    createRealtimeSession = mockCreateRealtimeSession;
  },
  OpenAIClientError: MockOpenAIClientError,
  OpenAIUnavailableError: MockOpenAIUnavailableError,
}));

vi.mock('@/lib/auth/identity', () => ({
  resolveRequestIdentity: mockResolveRequestIdentity,
}));

import { POST } from '@/app/api/transit/realtime/session/route';

describe('/api/transit/realtime/session', () => {
  beforeEach(() => {
    mockCreateRealtimeSession.mockReset();
    mockResolveRequestIdentity.mockReset();
    mockResolveRequestIdentity.mockReturnValue({ userId: 'user-1', isVerified: true, source: 'clerk' });
    process.env.OPENAI_USE_REALTIME_TRANSIT = 'true';
  });

  it('creates a realtime transcription session when enabled', async () => {
    mockCreateRealtimeSession.mockResolvedValue({
      clientSecret: 'secret',
      expiresAt: 1234,
      model: 'gpt-realtime',
    });

    const response = await POST(
      new Request('https://example.com/api/transit/realtime/session', {
        method: 'POST',
        body: JSON.stringify({ languageHint: 'en' }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(true);
    expect(payload.clientSecret).toBe('secret');
    expect(mockCreateRealtimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transcription' }),
    );
  });

  it('returns 404 when disabled by feature flag', async () => {
    process.env.OPENAI_USE_REALTIME_TRANSIT = 'false';

    const response = await POST(
      new Request('https://example.com/api/transit/realtime/session', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(404);
  });

  it('rejects unverified callers', async () => {
    mockResolveRequestIdentity.mockReturnValue({ userId: null, isVerified: false, source: 'generated' });

    const response = await POST(
      new Request('https://example.com/api/transit/realtime/session', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    expect(mockCreateRealtimeSession).not.toHaveBeenCalled();
  });

  it('maps unavailable errors to 503', async () => {
    mockCreateRealtimeSession.mockRejectedValue(new MockOpenAIUnavailableError('Missing key'));

    const response = await POST(
      new Request('https://example.com/api/transit/realtime/session', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).toContain('Missing key');
  });
});
