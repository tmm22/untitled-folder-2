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

  translations: defineTable({
    accountId: v.string(),
    documentId: v.string(),
    translationId: v.string(),
    sequenceIndex: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
    sourceText: v.string(),
    sourceLanguageCode: v.string(),
    targetLanguageCode: v.string(),
    translatedText: v.string(),
    keepOriginalApplied: v.boolean(),
    adoptedAt: v.optional(v.string()),
    provider: v.string(),
    metadata: v.optional(v.any()),
  })
    .index('by_account_document_seq', ['accountId', 'documentId', 'sequenceIndex'])
    .index('by_account_translation', ['accountId', 'translationId']),

  sessions: defineTable({
    id: v.string(),
    secret: v.string(),
    expiresAt: v.number(),
  }).index('by_session_id', ['id']),

  pipelines: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(v.any()),
    schedule: v.optional(v.any()),
    defaultSource: v.optional(v.any()),
    webhookSecret: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastRunAt: v.optional(v.string()),
  })
    .index('by_pipeline_id', ['id'])
    .index('by_name', ['name'])
    .index('by_webhook_secret', ['webhookSecret']),

  transit_transcripts: defineTable({
    userId: v.string(),
    transcriptId: v.string(),
    title: v.string(),
    transcript: v.string(),
    segments: v.array(
      v.object({
        index: v.number(),
        startMs: v.number(),
        endMs: v.number(),
        text: v.string(),
      }),
    ),
    summary: v.optional(
      v.object({
        summary: v.string(),
        actionItems: v.array(
          v.object({
            text: v.string(),
            ownerHint: v.optional(v.string()),
            dueDateHint: v.optional(v.string()),
          }),
        ),
        scheduleRecommendation: v.optional(
          v.object({
            title: v.string(),
            startWindow: v.optional(v.string()),
            durationMinutes: v.optional(v.number()),
            participants: v.optional(v.array(v.string())),
          }),
        ),
      }),
    ),
    language: v.optional(v.string()),
    durationMs: v.number(),
    confidence: v.optional(v.number()),
    createdAt: v.string(),
    source: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_transcript', ['userId', 'transcriptId']),

  transit_calendar_tokens: defineTable({
    userId: v.string(),
    encryptedPayload: v.string(),
    expiresAt: v.number(),
    scope: v.array(v.string()),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
});
