'use client';

import { create } from 'zustand';
import type { PlanTier } from '@/lib/provisioning';
import { fetchAccount } from '@/lib/account/client';
import type { AccountBenefitSummary, AccountUsageSummary } from '@/lib/account/types';

export type BillingStatus = 'free' | 'trial' | 'active' | 'past_due' | 'canceled';
export type AccountPlanTier = PlanTier | 'free';

interface AccountState {
  userId: string;
  planTier: AccountPlanTier;
  billingStatus: BillingStatus;
  premiumExpiresAt?: number;
  hasProvisioningAccess: boolean;
  usageSummary?: AccountUsageSummary;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  polarPlanId?: string;
  polarCurrentPeriodEnd?: number;
  polarBenefits?: AccountBenefitSummary[];
  sessionKind: 'guest' | 'authenticated';
  actions: {
    initialize: (preferredUserId?: string) => Promise<void>;
    applyRemoteAccount: (payload: Partial<AccountUpdatePayload>) => void;
    setPlanTier: (planTier: AccountPlanTier) => void;
    setBillingStatus: (status: BillingStatus) => void;
    setPremiumExpiry: (expiresAt: number | undefined) => void;
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
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  polarPlanId?: string;
  polarCurrentPeriodEnd?: number;
  polarBenefits?: AccountBenefitSummary[];
}

const computeProvisioningAccess = (
  planTier: AccountPlanTier,
  billingStatus: BillingStatus,
  premiumExpiresAt?: number,
): boolean => {
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
    return `guest-${window.crypto.randomUUID()}`;
  }
  return `guest-${Math.random().toString(36).slice(2, 12)}`;
};

const baseState = {
  userId: '',
  planTier: 'free' as AccountPlanTier,
  billingStatus: 'free' as BillingStatus,
  premiumExpiresAt: undefined as number | undefined,
  hasProvisioningAccess: false,
  usageSummary: undefined as AccountUsageSummary | undefined,
  polarCustomerId: undefined as string | undefined,
  polarSubscriptionId: undefined as string | undefined,
  polarPlanId: undefined as string | undefined,
  polarCurrentPeriodEnd: undefined as number | undefined,
  polarBenefits: undefined as AccountBenefitSummary[] | undefined,
  sessionKind: 'guest' as 'guest' | 'authenticated',
};

export const useAccountStore = create<AccountState>(() => ({
  ...baseState,
  actions: {
    initialize: async (preferredUserId) => {
      const normalizedPreferred = preferredUserId?.trim();
      let userIdChanged = false;

      useAccountStore.setState((prev) => {
        let nextUserId = prev.userId;
        let nextPlanTier = prev.planTier;
        let nextBillingStatus = prev.billingStatus;
        let nextPremiumExpiresAt = prev.premiumExpiresAt;
        let nextUsageSummary = prev.usageSummary;
        let nextPolarCustomerId = prev.polarCustomerId;
        let nextPolarSubscriptionId = prev.polarSubscriptionId;
        let nextPolarPlanId = prev.polarPlanId;
        let nextPolarCurrentPeriodEnd = prev.polarCurrentPeriodEnd;
        let nextPolarBenefits = prev.polarBenefits;
        let nextSessionKind: 'guest' | 'authenticated' = prev.sessionKind;

        if (normalizedPreferred) {
          if (normalizedPreferred !== prev.userId) {
            nextUserId = normalizedPreferred;
            nextPlanTier = 'free';
            nextBillingStatus = 'free';
            nextPremiumExpiresAt = undefined;
            nextUsageSummary = undefined;
            nextPolarCustomerId = undefined;
            nextPolarSubscriptionId = undefined;
            nextPolarPlanId = undefined;
            nextPolarCurrentPeriodEnd = undefined;
            nextPolarBenefits = undefined;
            userIdChanged = true;
          }
          nextSessionKind = 'authenticated';
        } else {
          const wasAuthenticated = prev.sessionKind === 'authenticated';
          if (!prev.userId || wasAuthenticated) {
            nextUserId = generateUserId();
            nextPlanTier = 'free';
            nextBillingStatus = 'free';
            nextPremiumExpiresAt = undefined;
            nextUsageSummary = undefined;
            nextPolarCustomerId = undefined;
            nextPolarSubscriptionId = undefined;
            nextPolarPlanId = undefined;
            nextPolarCurrentPeriodEnd = undefined;
            nextPolarBenefits = undefined;
            userIdChanged = true;
          }
          nextSessionKind = 'guest';
        }

        return {
          ...prev,
          userId: nextUserId,
          planTier: nextPlanTier,
          billingStatus: nextBillingStatus,
          premiumExpiresAt: nextPremiumExpiresAt,
          usageSummary: nextUsageSummary,
          polarCustomerId: nextPolarCustomerId,
          polarSubscriptionId: nextPolarSubscriptionId,
          polarPlanId: nextPolarPlanId,
          polarCurrentPeriodEnd: nextPolarCurrentPeriodEnd,
          polarBenefits: nextPolarBenefits,
          hasProvisioningAccess: computeProvisioningAccess(nextPlanTier, nextBillingStatus, nextPremiumExpiresAt),
          sessionKind: nextSessionKind,
        };
      });

      const { userId } = useAccountStore.getState();
      if (!userId) {
        return;
      }

      if (userIdChanged) {
        lastSyncedUserId = null;
      }

      await ensureServerSync(userId);
    },
    applyRemoteAccount: (payload) => {
      useAccountStore.setState((prev) => {
        const planTier = payload.planTier ?? prev.planTier;
        const billingStatus = payload.billingStatus ?? prev.billingStatus;
        const premiumExpiresAt = payload.premiumExpiresAt ?? prev.premiumExpiresAt;
        const userId = payload.userId?.trim() || prev.userId || generateUserId();
        const polarCustomerId = payload.polarCustomerId ?? prev.polarCustomerId;
        const polarSubscriptionId = payload.polarSubscriptionId ?? prev.polarSubscriptionId;
        const polarPlanId = payload.polarPlanId ?? prev.polarPlanId;
        const polarCurrentPeriodEnd = payload.polarCurrentPeriodEnd ?? prev.polarCurrentPeriodEnd;
        const polarBenefits = payload.polarBenefits ?? prev.polarBenefits;

        lastSyncedUserId = userId;

        return {
          ...prev,
          userId,
          planTier,
          billingStatus,
          premiumExpiresAt,
          hasProvisioningAccess: computeProvisioningAccess(planTier, billingStatus, premiumExpiresAt),
          usageSummary: payload.usage ?? prev.usageSummary,
          polarCustomerId,
          polarSubscriptionId,
          polarPlanId,
          polarCurrentPeriodEnd,
          polarBenefits,
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
        if (!state.userId) {
          return;
        }
        const payload = await fetchAccount();
        useAccountStore.getState().actions.applyRemoteAccount(payload as AccountUpdatePayload);
        useAccountStore.setState((prev) => ({ ...prev, usageSummary: payload.usage ?? prev.usageSummary }));
      } catch (error) {
        console.error('Failed to refresh account', error);
      }
    },
    reset: () => {
      lastSyncedUserId = null;
      useAccountStore.setState({
        ...baseState,
      });
    },
  },
}));

let lastSyncedUserId: string | null = null;

async function ensureServerSync(explicitUserId?: string) {
  const targetUserId = explicitUserId ?? useAccountStore.getState().userId;
  if (!targetUserId) {
    lastSyncedUserId = null;
    return;
  }
  if (lastSyncedUserId === targetUserId) {
    return;
  }
  lastSyncedUserId = targetUserId;
  await useAccountStore.getState().actions.refreshFromServer();
}

export function __dangerous__resetAccountSyncState() {
  lastSyncedUserId = null;
}
