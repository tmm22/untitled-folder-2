import { promises as fs } from 'fs';
import { dirname } from 'path';
import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import { resolveConvexAuthConfig } from '../convexAuth';
import type { TransitTranscriptionRecord } from '@/modules/transitTranscription/types';

const MAX_TRANSCRIPTS = 200;

export interface TransitTranscriptionRepository {
  list(userId: string): Promise<TransitTranscriptionRecord[]>;
  save(userId: string, record: TransitTranscriptionRecord): Promise<void>;
  clear(userId: string): Promise<void>;
}

type RepositoryKind = 'convex' | 'file' | 'noop';

let repository: TransitTranscriptionRepository | null = null;
let repositoryKind: RepositoryKind | null = null;

interface FileRepositoryOptions {
  filePath: string;
  limit?: number;
}

class FileTransitTranscriptionRepository implements TransitTranscriptionRepository {
  private readonly filePath: string;
  private readonly limit: number;

  constructor(options: FileRepositoryOptions) {
    this.filePath = options.filePath;
    this.limit = options.limit ?? MAX_TRANSCRIPTS;
  }

  private async ensureDirectory(): Promise<void> {
    const resolvedDir = dirname(this.filePath);
    await fs.mkdir(resolvedDir, { recursive: true });
  }

  private async readAll(): Promise<Record<string, TransitTranscriptionRecord[]>> {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(contents) as Record<string, TransitTranscriptionRecord[]>;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read transit transcription cache; starting fresh', error);
      }
    }
    return {};
  }

  private async writeAll(payload: Record<string, TransitTranscriptionRecord[]>): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  async list(userId: string): Promise<TransitTranscriptionRecord[]> {
    const entries = await this.readAll();
    const records = entries[userId] ?? [];
    return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async save(userId: string, record: TransitTranscriptionRecord): Promise<void> {
    try {
      const entries = await this.readAll();
      const existing = entries[userId] ?? [];
      const next = [
        record,
        ...existing.filter((item) => item.id !== record.id),
      ]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, this.limit);
      entries[userId] = next;
      await this.writeAll(entries);
    } catch (error) {
      console.warn('Failed to persist transit transcription record', error);
    }
  }

  async clear(userId: string): Promise<void> {
    const entries = await this.readAll();
    if (entries[userId]) {
      delete entries[userId];
      await this.writeAll(entries);
    }
  }
}

class ConvexTransitTranscriptionRepository implements TransitTranscriptionRepository {
  constructor(private readonly options: NextjsOptions) {}

  async list(userId: string): Promise<TransitTranscriptionRecord[]> {
    const records =
      (await fetchQuery(
        api.transit.listTranscripts,
        { userId },
        this.options,
      )) ?? [];
    return records;
  }

  async save(userId: string, record: TransitTranscriptionRecord): Promise<void> {
    await fetchMutation(
      api.transit.saveTranscript,
      {
        record: {
          userId,
          transcriptId: record.id,
          title: record.title,
          transcript: record.transcript,
          segments: record.segments,
          summary: record.summary
            ? {
                summary: record.summary.summary,
                actionItems: record.summary.actionItems.map((item) => ({
                  text: item.text,
                  ownerHint: item.ownerHint ?? undefined,
                  dueDateHint: item.dueDateHint ?? undefined,
                })),
                scheduleRecommendation: record.summary.scheduleRecommendation ?? undefined,
              }
            : undefined,
          language: record.language ?? undefined,
          durationMs: record.durationMs,
          confidence: record.confidence ?? undefined,
          createdAt: record.createdAt,
          source: record.source,
        },
      },
      this.options,
    );
  }

  async clear(userId: string): Promise<void> {
    await fetchMutation(
      api.transit.clearTranscripts,
      { userId },
      this.options,
    );
  }
}

class NoopTransitTranscriptionRepository implements TransitTranscriptionRepository {
  async list(): Promise<TransitTranscriptionRecord[]> {
    return [];
  }

  async save(): Promise<void> {}

  async clear(): Promise<void> {}
}

function resolveRepository(): TransitTranscriptionRepository {
  if (repository) {
    return repository;
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  const auth = resolveConvexAuthConfig();
  if (convexUrl && auth) {
    try {
      repository = new ConvexTransitTranscriptionRepository(
        buildConvexClientOptions({
          baseUrl: convexUrl,
          authToken: auth.token,
          authScheme: auth.scheme,
        }),
      );
      repositoryKind = 'convex';
      return repository;
    } catch (error) {
      console.warn('Failed to initialise Convex transit repository; falling back to local storage:', error);
    }
  }

  const pathFromEnv = process.env.TRANSIT_TRANSCRIPTS_PATH?.trim();
  if (pathFromEnv) {
    repository = new FileTransitTranscriptionRepository({ filePath: pathFromEnv });
    repositoryKind = 'file';
    return repository;
  }

  repository = new NoopTransitTranscriptionRepository();
  repositoryKind = 'noop';
  return repository;
}

export function getTransitTranscriptionRepository(): TransitTranscriptionRepository {
  return resolveRepository();
}

export function getTransitRepositoryKind(): RepositoryKind | null {
  return repositoryKind;
}

export function resetTransitRepositoryForTesting(): void {
  repository = null;
  repositoryKind = null;
}
