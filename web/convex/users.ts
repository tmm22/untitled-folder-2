import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type UserDoc = Doc<'users'>;

const now = () => Date.now();

const userResult = v.object({
  clerkId: v.string(),
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  lastLoginAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const mapUser = (doc: UserDoc) => ({
  clerkId: doc.clerkId,
  email: doc.email,
  firstName: doc.firstName,
  lastName: doc.lastName,
  imageUrl: doc.imageUrl,
  lastLoginAt: doc.lastLoginAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

async function findByClerkId(ctx: QueryCtx | MutationCtx, clerkId: string): Promise<UserDoc | null> {
  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', clerkId))
    .first();
}

export const ensureUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  returns: v.object({ user: v.union(userResult, v.null()) }),
  handler: async (ctx, args) => {
    const existing = await findByClerkId(ctx, args.clerkId);
    const timestamp = now();

    if (existing) {
      const updatedFields: Partial<UserDoc> = {
        email: args.email ?? existing.email,
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        lastLoginAt: timestamp,
        updatedAt: timestamp,
      };
      await ctx.db.patch(existing._id, updatedFields);
      const updated = await findByClerkId(ctx, args.clerkId);
      return { user: updated ? mapUser(updated) : null };
    }

    const user: Omit<UserDoc, '_id' | '_creationTime'> = {
      clerkId: args.clerkId,
      email: args.email ?? undefined,
      firstName: args.firstName ?? undefined,
      lastName: args.lastName ?? undefined,
      imageUrl: args.imageUrl ?? undefined,
      lastLoginAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const insertedId = await ctx.db.insert('users', user);
    const inserted = await ctx.db.get(insertedId);
    return { user: inserted ? mapUser(inserted) : null };
  },
});

export const getUser = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(userResult, v.null()),
  handler: async (ctx, args) => {
    const user = await findByClerkId(ctx, args.clerkId);
    return user ? mapUser(user) : null;
  },
});
