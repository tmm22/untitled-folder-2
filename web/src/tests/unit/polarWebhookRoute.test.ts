import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

class MockWebhookVerificationError extends Error {}

const {
  validateEventMock,
  getAccountRepositoryMock,
  getProvisioningOrchestratorMock,
  getProvisioningStoreMock,
  issueCredentialMock,
} = vi.hoisted(() => {
  const issueCredential = vi.fn();
  return {
    validateEventMock: vi.fn(),
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

vi.mock('@polar-sh/sdk/webhooks', () => ({
  validateEvent: validateEventMock,
  WebhookVerificationError: MockWebhookVerificationError,
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
    expect(validateEventMock).not.toHaveBeenCalled();
  });

  it('returns 401 when signature validation fails', async () => {
    process.env.POLAR_WEBHOOK_SECRET = 'secret';
    validateEventMock.mockImplementation(() => {
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

    validateEventMock.mockReturnValue({
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
        provider: 'openai',
      }),
    );
  });
});
