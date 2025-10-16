export interface CheckoutRequest {
  userId: string;
  planTier: string;
}

export interface BillingPortalRequest {
  /**
   * Identifier used by the legacy billing provider (PayPal) or a generic fallback.
   */
  customerId?: string | null;
  /**
   * External identifier used when creating Polar resources.
   */
  externalCustomerId?: string | null;
  /**
   * Provider-issued customer identifier (e.g. Polar customer ID) if available.
   */
  providerCustomerId?: string | null;
}

export interface BillingResult {
  ok: boolean;
  url?: string | null;
  message?: string;
}
