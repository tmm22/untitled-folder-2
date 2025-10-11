import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/auth/sync/route';
import { __setMockServerAuthState } from '@/tests/mocks/clerkNextjsServerMock';
import * as convexAuth from '@/lib/convexAuth';
import { fetchMutation } from 'convex/nextjs';

vi.mock('convex/nextjs', () => ({
  fetchMutation: vi.fn(),
}));

describe('POST /api/auth/sync', () => {
  let resolveConvexAuthConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    __setMockServerAuthState({ userId: null });
    resolveConvexAuthConfigSpy = vi.spyOn(convexAuth, 'resolveConvexAuthConfig');
    resolveConvexAuthConfigSpy.mockReset();
    (fetchMutation as unknown as vi.Mock).mockReset();
  });

  afterEach(() => {
    resolveConvexAuthConfigSpy.mockRestore();
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

    const fetchMutationMock = fetchMutation as unknown as vi.Mock;
    fetchMutationMock.mockResolvedValue({ user: { clerkId: 'user_456' } });

    const request = new Request('https://example.com/api/auth/sync', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ user: { clerkId: 'user_456' } });
    expect(fetchMutationMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        clerkId: 'user_456',
        email: 'user@example.com',
        firstName: 'Unit',
        lastName: 'Test',
        imageUrl: 'https://example.com/avatar.png',
      },
      expect.objectContaining({
        adminToken: 'secret',
        url: 'https://convex.example.com',
      }),
    );
  });
});
