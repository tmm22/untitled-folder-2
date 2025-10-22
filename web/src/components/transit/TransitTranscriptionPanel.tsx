'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createAudioRecorder, isMediaRecorderSupported, type RecorderHandle } from '@/lib/audio/mediaRecorder';
import { useTransitTranscriptionStore } from '@/modules/transitTranscription/store';
import { useTransitTranscriptionHistoryStore } from '@/modules/transitTranscription/historyStore';
import { useAccountStore } from '@/modules/account/store';
import type { TransitSummaryAction, TransitTranscriptionRecord } from '@/modules/transitTranscription/types';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';
import { triggerDownloadText } from '@/lib/utils/download';
import { useTTSStore } from '@/modules/tts/store';
import { ProviderSelector } from '@/components/settings/ProviderSelector';
import { TextEditor } from '@/components/editor/TextEditor';
import { GenerateButton } from '@/components/editor/GenerateButton';
import { TranslationControls } from '@/components/translations/TranslationControls';
import { TranslationHistoryPanel } from '@/components/translations/TranslationHistoryPanel';
import { PlaybackControls } from '@/components/playback/PlaybackControls';
import { BatchPanel } from '@/components/queue/BatchPanel';
import { PronunciationPanel } from '@/components/settings/PronunciationPanel';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { SnippetPanel } from '@/components/snippets/SnippetPanel';
import { ImportPanel } from '@/components/imports/ImportPanel';
import { CredentialsPanel } from '@/components/settings/CredentialsPanel';
import { ThemePanel } from '@/components/settings/ThemePanel';
import { CompactPanel } from '@/components/settings/CompactPanel';
import { NotificationPanel } from '@/components/settings/NotificationPanel';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useWorkspaceLayoutStore } from '@/modules/workspaceLayout/store';
import { ALL_WORKSPACE_PANEL_IDS, type WorkspaceColumnId, type WorkspacePanelId } from '@/modules/workspaceLayout/types';

const stageLabels: Record<string, string> = {
  idle: 'Ready',
  uploading: 'Uploading audio…',
  received: 'Audio received',
  transcribing: 'Transcribing with OpenAI…',
  summarising: 'Generating insights…',
  cleaning: 'Applying cleanup instructions…',
  synthesising: 'Generating narration…',
  persisting: 'Saving transcript…',
  complete: 'Complete',
  error: 'Error',
};

const cleanupPresets = [
  {
    label: 'Australian English',
    instruction:
      'Rewrite the transcript using Australian English spelling and idioms. Fix obvious transcription errors, ensure sentences read naturally, and keep the meaning intact.',
  },
  {
    label: 'Professional tone',
    instruction:
      'Polish the transcript into a professional business document with clear paragraphs and precise wording while preserving factual details.',
  },
  {
    label: 'Meeting minutes',
    instruction:
      'Transform the transcript into concise meeting minutes with clear sections for context, decisions, and next steps. Remove filler words and keep names where available.',
  },
] as const;

const WORKSPACE_PANEL_DRAG_TYPE = 'application/x-tts-workspace-panel';

const formatMilliseconds = (value: number): string => {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const SummaryActionItem = ({ item }: { item: TransitSummaryAction }) => {
  return (
    <li className="rounded-lg border border-charcoal-200/70 bg-white/60 px-3 py-2 text-sm text-charcoal-900 shadow-sm shadow-charcoal-200/50">
      <p className="font-medium">{item.text}</p>
      {(item.ownerHint || item.dueDateHint) && (
        <p className="mt-1 text-xs text-charcoal-500">
          {item.ownerHint ? `Owner: ${item.ownerHint}` : ''}
          {item.ownerHint && item.dueDateHint ? ' • ' : ''}
          {item.dueDateHint ? `Timing: ${item.dueDateHint}` : ''}
        </p>
      )}
    </li>
  );
};

const WorkspaceSection = ({
  id,
  title,
  children,
  className,
  actions,
  defaultCollapsed,
  allowResize = true,
  minHeight,
  maxHeight,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  defaultCollapsed?: boolean;
  allowResize?: boolean;
  minHeight?: number;
  maxHeight?: number;
}) => (
  <CollapsibleSection
    id={id}
    title={title}
    variant="plain"
    className={className}
    actions={actions}
    defaultCollapsed={defaultCollapsed}
    allowResize={allowResize}
    minHeight={minHeight}
    maxHeight={maxHeight}
  >
    {children}
  </CollapsibleSection>
);

export function TransitTranscriptionPanel() {
  const stage = useTransitTranscriptionStore((state) => state.stage);
  const segments = useTransitTranscriptionStore((state) => state.segments);
  const summary = useTransitTranscriptionStore((state) => state.summary);
  const cleanupResult = useTransitTranscriptionStore((state) => state.cleanupResult);
  const cleanupInstruction = useTransitTranscriptionStore((state) => state.cleanupInstruction);
  const cleanupLabel = useTransitTranscriptionStore((state) => state.cleanupLabel);
  const record = useTransitTranscriptionStore((state) => state.record);
  const error = useTransitTranscriptionStore((state) => state.error);
  const isStreaming = useTransitTranscriptionStore((state) => state.isStreaming);
  const progress = useTransitTranscriptionStore((state) => state.progress);
  const transcriptText = useTransitTranscriptionStore((state) => state.transcriptText);
  const title = useTransitTranscriptionStore((state) => state.title);
  const actions = useTransitTranscriptionStore((state) => state.actions);
  const historyRecords = useTransitTranscriptionHistoryStore((state) => state.records);
  const historyHydrated = useTransitTranscriptionHistoryStore((state) => state.hydrated);
  const historyError = useTransitTranscriptionHistoryStore((state) => state.error);
  const historyActions = useTransitTranscriptionHistoryStore((state) => state.actions);

  const [isRecorderSupported, setRecorderSupported] = useState<boolean>(false);
  const [isPreparingRecorder, setPreparingRecorder] = useState(false);
  const [recordingHandle, setRecordingHandle] = useState<RecorderHandle | null>(null);
  const [isRecording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionKind = useAccountStore((state) => state.sessionKind);
  const userId = useAccountStore((state) => state.userId);
  const isAuthenticated = sessionKind === 'authenticated';
  const [calendarTitle, setCalendarTitle] = useState('');
  const [calendarWindow, setCalendarWindow] = useState('');
  const [calendarDuration, setCalendarDuration] = useState<number | ''>('');
  const [calendarParticipants, setCalendarParticipants] = useState('');
  const [calendarNotes, setCalendarNotes] = useState('');
  const [calendarStatus, setCalendarStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [calendarFormError, setCalendarFormError] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarConnectionError, setCalendarConnectionError] = useState<string | null>(null);
  const [calendarInfoMessage, setCalendarInfoMessage] = useState<string | null>(null);
  const [isConnectingCalendar, setConnectingCalendar] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [historyPendingId, setHistoryPendingId] = useState<string | null>(null);

  const ttsIsGenerating = useTTSStore((state) => state.isGenerating);
  const ttsError = useTTSStore((state) => state.errorMessage);
  const setTTSInputText = useTTSStore((state) => state.actions.setInputText);
  const layout = useWorkspaceLayoutStore((state) => state.layout);
  const layoutIsHydrating = useWorkspaceLayoutStore((state) => state.isHydrating);
  const layoutIsSaving = useWorkspaceLayoutStore((state) => state.isSaving);
  const layoutError = useWorkspaceLayoutStore((state) => state.error);
  const hydrateLayout = useWorkspaceLayoutStore((state) => state.actions.hydrate);
  const movePanel = useWorkspaceLayoutStore((state) => state.actions.movePanel);
  const resetLayout = useWorkspaceLayoutStore((state) => state.actions.reset);
  const setLayoutError = useWorkspaceLayoutStore((state) => state.actions.setError);

  const trimmedCleanupInstruction = cleanupInstruction.trim();
  const hasCleanupInstruction = trimmedCleanupInstruction.length > 0;
  const [draggedPanel, setDraggedPanel] = useState<WorkspacePanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: WorkspaceColumnId; index: number } | null>(null);


  useEffect(() => {
    setRecorderSupported(isMediaRecorderSupported());
  }, []);

  useEffect(() => {
    void hydrateLayout(userId);
  }, [hydrateLayout, userId]);

  useEffect(() => {
    if (historyHydrated) {
      return;
    }
    void historyActions.hydrate();
  }, [historyActions, historyHydrated]);

  useEffect(() => {
    return () => {
      if (recordingHandle) {
        recordingHandle.cancel();
      }
    };
  }, [recordingHandle]);

  useEffect(() => {
    if (!summary?.scheduleRecommendation) {
      return;
    }

    setCalendarTitle((prev) => prev || summary.scheduleRecommendation?.title || '');
    if (!calendarWindow && summary.scheduleRecommendation.startWindow) {
      setCalendarWindow(summary.scheduleRecommendation.startWindow);
    }
    if (calendarDuration === '' && summary.scheduleRecommendation.durationMinutes) {
      setCalendarDuration(summary.scheduleRecommendation.durationMinutes);
    }
  }, [summary, calendarWindow, calendarDuration]);

  const refreshCalendarStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setCalendarConnected(false);
      setCalendarConnectionError(null);
      return;
    }
    try {
      const response = await fetch('/api/transit/calendar/status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Status request failed (${response.status})`);
      }
      const payload = (await response.json()) as { connected: boolean; expiresAt?: number };
      setCalendarConnected(Boolean(payload.connected));
      if (!payload.connected) {
        setCalendarConnectionError('Connect Google Calendar to schedule follow-ups.');
      } else {
        setCalendarConnectionError(null);
      }
    } catch (statusError) {
      console.error('Failed to load calendar connection status', statusError);
      setCalendarConnected(false);
      setCalendarConnectionError('Unable to verify Google Calendar connection.');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshCalendarStatus();
  }, [refreshCalendarStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const marker = params.get('calendar');
    if (!marker) {
      return;
    }
    if (marker === 'success') {
      setCalendarInfoMessage('Google Calendar connected successfully.');
      setCalendarConnectionError(null);
      void refreshCalendarStatus();
    } else if (marker === 'error') {
      setCalendarConnectionError('Google Calendar connection failed. Try again.');
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('calendar');
    window.history.replaceState({}, document.title, nextUrl.toString());
  }, [refreshCalendarStatus]);

  useEffect(() => {
    if (record?.transcript) {
      setTTSInputText(record.transcript);
    }
  }, [record?.id, record?.transcript, setTTSInputText]);

  const resetInteraction = useCallback(() => {
    setRecording(false);
    setRecordingHandle(null);
    setPreparingRecorder(false);
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (!isRecorderSupported || isRecording || isPreparingRecorder) {
      return;
    }
    setPreparingRecorder(true);
    try {
      const handle = await createAudioRecorder({ mimeType: 'audio/webm;codecs=opus', timesliceMs: 1000 });
      setRecordingHandle(handle);
      actions.setSource('microphone');
      await handle.start();
      setRecording(true);
    } catch (recorderError) {
      console.error('Failed to start recorder', recorderError);
    } finally {
      setPreparingRecorder(false);
    }
  }, [actions, isPreparingRecorder, isRecorderSupported, isRecording]);

  const handleStopRecording = useCallback(async () => {
    if (!recordingHandle || !isRecording) {
      return;
    }
    try {
      const blob = await recordingHandle.stop();
      const generatedTitle = title?.trim()
        ? title
        : `Transit capture ${new Date().toLocaleString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}`;
      await actions.submit({ file: blob, title: generatedTitle });
    } catch (stopError) {
      console.error('Stopping recorder failed', stopError);
      actions.cancel();
    } finally {
      resetInteraction();
    }
  }, [actions, recordingHandle, resetInteraction, isRecording, title]);

  const handleCancelRecording = useCallback(() => {
    recordingHandle?.cancel();
    actions.cancel();
    resetInteraction();
  }, [actions, recordingHandle, resetInteraction]);

  const handleFilePick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }
      const file = files[0];
      actions.setSource('upload');
      const generatedTitle = title?.trim() ? title : file.name.replace(/\.[^/.]+$/, '');
      await actions.submit({ file, title: generatedTitle });
      event.target.value = '';
    },
    [actions, title],
  );

  const handleConnectCalendar = useCallback(async () => {
    if (isConnectingCalendar) {
      return;
    }
    setConnectingCalendar(true);
    setCalendarInfoMessage(null);
    setCalendarConnectionError(null);
    try {
      const response = await fetch('/api/transit/calendar/oauth/start', {
        method: 'POST',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? 'Unable to start Google OAuth flow');
      }
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        throw new Error('OAuth start response missing redirect URL');
      }
      if (typeof window !== 'undefined') {
        window.location.href = payload.url;
      }
    } catch (connectError) {
      console.error('Failed to initiate Google Calendar connection', connectError);
      setCalendarConnectionError(
        connectError instanceof Error ? connectError.message : 'Failed to start calendar connection',
      );
    } finally {
      setConnectingCalendar(false);
    }
  }, [isConnectingCalendar]);

  const handleCalendarSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!calendarTitle.trim()) {
        setCalendarFormError('Provide a title for the calendar event.');
        return;
      }
      if (!isAuthenticated) {
        setCalendarFormError('Sign in to schedule calendar follow-ups.');
        return;
      }
      if (!calendarConnected) {
        setCalendarFormError('Connect Google Calendar before scheduling.');
        return;
      }

      setCalendarStatus('saving');
      setCalendarFormError(null);
      setCalendarInfoMessage(null);

      try {
        const participants = calendarParticipants
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        const response = await fetch('/api/transit/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: calendarTitle.trim(),
            startWindow: calendarWindow.trim() || undefined,
            durationMinutes:
              calendarDuration !== '' && Number.isFinite(Number(calendarDuration))
                ? Number(calendarDuration)
                : undefined,
            participants,
            notes: calendarNotes.trim() || undefined,
            transcriptId: record?.id,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error((payload as { error?: string }).error ?? 'Calendar request failed');
        }
        setCalendarStatus('success');
        setCalendarInfoMessage('Event scheduled in Google Calendar.');
      } catch (calendarSubmitError) {
        setCalendarStatus('error');
        setCalendarFormError(
          calendarSubmitError instanceof Error ? calendarSubmitError.message : 'Calendar request failed',
        );
      }
    },
    [
      calendarDuration,
      calendarNotes,
      calendarParticipants,
      calendarTitle,
      calendarWindow,
      isAuthenticated,
      calendarConnected,
      record?.id,
    ],
  );

  const pipelineStage = useMemo(() => {
    if (isStreaming) {
      return stage;
    }
    if (ttsIsGenerating) {
      return 'synthesising';
    }
    return stage;
  }, [isStreaming, stage, ttsIsGenerating]);

  const pipelineStatusLabel = useMemo(() => stageLabels[pipelineStage] ?? 'Ready', [pipelineStage]);

  const pipelineProgress = useMemo(() => {
    if (pipelineStage === 'synthesising') {
      return 0.9;
    }
    if (pipelineStage === 'idle') {
      return 0;
    }
    return progress;
  }, [pipelineStage, progress]);

  const pipelineProgressPercent = Math.round(Math.min(1, Math.max(0, pipelineProgress)) * 100);

  const aggregatedError = error ?? ttsError ?? null;

  const hasResults = Boolean(record || summary || cleanupResult || segments.length > 0);
  const calendarFormDisabled = !calendarConnected;
  const sortedHistoryRecords = useMemo(() => {
    return [...historyRecords].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [historyRecords]);
  const layoutColumns = useMemo(() => {
    const map = new Map<WorkspaceColumnId, WorkspacePanelId[]>();
    layout.columns.forEach((column) => {
      map.set(column.id as WorkspaceColumnId, [...column.panelIds]);
    });
    return map;
  }, [layout]);
  const fullWidthPanels = layoutColumns.get('full') ?? [];
  const leftColumnPanels = layoutColumns.get('left') ?? [];
  const centerColumnPanels = layoutColumns.get('center') ?? [];
  const rightColumnPanels = layoutColumns.get('right') ?? [];

  const handleReset = useCallback(() => {
    actions.reset();
    resetInteraction();
    setCalendarStatus('idle');
    setCalendarFormError(null);
    setCalendarInfoMessage(null);
    setCalendarTitle('');
    setCalendarParticipants('');
    setCalendarNotes('');
    setCalendarDuration('');
    setCalendarWindow('');
    void resetLayout();
  }, [actions, resetInteraction, resetLayout]);

  const handleHistoryLoad = useCallback(
    (historyRecord: TransitTranscriptionRecord) => {
      actions.loadFromHistory(historyRecord);
      setHistoryStatus('Transcript loaded into the workspace.');
    },
    [actions],
  );

  const handleHistoryDownload = useCallback((historyRecord: TransitTranscriptionRecord) => {
    triggerDownloadText(
      historyRecord.transcript,
      `transit-transcript-${historyRecord.id}.txt`,
      'text/plain;charset=utf-8',
    );
    setHistoryStatus('Transcript download started.');
  }, []);

  const handleHistoryRemove = useCallback(
    async (id: string) => {
      if (historyPendingId) {
        return;
      }
      try {
        setHistoryPendingId(id);
        await historyActions.remove(id);
        setHistoryStatus('Transcript removed from history.');
      } catch (removeError) {
        console.error('Failed to remove transit transcript record', removeError);
        setHistoryStatus('Unable to remove transcript.');
      } finally {
        setHistoryPendingId(null);
      }
    },
    [historyActions, historyPendingId],
  );

  const handleHistoryClear = useCallback(async () => {
    if (historyClearing) {
      return;
    }
    if (sortedHistoryRecords.length === 0) {
      setHistoryStatus('History is already empty.');
      return;
    }
    try {
      setHistoryClearing(true);
      await historyActions.clear();
      setHistoryStatus('Transcript history cleared.');
    } catch (clearError) {
      console.error('Failed to clear transit transcript history', clearError);
      setHistoryStatus('Unable to clear transcript history.');
    } finally {
      setHistoryClearing(false);
    }
  }, [historyActions, historyClearing, sortedHistoryRecords.length]);

  const resolveDraggedPanelId = useCallback(
    (event?: React.DragEvent) => {
      if (draggedPanel) {
        return draggedPanel;
      }
      if (!event) {
        return null;
      }
      const payload =
        event.dataTransfer.getData(WORKSPACE_PANEL_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
      if (!payload || !ALL_WORKSPACE_PANEL_IDS.includes(payload as WorkspacePanelId)) {
        return null;
      }
      setDraggedPanel(payload as WorkspacePanelId);
      return payload as WorkspacePanelId;
    },
    [draggedPanel],
  );

  const handleDragStartPanel = useCallback(
    (panelId: WorkspacePanelId) => (event: React.DragEvent<HTMLDivElement>) => {
      setDraggedPanel(panelId);
      setDropTarget(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(WORKSPACE_PANEL_DRAG_TYPE, panelId);
      event.dataTransfer.setData('text/plain', panelId);
    },
    [],
  );

  const handleDragEndPanel = useCallback(() => {
    setDraggedPanel(null);
    setDropTarget(null);
  }, []);

  const handleZoneDragOver = useCallback(
    (columnId: WorkspaceColumnId, index: number) =>
      (event: React.DragEvent<HTMLDivElement>) => {
        const panelId = resolveDraggedPanelId(event);
        if (!panelId) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget((previous) => {
          if (previous && previous.columnId === columnId && previous.index === index) {
            return previous;
          }
          return { columnId, index };
        });
      },
    [resolveDraggedPanelId],
  );

  const handleZoneDrop = useCallback(
    (columnId: WorkspaceColumnId, index: number) =>
      (event: React.DragEvent<HTMLDivElement>) => {
        const panelId = resolveDraggedPanelId(event);
        if (!panelId) {
          return;
        }
        event.preventDefault();
        movePanel(panelId, columnId, index);
        setDropTarget(null);
        setDraggedPanel(null);
      },
    [movePanel, resolveDraggedPanelId],
  );

  const handleZoneDragLeave = useCallback(
    (columnId: WorkspaceColumnId, index: number) =>
      () => {
        setDropTarget((previous) => {
          if (!previous) {
            return previous;
          }
          if (previous.columnId === columnId && previous.index === index) {
            return null;
          }
          return previous;
        });
      },
    [],
  );

  const renderPipelineStatusSection = () => (
    <WorkspaceSection
      title="Pipeline status"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
      allowResize={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-accent-500">Pipeline status</p>
          <p className="text-sm font-medium text-charcoal-900">{pipelineStatusLabel}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-64">
          <div className="relative h-2 flex-1 rounded-full bg-charcoal-200/60">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent-500 transition-all"
              style={{ width: `${pipelineProgressPercent}%` }}
            />
          </div>
          <span className="w-12 text-right text-xs text-charcoal-500">{pipelineProgressPercent}%</span>
        </div>
      </div>
      {aggregatedError && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{aggregatedError}</p>
      )}
    </WorkspaceSection>
  );

  const renderCaptureAudioSection = () => (
    <WorkspaceSection
      id="capture"
      title="Capture audio"
      className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50"
      actions={
        isRecording ? (
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
            Recording…
          </span>
        ) : null
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-charcoal-900">Capture audio</h3>
      </div>
      {isRecorderSupported ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={`rounded-full px-4 py-2 text-sm font-medium shadow transition ${
                isRecording
                  ? 'bg-red-500 text-cream-50 hover:bg-red-600'
                  : 'bg-accent-600 text-cream-50 hover:bg-accent-700'
              } ${isPreparingRecorder ? 'opacity-60' : ''}`}
              disabled={isPreparingRecorder}
            >
              {isRecording ? 'Stop recording' : 'Start recording'}
            </button>
            {isRecording && (
              <button
                type="button"
                onClick={handleCancelRecording}
                className="rounded-full border border-charcoal-300 px-3 py-2 text-sm font-medium text-charcoal-600 hover:bg-charcoal-100/70"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-xs text-charcoal-500">
            {isRecording
              ? 'Recording… stop when you are ready to transcribe.'
              : 'Allow microphone access to capture live communications.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-charcoal-500">
          Microphone recording is not supported in this browser. Use the upload option instead.
        </p>
      )}
    </WorkspaceSection>
  );

  const renderUploadAudioSection = () => (
    <WorkspaceSection
      id="upload"
      title="Upload audio file"
      className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50"
    >
      <h3 className="text-sm font-semibold text-charcoal-900">Upload audio file</h3>
      <p className="text-xs text-charcoal-500">
        Bring in recordings from other tools. Transit supports MP3, WAV, FLAC, and more up to 200MB.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            actions.setSource('upload');
            fileInputRef.current?.click();
          }}
          className="rounded-full bg-charcoal-900 px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-charcoal-800"
          disabled={isStreaming}
        >
          Choose file
        </button>
        <button
          type="button"
          onClick={() => {
            actions.setSource('upload');
            fileInputRef.current?.click();
          }}
          className="rounded-full border border-charcoal-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 hover:bg-charcoal-100/70"
          disabled={isStreaming}
        >
          Browse files
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFilePick}
      />
    </WorkspaceSection>
  );

  const renderCleanupInstructionsSection = () => (
    <WorkspaceSection
      id="cleanup-controls"
      title="Cleanup instructions"
      className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50"
    >
      <h3 className="text-sm font-semibold text-charcoal-900">Cleanup instructions</h3>
      <p className="text-xs text-charcoal-500">
        Ask the assistant to polish each transcript—for example Australian English, professional tone, or meeting-ready notes.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {cleanupPresets.map((preset) => {
          const isActive = cleanupLabel === preset.label;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => actions.setCleanupInstruction(preset.instruction, preset.label)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-accent-600 bg-accent-600 text-cream-50 shadow-sm shadow-accent-200/60'
                  : 'border-charcoal-300 text-charcoal-600 hover:border-accent-500 hover:text-accent-600'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => actions.setCleanupInstruction('', undefined)}
          className="rounded-full border border-transparent px-3 py-1 text-xs font-medium text-charcoal-500 transition hover:text-charcoal-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasCleanupInstruction}
        >
          Clear
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
        Custom instruction
        <textarea
          value={cleanupInstruction}
          onChange={(event) => actions.setCleanupInstruction(event.target.value, undefined)}
          className="min-h-[96px] rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner transition focus:border-accent-500 focus:outline-none"
          placeholder="e.g. Make this transcript conform to Australian English standards and read like a formal briefing."
        />
      </label>
      <p className="text-xs text-charcoal-500">
        {hasCleanupInstruction
          ? 'Cleanup runs automatically after transcription completes. The polished version appears in the Cleanup panel.'
          : 'Add an instruction to generate a polished version alongside the raw transcript.'}
      </p>
    </WorkspaceSection>
  );

  const renderImportPanelSection = () => <ImportPanel />;

  const renderSnippetPanelSection = () => <SnippetPanel />;

  const renderTranscriptHistorySection = () => (
    <WorkspaceSection
      id="transcript-history"
      title="Transcript history"
      className="rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50"
      actions={
        <button
          type="button"
          className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          onClick={() => void handleHistoryClear()}
          disabled={historyClearing || sortedHistoryRecords.length === 0}
        >
          Clear
        </button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal-900">Transcript history</h3>
      </div>
      {historyStatus && <p className="mt-2 text-xs text-charcoal-500">{historyStatus}</p>}
      {!historyHydrated && <p className="mt-3 text-sm text-charcoal-500">Loading transcript history…</p>}
      {historyHydrated && historyError && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{historyError}</p>
      )}
      {historyHydrated && !historyError && (
        sortedHistoryRecords.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal-500">Transcribe audio to start building your history.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {sortedHistoryRecords.map((historyRecord) => (
              <article
                key={historyRecord.id}
                className="rounded-xl border border-charcoal-200/70 bg-cream-50/80 p-3 shadow-inner shadow-charcoal-200/30"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-charcoal-900">
                    {historyRecord.title || 'Untitled transcript'}
                  </h4>
                  <FormattedTimestamp value={historyRecord.createdAt} className="text-xs text-charcoal-500" />
                </header>
                <p className="mt-2 line-clamp-3 text-sm text-charcoal-600">
                  {historyRecord.summary?.summary ?? historyRecord.transcript}
                </p>
                {historyRecord.cleanup && (
                  <p className="mt-1 text-xs text-charcoal-500">
                    Cleanup: {historyRecord.cleanup.label ?? 'Custom instructions'}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-charcoal-500">
                  <span className="capitalize text-charcoal-700">{historyRecord.source}</span>
                  <span className="text-charcoal-700">
                    Duration: {formatMilliseconds(historyRecord.durationMs)}
                  </span>
                  <span className="text-charcoal-700">Segments: {historyRecord.segments.length}</span>
                  <span className="text-charcoal-700">
                    Confidence:{' '}
                    {typeof historyRecord.confidence === 'number' && Number.isFinite(historyRecord.confidence)
                      ? `${Math.round(Math.max(0, Math.min(1, historyRecord.confidence)) * 100)}%`
                      : 'Unknown'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-charcoal-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cream-50 hover:bg-charcoal-800"
                    onClick={() => handleHistoryLoad(historyRecord)}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-charcoal-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 hover:bg-charcoal-100/70"
                    onClick={() => handleHistoryDownload(historyRecord)}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    onClick={() => void handleHistoryRemove(historyRecord.id)}
                    disabled={historyPendingId === historyRecord.id}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      )}
    </WorkspaceSection>
  );


  const renderTranscriptViewSection = () => (
    <WorkspaceSection
      id="transcript-view"
      title="Transcript"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
      minHeight={240}
      maxHeight={720}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal-900">Transcript</h3>
        {record?.durationMs ? (
          <span className="text-xs text-charcoal-500">Duration: {formatMilliseconds(record.durationMs)}</span>
        ) : null}
      </div>
      <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-charcoal-100/80 bg-cream-50/90 px-4 py-3 text-sm text-charcoal-800">
        {transcriptText || record?.transcript ? (
          <p className="whitespace-pre-line">{record?.transcript ?? transcriptText}</p>
        ) : (
          <p className="text-charcoal-400">Segments will appear here once transcription starts.</p>
        )}
      </div>
      {segments.length > 0 && (
        <ol className="mt-4 space-y-3">
          {segments.map((segment) => (
            <li
              key={segment.index}
              className="rounded-lg border border-charcoal-100/80 bg-white px-3 py-2 text-sm text-charcoal-800 shadow-sm"
            >
              <div className="flex items-center justify-between text-xs text-charcoal-500">
                <span>Segment {segment.index}</span>
                <span>
                  {formatMilliseconds(segment.startMs)} – {formatMilliseconds(segment.endMs)}
                </span>
              </div>
              <p className="mt-1">{segment.text}</p>
            </li>
          ))}
        </ol>
      )}
    </WorkspaceSection>
  );

  const renderSummarySection = () => (
    <WorkspaceSection
      title="Summary"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
    >
      <h3 className="text-sm font-semibold text-charcoal-900">Summary</h3>
      {summary?.summary ? (
        <p className="mt-2 text-sm text-charcoal-700">{summary.summary}</p>
      ) : (
        <p className="mt-2 text-sm text-charcoal-400">Insights will appear here after transcription.</p>
      )}
    </WorkspaceSection>
  );

  const renderCleanupResultSection = () => (
    <WorkspaceSection
      title="Cleanup result"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-charcoal-900">Cleanup result</h3>
        {cleanupResult ? (
          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-700">
            {cleanupResult.label ?? 'Custom instructions'}
          </span>
        ) : hasCleanupInstruction ? (
          <span className="rounded-full bg-charcoal-100 px-2 py-0.5 text-[11px] font-medium text-charcoal-600">
            Pending
          </span>
        ) : null}
      </div>
      {cleanupResult ? (
        <>
          {!cleanupResult.label && (
            <p className="mt-2 text-xs text-charcoal-500">Instruction: {cleanupResult.instruction}</p>
          )}
          <p className="mt-3 whitespace-pre-line text-sm text-charcoal-700">{cleanupResult.output}</p>
        </>
      ) : hasCleanupInstruction ? (
        <p className="mt-2 text-sm text-charcoal-400">
          {stage === 'cleaning' || isStreaming
            ? 'Applying cleanup instructions…'
            : 'Run a transcription to generate a polished version with the current instructions.'}
        </p>
      ) : (
        <p className="mt-2 text-sm text-charcoal-400">
          Add instructions to generate a polished version alongside the raw transcript.
        </p>
      )}
    </WorkspaceSection>
  );

  const renderActionItemsSection = () => (
    <WorkspaceSection
      title="Action items"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
    >
      <h3 className="text-sm font-semibold text-charcoal-900">Action items</h3>
      {summary?.actionItems && summary.actionItems.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {summary.actionItems.map((item, index) => (
            <SummaryActionItem key={`${item.text}-${index}`} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-charcoal-400">No action items detected.</p>
      )}
    </WorkspaceSection>
  );

  const renderSuggestedCalendarEventSection = () => {
    const recommendation = summary?.scheduleRecommendation;
    return (
      <WorkspaceSection
        title="Suggested calendar event"
        className={`rounded-2xl border p-4 shadow-sm ${
          recommendation
            ? 'border-accent-500/40 bg-accent-50/80 shadow-accent-200/50'
            : 'border-charcoal-200/70 bg-white/80 shadow-charcoal-200/60'
        }`}
      >
        <h3 className={`text-sm font-semibold ${recommendation ? 'text-accent-800' : 'text-charcoal-900'}`}>
          Suggested calendar event
        </h3>
        {recommendation ? (
          <>
            <p className="mt-2 text-sm text-accent-800">{recommendation.title}</p>
            {(recommendation.startWindow ||
              recommendation.durationMinutes ||
              (recommendation.participants?.length ?? 0) > 0) && (
              <ul className="mt-2 space-y-1 text-xs text-accent-700">
                {recommendation.startWindow && <li>Window: {recommendation.startWindow}</li>}
                {recommendation.durationMinutes && <li>Duration: {recommendation.durationMinutes} minutes</li>}
                {recommendation.participants && recommendation.participants.length > 0 && (
                  <li>Participants: {recommendation.participants.join(', ')}</li>
                )}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-charcoal-400">
            Calendar suggestions will appear once transcripts include scheduling hints.
          </p>
        )}
      </WorkspaceSection>
    );
  };

  const renderCalendarFollowUpSection = () => (
    <WorkspaceSection
      id="calendar"
      title="Calendar follow-up"
      className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60"
      actions={
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
            calendarConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-charcoal-100 text-charcoal-600'
          }`}
        >
          {calendarConnected ? 'Google calendar connected' : 'Not connected'}
        </span>
      }
    >
      <h3 className="text-sm font-semibold text-charcoal-900">Calendar follow-up</h3>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConnectCalendar}
          className="rounded-full border border-accent-500 px-4 py-1.5 text-xs font-medium text-accent-600 transition hover:bg-accent-50 disabled:cursor-not-allowed disabled:border-charcoal-300 disabled:text-charcoal-400"
          disabled={isConnectingCalendar}
        >
          {isConnectingCalendar ? 'Opening…' : calendarConnected ? 'Reconnect' : 'Connect Google Calendar'}
        </button>
      </div>
      <p className="mt-2 text-xs text-charcoal-500">
        Enter attendees manually. Only the organiser is pre-filled from your signed-in account. Events use your configured Google Calendar timezone.
      </p>
      <form className="mt-3 flex flex-col gap-3" onSubmit={handleCalendarSubmit}>
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
          Title
          <input
            type="text"
            value={calendarTitle}
            onChange={(event) => {
              setCalendarTitle(event.target.value);
              setCalendarStatus('idle');
            }}
            className="rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner disabled:cursor-not-allowed disabled:bg-charcoal-100"
            placeholder="e.g. Route 9 follow-up briefing"
            disabled={calendarFormDisabled}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
          Preferred window
          <input
            type="text"
            value={calendarWindow}
            onChange={(event) => {
              setCalendarWindow(event.target.value);
              setCalendarStatus('idle');
            }}
            className="rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner disabled:cursor-not-allowed disabled:bg-charcoal-100"
            placeholder="Tomorrow between 2–4pm"
            disabled={calendarFormDisabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
          Duration (minutes)
          <input
            type="number"
            min={0}
            value={calendarDuration}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              setCalendarDuration(Number.isFinite(next) ? next : '');
              setCalendarStatus('idle');
            }}
            className="w-32 rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner disabled:cursor-not-allowed disabled:bg-charcoal-100"
            placeholder="45"
            disabled={calendarFormDisabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
          Participants (one per line)
          <textarea
            value={calendarParticipants}
            onChange={(event) => {
              setCalendarParticipants(event.target.value);
              setCalendarStatus('idle');
            }}
            className="min-h-[96px] rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner disabled:cursor-not-allowed disabled:bg-charcoal-100"
            placeholder="alex@example.com\nassist@example.com"
            disabled={calendarFormDisabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal-700">
          Notes
          <textarea
            value={calendarNotes}
            onChange={(event) => {
              setCalendarNotes(event.target.value);
              setCalendarStatus('idle');
            }}
            className="min-h-[72px] rounded-lg border border-charcoal-200/70 bg-white px-3 py-2 text-sm text-charcoal-900 shadow-inner disabled:cursor-not-allowed disabled:bg-charcoal-100"
            placeholder="Key agenda points or links"
            disabled={calendarFormDisabled}
          />
        </label>
        <button
          type="submit"
          className="self-start rounded-full bg-accent-600 px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-charcoal-300"
          disabled={calendarStatus === 'saving' || calendarFormDisabled}
        >
          {isAuthenticated
            ? calendarFormDisabled
              ? 'Connect Google Calendar'
              : calendarStatus === 'saving'
                ? 'Scheduling…'
                : 'Schedule Google Calendar event'
            : 'Sign in to schedule'}
        </button>
      </form>
      {calendarConnectionError && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">{calendarConnectionError}</p>
      )}
      {calendarFormError && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{calendarFormError}</p>
      )}
      {calendarInfoMessage && calendarStatus !== 'success' && (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{calendarInfoMessage}</p>
      )}
      {calendarStatus === 'success' && (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Event scheduled in Google Calendar.</p>
      )}
    </WorkspaceSection>
  );

  const renderTTSControlsSection = () => (
    <WorkspaceSection
      id="tts-controls"
      title="Narration controls"
      className="flex flex-col gap-6 rounded-3xl border border-charcoal-200/70 bg-white/90 p-6 shadow-sm shadow-charcoal-200/60"
    >
      <ProviderSelector />
      <TextEditor />
      <TranslationControls />
      <GenerateButton />
      <PlaybackControls />
      <BatchPanel />
      <PronunciationPanel />
      <HistoryPanel />
      <TranslationHistoryPanel />
      <CredentialsPanel />
      <ThemePanel />
      <CompactPanel />
      <NotificationPanel />
    </WorkspaceSection>
  );

  const panelRenderer: Record<WorkspacePanelId, () => ReactNode> = {
    pipelineStatus: renderPipelineStatusSection,
    captureAudio: renderCaptureAudioSection,
    uploadAudio: renderUploadAudioSection,
    cleanupInstructions: renderCleanupInstructionsSection,
    importPanel: renderImportPanelSection,
    snippetPanel: renderSnippetPanelSection,
    transcriptHistory: renderTranscriptHistorySection,
    transcriptView: renderTranscriptViewSection,
    summary: renderSummarySection,
    cleanupResult: renderCleanupResultSection,
    actionItems: renderActionItemsSection,
    suggestedCalendarEvent: renderSuggestedCalendarEventSection,
    calendarFollowUp: renderCalendarFollowUpSection,
    ttsControls: renderTTSControlsSection,
  };

  const renderPanel = (panelId: WorkspacePanelId) => {
    const renderer = panelRenderer[panelId];
    if (!renderer) {
      console.warn('Missing renderer for workspace panel', panelId);
      return null;
    }
    return renderer();
  };

  const WorkspaceDropZone = ({
    columnId,
    index,
    isActive,
    isVisible,
    onDragOver,
    onDrop,
    onDragLeave,
    label,
  }: {
    columnId: WorkspaceColumnId;
    index: number;
    isActive: boolean;
    isVisible: boolean;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    label?: string;
  }) => {
    if (!isVisible) {
      return null;
    }
    return (
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        data-column-id={columnId}
        data-drop-index={index}
        className={`flex items-center justify-center rounded-xl border border-dashed border-charcoal-300 bg-charcoal-50/40 text-xs text-charcoal-500 transition ${
          isActive ? 'border-accent-500 bg-accent-50/80 text-accent-700 shadow-inner shadow-accent-200/40' : ''
        }`}
        style={{ minHeight: 48 }}
      >
        <span>{label ?? 'Release to drop'}</span>
      </div>
    );
  };

  const DraggableWorkspacePanel = ({
    panelId,
    columnId,
    index,
    isDragging,
    onDragStart,
    onDragEnd,
    children,
  }: {
    panelId: WorkspacePanelId;
    columnId: WorkspaceColumnId;
    index: number;
    isDragging: boolean;
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd: (event: React.DragEvent<HTMLDivElement>) => void;
    children: ReactNode;
  }) => (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-panel-id={panelId}
      data-column-id={columnId}
      data-index={index}
      className={`cursor-move transition ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      {children}
    </div>
  );

  const WorkspaceColumn = ({
    columnId,
    panelIds,
    isHydrating,
  }: {
    columnId: WorkspaceColumnId;
    panelIds: WorkspacePanelId[];
    isHydrating: boolean;
  }) => (
    <div className="flex flex-col gap-4">
      <WorkspaceDropZone
        columnId={columnId}
        index={0}
        isActive={dropTarget?.columnId === columnId && dropTarget.index === 0}
        isVisible={Boolean(draggedPanel) || isHydrating || panelIds.length === 0}
        onDragOver={handleZoneDragOver(columnId, 0)}
        onDrop={handleZoneDrop(columnId, 0)}
        onDragLeave={handleZoneDragLeave(columnId, 0)}
        label={panelIds.length === 0 ? 'Drop panels here' : undefined}
      />
      {panelIds.map((panelId, index) => (
        <Fragment key={`${columnId}-${panelId}`}>
          <DraggableWorkspacePanel
            panelId={panelId}
            columnId={columnId}
            index={index}
            onDragStart={handleDragStartPanel(panelId)}
            onDragEnd={handleDragEndPanel}
            isDragging={draggedPanel === panelId}
          >
            {renderPanel(panelId)}
          </DraggableWorkspacePanel>
          <WorkspaceDropZone
            columnId={columnId}
            index={index + 1}
            isActive={dropTarget?.columnId === columnId && dropTarget.index === index + 1}
            isVisible={Boolean(draggedPanel) || isHydrating}
            onDragOver={handleZoneDragOver(columnId, index + 1)}
            onDrop={handleZoneDrop(columnId, index + 1)}
            onDragLeave={handleZoneDragLeave(columnId, index + 1)}
          />
        </Fragment>
      ))}
    </div>
  );
  return (
    <CollapsibleSection
      title="Narration Studio"
      className="rounded-3xl border border-charcoal-200/70 bg-cream-100 px-6 py-8 shadow-[0_30px_70px_-45px_rgba(98,75,63,0.8)]"
      allowResize={false}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">Narration Studio</p>
          <h2 className="text-2xl font-semibold text-charcoal-900">Transcribe, clean, and narrate in one workspace</h2>
          <p className="text-sm text-charcoal-600">
            Capture live audio or uploads, polish transcripts with cleanup presets, and generate narration without switching contexts.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-charcoal-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 hover:bg-charcoal-100/70"
          onClick={handleReset}
        >
          Reset workspace
        </button>
      </header>

      {layoutError && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-start justify-between gap-2">
            <span>{layoutError}</span>
            <button
              type="button"
              className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
              onClick={() => setLayoutError(undefined)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {layoutIsSaving && (
        <p className="mt-3 text-xs text-charcoal-500">Saving layout…</p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <WorkspaceColumn columnId="full" panelIds={fullWidthPanels} isHydrating={layoutIsHydrating} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <WorkspaceColumn columnId="left" panelIds={leftColumnPanels} isHydrating={layoutIsHydrating} />
        <WorkspaceColumn columnId="center" panelIds={centerColumnPanels} isHydrating={layoutIsHydrating} />
        <WorkspaceColumn columnId="right" panelIds={rightColumnPanels} isHydrating={layoutIsHydrating} />
      </div>

      {!hasResults && (
        <div className="mt-6 rounded-2xl border border-charcoal-200/70 bg-white/70 p-6 text-sm text-charcoal-600 shadow-sm shadow-charcoal-200/60">
          <p>
            Start a recording or upload audio to populate the transcript. Cleanup instructions, summaries, action items, and calendar tools will activate automatically.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );

}
