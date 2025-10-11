import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAccountRepository,
  getAccountRepositoryKind,
  resetAccountRepositoryForTesting,
} from '@/app/api/account/context';
import { fetchMutation } from 'convex/nextjs';

vi.mock('convex/nextjs', () => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
}));

describe('account repository context', () => {
  beforeEach(() => {
    resetAccountRepositoryForTesting();
    process.env.CONVEX_URL = 'https://example.convex.cloud';
    process.env.CONVEX_DEPLOYMENT_KEY = 'test-token';
    (fetchMutation as unknown as vi.Mock).mockReset();
  });

  afterEach(() => {
    resetAccountRepositoryForTesting();
    delete process.env.CONVEX_URL;
    delete process.env.CONVEX_DEPLOYMENT_KEY;
    vi.restoreAllMocks();
  });

  it('falls back to the in-memory repository when Convex responds with 404', async () => {
    const fetchMutationMock = fetchMutation as unknown as vi.Mock;
    fetchMutationMock.mockRejectedValue(new Error('Convex account request failed: No matching routes found'));

    const repository = getAccountRepository();
    const account = await repository.getOrCreate('user-1');

    expect(account.userId).toBe('user-1');
    expect(getAccountRepositoryKind()).toBe('in-memory');
    expect(fetchMutationMock).toHaveBeenCalledTimes(1);

    fetchMutationMock.mockClear();
    await repository.getOrCreate('user-1');
    expect(fetchMutationMock).not.toHaveBeenCalled();
  });
});
