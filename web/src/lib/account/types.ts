export type AccountBillingStatus = 'free' | 'trial' | 'active' | 'past_due' | 'canceled';
export type AccountPlanTier = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';

export interface AccountUsageSummary {
  monthTokensUsed: number;
  monthlyAllowance: number;
  lastUpdated: number;
}

export interface AccountPayload {
  userId: string;
  planTier: AccountPlanTier;
  billingStatus: AccountBillingStatus;
  premiumExpiresAt?: number;
  usage?: AccountUsageSummary;
}
