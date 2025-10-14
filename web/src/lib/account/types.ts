export type AccountBillingStatus = 'free' | 'trial' | 'active' | 'past_due' | 'canceled';
export type AccountPlanTier = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';

export interface AccountUsageSummary {
  monthTokensUsed: number;
  monthlyAllowance: number;
  lastUpdated: number;
}

export interface AccountBenefitSummary {
  id: string;
  name?: string;
}

export interface AccountPayload {
  userId: string;
  planTier: AccountPlanTier;
  billingStatus: AccountBillingStatus;
  premiumExpiresAt?: number;
  usage?: AccountUsageSummary;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  polarPlanId?: string;
  polarCurrentPeriodEnd?: number;
  polarLastEventId?: string;
  polarBenefits?: AccountBenefitSummary[];
}
