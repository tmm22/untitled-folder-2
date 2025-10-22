'use client';

import { create } from 'zustand';
import {
  ALL_WORKSPACE_PANEL_IDS,
  CURRENT_WORKSPACE_LAYOUT_VERSION,
  DEFAULT_WORKSPACE_LAYOUT,
  type WorkspaceColumnId,
  type WorkspaceLayoutSnapshot,
  type WorkspacePanelId,
} from './types';
import { getWorkspaceLayoutRepository } from '@/lib/workspaceLayout/repository';

interface WorkspaceLayoutState {
  layout: WorkspaceLayoutSnapshot;
  hydratedForUserId?: string;
  pendingUserId?: string;
  hydrationRequestId?: number;
  isHydrating: boolean;
  isSaving: boolean;
  error?: string;
  actions: {
    hydrate: (userId: string | null | undefined) => Promise<void>;
    movePanel: (panelId: WorkspacePanelId, targetColumnId: WorkspaceColumnId, targetIndex: number) => void;
    reset: () => Promise<void>;
    setError: (message: string | undefined) => void;
  };
}

const repository = getWorkspaceLayoutRepository();

let hydrationRequestCounter = 0;

const defaultColumnForPanel = (() => {
  const lookup = new Map<WorkspacePanelId, WorkspaceColumnId>();
  DEFAULT_WORKSPACE_LAYOUT.columns.forEach((column) => {
    column.panelIds.forEach((panelId) => lookup.set(panelId, column.id));
  });
  return lookup;
})();

function cloneLayout(layout: WorkspaceLayoutSnapshot): WorkspaceLayoutSnapshot {
  return JSON.parse(JSON.stringify(layout)) as WorkspaceLayoutSnapshot;
}

function normaliseLayout(source: WorkspaceLayoutSnapshot | null | undefined): WorkspaceLayoutSnapshot {
  if (!source || source.version !== CURRENT_WORKSPACE_LAYOUT_VERSION) {
    return cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
  }

  const seen = new Set<WorkspacePanelId>();
  const columnMap = new Map<WorkspaceColumnId, WorkspacePanelId[]>();

  DEFAULT_WORKSPACE_LAYOUT.columns.forEach((column) => {
    columnMap.set(column.id, []);
  });

  source.columns.forEach((column) => {
    if (!columnMap.has(column.id as WorkspaceColumnId)) {
      return;
    }
    const nextPanels: WorkspacePanelId[] = [];
    column.panelIds.forEach((panelId) => {
      if (!ALL_WORKSPACE_PANEL_IDS.includes(panelId) || seen.has(panelId)) {
        return;
      }
      nextPanels.push(panelId);
      seen.add(panelId);
    });
    columnMap.set(column.id as WorkspaceColumnId, nextPanels);
  });

  const missing = ALL_WORKSPACE_PANEL_IDS.filter((panelId) => !seen.has(panelId));
  missing.forEach((panelId) => {
    const fallbackColumn = defaultColumnForPanel.get(panelId) ?? 'right';
    const target = columnMap.get(fallbackColumn) ?? [];
    target.push(panelId);
    columnMap.set(fallbackColumn, target);
  });

  return {
    version: CURRENT_WORKSPACE_LAYOUT_VERSION,
    columns: DEFAULT_WORKSPACE_LAYOUT.columns.map((column) => ({
      id: column.id,
      panelIds: columnMap.get(column.id) ?? [],
    })),
  };
}

async function persistLayout(userId: string | undefined, layout: WorkspaceLayoutSnapshot, set: (partial: Partial<WorkspaceLayoutState>) => void) {
  if (!userId) {
    return;
  }
  set({ isSaving: true, error: undefined });
  try {
    await repository.save(userId, layout);
  } catch (error) {
    console.error('Failed to save workspace layout', error);
    set({ error: 'Unable to save layout right now.' });
  } finally {
    set({ isSaving: false });
  }
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>((set, get) => ({
  layout: cloneLayout(DEFAULT_WORKSPACE_LAYOUT),
  hydratedForUserId: undefined,
  pendingUserId: undefined,
  hydrationRequestId: undefined,
  isHydrating: false,
  isSaving: false,
  error: undefined,
  actions: {
    hydrate: async (userId) => {
      const normalized = userId?.trim();
      if (!normalized) {
        set({
          layout: cloneLayout(DEFAULT_WORKSPACE_LAYOUT),
          hydratedForUserId: undefined,
          pendingUserId: undefined,
          hydrationRequestId: undefined,
          isHydrating: false,
          error: undefined,
        });
        return;
      }

      const state = get();
      if (!state.isHydrating && state.hydratedForUserId === normalized) {
        return;
      }
      if (state.isHydrating && state.pendingUserId === normalized) {
        return;
      }

      const requestId = ++hydrationRequestCounter;
      set({
        isHydrating: true,
        error: undefined,
        pendingUserId: normalized,
        hydrationRequestId: requestId,
      });
      try {
        const remoteLayout = await repository.load(normalized);
        const layout = normaliseLayout(remoteLayout);
        const current = get();
        if (current.hydrationRequestId !== requestId || current.pendingUserId !== normalized) {
          return;
        }
        set({
          layout,
          hydratedForUserId: normalized,
          error: undefined,
        });
      } catch (error) {
        console.error('Failed to hydrate workspace layout', error);
        const current = get();
        if (current.hydrationRequestId !== requestId || current.pendingUserId !== normalized) {
          return;
        }
        set({
          layout: cloneLayout(DEFAULT_WORKSPACE_LAYOUT),
          hydratedForUserId: normalized,
          error: 'Workspace layout could not be loaded. Using default arrangement.',
        });
      } finally {
        const current = get();
        if (current.hydrationRequestId === requestId) {
          set({
            isHydrating: false,
            pendingUserId: undefined,
            hydrationRequestId: undefined,
          });
        }
      }
    },
    movePanel: (panelId, targetColumnId, targetIndex) => {
      const state = get();
      const { layout } = state;
      const sourceColumn = layout.columns.find((column) => column.panelIds.includes(panelId));
      const sourceColumnId = sourceColumn?.id;
      const sourceIndex = sourceColumn ? sourceColumn.panelIds.indexOf(panelId) : -1;
      const columns = layout.columns.map((column) => ({
        ...column,
        panelIds: column.panelIds.filter((id) => id !== panelId),
      }));
      const targetColumn = columns.find((column) => column.id === targetColumnId);
      if (!targetColumn) {
        return;
      }
      let desiredIndex = Math.max(0, Math.min(targetColumn.panelIds.length, targetIndex));
      if (sourceColumnId === targetColumnId && sourceIndex >= 0 && targetIndex > sourceIndex) {
        desiredIndex = Math.max(0, Math.min(targetColumn.panelIds.length, targetIndex - 1));
      }
      if (sourceColumnId === targetColumnId && sourceIndex === desiredIndex) {
        return;
      }
      targetColumn.panelIds = [
        ...targetColumn.panelIds.slice(0, desiredIndex),
        panelId,
        ...targetColumn.panelIds.slice(desiredIndex),
      ];
      const nextLayout: WorkspaceLayoutSnapshot = {
        version: CURRENT_WORKSPACE_LAYOUT_VERSION,
        columns,
      };
      set({ layout: nextLayout });
      void persistLayout(get().hydratedForUserId, nextLayout, set);
    },
    reset: async () => {
      const state = get();
      const userId = state.hydratedForUserId;
      const nextLayout = cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
      set({ layout: nextLayout, error: undefined });
      if (!userId) {
        return;
      }
      set({ isSaving: true });
      try {
        await repository.clear(userId);
      } catch (error) {
        console.error('Failed to clear workspace layout', error);
        set({
          error: 'Could not reset layout on the server.',
        });
      } finally {
        set({ isSaving: false });
      }
    },
    setError: (message) => {
      set({ error: message });
    },
  },
}));
