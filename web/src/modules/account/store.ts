'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanTier } from '@/lib/provisioning';
import { fetchAccount } from '@/lib/account/client';
import type { AccountPayload, AccountUsageSummary } from '@/lib/account/types';

export type BillingStatus = 'free' | 'trial' | 'active' | 'past_due' | 'canceled';
export type AccountPlanTier = PlanTier | 'free';

interface AccountState {
  userId: string;
  planTier: AccountPlanTier;
  billingStatus: BillingStatus;
  premiumExpiresAt?: number;
  hasProvisioningAccess: boolean;
  usageSummary?: AccountUsageSummary;
  actions: {
    initialize: () => Promise<void>;
    applyRemoteAccount: (payload: Partial<AccountUpdatePayload>) => void;
    setPlanTier: (planTier: AccountPlanTier) => void;
    setBillingStatus: (status: BillingStatus) => void;
    setPremiumExpiry: (expiresAt: number | undefined) => void;
    getProvisioningHeaders: () => Record<string, string>;
    refreshFromServer: () => Promise<void>;
    reset: () => void;
  };
}

export interface AccountUpdatePayload {
  userId: string;
  planTier: AccountPlanTier;
  billingStatus: BillingStatus;
  premiumExpiresAt?: number;
  usage?: AccountUsageSummary;
}

const computeProvisioningAccess = (planTier: AccountPlanTier, billingStatus: BillingStatus, premiumExpiresAt?: number): boolean => {
  if (planTier === 'free') {
    return false;
  }
  if (billingStatus === 'active') {
    return true;
  }
  if (billingStatus === 'trial') {
    if (premiumExpiresAt && premiumExpiresAt < Date.now()) {
      return false;
    }
    return true;
  }
  return false;
};

const generateUserId = () => {
  if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && 'randomUUID' in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `user-${Math.random().toString(36).slice(2, 12)}`;
};

const createBaseState = (): AccountState => ({
  userId: '',
  planTier: 'free',
  billingStatus: 'free',
  premiumExpiresAt: undefined,
  hasProvisioningAccess: false,
  usageSummary: undefined,
  actions: {
    initialize: async () => {
      const state = useAccountStore.getState();
      if (!state.userId) {
        const userId = generateUserId();
        useAccountStore.setState((prev) => ({
          ...prev,
          userId,
        }));
      }
      useAccountStore.setState((prev) => ({
        ...prev,
        hasProvisioningAccess: computeProvisioningAccess(prev.planTier, prev.billingStatus, prev.premiumExpiresAt),
      }));
      await ensureServerSync();
    },
    applyRemoteAccount: (payload) => {
      useAccountStore.setState((prev) => {
        const planTier = payload.planTier ?? prev.planTier;
        const billingStatus = payload.billingStatus ?? prev.billingStatus;
        const premiumExpiresAt = payload.premiumExpiresAt ?? prev.premiumExpiresAt;
        return {
          ...prev,
          userId: payload.userId?.trim() || prev.userId || generateUserId(),
          planTier,
          billingStatus,
          premiumExpiresAt,
          hasProvisioningAccess: computeProvisioningAccess(planTier, billingStatus, premiumExpiresAt),
          usageSummary: payload.usage ?? prev.usageSummary,
        };
      });
    },
    setPlanTier: (planTier) => {
      useAccountStore.setState((prev) => ({
        ...prev,
        planTier,
        hasProvisioningAccess: computeProvisioningAccess(planTier, prev.billingStatus, prev.premiumExpiresAt),
      }));
    },
    setBillingStatus: (status) => {
      useAccountStore.setState((prev) => ({
        ...prev,
        billingStatus: status,
        hasProvisioningAccess: computeProvisioningAccess(prev.planTier, status, prev.premiumExpiresAt),
      }));
    },
    setPremiumExpiry: (expiresAt) => {
      useAccountStore.setState((prev) => ({
        ...prev,
        premiumExpiresAt: expiresAt,
        hasProvisioningAccess: computeProvisioningAccess(prev.planTier, prev.billingStatus, expiresAt),
      }));
    },
    refreshFromServer: async () => {
      try {
        const state = useAccountStore.getState();
        const payload = await fetchAccount(state.userId || undefined);
        useAccountStore.getState().actions.applyRemoteAccount(payload as AccountUpdatePayload);
        useAccountStore.setState((prev) => ({ ...prev, usageSummary: payload.usage ?? prev.usageSummary }));
      } catch (error) {
        console.error('Failed to refresh account', error);
      }
    },
    getProvisioningHeaders: () => {
      const state = useAccountStore.getState();
      if (!state.userId || !state.hasProvisioningAccess) {
        return {};
      }
      return {
        'x-account-id': state.userId,
        'x-plan-tier': state.planTier,
        'x-plan-status': state.billingStatus,
      };
    },
    reset: () => {
      useAccountStore.setState({
        userId: '',
        planTier: 'free',
        billingStatus: 'free',
        premiumExpiresAt: undefined,
        hasProvisioningAccess: false,
        usageSummary: undefined,
      });
      hasSyncedOnce = false;
    },
  },
});

export const useAccountStore = create<AccountState>(() => createBaseState());

let hasSyncedOnce = false;

async function ensureServerSync() {
  if (hasSyncedOnce) {
    return;
  }
  hasSyncedOnce = true;
  await useAccountStore.getState().actions.refreshFromServer();
}

export function __dangerous__resetAccountSyncState() {
  hasSyncedOnce = false;
}
