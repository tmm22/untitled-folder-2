import { randomUUID } from 'node:crypto';
import type { FunctionReference } from 'convex/server';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import type {
  CreateTranslationInput,
  MarkAdoptedResult,
  PromoteResult,
  TranslationListResult,
  TranslationRecord,
} from './types';

export interface TranslationRepository {
  list(
    accountId: string,
    documentId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TranslationListResult>;
  create(
    accountId: string,
    documentId: string,
    input: CreateTranslationInput,
  ): Promise<{ translation: TranslationRecord | null; historySize: number }>;
  promote(accountId: string, documentId: string, translationId: string): Promise<PromoteResult>;
  clear(accountId: string, documentId: string, options?: { keepLatest?: boolean }): Promise<number>;
  markAdopted(
    accountId: string,
    documentId: string,
    translationId: string,
    collapseHistory?: boolean,
  ): Promise<MarkAdoptedResult>;
}

interface ConvexTranslationRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexTranslationRepository implements TranslationRepository {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexTranslationRepositoryOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex translations request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex translations request failed: ${String(error)}`);
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

  async list(
    accountId: string,
    documentId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TranslationListResult> {
    const result = await this.query(api.translations.list, {
      accountId,
      documentId,
      cursor: options?.cursor,
      limit: options?.limit,
    });
    return {
      items: result.items ?? [],
      nextCursor: result.nextCursor,
    };
  }

  async create(
    accountId: string,
    documentId: string,
    input: CreateTranslationInput,
  ): Promise<{ translation: TranslationRecord | null; historySize: number }> {
    const result = await this.mutation(api.translations.create, {
      accountId,
      documentId,
      payload: input,
    });
    return {
      translation: result.translation ?? null,
      historySize: result.historySize ?? 0,
    };
  }

  async promote(accountId: string, documentId: string, translationId: string): Promise<PromoteResult> {
    return await this.mutation(api.translations.promote, {
      accountId,
      documentId,
      translationId,
    });
  }

  async clear(accountId: string, documentId: string, options?: { keepLatest?: boolean }): Promise<number> {
    const result = await this.mutation(api.translations.clear, {
      accountId,
      documentId,
      keepLatest: options?.keepLatest,
    });
    return result.deletedCount;
  }

  async markAdopted(
    accountId: string,
    documentId: string,
    translationId: string,
    collapseHistory?: boolean,
  ): Promise<MarkAdoptedResult> {
    return await this.mutation(api.translations.markAdopted, {
      accountId,
      documentId,
      translationId,
      collapseHistory,
    });
  }
}

interface InMemoryState {
  items: TranslationRecord[];
  nextSequence: number;
}

export class InMemoryTranslationRepository implements TranslationRepository {
  private readonly store = new Map<string, InMemoryState>();

  private key(accountId: string, documentId: string): string {
    return `${accountId}::${documentId}`;
  }

  private ensureState(accountId: string, documentId: string): InMemoryState {
    const key = this.key(accountId, documentId);
    const existing = this.store.get(key);
    if (existing) {
      return existing;
    }
    const initial: InMemoryState = {
      items: [],
      nextSequence: 1,
    };
    this.store.set(key, initial);
    return initial;
  }

  private sortHistory(state: InMemoryState) {
    state.items.sort((a, b) => b.sequenceIndex - a.sequenceIndex);
  }

  async list(
    accountId: string,
    documentId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TranslationListResult> {
    const state = this.ensureState(accountId, documentId);
    const cursorValue = options?.cursor ? Number.parseInt(options.cursor, 10) : undefined;
    const limit = typeof options?.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : undefined;

    const filtered = state.items
      .filter((item) => (cursorValue !== undefined ? item.sequenceIndex < cursorValue : true))
      .sort((a, b) => b.sequenceIndex - a.sequenceIndex);

    if (filtered.length === 0) {
      return { items: [] };
    }

    const pageSize = limit ?? filtered.length;
    const items = filtered.slice(0, pageSize);
    const hasMore = filtered.length > pageSize;
    const nextCursor = hasMore ? String(items[items.length - 1]!.sequenceIndex) : undefined;
    return { items, nextCursor };
  }

  async create(
    accountId: string,
    documentId: string,
    input: CreateTranslationInput,
  ): Promise<{ translation: TranslationRecord | null; historySize: number }> {
    const state = this.ensureState(accountId, documentId);
    const now = new Date().toISOString();
    const translation: TranslationRecord = {
      id: input.translationId ?? randomUUID(),
      sequenceIndex: state.nextSequence,
      createdAt: now,
      updatedAt: now,
      sourceText: input.sourceText,
      sourceLanguageCode: input.sourceLanguageCode,
      targetLanguageCode: input.targetLanguageCode,
      translatedText: input.translatedText,
      keepOriginalApplied: input.keepOriginalApplied,
      provider: input.provider,
      metadata: input.metadata,
    };
    state.items.push(translation);
    state.nextSequence += 1;
    this.sortHistory(state);
    return {
      translation,
      historySize: state.items.length,
    };
  }

  async promote(accountId: string, documentId: string, translationId: string): Promise<PromoteResult> {
    const state = this.ensureState(accountId, documentId);
    const target = state.items.find((item) => item.id === translationId);
    if (!target) {
      return { translation: null, reordered: false };
    }
    target.sequenceIndex = state.nextSequence;
    target.updatedAt = new Date().toISOString();
    state.nextSequence += 1;
    this.sortHistory(state);
    return { translation: target, reordered: true };
  }

  async clear(accountId: string, documentId: string, options?: { keepLatest?: boolean }): Promise<number> {
    const state = this.ensureState(accountId, documentId);
    if (state.items.length === 0) {
      return 0;
    }

    this.sortHistory(state);
    if (options?.keepLatest) {
      const [latest] = state.items;
      const deletedCount = state.items.length - (latest ? 1 : 0);
      state.items = latest
        ? [
            {
              ...latest,
              sequenceIndex: 1,
              updatedAt: new Date().toISOString(),
            },
          ]
        : [];
      state.nextSequence = state.items.length + 1;
      this.store.set(this.key(accountId, documentId), state);
      return Math.max(0, deletedCount);
    }

    const deleted = state.items.length;
    state.items = [];
    state.nextSequence = 1;
    return deleted;
  }

  async markAdopted(
    accountId: string,
    documentId: string,
    translationId: string,
    collapseHistory?: boolean,
  ): Promise<MarkAdoptedResult> {
    const state = this.ensureState(accountId, documentId);
    const target = state.items.find((item) => item.id === translationId);
    if (!target) {
      return { translation: null, collapsed: false };
    }

    const now = new Date().toISOString();
    target.keepOriginalApplied = false;
    target.adoptedAt = now;
    target.updatedAt = now;

    if (collapseHistory) {
      await this.clear(accountId, documentId, { keepLatest: true });
      const latest = state.items.find((item) => item.id === translationId) ?? state.items[0] ?? null;
      return {
        translation: latest,
        collapsed: true,
      };
    }

    this.sortHistory(state);
    return {
      translation: target,
      collapsed: false,
    };
  }
}
