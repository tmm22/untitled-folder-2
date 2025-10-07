import type { SessionRecord, SessionStore } from '../types';

interface ConvexSessionStoreOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

function buildHeaders(token: string, scheme: string): HeadersInit {
  return {
    Authorization: `${scheme} ${token}`,
    'Content-Type': 'application/json',
  };
}

export class ConvexSessionStore implements SessionStore {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexSessionStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
    this.authScheme = options.authScheme ?? 'Bearer';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/session/${path}`, {
      method: 'POST',
      headers: buildHeaders(this.authToken, this.authScheme),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Convex session request failed (${response.status}): ${errorBody}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = (await response.json().catch(() => ({}))) as ConvexResponse<T> | T;
    if (payload && typeof payload === 'object' && 'result' in payload) {
      return (payload as ConvexResponse<T>).result;
    }
    return payload as T;
  }

  async save(record: SessionRecord): Promise<void> {
    await this.request('save', { record });
  }

  async find(id: string): Promise<SessionRecord | null> {
    const result = await this.request<{ session: SessionRecord | null }>('get', { sessionId: id });
    return result.session;
  }

  async delete(id: string): Promise<void> {
    await this.request('delete', { sessionId: id });
  }

  async prune(now: number): Promise<void> {
    await this.request('prune', { now });
  }
}
