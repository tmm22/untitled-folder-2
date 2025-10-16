import type { AccountPayload } from '@/lib/account/types';
import type { PlanTier } from './types';

const PROVISIONING_PLAN_TIERS: readonly PlanTier[] = ['starter', 'pro', 'enterprise'];

function isProvisioningPlanTier(value: AccountPayload['planTier']): value is PlanTier {
  return (PROVISIONING_PLAN_TIERS as readonly string[]).includes(value);
}

export function hasProvisioningAccess(
  account: AccountPayload,
): account is AccountPayload & { planTier: PlanTier } {
  if (!isProvisioningPlanTier(account.planTier)) {
    return false;
  }

  if (account.billingStatus !== 'active') {
    return false;
  }

  return true;
}
