import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { AccountBootstrapper, __dangerous__resetAccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { useAccountStore, __dangerous__resetAccountSyncState } from '@/modules/account/store';
import type { AccountPayload } from '@/lib/account/types';
import { __setMockClerkState } from '@/tests/mocks/clerkNextjsMock';
import { __setMockServerAuthState } from '@/tests/mocks/clerkNextjsServerMock';

const mockSyncAuthenticatedUser = vi.fn<[], Promise<unknown>>();
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const TEST_PUBLISHABLE_KEY = 'pk_test_1234567890abcdefghijklmnopqrstuvwxyzABCDE';

vi.mock('@/lib/auth/client', () => ({
  syncAuthenticatedUser: () => mockSyncAuthenticatedUser(),
}));

const mockFetchAccount = vi.fn<[], Promise<AccountPayload>>();

vi.mock('@/lib/account/client', () => ({
  fetchAccount: (...args: unknown[]) => mockFetchAccount(...(args as [])),
}));

describe('AccountBootstrapper', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = TEST_PUBLISHABLE_KEY;
    __dangerous__resetAccountBootstrapper();
    __dangerous__resetAccountSyncState();
    useAccountStore.getState().actions.reset();
    mockSyncAuthenticatedUser.mockReset();
    mockFetchAccount.mockReset();
    __setMockClerkState({ isLoaded: true, isSignedIn: false, userId: null, user: null });
    __setMockServerAuthState({ userId: null });
    mockFetchAccount.mockResolvedValue({
      userId: 'server-user',
      planTier: 'free',
      billingStatus: 'free',
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: 50_000,
        lastUpdated: Date.now(),
      },
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_KEY;
  });

  it('initializes guest users without invoking Clerk sync', async () => {
    render(<AccountBootstrapper />);

    await waitFor(() => {
      expect(useAccountStore.getState().userId).not.toBe('');
      expect(useAccountStore.getState().sessionKind).toBe('guest');
    });

    expect(mockSyncAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('calls sync when Clerk session is available', async () => {
    __setMockClerkState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'clerk-user',
      user: { firstName: 'Clara' },
    });
    __setMockServerAuthState({
      userId: 'clerk-user',
      user: {
        id: 'clerk-user',
        firstName: 'Clara',
        lastName: 'Jones',
        emailAddresses: [{ emailAddress: 'clara@example.com' }],
      },
    });
    mockSyncAuthenticatedUser.mockResolvedValue({});

    render(<AccountBootstrapper />);

    await waitFor(() => {
      expect(mockSyncAuthenticatedUser).toHaveBeenCalled();
      expect(useAccountStore.getState().userId).toBe('clerk-user');
      expect(useAccountStore.getState().sessionKind).toBe('authenticated');
    });
  });
});
