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
    <section className="panel grid grid-cols-1 gap-5 md:grid-cols-3">
      <label className="flex flex-col gap-2">
        <span className="field-label">Provider</span>
        <select
          className="field-input appearance-none"
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
        <span className="text-xs text-cocoa-500">{providerDescription}</span>
      </label>

      <label className="flex flex-col gap-2 md:col-span-2">
        <span className="field-label">Voice</span>
        <select
          className="field-input appearance-none"
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
        <div className="md:col-span-3 flex flex-col gap-2 rounded-2xl border border-rose-300 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-inner">
          <span>{voiceLoadError}</span>
          <div>
            <button
              type="button"
              className="pill-button border-rose-300 bg-rose-100 text-rose-700 hover:bg-rose-200 focus:ring-rose-200"
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
