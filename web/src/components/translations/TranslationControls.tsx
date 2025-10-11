'use client';

import { useEffect, useMemo, FormEvent } from 'react';
import { shallow } from 'zustand/shallow';
import { useTranslationHistoryStore } from '@/modules/translations/store';
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
  const { targetLanguageCode, keepOriginal, isLoading, error } = useTranslationHistoryStore(
    (state) => ({
      targetLanguageCode: state.targetLanguageCode,
      keepOriginal: state.keepOriginal,
      isLoading: state.isLoading,
      error: state.error,
    }),
    shallow,
  );

  const hydrate = useTranslationHistoryStore((state) => state.actions.hydrate);
  const setTargetLanguageCode = useTranslationHistoryStore((state) => state.actions.setTargetLanguageCode);
  const setKeepOriginal = useTranslationHistoryStore((state) => state.actions.setKeepOriginal);
  const translate = useTranslationHistoryStore((state) => state.actions.translate);

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
    <section className="rounded-3xl border border-charcoal-200 bg-cream-50 px-6 py-6 shadow-sm">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-charcoal-400">Translation</p>
          <h2 className="text-lg font-semibold text-charcoal-900">Translate editor text before narration</h2>
        </div>
        <p className="mt-2 text-sm text-charcoal-500 sm:mt-0 sm:text-right">
          Uses your configured OpenAI credentials. Results sync across your web sessions.
        </p>
      </header>

      <form className="mt-5 flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-2 text-sm font-medium text-charcoal-700 sm:flex-1">
            Target language
            <select
              value={targetLanguageCode}
              onChange={(event) => setTargetLanguageCode(event.target.value)}
              className="w-full rounded-xl border border-charcoal-200 bg-white px-3 py-2 text-sm font-normal text-charcoal-900 shadow-inner focus:border-charcoal-500 focus:outline-none"
            >
              {availableLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal-700">
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
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex w-full items-center justify-center rounded-xl bg-charcoal-900 px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-charcoal-800 disabled:cursor-not-allowed disabled:bg-charcoal-300 sm:w-auto"
          >
            {isLoading ? 'Translating…' : 'Translate text'}
          </button>
          <p className="text-xs text-charcoal-500">
            Original text is {keepOriginal ? 'preserved for comparison.' : 'replaced with the translated version.'}
          </p>
        </div>
      </form>
    </section>
  );
}
