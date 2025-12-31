import { getPayPalClient } from '@/app/api/_lib/paypalClient';
import type {
  PayPalCreateSubscriptionRequest,
  PayPalSubscriptionResponse,
} from '@/app/api/_lib/paypalClient';
import type { BillingPortalRequest, BillingResult, CheckoutRequest } from './types';

const DEFAULT_SUCCESS_MESSAGE = 'Subscription updated.';

function resolveReturnUrls(): { returnUrl: string; cancelUrl: string } | null {
  const returnUrl = process.env.PAYPAL_SUCCESS_URL?.trim();
  const cancelUrl = process.env.PAYPAL_CANCEL_URL?.trim();

  if (returnUrl && cancelUrl) {
    return { returnUrl, cancelUrl };
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('[BILLING] PAYPAL_SUCCESS_URL and PAYPAL_CANCEL_URL must be configured in production');
    return null;
  }

  return {
    returnUrl: returnUrl ?? 'http://localhost:3000/billing/success',
    cancelUrl: cancelUrl ?? 'http://localhost:3000/billing/cancel',
  };
}

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

  const urls = resolveReturnUrls();
  if (!urls) {
    return { ok: false, url: null, message: 'PayPal return URLs not configured.' };
  }

  const payload: PayPalCreateSubscriptionRequest = {
    planId: resolvePlanId(request.planTier),
    userId: request.userId,
    planTier: request.planTier,
    returnUrl: urls.returnUrl,
    cancelUrl: urls.cancelUrl,
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

export async function createBillingPortalSession(request: BillingPortalRequest): Promise<BillingResult> {
  const client = getPayPalClient();
  if (!client) {
    return { ok: false, url: null, message: 'PayPal not configured; using application default portal flow.' };
  }

  const customerId =
    request.customerId?.trim() ??
    request.externalCustomerId?.trim() ??
    request.providerCustomerId?.trim() ??
    null;
  if (!customerId) {
    return { ok: false, url: null, message: 'PayPal customer reference is unavailable for this account.' };
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
