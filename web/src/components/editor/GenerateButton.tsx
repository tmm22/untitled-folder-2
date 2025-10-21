'use client';

import { useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useTTSStore } from '@/modules/tts/store';

export function GenerateButton() {
  const isGenerating = useTTSStore((state) => state.isGenerating);
  const inputText = useTTSStore((state) => state.inputText);
  const errorMessage = useTTSStore((state) => state.errorMessage);
  const characterLimit = useTTSStore((state) => state.characterLimit);
  const { generate, clearError } = useTTSStore((state) => state.actions);
  const [hasAttempted, setHasAttempted] = useState(false);

  const exceedsLimit = inputText.trim().length > characterLimit;
  const disabled = isGenerating || inputText.trim().length === 0 || exceedsLimit;

  return (
    <CollapsibleSection title="Generate speech" className="flex flex-col gap-4" minHeight={200} maxHeight={560}>
      <button
        type="button"
        className="cta-button"
        disabled={disabled}
        onClick={async () => {
          setHasAttempted(true);
          await generate();
        }}
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream-200/60 border-t-transparent" />
            Generating…
          </span>
        ) : (
          'Generate speech'
        )}
      </button>
      {(errorMessage && hasAttempted) || exceedsLimit ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-inner">
          <div className="flex items-start justify-between gap-2">
            <span>{exceedsLimit ? 'Text exceeds provider character limit.' : errorMessage}</span>
            <button
              type="button"
              className="pill-button border-transparent bg-transparent px-0 text-xs uppercase tracking-[0.2em] text-rose-700 hover:bg-rose-100"
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
    </CollapsibleSection>
  );
}
