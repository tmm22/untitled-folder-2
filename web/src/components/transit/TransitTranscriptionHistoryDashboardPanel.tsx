'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTransitTranscriptionHistoryStore } from '@/modules/transitTranscription/historyStore';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';
import { triggerDownloadText } from '@/lib/utils/download';

const MAX_ITEMS = 5;

export function TransitTranscriptionHistoryDashboardPanel() {
  const records = useTransitTranscriptionHistoryStore((state) => state.records);
  const hydrated = useTransitTranscriptionHistoryStore((state) => state.hydrated);
  const error = useTransitTranscriptionHistoryStore((state) => state.error);
  const { hydrate, clear } = useTransitTranscriptionHistoryStore((state) => state.actions);
  const [status, setStatus] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      void hydrate();
    }
  }, [hydrate, hydrated]);

  const latestRecords = useMemo(() => records.slice(0, MAX_ITEMS), [records]);

  const handleDownload = (recordId: string) => {
    const target = records.find((record) => record.id === recordId);
    if (!target) {
      setStatus('Transcript not found.');
      return;
    }
    triggerDownloadText(target.transcript, `transit-transcript-${recordId}.txt`, 'text/plain;charset=utf-8');
    setStatus('Transcript download started.');
  };

  const handleClear = async () => {
    if (clearing) {
      return;
    }
    if (records.length === 0) {
      setStatus('History is already empty.');
      return;
    }
    try {
      setClearing(true);
      await clear();
      setStatus('Transcript history cleared.');
    } catch (clearError) {
      console.error('Failed to clear transit transcript history', clearError);
      setStatus('Unable to clear transcript history.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-charcoal-200/70 bg-white/80 px-6 py-6 shadow-sm shadow-charcoal-200/60">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent-600">Transit</p>
          <h2 className="mt-2 text-lg font-semibold text-charcoal-900">Recent transit transcriptions</h2>
          <p className="mt-1 text-xs text-charcoal-500">
            Saved sessions from the Transit workspace, synced with COMBEX when you&apos;re signed in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleClear()}
          className="rounded-full border border-rose-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          disabled={clearing || records.length === 0}
        >
          Clear all
        </button>
      </header>

      {!hydrated && (
        <p className="text-sm text-charcoal-600">Loading transcript history…</p>
      )}

      {hydrated && error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {hydrated && !error && (
        <>
          {latestRecords.length === 0 ? (
            <p className="text-sm text-charcoal-500">
              Once you transcribe audio in the Transit workspace, entries will appear here for quick access.
            </p>
          ) : (
            <ul className="space-y-4">
              {latestRecords.map((record) => (
                <li
                  key={record.id}
                  className="rounded-xl border border-charcoal-200/70 bg-cream-50/80 p-4 shadow-inner shadow-charcoal-200/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-charcoal-900">
                      {record.title || 'Untitled transcript'}
                    </h3>
                    <FormattedTimestamp value={record.createdAt} className="text-xs text-charcoal-500" />
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-charcoal-600">
                    {record.summary?.summary ?? record.transcript}
                  </p>
                  <dl className="mt-3 flex flex-wrap items-center gap-3 text-xs text-charcoal-500">
                    <div>
                      <dt className="uppercase tracking-[0.25em] text-charcoal-400">Source</dt>
                      <dd className="capitalize text-charcoal-700">{record.source}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.25em] text-charcoal-400">Duration</dt>
                      <dd className="text-charcoal-700">{Math.round(record.durationMs / 1000)}s</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.25em] text-charcoal-400">Segments</dt>
                      <dd className="text-charcoal-700">{record.segments.length}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href="/transit"
                      className="rounded-full bg-charcoal-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-cream-50 hover:bg-charcoal-800"
                    >
                      Open workspace
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDownload(record.id)}
                      className="rounded-full border border-charcoal-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-charcoal-700 hover:bg-charcoal-100"
                    >
                      Download text
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {status && <p className="text-sm text-charcoal-600">{status}</p>}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-charcoal-500">
        <span>
          Showing {latestRecords.length} of {records.length} saved transcript{records.length === 1 ? '' : 's'}.
        </span>
        <Link href="/transit" className="text-accent-600 hover:text-accent-700">
          View all transcripts in workspace →
        </Link>
      </footer>
    </section>
  );
}
