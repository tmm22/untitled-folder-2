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

function setRepository(instance: PipelineRepository, kind: PipelineRepositoryKind): PipelineRepository {
  repository = instance;
  repositoryKind = kind;
  return instance;
}

function createLocalRepository(): PipelineRepository {
  const pipelinesDataPath = process.env.PIPELINES_DATA_PATH?.trim();
  if (pipelinesDataPath) {
    try {
      return setRepository(new JsonFilePipelineRepository(pipelinesDataPath), 'json-file');
    } catch (error) {
      console.warn('Failed to initialise JSON pipeline repository, using in-memory store instead:', error);
    }
  }
  return setRepository(new InMemoryPipelineRepository(), 'in-memory');
}

function createRepository(): PipelineRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();

  if (convexUrl && auth) {
    try {
      return setRepository(
        new ConvexPipelineRepository({
          baseUrl: convexUrl,
          authToken: auth.token,
          authScheme: auth.scheme,
        }),
        'convex',
      );
    } catch (error) {
      console.warn('Failed to initialise Convex pipeline repository, falling back to local storage:', error);
    }
  }

  return createLocalRepository();
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

export function shouldFallbackToLocalPipelineRepository(error: unknown): boolean {
  if (!error || repositoryKind !== 'convex') {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /Convex pipelines request failed/i.test(message);
}

export function fallbackPipelineRepository(error?: unknown): PipelineRepository {
  if (repositoryKind !== 'convex') {
    return repository ?? createLocalRepository();
  }
  console.warn('Falling back to local pipeline repository after Convex failure:', error);
  return createLocalRepository();
}

export type { PipelineRepositoryKind };
