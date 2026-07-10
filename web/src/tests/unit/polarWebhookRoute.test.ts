import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

class MockWebhookVerificationError extends Error {}

const {
  validatePolarEventMock,
  getAccountRepositoryMock,
  getProvisioningOrchestratorMock,
  getProvisioningStoreMock,
  issueCredentialMock,
} = vi.hoisted(() => {
  const issueCredential = vi.fn();
  return {
    validatePolarEventMock: vi.fn(),
    getAccountRepositoryMock: vi.fn(() => ({
      getOrCreate: vi.fn(async () => ({
        userId: 'acct_123',
        planTier: 'free',
        billingStatus: 'free',
      })),
      updateAccount: vi.fn(async (payload) => ({
        ...payload,
      })),
    })),
    getProvisioningOrchestratorMock: vi.fn(() => ({
      issueCredential,
      revokeCredential: vi.fn(),
    })),
    getProvisioningStoreMock: vi.fn(() => ({
      list: vi.fn(async () => []),
    })),
    issueCredentialMock: issueCredential,
  };
});

vi.mock('@/app/api/_lib/polarWebhook', () => ({
  validatePolarEvent: validatePolarEventMock,
  PolarWebhookVerificationError: MockWebhookVerificationError,
}));

vi.mock('@/app/api/account/context', () => ({
  getAccountRepository: getAccountRepositoryMock,
}));

vi.mock('@/app/api/provisioning/context', () => ({
  getProvisioningOrchestrator: getProvisioningOrchestratorMock,
  getProvisioningStore: getProvisioningStoreMock,
}));

let POST: typeof import('@/app/api/billing/polar/events/route').POST;
const originalEnv = { ...process.env };

describe('Polar webhook route', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    POST = (await import('@/app/api/billing/polar/events/route')).POST;
    process.env = { ...originalEnv };
    issueCredentialMock.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 500 when webhook secret is missing', async () => {
    delete process.env.POLAR_WEBHOOK_SECRET;
    const response = await POST(new Request('http://localhost/api/billing/polar/events', { method: 'POST' }));
    expect(response.status).toBe(500);
    expect(validatePolarEventMock).not.toHaveBeenCalled();
  });

  it('returns 401 when signature validation fails', async () => {
    process.env.POLAR_WEBHOOK_SECRET = 'secret';
    validatePolarEventMock.mockImplementation(() => {
      throw new MockWebhookVerificationError('invalid');
    });

    const response = await POST(
      new Request('http://localhost/api/billing/polar/events', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('updates account and triggers provisioning on subscription events', async () => {
    process.env.POLAR_WEBHOOK_SECRET = 'secret';
    process.env.POLAR_PLAN_ID_STARTER = 'prod_starter';

    validatePolarEventMock.mockReturnValue({
      id: 'evt_1',
      type: 'subscription.active',
      data: {
        id: 'sub_1',
        status: 'active',
        customerId: 'cust_1',
        productId: 'prod_starter',
        currentPeriodEnd: Date.now() + 86_400_000,
        metadata: {
          accountId: 'acct_123',
          planTier: 'starter',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/billing/polar/events', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(202);
    const repoResult = getAccountRepositoryMock.mock.results.at(-1);
    expect(repoResult?.value).toBeDefined();
    const repoInstance = repoResult!.value as {
      updateAccount: Mock;
    };
    expect(repoInstance.updateAccount).toHaveBeenCalled();
    const updateArgs = repoInstance.updateAccount.mock.calls.at(-1)?.[0];
    expect(updateArgs).toMatchObject({
      userId: 'acct_123',
      planTier: 'starter',
      billingStatus: 'active',
      polarSubscriptionId: 'sub_1',
      polarLastEventId: 'evt_1',
    });
    expect(issueCredentialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'acct_123',
        planTier: 'starter',
        provider: 'openAI',
      }),
    );
  });

  it('handles snake_case payloads as delivered by Polar', async () => {
    process.env.POLAR_WEBHOOK_SECRET = 'secret';
    process.env.POLAR_PLAN_ID_STARTER = 'prod_starter';

    const periodEnd = new Date(Date.now() + 86_400_000).toISOString();
    validatePolarEventMock.mockReturnValue({
      id: 'evt_2',
      type: 'subscription.active',
      data: {
        id: 'sub_2',
        status: 'active',
        customer_id: 'cust_2',
        product_id: 'prod_starter',
        current_period_end: periodEnd,
        customer: { external_id: 'acct_123' },
        metadata: {
          planTier: 'starter',
        },
      },
    });

    const response = await POST(
      new Request('http://localhost/api/billing/polar/events', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(202);
    const repoInstance = getAccountRepositoryMock.mock.results.at(-1)!.value as {
      updateAccount: Mock;
    };
    expect(repoInstance.updateAccount).toHaveBeenCalled();
    const updateArgs = repoInstance.updateAccount.mock.calls.at(-1)?.[0];
    expect(updateArgs).toMatchObject({
      userId: 'acct_123',
      polarCustomerId: 'cust_2',
      polarSubscriptionId: 'sub_2',
      polarCurrentPeriodEnd: Date.parse(periodEnd),
      polarLastEventId: 'evt_2',
    });
    expect(updateArgs.premiumExpiresAt).toBe(Date.parse(periodEnd));
  });
});
