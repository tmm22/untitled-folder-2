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
let localFallbackRepository: PipelineRepository | null = null;

function setRepository(instance: PipelineRepository, kind: PipelineRepositoryKind): PipelineRepository {
  repository = instance;
  repositoryKind = kind;
  return instance;
}

function buildLocalRepository(): { instance: PipelineRepository; kind: PipelineRepositoryKind } {
  const pipelinesDataPath = process.env.PIPELINES_DATA_PATH?.trim();
  if (pipelinesDataPath) {
    try {
      return { instance: new JsonFilePipelineRepository(pipelinesDataPath), kind: 'json-file' };
    } catch (error) {
      console.warn('Failed to initialise JSON pipeline repository, using in-memory store instead:', error);
    }
  }
  return { instance: new InMemoryPipelineRepository(), kind: 'in-memory' };
}

function createLocalRepository(): PipelineRepository {
  const { instance, kind } = buildLocalRepository();
  return setRepository(instance, kind);
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
  localFallbackRepository = null;
}

export function shouldFallbackToLocalPipelineRepository(error: unknown): boolean {
  if (!error || repositoryKind !== 'convex') {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /Convex pipelines request failed/i.test(message);
}

/**
 * Returns a local repository for retrying the current request without
 * permanently replacing the Convex repository — the next request goes back
 * to Convex, so a transient blip does not hide Convex-stored pipelines for
 * the rest of the process lifetime.
 */
export function fallbackPipelineRepository(error?: unknown): PipelineRepository {
  if (repositoryKind !== 'convex') {
    return repository ?? createLocalRepository();
  }
  console.error('Pipelines: Convex unavailable; serving this request from local fallback:', error);
  if (!localFallbackRepository) {
    localFallbackRepository = buildLocalRepository().instance;
  }
  return localFallbackRepository;
}

export type { PipelineRepositoryKind };
