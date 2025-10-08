'use client';

import { useCallback, useEffect, useRef } from 'react';
import { providerRegistry } from '@/modules/tts/providerRegistry';
import { getProviderDescription } from '@/modules/tts/getProviderDescription';
import { useTTSStore } from '@/modules/tts/store';
import type { ProviderType } from '@/modules/tts/types';

const providerOptions = providerRegistry.all();

export function ProviderSelector() {
  const selectedProvider = useTTSStore((state) => state.selectedProvider);
  const availableVoices = useTTSStore((state) => state.availableVoices);
  const selectedVoice = useTTSStore((state) => state.selectedVoice);
  const isGenerating = useTTSStore((state) => state.isGenerating);
  const isLoadingVoices = useTTSStore((state) => state.isLoadingVoices);
  const voiceLoadError = useTTSStore((state) => state.voiceLoadError);

  const selectProvider = useTTSStore((state) => state.actions.selectProvider);
  const selectVoice = useTTSStore((state) => state.actions.selectVoice);
  const loadVoices = useTTSStore((state) => state.actions.loadVoices);

  const lastRequestedProviderRef = useRef<ProviderType | null>(null);
  const hasRequestedProviderRef = useRef(false);

  const requestVoices = useCallback(
    (provider: ProviderType) => {
      hasRequestedProviderRef.current = true;
      lastRequestedProviderRef.current = provider;
      return loadVoices(provider);
    },
    [loadVoices],
  );

  useEffect(() => {
    if (isLoadingVoices) {
      hasRequestedProviderRef.current = true;
      lastRequestedProviderRef.current = selectedProvider;
    }
  }, [isLoadingVoices, selectedProvider]);

  useEffect(() => {
    if (availableVoices.length > 0 || isLoadingVoices || voiceLoadError) {
      return;
    }

    if (hasRequestedProviderRef.current && lastRequestedProviderRef.current === selectedProvider) {
      return;
    }

    void requestVoices(selectedProvider);
  }, [availableVoices.length, isLoadingVoices, requestVoices, selectedProvider, voiceLoadError]);

  const voiceSelectDisabled = availableVoices.length === 0 || isGenerating || isLoadingVoices;
  const providerDescription = getProviderDescription(selectedProvider, {
    selectedVoice,
    fallbackVoices: availableVoices,
  });

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
        <span className="text-xs text-slate-500">{providerDescription}</span>
      </label>

      <label className="flex flex-col gap-2 md:col-span-2">
        <span className="text-sm font-medium text-slate-300">Voice</span>
        <select
          className="w-full rounded-md border border-slate-700/50 bg-slate-900/80 px-3 py-2 text-slate-100 shadow focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed"
          value={selectedVoice?.id ?? ''}
          onChange={(event) => selectVoice(event.target.value)}
          disabled={voiceSelectDisabled}
        >
          {isLoadingVoices && <option value="">Loading voices…</option>}
          {voiceLoadError && <option value="">Unable to load voices</option>}
          {availableVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} · {voice.language}
            </option>
          ))}
        </select>
      </label>
      {voiceLoadError ? (
        <div className="md:col-span-3 flex flex-col gap-2 rounded-md border border-rose-500/50 bg-rose-950/40 p-3 text-sm text-rose-200">
          <span>{voiceLoadError}</span>
          <div>
            <button
              type="button"
              className="rounded-md border border-rose-400 px-3 py-1 text-xs font-semibold text-rose-100"
              onClick={() => {
                void requestVoices(selectedProvider);
              }}
              disabled={isLoadingVoices}
            >
              Retry fetching voices
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
