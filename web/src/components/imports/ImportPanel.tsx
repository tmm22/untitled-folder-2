'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useImportStore } from '@/modules/imports/store';
import { importFromUrl, buildImportedEntry } from '@/modules/imports/service';
import { useTTSStore } from '@/modules/tts/store';
import { generateId } from '@/lib/utils/id';

export function ImportPanel() {
  const { entries, hydrated } = useImportStore((state) => ({
    entries: state.entries,
    hydrated: state.hydrated,
  }));
  const { hydrate, record, remove } = useImportStore((state) => state.actions);
  const { setInputText } = useTTSStore((state) => state.actions);

  const [url, setUrl] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();

    if (!url.trim() && !manualContent.trim()) {
      setStatus('Provide a URL or paste content to import.');
      return;
    }

    if (url.trim()) {
      setStatus('Fetching content…');
      const response = await importFromUrl(url.trim());
      if (response.error) {
        setStatus(`Import failed: ${response.error}`);
        return;
      }

      const entry = buildImportedEntry({
        id: generateId('import'),
        source: url.trim(),
        title: response.title,
        content: response.content ?? '',
        summary: response.summary,
      });
      await record(entry);
      setStatus('Import saved.');
    } else {
      const entry = buildImportedEntry({
        id: generateId('import'),
        source: 'Manual entry',
        title: 'Manual content',
        content: manualContent.trim(),
      });
      await record(entry);
      setStatus('Manual content saved.');
    }

    setUrl('');
    setManualContent('');
  };

  const handleUseEntry = (content: string) => {
    setInputText(content);
    setStatus('Imported content loaded into editor.');
  };

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading imports…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Imports</h2>
      <p className="text-sm text-slate-400">Fetch web content or stash manual notes for later narration.</p>
      <form className="mt-3 flex flex-col gap-3" onSubmit={handleImport}>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          URL
          <input
            type="url"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="https://example.com/article"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Or paste content
          <textarea
            className="min-h-[120px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={manualContent}
            onChange={(event) => setManualContent(event.target.value)}
            placeholder="Paste cleaned-up content here…"
          />
        </label>
        <button
          type="submit"
          className="inline-flex w-max items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Save import
        </button>
        <p className="text-xs text-slate-500">Reddit links are handled via the .json API; article summaries use OpenAI when configured.</p>
      </form>

      <div className="mt-4 space-y-3">
        {entries.length === 0 && <p className="text-sm text-slate-500">No imports captured yet.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span className="font-medium truncate" title={entry.source}>
                {entry.title || entry.source}
              </span>
              <span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
            {entry.summary && <p className="text-xs text-slate-400">Summary: {entry.summary}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
                onClick={() => handleUseEntry(entry.content)}
              >
                Load into editor
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

      {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
    </section>
  );
}
