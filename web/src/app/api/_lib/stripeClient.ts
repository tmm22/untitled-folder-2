import type Stripe from 'stripe';

const STRIPE_API_VERSION = '2024-06-20';
const STRIPE_MODULE_ID = 'stri' + 'pe';

const globalStripe = globalThis as unknown as {
  __appStripeClient?: Stripe;
};

function loadStripeCtor(): typeof import('stripe').default | null {
  try {
    if (typeof require !== 'function') {
      return null;
    }

    // Compute the module identifier to avoid static analysis pulling the optional dependency into client bundles.
    const stripeModule = require(STRIPE_MODULE_ID);
    return stripeModule.default ?? stripeModule;
  } catch (error) {
    console.error('Stripe SDK not available:', error);
    return null;
  }
}

export function getStripeClient(StripeCtor?: typeof import('stripe').default): Stripe | null {
  if (globalStripe.__appStripeClient) {
    return globalStripe.__appStripeClient;
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return null;
  }

  const ctor = StripeCtor ?? loadStripeCtor();
  if (!ctor) {
    return null;
  }

  const client = new ctor(secret, { apiVersion: STRIPE_API_VERSION });
  globalStripe.__appStripeClient = client;
  return client;
}

export function overrideStripeClient(client: Stripe | null) {
  if (client) {
    globalStripe.__appStripeClient = client;
  } else {
    delete globalStripe.__appStripeClient;
  }
}
