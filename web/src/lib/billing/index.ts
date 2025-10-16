import * as paypal from './paypal';
import * as polar from './polar';
import type { BillingPortalRequest, BillingResult, CheckoutRequest } from './types';

type BillingProvider = 'paypal' | 'polar';

function resolveBillingProvider(): BillingProvider {
  const provider = process.env.BILLING_PROVIDER?.trim().toLowerCase();
  if (provider === 'polar') {
    if (!polar.isPolarConfigured()) {
      console.warn('Polar billing selected but configuration appears incomplete.');
    }
    return 'polar';
  }
  return 'paypal';
}

export type { BillingResult, CheckoutRequest, BillingPortalRequest };

export async function createCheckoutSession(request: CheckoutRequest): Promise<BillingResult> {
  const provider = resolveBillingProvider();
  if (provider === 'polar') {
    return polar.createCheckoutSession(request);
  }
  return paypal.createCheckoutSession(request);
}

export async function createBillingPortalSession(request: BillingPortalRequest): Promise<BillingResult> {
  const provider = resolveBillingProvider();
  if (provider === 'polar') {
    return polar.createBillingPortalSession(request);
  }
  return paypal.createBillingPortalSession(request);
}
