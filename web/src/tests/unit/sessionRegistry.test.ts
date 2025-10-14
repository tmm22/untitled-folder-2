import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerSession,
  resolveSessionSecret,
  clearSession,
} from '@/app/api/_lib/sessionRegistry';
import { getSessionStoreKind, resetSessionStoreForTesting } from '@/lib/session';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

vi.mock('convex/nextjs', () => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
}));

const BASE64_SECRET = Buffer.from('a'.repeat(32)).toString('base64');

describe('sessionRegistry', () => {
  beforeEach(() => {
    resetSessionStoreForTesting();
    process.env.CONVEX_URL = 'https://example.convex.cloud';
    process.env.CONVEX_DEPLOYMENT_KEY = 'test-token';
    (fetchMutation as unknown as vi.Mock).mockReset();
    (fetchQuery as unknown as vi.Mock).mockReset();
  });

  afterEach(() => {
    resetSessionStoreForTesting();
    delete process.env.CONVEX_URL;
    delete process.env.CONVEX_DEPLOYMENT_KEY;
    vi.restoreAllMocks();
  });

  it('falls back to a local session store when Convex save fails', async () => {
    const fetchMutationMock = fetchMutation as unknown as vi.Mock;
    fetchMutationMock.mockRejectedValue(new Error('Convex session request failed: No matching routes found'));

    await registerSession('session-1', BASE64_SECRET);
    expect(fetchMutationMock).toHaveBeenCalledTimes(1);
    expect(getSessionStoreKind()).toBe('memory');

    const secret = await resolveSessionSecret('session-1');
    expect(secret).not.toBeNull();
    expect((secret as Uint8Array).length).toBeGreaterThan(0);

    await clearSession('session-1');
  });
  it('strips Convex metadata when extending a session expiry', async () => {
    const fetchMutationMock = fetchMutation as unknown as vi.Mock;
    const fetchQueryMock = fetchQuery as unknown as vi.Mock;

    const expiresSoon = Date.now() + 1_000;
    fetchQueryMock.mockResolvedValue({
      session: {
        id: 'session-1',
        secret: BASE64_SECRET,
        expiresAt: expiresSoon,
        _id: 'convex-doc-id',
        _creationTime: Date.now(),
      },
    });

    fetchMutationMock.mockResolvedValue({ result: true });

    const secret = await resolveSessionSecret('session-1');
    expect(secret).not.toBeNull();

    expect(fetchMutationMock).toHaveBeenCalledTimes(1);
    const [, args] = fetchMutationMock.mock.calls[0];
    expect(args).toHaveProperty('record');
    expect(args.record).toMatchObject({
      id: 'session-1',
      secret: BASE64_SECRET,
    });
    expect(typeof args.record.expiresAt).toBe('number');
    expect(Object.keys(args.record)).toEqual(['id', 'secret', 'expiresAt']);
  });
});
