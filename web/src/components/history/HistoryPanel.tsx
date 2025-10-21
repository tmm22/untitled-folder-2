'use client';

import { useEffect, useMemo, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { extensionFromContentType } from '@/lib/utils/audio';
import { triggerDownloadFromUrl, triggerDownloadText } from '@/lib/utils/download';
import { buildSrt, buildVtt } from '@/lib/transcript/export';
import { useHistoryStore } from '@/modules/history/store';
import { useTTSStore } from '@/modules/tts/store';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';

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
    if (!audio || !audio.audioUrl) {
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
      <CollapsibleSection title="Recent generations" className="text-sm text-cocoa-600">
        Loading history…
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Recent generations" minHeight={300} maxHeight={900}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="panel-title">Recent generations</h2>
          <p className="panel-subtitle">Entries persist locally and include provider, voice, and raw text.</p>
        </div>
        <button
          type="button"
          className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100 disabled:opacity-40"
          onClick={() => void handleClearHistory()}
          disabled={entries.length === 0 || clearing}
        >
          Clear history
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="text-sm text-cocoa-500">Generate something to populate history.</p>}
        {entries.map((entry) => {
          const audio = audioLookup.get(entry.id);
          return (
            <div
              key={entry.id}
              className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50/80 p-4 shadow-inner"
            >
              <div className="flex flex-wrap items-center justify-between text-sm text-cocoa-700">
                <span className="font-semibold capitalize text-cocoa-900">{entry.provider}</span>
                <FormattedTimestamp value={entry.createdAt} className="text-xs text-cocoa-500" />
              </div>
              <p className="line-clamp-2 text-sm text-cocoa-600">{entry.text || 'No text stored.'}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-cocoa-500">
                <span>Voice: {entry.voiceId || 'default'}</span>
                <span>Duration: {Math.round(entry.durationMs / 1000)}s</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="action-button action-button--accent px-3 py-1"
                  onClick={() => void handleLoad(entry)}
                >
                  Load in editor
                </button>
                <button
                  type="button"
                  className="pill-button border-charcoal-300 text-cocoa-700 disabled:opacity-40"
                  onClick={() => handleDownloadAudio(entry.id)}
                  disabled={!audio || !audio.audioUrl}
                >
                  Download audio
                </button>
                <button
                  type="button"
                  className="pill-button border-charcoal-300 text-cocoa-700"
                  onClick={() => handleDownloadSrt(entry)}
                >
                  Export SRT
                </button>
                <button
                  type="button"
                  className="pill-button border-charcoal-300 text-cocoa-700"
                  onClick={() => handleDownloadVtt(entry)}
                >
                  Export VTT
                </button>
                <button
                  type="button"
                  className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
                  onClick={() => void remove(entry.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {status && <p className="mt-3 text-sm text-cocoa-600">{status}</p>}
    </CollapsibleSection>
  );
}
