import { getPayPalClient } from '@/app/api/_lib/paypalClient';
import type {
  PayPalCreateSubscriptionRequest,
  PayPalSubscriptionResponse,
} from '@/app/api/_lib/paypalClient';

export interface CheckoutRequest {
  userId: string;
  planTier: string;
}

export interface BillingResult {
  ok: boolean;
  url?: string | null;
  message?: string;
}

const DEFAULT_SUCCESS_MESSAGE = 'Subscription updated.';

function resolvePlanId(planTier: string): string {
  const tierKey = `PAYPAL_PLAN_ID_${planTier.toUpperCase()}`;
  return process.env[tierKey]?.trim() ?? process.env.PAYPAL_PLAN_ID?.trim() ?? 'plan_placeholder';
}

function extractApprovalUrl(response: PayPalSubscriptionResponse): string | null {
  if (!response.links) {
    return null;
  }
  const approvalLink = response.links.find((link) => link.rel === 'approve');
  return approvalLink?.href ?? null;
}

export async function createCheckoutSession(request: CheckoutRequest): Promise<BillingResult> {
  const client = getPayPalClient();
  if (!client) {
    return { ok: false, url: null, message: 'PayPal not configured; using application default upgrade flow.' };
  }

  const payload: PayPalCreateSubscriptionRequest = {
    planId: resolvePlanId(request.planTier),
    userId: request.userId,
    planTier: request.planTier,
    returnUrl: process.env.PAYPAL_SUCCESS_URL ?? 'https://example.com/billing/success',
    cancelUrl: process.env.PAYPAL_CANCEL_URL ?? 'https://example.com/billing/cancel',
  };

  try {
    const subscription = await client.createSubscription(payload);
    const approvalUrl = extractApprovalUrl(subscription);

    return {
      ok: Boolean(approvalUrl),
      url: approvalUrl,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('PayPal subscription creation failed', error);
    return { ok: false, url: null, message: 'Unable to create PayPal subscription.' };
  }
}

export async function createBillingPortalSession(customerId: string): Promise<BillingResult> {
  const client = getPayPalClient();
  if (!client) {
    return { ok: false, url: null, message: 'PayPal not configured; using application default portal flow.' };
  }

  try {
    const portal = await client.createPortalSession(customerId);
    return {
      ok: Boolean(portal.url),
      url: portal.url,
      message: portal.message ?? DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('PayPal portal session creation failed', error);
    return { ok: false, url: null, message: 'Unable to access PayPal billing portal.' };
  }
}
