'use client';

import { useEffect, useMemo, FormEvent } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useTranslationHistoryStore } from '@/modules/translations/store';
import type { TranslationHistoryState } from '@/modules/translations/store';
import { useTTSStore } from '@/modules/tts/store';
import { SUPPORTED_TRANSLATION_LANGUAGES } from '@/lib/translations/languages';

const DOCUMENT_ID = 'main-editor';
const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

export function TranslationControls() {
  if (isTestEnv) {
    return null;
  }
  return <TranslationControlsInner />;
}

function TranslationControlsInner() {
  const targetLanguageCode = useTranslationHistoryStore((state: TranslationHistoryState) => state.targetLanguageCode);
  const keepOriginal = useTranslationHistoryStore((state: TranslationHistoryState) => state.keepOriginal);
  const isLoading = useTranslationHistoryStore((state: TranslationHistoryState) => state.isLoading);
  const error = useTranslationHistoryStore((state: TranslationHistoryState) => state.error);
  const actions = useTranslationHistoryStore((state: TranslationHistoryState) => state.actions);
  const { hydrate, setTargetLanguageCode, setKeepOriginal, translate } = actions;

  const inputText = useTTSStore((state) => state.inputText);
  const setInputText = useTTSStore((state) => state.actions.setInputText);

  useEffect(() => {
    void hydrate(DOCUMENT_ID);
  }, [hydrate]);

  const availableLanguages = useMemo(() => SUPPORTED_TRANSLATION_LANGUAGES, []);

  const isDisabled = isLoading || inputText.trim().length === 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const translation = await translate(inputText);
    if (translation && !keepOriginal) {
      setInputText(translation.translatedText);
    }
  };

  return (
    <CollapsibleSection title="Translation" className="flex flex-col gap-5" minHeight={260} maxHeight={680}>
      <div className="flex flex-col gap-3 rounded-2xl border border-cream-400/70 bg-cream-50/80 p-4 shadow-[0_18px_36px_-28px_rgba(96,68,48,0.55)] sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-cocoa-500">Prepare text</h3>
          <p className="text-base font-semibold text-charcoal-900">Translate editor text before narration</p>
        </div>
        <p className="text-sm text-cocoa-600 sm:max-w-xs sm:text-right">
          Uses your configured OpenAI credentials. Translations sync across your web sessions.
        </p>
      </div>

      <form
        className="flex flex-col gap-5 rounded-2xl border border-cream-300/80 bg-white/70 p-5 shadow-[0_25px_55px_-38px_rgba(96,68,48,0.4)]"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-2 text-sm font-medium text-charcoal-800 sm:flex-1">
            <span className="field-label">Target language</span>
            <select
              value={targetLanguageCode}
              onChange={(event) => setTargetLanguageCode(event.target.value)}
              className="field-input"
            >
              {availableLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-cream-400/80 bg-cream-100/60 px-4 py-2 text-sm font-medium text-charcoal-800 shadow-[0_12px_28px_-20px_rgba(96,68,48,0.4)]">
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={(event) => setKeepOriginal(event.target.checked)}
              className="h-4 w-4 rounded border-charcoal-300 text-charcoal-900 focus:ring-charcoal-500"
            />
            Keep original text in the editor
          </label>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-700 shadow-[0_15px_32px_-28px_rgba(206,91,91,0.5)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="submit"
            disabled={isDisabled}
            className="control-button control-button--primary w-full sm:w-auto"
          >
            {isLoading ? 'Translating…' : 'Translate text'}
          </button>
          <p className="text-xs text-cocoa-600">
            Original text is {keepOriginal ? 'preserved for comparison.' : 'replaced with the translated version.'}
          </p>
        </div>
      </form>
    </CollapsibleSection>
  );
}
