'use client';

export type WorkspaceTabId = 'capture' | 'transcript' | 'calendar' | 'narration' | 'history' | 'settings';

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
  | 'voiceSettings'
  | 'scriptEditor'
  | 'playbackControls'
  | 'batchQueue'
  | 'pronunciationPanel'
  | 'ttsHistory'
  | 'translationHistory'
  | 'credentialsPanel'
  | 'themePanel'
  | 'compactPanel'
  | 'notificationPanel';

export interface WorkspaceLayoutTab {
  id: WorkspaceTabId;
  panelIds: WorkspacePanelId[];
}

export interface WorkspaceLayoutSnapshot {
  version: number;
  tabs: WorkspaceLayoutTab[];
  activeTabId?: WorkspaceTabId;
}

export const CURRENT_WORKSPACE_LAYOUT_VERSION = 3;

export const ALL_WORKSPACE_TAB_IDS: WorkspaceTabId[] = [
  'capture',
  'transcript',
  'calendar',
  'narration',
  'history',
  'settings',
];

export const TAB_LABELS: Record<WorkspaceTabId, string> = {
  capture: 'Capture',
  transcript: 'Transcript',
  calendar: 'Calendar',
  narration: 'Narration',
  history: 'History',
  settings: 'Settings',
};

// Human-readable panel names matching each panel's visible title, for
// accessible labels on arrange-mode controls.
export const PANEL_LABELS: Record<WorkspacePanelId, string> = {
  pipelineStatus: 'Pipeline status',
  captureAudio: 'Capture audio',
  uploadAudio: 'Upload audio file',
  cleanupInstructions: 'Cleanup instructions',
  importPanel: 'Imports',
  snippetPanel: 'Snippet library',
  transcriptHistory: 'Transcript history',
  transcriptView: 'Transcript',
  summary: 'Summary',
  cleanupResult: 'Cleanup result',
  actionItems: 'Action items',
  suggestedCalendarEvent: 'Suggested calendar event',
  calendarFollowUp: 'Calendar follow-up',
  voiceSettings: 'Provider & voice',
  scriptEditor: 'Script editor',
  playbackControls: 'Playback controls',
  batchQueue: 'Batch queue',
  pronunciationPanel: 'Pronunciation glossary',
  ttsHistory: 'Recent generations',
  translationHistory: 'Translation history',
  credentialsPanel: 'Provider credentials',
  themePanel: 'Appearance',
  compactPanel: 'Compact layout',
  notificationPanel: 'Notifications',
};

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

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayoutSnapshot = {
  version: CURRENT_WORKSPACE_LAYOUT_VERSION,
  activeTabId: 'capture',
  tabs: [
    {
      id: 'capture',
      panelIds: ['captureAudio', 'uploadAudio', 'importPanel', 'snippetPanel'],
    },
    {
      id: 'transcript',
      panelIds: ['transcriptView', 'summary', 'cleanupResult', 'actionItems', 'cleanupInstructions'],
    },
    {
      id: 'calendar',
      panelIds: ['suggestedCalendarEvent', 'calendarFollowUp'],
    },
    {
      id: 'narration',
      panelIds: ['voiceSettings', 'scriptEditor', 'playbackControls', 'batchQueue', 'pronunciationPanel'],
    },
    {
      id: 'history',
      panelIds: ['transcriptHistory', 'ttsHistory', 'translationHistory'],
    },
    {
      id: 'settings',
      panelIds: ['credentialsPanel', 'themePanel', 'compactPanel', 'notificationPanel'],
    },
  ],
};

export type LegacyWorkspaceColumnId = 'full' | 'left' | 'center' | 'right';

export interface LegacyWorkspaceLayoutColumn {
  id: LegacyWorkspaceColumnId;
  panelIds: string[];
}

export interface LegacyWorkspaceLayoutSnapshot {
  version: number;
  columns: LegacyWorkspaceLayoutColumn[];
}
