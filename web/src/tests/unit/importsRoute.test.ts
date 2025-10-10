import { describe, it, beforeEach, afterEach, beforeAll, expect, vi } from 'vitest';

let POST: typeof import('@/app/api/imports/route').POST;

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
const originalFetch = globalThis.fetch;

vi.mock('node:dns/promises', async () => {
  const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');
  return {
    ...actual,
    lookup: lookupMock,
  };
});

beforeAll(async () => {
  ({ POST } = await import('@/app/api/imports/route'));
});

describe('/api/imports SSRF guard', () => {
  const originalEnv = {
    IMPORTS_ALLOWED_HOSTS: process.env.IMPORTS_ALLOWED_HOSTS,
    IMPORTS_DISABLE_DNS_CHECK: process.env.IMPORTS_DISABLE_DNS_CHECK,
  };

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    process.env.IMPORTS_ALLOWED_HOSTS = originalEnv.IMPORTS_ALLOWED_HOSTS ?? '';
    process.env.IMPORTS_DISABLE_DNS_CHECK = '1';
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
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
    globalThis.fetch = originalFetch;
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
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('allows permitted hosts and limits content size', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    (globalThis.fetch as unknown as vi.Mock).mockResolvedValue(
      new Response('<html><article>Example</article></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain('Example');
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('rejects overly large responses', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const largeBody = 'a'.repeat(1_000_001);
    (globalThis.fetch as unknown as vi.Mock).mockResolvedValue(
      new Response(largeBody, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/content' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it('follows safe redirects on the same host', async () => {
    const fetchMock = globalThis.fetch as unknown as vi.Mock;
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { location: 'https://example.com/final' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response('<html><article>Redirected</article></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com/start' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain('Redirected');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
