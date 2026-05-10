type PolarEnvironment = 'sandbox' | 'production';

interface PolarCheckoutResponse {
  url?: string | null;
}

interface PolarCustomerSessionResponse {
  customerPortalUrl?: string | null;
}

interface PolarApiClient {
  checkouts: {
    create: (input: {
      products: string[];
      successUrl: string;
      metadata?: Record<string, string>;
      externalCustomerId?: string;
    }) => Promise<PolarCheckoutResponse>;
  };
  customerSessions: {
    create: (input: {
      customerId: string;
    }) => Promise<PolarCustomerSessionResponse>;
  };
}

interface PolarClientHandle {
  client: PolarApiClient;
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

function resolvePolarBaseUrl(environment: PolarEnvironment): string {
  return environment === 'production' ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
}

async function polarRequest<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Polar request failed (${response.status}): ${details}`);
  }

  return (await response.json()) as T;
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
    const baseUrl = resolvePolarBaseUrl(environment);
    const client: PolarApiClient = {
      checkouts: {
        create: async (input) =>
          polarRequest<PolarCheckoutResponse>(baseUrl, accessToken, '/v1/checkouts', {
            products: input.products,
            success_url: input.successUrl,
            metadata: input.metadata,
            external_customer_id: input.externalCustomerId,
          }),
      },
      customerSessions: {
        create: async (input) =>
          polarRequest<PolarCustomerSessionResponse>(
            baseUrl,
            accessToken,
            '/v1/customer-sessions',
            {
              customer_id: input.customerId,
            },
          ),
      },
    };

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
