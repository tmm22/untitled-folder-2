import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { AccountBootstrapper, __dangerous__resetAccountBootstrapper } from '@/components/account/AccountBootstrapper';
import { useAccountStore, __dangerous__resetAccountSyncState } from '@/modules/account/store';
import type { AccountPayload } from '@/lib/account/types';
import { __setMockClerkState } from '@clerk/nextjs';
import { __setMockServerAuthState } from '@clerk/nextjs/server';

const mockSyncAuthenticatedUser = vi.fn<[], Promise<unknown>>();

vi.mock('@/lib/auth/client', () => ({
  syncAuthenticatedUser: () => mockSyncAuthenticatedUser(),
}));

const mockFetchAccount = vi.fn<[], Promise<AccountPayload>>();

vi.mock('@/lib/account/client', () => ({
  fetchAccount: (...args: unknown[]) => mockFetchAccount(...(args as [])),
}));

describe('AccountBootstrapper', () => {
  beforeEach(() => {
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

  it('initializes guest users without invoking Clerk sync', async () => {
    render(<AccountBootstrapper />);

    await waitFor(() => {
      expect(useAccountStore.getState().userId).not.toBe('');
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
    });
  });
});
