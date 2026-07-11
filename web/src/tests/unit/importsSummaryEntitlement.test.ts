import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from 'vitest';
import type { ImportTransportResponse } from '@/lib/imports/fetcher';

let POST: typeof import('@/app/api/imports/route').POST;
let fetcherTestHooks: typeof import('@/lib/imports/fetcher').__test;

const { resolveIdentityMock, summariseTextMock, resolveAuthorizationMock } = vi.hoisted(() => ({
  resolveIdentityMock: vi.fn(),
  summariseTextMock: vi.fn(),
  resolveAuthorizationMock: vi.fn(),
}));

vi.mock('@/lib/auth/identity', () => ({
  resolveRequestIdentity: resolveIdentityMock,
}));

vi.mock('@/lib/pipelines/openai', () => ({
  summariseText: summariseTextMock,
}));

vi.mock('@/app/api/_lib/providerAuth', () => ({
  resolveProviderAuthorization: resolveAuthorizationMock,
}));

const transportMock = vi.fn<(url: URL, headers: Record<string, string>) => Promise<ImportTransportResponse>>();

beforeAll(async () => {
  ({ POST } = await import('@/app/api/imports/route'));
  ({ __test: fetcherTestHooks } = await import('@/lib/imports/fetcher'));
});

function buildRequest() {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://example.com/article' }),
  });
}

describe('/api/imports summary entitlement', () => {
  beforeEach(() => {
    resolveIdentityMock.mockReset();
    resolveIdentityMock.mockReturnValue({ userId: 'user-1', isVerified: true, source: 'clerk' });
    summariseTextMock.mockReset();
    summariseTextMock.mockResolvedValue('An OpenAI summary.');
    resolveAuthorizationMock.mockReset();
    transportMock.mockReset();
    transportMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: {},
      body: '<html><article>Example article body with plenty of content.</article></html>',
    });
    fetcherTestHooks.setTransport(transportMock);
    process.env.IMPORTS_DISABLE_DNS_CHECK = '1';
  });

  afterEach(() => {
    fetcherTestHooks.setTransport(null);
    delete process.env.IMPORTS_DISABLE_DNS_CHECK;
  });

  it('summarises with the caller BYOK key', async () => {
    resolveAuthorizationMock.mockResolvedValue({ apiKey: 'sk-byok' });

    const response = await POST(buildRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary).toBe('An OpenAI summary.');
    expect(payload.summaryEngine).toBe('openai');
    expect(summariseTextMock).toHaveBeenCalledWith(expect.any(String), { apiKey: 'sk-byok' });
  });

  it('summarises with the server key for managed credential holders', async () => {
    resolveAuthorizationMock.mockResolvedValue({
      managedCredential: { source: 'provisioned', credentialId: 'c1', token: 'tts-proxy-x', expiresAt: 1 },
    });

    const response = await POST(buildRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary).toBe('An OpenAI summary.');
    expect(payload.summaryEngine).toBe('openai');
    expect(summariseTextMock).toHaveBeenCalledWith(expect.any(String));
  });

  it('returns content without a summary for callers with no entitlement', async () => {
    resolveAuthorizationMock.mockResolvedValue({});

    const response = await POST(buildRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain('Example article body');
    expect(payload.summary).toBeUndefined();
    expect(payload.summaryEngine).toBeUndefined();
    expect(summariseTextMock).not.toHaveBeenCalled();
  });
});
