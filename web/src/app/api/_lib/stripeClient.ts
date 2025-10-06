import type Stripe from 'stripe';

const STRIPE_API_VERSION = '2024-06-20';

const globalStripe = globalThis as unknown as {
  __appStripeClient?: Stripe;
};

export function getStripeClient(StripeCtor?: typeof import('stripe').default): Stripe | null {
  if (globalStripe.__appStripeClient) {
    return globalStripe.__appStripeClient;
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return null;
  }

  if (!StripeCtor) {
    try {
      // Dynamically import only when needed to avoid bundling stripe in the client build
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const stripeModule = require('stripe');
      StripeCtor = stripeModule.default ?? stripeModule;
    } catch (error) {
      console.error('Stripe SDK not available:', error);
      return null;
    }
  }

  const client = new StripeCtor(secret, { apiVersion: STRIPE_API_VERSION });
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
