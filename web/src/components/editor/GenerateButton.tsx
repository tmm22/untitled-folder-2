'use client';

import { useState } from 'react';
import { useTTSStore } from '@/modules/tts/store';

export function GenerateButton() {
  const { isGenerating, inputText, errorMessage, characterLimit } = useTTSStore((state) => ({
    isGenerating: state.isGenerating,
    inputText: state.inputText,
    errorMessage: state.errorMessage,
    characterLimit: state.characterLimit,
  }));
  const { generate, clearError } = useTTSStore((state) => state.actions);
  const [hasAttempted, setHasAttempted] = useState(false);

  const exceedsLimit = inputText.trim().length > characterLimit;
  const disabled = isGenerating || inputText.trim().length === 0 || exceedsLimit;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        disabled={disabled}
        onClick={async () => {
          setHasAttempted(true);
          await generate();
        }}
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            Generating…
          </span>
        ) : (
          'Generate speech'
        )}
      </button>
      {(errorMessage && hasAttempted) || exceedsLimit ? (
        <div className="rounded-md border border-rose-500/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          <div className="flex items-start justify-between gap-2">
            <span>{exceedsLimit ? 'Text exceeds provider character limit.' : errorMessage}</span>
            <button
              type="button"
              className="text-xs uppercase tracking-wide text-rose-300"
              onClick={() => {
                clearError();
                setHasAttempted(false);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
