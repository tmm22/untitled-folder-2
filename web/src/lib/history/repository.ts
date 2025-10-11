import type { FunctionReference } from 'convex/server';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import type { HistoryEntryPayload } from './types';

export interface HistoryRepository {
  list(userId: string, limit?: number): Promise<HistoryEntryPayload[]>;
  record(entry: HistoryEntryPayload): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

interface ConvexHistoryRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexHistoryRepository implements HistoryRepository {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexHistoryRepositoryOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex history request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex history request failed: ${String(error)}`);
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

  async list(userId: string, limit?: number): Promise<HistoryEntryPayload[]> {
    const result = await this.query(api.history.list, {
      userId,
      limit,
    });
    return result ?? [];
  }

  async record(entry: HistoryEntryPayload): Promise<void> {
    await this.mutation(api.history.record, { entry });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.mutation(api.history.remove, { userId, id });
  }

  async clear(userId: string): Promise<void> {
    await this.mutation(api.history.clear, { userId });
  }
}

export class InMemoryHistoryRepository implements HistoryRepository {
  private readonly entries = new Map<string, HistoryEntryPayload[]>();

  async list(userId: string, limit?: number): Promise<HistoryEntryPayload[]> {
    const items = [...(this.entries.get(userId) ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (typeof limit === 'number') {
      return items.slice(0, Math.max(0, limit));
    }
    return items;
  }

  async record(entry: HistoryEntryPayload): Promise<void> {
    const current = this.entries.get(entry.userId) ?? [];
    const filtered = current.filter((item) => item.id !== entry.id);
    this.entries.set(entry.userId, [entry, ...filtered]);
  }

  async remove(userId: string, id: string): Promise<void> {
    const filtered = (this.entries.get(userId) ?? []).filter((item) => item.id !== id);
    this.entries.set(userId, filtered);
  }

  async clear(userId: string): Promise<void> {
    this.entries.delete(userId);
  }
}

export class NoopHistoryRepository implements HistoryRepository {
  async list(): Promise<HistoryEntryPayload[]> {
    return [];
  }

  async record(): Promise<void> {}

  async remove(): Promise<void> {}

  async clear(): Promise<void> {}
}
