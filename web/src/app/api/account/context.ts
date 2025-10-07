import {
  InMemoryAccountRepository,
  ConvexAccountRepository,
  AccountRepository,
} from '@/lib/account/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

let repository: AccountRepository | null = null;

function createRepository(): AccountRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      repository = new ConvexAccountRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex account repository, falling back to in-memory store:', error);
    }
  }

  repository = new InMemoryAccountRepository();
  return repository;
}

export function getAccountRepository(): AccountRepository {
  return createRepository();
}
