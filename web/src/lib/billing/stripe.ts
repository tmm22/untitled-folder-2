import { getStripeClient } from '@/app/api/_lib/stripeClient';

interface CheckoutRequest {
  userId: string;
  planTier: string;
}

interface BillingResult {
  ok: boolean;
  url?: string | null;
  message?: string;
}

const DEFAULT_SUCCESS_MESSAGE = 'Subscription updated.';

export async function createCheckoutSession(request: CheckoutRequest): Promise<BillingResult> {
  const stripeClient = getStripeClient();
  if (!stripeClient) {
    return { ok: false, url: null, message: 'Stripe not configured; using application default upgrade flow.' };
  }

  try {
    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      metadata: { userId: request.userId, planTier: request.planTier },
      success_url: process.env.STRIPE_SUCCESS_URL ?? 'https://example.com/billing/success',
      cancel_url: process.env.STRIPE_CANCEL_URL ?? 'https://example.com/billing/cancel',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID ?? 'price_placeholder',
          quantity: 1,
        },
      ],
    });

    return {
      ok: true,
      url: session.url ?? null,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('Stripe checkout session creation failed', error);
    return { ok: false, url: null, message: 'Unable to create Stripe checkout session.' };
  }
}

export async function createBillingPortalSession(customerId: string): Promise<BillingResult> {
  const stripeClient = getStripeClient();
  if (!stripeClient) {
    return { ok: false, url: null, message: 'Stripe not configured; using application default portal flow.' };
  }

  try {
    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? 'https://example.com/billing/return',
    });

    return {
      ok: true,
      url: session.url ?? null,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  } catch (error) {
    console.error('Stripe billing portal session creation failed', error);
    return { ok: false, url: null, message: 'Unable to create Stripe billing portal session.' };
  }
}
