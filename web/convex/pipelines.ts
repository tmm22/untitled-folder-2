import { query, mutation, type DatabaseReader } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type PipelineDoc = Doc<'pipelines'>;

const now = () => new Date().toISOString();

function sanitizeName(name: string): string {
  return name.trim();
}

function sanitizeDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function mapPipeline(doc: PipelineDoc) {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? undefined,
    steps: doc.steps,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    webhookSecret: doc.webhookSecret,
    schedule: doc.schedule ?? undefined,
    defaultSource: doc.defaultSource ?? undefined,
    lastRunAt: doc.lastRunAt ?? undefined,
  };
}

async function loadPipelineById(db: DatabaseReader, id: string): Promise<PipelineDoc | null> {
  return await db
    .query('pipelines')
    .withIndex('by_pipeline_id')
    .filter((q) => q.eq(q.field('id'), id))
    .first();
}

async function loadPipelineBySecret(db: DatabaseReader, secret: string): Promise<PipelineDoc | null> {
  return await db
    .query('pipelines')
    .withIndex('by_webhook_secret')
    .filter((q) => q.eq(q.field('webhookSecret'), secret))
    .first();
}

function toListItem(doc: PipelineDoc) {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? undefined,
    schedule: doc.schedule ?? undefined,
    lastRunAt: doc.lastRunAt ?? undefined,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('pipelines').collect();
    const sorted = docs.sort((a, b) => a.name.localeCompare(b.name));
    return { pipelines: sorted.map(toListItem) };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const pipeline = await loadPipelineById(ctx.db, id);
    return { pipeline: pipeline ? mapPipeline(pipeline) : null };
  },
});

export const findByWebhookSecret = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const pipeline = await loadPipelineBySecret(ctx.db, secret);
    return { pipeline: pipeline ? mapPipeline(pipeline) : null };
  },
});

export const create = mutation({
  args: {
    input: v.object({
      name: v.string(),
      description: v.optional(v.string()),
      steps: v.array(v.any()),
      schedule: v.optional(v.any()),
      defaultSource: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { input }) => {
    const id = crypto.randomUUID();
    const webhookSecret = crypto.randomUUID();
    const timestamp = now();

    const pipeline = {
      id,
      name: sanitizeName(input.name),
      description: sanitizeDescription(input.description),
      steps: input.steps,
      schedule: input.schedule ?? undefined,
      defaultSource: input.defaultSource ?? undefined,
      webhookSecret,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastRunAt: undefined,
    };

    const insertedId = await ctx.db.insert('pipelines', pipeline);
    const inserted = await ctx.db.get(insertedId);
    return { pipeline: inserted ? mapPipeline(inserted) : null };
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    input: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      steps: v.optional(v.array(v.any())),
      schedule: v.optional(v.union(v.any(), v.null())),
      defaultSource: v.optional(v.union(v.any(), v.null())),
      rotateSecret: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, input }) => {
    const existing = await loadPipelineById(ctx.db, id);
    if (!existing) {
      return { pipeline: null };
    }

    const patch: Partial<PipelineDoc> = {
      updatedAt: now(),
    };

    if (input.name !== undefined) {
      patch.name = sanitizeName(input.name);
    }
    if (input.description !== undefined) {
      patch.description = sanitizeDescription(input.description);
    }
    if (input.steps !== undefined) {
      patch.steps = input.steps;
    }
    if (input.schedule !== undefined) {
      patch.schedule = input.schedule === null ? undefined : input.schedule;
    }
    if (input.defaultSource !== undefined) {
      patch.defaultSource = input.defaultSource === null ? undefined : input.defaultSource;
    }
    if (input.rotateSecret) {
      patch.webhookSecret = crypto.randomUUID();
    }

    await ctx.db.patch(existing._id, patch);
    const updated = await ctx.db.get(existing._id);
    return { pipeline: updated ? mapPipeline(updated) : null };
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const existing = await loadPipelineById(ctx.db, id);
    if (!existing) {
      return { result: false };
    }
    await ctx.db.delete(existing._id);
    return { result: true };
  },
});

export const recordRun = mutation({
  args: {
    id: v.string(),
    completedAt: v.string(),
  },
  handler: async (ctx, { id, completedAt }) => {
    const existing = await loadPipelineById(ctx.db, id);
    if (!existing) {
      return { pipeline: null };
    }
    await ctx.db.patch(existing._id, { lastRunAt: completedAt, updatedAt: now() });
    const updated = await ctx.db.get(existing._id);
    return { pipeline: updated ? mapPipeline(updated) : null };
  },
});
