'use client';

import { ChangeEvent } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useTTSStore } from '@/modules/tts/store';

const numberFormatter = new Intl.NumberFormat('en-US');

export function TextEditor() {
  const inputText = useTTSStore((state) => state.inputText);
  const characterLimit = useTTSStore((state) => state.characterLimit);
  const isGenerating = useTTSStore((state) => state.isGenerating);
  const setInputText = useTTSStore((state) => state.actions.setInputText);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(event.target.value);
  };

  const remaining = characterLimit - inputText.length;
  const limitReached = remaining < 0;

  return (
    <CollapsibleSection title="Script editor" className="flex h-full flex-col gap-4" minHeight={320} maxHeight={960}>
      <textarea
        className="field-input min-h-[280px] resize-none border-cream-400 bg-cream-50/90 p-4 text-base leading-relaxed"
        placeholder="Paste your script or type what you want to hear..."
        value={inputText}
        onChange={handleChange}
        disabled={isGenerating}
        spellCheck={false}
        maxLength={characterLimit * 2}
      />
      <div className="flex items-center justify-between text-sm text-cocoa-500">
        <span>Character limit per generation</span>
        <span className={limitReached ? 'text-rose-600' : 'text-cocoa-700'}>
          {numberFormatter.format(inputText.length)} / {numberFormatter.format(characterLimit)} ({numberFormatter.format(remaining)} remaining)
        </span>
      </div>
    </CollapsibleSection>
  );
}
