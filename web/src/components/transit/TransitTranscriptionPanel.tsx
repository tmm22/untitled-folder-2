'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { createAudioRecorder, isMediaRecorderSupported, type RecorderHandle } from '@/lib/audio/mediaRecorder';
import { useTransitTranscriptionStore } from '@/modules/transitTranscription/store';
import { useAccountStore } from '@/modules/account/store';
import type { TransitSummaryAction } from '@/modules/transitTranscription/types';

const stageLabels: Record<string, string> = {
  idle: 'Ready',
  uploading: 'Uploading audio…',
  received: 'Audio received',
  transcribing: 'Transcribing with OpenAI…',
  summarising: 'Generating insights…',
  persisting: 'Saving transcript…',
  complete: 'Complete',
  error: 'Error',
};

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

export function TransitTranscriptionPanel() {
  const {
    stage,
    segments,
    summary,
    record,
    error,
    isStreaming,
    progress,
    transcriptText,
    title,
    actions,
  } = useTransitTranscriptionStore((state) => ({
    stage: state.stage,
    segments: state.segments,
    summary: state.summary,
    record: state.record,
    error: state.error,
    isStreaming: state.isStreaming,
    progress: state.progress,
    transcriptText: state.transcriptText,
    title: state.title,
    actions: state.actions,
  }));

  const [isRecorderSupported, setRecorderSupported] = useState<boolean>(isMediaRecorderSupported());
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

  useEffect(() => {
    setRecorderSupported(isMediaRecorderSupported());
  }, []);

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

    setCalendarTitle((prev) => (prev || summary.scheduleRecommendation?.title || ''));
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

  const statusLabel = useMemo(() => stageLabels[stage] ?? stage, [stage]);

  const hasResults = Boolean(record || summary || segments.length > 0);
  const calendarFormDisabled = !calendarConnected;

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
  }, [actions, resetInteraction]);

  return (
    <section className="rounded-3xl border border-charcoal-200/70 bg-cream-100 px-6 py-8 shadow-[0_30px_70px_-45px_rgba(98,75,63,0.8)]">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">Transit</p>
        <h2 className="text-2xl font-semibold text-charcoal-900">Transit transcription workspace</h2>
        <p className="text-sm text-charcoal-600">
          Capture live dispatch audio or upload recordings, transcribe with OpenAI, and review action items with calendar-ready summaries.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50">
          <h3 className="text-sm font-semibold text-charcoal-900">Record with microphone</h3>
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
            <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Microphone recording is not supported in this browser. Use the upload option instead.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/50">
          <h3 className="text-sm font-semibold text-charcoal-900">Upload audio file</h3>
          <p className="text-xs text-charcoal-500">MP3, WAV, or M4A up to 25 MB.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-fit rounded-full border border-dashed border-charcoal-300 px-4 py-2 text-sm font-medium text-charcoal-700 hover:border-accent-500 hover:text-accent-600"
          >
            Choose file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFilePick}
          />
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-charcoal-200/70 bg-white/70 p-4 shadow-sm shadow-charcoal-200/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent-500">Status</p>
            <p className="text-sm font-medium text-charcoal-900">{statusLabel}</p>
          </div>
          <div className="flex w-40 items-center gap-2">
            <div className="relative h-2 flex-1 rounded-full bg-charcoal-200/60">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent-500 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs text-charcoal-500">{Math.round(progress * 100)}%</span>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {hasResults && (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60">
            <h3 className="text-sm font-semibold text-charcoal-900">Transcript</h3>
            <p className="mt-1 text-xs text-charcoal-500">
              {record?.durationMs ? `Duration: ${formatMilliseconds(record.durationMs)}` : null}
            </p>
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
                  <li key={segment.index} className="rounded-lg border border-charcoal-100/80 bg-white px-3 py-2 text-sm text-charcoal-800 shadow-sm">
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
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60">
              <h3 className="text-sm font-semibold text-charcoal-900">Summary</h3>
              {summary?.summary ? (
                <p className="mt-2 text-sm text-charcoal-700">{summary.summary}</p>
              ) : (
                <p className="mt-2 text-sm text-charcoal-400">Insights will appear here after transcription.</p>
              )}
            </div>
            <div className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60">
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
            </div>
            {summary?.scheduleRecommendation && (
              <div className="rounded-2xl border border-accent-500/40 bg-accent-50/80 p-4 shadow-sm shadow-accent-200/50">
                <h3 className="text-sm font-semibold text-accent-800">Suggested calendar event</h3>
                <p className="mt-2 text-sm text-accent-800">{summary.scheduleRecommendation.title}</p>
                {(summary.scheduleRecommendation.startWindow ||
                  summary.scheduleRecommendation.durationMinutes ||
                  (summary.scheduleRecommendation.participants?.length ?? 0) > 0) && (
                  <ul className="mt-2 space-y-1 text-xs text-accent-700">
                    {summary.scheduleRecommendation.startWindow && (
                      <li>Window: {summary.scheduleRecommendation.startWindow}</li>
                    )}
                    {summary.scheduleRecommendation.durationMinutes && (
                      <li>Duration: {summary.scheduleRecommendation.durationMinutes} minutes</li>
                    )}
                    {summary.scheduleRecommendation.participants &&
                      summary.scheduleRecommendation.participants.length > 0 && (
                        <li>Participants: {summary.scheduleRecommendation.participants.join(', ')}</li>
                      )}
                  </ul>
                )}
              </div>
            )}
            <div className="rounded-2xl border border-charcoal-200/70 bg-white/80 p-4 shadow-sm shadow-charcoal-200/60">
              <h3 className="text-sm font-semibold text-charcoal-900">Calendar follow-up</h3>
              <div className="mt-2 flex flex-wrap items-center gap-3">
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
              <p className="mt-2 text-xs text-charcoal-500">
                Enter attendees manually. Only the organiser is pre-filled from your signed-in account. Events use your configured
                Google Calendar timezone.
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
              {calendarConnectionError && (
                <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {calendarConnectionError}
                </p>
              )}
              {calendarFormError && (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {calendarFormError}
                </p>
              )}
              {calendarStatus === 'success' && (
                <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Event scheduled in Google Calendar.
                </p>
              )}
              {calendarInfoMessage && calendarStatus !== 'success' && (
                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {calendarInfoMessage}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-full border border-charcoal-300 px-4 py-2 text-sm font-medium text-charcoal-600 hover:bg-charcoal-100/70"
          disabled={isStreaming}
        >
          Reset
        </button>
        {record && (
          <p className="text-xs text-charcoal-500">Saved at {new Date(record.createdAt).toLocaleString()}</p>
        )}
      </footer>
    </section>
  );
}
