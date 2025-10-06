import type { AccountPayload, AccountUsageSummary } from './types';

export interface AccountRepository {
  getOrCreate(userId: string): Promise<AccountPayload>;
  updateAccount(payload: AccountPayload): Promise<AccountPayload>;
  recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload>;
}

interface ConvexAccountRepositoryOptions {
  baseUrl: string;
  adminKey: string;
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
  private readonly adminKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConvexAccountRepositoryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.adminKey = options.adminKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/account/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.adminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Convex account request failed (${response.status}): ${errorBody}`);
    }

    const payload = (await response.json().catch(() => ({}))) as ConvexResponse<T> | T;
    if (payload && typeof payload === 'object' && 'result' in payload) {
      return (payload as ConvexResponse<T>).result;
    }
    return payload as T;
  }

  async getOrCreate(userId: string): Promise<AccountPayload> {
    const result = await this.request<{ account: AccountPayload }>('getOrCreate', { userId });
    return result.account;
  }

  async updateAccount(payload: AccountPayload): Promise<AccountPayload> {
    const result = await this.request<{ account: AccountPayload }>('updateAccount', { payload });
    return result.account;
  }

  async recordUsage(userId: string, provider: string, tokensUsed: number): Promise<AccountPayload> {
    const result = await this.request<{ account: AccountPayload }>('recordUsage', {
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
