import { randomUUID } from 'node:crypto';
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
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

const TRANSLATION_ENDPOINTS = {
  list: ['translations/list'],
  create: ['translations/create'],
  promote: ['translations/promote'],
  clear: ['translations/clear'],
  markAdopted: ['translations/markAdopted'],
};

export class ConvexTranslationRepository implements TranslationRepository {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexTranslationRepositoryOptions) {
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
            throw new Error(`Convex translations request failed (${response.status}): ${errorBody}`);
          }
          const payload = (await response.json()) as ConvexResponse<T> | T;
          if (payload && typeof payload === 'object' && 'result' in payload) {
            return (payload as ConvexResponse<T>).result;
          }
          return payload as T;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown Convex translations error');
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Convex translations request failed: no endpoints succeeded');
  }

  async list(
    accountId: string,
    documentId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<TranslationListResult> {
    return await this.execute<TranslationListResult>(TRANSLATION_ENDPOINTS.list, {
      accountId,
      documentId,
      cursor: options?.cursor,
      limit: options?.limit,
    });
  }

  async create(
    accountId: string,
    documentId: string,
    input: CreateTranslationInput,
  ): Promise<{ translation: TranslationRecord | null; historySize: number }> {
    return await this.execute(TRANSLATION_ENDPOINTS.create, {
      accountId,
      documentId,
      payload: input,
    });
  }

  async promote(accountId: string, documentId: string, translationId: string): Promise<PromoteResult> {
    return await this.execute(TRANSLATION_ENDPOINTS.promote, {
      accountId,
      documentId,
      translationId,
    });
  }

  async clear(accountId: string, documentId: string, options?: { keepLatest?: boolean }): Promise<number> {
    const result = await this.execute<{ deletedCount: number }>(TRANSLATION_ENDPOINTS.clear, {
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
    return await this.execute(TRANSLATION_ENDPOINTS.markAdopted, {
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
