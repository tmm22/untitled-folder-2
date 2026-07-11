import type { DefaultFunctionArgs, FunctionReference } from 'convex/server';
import { fetchMutation, type NextjsOptions } from 'convex/nextjs';
import { internal } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import type { AccountPayload, AccountUsageSummary } from './types';

export interface AccountRepository {
  getOrCreate(userId: string): Promise<AccountPayload>;
  updateAccount(payload: AccountPayload): Promise<AccountPayload>;
  recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload>;
  reserveUsage(userId: string, provider: string, tokensRequested: number): Promise<AccountPayload | null>;
  releaseUsage(userId: string, tokensReserved: number): Promise<void>;
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
  starter: DEFAULT_STARTER_ALLOWANCE,
  pro: 500_000,
  enterprise: 2_000_000,
};

const now = () => Date.now();

const isSameUtcMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

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
    const result = await this.mutation(internal.account.getOrCreate, { userId });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const result = await this.mutation(internal.account.updateAccount, { payload });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const result = await this.mutation(internal.account.recordUsage, { userId, provider, tokensUsed });
    if (!result.account) {
      throw new Error('Convex account request failed: empty account response');
    }
    return result.account as AccountPayload;
  }

  async reserveUsage(userId: string, provider: string, tokensRequested: number): Promise<AccountPayload | null> {
    const result = await this.mutation(internal.account.reserveUsage, { userId, provider, tokensRequested });
    return result.account ? (result.account as AccountPayload) : null;
  }

  async releaseUsage(userId: string, tokensReserved: number): Promise<void> {
    await this.mutation(internal.account.releaseUsage, { userId, tokensReserved });
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

  async reserveUsage(userId: string, provider: string, tokensRequested: number): Promise<AccountPayload | null> {
    let record = this.records.get(userId);
    if (!record) {
      record = {
        userId, planTier: 'free', billingStatus: 'free',
        usage: { monthTokensUsed: 0, monthlyAllowance: DEFAULT_FREE_ALLOWANCE, lastUpdated: now() },
      };
      this.records.set(userId, record);
    }
    const allowance = allowanceByTier[record.planTier] ?? DEFAULT_STARTER_ALLOWANCE;
    const sameMonth = isSameUtcMonth(new Date(), new Date(record.usage?.lastUpdated ?? 0));
    const used = sameMonth ? (record.usage?.monthTokensUsed ?? 0) : 0;
    if (!Number.isSafeInteger(tokensRequested) || tokensRequested < 0 || used + tokensRequested > allowance) return null;
    const updated = { ...record, usage: { monthTokensUsed: used + tokensRequested, monthlyAllowance: allowance, lastUpdated: now() } };
    this.records.set(userId, updated);
    return updated;
  }

  async releaseUsage(userId: string, tokensReserved: number): Promise<void> {
    const record = this.records.get(userId);
    if (!record) return;
    // A reservation from a previous UTC month has already been zeroed by the
    // rollover in reserveUsage; releasing it would resurrect stale usage.
    if (!isSameUtcMonth(new Date(), new Date(record.usage?.lastUpdated ?? 0))) return;
    this.records.set(userId, { ...record, usage: { ...record.usage, monthTokensUsed: Math.max(0, record.usage.monthTokensUsed - Math.max(0, tokensReserved)), lastUpdated: now() } });
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

  async reserveUsage(userId: string, provider: string, tokensRequested: number): Promise<AccountPayload | null> {
    if (tokensRequested < 0 || tokensRequested > DEFAULT_FREE_ALLOWANCE) return null;
    return this.recordUsage(userId, provider, tokensRequested);
  }

  async releaseUsage(): Promise<void> {}
}
