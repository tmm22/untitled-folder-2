'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkspaceColumnId = 'left' | 'center' | 'right';

export type WorkspacePanelId =
  | 'capture'
  | 'cleanupInstructions'
  | 'importEntries'
  | 'snippets'
  | 'transcriptHistory'
  | 'transcript'
  | 'summary'
  | 'cleanupResult'
  | 'actionItems'
  | 'scheduleSuggestion'
  | 'calendar'
  | 'provider'
  | 'scriptEditor'
  | 'translationControls'
  | 'generate'
  | 'playback'
  | 'batchQueue'
  | 'pronunciation'
  | 'ttsHistory'
  | 'translationHistory'
  | 'credentials'
  | 'theme'
  | 'compact'
  | 'notifications';

export type WorkspaceLayout = Record<WorkspaceColumnId, WorkspacePanelId[]>;

const DEFAULT_LAYOUT: WorkspaceLayout = {
  left: ['capture', 'cleanupInstructions', 'importEntries', 'snippets', 'transcriptHistory'],
  center: ['transcript', 'summary', 'cleanupResult', 'actionItems', 'scheduleSuggestion', 'calendar'],
  right: [
    'provider',
    'scriptEditor',
    'translationControls',
    'generate',
    'playback',
    'batchQueue',
    'pronunciation',
    'ttsHistory',
    'translationHistory',
    'credentials',
    'theme',
    'compact',
    'notifications',
  ],
};

const KNOWN_PANELS = new Set<WorkspacePanelId>(
  Object.values(DEFAULT_LAYOUT).flat() as WorkspacePanelId[],
);

const isKnownPanel = (value: string): value is WorkspacePanelId => KNOWN_PANELS.has(value as WorkspacePanelId);

const sanitizeLayout = (candidate?: Partial<Record<WorkspaceColumnId, WorkspacePanelId[]>>): WorkspaceLayout => {
  const next: WorkspaceLayout = {
    left: [],
    center: [],
    right: [],
  };

  const appended = new Set<WorkspacePanelId>();

  const append = (panelId: WorkspacePanelId, columnId: WorkspaceColumnId) => {
    if (appended.has(panelId)) {
      return;
    }
    next[columnId].push(panelId);
    appended.add(panelId);
  };

  if (candidate) {
    (Object.keys(next) as WorkspaceColumnId[]).forEach((columnId) => {
      const columnPanels = candidate[columnId];
      if (!Array.isArray(columnPanels)) {
        return;
      }
      columnPanels.forEach((panelId) => {
        if (isKnownPanel(panelId)) {
          append(panelId, columnId);
        }
      });
    });
  }

  (Object.entries(DEFAULT_LAYOUT) as [WorkspaceColumnId, WorkspacePanelId[]][]).forEach(([columnId, panelIds]) => {
    panelIds.forEach((panelId) => append(panelId, columnId));
  });

  return next;
};

interface WorkspaceLayoutState {
  layout: WorkspaceLayout;
  draggingPanelId: WorkspacePanelId | null;
  actions: {
    movePanel: (panelId: WorkspacePanelId, columnId: WorkspaceColumnId, targetIndex: number) => void;
    removePanel: (panelId: WorkspacePanelId) => void;
    reset: () => void;
    startDragging: (panelId: WorkspacePanelId) => void;
    stopDragging: () => void;
    syncWithDefaults: () => void;
  };
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>()(
  persist(
    (set, get) => ({
      layout: sanitizeLayout(),
      draggingPanelId: null,
      actions: {
        movePanel: (panelId, columnId, targetIndex) => {
          set((state) => {
            const nextLayout: WorkspaceLayout = {
              left: [...state.layout.left],
              center: [...state.layout.center],
              right: [...state.layout.right],
            };

            (Object.keys(nextLayout) as WorkspaceColumnId[]).forEach((column) => {
              const index = nextLayout[column].indexOf(panelId);
              if (index >= 0) {
                nextLayout[column].splice(index, 1);
              }
            });

            const destination = nextLayout[columnId] ?? nextLayout.left;
            const boundedIndex = Math.max(0, Math.min(targetIndex, destination.length));
            destination.splice(boundedIndex, 0, panelId);

            return { layout: nextLayout };
          });
        },
        removePanel: (panelId) => {
          set((state) => {
            const nextLayout: WorkspaceLayout = {
              left: state.layout.left.filter((id) => id !== panelId),
              center: state.layout.center.filter((id) => id !== panelId),
              right: state.layout.right.filter((id) => id !== panelId),
            };
            return { layout: sanitizeLayout(nextLayout) };
          });
        },
        reset: () => set({ layout: sanitizeLayout(DEFAULT_LAYOUT) }),
        startDragging: (panelId) => set({ draggingPanelId: panelId }),
        stopDragging: () => set({ draggingPanelId: null }),
        syncWithDefaults: () => {
          set((state) => ({ layout: sanitizeLayout(state.layout) }));
        },
      },
    }),
    {
      name: 'workspace-layout-v1',
      version: 1,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            layout: sanitizeLayout(),
            draggingPanelId: null,
          };
        }
        const candidateLayout = (persistedState as { layout?: WorkspaceLayout }).layout;
        return {
          layout: sanitizeLayout(candidateLayout),
          draggingPanelId: null,
        };
      },
    },
  ),
);

export const workspacePanelLabels: Record<WorkspacePanelId, string> = {
  capture: 'Capture audio',
  cleanupInstructions: 'Cleanup instructions',
  importEntries: 'Imports',
  snippets: 'Snippets',
  transcriptHistory: 'Transcript history',
  transcript: 'Transcript',
  summary: 'Summary',
  cleanupResult: 'Cleanup result',
  actionItems: 'Action items',
  scheduleSuggestion: 'Suggested calendar event',
  calendar: 'Calendar follow-up',
  provider: 'Provider and voice',
  scriptEditor: 'Script editor',
  translationControls: 'Translation settings',
  generate: 'Generate speech',
  playback: 'Playback',
  batchQueue: 'Batch queue',
  pronunciation: 'Pronunciation dictionary',
  ttsHistory: 'Recent speech history',
  translationHistory: 'Translation history',
  credentials: 'Provider credentials',
  theme: 'Theme preference',
  compact: 'Compact layout',
  notifications: 'Notifications',
};

export { DEFAULT_LAYOUT as workspaceDefaultLayout };
