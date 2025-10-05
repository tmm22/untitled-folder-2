'use client';

import { useEffect, useMemo, useState } from 'react';
import { extensionFromContentType } from '@/lib/utils/audio';
import { triggerDownloadFromUrl, triggerDownloadText } from '@/lib/utils/download';
import { buildSrt, buildVtt } from '@/lib/transcript/export';
import { useHistoryStore } from '@/modules/history/store';
import { useTTSStore } from '@/modules/tts/store';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString();
};

export function HistoryPanel() {
  const entries = useHistoryStore((state) => state.entries);
  const hydrated = useHistoryStore((state) => state.hydrated);
  const { hydrate, remove, clear } = useHistoryStore((state) => state.actions);
  const { setInputText, selectProvider, selectVoice } = useTTSStore((state) => state.actions);
  const recentGenerations = useTTSStore((state) => state.recentGenerations);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [clearing, setClearing] = useState(false);

  const audioLookup = useMemo(() => new Map(recentGenerations.map((item) => [item.metadata.id, item])), [recentGenerations]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleLoad = async (entry: (typeof entries)[number]) => {
    try {
      setStatus('Loading entry…');
      await selectProvider(entry.provider);
      setInputText(entry.text);
      if (entry.voiceId) {
        selectVoice(entry.voiceId);
      }
      setStatus('Entry loaded into the editor.');
    } catch (error) {
      console.error('Failed to load history entry', error);
      setStatus('Unable to load entry.');
    }
  };

  const handleDownloadAudio = (entryId: string) => {
    const audio = audioLookup.get(entryId);
    if (!audio) {
      setStatus('Audio is only available for items generated this session.');
      return;
    }
    const ext = extensionFromContentType(audio.audioContentType);
    triggerDownloadFromUrl(audio.audioUrl, `tts-${entryId}.${ext}`);
    setStatus('Audio download started.');
  };

  const handleDownloadSrt = (entry: (typeof entries)[number]) => {
    const srt = entry.transcript?.srt ?? buildSrt(entry.text, entry.durationMs);
    triggerDownloadText(srt, `tts-${entry.id}.srt`);
    setStatus('Transcript (SRT) ready.');
  };

  const handleDownloadVtt = (entry: (typeof entries)[number]) => {
    const existing = entry.transcript?.vtt ?? entry.transcript?.srt;
    const vtt = existing ?? buildVtt(entry.text, entry.durationMs);
    triggerDownloadText(vtt, `tts-${entry.id}.vtt`, 'text/vtt;charset=utf-8');
    setStatus('Transcript (VTT) ready.');
  };

  const handleClearHistory = async () => {
    if (clearing) {
      return;
    }
    if (entries.length === 0) {
      setStatus('History is already empty.');
      return;
    }

    try {
      setClearing(true);
      await clear();
      setStatus('History cleared.');
    } catch (error) {
      console.error('Failed to clear history', error);
      setStatus('Unable to clear history.');
    } finally {
      setClearing(false);
    }
  };

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading history…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent generations</h2>
          <p className="text-sm text-slate-400">Entries persist locally and include provider, voice, and raw text.</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-rose-500/60 px-3 py-1 text-xs font-semibold text-rose-300 disabled:opacity-40"
          onClick={() => void handleClearHistory()}
          disabled={entries.length === 0 || clearing}
        >
          Clear history
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="text-sm text-slate-500">Generate something to populate history.</p>}
        {entries.map((entry) => {
          const audio = audioLookup.get(entry.id);
          return (
            <div key={entry.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between text-sm text-slate-300">
                <span className="font-medium capitalize">{entry.provider}</span>
                <span className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-400">{entry.text || 'No text stored.'}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Voice: {entry.voiceId || 'default'}</span>
                <span>Duration: {Math.round(entry.durationMs / 1000)}s</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white"
                  onClick={() => void handleLoad(entry)}
                >
                  Load in editor
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 disabled:opacity-40"
                  onClick={() => handleDownloadAudio(entry.id)}
                  disabled={!audio}
                >
                  Download audio
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200"
                  onClick={() => handleDownloadSrt(entry)}
                >
                  Export SRT
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200"
                  onClick={() => handleDownloadVtt(entry)}
                >
                  Export VTT
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
                  onClick={() => void remove(entry.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {status && <p className="mt-3 text-sm text-slate-300">{status}</p>}
    </section>
  );
}
