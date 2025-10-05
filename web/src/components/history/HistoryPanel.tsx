'use client';

import { useEffect, useState } from 'react';
import { useHistoryStore } from '@/modules/history/store';
import { useTTSStore } from '@/modules/tts/store';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString();
};

export function HistoryPanel() {
  const { entries, hydrated } = useHistoryStore((state) => ({
    entries: state.entries,
    hydrated: state.hydrated,
  }));
  const { hydrate, remove } = useHistoryStore((state) => state.actions);
  const { setInputText, selectProvider, selectVoice } = useTTSStore((state) => state.actions);
  const [status, setStatus] = useState<string | undefined>(undefined);

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

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading history…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Recent generations</h2>
      <p className="text-sm text-slate-400">Entries persist locally and include provider, voice, and raw text.</p>
      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="text-sm text-slate-500">Generate something to populate history.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span className="font-medium capitalize">{entry.provider}</span>
              <span className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-400">{entry.text || 'No text stored.'}</p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Voice: {entry.voiceId || 'default'}</span>
              <span>Duration: {Math.round(entry.durationMs / 1000)}s</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white"
                onClick={() => void handleLoad(entry)}
              >
                Load in editor
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
        ))}
      </div>
      {status && <p className="mt-3 text-sm text-slate-300">{status}</p>}
    </section>
  );
}
