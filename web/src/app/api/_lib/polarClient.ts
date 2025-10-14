import { Polar } from '@polar-sh/sdk';

type PolarEnvironment = 'sandbox' | 'production';

interface PolarClientHandle {
  client: Polar;
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
    const client = new Polar({
      accessToken,
      server: environment,
    });

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
