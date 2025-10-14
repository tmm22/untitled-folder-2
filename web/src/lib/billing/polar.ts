import { getPolarClient } from '@/app/api/_lib/polarClient';
import type { BillingResult, CheckoutRequest } from './paypal';

const DEFAULT_SUCCESS_MESSAGE = 'Subscription updated.';

function resolvePlanId(planTier: string): string | null {
  const tierKey = `POLAR_PLAN_ID_${planTier.toUpperCase()}`;
  const tierValue = process.env[tierKey]?.trim();
  if (tierValue) {
    return tierValue;
  }
  const fallback = process.env.POLAR_PLAN_ID?.trim();
  return fallback ?? null;
}

function resolveSuccessUrl(): string {
  return process.env.POLAR_CHECKOUT_SUCCESS_URL?.trim() ?? 'https://example.com/billing/success';
}

function resolveCustomerPortalFallback(): string | null {
  return process.env.POLAR_CUSTOMER_PORTAL_URL?.trim() ?? null;
}

function buildCheckoutMetadata(request: CheckoutRequest) {
  return {
    accountId: request.userId,
    planTier: request.planTier,
    source: 'web_app',
  };
}

export function isPolarConfigured(): boolean {
  return Boolean(getPolarClient());
}

export async function createCheckoutSession(request: CheckoutRequest): Promise<BillingResult> {
  const configuration = getPolarClient();
  if (!configuration) {
    return {
      ok: false,
      url: null,
      message: 'Polar not configured; using application default upgrade flow.',
    };
  }

  const planId = resolvePlanId(request.planTier);
  if (!planId) {
    return {
      ok: false,
      url: null,
      message: 'Polar plan mapping is not configured.',
    };
  }

  try {
    const checkout = await configuration.client.checkouts.create({
      products: [planId],
      successUrl: resolveSuccessUrl(),
      metadata: buildCheckoutMetadata(request),
      externalCustomerId: request.userId,
    });

    return {
      ok: Boolean(checkout?.url),
      url: checkout?.url ?? null,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('Polar checkout session creation failed', error);
    return { ok: false, url: null, message: 'Unable to create Polar checkout session.' };
  }
}

export async function createBillingPortalSession(customerExternalId: string): Promise<BillingResult> {
  const configuration = getPolarClient();
  if (!configuration) {
    return {
      ok: false,
      url: null,
      message: 'Polar not configured; using application default portal flow.',
    };
  }

  try {
    const session = await configuration.client.customerSessions.create({
      externalCustomerId: customerExternalId,
    });

    const portalUrl = session.customerPortalUrl ?? resolveCustomerPortalFallback();

    return {
      ok: Boolean(portalUrl),
      url: portalUrl,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('Polar customer portal session creation failed', error);
    return { ok: false, url: null, message: 'Unable to access Polar customer portal.' };
  }
}
