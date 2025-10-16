import { mutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type AccountDoc = Doc<'accounts'>;
type AccountInsert = Omit<AccountDoc, '_id' | '_creationTime'>;

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

export const getOrCreate = mutation({
  args: { userId: v.string() },
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

export const updateAccount = mutation({
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

export const recordUsage = mutation({
  args: {
    userId: v.string(),
    provider: v.string(),
    tokensUsed: v.number(),
  },
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
