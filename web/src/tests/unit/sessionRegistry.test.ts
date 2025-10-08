import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerSession,
  resolveSessionSecret,
  clearSession,
} from '@/app/api/_lib/sessionRegistry';
import { getSessionStoreKind, resetSessionStoreForTesting } from '@/lib/session';

const BASE64_SECRET = Buffer.from('a'.repeat(32)).toString('base64');

describe('sessionRegistry', () => {
  beforeEach(() => {
    resetSessionStoreForTesting();
    process.env.CONVEX_URL = 'https://example.convex.site';
    process.env.CONVEX_DEPLOYMENT_KEY = 'test-token';
  });

  afterEach(() => {
    resetSessionStoreForTesting();
    delete process.env.CONVEX_URL;
    delete process.env.CONVEX_DEPLOYMENT_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to a local session store when Convex save fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'No matching routes found',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await registerSession('session-1', BASE64_SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSessionStoreKind()).toBe('memory');

    const secret = await resolveSessionSecret('session-1');
    expect(secret).not.toBeNull();
    expect((secret as Uint8Array).length).toBeGreaterThan(0);

    await clearSession('session-1');
  });
});
