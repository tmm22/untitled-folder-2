declare module 'stripe' {
  export interface StripeConfig {
    apiVersion: string;
  }

  export interface StripeCheckoutSession {
    url?: string | null;
  }

  export interface StripeBillingPortalSession {
    url?: string | null;
  }

  export interface StripeCheckout {
    sessions: {
      create(input: Record<string, unknown>): Promise<StripeCheckoutSession>;
    };
  }

  export interface StripeBillingPortal {
    sessions: {
      create(input: Record<string, unknown>): Promise<StripeBillingPortalSession>;
    };
  }

  export default class Stripe {
    constructor(apiKey: string, config: StripeConfig);
    checkout: StripeCheckout;
    billingPortal: StripeBillingPortal;
  }
}
