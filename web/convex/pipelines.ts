import { internalQuery, internalMutation, type DatabaseReader } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { pipelineDefaultSource, pipelineSchedule, pipelineStep } from './validators';

type PipelineDoc = Doc<'pipelines'>;

const pipelineResult = v.object({
  id: v.string(),
  ownerId: v.optional(v.string()),
  name: v.string(),
  description: v.optional(v.string()),
  steps: v.array(pipelineStep),
  createdAt: v.string(),
  updatedAt: v.string(),
  webhookSecret: v.string(),
  schedule: v.optional(pipelineSchedule),
  defaultSource: v.optional(pipelineDefaultSource),
  lastRunAt: v.optional(v.string()),
});

const pipelineListItemResult = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  schedule: v.optional(pipelineSchedule),
  lastRunAt: v.optional(v.string()),
});

const maybePipelineResult = v.object({
  pipeline: v.union(pipelineResult, v.null()),
});

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
    ownerId: doc.ownerId ?? undefined,
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
    .withIndex('by_pipeline_id', (q) => q.eq('id', id))
    .first();
}

async function loadPipelineBySecret(db: DatabaseReader, secret: string): Promise<PipelineDoc | null> {
  return await db
    .query('pipelines')
    .withIndex('by_webhook_secret', (q) => q.eq('webhookSecret', secret))
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

const MAX_PIPELINES_LISTED = 500;

export const list = internalQuery({
  args: { ownerId: v.optional(v.string()) },
  returns: v.object({ pipelines: v.array(pipelineListItemResult) }),
  handler: async (ctx, { ownerId }) => {
    // Owner-scoped listing also includes legacy pipelines created before
    // ownership tracking (no ownerId on the record).
    const docs = ownerId
      ? [
          ...(await ctx.db
            .query('pipelines')
            .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
            .take(MAX_PIPELINES_LISTED)),
          ...(await ctx.db
            .query('pipelines')
            .withIndex('by_owner', (q) => q.eq('ownerId', undefined))
            .take(MAX_PIPELINES_LISTED)),
        ]
      : await ctx.db.query('pipelines').take(MAX_PIPELINES_LISTED);
    const sorted = docs.sort((a, b) => a.name.localeCompare(b.name));
    return { pipelines: sorted.map(toListItem) };
  },
});

export const get = internalQuery({
  args: { id: v.string() },
  returns: maybePipelineResult,
  handler: async (ctx, { id }) => {
    const pipeline = await loadPipelineById(ctx.db, id);
    return { pipeline: pipeline ? mapPipeline(pipeline) : null };
  },
});

export const findByWebhookSecret = internalQuery({
  args: { secret: v.string() },
  returns: maybePipelineResult,
  handler: async (ctx, { secret }) => {
    const pipeline = await loadPipelineBySecret(ctx.db, secret);
    return { pipeline: pipeline ? mapPipeline(pipeline) : null };
  },
});

export const create = internalMutation({
  args: {
    input: v.object({
      ownerId: v.optional(v.string()),
      name: v.string(),
      description: v.optional(v.string()),
      steps: v.array(pipelineStep),
      schedule: v.optional(pipelineSchedule),
      defaultSource: v.optional(pipelineDefaultSource),
    }),
  },
  returns: maybePipelineResult,
  handler: async (ctx, { input }) => {
    const id = crypto.randomUUID();
    const webhookSecret = crypto.randomUUID();
    const timestamp = now();

    const pipeline = {
      id,
      ownerId: input.ownerId,
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

export const update = internalMutation({
  args: {
    id: v.string(),
    input: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      steps: v.optional(v.array(pipelineStep)),
      schedule: v.optional(v.union(pipelineSchedule, v.null())),
      defaultSource: v.optional(v.union(pipelineDefaultSource, v.null())),
      rotateSecret: v.optional(v.boolean()),
    }),
  },
  returns: maybePipelineResult,
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

export const remove = internalMutation({
  args: { id: v.string() },
  returns: v.object({ result: v.boolean() }),
  handler: async (ctx, { id }) => {
    const existing = await loadPipelineById(ctx.db, id);
    if (!existing) {
      return { result: false };
    }
    await ctx.db.delete(existing._id);
    return { result: true };
  },
});

export const recordRun = internalMutation({
  args: {
    id: v.string(),
    completedAt: v.string(),
  },
  returns: maybePipelineResult,
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
