import type { DefaultFunctionArgs, FunctionReference } from 'convex/server';
import { fetchMutation, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import type { AccountPayload, AccountUsageSummary } from './types';

export interface AccountRepository {
  getOrCreate(userId: string): Promise<AccountPayload>;
  updateAccount(payload: AccountPayload): Promise<AccountPayload>;
  recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload>;
}

interface ConvexAccountRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

const DEFAULT_FREE_ALLOWANCE = 50_000;
const DEFAULT_STARTER_ALLOWANCE = 200_000;

const allowanceByTier: Record<string, number> = {
  free: DEFAULT_FREE_ALLOWANCE,
  trial: DEFAULT_STARTER_ALLOWANCE,
  starter: DEFAULT_STARTER_ALLOWANCE,
  pro: 500_000,
  enterprise: 2_000_000,
};

const now = () => Date.now();

export class ConvexAccountRepository implements AccountRepository {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexAccountRepositoryOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex account request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex account request failed: ${String(error)}`);
  }

  private async mutation<TArgs extends DefaultFunctionArgs, TResult>(
    reference: FunctionReference<'mutation', any, TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return (await fetchMutation(
        reference as FunctionReference<'mutation', any, DefaultFunctionArgs, TResult>,
        args as DefaultFunctionArgs,
        this.clientOptions,
      )) as TResult;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async getOrCreate(userId: string): Promise<AccountPayload> {
    const result = await this.mutation(api.account.getOrCreate, { userId });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const result = await this.mutation(api.account.updateAccount, { payload });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const result = await this.mutation(api.account.recordUsage, { userId, provider, tokensUsed });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly records = new Map<string, AccountPayload & { usage: AccountUsageSummary }>();

  async getOrCreate(userId: string): Promise<AccountPayload> {
    const existing = this.records.get(userId);
    if (existing) {
      return existing;
    }
    const payload: AccountPayload & { usage: AccountUsageSummary } = {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: undefined,
      polarCustomerId: undefined,
      polarSubscriptionId: undefined,
      polarPlanId: undefined,
      polarCurrentPeriodEnd: undefined,
      polarLastEventId: undefined,
      polarBenefits: undefined,
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
    this.records.set(userId, payload);
    return payload;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const allowance = allowanceByTier[payload.planTier] ?? DEFAULT_STARTER_ALLOWANCE;
    const record = await this.getOrCreate(payload.userId);
    const updated: AccountPayload & { usage: AccountUsageSummary } = {
      ...record,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt,
      polarCustomerId: payload.polarCustomerId ?? record.polarCustomerId,
      polarSubscriptionId: payload.polarSubscriptionId ?? record.polarSubscriptionId,
      polarPlanId: payload.polarPlanId ?? record.polarPlanId,
      polarCurrentPeriodEnd: payload.polarCurrentPeriodEnd ?? record.polarCurrentPeriodEnd,
      polarLastEventId: payload.polarLastEventId ?? record.polarLastEventId,
      polarBenefits: payload.polarBenefits ?? record.polarBenefits,
      usage: {
        monthTokensUsed: record.usage?.monthTokensUsed ?? 0,
        monthlyAllowance: allowance,
        lastUpdated: now(),
      },
    };
    this.records.set(payload.userId, updated);
    return updated;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const record = await this.getOrCreate(userId);
    const allowance = allowanceByTier[record.planTier] ?? DEFAULT_STARTER_ALLOWANCE;
    const updated: AccountPayload & { usage: AccountUsageSummary } = {
      ...record,
      usage: {
        monthTokensUsed: (record.usage?.monthTokensUsed ?? 0) + tokensUsed,
        monthlyAllowance: allowance,
        lastUpdated: now(),
      },
    };
    this.records.set(userId, updated);
    return updated;
  }
}

export class JsonMockAccountRepository implements AccountRepository {
  async getOrCreate(userId: string): Promise<AccountPayload> {
    return {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: undefined,
      polarCustomerId: undefined,
      polarSubscriptionId: undefined,
      polarPlanId: undefined,
      polarCurrentPeriodEnd: undefined,
      polarLastEventId: undefined,
      polarBenefits: undefined,
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    return {
      userId: payload.userId,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt,
      polarCustomerId: payload.polarCustomerId,
      polarSubscriptionId: payload.polarSubscriptionId,
      polarPlanId: payload.polarPlanId,
      polarCurrentPeriodEnd: payload.polarCurrentPeriodEnd,
      polarLastEventId: payload.polarLastEventId,
      polarBenefits: payload.polarBenefits,
      usage: payload.usage ?? {
        monthTokensUsed: 0,
        monthlyAllowance: allowanceByTier[payload.planTier] ?? DEFAULT_STARTER_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    return {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: undefined,
      polarCustomerId: undefined,
      polarSubscriptionId: undefined,
      polarPlanId: undefined,
      polarCurrentPeriodEnd: undefined,
      polarLastEventId: undefined,
      polarBenefits: undefined,
      usage: {
        monthTokensUsed: tokensUsed,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }
}
