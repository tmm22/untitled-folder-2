import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

type CredentialMetadata = {
  description?: string;
  source?: string;
  planTier?: string;
  scopes?: string[];
};

type CredentialRecord = {
  id: string;
  userId: string;
  provider: string;
  tokenHash: string;
  salt: string;
  scopes: string[];
  planTier: string;
  issuedAt: number;
  expiresAt: number;
  status: string;
  providerReference?: string;
  metadata?: CredentialMetadata;
  lastRotatedAt?: number;
};

type UsageRecord = {
  id: string;
  userId: string;
  provider: string;
  tokensUsed: number;
  costMinorUnits: number;
  recordedAt: number;
};

const credentialMetadataValidator = v.optional(
  v.object({
    description: v.optional(v.string()),
    source: v.optional(v.string()),
    planTier: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
  }),
);

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
      metadata: credentialMetadataValidator,
      lastRotatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { record }) => {
    const existing = await ctx.db
      .query('provisioning_credentials')
      .withIndex('by_credential_id', (q) => q.eq('id', record.id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, record);
    } else {
      await ctx.db.insert('provisioning_credentials', record as CredentialRecord);
    }

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
      .withIndex('by_credential_id', (q) => q.eq('id', credentialId))
      .first();
    if (credential) {
      await ctx.db.patch(credential._id, { status: 'revoked' });
      return { result: true };
    }
    return { result: false };
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
    const usage: UsageRecord = { ...entry, id };
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
