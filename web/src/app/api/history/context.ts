import {
  ConvexHistoryRepository,
  InMemoryHistoryRepository,
  type HistoryRepository,
} from '@/lib/history/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';
import { createResilientRepository, isConvexTransportError } from '@/lib/convex/resilience';

type HistoryRepositoryKind = 'convex' | 'in-memory';

let repository: HistoryRepository | null = null;
let repositoryKind: HistoryRepositoryKind | null = null;

function createRepository(): HistoryRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      const primary = new ConvexHistoryRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      repositoryKind = 'convex';
      repository = createResilientRepository<HistoryRepository>({
        primary,
        fallback: () => new InMemoryHistoryRepository(),
        label: 'history',
        isTransportError: (error) => isConvexTransportError(error, /Convex history request failed/i),
        onFallback: () => {
          repositoryKind = 'in-memory';
        },
        onRecovered: () => {
          repositoryKind = 'convex';
        },
      });
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex history repository, falling back to in-memory store:', error);
    }
  }

  repository = new InMemoryHistoryRepository();
  repositoryKind = 'in-memory';
  return repository;
}

export function getHistoryRepository(): HistoryRepository {
  return createRepository();
}

export function getHistoryRepositoryKind(): HistoryRepositoryKind | null {
  return repositoryKind;
}

export function resetHistoryRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}

export type { HistoryRepositoryKind };

