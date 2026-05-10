import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateRealtimeSession, MockOpenAIClientError, MockOpenAIUnavailableError } = vi.hoisted(() => {
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

import { POST } from '@/app/api/transit/realtime/session/route';

describe('/api/transit/realtime/session', () => {
  beforeEach(() => {
    mockCreateRealtimeSession.mockReset();
    process.env.OPENAI_USE_REALTIME_TRANSIT = 'true';
  });

  it('creates a realtime session when enabled', async () => {
    mockCreateRealtimeSession.mockResolvedValue({
      id: 'sess_1',
      model: 'gpt-4o-realtime-preview',
      client_secret: { value: 'secret' },
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
    expect(payload.session.id).toBe('sess_1');
    expect(mockCreateRealtimeSession).toHaveBeenCalled();
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
