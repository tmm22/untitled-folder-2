import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAccountRepository,
  getAccountRepositoryKind,
  resetAccountRepositoryForTesting,
} from '@/app/api/account/context';

describe('account repository context', () => {
  beforeEach(() => {
    resetAccountRepositoryForTesting();
    process.env.CONVEX_URL = 'https://example.convex.site';
    process.env.CONVEX_DEPLOYMENT_KEY = 'test-token';
  });

  afterEach(() => {
    resetAccountRepositoryForTesting();
    delete process.env.CONVEX_URL;
    delete process.env.CONVEX_DEPLOYMENT_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to the in-memory repository when Convex responds with 404', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'No matching routes found',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const repository = getAccountRepository();
    const account = await repository.getOrCreate('user-1');

    expect(account.userId).toBe('user-1');
    expect(getAccountRepositoryKind()).toBe('in-memory');
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fetchMock.mockClear();
    await repository.getOrCreate('user-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
