type PolarEnvironment = 'sandbox' | 'production';

interface PolarCheckoutRequest {
  products: string[];
  successUrl: string;
  metadata: Record<string, string>;
  externalCustomerId: string;
}

interface PolarCheckoutResponse {
  url?: string | null;
}

interface PolarCustomerSessionRequest {
  customerId?: string;
  externalCustomerId?: string;
}

interface PolarCustomerSessionResponse {
  customerPortalUrl?: string | null;
}

interface PolarClient {
  checkouts: {
    create(request: PolarCheckoutRequest): Promise<PolarCheckoutResponse>;
  };
  customerSessions: {
    create(request: PolarCustomerSessionRequest): Promise<PolarCustomerSessionResponse>;
  };
}

interface PolarClientHandle {
  client: PolarClient;
  organizationId: string;
  environment: PolarEnvironment;
}

const globalState = globalThis as unknown as {
  __appPolarClient?: PolarClientHandle;
};

function resolveEnvironment(): PolarEnvironment {
  const value = process.env.POLAR_ENVIRONMENT?.trim().toLowerCase();
  if (value === 'production') {
    return 'production';
  }
  return 'sandbox';
}

function resolveBaseUrl(environment: PolarEnvironment): string {
  return environment === 'production' ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
}

function toCheckoutPayload(request: PolarCheckoutRequest) {
  return {
    products: request.products,
    success_url: request.successUrl,
    metadata: request.metadata,
    external_customer_id: request.externalCustomerId,
  };
}

function toCustomerSessionPayload(request: PolarCustomerSessionRequest) {
  return {
    customer_id: request.customerId,
    external_customer_id: request.externalCustomerId,
  };
}

async function postPolar<TResponse>(
  baseUrl: string,
  accessToken: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Polar request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as TResponse;
}

function createRestClient(accessToken: string, environment: PolarEnvironment): PolarClient {
  const baseUrl = resolveBaseUrl(environment);
  return {
    checkouts: {
      async create(request) {
        const response = await postPolar<{ url?: string | null }>(
          baseUrl,
          accessToken,
          '/v1/checkouts/',
          toCheckoutPayload(request),
        );
        return { url: response.url ?? null };
      },
    },
    customerSessions: {
      async create(request) {
        const response = await postPolar<{ customer_portal_url?: string | null; customerPortalUrl?: string | null }>(
          baseUrl,
          accessToken,
          '/v1/customer-sessions/',
          toCustomerSessionPayload(request),
        );
        return {
          customerPortalUrl: response.customerPortalUrl ?? response.customer_portal_url ?? null,
        };
      },
    },
  };
}

function createPolarClient(): PolarClientHandle | null {
  const accessToken = process.env.POLAR_ACCESS_TOKEN?.trim();
  const organizationId = process.env.POLAR_ORGANIZATION_ID?.trim();
  if (!accessToken || !organizationId) {
    return null;
  }

  if (globalState.__appPolarClient) {
    return globalState.__appPolarClient;
  }

  try {
    const environment = resolveEnvironment();
    const client = createRestClient(accessToken, environment);

    const handle: PolarClientHandle = {
      client,
      organizationId,
      environment,
    };
    globalState.__appPolarClient = handle;
    return handle;
  } catch (error) {
    console.error('Failed to initialise Polar client', error);
    return null;
  }
}

export function getPolarClient(): PolarClientHandle | null {
  return createPolarClient();
}

export function resetPolarClientForTesting(): void {
  if (globalState.__appPolarClient) {
    delete globalState.__appPolarClient;
  }
}
