import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type WorkspaceLayoutDoc = Doc<'workspace_layouts'>;

const columnSchema = v.object({
  id: v.string(),
  panels: v.array(v.string()),
});

const layoutSchema = v.object({
  version: v.number(),
  columns: v.array(columnSchema),
});

const mapDoc = (doc: WorkspaceLayoutDoc) => ({
  userId: doc.userId,
  layout: doc.layout,
  version: doc.version,
  updatedAt: doc.updatedAt,
});

const findByUserId = async (ctx: QueryCtx | MutationCtx, userId: string) => {
  return await ctx.db
    .query('workspace_layouts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
};

export const getWorkspaceLayout = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const existing = await findByUserId(ctx, userId);
    if (!existing) {
      return null;
    }
    return mapDoc(existing);
  },
});

export const saveWorkspaceLayout = mutation({
  args: {
    payload: v.object({
      userId: v.string(),
      layout: layoutSchema,
    }),
  },
  handler: async (ctx, { payload }) => {
    const { userId, layout } = payload;
    const now = Date.now();
    const existing = await findByUserId(ctx, userId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        layout,
        version: layout.version,
        updatedAt: now,
      });
      const updated = await ctx.db.get(existing._id);
      return { layout: updated ? mapDoc(updated) : null };
    }

    await ctx.db.insert('workspace_layouts', {
      userId,
      layout,
      version: layout.version,
      updatedAt: now,
    });

    const inserted = await findByUserId(ctx, userId);
    return { layout: inserted ? mapDoc(inserted) : null };
  },
});

export const clearWorkspaceLayout = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const existing = await findByUserId(ctx, userId);
    if (!existing) {
      return { cleared: false };
    }
    await ctx.db.delete(existing._id);
    return { cleared: true };
  },
});
