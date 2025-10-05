'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSnippetStore } from '@/modules/snippets/store';
import { useTTSStore } from '@/modules/tts/store';
import type { TextSnippet } from '@/modules/tts/types';
import { generateId } from '@/lib/utils/id';

export function SnippetPanel() {
  const snippets = useSnippetStore((state) => state.snippets);
  const hydrated = useSnippetStore((state) => state.hydrated);
  const { hydrate, saveSnippet, deleteSnippet } = useSnippetStore((state) => state.actions);
  const inputText = useTTSStore((state) => state.inputText);
  const { setInputText } = useTTSStore((state) => state.actions);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!inputText.trim()) {
      setStatus('Enter some text before saving a snippet.');
      return;
    }
    if (!name.trim()) {
      setStatus('Provide a name for this snippet.');
      return;
    }

    const snippet: TextSnippet = {
      id: generateId('snippet'),
      name: name.trim(),
      content: inputText.trim(),
      createdAt: new Date().toISOString(),
    };
    await saveSnippet(snippet);
    setName('');
    setStatus('Snippet saved.');
  };

  const applySnippet = (snippet: TextSnippet, mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setInputText(snippet.content);
    } else {
      setInputText((prev) => {
        const merged = [prev.trim(), snippet.content.trim()].filter(Boolean).join('\n\n');
        return merged.trim();
      });
    }
    setStatus(`Snippet ${mode === 'replace' ? 'loaded' : 'appended'}.`);
  };

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading snippets…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Snippet library</h2>
      <p className="text-sm text-slate-400">Store reusable intros, outros, and prompts.</p>
      <form className="mt-3 flex flex-col gap-3" onSubmit={handleSave}>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Name
          <input
            type="text"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Podcast intro"
            required
          />
        </label>
        <button
          type="submit"
          className="inline-flex w-max items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Save current text
        </button>
      </form>

      <div className="mt-4 space-y-3">
        {snippets.length === 0 && <p className="text-sm text-slate-500">No snippets yet.</p>}
        {snippets.map((snippet) => (
          <div key={snippet.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{snippet.name}</h3>
              <span className="text-xs text-slate-500">{new Date(snippet.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-400">{snippet.content}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white"
                onClick={() => applySnippet(snippet, 'replace')}
              >
                Replace editor
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200"
                onClick={() => applySnippet(snippet, 'append')}
              >
                Append
              </button>
              <button
                type="button"
                className="rounded-md border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
                onClick={() => void deleteSnippet(snippet.id)}
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
