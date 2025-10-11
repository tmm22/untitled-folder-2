import type { FunctionReference } from 'convex/server';
import { fetchMutation, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../../convex/_generated/api';
import { buildConvexClientOptions } from '../../convex/client';
import type { SessionRecord, SessionStore } from '../types';

interface ConvexSessionStoreOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexSessionStore implements SessionStore {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexSessionStoreOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`Convex session request failed: ${error.message}`);
      (wrapped as Error & { cause?: unknown }).cause = error;
      return wrapped;
    }
    return new Error(`Convex session request failed: ${String(error)}`);
  }

  private async mutation<TArgs extends object, TResult>(
    reference: FunctionReference<'mutation', TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    try {
      return await fetchMutation(reference, args, this.clientOptions);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async save(record: SessionRecord): Promise<void> {
    await this.mutation(api.session.save, { record });
  }

  async find(id: string): Promise<SessionRecord | null> {
    const result = await this.mutation(api.session.get, { sessionId: id });
    return result.session ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.mutation(api.session.deleteSession, { sessionId: id });
  }

  async prune(now: number): Promise<void> {
    await this.mutation(api.session.prune, { now });
  }
}
