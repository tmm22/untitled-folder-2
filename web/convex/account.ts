import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type AccountDoc = Doc<'accounts'>;
type AccountInsert = Omit<AccountDoc, '_id' | '_creationTime'>;

const accountResult = v.object({
  account: v.object({
    _id: v.optional(v.id('accounts')),
    _creationTime: v.optional(v.number()),
    userId: v.string(),
    planTier: v.string(),
    billingStatus: v.string(),
    premiumExpiresAt: v.optional(v.number()),
    polarCustomerId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    polarPlanId: v.optional(v.string()),
    polarCurrentPeriodEnd: v.optional(v.number()),
    polarLastEventId: v.optional(v.string()),
    polarBenefits: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.optional(v.string()),
        }),
      ),
    ),
    usage: v.object({
      monthTokensUsed: v.number(),
      monthlyAllowance: v.number(),
      lastUpdated: v.number(),
    }),
  }),
});

const DEFAULT_FREE_ALLOWANCE = 50_000;
const DEFAULT_STARTER_ALLOWANCE = 200_000;

const allowanceByTier: Record<string, number> = {
  free: DEFAULT_FREE_ALLOWANCE,
  starter: DEFAULT_STARTER_ALLOWANCE,
  pro: 500_000,
  enterprise: 2_000_000,
};

const now = () => Date.now();

function allowanceForTier(tier: string): number {
  return allowanceByTier[tier] ?? DEFAULT_STARTER_ALLOWANCE;
}

function buildDefaultAccount(userId: string): AccountInsert {
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
  } satisfies AccountInsert;
}

async function findAccount(ctx: MutationCtx, userId: string): Promise<AccountDoc | null> {
  return await ctx.db
    .query('accounts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
}

export const getOrCreate = internalMutation({
  args: { userId: v.string() },
  returns: accountResult,
  handler: async (ctx, { userId }) => {
    const existing = await findAccount(ctx, userId);
    if (existing) {
      return { account: existing };
    }

    const account = buildDefaultAccount(userId);
    await ctx.db.insert('accounts', account);
    return { account };
  },
});

export const updateAccount = internalMutation({
  args: {
    payload: v.object({
      userId: v.string(),
      planTier: v.string(),
      billingStatus: v.string(),
      premiumExpiresAt: v.optional(v.number()),
      polarCustomerId: v.optional(v.union(v.string(), v.null())),
      polarSubscriptionId: v.optional(v.union(v.string(), v.null())),
      polarPlanId: v.optional(v.union(v.string(), v.null())),
      polarCurrentPeriodEnd: v.optional(v.union(v.number(), v.null())),
      polarLastEventId: v.optional(v.union(v.string(), v.null())),
      polarBenefits: v.optional(
        v.union(
          v.null(),
          v.array(
            v.object({
              id: v.string(),
              name: v.optional(v.string()),
            }),
          ),
        ),
      ),
    }),
  },
  returns: accountResult,
  handler: async (ctx, { payload }) => {
    const existing = await findAccount(ctx, payload.userId);
    const usage = {
      monthTokensUsed: existing?.usage.monthTokensUsed ?? 0,
      monthlyAllowance: allowanceForTier(payload.planTier),
      lastUpdated: now(),
    };

    const normalizedPayload = {
      polarCustomerId: payload.polarCustomerId ?? undefined,
      polarSubscriptionId: payload.polarSubscriptionId ?? undefined,
      polarPlanId: payload.polarPlanId ?? undefined,
      polarCurrentPeriodEnd: payload.polarCurrentPeriodEnd ?? undefined,
      polarLastEventId: payload.polarLastEventId ?? undefined,
      polarBenefits: payload.polarBenefits ?? undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        planTier: payload.planTier,
        billingStatus: payload.billingStatus,
        premiumExpiresAt: payload.premiumExpiresAt ?? undefined,
        polarCustomerId: normalizedPayload.polarCustomerId ?? existing.polarCustomerId ?? undefined,
        polarSubscriptionId: normalizedPayload.polarSubscriptionId ?? existing.polarSubscriptionId ?? undefined,
        polarPlanId: normalizedPayload.polarPlanId ?? existing.polarPlanId ?? undefined,
        polarCurrentPeriodEnd:
          normalizedPayload.polarCurrentPeriodEnd ?? existing.polarCurrentPeriodEnd ?? undefined,
        polarLastEventId: normalizedPayload.polarLastEventId ?? existing.polarLastEventId ?? undefined,
        polarBenefits: normalizedPayload.polarBenefits ?? existing.polarBenefits ?? undefined,
        usage,
      });
      const updated = await findAccount(ctx, payload.userId);
      return { account: updated! };
    }

    const account: AccountInsert = {
      userId: payload.userId,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt ?? undefined,
      polarCustomerId: normalizedPayload.polarCustomerId,
      polarSubscriptionId: normalizedPayload.polarSubscriptionId,
      polarPlanId: normalizedPayload.polarPlanId,
      polarCurrentPeriodEnd: normalizedPayload.polarCurrentPeriodEnd,
      polarLastEventId: normalizedPayload.polarLastEventId,
      polarBenefits: normalizedPayload.polarBenefits,
      usage,
    };
    await ctx.db.insert('accounts', account);
    return { account };
  },
});

export const recordUsage = internalMutation({
  args: {
    userId: v.string(),
    provider: v.string(),
    tokensUsed: v.number(),
  },
  returns: accountResult,
  handler: async (ctx, { userId, tokensUsed }) => {
    const existing = await findAccount(ctx, userId);
    const source = existing ?? buildDefaultAccount(userId);
    const usage = {
      monthTokensUsed: (source.usage.monthTokensUsed ?? 0) + tokensUsed,
      monthlyAllowance: allowanceForTier(source.planTier),
      lastUpdated: now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, { usage });
      const updated = await findAccount(ctx, userId);
      return { account: updated! };
    }

    const nextAccount: AccountInsert = { ...source, usage };
    await ctx.db.insert('accounts', nextAccount);
    return { account: nextAccount };
  },
});

const isSameUtcMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

export const reserveUsage = internalMutation({
  args: {
    userId: v.string(),
    provider: v.string(),
    tokensRequested: v.number(),
  },
  returns: v.object({ account: v.union(accountResult.fields.account, v.null()) }),
  handler: async (ctx, { userId, tokensRequested }) => {
    const existing = await findAccount(ctx, userId);
    const source = existing ?? buildDefaultAccount(userId);
    const allowance = allowanceForTier(source.planTier);
    const sameMonth = isSameUtcMonth(new Date(), new Date(source.usage.lastUpdated ?? 0));
    const used = sameMonth ? (source.usage.monthTokensUsed ?? 0) : 0;
    if (!Number.isSafeInteger(tokensRequested) || tokensRequested < 0 || used + tokensRequested > allowance) {
      return { account: null };
    }
    const usage = { monthTokensUsed: used + tokensRequested, monthlyAllowance: allowance, lastUpdated: now() };
    if (existing) {
      await ctx.db.patch(existing._id, { usage });
      return { account: { ...existing, usage } };
    }
    const account: AccountInsert = { ...source, usage };
    await ctx.db.insert('accounts', account);
    return { account };
  },
});

export const releaseUsage = internalMutation({
  args: { userId: v.string(), tokensReserved: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, tokensReserved }) => {
    const existing = await findAccount(ctx, userId);
    if (!existing) return null;
    // A reservation made in a previous UTC month has already been zeroed out
    // by the rollover in reserveUsage; releasing it (and stamping a fresh
    // lastUpdated) would resurrect the old month's usage into the new month.
    if (!isSameUtcMonth(new Date(), new Date(existing.usage.lastUpdated ?? 0))) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      usage: {
        ...existing.usage,
        monthTokensUsed: Math.max(0, existing.usage.monthTokensUsed - Math.max(0, tokensReserved)),
        lastUpdated: now(),
      },
    });
    return null;
  },
});
