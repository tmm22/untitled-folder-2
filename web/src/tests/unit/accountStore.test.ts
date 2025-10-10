import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useAccountStore, __dangerous__resetAccountSyncState } from '@/modules/account/store';
import { __dangerous__resetAccountBootstrapper } from '@/components/account/AccountBootstrapper';
import type { AccountPayload } from '@/lib/account/types';

const mockFetchAccount = vi.fn<[], Promise<AccountPayload>>();

vi.mock('@/lib/account/client', () => ({
  fetchAccount: (...args: unknown[]) => mockFetchAccount(...(args as [])),
}));

describe('Account store', () => {
  beforeEach(() => {
    __dangerous__resetAccountSyncState();
    __dangerous__resetAccountBootstrapper();
    mockFetchAccount.mockResolvedValue({
      userId: 'server-user',
      planTier: 'starter',
      billingStatus: 'active',
      premiumExpiresAt: Date.now() + 1_000,
      usage: {
        monthTokensUsed: 1_000,
        monthlyAllowance: 200_000,
        lastUpdated: Date.now(),
      },
    });
    useAccountStore.setState((prev) => ({
      ...prev,
      userId: '',
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: undefined,
      hasProvisioningAccess: false,
      usageSummary: undefined,
      sessionKind: 'guest',
    }));
  });

  it('hydrates from server on initialize', async () => {
    await useAccountStore.getState().actions.initialize();

    const state = useAccountStore.getState();
    expect(state.userId).toBe('server-user');
    expect(state.planTier).toBe('starter');
    expect(state.hasProvisioningAccess).toBe(true);
    expect(state.usageSummary?.monthTokensUsed).toBe(1_000);
    expect(mockFetchAccount).toHaveBeenCalled();
    expect(state.sessionKind).toBe('guest');
  });

  it('prefers provided user id for authenticated sessions', async () => {
    await useAccountStore.getState().actions.initialize('clerk-user');

    expect(mockFetchAccount).toHaveBeenCalled();
    expect(useAccountStore.getState().sessionKind).toBe('authenticated');
  });
});
