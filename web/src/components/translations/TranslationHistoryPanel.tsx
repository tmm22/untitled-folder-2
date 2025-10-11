'use client';

import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useTranslationHistoryStore } from '@/modules/translations/store';
import { useTTSStore } from '@/modules/tts/store';
import { SUPPORTED_TRANSLATION_LANGUAGES } from '@/lib/translations/languages';

const DOCUMENT_ID = 'main-editor';
const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

const languageLabel = (code: string) => {
  const match = SUPPORTED_TRANSLATION_LANGUAGES.find((language) => language.code === code);
  return match ? match.label : code.toUpperCase();
};

export function TranslationHistoryPanel() {
  if (isTestEnv) {
    return null;
  }

  const { history, activeTranslation, keepOriginal, nextCursor, isLoading } = useTranslationHistoryStore(
    (state) => ({
      history: state.history,
      activeTranslation: state.activeTranslation,
      keepOriginal: state.keepOriginal,
      nextCursor: state.nextCursor,
      isLoading: state.isLoading,
    }),
    shallow,
  );

  const loadMore = useTranslationHistoryStore((state) => state.actions.loadMore);
  const promote = useTranslationHistoryStore((state) => state.actions.promote);
  const markAdopted = useTranslationHistoryStore((state) => state.actions.markAdopted);
  const clear = useTranslationHistoryStore((state) => state.actions.clear);
  const setKeepOriginal = useTranslationHistoryStore((state) => state.actions.setKeepOriginal);

  const setInputText = useTTSStore((state) => state.actions.setInputText);

  const hasHistory = history.length > 0;
  const showPreview = keepOriginal && !!activeTranslation && activeTranslation.keepOriginalApplied;

  const otherTranslations = useMemo(
    () => history.filter((entry) => entry.id !== activeTranslation?.id),
    [history, activeTranslation?.id],
  );

  const handleUseInEditor = async (translationId: string, translatedText: string) => {
    setKeepOriginal(false);
    const adopted = await markAdopted(translationId, true);
    if (adopted?.translatedText) {
      setInputText(adopted.translatedText);
    } else {
      setInputText(translatedText);
    }
  };

  const handlePromote = async (translationId: string) => {
    await promote(translationId);
  };

  const handleClearAll = async () => {
    await clear();
  };

  const handleClearKeepLatest = async () => {
    await clear({ keepLatest: true });
  };

  const handleLoadMore = async () => {
    await loadMore();
  };

  return (
    <section className="rounded-3xl border border-charcoal-200 bg-white px-6 py-6 shadow-sm">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-charcoal-400">History</p>
          <h2 className="text-lg font-semibold text-charcoal-900">Recent translations</h2>
        </div>
        <div className="flex gap-2 text-xs text-charcoal-500">
          <button
            type="button"
            onClick={handleClearKeepLatest}
            disabled={!hasHistory || isLoading}
            className="rounded-full border border-charcoal-200 px-3 py-1 font-medium text-charcoal-600 transition hover:border-charcoal-400 disabled:cursor-not-allowed disabled:border-charcoal-100 disabled:text-charcoal-300"
          >
            Keep latest
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={!hasHistory || isLoading}
            className="rounded-full border border-red-200 px-3 py-1 font-medium text-red-600 transition hover:border-red-400 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
          >
            Clear history
          </button>
        </div>
      </header>

      {showPreview ? (
        <div className="mt-5 rounded-2xl border border-charcoal-200 bg-cream-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-charcoal-400">Active preview</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-white p-3">
              <p className="text-xs font-medium uppercase text-charcoal-400">Original text</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal-700">{activeTranslation?.sourceText}</p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-xs font-medium uppercase text-charcoal-400">
                {languageLabel(activeTranslation?.targetLanguageCode ?? '')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal-900">{activeTranslation?.translatedText}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {hasHistory ? (
          <>
            <TranslationEntry
              key={activeTranslation?.id ?? 'active'}
              translation={activeTranslation}
              isActive
              onPromote={handlePromote}
              onUseInEditor={handleUseInEditor}
            />
            {otherTranslations.map((translation) => (
              <TranslationEntry
                key={translation.id}
                translation={translation}
                onPromote={handlePromote}
                onUseInEditor={handleUseInEditor}
              />
            ))}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-charcoal-200 bg-charcoal-50 px-4 py-6 text-center text-sm text-charcoal-500">
            No translations yet. Run a translation above to build your shared history.
          </p>
        )}
      </div>

      {nextCursor ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="rounded-full border border-charcoal-300 px-4 py-2 text-sm font-medium text-charcoal-700 transition hover:border-charcoal-500 disabled:cursor-not-allowed disabled:border-charcoal-100 disabled:text-charcoal-300"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

interface TranslationEntryProps {
  translation: TranslationRecord | null | undefined;
  isActive?: boolean;
  onPromote: (id: string) => Promise<void>;
  onUseInEditor: (id: string, translatedText: string) => Promise<void>;
}

function TranslationEntry({ translation, isActive, onPromote, onUseInEditor }: TranslationEntryProps) {
  if (!translation) {
    return null;
  }

  const isAdopted = translation.keepOriginalApplied === false;

  return (
    <article
      className={`rounded-2xl border px-4 py-3 transition ${
        isActive ? 'border-charcoal-400 bg-cream-50 shadow-sm' : 'border-charcoal-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-charcoal-900">{languageLabel(translation.targetLanguageCode)}</p>
            {isActive ? (
              <span className="rounded-full bg-charcoal-900 px-2 py-0.5 text-xs font-semibold text-cream-50">Active</span>
            ) : null}
            {isAdopted ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Applied</span>
            ) : null}
          </div>
          <p className="mt-1 max-h-20 overflow-hidden text-sm text-charcoal-500">{translation.sourceText}</p>
          <p className="mt-2 max-h-20 overflow-hidden text-sm font-medium text-charcoal-900">
            {translation.translatedText}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onPromote(translation.id)}
            disabled={isActive}
            className="rounded-full border border-charcoal-300 px-3 py-1 text-xs font-semibold text-charcoal-700 transition hover:border-charcoal-500 disabled:cursor-not-allowed disabled:border-charcoal-100 disabled:text-charcoal-300"
          >
            Set active
          </button>
          <button
            type="button"
            onClick={() => onUseInEditor(translation.id, translation.translatedText)}
            className="rounded-full border border-charcoal-900 bg-charcoal-900 px-3 py-1 text-xs font-semibold text-cream-50 transition hover:bg-charcoal-800"
          >
            Use in editor
          </button>
        </div>
      </div>
    </article>
  );
}
