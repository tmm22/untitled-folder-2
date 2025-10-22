'use client';

export type WorkspaceColumnId = 'full' | 'left' | 'center' | 'right';

export type WorkspacePanelId =
  | 'pipelineStatus'
  | 'captureAudio'
  | 'uploadAudio'
  | 'cleanupInstructions'
  | 'importPanel'
  | 'snippetPanel'
  | 'transcriptHistory'
  | 'transcriptView'
  | 'summary'
  | 'cleanupResult'
  | 'actionItems'
  | 'suggestedCalendarEvent'
  | 'calendarFollowUp'
  | 'ttsControls';

export interface WorkspaceLayoutColumn {
  id: WorkspaceColumnId;
  panelIds: WorkspacePanelId[];
}

export interface WorkspaceLayoutSnapshot {
  version: number;
  columns: WorkspaceLayoutColumn[];
}

export const CURRENT_WORKSPACE_LAYOUT_VERSION = 2;

export const ALL_WORKSPACE_PANEL_IDS: WorkspacePanelId[] = [
  'pipelineStatus',
  'captureAudio',
  'uploadAudio',
  'cleanupInstructions',
  'importPanel',
  'snippetPanel',
  'transcriptHistory',
  'transcriptView',
  'summary',
  'cleanupResult',
  'actionItems',
  'suggestedCalendarEvent',
  'calendarFollowUp',
  'ttsControls',
];

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayoutSnapshot = {
  version: CURRENT_WORKSPACE_LAYOUT_VERSION,
  columns: [
    {
      id: 'full',
      panelIds: ['pipelineStatus'],
    },
    {
      id: 'left',
      panelIds: ['captureAudio', 'uploadAudio', 'cleanupInstructions', 'importPanel', 'snippetPanel', 'transcriptHistory'],
    },
    {
      id: 'center',
      panelIds: ['transcriptView', 'summary', 'cleanupResult', 'actionItems', 'suggestedCalendarEvent', 'calendarFollowUp'],
    },
    {
      id: 'right',
      panelIds: ['ttsControls'],
    },
  ],
};
