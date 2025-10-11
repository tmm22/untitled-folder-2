import {
  ConvexTranslationRepository,
  InMemoryTranslationRepository,
  type TranslationRepository,
} from '@/lib/translations/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

type TranslationRepositoryKind = 'convex' | 'in-memory';

let repository: TranslationRepository | null = null;
let repositoryKind: TranslationRepositoryKind | null = null;

function createRepository(): TranslationRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      repository = new ConvexTranslationRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      repositoryKind = 'convex';
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex translation repository, falling back to in-memory store:', error);
    }
  }

  repository = new InMemoryTranslationRepository();
  repositoryKind = 'in-memory';
  return repository;
}

export function getTranslationRepository(): TranslationRepository {
  return createRepository();
}

export function getTranslationRepositoryKind(): TranslationRepositoryKind | null {
  return repositoryKind;
}

export function resetTranslationRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}

export type { TranslationRepositoryKind };
