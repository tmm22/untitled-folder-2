import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 1000;

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_LIST_LIMIT));
}

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

export const saveCredential = internalMutation({
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

export const findActiveCredential = internalQuery({
  args: { userId: v.string(), provider: v.string() },
  handler: async (ctx, { userId, provider }) => {
    const credential = await ctx.db
      .query('provisioning_credentials')
      .withIndex('by_user_provider_status', (q) =>
        q.eq('userId', userId).eq('provider', provider).eq('status', 'active'),
      )
      .order('desc')
      .first();

    return { credential };
  },
});

export const markCredentialRevoked = internalMutation({
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

export const listCredentials = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const credentials = await ctx.db.query('provisioning_credentials').take(clampLimit(limit));
    return { credentials };
  },
});

export const recordUsage = internalMutation({
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

export const listUsage = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const usage = await ctx.db
      .query('provisioning_usage')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(clampLimit(limit));
    return { usage };
  },
});
