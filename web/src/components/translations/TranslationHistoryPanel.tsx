'use client';

import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { useTranslationHistoryStore } from '@/modules/translations/store';
import type { TranslationHistoryState } from '@/modules/translations/store';
import type { TranslationRecord } from '@/lib/translations/types';
import { useTTSStore } from '@/modules/tts/store';
import { SUPPORTED_TRANSLATION_LANGUAGES } from '@/lib/translations/languages';

const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

const languageLabel = (code: string) => {
  const match = SUPPORTED_TRANSLATION_LANGUAGES.find((language) => language.code === code);
  return match ? match.label : code.toUpperCase();
};

export function TranslationHistoryPanel() {
  if (isTestEnv) {
    return null;
  }
  return <TranslationHistoryPanelInner />;
}

function TranslationHistoryPanelInner() {
  const history = useTranslationHistoryStore((state: TranslationHistoryState) => state.history);
  const activeTranslation = useTranslationHistoryStore((state: TranslationHistoryState) => state.activeTranslation);
  const keepOriginal = useTranslationHistoryStore((state: TranslationHistoryState) => state.keepOriginal);
  const nextCursor = useTranslationHistoryStore((state: TranslationHistoryState) => state.nextCursor);
  const isLoading = useTranslationHistoryStore((state: TranslationHistoryState) => state.isLoading);
  const actions = useTranslationHistoryStore((state: TranslationHistoryState) => state.actions);
  const { loadMore, promote, markAdopted, clear, setKeepOriginal } = actions;

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
    <CollapsibleSection title="Translation history" className="flex flex-col gap-5" minHeight={280} maxHeight={720}>
      <div className="flex flex-col gap-3 rounded-2xl border border-cream-400/70 bg-cream-50/80 p-4 shadow-[0_18px_36px_-28px_rgba(96,68,48,0.55)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-cocoa-500">Recent activity</h3>
          <p className="text-base font-semibold text-charcoal-900">Manage and reuse your translations</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={handleClearKeepLatest}
            disabled={!hasHistory || isLoading}
            className="control-button control-button--ghost px-4 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Keep latest
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={!hasHistory || isLoading}
            className="control-button border-rose-300 bg-rose-50/70 text-rose-700 hover:bg-rose-100"
          >
            Clear history
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="rounded-2xl border border-cream-300/80 bg-white/70 p-5 shadow-[0_25px_55px_-38px_rgba(96,68,48,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cocoa-500">Active preview</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-cream-300/80 bg-cream-50/80 p-3">
              <p className="text-xs font-medium uppercase text-cocoa-500">Original text</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal-700">{activeTranslation?.sourceText}</p>
            </div>
            <div className="rounded-xl border border-cream-300/80 bg-cream-50/80 p-3">
              <p className="text-xs font-medium uppercase text-cocoa-500">
                {languageLabel(activeTranslation?.targetLanguageCode ?? '')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal-900">{activeTranslation?.translatedText}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
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
          <p className="rounded-xl border border-dashed border-cream-400/70 bg-cream-100/60 px-4 py-6 text-center text-sm text-cocoa-600 shadow-[0_15px_32px_-28px_rgba(96,68,48,0.35)]">
            No translations yet. Run a translation above to build your shared history.
          </p>
        )}
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="control-button px-5 py-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </CollapsibleSection>
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
        isActive
          ? 'border-accent-400/70 bg-accent-50/80 shadow-[0_20px_40px_-30px_rgba(169,116,78,0.45)]'
          : 'border-cream-300/80 bg-white/80 shadow-[0_20px_45px_-32px_rgba(96,68,48,0.35)]'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-charcoal-900">{languageLabel(translation.targetLanguageCode)}</p>
            {isActive ? (
              <span className="rounded-full bg-charcoal-900 px-2 py-0.5 text-xs font-semibold text-cream-50 shadow-lg">
                Active
              </span>
            ) : null}
            {isAdopted ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 shadow-inner">
                Applied
              </span>
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
