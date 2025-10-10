import {
  ConvexPipelineRepository,
  InMemoryPipelineRepository,
  JsonFilePipelineRepository,
  type PipelineRepository,
} from '@/lib/pipelines/repository';
import { resolveConvexAuthConfig } from '@/lib/convexAuth';

type PipelineRepositoryKind = 'convex' | 'json-file' | 'in-memory';

let repository: PipelineRepository | null = null;
let repositoryKind: PipelineRepositoryKind | null = null;

function createRepository(): PipelineRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      repository = new ConvexPipelineRepository({
        baseUrl: convexUrl,
        authToken: auth.token,
        authScheme: auth.scheme,
      });
      repositoryKind = 'convex';
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex pipeline repository, falling back to local storage:', error);
    }
  }

  const pipelinesDataPath = process.env.PIPELINES_DATA_PATH?.trim();
  if (pipelinesDataPath) {
    try {
      repository = new JsonFilePipelineRepository(pipelinesDataPath);
      repositoryKind = 'json-file';
      return repository;
    } catch (error) {
      console.warn('Failed to initialise JSON pipeline repository, falling back to in-memory store:', error);
    }
  }

  repository = new InMemoryPipelineRepository();
  repositoryKind = 'in-memory';
  return repository;
}

export function getPipelineRepository(): PipelineRepository {
  return createRepository();
}

export function getPipelineRepositoryKind(): PipelineRepositoryKind | null {
  return repositoryKind;
}

export function resetPipelineRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}

export type { PipelineRepositoryKind };
