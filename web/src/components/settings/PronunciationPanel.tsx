'use client';

import { FormEvent, useEffect, useState } from 'react';
import { usePronunciationStore } from '@/modules/pronunciation/store';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import type { PronunciationRule, ProviderType } from '@/modules/tts/types';
import { generateId } from '@/lib/utils/id';

const providerOptions = [{ id: 'all', displayName: 'All providers' as const }, ...providerRegistry.all()];

type ProviderSelection = ProviderType | 'all';

export function PronunciationPanel() {
  const { rules, hydrated } = usePronunciationStore((state) => ({
    rules: state.rules,
    hydrated: state.hydrated,
  }));
  const { hydrate, addRule, deleteRule } = usePronunciationStore((state) => state.actions);

  const [provider, setProvider] = useState<ProviderSelection>('all');
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!search.trim()) {
      setStatus('Provide a phrase or pattern to replace.');
      return;
    }

    const rule: PronunciationRule = {
      id: generateId('rule'),
      provider: provider === 'all' ? 'all' : provider,
      search: search.trim(),
      replace: replace.trim(),
      isRegex,
    };

    await addRule(rule);
    setSearch('');
    setReplace('');
    setIsRegex(false);
    setStatus('Rule added.');
  };

  if (!hydrated) {
    return (
      <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300">
        Loading pronunciation rules…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-4">
      <h2 className="text-lg font-semibold text-white">Pronunciation glossary</h2>
      <p className="text-sm text-slate-400">Rules run before requests are sent to providers.</p>
      <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Provider scope
          <select
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={provider}
            onChange={(event) => setProvider(event.target.value as ProviderSelection)}
          >
            {providerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id === 'all' ? 'All providers' : option.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Find
          <input
            type="text"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. OpenAI"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Replace with
          <input
            type="text"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            value={replace}
            onChange={(event) => setReplace(event.target.value)}
            placeholder="e.g. oh-pen-eye"
          />
        </label>
        <label className="mt-6 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isRegex}
            onChange={(event) => setIsRegex(event.target.checked)}
          />
          Treat as regular expression
        </label>
        <button
          type="submit"
          className="col-span-full inline-flex w-max items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Add rule
        </button>
      </form>

      <div className="mt-4 space-y-3">
        {rules.length === 0 && <p className="text-sm text-slate-500">No rules defined yet.</p>}
        {rules.map((rule) => (
          <div key={rule.id} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span className="font-medium">
                {rule.provider === 'all' ? 'All providers' : providerRegistry.get(rule.provider).displayName}
              </span>
              <span className="text-xs text-slate-500">{rule.isRegex ? 'Regex' : 'Literal'}</span>
            </div>
            <div className="text-xs text-slate-400">
              {rule.isRegex ? 'Pattern' : 'Phrase'}: <code className="text-sky-300">{rule.search}</code>
            </div>
            <div className="text-xs text-slate-400">Replace with: {rule.replace || '—'}</div>
            <button
              type="button"
              className="w-max rounded-md border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
              onClick={() => void deleteRule(rule.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
    </section>
  );
}
