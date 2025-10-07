import type { AccountPayload, AccountUsageSummary } from './types';

export interface AccountRepository {
  getOrCreate(userId: string): Promise<AccountPayload>;
  updateAccount(payload: AccountPayload): Promise<AccountPayload>;
  recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload>;
}

interface ConvexAccountRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
  fetchImpl?: typeof fetch;
}

interface ConvexResponse<T> {
  result: T;
}

const DEFAULT_FREE_ALLOWANCE = 50_000;
const DEFAULT_STARTER_ALLOWANCE = 200_000;

const allowanceByTier: Record<string, number> = {
  free: DEFAULT_FREE_ALLOWANCE,
  trial: DEFAULT_STARTER_ALLOWANCE,
  starter: DEFAULT_STARTER_ALLOWANCE,
  pro: 500_000,
  enterprise: 2_000_000,
};

const now = () => Date.now();

export class ConvexAccountRepository implements AccountRepository {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly authScheme: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexAccountRepositoryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authToken = options.authToken;
    this.authScheme = options.authScheme ?? 'Bearer';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async executeRequest<T>(url: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `${this.authScheme} ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Convex account request failed (${response.status}): ${errorBody}`);
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

  private buildUrlCandidates(path: string): string[] {
    const suffixes = [
      `/api/account/${path}`,
      `/account/${path}`,
      `/api/http/account/${path}`,
      `/http/account/${path}`,
    ];

    return suffixes.map((suffix) => {
      try {
        return new URL(suffix, this.baseUrl).toString();
      } catch {
        return `${this.baseUrl.replace(/\/$/, '')}${suffix}`;
      }
    });
  }

  private async requestWithFallback<T>(paths: string[], body: unknown): Promise<T> {
    let notFoundError: Error | null = null;
    for (const path of paths) {
      for (const url of this.buildUrlCandidates(path)) {
        try {
          return await this.executeRequest<T>(url, body);
        } catch (error) {
          const sanitizedUrl = (() => {
            try {
              const candidate = new URL(url);
              return `${candidate.origin}${candidate.pathname}`;
            } catch {
              return url;
            }
          })();
          const isNotFoundError =
            error instanceof Error && /Convex account request failed \(404\)/.test(error.message);
          if (isNotFoundError) {
            console.warn('[ConvexAccountRepository] HTTP 404 when calling', sanitizedUrl);
            notFoundError = error;
            continue;
          }
          console.error('[ConvexAccountRepository] Request failed for', sanitizedUrl, error);
          throw error;
        }
      }
    }

    if (notFoundError) {
      throw notFoundError;
    }

    throw new Error('Convex account request failed: no routes responded successfully');
  }

  async getOrCreate(userId: string): Promise<AccountPayload> {
    const result = await this.requestWithFallback<{ account: AccountPayload }>(['getOrCreate'], { userId });
    return result.account;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const result = await this.requestWithFallback<{ account: AccountPayload }>(['update', 'updateAccount'], {
      payload,
    });
    return result.account;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const result = await this.requestWithFallback<{ account: AccountPayload }>(['recordUsage'], {
      userId,
      provider,
      tokensUsed,
    });
    return result.account;
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly records = new Map<string, AccountPayload & { usage: AccountUsageSummary }>();

  async getOrCreate(userId: string): Promise<AccountPayload> {
    const existing = this.records.get(userId);
    if (existing) {
      return existing;
    }
    const payload: AccountPayload & { usage: AccountUsageSummary } = {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
    this.records.set(userId, payload);
    return payload;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const allowance = allowanceByTier[payload.planTier] ?? DEFAULT_STARTER_ALLOWANCE;
    const record = await this.getOrCreate(payload.userId);
    const updated: AccountPayload & { usage: AccountUsageSummary } = {
      userId: payload.userId,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt,
      usage: {
        monthTokensUsed: record.usage?.monthTokensUsed ?? 0,
        monthlyAllowance: allowance,
        lastUpdated: now(),
      },
    };
    this.records.set(payload.userId, updated);
    return updated;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const record = await this.getOrCreate(userId);
    const allowance = allowanceByTier[record.planTier] ?? DEFAULT_STARTER_ALLOWANCE;
    const updated: AccountPayload & { usage: AccountUsageSummary } = {
      ...record,
      usage: {
        monthTokensUsed: (record.usage?.monthTokensUsed ?? 0) + tokensUsed,
        monthlyAllowance: allowance,
        lastUpdated: now(),
      },
    };
    this.records.set(userId, updated);
    return updated;
  }
}

export class JsonMockAccountRepository implements AccountRepository {
  async getOrCreate(userId: string): Promise<AccountPayload> {
    return {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      usage: {
        monthTokensUsed: 0,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    return {
      userId: payload.userId,
      planTier: payload.planTier,
      billingStatus: payload.billingStatus,
      premiumExpiresAt: payload.premiumExpiresAt,
      usage: payload.usage ?? {
        monthTokensUsed: 0,
        monthlyAllowance: allowanceByTier[payload.planTier] ?? DEFAULT_STARTER_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    return {
      userId,
      planTier: 'free',
      billingStatus: 'free',
      usage: {
        monthTokensUsed: tokensUsed,
        monthlyAllowance: DEFAULT_FREE_ALLOWANCE,
        lastUpdated: now(),
      },
    };
  }
}
