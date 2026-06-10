import { type NextjsOptions } from 'convex/nextjs';
import { internal } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
import { fetchInternalMutation, fetchInternalQuery } from '../convex/internalClient';
import type { WorkspaceLayoutSnapshot } from '@/modules/workspaceLayout/types';
import {
  parseWorkspaceLayoutSnapshot,
  serializeWorkspaceLayoutSnapshot,
  type WorkspaceLayoutRepository,
} from './repository';

interface ConvexWorkspaceLayoutRepositoryOptions {
  baseUrl: string;
  authToken: string;
  authScheme?: string;
}

export class ConvexWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  private readonly clientOptions: NextjsOptions;

  constructor(options: ConvexWorkspaceLayoutRepositoryOptions) {
    this.clientOptions = buildConvexClientOptions({
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      authScheme: options.authScheme,
    });
  }

  async load(userId: string): Promise<WorkspaceLayoutSnapshot | null> {
    const result = await fetchInternalQuery(internal.workspaceLayouts.getWorkspaceLayout, { userId }, this.clientOptions);
    if (!result) {
      return null;
    }

    const layout = parseWorkspaceLayoutSnapshot(result.layout);
    return layout;
  }

  async save(userId: string, layout: WorkspaceLayoutSnapshot): Promise<void> {
    await fetchInternalMutation(
      internal.workspaceLayouts.saveWorkspaceLayout,
      {
        payload: {
          userId,
          layout: serializeWorkspaceLayoutSnapshot(layout),
        },
      },
      this.clientOptions,
    );
  }

  async clear(userId: string): Promise<void> {
    await fetchInternalMutation(internal.workspaceLayouts.clearWorkspaceLayout, { userId }, this.clientOptions);
  }
}
