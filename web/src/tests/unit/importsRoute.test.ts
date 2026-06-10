import { describe, it, beforeEach, afterEach, beforeAll, expect, vi } from 'vitest';
import type { ImportTransportResponse } from '@/lib/imports/fetcher';

let POST: typeof import('@/app/api/imports/route').POST;
let fetcherTestHooks: typeof import('@/lib/imports/fetcher').__test;

const { lookupMock, resolveIdentityMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  resolveIdentityMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => {
  return {
    lookup: lookupMock,
    default: { lookup: lookupMock },
  };
});

vi.mock('@/lib/auth/identity', () => ({
  resolveRequestIdentity: resolveIdentityMock,
}));

const transportMock = vi.fn<(url: URL, headers: Record<string, string>) => Promise<ImportTransportResponse>>();

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}): ImportTransportResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    body,
  };
}

beforeAll(async () => {
  ({ POST } = await import('@/app/api/imports/route'));
  ({ __test: fetcherTestHooks } = await import('@/lib/imports/fetcher'));
});

describe('/api/imports SSRF guard', () => {
  const originalEnv = {
    IMPORTS_ALLOWED_HOSTS: process.env.IMPORTS_ALLOWED_HOSTS,
    IMPORTS_DISABLE_DNS_CHECK: process.env.IMPORTS_DISABLE_DNS_CHECK,
  };

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    resolveIdentityMock.mockReset();
    resolveIdentityMock.mockReturnValue({ userId: 'user-1', isVerified: true, source: 'clerk' });
    transportMock.mockReset();
    fetcherTestHooks.setTransport(transportMock);
    process.env.IMPORTS_ALLOWED_HOSTS = originalEnv.IMPORTS_ALLOWED_HOSTS ?? '';
    process.env.IMPORTS_DISABLE_DNS_CHECK = '1';
  });

  afterEach(() => {
    fetcherTestHooks.setTransport(null);
    if (originalEnv.IMPORTS_ALLOWED_HOSTS !== undefined) {
      process.env.IMPORTS_ALLOWED_HOSTS = originalEnv.IMPORTS_ALLOWED_HOSTS;
    } else {
      delete process.env.IMPORTS_ALLOWED_HOSTS;
    }
    if (originalEnv.IMPORTS_DISABLE_DNS_CHECK !== undefined) {
      process.env.IMPORTS_DISABLE_DNS_CHECK = originalEnv.IMPORTS_DISABLE_DNS_CHECK;
    } else {
      delete process.env.IMPORTS_DISABLE_DNS_CHECK;
    }
  });

  it('rejects unauthenticated requests', async () => {
    resolveIdentityMock.mockReturnValue({ userId: null, isVerified: false, source: 'generated' });
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(transportMock).not.toHaveBeenCalled();
  });

  it('rejects unverified cookie identities', async () => {
    resolveIdentityMock.mockReturnValue({ userId: 'guest-1', isVerified: false, source: 'cookie' });
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(transportMock).not.toHaveBeenCalled();
  });

  it('rejects localhost imports', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost/example' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(transportMock).not.toHaveBeenCalled();
  });

  it('rejects literal private IP addresses without a DNS lookup', async () => {
    delete process.env.IMPORTS_DISABLE_DNS_CHECK;
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(transportMock).not.toHaveBeenCalled();
  });

  it('rejects hosts outside the configured allowlist', async () => {
    process.env.IMPORTS_ALLOWED_HOSTS = 'allowed.com';
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://notallowed.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(transportMock).not.toHaveBeenCalled();
  });

  it('allows permitted hosts and limits content size', async () => {
    transportMock.mockResolvedValue(htmlResponse('<html><article>Example</article></html>'));

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain('Example');
    expect(transportMock).toHaveBeenCalled();
  });

  it('rejects overly large responses', async () => {
    const largeBody = 'a'.repeat(1_000_001);
    transportMock.mockResolvedValue(htmlResponse(largeBody));

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it('follows safe redirects on the same host', async () => {
    transportMock.mockResolvedValueOnce(htmlResponse('', 301, { location: 'https://example.com/final' }));
    transportMock.mockResolvedValueOnce(htmlResponse('<html><article>Redirected</article></html>'));

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/start' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain('Redirected');
    expect(transportMock).toHaveBeenCalledTimes(2);
  });

  it('blocks redirects to private hosts', async () => {
    delete process.env.IMPORTS_DISABLE_DNS_CHECK;
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    transportMock.mockResolvedValueOnce(htmlResponse('', 302, { location: 'http://127.0.0.1/admin' }));

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/start' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(transportMock).toHaveBeenCalledTimes(1);
  });
});
