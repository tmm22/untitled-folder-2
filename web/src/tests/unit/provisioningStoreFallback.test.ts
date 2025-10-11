import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/convexAuth', () => ({
  resolveConvexAuthConfig: vi.fn(() => ({ token: 'secret', scheme: 'Bearer' })),
}));

const convexCtorSpy = vi.fn();
const jsonCtorSpy = vi.fn();
const inMemoryCtorSpy = vi.fn();
const orchestratorCtorSpy = vi.fn();
let convexShouldThrow = false;

class MockConvexProvisioningStore {
  constructor() {
    convexCtorSpy();
    if (convexShouldThrow) {
      throw new Error('Convex unavailable');
    }
  }
}

class MockJsonFileProvisioningStore {
  constructor(public readonly filePath: string) {
    jsonCtorSpy(filePath);
  }
}

class MockInMemoryProvisioningStore {
  constructor() {
    inMemoryCtorSpy();
  }
}

class MockProvisioningOrchestrator {
  constructor(public readonly options: unknown) {
    orchestratorCtorSpy(options);
  }
}

class MockInMemoryProvisioningTokenCache {}

class MockOpenAIProvisioningProvider {}

vi.mock('@/lib/provisioning/storage/convexStore', () => ({
  ConvexProvisioningStore: MockConvexProvisioningStore,
}));

vi.mock('@/lib/provisioning', () => ({
  InMemoryProvisioningStore: MockInMemoryProvisioningStore,
  JsonFileProvisioningStore: MockJsonFileProvisioningStore,
  ProvisioningOrchestrator: MockProvisioningOrchestrator,
  InMemoryProvisioningTokenCache: MockInMemoryProvisioningTokenCache,
  OpenAIProvisioningProvider: MockOpenAIProvisioningProvider,
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('provisioning store context fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    convexShouldThrow = false;
    convexCtorSpy.mockClear();
    jsonCtorSpy.mockClear();
    inMemoryCtorSpy.mockClear();
    orchestratorCtorSpy.mockClear();
    warnSpy.mockClear();
    process.env = {
      ...originalEnv,
      CONVEX_URL: 'https://fake.convex.cloud',
      CONVEX_DEPLOYMENT_KEY: 'deployment-key',
    };
    vi.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
    warnSpy.mockRestore();
  });

  it('prefers Convex provisioning store when initialisation succeeds', async () => {
    convexShouldThrow = false;
    const { getProvisioningStore, resetProvisioningContextForTesting } = await import(
      '@/app/api/provisioning/context'
    );
    resetProvisioningContextForTesting();

    const store = getProvisioningStore();

    expect(store).toBeInstanceOf(MockConvexProvisioningStore);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).not.toHaveBeenCalled();
    expect(inMemoryCtorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to JSON file store when Convex fails and PROVISIONING_DATA_PATH is set', async () => {
    convexShouldThrow = true;
    process.env.PROVISIONING_DATA_PATH = '/tmp/provisioning.json';

    const { getProvisioningStore, resetProvisioningContextForTesting } = await import(
      '@/app/api/provisioning/context'
    );
    resetProvisioningContextForTesting();

    const store = getProvisioningStore();

    expect(store).toBeInstanceOf(MockJsonFileProvisioningStore);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).toHaveBeenCalledWith('/tmp/provisioning.json');
    expect(inMemoryCtorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to in-memory store when Convex fails and no file path configured', async () => {
    convexShouldThrow = true;
    delete process.env.PROVISIONING_DATA_PATH;

    const { getProvisioningStore, resetProvisioningContextForTesting } = await import(
      '@/app/api/provisioning/context'
    );
    resetProvisioningContextForTesting();

    const store = getProvisioningStore();

    expect(store).toBeInstanceOf(MockInMemoryProvisioningStore);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).not.toHaveBeenCalled();
    expect(inMemoryCtorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
