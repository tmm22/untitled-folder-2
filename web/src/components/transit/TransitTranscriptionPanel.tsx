'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
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
import { InteractivePanel, PANEL_DRAG_DATA_TYPE } from '@/components/shared/panels/InteractivePanel';
import { usePanelLayout, type PanelLayoutState } from '@/components/shared/panels/usePanelLayout';

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

type StudioColumnId = 'capture' | 'insights' | 'controls';

const PANEL_STORAGE_KEY = 'transit-studio-panels-v1';

const PANEL_ORDER = [
  'pipeline-status',
  'capture-audio',
  'upload-audio',
  'cleanup-controls',
  'import-tools',
  'snippets',
  'transcript-history',
  'transcript',
  'summary',
  'cleanup-result',
  'action-items',
  'schedule-recommendation',
  'calendar',
  'provider-selector',
  'text-editor',
  'translation-controls',
  'generate-button',
  'playback-controls',
  'batch-queue',
  'pronunciation',
  'narration-history',
  'translation-history',
  'credentials',
  'theme',
  'compact',
  'notifications',
] as const;

type StudioPanelId = (typeof PANEL_ORDER)[number];

const DEFAULT_PANEL_LAYOUT: PanelLayoutState = {
  columns: {
    capture: [
      'pipeline-status',
      'capture-audio',
      'upload-audio',
      'cleanup-controls',
      'import-tools',
      'snippets',
      'transcript-history',
    ],
    insights: [
      'transcript',
      'summary',
      'cleanup-result',
      'action-items',
      'schedule-recommendation',
      'calendar',
    ],
    controls: [
      'provider-selector',
      'text-editor',
      'translation-controls',
      'generate-button',
      'playback-controls',
      'batch-queue',
      'pronunciation',
      'narration-history',
      'translation-history',
      'credentials',
      'theme',
      'compact',
      'notifications',
    ],
  },
  collapsed: {},
  heights: {},
};

const COLUMN_CONFIG: Array<{ id: StudioColumnId; label: string; description: string }> = [
  {
    id: 'capture',
    label: 'Capture & presets',
    description: 'Recording controls, file uploads, cleanup instructions, and saved resources.',
  },
  {
    id: 'insights',
    label: 'Transcript insights',
    description: 'Live transcript, summarised insights, cleanup output, and calendar flows.',
  },
  {
    id: 'controls',
    label: 'Voice & automations',
    description: 'Voice selection, editor tools, batching, history, and notification settings.',
  },
];

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

interface PanelDefinition {
  id: StudioPanelId;
  column: StudioColumnId;
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  headerMode?: 'standard' | 'minimal';
  surfaceVariant?: 'default' | 'bare';
  allowResize?: boolean;
  allowCollapse?: boolean;
  headerAccessory?: ReactNode;
  render: () => ReactNode;
}

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

  const trimmedCleanupInstruction = cleanupInstruction.trim();
  const hasCleanupInstruction = trimmedCleanupInstruction.length > 0;

  useEffect(() => {
    setRecorderSupported(isMediaRecorderSupported());
  }, []);

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
    {
      id: 'transcript',
      column: 'insights',
      title: 'Transcript',
      description: 'Raw transcript segments stream in as audio is processed.',
      htmlId: 'transcript-view',
      bodyClassName: 'gap-4',
      render: () => (
        <>
          {record?.durationMs ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-charcoal-500">
              <span>Duration</span>
              <span className="font-medium text-charcoal-700">{formatMilliseconds(record.durationMs)}</span>
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto rounded-xl border border-charcoal-100/80 bg-cream-50/90 px-4 py-3 text-sm text-charcoal-800 shadow-inner">
            {transcriptText || record?.transcript ? (
              <p className="whitespace-pre-line">{record?.transcript ?? transcriptText}</p>
            ) : (
              <p className="text-charcoal-400">Segments will appear here once transcription starts.</p>
            )}
          </div>
          {segments.length > 0 ? (
            <ol className="space-y-3">
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
          ) : null}
        </>
      ),
    },
    {
      id: 'summary',
      column: 'insights',
      title: 'Summary',
      description: 'High-level overview generated after transcription completes.',
      bodyClassName: 'gap-3',
      render: () =>
        summary?.summary ? (
          <p className="text-sm text-charcoal-700">{summary.summary}</p>
        ) : (
          <p className="text-sm text-charcoal-400">Insights will appear here after transcription.</p>
        ),
    },
    {
      id: 'cleanup-result',
      column: 'insights',
      title: 'Cleanup result',
      description: 'Polished transcript produced by your cleanup instructions.',
      bodyClassName: 'gap-3',
      render: () => (
        <>
          {cleanupResult ? (
            <>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                  {cleanupResult.label ?? 'Custom instructions'}
                </span>
              </div>
              {!cleanupResult.label ? (
                <p className="text-xs text-charcoal-500">Instruction: {cleanupResult.instruction}</p>
              ) : null}
              <p className="whitespace-pre-line text-sm text-charcoal-700">{cleanupResult.output}</p>
            </>
          ) : hasCleanupInstruction ? (
            <p className="text-sm text-charcoal-400">
              {stage === 'cleaning' || isStreaming
                ? 'Applying cleanup instructions…'
                : 'Run a transcription to generate a polished version with the current instructions.'}
            </p>
          ) : (
            <p className="text-sm text-charcoal-400">
              Add instructions to generate a polished version alongside the raw transcript.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'action-items',
      column: 'insights',
      title: 'Action items',
      description: 'Summarised follow-up actions detected during cleanup.',
      bodyClassName: 'gap-3',
      render: () =>
        summary?.actionItems && summary.actionItems.length > 0 ? (
          <ul className="space-y-2">
            {summary.actionItems.map((item, index) => (
              <SummaryActionItem key={`${item.text}-${index}`} item={item} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal-400">No action items detected.</p>
        ),
    },
    {
      id: 'schedule-recommendation',
      column: 'insights',
      title: 'Suggested calendar event',
      description: 'Calendar follow-up generated from detected action items.',
      className: 'border-accent-500/40 bg-accent-50/80 shadow-sm shadow-accent-200/50',
      bodyClassName: 'gap-3',
      render: () =>
        summary?.scheduleRecommendation ? (
          <>
            <p className="text-sm text-accent-800">{summary.scheduleRecommendation.title}</p>
            {(summary.scheduleRecommendation.startWindow ||
              summary.scheduleRecommendation.durationMinutes ||
              (summary.scheduleRecommendation.participants?.length ?? 0) > 0) && (
              <ul className="space-y-1 text-xs text-accent-700">
                {summary.scheduleRecommendation.startWindow ? (
                  <li>Window: {summary.scheduleRecommendation.startWindow}</li>
                ) : null}
                {summary.scheduleRecommendation.durationMinutes ? (
                  <li>Duration: {summary.scheduleRecommendation.durationMinutes} minutes</li>
                ) : null}
                {summary.scheduleRecommendation.participants &&
                summary.scheduleRecommendation.participants.length > 0 ? (
                  <li>Participants: {summary.scheduleRecommendation.participants.join(', ')}</li>
                ) : null}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-charcoal-400">
            Run a transcription to generate scheduling suggestions from detected action items.
          </p>
        ),
    },
    {
      id: 'calendar',
      column: 'insights',
      title: 'Calendar follow-up',
      description: 'Schedule Google Calendar events using the generated transcript context.',
      htmlId: 'calendar',
      bodyClassName: 'gap-3',
      render: () => (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                calendarConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-charcoal-100 text-charcoal-600'
              }`}
            >
              {calendarConnected ? 'Google calendar connected' : 'Not connected'}
            </span>
            <button
              type="button"
              onClick={handleConnectCalendar}
              className="rounded-full border border-accent-500 px-4 py-1.5 text-xs font-medium text-accent-600 transition hover:bg-accent-50 disabled:cursor-not-allowed disabled:border-charcoal-300 disabled:text-charcoal-400"
              disabled={isConnectingCalendar}
            >
              {isConnectingCalendar ? 'Opening…' : calendarConnected ? 'Reconnect' : 'Connect Google Calendar'}
            </button>
          </div>
          <p className="text-xs text-charcoal-500">
            Enter attendees manually. Only the organiser is pre-filled from your signed-in account. Events use your
            configured Google Calendar timezone.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleCalendarSubmit}>
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
                placeholder="alex@example.com&#10;dispatch.lead@example.com"
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
          {calendarConnectionError ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {calendarConnectionError}
            </p>
          ) : null}
          {calendarFormError ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {calendarFormError}
            </p>
          ) : null}
          {calendarInfoMessage && calendarStatus !== 'success' ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {calendarInfoMessage}
            </p>
          ) : null}
          {calendarStatus === 'success' ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Event scheduled in Google Calendar.
            </p>
          ) : null}
        </>
      ),
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

  const { state: panelState, actions: panelActions } = usePanelLayout({
    storageKey: PANEL_STORAGE_KEY,
    defaultState: DEFAULT_PANEL_LAYOUT,
    panelOrder: Array.from(PANEL_ORDER),
  });
  const { movePanel, toggleCollapse, setPanelHeight, resetLayout } = panelActions;

  const [draggingPanelId, setDraggingPanelId] = useState<StudioPanelId | null>(null);
  const [dragTarget, setDragTarget] = useState<{ columnId: StudioColumnId; index: number } | null>(null);

  const handlePanelDragStart = useCallback((panelId: StudioPanelId) => {
    setDraggingPanelId(panelId);
  }, []);

  const handlePanelDragEnd = useCallback(() => {
    setDraggingPanelId(null);
    setDragTarget(null);
  }, []);

  const handlePanelDragOver = useCallback(
    (columnId: StudioColumnId, index: number, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragTarget((current) => {
        if (current && current.columnId === columnId && current.index === index) {
          return current;
        }
        return { columnId, index };
      });
    },
    [],
  );

  const handlePanelDrop = useCallback(
    (columnId: StudioColumnId, index: number, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const raw =
        event.dataTransfer.getData(PANEL_DRAG_DATA_TYPE) || event.dataTransfer.getData('text/plain');
      if (!raw || !PANEL_ORDER.includes(raw as StudioPanelId)) {
        setDragTarget(null);
        setDraggingPanelId(null);
        return;
      }
      movePanel(raw as StudioPanelId, columnId, index);
      setDragTarget(null);
      setDraggingPanelId(null);
    },
    [movePanel],
  );

  const handleReset = useCallback(() => {
    actions.reset();
    resetLayout();
    resetInteraction();
    setCalendarStatus('idle');
    setCalendarFormError(null);
    setCalendarInfoMessage(null);
    setCalendarTitle('');
    setCalendarParticipants('');
    setCalendarNotes('');
    setCalendarDuration('');
    setCalendarWindow('');
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

  const panelDefinitions: PanelDefinition[] = [
    {
      id: 'pipeline-status',
      column: 'capture',
      title: 'Pipeline status',
      description: 'Monitor upload, transcription, cleanup, and narration progress.',
      bodyClassName: 'gap-3',
      render: () => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-charcoal-500">Stage</p>
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
          {aggregatedError ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{aggregatedError}</p>
          ) : null}
        </>
      ),
    },
    {
      id: 'capture-audio',
      column: 'capture',
      title: 'Capture audio',
      description: 'Record from your microphone and stream transcripts instantly.',
      htmlId: 'capture',
      headerAccessory: isRecording ? (
        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
          Recording…
        </span>
      ) : undefined,
      bodyClassName: 'gap-4',
      render: () =>
        isRecorderSupported ? (
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
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="rounded-full border border-charcoal-300 px-3 py-2 text-sm font-medium text-charcoal-600 hover:bg-charcoal-100/70"
                >
                  Cancel
                </button>
              ) : null}
            </div>
            <p className="text-xs text-charcoal-500">
              {isRecording
                ? 'Recording… stop when you are ready to transcribe.'
                : 'Allow microphone access to capture live communications.'}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Microphone recording is not supported in this browser. Use the upload option instead.
          </p>
        ),
    },
    {
      id: 'upload-audio',
      column: 'capture',
      title: 'Upload audio file',
      description: 'MP3, WAV, or M4A up to 25 MB.',
      bodyClassName: 'gap-3',
      render: () => (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-fit rounded-full border border-dashed border-charcoal-300 px-4 py-2 text-sm font-medium text-charcoal-700 transition hover:border-accent-500 hover:text-accent-600"
          >
            Choose file…
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFilePick} />
          <p className="text-xs text-charcoal-500">
            Uploaded audio follows the same pipeline as live recordings and streams transcripts in real time.
          </p>
        </>
      ),
    },
    {
      id: 'cleanup-controls',
      column: 'capture',
      title: 'Cleanup instructions',
      description: 'Preset or custom cleanup instructions polish the transcript automatically.',
      htmlId: 'cleanup-controls',
      bodyClassName: 'gap-4',
      render: () => (
        <>
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
        </>
      ),
    },
    {
      id: 'import-tools',
      column: 'capture',
      title: 'Imports',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <ImportPanel />,
    },
    {
      id: 'snippets',
      column: 'capture',
      title: 'Snippet library',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <SnippetPanel />,
    },
    {
      id: 'transcript-history',
      column: 'capture',
      title: 'Transcript history',
      description: 'Reload past runs, download text, or clear individual records.',
      htmlId: 'transcript-history',
      bodyClassName: 'gap-3',
      render: () => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
              onClick={() => void handleHistoryClear()}
              disabled={historyClearing || sortedHistoryRecords.length === 0}
            >
              Clear
            </button>
            {historyStatus ? <p className="text-xs text-charcoal-500">{historyStatus}</p> : null}
          </div>
          {!historyHydrated ? (
            <p className="text-sm text-charcoal-500">Loading transcript history…</p>
          ) : historyError ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{historyError}</p>
          ) : sortedHistoryRecords.length === 0 ? (
            <p className="text-sm text-charcoal-500">Transcribe audio to start building your history.</p>
          ) : (
            <div className="space-y-4">
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
                  {historyRecord.cleanup ? (
                    <p className="mt-1 text-xs text-charcoal-500">
                      Cleanup: {historyRecord.cleanup.label ?? 'Custom instructions'}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-charcoal-500">
                    <span className="capitalize text-charcoal-700">{historyRecord.source}</span>
                    <span className="text-charcoal-700">Duration: {formatMilliseconds(historyRecord.durationMs)}</span>
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
                      className="rounded-full bg-charcoal-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cream-50 transition hover:bg-charcoal-800"
                      onClick={() => handleHistoryLoad(historyRecord)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-charcoal-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 transition hover:bg-charcoal-100/70"
                      onClick={() => handleHistoryDownload(historyRecord)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
                      onClick={() => void handleHistoryRemove(historyRecord.id)}
                      disabled={historyPendingId === historyRecord.id}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'provider-selector',
      column: 'controls',
      title: 'Voice provider',
      description: 'Select providers and voices used for synthesis.',
      htmlId: 'tts-controls',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <ProviderSelector />,
    },
    {
      id: 'text-editor',
      column: 'controls',
      title: 'Narration editor',
      description: 'Edit text before generating speech or translations.',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <TextEditor />,
    },
    {
      id: 'translation-controls',
      column: 'controls',
      title: 'Translation controls',
      description: 'Generate multilingual variants alongside narration.',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <TranslationControls />,
    },
    {
      id: 'generate-button',
      column: 'controls',
      title: 'Generate narration',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <GenerateButton />,
    },
    {
      id: 'playback-controls',
      column: 'controls',
      title: 'Playback controls',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <PlaybackControls />,
    },
    {
      id: 'batch-queue',
      column: 'controls',
      title: 'Batch queue',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <BatchPanel />,
    },
    {
      id: 'pronunciation',
      column: 'controls',
      title: 'Pronunciation settings',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <PronunciationPanel />,
    },
    {
      id: 'narration-history',
      column: 'controls',
      title: 'Narration history',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <HistoryPanel />,
    },
    {
      id: 'translation-history',
      column: 'controls',
      title: 'Translation history',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <TranslationHistoryPanel />,
    },
    {
      id: 'credentials',
      column: 'controls',
      title: 'Provider credentials',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <CredentialsPanel />,
    },
    {
      id: 'theme',
      column: 'controls',
      title: 'Workspace theme',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <ThemePanel />,
    },
    {
      id: 'compact',
      column: 'controls',
      title: 'Compact mode',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <CompactPanel />,
    },
    {
      id: 'notifications',
      column: 'controls',
      title: 'Notifications',
      headerMode: 'minimal',
      surfaceVariant: 'bare',
      allowResize: true,
      render: () => <NotificationPanel />,
    },
  ];

  const definitionById = new Map<StudioPanelId, PanelDefinition>();
  for (const definition of panelDefinitions) {
    definitionById.set(definition.id, definition);
  }

  const renderDropZone = useCallback(
    (columnId: StudioColumnId, index: number) => {
      const isActive = dragTarget?.columnId === columnId && dragTarget.index === index;
      const classes = [
        'rounded-full border-2 border-dashed border-transparent transition-all duration-150',
        draggingPanelId
          ? 'pointer-events-auto my-2 h-8 opacity-80 bg-cream-200/60'
          : 'pointer-events-none h-2 opacity-0',
        isActive ? 'border-accent-400 bg-accent-200/60 opacity-100' : '',
      ];
      return (
        <div
          key={`${columnId}-drop-${index}`}
          className={classes.filter(Boolean).join(' ')}
          onDragEnter={(event) => handlePanelDragOver(columnId, index, event)}
          onDragOver={(event) => handlePanelDragOver(columnId, index, event)}
          onDrop={(event) => handlePanelDrop(columnId, index, event)}
        />
      );
    },
    [dragTarget, draggingPanelId, handlePanelDragOver, handlePanelDrop],
  );

  const handleLayoutReset = useCallback(() => {
    resetLayout();
  }, [resetLayout]);

  return (
    <section className="rounded-3xl border border-charcoal-200/70 bg-cream-100 px-6 py-8 shadow-[0_30px_70px_-45px_rgba(98,75,63,0.8)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">Narration Studio</p>
          <h2 className="text-2xl font-semibold text-charcoal-900">Transcribe, clean, and narrate in one workspace</h2>
          <p className="text-sm text-charcoal-600">
            Capture live audio or uploads, polish transcripts with cleanup presets, and generate narration without switching contexts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-charcoal-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 transition hover:bg-charcoal-100/70"
            onClick={handleReset}
          >
            Reset workspace
          </button>
          <button
            type="button"
            className="rounded-full border border-accent-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent-600 transition hover:bg-accent-50"
            onClick={handleLayoutReset}
          >
            Reset layout
          </button>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-10 xl:flex-row xl:items-start">
        {COLUMN_CONFIG.map((column) => {
          const panelIds = panelState.columns[column.id] ?? [];
          return (
            <section key={column.id} className="flex min-w-0 flex-1 flex-col gap-4">
              <header className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-charcoal-500">
                <span className="font-semibold text-charcoal-700">{column.label}</span>
                <span className="text-[11px] font-normal normal-case tracking-normal text-charcoal-400">
                  {column.description}
                </span>
              </header>
              <div className="flex flex-col gap-4">
                {panelIds.length === 0 ? (
                  <>
                    {renderDropZone(column.id, 0)}
                    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-charcoal-300 bg-white/60 p-6 text-center text-sm text-charcoal-500">
                      <p>No panels pinned here yet.</p>
                      <p className="text-xs text-charcoal-400">
                        Drag any panel from another column to customise your layout.
                      </p>
                    </div>
                    {renderDropZone(column.id, 1)}
                  </>
                ) : (
                  <>
                    {panelIds.map((panelId, index) => {
                      const definition = definitionById.get(panelId);
                      if (!definition) {
                        return null;
                      }
                      return (
                        <Fragment key={panelId}>
                          {renderDropZone(column.id, index)}
                          <InteractivePanel
                            id={panelId}
                            htmlId={definition.htmlId}
                            title={definition.title}
                            description={definition.description}
                            className={definition.className}
                            bodyClassName={definition.bodyClassName}
                            headerMode={definition.headerMode}
                            surfaceVariant={definition.surfaceVariant}
                            collapsed={Boolean(panelState.collapsed?.[panelId])}
                            height={panelState.heights?.[panelId]}
                            allowResize={definition.allowResize ?? true}
                            allowCollapse={definition.allowCollapse ?? true}
                            headerAccessory={definition.headerAccessory}
                            onToggleCollapse={() => toggleCollapse(panelId)}
                            onResize={(next) => setPanelHeight(panelId, next)}
                            onDragStart={(panelIdentifier) =>
                              handlePanelDragStart(panelIdentifier as StudioPanelId)
                            }
                            onDragEnd={handlePanelDragEnd}
                            isDragging={draggingPanelId === panelId}
                          >
                            {definition.render()}
                          </InteractivePanel>
                        </Fragment>
                      );
                    })}
                    {renderDropZone(column.id, panelIds.length)}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {!hasResults ? (
        <div className="mt-6 rounded-2xl border border-charcoal-200/70 bg-white/70 p-6 text-sm text-charcoal-600 shadow-sm shadow-charcoal-200/60">
          <p>
            Start a recording or upload audio to populate the transcript. Cleanup instructions, summaries, action items, and calendar tools will activate automatically.
          </p>
        </div>
      ) : null}
    </section>
  );
}
