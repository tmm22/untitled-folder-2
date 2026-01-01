'use client';

import { create } from 'zustand';
import {
  ALL_WORKSPACE_PANEL_IDS,
  ALL_WORKSPACE_TAB_IDS,
  CURRENT_WORKSPACE_LAYOUT_VERSION,
  DEFAULT_WORKSPACE_LAYOUT,
  type LegacyWorkspaceLayoutSnapshot,
  type WorkspaceLayoutSnapshot,
  type WorkspacePanelId,
  type WorkspaceTabId,
} from './types';
import { getWorkspaceLayoutRepository } from '@/lib/workspaceLayout/repository';

interface WorkspaceLayoutState {
  layout: WorkspaceLayoutSnapshot;
  activeTabId: WorkspaceTabId;
  hydratedForUserId?: string;
  pendingUserId?: string;
  hydrationRequestId?: number;
  isHydrating: boolean;
  isSaving: boolean;
  error?: string;
  actions: {
    hydrate: (userId: string | null | undefined) => Promise<void>;
    movePanel: (panelId: WorkspacePanelId, targetTabId: WorkspaceTabId, targetIndex: number) => void;
    setActiveTab: (tabId: WorkspaceTabId) => void;
    reset: () => Promise<void>;
    setError: (message: string | undefined) => void;
  };
}

const repository = getWorkspaceLayoutRepository();

let hydrationRequestCounter = 0;

const defaultTabForPanel = (() => {
  const lookup = new Map<WorkspacePanelId, WorkspaceTabId>();
  DEFAULT_WORKSPACE_LAYOUT.tabs.forEach((tab) => {
    tab.panelIds.forEach((panelId) => lookup.set(panelId, tab.id));
  });
  return lookup;
})();

const LEGACY_PANEL_TO_TAB_MAPPING: Record<string, WorkspaceTabId> = {
  pipelineStatus: 'capture',
  captureAudio: 'capture',
  uploadAudio: 'capture',
  importPanel: 'capture',
  snippetPanel: 'capture',
  cleanupInstructions: 'transcript',
  transcriptView: 'transcript',
  summary: 'transcript',
  cleanupResult: 'transcript',
  actionItems: 'transcript',
  suggestedCalendarEvent: 'calendar',
  calendarFollowUp: 'calendar',
  ttsControls: 'narration',
  transcriptHistory: 'history',
};

function cloneLayout(layout: WorkspaceLayoutSnapshot): WorkspaceLayoutSnapshot {
  return JSON.parse(JSON.stringify(layout)) as WorkspaceLayoutSnapshot;
}

function migrateFromV2(legacy: LegacyWorkspaceLayoutSnapshot): WorkspaceLayoutSnapshot {
  const tabMap = new Map<WorkspaceTabId, WorkspacePanelId[]>();
  ALL_WORKSPACE_TAB_IDS.forEach((tabId) => tabMap.set(tabId, []));

  const seen = new Set<string>();

  legacy.columns.forEach((column) => {
    column.panelIds.forEach((panelId) => {
      if (seen.has(panelId)) return;
      seen.add(panelId);

      if (panelId === 'ttsControls') {
        return;
      }

      const targetTab = LEGACY_PANEL_TO_TAB_MAPPING[panelId];
      if (targetTab && ALL_WORKSPACE_PANEL_IDS.includes(panelId as WorkspacePanelId)) {
        const tabPanels = tabMap.get(targetTab) ?? [];
        tabPanels.push(panelId as WorkspacePanelId);
        tabMap.set(targetTab, tabPanels);
      }
    });
  });

  const newPanels: WorkspacePanelId[] = [
    'voiceSettings',
    'scriptEditor',
    'playbackControls',
    'batchQueue',
    'pronunciationPanel',
    'ttsHistory',
    'translationHistory',
    'credentialsPanel',
    'themePanel',
    'compactPanel',
    'notificationPanel',
  ];

  newPanels.forEach((panelId) => {
    const targetTab = defaultTabForPanel.get(panelId);
    if (targetTab) {
      const tabPanels = tabMap.get(targetTab) ?? [];
      if (!tabPanels.includes(panelId)) {
        tabPanels.push(panelId);
        tabMap.set(targetTab, tabPanels);
      }
    }
  });

  ALL_WORKSPACE_PANEL_IDS.forEach((panelId) => {
    if (panelId === 'pipelineStatus') return;

    let found = false;
    tabMap.forEach((panels) => {
      if (panels.includes(panelId)) found = true;
    });

    if (!found) {
      const targetTab = defaultTabForPanel.get(panelId) ?? 'settings';
      const tabPanels = tabMap.get(targetTab) ?? [];
      tabPanels.push(panelId);
      tabMap.set(targetTab, tabPanels);
    }
  });

  return {
    version: CURRENT_WORKSPACE_LAYOUT_VERSION,
    activeTabId: 'capture',
    tabs: ALL_WORKSPACE_TAB_IDS.map((tabId) => ({
      id: tabId,
      panelIds: tabMap.get(tabId) ?? [],
    })),
  };
}

function normaliseLayout(source: unknown): WorkspaceLayoutSnapshot {
  if (!source || typeof source !== 'object') {
    return cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
  }

  const sourceObj = source as Record<string, unknown>;

  if (typeof sourceObj.version !== 'number') {
    return cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
  }

  if (sourceObj.version < CURRENT_WORKSPACE_LAYOUT_VERSION && 'columns' in sourceObj) {
    return migrateFromV2(sourceObj as unknown as LegacyWorkspaceLayoutSnapshot);
  }

  if (sourceObj.version !== CURRENT_WORKSPACE_LAYOUT_VERSION) {
    return cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
  }

  const typedSource = sourceObj as unknown as WorkspaceLayoutSnapshot;

  const seen = new Set<WorkspacePanelId>();
  const tabMap = new Map<WorkspaceTabId, WorkspacePanelId[]>();

  ALL_WORKSPACE_TAB_IDS.forEach((tabId) => {
    tabMap.set(tabId, []);
  });

  (typedSource.tabs ?? []).forEach((tab) => {
    if (!ALL_WORKSPACE_TAB_IDS.includes(tab.id as WorkspaceTabId)) {
      return;
    }
    const nextPanels: WorkspacePanelId[] = [];
    (tab.panelIds ?? []).forEach((panelId) => {
      if (!ALL_WORKSPACE_PANEL_IDS.includes(panelId) || seen.has(panelId) || panelId === 'pipelineStatus') {
        return;
      }
      nextPanels.push(panelId);
      seen.add(panelId);
    });
    tabMap.set(tab.id as WorkspaceTabId, nextPanels);
  });

  const missing = ALL_WORKSPACE_PANEL_IDS.filter(
    (panelId) => panelId !== 'pipelineStatus' && !seen.has(panelId),
  );
  missing.forEach((panelId) => {
    const fallbackTab = defaultTabForPanel.get(panelId) ?? 'settings';
    const target = tabMap.get(fallbackTab) ?? [];
    target.push(panelId);
    tabMap.set(fallbackTab, target);
  });

  const activeTabId =
    typedSource.activeTabId && ALL_WORKSPACE_TAB_IDS.includes(typedSource.activeTabId)
      ? typedSource.activeTabId
      : 'capture';

  return {
    version: CURRENT_WORKSPACE_LAYOUT_VERSION,
    activeTabId,
    tabs: ALL_WORKSPACE_TAB_IDS.map((tabId) => ({
      id: tabId,
      panelIds: tabMap.get(tabId) ?? [],
    })),
  };
}

async function persistLayout(
  userId: string | undefined,
  layout: WorkspaceLayoutSnapshot,
  set: (partial: Partial<WorkspaceLayoutState>) => void,
) {
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
  activeTabId: DEFAULT_WORKSPACE_LAYOUT.activeTabId ?? 'capture',
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
          activeTabId: DEFAULT_WORKSPACE_LAYOUT.activeTabId ?? 'capture',
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
          activeTabId: layout.activeTabId ?? 'capture',
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
          activeTabId: DEFAULT_WORKSPACE_LAYOUT.activeTabId ?? 'capture',
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
    movePanel: (panelId, targetTabId, targetIndex) => {
      const state = get();
      const { layout } = state;
      const sourceTab = layout.tabs.find((tab) => tab.panelIds.includes(panelId));
      const sourceTabId = sourceTab?.id;
      const sourceIndex = sourceTab ? sourceTab.panelIds.indexOf(panelId) : -1;
      const tabs = layout.tabs.map((tab) => ({
        ...tab,
        panelIds: tab.panelIds.filter((id) => id !== panelId),
      }));
      const targetTab = tabs.find((tab) => tab.id === targetTabId);
      if (!targetTab) {
        return;
      }
      let desiredIndex = Math.max(0, Math.min(targetTab.panelIds.length, targetIndex));
      if (sourceTabId === targetTabId && sourceIndex >= 0 && targetIndex > sourceIndex) {
        desiredIndex = Math.max(0, Math.min(targetTab.panelIds.length, targetIndex - 1));
      }
      if (sourceTabId === targetTabId && sourceIndex === desiredIndex) {
        return;
      }
      targetTab.panelIds = [
        ...targetTab.panelIds.slice(0, desiredIndex),
        panelId,
        ...targetTab.panelIds.slice(desiredIndex),
      ];
      const nextLayout: WorkspaceLayoutSnapshot = {
        version: CURRENT_WORKSPACE_LAYOUT_VERSION,
        activeTabId: state.activeTabId,
        tabs,
      };
      set({ layout: nextLayout });
      void persistLayout(get().hydratedForUserId, nextLayout, set);
    },
    setActiveTab: (tabId) => {
      const state = get();
      if (state.activeTabId === tabId) {
        return;
      }
      const nextLayout: WorkspaceLayoutSnapshot = {
        ...state.layout,
        activeTabId: tabId,
      };
      set({ activeTabId: tabId, layout: nextLayout });
      void persistLayout(get().hydratedForUserId, nextLayout, set);
    },
    reset: async () => {
      const state = get();
      const userId = state.hydratedForUserId;
      const nextLayout = cloneLayout(DEFAULT_WORKSPACE_LAYOUT);
      set({
        layout: nextLayout,
        activeTabId: DEFAULT_WORKSPACE_LAYOUT.activeTabId ?? 'capture',
        error: undefined,
      });
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
