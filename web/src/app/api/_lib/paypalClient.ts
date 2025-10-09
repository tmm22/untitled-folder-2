import { secureFetchJson } from '@/lib/fetch/secureFetch';

interface PayPalAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalCreateSubscriptionRequest {
  planId: string;
  userId: string;
  planTier: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayPalSubscriptionResponse {
  id: string;
  status?: string;
  links?: PayPalLink[];
}

export interface PayPalPortalSession {
  url: string | null;
  message?: string;
}

export interface PayPalClient {
  createSubscription(request: PayPalCreateSubscriptionRequest): Promise<PayPalSubscriptionResponse>;
  createPortalSession(customerId: string): Promise<PayPalPortalSession>;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const PAYPAL_ENV_SANDBOX = 'sandbox';
const PAYPAL_ENV_LIVE = 'live';
const PAYPAL_BASE_URL: Record<string, string> = {
  [PAYPAL_ENV_SANDBOX]: 'https://api-m.sandbox.paypal.com',
  [PAYPAL_ENV_LIVE]: 'https://api-m.paypal.com',
};

class HttpPayPalClient implements PayPalClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private tokenCache: CachedToken | null = null;

  constructor(options: { baseUrl: string; clientId: string; clientSecret: string }) {
    this.baseUrl = options.baseUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.value;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const url = `${this.baseUrl}/v1/oauth2/token`;

    const payload = await secureFetchJson<PayPalAccessTokenResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const expiresAt = now + Math.max(0, payload.expires_in - 60) * 1000;
    this.tokenCache = {
      value: payload.access_token,
      expiresAt,
    };
    return payload.access_token;
  }

  async createSubscription(request: PayPalCreateSubscriptionRequest): Promise<PayPalSubscriptionResponse> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/v1/billing/subscriptions`;
    const payload = await secureFetchJson<PayPalSubscriptionResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        plan_id: request.planId,
        custom_id: request.userId,
        application_context: {
          brand_name: 'TextToSpeech Managed Service',
          user_action: 'SUBSCRIBE_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: request.returnUrl,
          cancel_url: request.cancelUrl,
        },
      }),
    });
    return payload;
  }

  async createPortalSession(customerId: string): Promise<PayPalPortalSession> {
    const template = process.env.PAYPAL_PORTAL_URL ?? 'https://www.paypal.com/myaccount/autopay/';
    const resolved = template.includes('{customerId}')
      ? template.replace('{customerId}', encodeURIComponent(customerId))
      : template;
    return {
      url: resolved,
      message: 'Manage your subscription in the PayPal billing portal.',
    };
  }
}

const globalPayPal = globalThis as unknown as {
  __appPayPalClient?: PayPalClient;
};

function resolveEnvironment(): { baseUrl: string; clientId: string; clientSecret: string } | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  const env = process.env.PAYPAL_ENVIRONMENT?.toLowerCase() ?? PAYPAL_ENV_SANDBOX;
  const baseUrl = PAYPAL_BASE_URL[env] ?? PAYPAL_BASE_URL[PAYPAL_ENV_SANDBOX];
  return { baseUrl, clientId, clientSecret };
}

function createPayPalClient(): PayPalClient | null {
  if (globalPayPal.__appPayPalClient) {
    return globalPayPal.__appPayPalClient;
  }

  const config = resolveEnvironment();
  if (!config) {
    return null;
  }

  const client = new HttpPayPalClient(config);
  globalPayPal.__appPayPalClient = client;
  return client;
}

export function getPayPalClient(): PayPalClient | null {
  return createPayPalClient();
}

export function overridePayPalClient(client: PayPalClient | null) {
  if (client) {
    globalPayPal.__appPayPalClient = client;
  } else {
    delete globalPayPal.__appPayPalClient;
  }
}
