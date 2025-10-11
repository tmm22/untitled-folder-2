import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { FunctionReference } from 'convex/server';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import type {
  PipelineCreateInput,
  PipelineDefinition,
  PipelineListItem,
  PipelineUpdateInput,
} from './types';

export interface PipelineRepository {
  list(): Promise<PipelineListItem[]>;
  get(id: string): Promise<PipelineDefinition | null>;
  findByWebhookSecret(secret: string): Promise<PipelineDefinition | null>;
  create(input: PipelineCreateInput): Promise<PipelineDefinition>;
  update(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition>;
  delete(id: string): Promise<void>;
  recordRun(id: string, completedAt: string): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function applyUpdate(pipeline: PipelineDefinition, input: PipelineUpdateInput): PipelineDefinition {
  return {
    ...pipeline,
    name: input.name ?? pipeline.name,
    description: input.description ?? pipeline.description,
    steps: input.steps ?? pipeline.steps,
    schedule: input.schedule === null ? undefined : input.schedule ?? pipeline.schedule,
    defaultSource: input.defaultSource === null ? undefined : input.defaultSource ?? pipeline.defaultSource,
    webhookSecret: input.rotateSecret ? randomUUID() : pipeline.webhookSecret,
    updatedAt: nowIso(),
  };
}

export class InMemoryPipelineRepository implements PipelineRepository {
  private readonly pipelines = new Map<string, PipelineDefinition>();

  async list(): Promise<PipelineListItem[]> {
    return [...this.pipelines.values()]
      .map<PipelineListItem>((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        schedule: pipeline.schedule,
        lastRunAt: pipeline.lastRunAt,
      }))
      .sort((a, b) => (a.name.localeCompare(b.name)));
  }

  async get(id: string): Promise<PipelineDefinition | null> {
    return this.pipelines.get(id) ?? null;
  }

  async findByWebhookSecret(secret: string): Promise<PipelineDefinition | null> {
    for (const pipeline of this.pipelines.values()) {
      if (pipeline.webhookSecret === secret) {
        return pipeline;
      }
    }
    return null;
  }

  async create(input: PipelineCreateInput): Promise<PipelineDefinition> {
    const pipeline: PipelineDefinition = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim(),
      steps: input.steps,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      webhookSecret: randomUUID(),
      schedule: input.schedule,
      defaultSource: input.defaultSource,
    };
    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  async update(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition> {
    const existing = this.pipelines.get(id);
    if (!existing) {
      throw new Error('Pipeline not found');
    }
    const updated = applyUpdate(existing, input);
    this.pipelines.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.pipelines.delete(id);
  }

  async recordRun(id: string, completedAt: string): Promise<void> {
    const existing = this.pipelines.get(id);
    if (!existing) {
      return;
    }
    this.pipelines.set(id, {
      ...existing,
      lastRunAt: completedAt,
      updatedAt: nowIso(),
    });
  }
}

interface PipelineCollection {
  pipelines: PipelineDefinition[];
}

async function readJsonFile(filePath: string): Promise<PipelineCollection> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as PipelineCollection;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pipelines)) {
      return { pipelines: [] };
    }
    return {
      pipelines: parsed.pipelines.map((pipeline) => ({
        ...pipeline,
        steps: pipeline.steps ?? [],
      })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { pipelines: [] };
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, collection: PipelineCollection): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(collection, null, 2), 'utf8');
}

export class JsonFilePipelineRepository implements PipelineRepository {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async load(): Promise<PipelineDefinition[]> {
    const { pipelines } = await readJsonFile(this.filePath);
    return pipelines;
  }

  private async persist(pipelines: PipelineDefinition[]): Promise<void> {
    await writeJsonFile(this.filePath, { pipelines });
  }

  async list(): Promise<PipelineListItem[]> {
    const pipelines = await this.load();
    return pipelines
      .map<PipelineListItem>((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        schedule: pipeline.schedule,
        lastRunAt: pipeline.lastRunAt,
      }))
      .sort((a, b) => (a.name.localeCompare(b.name)));
  }

  async get(id: string): Promise<PipelineDefinition | null> {
    const pipelines = await this.load();
    return pipelines.find((pipeline) => pipeline.id === id) ?? null;
  }

  async findByWebhookSecret(secret: string): Promise<PipelineDefinition | null> {
    const pipelines = await this.load();
    return pipelines.find((pipeline) => pipeline.webhookSecret === secret) ?? null;
  }

  async create(input: PipelineCreateInput): Promise<PipelineDefinition> {
    const pipelines = await this.load();
    const now = nowIso();
    const pipeline: PipelineDefinition = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim(),
      steps: input.steps,
      schedule: input.schedule,
      defaultSource: input.defaultSource,
      createdAt: now,
      updatedAt: now,
      webhookSecret: randomUUID(),
    };
    pipelines.push(pipeline);
    await this.persist(pipelines);
    return pipeline;
  }

  async update(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition> {
    const pipelines = await this.load();
    const index = pipelines.findIndex((pipeline) => pipeline.id === id);
    if (index === -1) {
      throw new Error('Pipeline not found');
    }
    pipelines[index] = applyUpdate(pipelines[index], input);
    await this.persist(pipelines);
    return pipelines[index];
  }

  async delete(id: string): Promise<void> {
    const pipelines = await this.load();
    const filtered = pipelines.filter((pipeline) => pipeline.id !== id);
    if (filtered.length !== pipelines.length) {
      await this.persist(filtered);
    }
  }

  async recordRun(id: string, completedAt: string): Promise<void> {
    const pipelines = await this.load();
    const index = pipelines.findIndex((pipeline) => pipeline.id === id);
    if (index === -1) {
      return;
    }
    pipelines[index] = {
      ...pipelines[index],
      lastRunAt: completedAt,
      updatedAt: nowIso(),
    };
    await this.persist(pipelines);
  }
}

interface ConvexPipelineRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexPipelineRepository implements PipelineRepository {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexPipelineRepositoryOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex pipelines request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex pipelines request failed: ${String(error)}`);
  }

  private async query<TArgs extends object, TResult>(
    reference: FunctionReference<'query', TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return await fetchQuery(reference, args, this.clientOptions);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private async mutation<TArgs extends object, TResult>(
    reference: FunctionReference<'mutation', TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return await fetchMutation(reference, args, this.clientOptions);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async list(): Promise<PipelineListItem[]> {
    const result = await this.query(api.pipelines.list, {});
    return result.pipelines ?? [];
  }

  async get(id: string): Promise<PipelineDefinition | null> {
    const result = await this.query(api.pipelines.get, { id });
    return result.pipeline ?? null;
  }

  async findByWebhookSecret(secret: string): Promise<PipelineDefinition | null> {
    const result = await this.query(api.pipelines.findByWebhookSecret, { secret });
    return result.pipeline ?? null;
  }

  async create(input: PipelineCreateInput): Promise<PipelineDefinition> {
    const result = await this.mutation(api.pipelines.create, { input });
    if (!result.pipeline) {
      throw new Error('Convex pipelines request failed: empty pipeline response');
    }
    return result.pipeline;
  }

  async update(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition> {
    const result = await this.mutation(api.pipelines.update, { id, input });
    if (!result.pipeline) {
      throw new Error('Convex pipelines request failed: pipeline not found');
    }
    return result.pipeline;
  }

  async delete(id: string): Promise<void> {
    await this.mutation(api.pipelines.remove, { id });
  }

  async recordRun(id: string, completedAt: string): Promise<void> {
    await this.mutation(api.pipelines.recordRun, { id, completedAt });
  }
}
