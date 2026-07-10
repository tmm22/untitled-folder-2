import { internalQuery, internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { generationTranscript } from './validators';

const MAX_HISTORY_ENTRIES = 200;

type HistoryDoc = Doc<'history_entries'>;

const historyEntryResult = v.object({
  id: v.string(),
  userId: v.string(),
  provider: v.string(),
  voiceId: v.string(),
  text: v.string(),
  createdAt: v.string(),
  durationMs: v.number(),
  transcript: v.optional(generationTranscript),
});

const mapHistory = (entry: HistoryDoc) => ({
  id: entry.id,
  userId: entry.userId,
  provider: entry.provider,
  voiceId: entry.voiceId,
  text: entry.text,
  createdAt: entry.createdAt,
  durationMs: entry.durationMs,
  transcript: entry.transcript ?? undefined,
});

async function findEntry(ctx: MutationCtx | QueryCtx, userId: string, id: string): Promise<HistoryDoc | null> {
  return await ctx.db
    .query('history_entries')
    .withIndex('by_user_entry', (q) => q.eq('userId', userId).eq('id', id))
    .first();
}

async function loadEntries(ctx: MutationCtx | QueryCtx, userId: string): Promise<HistoryDoc[]> {
  const entries = await ctx.db
    .query('history_entries')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();

  return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function enforceLimit(ctx: MutationCtx, userId: string) {
  const entries = await loadEntries(ctx, userId);
  if (entries.length <= MAX_HISTORY_ENTRIES) {
    return;
  }
  const toDelete = entries.slice(MAX_HISTORY_ENTRIES);
  await Promise.all(toDelete.map((entry) => ctx.db.delete(entry._id)));
}

export const list = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(historyEntryResult),
  handler: async (ctx, { userId, limit }) => {
    const entries = await loadEntries(ctx, userId);
    const selected = typeof limit === 'number' ? entries.slice(0, Math.max(0, limit)) : entries;
    return selected.map(mapHistory);
  },
});

export const record = internalMutation({
  args: {
    entry: v.object({
      id: v.string(),
      userId: v.string(),
      provider: v.string(),
      voiceId: v.string(),
      text: v.string(),
      createdAt: v.string(),
      durationMs: v.number(),
      transcript: v.optional(generationTranscript),
    }),
  },
  returns: v.object({ entry: historyEntryResult }),
  handler: async (ctx, { entry }) => {
    const existing = await findEntry(ctx, entry.userId, entry.id);
    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: entry.provider,
        voiceId: entry.voiceId,
        text: entry.text,
        createdAt: entry.createdAt,
        durationMs: entry.durationMs,
        transcript: entry.transcript,
      });
      return { entry: mapHistory((await ctx.db.get(existing._id))!) };
    }

    await ctx.db.insert('history_entries', {
      id: entry.id,
      userId: entry.userId,
      provider: entry.provider,
      voiceId: entry.voiceId,
      text: entry.text,
      createdAt: entry.createdAt,
      durationMs: entry.durationMs,
      transcript: entry.transcript,
    });

    await enforceLimit(ctx, entry.userId);
    return { entry };
  },
});

export const remove = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
  },
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx, { userId, id }) => {
    const existing = await findEntry(ctx, userId, id);
    if (existing) {
      await ctx.db.delete(existing._id);
      return { removed: true };
    }
    return { removed: false };
  },
});

export const clear = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({ cleared: v.number() }),
  handler: async (ctx, { userId }) => {
    const entries = await ctx.db
      .query('history_entries')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));
    return { cleared: entries.length };
  },
});

