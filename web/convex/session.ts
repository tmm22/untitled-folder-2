import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

interface SessionRecord {
  id: string;
  secret: string;
  expiresAt: number;
}

function mapSession(doc: Doc<'sessions'>): SessionRecord {
  return {
    id: doc.id,
    secret: doc.secret,
    expiresAt: doc.expiresAt,
  };
}

export const save = internalMutation({
  args: {
    record: v.object({
      id: v.string(),
      secret: v.string(),
      expiresAt: v.number(),
    }),
  },
  returns: v.object({ result: v.boolean() }),
  handler: async (ctx, { record }) => {
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_session_id', (q) => q.eq('id', record.id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, record);
    } else {
      await ctx.db.insert('sessions', record);
    }

    return { result: true };
  },
});

export const get = internalQuery({
  args: { sessionId: v.string() },
  returns: v.object({
    session: v.union(
      v.object({
        id: v.string(),
        secret: v.string(),
        expiresAt: v.number(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_id', (q) => q.eq('id', sessionId))
      .first();

    return { session: session ? mapSession(session) : null };
  },
});

export const deleteSession = internalMutation({
  args: { sessionId: v.string() },
  returns: v.object({ result: v.boolean() }),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_id', (q) => q.eq('id', sessionId))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }

    return { result: true };
  },
});

const PRUNE_BATCH_SIZE = 500;

export const prune = internalMutation({
  args: { now: v.number() },
  returns: v.object({ result: v.number() }),
  handler: async (ctx, { now }) => {
    const expired = await ctx.db
      .query('sessions')
      .withIndex('by_expires_at', (q) => q.lt('expiresAt', now))
      .take(PRUNE_BATCH_SIZE);

    await Promise.all(expired.map((session) => ctx.db.delete(session._id)));
    return { result: expired.length };
  },
});
