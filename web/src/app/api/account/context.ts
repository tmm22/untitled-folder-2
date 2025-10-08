import {
  InMemoryAccountRepository,
  ConvexAccountRepository,
  AccountRepository,
} from '@/lib/account/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

type AccountRepositoryKind = 'convex' | 'in-memory';

let repository: AccountRepository | null = null;
let repositoryKind: AccountRepositoryKind | null = null;

function isConvexAccountError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (/Convex account request failed/i.test(error.message)) {
    return true;
  }
  if (error.name === 'TypeError') {
    return true;
  }
  const withCause = error as { cause?: unknown };
  if (withCause.cause) {
    return isConvexAccountError(withCause.cause);
  }
  return /fetch failed/i.test(error.message);
}

function createResilientRepository(
  primary: AccountRepository,
  fallback: InMemoryAccountRepository,
): AccountRepository {
  let active: AccountRepository = primary;
  let usingFallback = false;

  const execute = async <T>(operation: (repo: AccountRepository) => Promise<T>): Promise<T> => {
    try {
      return await operation(active);
    } catch (error) {
      if (usingFallback || !isConvexAccountError(error)) {
        throw error;
      }
      usingFallback = true;
      active = fallback;
      repositoryKind = 'in-memory';
      console.warn('Falling back to in-memory account repository after Convex failure:', error);
      return operation(active);
    }
  };

  return {
    getOrCreate: (userId: string) => execute((repo) => repo.getOrCreate(userId)),
    updateAccount: (payload) => execute((repo) => repo.updateAccount(payload)),
    recordUsage: (userId, provider, tokensUsed) =>
      execute((repo) => repo.recordUsage(userId, provider, tokensUsed)),
  };
}

function createRepository(): AccountRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      const primary = new ConvexAccountRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      const fallback = new InMemoryAccountRepository();
      repositoryKind = 'convex';
      repository = createResilientRepository(primary, fallback);
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex account repository, falling back to in-memory store:', error);
    }
  }

  repositoryKind = 'in-memory';
  repository = new InMemoryAccountRepository();
  return repository;
}

export function getAccountRepository(): AccountRepository {
  return createRepository();
}

export function getAccountRepositoryKind(): AccountRepositoryKind | null {
  return repositoryKind;
}

export function resetAccountRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}

export type { AccountRepositoryKind };
