import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

const MAX_TRANSIT_TRANSCRIPTS = 200;

type TranscriptDoc = Doc<'transit_transcripts'>;
type CalendarTokenDoc = Doc<'transit_calendar_tokens'>;

const segmentSchema = v.object({
  index: v.number(),
  startMs: v.number(),
  endMs: v.number(),
  text: v.string(),
});

const actionItemSchema = v.object({
  text: v.string(),
  ownerHint: v.optional(v.string()),
  dueDateHint: v.optional(v.string()),
});

const scheduleRecommendationSchema = v.object({
  title: v.string(),
  startWindow: v.optional(v.string()),
  durationMinutes: v.optional(v.number()),
  participants: v.optional(v.array(v.string())),
});

const summarySchema = v.object({
  summary: v.string(),
  actionItems: v.array(actionItemSchema),
  scheduleRecommendation: v.optional(scheduleRecommendationSchema),
});

const mapTranscript = (doc: TranscriptDoc) => ({
  id: doc.transcriptId,
  title: doc.title,
  transcript: doc.transcript,
  segments: doc.segments,
  summary: doc.summary ?? null,
  language: doc.language ?? null,
  durationMs: doc.durationMs,
  confidence: doc.confidence ?? undefined,
  createdAt: doc.createdAt,
  source: doc.source as 'microphone' | 'upload',
});

async function loadTranscripts(ctx: MutationCtx | QueryCtx, userId: string): Promise<TranscriptDoc[]> {
  const entries = await ctx.db
    .query('transit_transcripts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();

  return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function findTranscript(ctx: MutationCtx | QueryCtx, userId: string, transcriptId: string) {
  return await ctx.db
    .query('transit_transcripts')
    .withIndex('by_user_transcript', (q) => q.eq('userId', userId).eq('transcriptId', transcriptId))
    .first();
}

async function enforceTranscriptLimit(ctx: MutationCtx, userId: string) {
  const entries = await loadTranscripts(ctx, userId);
  if (entries.length <= MAX_TRANSIT_TRANSCRIPTS) {
    return;
  }
  const toDelete = entries.slice(MAX_TRANSIT_TRANSCRIPTS);
  await Promise.all(toDelete.map((entry) => ctx.db.delete(entry._id)));
}

export const listTranscripts = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit }) => {
    const entries = await loadTranscripts(ctx, userId);
    const selected = typeof limit === 'number' ? entries.slice(0, Math.max(0, limit)) : entries;
    return selected.map(mapTranscript);
  },
});

export const saveTranscript = mutation({
  args: {
    record: v.object({
      userId: v.string(),
      transcriptId: v.string(),
      title: v.string(),
      transcript: v.string(),
      segments: v.array(segmentSchema),
      summary: v.optional(summarySchema),
      language: v.optional(v.string()),
      durationMs: v.number(),
      confidence: v.optional(v.number()),
      createdAt: v.string(),
      source: v.string(),
    }),
  },
  handler: async (ctx, { record }) => {
    const existing = await findTranscript(ctx, record.userId, record.transcriptId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: record.title,
        transcript: record.transcript,
        segments: record.segments,
        summary: record.summary,
        language: record.language,
        durationMs: record.durationMs,
        confidence: record.confidence,
        createdAt: record.createdAt,
        source: record.source,
      });
      const updated = await ctx.db.get(existing._id);
      return { record: mapTranscript(updated!) };
    }

    await ctx.db.insert('transit_transcripts', {
      userId: record.userId,
      transcriptId: record.transcriptId,
      title: record.title,
      transcript: record.transcript,
      segments: record.segments,
      summary: record.summary ?? undefined,
      language: record.language ?? undefined,
      durationMs: record.durationMs,
      confidence: record.confidence ?? undefined,
      createdAt: record.createdAt,
      source: record.source,
    });

    await enforceTranscriptLimit(ctx, record.userId);

    const inserted = await findTranscript(ctx, record.userId, record.transcriptId);
    return { record: inserted ? mapTranscript(inserted) : null };
  },
});

export const clearTranscripts = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const entries = await ctx.db
      .query('transit_transcripts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));
    return { cleared: entries.length };
  },
});

export const removeTranscript = mutation({
  args: {
    userId: v.string(),
    transcriptId: v.string(),
  },
  handler: async (ctx, { userId, transcriptId }) => {
    const existing = await findTranscript(ctx, userId, transcriptId);
    if (!existing) {
      return { removed: false };
    }
    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});

export const getCalendarToken = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query('transit_calendar_tokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (!existing) {
      return null;
    }
    return {
      encryptedPayload: existing.encryptedPayload,
      expiresAt: existing.expiresAt,
      scope: existing.scope,
      updatedAt: existing.updatedAt,
    };
  },
});

export const setCalendarToken = mutation({
  args: {
    userId: v.string(),
    encryptedPayload: v.string(),
    expiresAt: v.number(),
    scope: v.array(v.string()),
  },
  handler: async (ctx, { userId, encryptedPayload, expiresAt, scope }) => {
    const existing = await ctx.db
      .query('transit_calendar_tokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedPayload,
        expiresAt,
        scope,
        updatedAt: now,
      });
      return { updated: true };
    }

    await ctx.db.insert('transit_calendar_tokens', {
      userId,
      encryptedPayload,
      expiresAt,
      scope,
      updatedAt: now,
    });
    return { updated: false };
  },
});

export const clearCalendarToken = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query('transit_calendar_tokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { cleared: true };
    }
    return { cleared: false };
  },
});
