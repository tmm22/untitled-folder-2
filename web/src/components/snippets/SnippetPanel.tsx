'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSnippetStore } from '@/modules/snippets/store';
import { useTTSStore } from '@/modules/tts/store';
import type { TextSnippet } from '@/modules/tts/types';
import { generateId } from '@/lib/utils/id';
import { FormattedTimestamp } from '@/components/shared/FormattedTimestamp';

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
      const current = useTTSStore.getState().inputText;
      const merged = [current.trim(), snippet.content.trim()].filter(Boolean).join('\n\n');
      setInputText(merged.trim());
    }
    setStatus(`Snippet ${mode === 'replace' ? 'loaded' : 'appended'}.`);
  };

  if (!hydrated) {
    return (
      <section className="panel text-sm text-cocoa-600">
        Loading snippets…
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Snippet library</h2>
      <p className="panel-subtitle">Store reusable intros, outros, and prompts.</p>
      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSave}>
        <label className="flex flex-col gap-2">
          <span className="field-label">Name</span>
          <input
            type="text"
            className="field-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Podcast intro"
            required
          />
        </label>
        <button type="submit" className="cta-button md:w-max">
          Save current text
        </button>
      </form>

      <div className="mt-4 space-y-3">
        {snippets.length === 0 && <p className="text-sm text-cocoa-500">No snippets yet.</p>}
        {snippets.map((snippet) => (
          <div key={snippet.id} className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50/80 p-4 shadow-inner">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cocoa-900">{snippet.name}</h3>
              <FormattedTimestamp
                value={snippet.createdAt}
                options={{ year: 'numeric', month: 'short', day: 'numeric' }}
                className="text-xs text-cocoa-500"
              />
            </div>
            <p className="line-clamp-2 text-sm text-cocoa-600">{snippet.content}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="action-button action-button--accent px-3 py-1"
                onClick={() => applySnippet(snippet, 'replace')}
              >
                Replace editor
              </button>
              <button
                type="button"
                className="pill-button border-charcoal-300 text-cocoa-700"
                onClick={() => applySnippet(snippet, 'append')}
              >
                Append
              </button>
              <button
                type="button"
                className="pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
                onClick={() => void deleteSnippet(snippet.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-cocoa-600">{status}</p>}
    </section>
  );
}
