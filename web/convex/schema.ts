import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  provisioning_credentials: defineTable({
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
  })
    .index('by_credential_id', ['id'])
    .index('by_user_provider', ['userId', 'provider'])
    .index('by_status', ['status']),

  provisioning_usage: defineTable({
    id: v.string(),
    userId: v.string(),
    provider: v.string(),
    tokensUsed: v.number(),
    costMinorUnits: v.number(),
    recordedAt: v.number(),
  }).index('by_user', ['userId']),

  accounts: defineTable({
    userId: v.string(),
    planTier: v.string(),
    billingStatus: v.string(),
    premiumExpiresAt: v.optional(v.number()),
    usage: v.object({
      monthTokensUsed: v.number(),
      monthlyAllowance: v.number(),
      lastUpdated: v.number(),
    }),
  }).index('by_user', ['userId']),

  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_clerk_id', ['clerkId']),

  history_entries: defineTable({
    id: v.string(),
    userId: v.string(),
    provider: v.string(),
    voiceId: v.string(),
    text: v.string(),
    createdAt: v.string(),
    durationMs: v.number(),
    transcript: v.optional(v.any()),
  })
    .index('by_user', ['userId'])
    .index('by_user_entry', ['userId', 'id']),

  sessions: defineTable({
    id: v.string(),
    secret: v.string(),
    expiresAt: v.number(),
  }).index('by_session_id', ['id']),
});
