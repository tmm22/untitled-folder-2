import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as portal } from '@/app/api/billing/portal/route';

function buildRequest(headers: Record<string, string>) {
  return new Request('http://localhost', { method: 'POST', headers });
}

const { getStripeClientMock, createCheckoutMock, createPortalMock } = vi.hoisted(() => {
  const checkoutFn = vi.fn(async () => ({ id: 'cs_test', url: 'https://stripe.test/checkout' }));
  const portalFn = vi.fn(async () => ({ url: 'https://stripe.test/portal' }));
  const getClient = vi.fn(() => ({
    checkout: { sessions: { create: checkoutFn } },
    billingPortal: { sessions: { create: portalFn } },
  }));
  return { getStripeClientMock: getClient, createCheckoutMock: checkoutFn, createPortalMock: portalFn };
});

vi.mock('@/app/api/_lib/stripeClient', () => ({
  getStripeClient: getStripeClientMock,
}));

describe('Billing actions API', () => {
  beforeEach(() => {
    createCheckoutMock.mockClear();
    createPortalMock.mockClear();
    getStripeClientMock.mockReturnValue({
      checkout: { sessions: { create: createCheckoutMock } },
      billingPortal: { sessions: { create: createPortalMock } },
    });
  });

  afterEach(() => {
    getStripeClientMock.mockReset();
  });

  it('rejects calls without account id', async () => {
    const response = await checkout(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(400);
  });

  it('returns checkout payload and updates account', async () => {
    const response = await checkout(buildRequest({ 'x-account-id': 'acct-123' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.planTier).toBe('starter');
    expect(body.checkoutUrl).toContain('https://stripe.test/checkout');
    expect(createCheckoutMock).toHaveBeenCalled();
  });

  it('returns portal payload', async () => {
    const response = await portal(buildRequest({ 'x-account-id': 'acct-123' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.portalUrl).toContain('https://stripe.test/portal');
    expect(createPortalMock).toHaveBeenCalled();
  });
});
