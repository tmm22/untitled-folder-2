import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/convexAuth', () => ({
  resolveConvexAuthConfig: vi.fn(() => ({ token: 'secret', scheme: 'Bearer' })),
}));

const convexCtorSpy = vi.fn();
let convexShouldThrow = false;

class MockConvexHistoryRepository {
  constructor() {
    convexCtorSpy();
    if (convexShouldThrow) {
      throw new Error('Simulated Convex failure');
    }
  }

  async list() {
    return [];
  }

  async record() {}
  async remove() {}
  async clear() {}
}

class MockInMemoryHistoryRepository {
  async list() {
    return [];
  }

  async record() {}
  async remove() {}
  async clear() {}
}

vi.mock('@/lib/history/repository', () => ({
  ConvexHistoryRepository: MockConvexHistoryRepository,
  InMemoryHistoryRepository: MockInMemoryHistoryRepository,
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('history repository context fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    convexShouldThrow = false;
    convexCtorSpy.mockClear();
    warnSpy.mockClear();
    process.env = {
      ...originalEnv,
      CONVEX_URL: 'https://fake.convex.cloud',
      CONVEX_DEPLOYMENT_KEY: 'deployment-key',
    };
    const { resetHistoryRepositoryForTesting } = await import('@/app/api/history/context');
    resetHistoryRepositoryForTesting();
  });

  afterAll(() => {
    process.env = originalEnv;
    warnSpy.mockRestore();
  });

  it('prefers the Convex repository when initialisation succeeds', async () => {
    convexShouldThrow = false;
    const { getHistoryRepository } = await import('@/app/api/history/context');
    const repository = getHistoryRepository();

    expect(repository).toBeInstanceOf(MockConvexHistoryRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the in-memory repository when Convex init fails', async () => {
    convexShouldThrow = true;
    const { getHistoryRepository, resetHistoryRepositoryForTesting } = await import(
      '@/app/api/history/context'
    );
    resetHistoryRepositoryForTesting();
    const repository = getHistoryRepository();

    expect(repository).toBeInstanceOf(MockInMemoryHistoryRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});
