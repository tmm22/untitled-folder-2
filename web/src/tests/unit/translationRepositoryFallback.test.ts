import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/convexAuth', () => ({
  resolveConvexAuthConfig: vi.fn(() => ({ token: 'secret', scheme: 'Bearer' })),
}));

const convexCtorSpy = vi.fn();
const inMemoryCtorSpy = vi.fn();
let convexShouldThrow = false;

class MockConvexTranslationRepository {
  constructor() {
    convexCtorSpy();
    if (convexShouldThrow) {
      throw new Error('Convex unavailable');
    }
  }
}

class MockInMemoryTranslationRepository {
  constructor() {
    inMemoryCtorSpy();
  }
}

vi.mock('@/lib/translations/repository', () => ({
  ConvexTranslationRepository: MockConvexTranslationRepository,
  InMemoryTranslationRepository: MockInMemoryTranslationRepository,
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('translation repository context fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    convexShouldThrow = false;
    convexCtorSpy.mockClear();
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

  it('uses the Convex translation repository when available', async () => {
    const { getTranslationRepository, resetTranslationRepositoryForTesting } = await import(
      '@/app/api/translations/context'
    );
    resetTranslationRepositoryForTesting();

    const repository = getTranslationRepository();

    expect(repository).toBeInstanceOf(MockConvexTranslationRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(inMemoryCtorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the in-memory translation repository when Convex initialisation fails', async () => {
    convexShouldThrow = true;

    const { getTranslationRepository, resetTranslationRepositoryForTesting } = await import(
      '@/app/api/translations/context'
    );
    resetTranslationRepositoryForTesting();

    const repository = getTranslationRepository();

    expect(repository).toBeInstanceOf(MockInMemoryTranslationRepository);
    expect(convexCtorSpy).toHaveBeenCalledTimes(1);
    expect(inMemoryCtorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
