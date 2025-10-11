import { beforeEach, describe, expect, it } from 'vitest';
import type { RegisteredMutation, RegisteredQuery } from 'convex/server';
import * as pipelinesFns from '../../../convex/pipelines';

type StoredPipeline = Record<string, unknown> & { _id: string };

type Condition = { field: string; value: unknown };

class FakeQueryBuilder {
  private readonly eqConditions: Condition[] = [];

  constructor(private readonly source: FakeDb) {}

  withIndex(_name: string, apply: (builder: { eq: (field: string, value: unknown) => unknown }) => void) {
    const builder = {
      eq: (field: string, value: unknown) => {
        this.eqConditions.push({ field, value });
        return builder;
      },
    };
    apply(builder);
    return this;
  }

  filter(apply: (builder: { field: (name: string) => string; eq: (field: string, value: unknown) => Condition }) => Condition) {
    const filterBuilder = {
      field: (name: string) => name,
      eq: (field: string, value: unknown) => ({ field, value }),
    };
    const condition = apply(filterBuilder);
    if (condition) {
      this.eqConditions.push(condition);
    }
    return this;
  }

  async collect(): Promise<StoredPipeline[]> {
    return this.evaluate();
  }

  async first(): Promise<StoredPipeline | null> {
    const [first] = this.evaluate();
    return first ?? null;
  }

  private evaluate(): StoredPipeline[] {
    let docs = this.source.getAll();
    if (this.eqConditions.length > 0) {
      docs = docs.filter((doc) =>
        this.eqConditions.every((condition) => doc[condition.field] === condition.value),
      );
    }
    return docs.map((doc) => ({ ...doc }));
  }
}

class FakeDb {
  private counter = 0;
  private readonly pipelines = new Map<string, StoredPipeline>();

  insert(table: string, doc: Record<string, unknown>) {
    this.assertTable(table);
    const id = `${table}:${++this.counter}`;
    const stored = { ...doc, _id: id } as StoredPipeline;
    this.pipelines.set(id, stored);
    return id;
  }

  get(id: string) {
    return this.pipelines.get(id) ?? null;
  }

  patch(id: string, patch: Record<string, unknown>) {
    const current = this.pipelines.get(id);
    if (!current) {
      return;
    }
    Object.assign(current, patch);
  }

  delete(id: string) {
    this.pipelines.delete(id);
  }

  query(table: string) {
    this.assertTable(table);
    return new FakeQueryBuilder(this);
  }

  getAll(): StoredPipeline[] {
    return Array.from(this.pipelines.values()).map((doc) => ({ ...doc }));
  }

  private assertTable(table: string) {
    if (table !== 'pipelines') {
      throw new Error(`Unsupported table ${table}`);
    }
  }
}

const runMutation = async <Args, Result>(
  fn: RegisteredMutation<'public', Args, Result>,
  ctx: any,
  args: Args,
): Promise<Result> => {
  return (fn as unknown as { _handler: (context: any, arguments_: Args) => Promise<Result> })._handler(ctx, args);
};

const runQuery = async <Args, Result>(
  fn: RegisteredQuery<'public', Args, Result>,
  ctx: any,
  args: Args,
): Promise<Result> => {
  return (fn as unknown as { _handler: (context: any, arguments_: Args) => Promise<Result> })._handler(ctx, args);
};

describe('Convex pipelines functions', () => {
  let db: FakeDb;
  let ctx: { db: FakeDb };

  beforeEach(() => {
    db = new FakeDb();
    ctx = { db };
  });

  it('creates and lists pipelines', async () => {
    const created = await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'My Pipeline',
        description: 'Example',
        steps: [],
      },
    });
    expect(created.pipeline?.name).toBe('My Pipeline');
    expect(created.pipeline?.webhookSecret).toBeTruthy();

    await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'Another Pipeline',
        steps: [],
      },
    });

    const listResult = await runQuery(pipelinesFns.list, ctx, {});
    expect(listResult.pipelines.map((item) => item.name)).toEqual(['Another Pipeline', 'My Pipeline']);
  });

  it('retrieves, updates, and rotates secrets', async () => {
    const created = await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'Initial',
        steps: [],
      },
    });
    const createdPipeline = created.pipeline!;

    const getResult = await runQuery(pipelinesFns.get, ctx, { id: createdPipeline.id });
    expect(getResult.pipeline?.name).toBe('Initial');

    const updated = await runMutation(pipelinesFns.update, ctx, {
      id: createdPipeline.id,
      input: {
        name: 'Renamed',
        rotateSecret: true,
      },
    });

    expect(updated.pipeline?.name).toBe('Renamed');
    expect(updated.pipeline?.webhookSecret).not.toBe(createdPipeline.webhookSecret);
  });

  it('finds by webhook secret', async () => {
    const created = await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'Secret Pipeline',
        steps: [],
      },
    });

    const secret = created.pipeline!.webhookSecret;
    const found = await runQuery(pipelinesFns.findByWebhookSecret, ctx, { secret });
    expect(found.pipeline?.id).toBe(created.pipeline?.id);
  });

  it('records runs and updates lastRunAt', async () => {
    const created = await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'Runner',
        steps: [],
      },
    });

    const completedAt = new Date().toISOString();
    const recordResult = await runMutation(pipelinesFns.recordRun, ctx, {
      id: created.pipeline!.id,
      completedAt,
    });

    expect(recordResult.pipeline?.lastRunAt).toBe(completedAt);
  });

  it('removes pipelines', async () => {
    const created = await runMutation(pipelinesFns.create, ctx, {
      input: {
        name: 'Disposable',
        steps: [],
      },
    });

    const removeResult = await runMutation(pipelinesFns.remove, ctx, { id: created.pipeline!.id });
    expect(removeResult.result).toBe(true);

    const afterDelete = await runQuery(pipelinesFns.get, ctx, { id: created.pipeline!.id });
    expect(afterDelete.pipeline).toBeNull();
  });
});
