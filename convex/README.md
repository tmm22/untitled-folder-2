# Convex Backend Functions

The web client can persist provisioning and account data through Convex when `CONVEX_URL` and
`CONVEX_ADMIN_KEY` are configured. Implement HTTP actions in your Convex project matching the shapes
below, then reference their endpoints through `CONVEX_URL`.

## Provisioning Functions (`convex/provisioning.ts`)
```ts
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const saveCredential = mutation({
  args: {
    record: v.object({
      id: v.string(),
      userId: v.string(),
      provider: v.string(),
      tokenHash: v.string(),
      salt: v.string(),
      scopes: v.array(v.string()),
      planTier: v.string(),
      issuedAt: v.number(),
      expiresAt: v.number(),
      status: v.string(),
      providerReference: v.optional(v.string()),
      metadata: v.optional(v.any()),
      lastRotatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { record }) => {
    await ctx.db.insert('provisioning_credentials', record);
    return { result: true };
  },
});

export const findActiveCredential = query({
  args: { userId: v.string(), provider: v.string() },
  handler: async (ctx, { userId, provider }) => {
    const credential = await ctx.db
      .query('provisioning_credentials')
      .withIndex('by_user_provider', (q) => q.eq('userId', userId).eq('provider', provider))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .order('desc')
      .first();
    return { credential };
  },
});

export const markCredentialRevoked = mutation({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    const credential = await ctx.db
      .query('provisioning_credentials')
      .withIndex('by_id', (q) => q.eq('id', credentialId))
      .first();
    if (!credential) return { result: false };
    await ctx.db.patch(credential._id, { status: 'revoked' });
    return { result: true };
  },
});

export const listCredentials = query({
  args: {},
  handler: async (ctx) => {
    const credentials = await ctx.db.query('provisioning_credentials').collect();
    return { credentials };
  },
});

export const recordUsage = mutation({
  args: {
    entry: v.object({
      id: v.optional(v.string()),
      userId: v.string(),
      provider: v.string(),
      tokensUsed: v.number(),
      costMinorUnits: v.number(),
      recordedAt: v.number(),
    }),
  },
  handler: async (ctx, { entry }) => {
    const id = entry.id ?? crypto.randomUUID();
    const usage = { ...entry, id };
    await ctx.db.insert('provisioning_usage', usage);
    return { usage };
  },
});

export const listUsage = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const usage = await ctx.db
      .query('provisioning_usage')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
    return { usage };
  },
});
```

## Account Functions (`convex/account.ts`)
```ts
import { mutation } from './_generated/server';
import { v } from 'convex/values';

const DEFAULT_ALLOWANCE = 50_000;

export const getOrCreate = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) return { account: existing };

    const account = {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      premiumExpiresAt: null,
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: DEFAULT_ALLOWANCE,
        lastUpdated: Date.now(),
      },
    };
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
    }),
  },
  handler: async (ctx, { payload }) => {
    const current = (await getOrCreate(ctx, { userId: payload.userId })).account;
    const allowance = current.usage.monthlyAllowance;
    const updated = {
      ...current,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt ?? null,
      usage: {
        ...current.usage,
        monthlyAllowance: allowance,
        lastUpdated: Date.now(),
      },
    };
    await ctx.db.insert('accounts', updated);
    return { account: updated };
  },
});

export const recordUsage = mutation({
  args: {
    userId: v.string(),
    provider: v.string(),
    tokensUsed: v.number(),
  },
  handler: async (ctx, { userId, tokensUsed }) => {
    const current = (await getOrCreate(ctx, { userId })).account;
    const updated = {
      ...current,
      usage: {
        ...current.usage,
        monthTokensUsed: (current.usage.monthTokensUsed ?? 0) + tokensUsed,
        lastUpdated: Date.now(),
      },
    };
    await ctx.db.insert('accounts', updated);
    return { account: updated };
  },
});
```

## HTTP Action Mapping
Expose each mutation/query above through Convex HTTP actions (e.g., `convex/http.ts`) so the Next.js
app can POST to `/api/provisioning/*` and `/api/account/*`. Each action should validate the
admin token (e.g., compare to `process.env.CONVEX_ADMIN_KEY`) before invoking the corresponding
function.

For full details see the Convex docs: https://docs.convex.dev/functions/http-actions
