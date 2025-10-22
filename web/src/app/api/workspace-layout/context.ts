import { resolveConvexAuthConfig } from '@/lib/convexAuth';
import type { WorkspaceLayoutRepository } from '@/lib/workspaceLayout/repository';
import { NoopWorkspaceLayoutRepository } from '@/lib/workspaceLayout/repository';
import { ConvexWorkspaceLayoutRepository } from '@/lib/workspaceLayout/repository.server';

type WorkspaceLayoutRepositoryKind = 'convex' | 'noop';

let repository: WorkspaceLayoutRepository | null = null;
let repositoryKind: WorkspaceLayoutRepositoryKind | null = null;

function createRepository(): WorkspaceLayoutRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      repository = new ConvexWorkspaceLayoutRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      repositoryKind = 'convex';
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex workspace layout repository, falling back to noop store:', error);
    }
  }

  repository = new NoopWorkspaceLayoutRepository();
  repositoryKind = 'noop';
  return repository;
}

export function getWorkspaceLayoutRepository(): WorkspaceLayoutRepository {
  return createRepository();
}

export function getWorkspaceLayoutRepositoryKind(): WorkspaceLayoutRepositoryKind | null {
  return repositoryKind;
}

export function resetWorkspaceLayoutRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}

export type { WorkspaceLayoutRepositoryKind };
