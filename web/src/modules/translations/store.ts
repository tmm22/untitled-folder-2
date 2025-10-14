'use client';

import { create } from 'zustand';
import type { TranslationRecord } from '@/lib/translations/types';
import {
  fetchTranslations,
  createTranslation,
  promoteTranslation,
  clearTranslations,
  markTranslationAdopted,
} from '@/lib/translations/client';
import { useCredentialStore } from '@/modules/credentials/store';
import type { ProviderType } from '@/modules/tts/types';

const DEFAULT_TARGET_LANGUAGE = 'en';
const DEFAULT_PROVIDER = 'openai';

const PROVIDER_ALIASES: Record<string, ProviderType> = {
  openai: 'openAI',
  elevenlabs: 'elevenLabs',
  google: 'google',
  tightass: 'tightAss',
};

const resolveProviderType = (providerId: string): ProviderType | undefined => {
  const normalized = providerId.trim().toLowerCase();
  if (normalized in PROVIDER_ALIASES) {
    return PROVIDER_ALIASES[normalized as keyof typeof PROVIDER_ALIASES];
  }
  return undefined;
};

const buildAuthHeaders = async (providerId: string): Promise<Record<string, string>> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const providerType = resolveProviderType(providerId);
  if (!providerType) {
    return {};
  }

  try {
    return await useCredentialStore.getState().actions.getAuthHeaders(providerType);
  } catch (error) {
    console.error('Failed to resolve translation auth headers', error);
    return {};
  }
};

const sortBySequence = (items: TranslationRecord[]): TranslationRecord[] =>
  [...items].sort((a, b) => b.sequenceIndex - a.sequenceIndex);

export interface TranslationHistoryState {
  documentId: string | null;
  history: TranslationRecord[];
  activeTranslation: TranslationRecord | null;
  nextCursor?: string;
  targetLanguageCode: string;
  keepOriginal: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  error?: string;
  actions: {
    reset: () => void;
    hydrate: (documentId: string) => Promise<void>;
    loadMore: () => Promise<void>;
    setTargetLanguageCode: (code: string) => void;
    setKeepOriginal: (keep: boolean) => void;
    translate: (text: string) => Promise<TranslationRecord | null>;
    promote: (translationId: string) => Promise<TranslationRecord | null>;
    markAdopted: (translationId: string, collapseHistory?: boolean) => Promise<TranslationRecord | null>;
    clear: (options?: { keepLatest?: boolean }) => Promise<void>;
  };
}

const initialState: Omit<TranslationHistoryState, 'actions'> = {
  documentId: null,
  history: [],
  activeTranslation: null,
  nextCursor: undefined,
  targetLanguageCode: DEFAULT_TARGET_LANGUAGE,
  keepOriginal: true,
  isHydrated: false,
  isLoading: false,
  error: undefined,
};

export const useTranslationHistoryStore = create<TranslationHistoryState>((set, get) => ({
  ...initialState,
  actions: {
    reset: () => set({ ...initialState }),

    setTargetLanguageCode: (code: string) => {
      if (code && code.trim().length > 0) {
        set({ targetLanguageCode: code.trim() });
      }
    },

    setKeepOriginal: (keep: boolean) => {
      set({ keepOriginal: keep });
    },

    hydrate: async (documentId: string) => {
      const current = get();
      if (current.documentId !== documentId) {
        set({
          documentId,
          history: [],
          activeTranslation: null,
          nextCursor: undefined,
          isHydrated: false,
          error: undefined,
        });
      }

      set({ isLoading: true, error: undefined });
      try {
        const result = await fetchTranslations(documentId);
        const history = sortBySequence(result.items ?? []);
        set({
          documentId,
          history,
          activeTranslation: history[0] ?? null,
          nextCursor: result.nextCursor,
          isHydrated: true,
          isLoading: false,
          error: undefined,
        });
      } catch (error) {
        console.error('Failed to hydrate translation history', error);
        set({
          history: [],
          activeTranslation: null,
          nextCursor: undefined,
          isHydrated: true,
          isLoading: false,
          error: 'Unable to load translations',
        });
      }
    },

    loadMore: async () => {
      const { documentId, nextCursor, history } = get();
      if (!documentId || !nextCursor) {
        return;
      }

      set({ isLoading: true, error: undefined });
      try {
        const result = await fetchTranslations(documentId, { cursor: nextCursor });
        const merged = new Map<string, TranslationRecord>();
        for (const entry of history) {
          merged.set(entry.id, entry);
        }
        for (const entry of result.items ?? []) {
          merged.set(entry.id, entry);
        }
        const nextHistory = sortBySequence([...merged.values()]);
        set({
          history: nextHistory,
          activeTranslation: nextHistory[0] ?? null,
          nextCursor: result.nextCursor,
          isLoading: false,
        });
      } catch (error) {
        console.error('Failed to load additional translations', error);
        set({ isLoading: false, error: 'Unable to load more translations' });
      }
    },

    translate: async (text: string) => {
      const { documentId, history, nextCursor, targetLanguageCode, keepOriginal } = get();
      if (!documentId) {
        throw new Error('No document selected for translations');
      }

      const trimmed = text.trim();
      if (!trimmed) {
        set({ error: 'Enter text to translate' });
        return null;
      }

      set({ isLoading: true, error: undefined });
      try {
        const authHeaders = await buildAuthHeaders(DEFAULT_PROVIDER);
        const result = await createTranslation(
          documentId,
          {
            text: trimmed,
            targetLanguageCode,
            keepOriginalApplied: keepOriginal,
            provider: DEFAULT_PROVIDER,
          },
          Object.keys(authHeaders).length > 0 ? { headers: authHeaders } : undefined,
        );
        if (!result.translation) {
          throw new Error('Translation creation failed');
        }

        const created = result.translation;
        let nextHistory = sortBySequence([
          created,
          ...history.filter((item) => item.id !== created.id),
        ]);
        let nextCursorValue = nextCursor;
        let activeTranslation = nextHistory[0] ?? null;

        if (!keepOriginal) {
          try {
            const adoptResult = await markTranslationAdopted(documentId, created.id, true);
            nextHistory = adoptResult.translation ? [adoptResult.translation] : [];
            activeTranslation = nextHistory[0] ?? null;
            nextCursorValue = undefined;
          } catch (adoptError) {
            console.error('Failed to adopt translation after creation', adoptError);
            set({ error: 'Unable to adopt translation' });
          }
        }

        set({
          history: nextHistory,
          activeTranslation,
          isLoading: false,
          nextCursor: nextCursorValue,
        });
        return activeTranslation ?? created;
      } catch (error) {
        console.error('Failed to create translation', error);
        set({ isLoading: false, error: 'Unable to save translation' });
        return null;
      }
    },

    promote: async (translationId: string) => {
      const { documentId, history } = get();
      if (!documentId) {
        throw new Error('No document selected for translations');
      }

      set({ isLoading: true, error: undefined });
      try {
        const result = await promoteTranslation(documentId, translationId);
        if (!result.translation) {
          await get().actions.hydrate(documentId);
          return null;
        }

        const promoted = result.translation;
        const nextHistory = sortBySequence([
          promoted,
          ...history.filter((item) => item.id !== promoted.id),
        ]);

        set({
          history: nextHistory,
          activeTranslation: nextHistory[0] ?? null,
          isLoading: false,
        });
        return promoted;
      } catch (error) {
        console.error('Failed to promote translation', error);
        set({ isLoading: false, error: 'Unable to promote translation' });
        return null;
      }
    },

    markAdopted: async (translationId: string, collapseHistory?: boolean) => {
      const { documentId, history, nextCursor } = get();
      if (!documentId) {
        throw new Error('No document selected for translations');
      }

      set({ isLoading: true, error: undefined });
      try {
        const result = await markTranslationAdopted(documentId, translationId, collapseHistory);
        if (!result.translation) {
          await get().actions.hydrate(documentId);
          return null;
        }

        const adopted = result.translation;
        const base = collapseHistory ? [] : history.filter((item) => item.id !== adopted.id);
        const nextHistory = sortBySequence([adopted, ...base]);

        set({
          history: nextHistory,
          activeTranslation: nextHistory[0] ?? null,
          isLoading: false,
          nextCursor: collapseHistory ? undefined : nextCursor,
        });

        return adopted;
      } catch (error) {
        console.error('Failed to adopt translation', error);
        set({ isLoading: false, error: 'Unable to adopt translation' });
        return null;
      }
    },

    clear: async (options?: { keepLatest?: boolean }) => {
      const { documentId, history } = get();
      if (!documentId) {
        throw new Error('No document selected for translations');
      }

      set({ isLoading: true, error: undefined });
      try {
        await clearTranslations(documentId, options?.keepLatest);

        if (options?.keepLatest) {
          const [latest] = sortBySequence(history);
          const trimmed = latest
            ? [
                {
                  ...latest,
                  sequenceIndex: 1,
                },
              ]
            : [];
          set({
            history: trimmed,
            activeTranslation: trimmed[0] ?? null,
            nextCursor: undefined,
            isLoading: false,
          });
        } else {
          set({
            history: [],
            activeTranslation: null,
            nextCursor: undefined,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('Failed to clear translations', error);
        set({ isLoading: false, error: 'Unable to clear translations' });
      }
    },
  },
}));
