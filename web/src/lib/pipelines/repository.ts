import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
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
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

const PIPELINE_ENDPOINTS = {
  list: ['pipelines/list'],
  get: ['pipelines/get'],
  findByWebhookSecret: ['pipelines/findByWebhookSecret'],
  create: ['pipelines/create'],
  update: ['pipelines/update'],
  delete: ['pipelines/delete'],
  recordRun: ['pipelines/recordRun'],
};

export class ConvexPipelineRepository implements PipelineRepository {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexPipelineRepositoryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
    this.authScheme = options.authScheme ?? 'Bearer';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildUrl(path: string): string[] {
    const suffixes = [`/api/${path}`, `/${path}`, `/api/http/${path}`, `/http/${path}`];
    return suffixes.map((suffix) => {
      try {
        return new URL(suffix, this.baseUrl).toString();
      } catch {
        return `${this.baseUrl}${suffix}`;
      }
    });
  }

  private async execute<T>(pathCandidates: string[], body: unknown): Promise<T> {
    const headers = new Headers({
      Authorization: `${this.authScheme} ${this.authToken}`,
      'Content-Type': 'application/json',
    });

    let lastError: Error | null = null;

    for (const candidate of pathCandidates) {
      for (const url of this.buildUrl(candidate)) {
        try {
          const response = await this.fetchImpl(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new Error(`Convex pipelines request failed (${response.status}): ${errorBody}`);
          }
          const payload = (await response.json()) as ConvexResponse<T> | T;
          if (payload && typeof payload === 'object' && 'result' in payload) {
            return (payload as ConvexResponse<T>).result;
          }
          return payload as T;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown Convex pipelines error');
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Convex pipelines request failed: no endpoints succeeded');
  }

  async list(): Promise<PipelineListItem[]> {
    return await this.execute<PipelineListItem[]>(PIPELINE_ENDPOINTS.list, {});
  }

  async get(id: string): Promise<PipelineDefinition | null> {
    return await this.execute<PipelineDefinition | null>(PIPELINE_ENDPOINTS.get, { id });
  }

  async findByWebhookSecret(secret: string): Promise<PipelineDefinition | null> {
    return await this.execute<PipelineDefinition | null>(PIPELINE_ENDPOINTS.findByWebhookSecret, { secret });
  }

  async create(input: PipelineCreateInput): Promise<PipelineDefinition> {
    return await this.execute<PipelineDefinition>(PIPELINE_ENDPOINTS.create, { input });
  }

  async update(id: string, input: PipelineUpdateInput): Promise<PipelineDefinition> {
    return await this.execute<PipelineDefinition>(PIPELINE_ENDPOINTS.update, { id, input });
  }

  async delete(id: string): Promise<void> {
    await this.execute(PIPELINE_ENDPOINTS.delete, { id });
  }

  async recordRun(id: string, completedAt: string): Promise<void> {
    await this.execute(PIPELINE_ENDPOINTS.recordRun, { id, completedAt });
  }
}
