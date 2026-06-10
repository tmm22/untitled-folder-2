import {
  InMemoryAccountRepository,
  ConvexAccountRepository,
  AccountRepository,
} from '@/lib/account/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';
import { createResilientRepository, isConvexTransportError } from '@/lib/convex/resilience';

type AccountRepositoryKind = 'convex' | 'in-memory';

let repository: AccountRepository | null = null;
let repositoryKind: AccountRepositoryKind | null = null;

function isConvexAccountError(error: unknown): boolean {
  return isConvexTransportError(error, /Convex account request failed/i);
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
      repositoryKind = 'convex';
      repository = createResilientRepository<AccountRepository>({
        primary,
        fallback: () => new InMemoryAccountRepository(),
        label: 'account',
        isTransportError: isConvexAccountError,
        onFallback: () => {
          repositoryKind = 'in-memory';
        },
        onRecovered: () => {
          repositoryKind = 'convex';
        },
      });
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
