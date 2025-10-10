import type { AccountPayload } from '@/lib/account/types';
import type { PlanTier } from './types';

const PROVISIONING_PLAN_TIERS: readonly PlanTier[] = ['trial', 'starter', 'pro', 'enterprise'];
const PREMIUM_STATUSES = new Set<AccountPayload['billingStatus']>(['trial', 'active']);

function isProvisioningPlanTier(value: AccountPayload['planTier']): value is PlanTier {
  return (PROVISIONING_PLAN_TIERS as readonly string[]).includes(value);
}

function isTrialExpired(account: AccountPayload): boolean {
  if (account.billingStatus !== 'trial') {
    return false;
  }
  if (typeof account.premiumExpiresAt !== 'number') {
    return false;
  }
  return account.premiumExpiresAt < Date.now();
}

export function hasProvisioningAccess(
  account: AccountPayload,
): account is AccountPayload & { planTier: PlanTier } {
  if (!isProvisioningPlanTier(account.planTier)) {
    return false;
  }

  if (!PREMIUM_STATUSES.has(account.billingStatus)) {
    return false;
  }

  if (isTrialExpired(account)) {
    return false;
  }

  return true;
}
