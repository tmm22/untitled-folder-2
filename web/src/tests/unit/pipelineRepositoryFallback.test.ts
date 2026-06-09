import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/convexAuth', () => ({
  resolveConvexAuthConfig: vi.fn(() => ({ token: 'secret', scheme: 'Bearer' })),
}));

const convexCtorSpy = vi.fn();
const jsonCtorSpy = vi.fn();
const inMemoryCtorSpy = vi.fn();
let convexShouldThrow = false;

class MockConvexPipelineRepository {
  constructor() {
    convexCtorSpy();
    if (convexShouldThrow) {
      throw new Error('Convex offline');
    }
  }
}

class MockJsonFilePipelineRepository {
  constructor(public readonly filePath: string) {
    jsonCtorSpy(filePath);
  }
}

class MockInMemoryPipelineRepository {
  constructor() {
    inMemoryCtorSpy();
  }
}

vi.mock('@/lib/pipelines/repository', () => ({
  ConvexPipelineRepository: MockConvexPipelineRepository,
  JsonFilePipelineRepository: MockJsonFilePipelineRepository,
  InMemoryPipelineRepository: MockInMemoryPipelineRepository,
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('pipeline repository context fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    convexShouldThrow = false;
    convexCtorSpy.mockClear();
    jsonCtorSpy.mockClear();
    inMemoryCtorSpy.mockClear();
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

  it('uses the Convex repository when available', async () => {
    const { getPipelineRepository, resetPipelineRepositoryForTesting } = await import(
      '@/app/api/pipelines/context'
    );
    resetPipelineRepositoryForTesting();

    const repository = getPipelineRepository();

    expect(repository).toBeInstanceOf(MockConvexPipelineRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).not.toHaveBeenCalled();
    expect(inMemoryCtorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to JSON file repository when Convex initialisation fails and PIPELINES_DATA_PATH is set', async () => {
    convexShouldThrow = true;
    process.env.PIPELINES_DATA_PATH = '/tmp/pipelines.json';

    const { getPipelineRepository, resetPipelineRepositoryForTesting } = await import(
      '@/app/api/pipelines/context'
    );
    resetPipelineRepositoryForTesting();

    const repository = getPipelineRepository();

    expect(repository).toBeInstanceOf(MockJsonFilePipelineRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).toHaveBeenCalledWith('/tmp/pipelines.json');
    expect(inMemoryCtorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('serves a transient local fallback without replacing the Convex repository', async () => {
    delete process.env.PIPELINES_DATA_PATH;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getPipelineRepository, fallbackPipelineRepository, resetPipelineRepositoryForTesting } =
      await import('@/app/api/pipelines/context');
    resetPipelineRepositoryForTesting();

    const primary = getPipelineRepository();
    expect(primary).toBeInstanceOf(MockConvexPipelineRepository);

    const fallback = fallbackPipelineRepository(new Error('Convex pipelines request failed (503)'));
    expect(fallback).toBeInstanceOf(MockInMemoryPipelineRepository);

    // Subsequent requests must go back to Convex, not stay on the fallback.
    expect(getPipelineRepository()).toBe(primary);
    // The same fallback instance is reused so in-memory data survives within
    // the degraded window.
    expect(fallbackPipelineRepository(new Error('Convex pipelines request failed (503)'))).toBe(fallback);

    errorSpy.mockRestore();
  });

  it('falls back to the in-memory repository when Convex initialisation fails without a file path', async () => {
    convexShouldThrow = true;
    delete process.env.PIPELINES_DATA_PATH;

    const { getPipelineRepository, resetPipelineRepositoryForTesting } = await import(
      '@/app/api/pipelines/context'
    );
    resetPipelineRepositoryForTesting();

    const repository = getPipelineRepository();

    expect(repository).toBeInstanceOf(MockInMemoryPipelineRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(jsonCtorSpy).not.toHaveBeenCalled();
    expect(inMemoryCtorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
