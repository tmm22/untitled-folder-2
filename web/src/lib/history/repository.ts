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
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

const HISTORY_ENDPOINTS = {
  list: ['history/list'],
  record: ['history/record'],
  remove: ['history/remove'],
  clear: ['history/clear'],
};

export class ConvexHistoryRepository implements HistoryRepository {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexHistoryRepositoryOptions) {
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
            throw new Error(`Convex history request failed (${response.status}): ${errorBody}`);
          }

          const payload = (await response.json()) as ConvexResponse<T> | T;
          if (payload && typeof payload === 'object' && 'result' in payload) {
            return (payload as ConvexResponse<T>).result;
          }
          return payload as T;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown Convex history error');
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Convex history request failed: no endpoints succeeded');
  }

  async list(userId: string, limit?: number): Promise<HistoryEntryPayload[]> {
    return await this.execute<HistoryEntryPayload[]>(HISTORY_ENDPOINTS.list, {
      userId,
      limit,
    });
  }

  async record(entry: HistoryEntryPayload): Promise<void> {
    await this.execute(HISTORY_ENDPOINTS.record, { entry });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.execute(HISTORY_ENDPOINTS.remove, { userId, id });
  }

  async clear(userId: string): Promise<void> {
    await this.execute(HISTORY_ENDPOINTS.clear, { userId });
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
