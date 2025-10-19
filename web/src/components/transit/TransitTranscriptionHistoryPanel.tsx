'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTransitTranscriptionHistoryStore } from '@/modules/transitTranscription/historyStore';
import { useTransitTranscriptionStore } from '@/modules/transitTranscription/store';
import { triggerDownloadText } from '@/lib/utils/download';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';
import type { TransitTranscriptionRecord } from '@/modules/transitTranscription/types';

const formatMilliseconds = (value: number): string => {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatConfidence = (value: number | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unknown';
  }
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
};

const formatSummaryPreview = (record: TransitTranscriptionRecord): string | null => {
  if (record.summary?.summary) {
    return record.summary.summary.length > 160
      ? `${record.summary.summary.slice(0, 157)}…`
      : record.summary.summary;
  }
  const excerpt = record.transcript.replace(/\s+/g, ' ').trim();
  if (excerpt.length === 0) {
    return null;
  }
  return excerpt.length > 160 ? `${excerpt.slice(0, 157)}…` : excerpt;
};

export function TransitTranscriptionHistoryPanel() {
  const records = useTransitTranscriptionHistoryStore((state) => state.records);
  const hydrated = useTransitTranscriptionHistoryStore((state) => state.hydrated);
  const historyError = useTransitTranscriptionHistoryStore((state) => state.error);
  const { hydrate, remove, clear } = useTransitTranscriptionHistoryStore((state) => state.actions);
  const loadFromHistory = useTransitTranscriptionStore((state) => state.actions.loadFromHistory);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [clearing, setClearing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const sortedRecords = useMemo(
    () =>
      [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [records],
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleLoad = (record: TransitTranscriptionRecord) => {
    loadFromHistory(record);
    setStatus('Transcript loaded into the workspace.');
  };

  const handleDownload = (record: TransitTranscriptionRecord) => {
    triggerDownloadText(record.transcript, `transit-transcript-${record.id}.txt`, 'text/plain;charset=utf-8');
    setStatus('Transcript download started.');
  };

  const handleClear = async () => {
    if (clearing) {
      return;
    }
    if (sortedRecords.length === 0) {
      setStatus('History is already empty.');
      return;
    }
    try {
      setClearing(true);
      await clear();
      setStatus('Transcript history cleared.');
    } catch (error) {
      console.error('Failed to clear transit transcript history', error);
      setStatus('Unable to clear transcript history.');
    } finally {
      setClearing(false);
    }
  };

  const handleRemove = async (recordId: string) => {
    if (removingId) {
      return;
    }
    try {
      setRemovingId(recordId);
      await remove(recordId);
      setStatus('Transcript removed from history.');
    } catch (error) {
      console.error('Failed to remove transit transcript record', error);
      setStatus('Unable to remove transcript.');
    } finally {
      setRemovingId(null);
    }
  };

  if (!hydrated) {
    return (
      <section className="rounded-3xl border border-charcoal-200/70 bg-white/80 px-6 py-5 text-sm text-charcoal-600 shadow-sm">
        Loading transcript history…
      </section>
    );
  }

  if (historyError) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-800 shadow-sm">
        {historyError}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-charcoal-200/70 bg-white/70 px-6 py-6 shadow-[0_25px_60px_-40px_rgba(33,28,25,0.8)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-charcoal-900">Transcript history</h2>
          <p className="text-sm text-charcoal-500">Access recent recordings and summaries saved to COMBEX.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-rose-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          onClick={() => void handleClear()}
          disabled={sortedRecords.length === 0 || clearing}
        >
          Clear history
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {sortedRecords.length === 0 && (
          <p className="text-sm text-charcoal-500">Transcribe audio to start building your history.</p>
        )}
        {sortedRecords.map((record) => (
          <article
            key={record.id}
            className="rounded-2xl border border-charcoal-200/70 bg-cream-50/80 p-4 shadow-inner shadow-charcoal-300/20"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-charcoal-900">{record.title || 'Untitled transcript'}</h3>
              <FormattedTimestamp value={record.createdAt} className="text-xs text-charcoal-500" />
            </header>
            <p className="mt-2 text-sm text-charcoal-600">
              {formatSummaryPreview(record) ?? 'Transcript content unavailable.'}
            </p>
            <dl className="mt-3 flex flex-wrap items-center gap-3 text-xs text-charcoal-500">
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-charcoal-400">Source</dt>
                <dd className="capitalize text-charcoal-700">{record.source}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-charcoal-400">Duration</dt>
                <dd className="text-charcoal-700">{formatMilliseconds(record.durationMs)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-charcoal-400">Language</dt>
                <dd className="text-charcoal-700">{record.language ?? 'Auto-detected'}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-charcoal-400">Confidence</dt>
                <dd className="text-charcoal-700">{formatConfidence(record.confidence)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-charcoal-400">Segments</dt>
                <dd className="text-charcoal-700">{record.segments.length}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full bg-charcoal-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-cream-50 hover:bg-charcoal-800"
                onClick={() => handleLoad(record)}
              >
                Load in workspace
              </button>
              <button
                type="button"
                className="rounded-full border border-charcoal-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 hover:bg-charcoal-100"
                onClick={() => handleDownload(record)}
              >
                Download text
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                onClick={() => void handleRemove(record.id)}
                disabled={removingId === record.id}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {status && <p className="mt-4 text-sm text-charcoal-600">{status}</p>}
    </section>
  );
}
