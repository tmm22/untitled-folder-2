import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const save = mutation({
  args: {
    record: v.object({
      id: v.string(),
      secret: v.string(),
      expiresAt: v.number(),
    }),
  },
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

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_id', (q) => q.eq('id', sessionId))
      .first();

    return { session: session ?? null };
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.string() },
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

export const prune = mutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const expired = await ctx.db
      .query('sessions')
      .filter((q) => q.lt(q.field('expiresAt'), now))
      .collect();

    await Promise.all(expired.map((session) => ctx.db.delete(session._id)));
    return { result: expired.length };
  },
});
