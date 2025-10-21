'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { usePronunciationStore } from '@/modules/pronunciation/store';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import type { PronunciationRule, ProviderType } from '@/modules/tts/types';
import { generateId } from '@/lib/utils/id';

const providerOptions = [{ id: 'all', displayName: 'All providers' as const }, ...providerRegistry.all()];

type ProviderSelection = ProviderType | 'all';

export function PronunciationPanel() {
  const rules = usePronunciationStore((state) => state.rules);
  const hydrated = usePronunciationStore((state) => state.hydrated);
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
      <CollapsibleSection title="Pronunciation glossary" className="text-sm text-cocoa-600" minHeight={280} maxHeight={880}>
        Loading pronunciation rules…
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Pronunciation glossary" minHeight={280} maxHeight={880}>
      <h2 className="panel-title">Pronunciation glossary</h2>
      <p className="panel-subtitle">Rules run before requests are sent to providers.</p>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2">
          <span className="field-label">Provider scope</span>
          <select
            className="field-input"
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
        <label className="flex flex-col gap-2">
          <span className="field-label">Find</span>
          <input
            type="text"
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. OpenAI"
            required
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="field-label">Replace with</span>
          <input
            type="text"
            className="field-input"
            value={replace}
            onChange={(event) => setReplace(event.target.value)}
            placeholder="e.g. oh-pen-eye"
          />
        </label>
        <label className="mt-6 flex items-center gap-2 text-sm text-cocoa-700">
          <input
            type="checkbox"
            className="accent-charcoal-900"
            checked={isRegex}
            onChange={(event) => setIsRegex(event.target.checked)}
          />
          Treat as regular expression
        </label>
        <button
          type="submit"
          className="col-span-full cta-button md:w-max"
        >
          Add rule
        </button>
      </form>

      <div className="mt-4 space-y-3">
        {rules.length === 0 && <p className="text-sm text-cocoa-500">No rules defined yet.</p>}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex flex-col gap-2 rounded-2xl border border-cream-300 bg-cream-50/80 p-4 shadow-inner"
          >
            <div className="flex items-center justify-between text-sm text-cocoa-700">
              <span className="font-medium">
                {rule.provider === 'all' ? 'All providers' : providerRegistry.get(rule.provider).displayName}
              </span>
              <span className="text-xs text-cocoa-500">{rule.isRegex ? 'Regex' : 'Literal'}</span>
            </div>
            <div className="text-xs text-cocoa-600">
              {rule.isRegex ? 'Pattern' : 'Phrase'}: <code className="text-charcoal-900">{rule.search}</code>
            </div>
            <div className="text-xs text-cocoa-600">Replace with: {rule.replace || '—'}</div>
            <button
              type="button"
              className="w-max pill-button border-rose-300 text-rose-700 hover:bg-rose-100"
              onClick={() => void deleteRule(rule.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {status && <p className="mt-4 text-sm text-cocoa-600">{status}</p>}
    </CollapsibleSection>
  );
}
