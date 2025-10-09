import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { POST } from '@/app/api/auth/sync/route';
import { __setMockServerAuthState } from '@clerk/nextjs/server';
import * as convexAuth from '@/lib/convexAuth';

describe('POST /api/auth/sync', () => {
  let resolveConvexAuthConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    __setMockServerAuthState({ userId: null });
    resolveConvexAuthConfigSpy = vi.spyOn(convexAuth, 'resolveConvexAuthConfig');
    resolveConvexAuthConfigSpy.mockReset();
  });

  afterEach(() => {
    resolveConvexAuthConfigSpy.mockRestore();
    delete (globalThis as any).fetch;
    delete process.env.CONVEX_URL;
  });

  it('rejects unauthenticated requests', async () => {
    const request = new Request('https://example.com/api/auth/sync', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe('Not authenticated');
  });

  it('skips when Convex configuration is missing', async () => {
    __setMockServerAuthState({ userId: 'user_123' });
    process.env.CONVEX_URL = '';
    resolveConvexAuthConfigSpy.mockReturnValue(null);

    const request = new Request('https://example.com/api/auth/sync', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ user: null, skipped: true });
  });

  it('invokes Convex ensure endpoint with Clerk identity', async () => {
    __setMockServerAuthState({
      userId: 'user_456',
      user: {
        primaryEmailAddress: { emailAddress: 'user@example.com' },
        firstName: 'Unit',
        lastName: 'Test',
        imageUrl: 'https://example.com/avatar.png',
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      },
    });

    process.env.CONVEX_URL = 'https://convex.example.com';
    resolveConvexAuthConfigSpy.mockReturnValue({ token: 'secret', scheme: 'Deployment' });

    const fetchMock = vi.fn().mockResolvedValue(
      new NextResponse(JSON.stringify({ user: { clerkId: 'user_456' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock;

    const request = new Request('https://example.com/api/auth/sync', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ user: { clerkId: 'user_456' } });
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/users/ensure');
    expect(init?.headers?.Authorization).toBe('Deployment secret');
  });
});
