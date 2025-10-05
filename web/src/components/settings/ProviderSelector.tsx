'use client';

import { useEffect, useRef } from 'react';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { useTTSStore } from '@/modules/tts/store';

const providerOptions = providerRegistry.all();

export function ProviderSelector() {
  const { selectedProvider, availableVoices, selectedVoice, isGenerating } = useTTSStore((state) => ({
    selectedProvider: state.selectedProvider,
    availableVoices: state.availableVoices,
    selectedVoice: state.selectedVoice,
    isGenerating: state.isGenerating,
  }));

  const selectProvider = useTTSStore((state) => state.actions.selectProvider);
  const selectVoice = useTTSStore((state) => state.actions.selectVoice);
  const loadVoices = useTTSStore((state) => state.actions.loadVoices);

  const hasRequestedVoicesRef = useRef(false);

  useEffect(() => {
    hasRequestedVoicesRef.current = false;
  }, [selectedProvider]);

  useEffect(() => {
    if (availableVoices.length > 0) {
      return;
    }

    if (hasRequestedVoicesRef.current) {
      return;
    }

    hasRequestedVoicesRef.current = true;
    void loadVoices(selectedProvider).finally(() => {
      hasRequestedVoicesRef.current = false;
    });
  }, [availableVoices.length, loadVoices, selectedProvider]);

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-300">Provider</span>
        <select
          className="w-full rounded-md border border-slate-700/50 bg-slate-900/80 px-3 py-2 text-slate-100 shadow focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed"
          value={selectedProvider}
          onChange={(event) => {
            void selectProvider(event.target.value as typeof selectedProvider);
          }}
          disabled={isGenerating}
        >
          {providerOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">{providerRegistry.get(selectedProvider).description}</span>
      </label>

      <label className="flex flex-col gap-2 md:col-span-2">
        <span className="text-sm font-medium text-slate-300">Voice</span>
        <select
          className="w-full rounded-md border border-slate-700/50 bg-slate-900/80 px-3 py-2 text-slate-100 shadow focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed"
          value={selectedVoice?.id ?? ''}
          onChange={(event) => selectVoice(event.target.value)}
          disabled={availableVoices.length === 0 || isGenerating}
        >
          {availableVoices.length === 0 && <option value="">Loading voices…</option>}
          {availableVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} · {voice.language}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
