import { describe, expect, it } from 'vitest';
import { InMemoryAccountRepository } from '@/lib/account/repository';

describe('InMemoryAccountRepository', () => {
  it('records usage per period and updates allowance', async () => {
    const repo = new InMemoryAccountRepository();
    const account = await repo.recordUsage('user-1', 'openai', 1234);
    expect(account.usage?.monthTokensUsed).toBe(1234);
    expect(account.planTier).toBe('free');
  });

  it('updates plan and adjusts allowance', async () => {
    const repo = new InMemoryAccountRepository();
    await repo.updateAccount({ userId: 'user-2', planTier: 'starter', billingStatus: 'active' });
    const account = await repo.getOrCreate('user-2');
    expect(account.planTier).toBe('starter');
    expect(account.usage?.monthlyAllowance).toBeGreaterThan(50_000);
  });

  it('atomically rejects usage reservations beyond the account allowance', async () => {
    const repo = new InMemoryAccountRepository();
    const accepted = await repo.reserveUsage('user-3', 'openAI', 49_999);
    const rejected = await repo.reserveUsage('user-3', 'openAI', 2);

    expect(accepted?.usage?.monthTokensUsed).toBe(49_999);
    expect(rejected).toBeNull();
    expect((await repo.getOrCreate('user-3')).usage?.monthTokensUsed).toBe(49_999);
  });
});
