import { fetchMutation, fetchQuery, type NextjsOptions } from 'convex/nextjs';
import { api } from '../../../convex/_generated/api';
import { buildConvexClientOptions } from '../convex/client';
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
    const result = await fetchQuery(api.workspaceLayouts.getWorkspaceLayout, { userId }, this.clientOptions);
    if (!result) {
      return null;
    }

    const layout = parseWorkspaceLayoutSnapshot(result.layout);
    return layout;
  }

  async save(userId: string, layout: WorkspaceLayoutSnapshot): Promise<void> {
    await fetchMutation(
      api.workspaceLayouts.saveWorkspaceLayout,
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
    await fetchMutation(api.workspaceLayouts.clearWorkspaceLayout, { userId }, this.clientOptions);
  }
}
