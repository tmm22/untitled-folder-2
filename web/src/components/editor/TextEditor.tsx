'use client';

import { ChangeEvent } from 'react';
import { useTTSStore } from '@/modules/tts/store';

export function TextEditor() {
  const { inputText, characterLimit, isGenerating } = useTTSStore((state) => ({
    inputText: state.inputText,
    characterLimit: state.characterLimit,
    isGenerating: state.isGenerating,
  }));
  const setInputText = useTTSStore((state) => state.actions.setInputText);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(event.target.value);
  };

  const remaining = characterLimit - inputText.length;
  const limitReached = remaining < 0;

  return (
    <div className="flex h-full flex-col gap-2">
      <textarea
        className="h-full min-h-[280px] w-full resize-none rounded-lg border border-slate-700/40 bg-slate-950/60 p-4 text-base text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed"
        placeholder="Paste your script or type what you want to hear..."
        value={inputText}
        onChange={handleChange}
        disabled={isGenerating}
        spellCheck={false}
        maxLength={characterLimit * 2}
      />
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>Character limit per generation</span>
        <span className={limitReached ? 'text-rose-400' : ''}>
          {inputText.length.toLocaleString()} / {characterLimit.toLocaleString()} ({remaining.toLocaleString()} remaining)
        </span>
      </div>
    </div>
  );
}
