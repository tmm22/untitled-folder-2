import type { WorkspaceLayoutTab, WorkspaceLayoutSnapshot, WorkspaceTabId } from '@/modules/workspaceLayout/types';

export interface WorkspaceLayoutRepository {
  load(userId: string): Promise<WorkspaceLayoutSnapshot | null>;
  save(userId: string, layout: WorkspaceLayoutSnapshot): Promise<void>;
  clear(userId: string): Promise<void>;
}

export type RawWorkspaceLayoutTab = {
  id: string;
  panels?: string[];
  panelIds?: string[];
};

export type RawWorkspaceLayoutColumn = {
  id: string;
  panels?: string[];
  panelIds?: string[];
};

export type RawWorkspaceLayout = {
  version: number;
  tabs?: RawWorkspaceLayoutTab[];
  columns?: RawWorkspaceLayoutColumn[];
  activeTabId?: string;
};

type ConvexWorkspaceLayoutPayload = {
  version: number;
  tabs: {
    id: string;
    panels: string[];
  }[];
  activeTabId?: string;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseWorkspaceLayoutSnapshot(layout: unknown): WorkspaceLayoutSnapshot | null {
  if (!layout || typeof layout !== 'object') {
    return null;
  }

  const { version, tabs, columns, activeTabId } = layout as Partial<RawWorkspaceLayout>;
  if (typeof version !== 'number') {
    return null;
  }

  const rawItems = tabs ?? columns;
  if (!Array.isArray(rawItems)) {
    return null;
  }

  const normalizedTabs: WorkspaceLayoutTab[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const { id, panelIds, panels } = item as RawWorkspaceLayoutTab;
    const nextPanelIds = panelIds ?? panels;

    if (typeof id !== 'string' || !isStringArray(nextPanelIds)) {
      return null;
    }

    normalizedTabs.push({
      id: id as WorkspaceLayoutTab['id'],
      panelIds: nextPanelIds as WorkspaceLayoutTab['panelIds'],
    });
  }

  return {
    version,
    tabs: normalizedTabs,
    activeTabId: typeof activeTabId === 'string' ? (activeTabId as WorkspaceTabId) : undefined,
  };
}

export function serializeWorkspaceLayoutSnapshot(layout: WorkspaceLayoutSnapshot): ConvexWorkspaceLayoutPayload {
  return {
    version: layout.version,
    tabs: layout.tabs.map(({ id, panelIds }) => ({
      id,
      panels: [...panelIds],
    })),
    activeTabId: layout.activeTabId,
  };
}

export class ApiWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  private offlineMode = false;

  constructor(private readonly fallback: WorkspaceLayoutRepository | null = null) {}

  private createError(message: string, allowFallback: boolean): Error & { allowFallback: boolean } {
    const error = new Error(message) as Error & { allowFallback: boolean };
    error.allowFallback = allowFallback;
    return error;
  }

  private shouldFallback(error: unknown): boolean {
    if (!this.fallback) {
      return false;
    }

    const candidate = error as { allowFallback?: boolean } | null;
    if (candidate && candidate.allowFallback === false) {
      return false;
    }
    return true;
  }

  private buildUrl(userId: string | null | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      return '/api/workspace-layout';
    }
    const params = new URLSearchParams({ userId: normalized });
    return `/api/workspace-layout?${params.toString()}`;
  }

  private async request(input: RequestInfo, init: RequestInit): Promise<Response> {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API is not available in this environment.');
    }

    return await fetch(input, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
    });
  }

  async load(userId: string): Promise<WorkspaceLayoutSnapshot | null> {
    if (this.offlineMode && this.fallback) {
      return this.fallback.load(userId);
    }

    try {
      const response = await this.request(this.buildUrl(userId), { method: 'GET' });

      if (response.status === 204 || response.status === 404) {
        if (this.fallback) {
          await this.fallback.clear(userId);
        }
        return null;
      }

      if (response.status === 401 || response.status === 403) {
        if (this.fallback) {
          await this.fallback.clear(userId);
        }
        return null;
      }

      if (response.status === 503 && this.fallback) {
        this.offlineMode = true;
        return this.fallback.load(userId);
      }

      if (response.status >= 500 && this.fallback) {
        this.offlineMode = true;
        return this.fallback.load(userId);
      }

      if (!response.ok) {
        throw this.createError(`Failed to load workspace layout (status ${response.status})`, false);
      }

      const payload = (await response.json()) as { layout?: unknown };
      const layout = parseWorkspaceLayoutSnapshot(payload.layout ?? null);
      if (!layout) {
        return null;
      }

      if (this.fallback) {
        await this.fallback.save(userId, layout);
      }

      return layout;
    } catch (error) {
      if (this.shouldFallback(error) && this.fallback) {
        this.offlineMode = true;
        return this.fallback.load(userId);
      }
      throw error;
    }
  }

  async save(userId: string, layout: WorkspaceLayoutSnapshot): Promise<void> {
    if (this.offlineMode && this.fallback) {
      await this.fallback.save(userId, layout);
      return;
    }

    try {
      const response = await this.request('/api/workspace-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, layout }),
      });

      if (response.status === 503 && this.fallback) {
        this.offlineMode = true;
        await this.fallback.save(userId, layout);
        return;
      }

      if (response.status >= 500 && this.fallback) {
        this.offlineMode = true;
        await this.fallback.save(userId, layout);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        throw this.createError(`Failed to save workspace layout (status ${response.status})`, false);
      }

      if (!response.ok) {
        throw this.createError(`Failed to save workspace layout (status ${response.status})`, false);
      }

      if (this.fallback) {
        await this.fallback.save(userId, layout);
      }
    } catch (error) {
      if (this.shouldFallback(error) && this.fallback) {
        this.offlineMode = true;
        await this.fallback.save(userId, layout);
        return;
      }
      throw error;
    }
  }

  async clear(userId: string): Promise<void> {
    if (this.offlineMode && this.fallback) {
      await this.fallback.clear(userId);
      return;
    }

    try {
      const response = await this.request(this.buildUrl(userId), { method: 'DELETE' });

      if (response.status === 503 && this.fallback) {
        this.offlineMode = true;
        await this.fallback.clear(userId);
        return;
      }

      if (response.status >= 500 && this.fallback) {
        this.offlineMode = true;
        await this.fallback.clear(userId);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        throw this.createError(`Failed to clear workspace layout (status ${response.status})`, false);
      }

      if (!response.ok && response.status !== 404) {
        throw this.createError(`Failed to clear workspace layout (status ${response.status})`, false);
      }

      if (this.fallback) {
        await this.fallback.clear(userId);
      }
    } catch (error) {
      if (this.shouldFallback(error) && this.fallback) {
        this.offlineMode = true;
        await this.fallback.clear(userId);
        return;
      }
      throw error;
    }
  }
}

export class LocalWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  private storageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    try {
      const key = '__workspace_layout_test__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  private key(userId: string): string {
    return `workspace-layout:${userId}`;
  }

  async load(userId: string): Promise<WorkspaceLayoutSnapshot | null> {
    if (!this.storageAvailable()) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(this.key(userId));
      if (!raw) {
        return null;
      }
      const parsed = parseWorkspaceLayoutSnapshot(JSON.parse(raw));
      return parsed;
    } catch {
      return null;
    }
  }

  async save(userId: string, layout: WorkspaceLayoutSnapshot): Promise<void> {
    if (!this.storageAvailable()) {
      return;
    }
    try {
      window.localStorage.setItem(this.key(userId), JSON.stringify(layout));
    } catch {
      // Ignore write errors; layout is a convenience cache in this mode.
    }
  }

  async clear(userId: string): Promise<void> {
    if (!this.storageAvailable()) {
      return;
    }
    try {
      window.localStorage.removeItem(this.key(userId));
    } catch {
      // Ignore.
    }
  }
}

export class NoopWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  async load(): Promise<WorkspaceLayoutSnapshot | null> {
    return null;
  }

  async save(): Promise<void> {}

  async clear(): Promise<void> {}
}

let repository: WorkspaceLayoutRepository | null = null;

export function getWorkspaceLayoutRepository(): WorkspaceLayoutRepository {
  if (repository) {
    return repository;
  }

  if (typeof window !== 'undefined') {
    const fallback = new LocalWorkspaceLayoutRepository();
    repository = new ApiWorkspaceLayoutRepository(fallback);
    return repository;
  }

  repository = new NoopWorkspaceLayoutRepository();
  return repository;
}
