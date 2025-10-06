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
});
