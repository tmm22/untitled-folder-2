import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type TranslationDoc = Doc<'translations'>;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const sanitizeLimit = (value: number | undefined): number => {
  const limit = Number.isFinite(value) ? Math.floor(value as number) : DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
};

const parseCursor = (cursor?: string): number | undefined => {
  if (!cursor) return undefined;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const nextCursorFrom = (items: TranslationDoc[]): string | undefined => {
  if (items.length === 0) {
    return undefined;
  }
  const last = items[items.length - 1];
  return last ? String(last.sequenceIndex) : undefined;
};

const mapTranslation = (doc: TranslationDoc) => ({
  id: doc.translationId,
  accountId: doc.accountId,
  documentId: doc.documentId,
  sequenceIndex: doc.sequenceIndex,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  sourceText: doc.sourceText,
  sourceLanguageCode: doc.sourceLanguageCode,
  targetLanguageCode: doc.targetLanguageCode,
  translatedText: doc.translatedText,
  keepOriginalApplied: doc.keepOriginalApplied,
  adoptedAt: doc.adoptedAt ?? undefined,
  provider: doc.provider,
  metadata: doc.metadata ?? undefined,
});

async function loadTranslations(
  ctx: MutationCtx | QueryCtx,
  accountId: string,
  documentId: string,
  cursor?: number,
  limit?: number,
): Promise<TranslationDoc[]> {
  const builder = ctx.db
    .query('translations')
    .withIndex('by_account_document_seq', (q) => q.eq('accountId', accountId).eq('documentId', documentId))
    .order('desc');

  if (cursor !== undefined) {
    return builder
      .filter((q) => q.lt(q.field('sequenceIndex'), cursor))
      .take(limit ?? MAX_PAGE_SIZE + 1);
  }

  return builder.take(limit ?? MAX_PAGE_SIZE + 1);
}

async function findTranslation(
  ctx: MutationCtx | QueryCtx,
  accountId: string,
  documentId: string,
  translationId: string,
): Promise<TranslationDoc | null> {
  return await ctx.db
    .query('translations')
    .withIndex('by_account_translation', (q) => q.eq('accountId', accountId).eq('translationId', translationId))
    .filter((q) => q.eq(q.field('documentId'), documentId))
    .first();
}

async function nextSequenceIndex(ctx: MutationCtx, accountId: string, documentId: string): Promise<number> {
  const existing = await ctx.db
    .query('translations')
    .withIndex('by_account_document_seq', (q) => q.eq('accountId', accountId).eq('documentId', documentId))
    .order('desc')
    .first();

  return existing ? existing.sequenceIndex + 1 : 1;
}

export const list = query({
  args: {
    accountId: v.string(),
    documentId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, documentId, limit, cursor }) => {
    const pageSize = sanitizeLimit(limit);
    const cursorIndex = parseCursor(cursor);

    const docs = await loadTranslations(ctx, accountId, documentId, cursorIndex, pageSize + 1);
    const hasMore = docs.length > pageSize;
    const items = hasMore ? docs.slice(0, pageSize) : docs;

    return {
      items: items.map(mapTranslation),
      nextCursor: hasMore ? nextCursorFrom(items) : undefined,
    };
  },
});

export const create = mutation({
  args: {
    accountId: v.string(),
    documentId: v.string(),
    payload: v.object({
      translationId: v.optional(v.string()),
      sourceText: v.string(),
      sourceLanguageCode: v.string(),
      targetLanguageCode: v.string(),
      translatedText: v.string(),
      keepOriginalApplied: v.boolean(),
      provider: v.string(),
      metadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { accountId, documentId, payload }) => {
    const now = new Date().toISOString();
    const sequenceIndex = await nextSequenceIndex(ctx, accountId, documentId);
    const translationId = payload.translationId ?? crypto.randomUUID();

    const docId = await ctx.db.insert('translations', {
      accountId,
      documentId,
      translationId,
      sequenceIndex,
      createdAt: now,
      updatedAt: now,
      sourceText: payload.sourceText,
      sourceLanguageCode: payload.sourceLanguageCode,
      targetLanguageCode: payload.targetLanguageCode,
      translatedText: payload.translatedText,
      keepOriginalApplied: payload.keepOriginalApplied,
      provider: payload.provider,
      metadata: payload.metadata,
    });

    const inserted = await ctx.db.get(docId);
    const historySize = sequenceIndex;

    return {
      translation: inserted ? mapTranslation(inserted) : null,
      historySize,
    };
  },
});

export const promote = mutation({
  args: {
    accountId: v.string(),
    documentId: v.string(),
    translationId: v.string(),
  },
  handler: async (ctx, { accountId, documentId, translationId }) => {
    const current = await findTranslation(ctx, accountId, documentId, translationId);
    if (!current) {
      return { translation: null, reordered: false };
    }

    const sequenceIndex = await nextSequenceIndex(ctx, accountId, documentId);
    const now = new Date().toISOString();

    await ctx.db.patch(current._id, {
      sequenceIndex,
      updatedAt: now,
    });

    const updated = await ctx.db.get(current._id);
    return {
      translation: updated ? mapTranslation(updated as TranslationDoc) : null,
      reordered: true,
    };
  },
});

async function clearTranslationsInternal(
  ctx: MutationCtx,
  accountId: string,
  documentId: string,
  keepLatest: boolean,
  preserveDocId?: string,
): Promise<{ deletedCount: number; preserved?: TranslationDoc | null }> {
  const docs = await ctx.db
    .query('translations')
    .withIndex('by_account_document_seq', (q) => q.eq('accountId', accountId).eq('documentId', documentId))
    .order('desc')
    .collect();

  if (docs.length === 0) {
    return { deletedCount: 0, preserved: null };
  }

  if (!keepLatest) {
    await Promise.all(docs.map((doc) => ctx.db.delete(doc._id)));
    return { deletedCount: docs.length, preserved: null };
  }

  let preserved = preserveDocId ? docs.find((doc) => doc._id === preserveDocId) : undefined;
  if (!preserved) {
    preserved = docs[0];
  }
  const targets = docs.filter((doc) => doc._id !== preserved?._id);

  await Promise.all(targets.map((doc) => ctx.db.delete(doc._id)));

  if (preserved) {
    await ctx.db.patch(preserved._id, {
      sequenceIndex: 1,
      updatedAt: new Date().toISOString(),
    });
    preserved = (await ctx.db.get(preserved._id)) as TranslationDoc;
  }

  return { deletedCount: targets.length, preserved };
}

export const clear = mutation({
  args: {
    accountId: v.string(),
    documentId: v.string(),
    keepLatest: v.optional(v.boolean()),
  },
  handler: async (ctx, { accountId, documentId, keepLatest }) => {
    const { deletedCount } = await clearTranslationsInternal(ctx, accountId, documentId, Boolean(keepLatest));
    return { deletedCount };
  },
});

export const markAdopted = mutation({
  args: {
    accountId: v.string(),
    documentId: v.string(),
    translationId: v.string(),
    collapseHistory: v.optional(v.boolean()),
  },
  handler: async (ctx, { accountId, documentId, translationId, collapseHistory }) => {
    const translation = await findTranslation(ctx, accountId, documentId, translationId);
    if (!translation) {
      return { translation: null, collapsed: false };
    }

    const now = new Date().toISOString();
    await ctx.db.patch(translation._id, {
      keepOriginalApplied: false,
      adoptedAt: now,
      updatedAt: now,
    });

    let updatedDoc = (await ctx.db.get(translation._id)) as TranslationDoc | null;

    if (collapseHistory) {
      const { preserved } = await clearTranslationsInternal(ctx, accountId, documentId, true, translation._id);
      updatedDoc = preserved ?? ((await ctx.db.get(translation._id)) as TranslationDoc | null);
      return {
        translation: updatedDoc ? mapTranslation(updatedDoc) : null,
        collapsed: true,
      };
    }

    return {
      translation: updatedDoc ? mapTranslation(updatedDoc) : null,
      collapsed: false,
    };
  },
});
