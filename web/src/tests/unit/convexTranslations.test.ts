import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RegisteredMutation, RegisteredQuery } from 'convex/server';
import * as translationsFns from '../../../convex/translations';

type StoredTranslation = Record<string, unknown> & { _id: string };

type Condition =
  | { type: 'eq'; field: string; value: unknown }
  | { type: 'lt'; field: string; value: number };

class FakeQueryBuilder {
  private readonly conditions: Condition[] = [];
  private orderDirection: 'asc' | 'desc' = 'asc';

  constructor(private readonly source: FakeDb) {}

  withIndex(_name: string, apply: (builder: { eq: (field: string, value: unknown) => any }) => void) {
    const indexBuilder = {
      eq: (field: string, value: unknown) => {
        this.conditions.push({ type: 'eq', field, value });
        return indexBuilder;
      },
    };
    apply(indexBuilder);
    return this;
  }

  order(direction: 'asc' | 'desc') {
    this.orderDirection = direction;
    return this;
  }

  filter(apply: (builder: { field: (name: string) => string; eq: (field: string, value: unknown) => Condition; lt: (field: string, value: number) => Condition }) => Condition) {
    const filterBuilder = {
      field: (name: string) => name,
      eq: (field: string, value: unknown) => ({ type: 'eq', field, value } as Condition),
      lt: (field: string, value: number) => ({ type: 'lt', field, value } as Condition),
    };
    const condition = apply(filterBuilder);
    if (condition) {
      this.conditions.push(condition);
    }
    return this;
  }

  async take(limit: number) {
    return this.evaluate().slice(0, limit);
  }

  async collect() {
    return this.evaluate();
  }

  async first() {
    const [first] = this.evaluate();
    return first ?? null;
  }

  private evaluate(): StoredTranslation[] {
    let docs = this.source.getAll();
    for (const condition of this.conditions) {
      if (condition.type === 'eq') {
        docs = docs.filter((doc) => doc[condition.field] === condition.value);
      } else if (condition.type === 'lt') {
        docs = docs.filter((doc) => {
          const value = doc[condition.field];
          return typeof value === 'number' && value < condition.value;
        });
      }
    }
    const direction = this.orderDirection;
    docs.sort((a, b) => {
      const aValue = a.sequenceIndex as number;
      const bValue = b.sequenceIndex as number;
      if (aValue === bValue) {
        return 0;
      }
      return direction === 'desc' ? (aValue < bValue ? 1 : -1) : aValue < bValue ? -1 : 1;
    });
    return docs;
  }
}

class FakeDb {
  private counter = 0;
  private readonly translations = new Map<string, StoredTranslation>();

  insert(table: string, doc: Record<string, unknown>) {
    this.assertTable(table);
    const id = `${table}:${++this.counter}`;
    const stored = { ...doc, _id: id } as StoredTranslation;
    this.translations.set(id, stored);
    return id;
  }

  get(id: string) {
    return this.translations.get(id) ?? null;
  }

  patch(id: string, patch: Record<string, unknown>) {
    const current = this.translations.get(id);
    if (!current) {
      return;
    }
    Object.assign(current, patch);
  }

  delete(id: string) {
    this.translations.delete(id);
  }

  query(table: string) {
    this.assertTable(table);
    return new FakeQueryBuilder(this);
  }

  getAll(): StoredTranslation[] {
    return Array.from(this.translations.values()).map((doc) => ({ ...doc }));
  }

  private assertTable(table: string) {
    if (table !== 'translations') {
      throw new Error(`Unsupported table ${table}`);
    }
  }
}

const runMutation = async <Args, Result>(fn: RegisteredMutation<'public', Args, Result>, ctx: any, args: Args): Promise<Result> => {
  return (fn as unknown as { _handler: (ctx: any, args: Args) => Promise<Result> })._handler(ctx, args);
};

const runQuery = async <Args, Result>(fn: RegisteredQuery<'public', Args, Result>, ctx: any, args: Args): Promise<Result> => {
  return (fn as unknown as { _handler: (ctx: any, args: Args) => Promise<Result> })._handler(ctx, args);
};

describe('Convex translations functions', () => {
  let db: FakeDb;
  let ctx: { db: FakeDb };

  beforeEach(() => {
    db = new FakeDb();
    ctx = { db };
  });

  async function createSampleTranslation(overrides: Partial<{ translationId: string; sourceText: string; translatedText: string; keepOriginalApplied: boolean }> = {}) {
    const defaults = {
      translationId: randomUUID(),
      sourceText: 'Hello world',
      translatedText: 'Bonjour le monde',
      keepOriginalApplied: true,
    };
    const payload = { ...defaults, ...overrides };
    const result = await runMutation(translationsFns.create, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      payload: {
        translationId: payload.translationId,
        sourceText: payload.sourceText,
        sourceLanguageCode: 'en',
        targetLanguageCode: 'fr',
        translatedText: payload.translatedText,
        keepOriginalApplied: payload.keepOriginalApplied,
        provider: 'openai',
      },
    });
    return result.translation!;
  }

  it('creates translations with increasing sequence indexes', async () => {
    const first = await createSampleTranslation({ translationId: 't-1' });
    const second = await createSampleTranslation({ translationId: 't-2' });

    expect(first.sequenceIndex).toBe(1);
    expect(second.sequenceIndex).toBe(2);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items.map((item) => item.id)).toEqual(['t-2', 't-1']);
  });

  it('promotes selected translation to the active slot', async () => {
    const first = await createSampleTranslation({ translationId: 't-1', translatedText: 'Hola mundo' });
    await createSampleTranslation({ translationId: 't-2', translatedText: 'Bonjour le monde' });

    const promoteResult = await runMutation(translationsFns.promote, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      translationId: first.id,
    });

    expect(promoteResult.translation?.sequenceIndex).toBe(3);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items[0]?.id).toBe('t-1');
    expect(listResult.items[0]?.sequenceIndex).toBeGreaterThan(listResult.items[1]?.sequenceIndex ?? 0);
  });

  it('supports paginated listing with a cursor', async () => {
    await createSampleTranslation({ translationId: 't-1' });
    await createSampleTranslation({ translationId: 't-2' });
    await createSampleTranslation({ translationId: 't-3' });

    const firstPage = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1', limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await runQuery(translationsFns.list, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).toBe('t-1');
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('clears history but keeps the latest translation when requested', async () => {
    await createSampleTranslation({ translationId: 't-1' });
    await createSampleTranslation({ translationId: 't-2' });
    await createSampleTranslation({ translationId: 't-3' });

    const clearResult = await runMutation(translationsFns.clear, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      keepLatest: true,
    });

    expect(clearResult.deletedCount).toBe(2);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0]?.sequenceIndex).toBe(1);
  });

  it('clears entire history when keepLatest is false', async () => {
    await createSampleTranslation({ translationId: 't-1' });
    await createSampleTranslation({ translationId: 't-2' });

    const clearResult = await runMutation(translationsFns.clear, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      keepLatest: false,
    });

    expect(clearResult.deletedCount).toBe(2);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items).toHaveLength(0);
  });

  it('marks a translation as adopted without collapsing history', async () => {
    const translation = await createSampleTranslation({ translationId: 't-1', keepOriginalApplied: true });

    const result = await runMutation(translationsFns.markAdopted, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      translationId: translation.id,
      collapseHistory: false,
    });

    expect(result.translation?.keepOriginalApplied).toBe(false);
    expect(result.translation?.adoptedAt).toBeDefined();

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items).toHaveLength(1);
  });

  it('marks a translation as adopted and collapses history when requested', async () => {
    await createSampleTranslation({ translationId: 't-1' });
    const newer = await createSampleTranslation({ translationId: 't-2' });

    const result = await runMutation(translationsFns.markAdopted, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      translationId: newer.id,
      collapseHistory: true,
    });

    expect(result.translation?.keepOriginalApplied).toBe(false);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0]?.id).toBe(newer.id);
  });

  it('preserves adopted older translation when collapsing history', async () => {
    const older = await createSampleTranslation({ translationId: 't-old', translatedText: 'Bonjour le monde' });
    await createSampleTranslation({ translationId: 't-new', translatedText: 'Hola mundo' });

    const result = await runMutation(translationsFns.markAdopted, ctx, {
      accountId: 'acct-1',
      documentId: 'doc-1',
      translationId: older.id,
      collapseHistory: true,
    });

    expect(result.translation?.id).toBe('t-old');
    expect(result.translation?.keepOriginalApplied).toBe(false);

    const listResult = await runQuery(translationsFns.list, ctx, { accountId: 'acct-1', documentId: 'doc-1' });
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0]?.id).toBe('t-old');
  });
});
