import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as portal } from '@/app/api/billing/portal/route';
import { ACCOUNT_COOKIE_NAME, buildAccountCookieValue } from '@/lib/auth/accountCookie';

function buildRequest(accountId?: string) {
  const headers = new Headers();
  if (accountId) {
    headers.set('cookie', `${ACCOUNT_COOKIE_NAME}=${buildAccountCookieValue(accountId)}`);
  }
  return new Request('http://localhost', { method: 'POST', headers });
}

const { getPayPalClientMock, createSubscriptionMock, createPortalMock } = vi.hoisted(() => {
  const subscriptionFn = vi.fn(async () => ({
    id: 'sub_test',
    links: [{ rel: 'approve', href: 'https://paypal.test/checkout' }],
  }));
  const portalFn = vi.fn(async () => ({ url: 'https://paypal.test/portal' }));
  const getClient = vi.fn(() => ({
    createSubscription: subscriptionFn,
    createPortalSession: portalFn,
  }));
  return { getPayPalClientMock: getClient, createSubscriptionMock: subscriptionFn, createPortalMock: portalFn };
});

vi.mock('@/app/api/_lib/paypalClient', () => ({
  getPayPalClient: getPayPalClientMock,
}));

const {
  getPolarClientMock,
  polarCheckoutCreateMock,
  polarPortalSessionMock,
} = vi.hoisted(() => {
  const checkoutFn = vi.fn(async () => ({ url: 'https://polar.test/checkout' }));
  const portalFn = vi.fn(async () => ({ customerPortalUrl: 'https://polar.test/portal' }));
  const getClient = vi.fn(() => ({
    client: {
      checkouts: { create: checkoutFn },
      customerSessions: { create: portalFn },
    },
    organizationId: 'org_test',
    environment: 'sandbox',
  }));
  return {
    getPolarClientMock: getClient,
    polarCheckoutCreateMock: checkoutFn,
    polarPortalSessionMock: portalFn,
  };
});

vi.mock('@/app/api/_lib/polarClient', () => ({
  getPolarClient: getPolarClientMock,
}));

describe('Billing actions API', () => {
  beforeEach(() => {
    createSubscriptionMock.mockClear();
    createPortalMock.mockClear();
    getPayPalClientMock.mockReturnValue({
      createSubscription: createSubscriptionMock,
      createPortalSession: createPortalMock,
    });
    polarCheckoutCreateMock.mockClear();
    polarPortalSessionMock.mockClear();
    getPolarClientMock.mockReset();
    getPolarClientMock.mockReturnValue(null);
    delete process.env.BILLING_PROVIDER;
  });

  afterEach(() => {
    getPayPalClientMock.mockReset();
    getPolarClientMock.mockReset();
    delete process.env.BILLING_PROVIDER;
  });

  it('rejects calls without account id', async () => {
    const response = await checkout(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(400);
  });

  it('returns checkout payload and updates account', async () => {
    const response = await checkout(buildRequest('acct-123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.planTier).toBe('starter');
    expect(body.checkoutUrl).toContain('https://paypal.test/checkout');
    expect(createSubscriptionMock).toHaveBeenCalled();
  });

  it('returns portal payload', async () => {
    const response = await portal(buildRequest('acct-123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.portalUrl).toContain('https://paypal.test/portal');
    expect(createPortalMock).toHaveBeenCalled();
  });

  it('returns informative message when Polar customer is missing', async () => {
    process.env.BILLING_PROVIDER = 'polar';
    getPolarClientMock.mockReturnValue({
      client: {
        checkouts: { create: polarCheckoutCreateMock },
        customerSessions: { create: polarPortalSessionMock },
      },
      organizationId: 'org_test',
      environment: 'sandbox',
    });

    const response = await portal(buildRequest('acct-123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.portalUrl).toBeNull();
    expect(body.message).toMatch(/polar customer not linked/i);
    expect(polarPortalSessionMock).not.toHaveBeenCalled();
  });
});
