import {
  InMemoryAccountRepository,
  ConvexAccountRepository,
  AccountRepository,
} from '@/lib/account/repository';

let repository: AccountRepository | null = null;

function createRepository(): AccountRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const convexAdminKey = process.env.CONVEX_ADMIN_KEY?.trim();

  if (convexUrl && convexAdminKey) {
    try {
      repository = new ConvexAccountRepository({ baseUrl: convexUrl, adminKey: convexAdminKey });
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
