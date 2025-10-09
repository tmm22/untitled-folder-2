'use client';

import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import type { ProviderType } from '@/modules/tts/types';
import type { GenerationTranscript } from '@/modules/tts/types';
import { useAccountStore } from '@/modules/account/store';
import {
  fetchHistoryEntries,
  recordHistoryEntry,
  removeHistoryEntry,
  clearHistoryEntries,
} from '@/lib/history/client';

const STORAGE_KEY = 'tts-history-v2';
const ENTRY_LIMIT = 100;
const PERSISTED_HISTORY_VERSION = 2;

const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;
const isClient = () => typeof window !== 'undefined';

const shouldUseRemoteHistory = () => {
  const accountState = useAccountStore.getState();
  return accountState.sessionKind === 'authenticated';
};

const sortEntriesByCreatedAt = (entries: HistoryEntry[]) =>
  [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

interface PersistedHistoryEnvelope {
  version: number;
  ownerId: string | null;
  entries: HistoryEntry[];
}

const getAccountContext = () => {
  const { userId, sessionKind } = useAccountStore.getState();
  const normalizedUserId = userId?.trim() || null;
  return {
    userId: normalizedUserId,
    sessionKind,
    isAuthenticated: sessionKind === 'authenticated',
  };
};

const isPersistedHistoryEnvelope = (value: unknown): value is PersistedHistoryEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PersistedHistoryEnvelope>;
  return (
    candidate.version === PERSISTED_HISTORY_VERSION &&
    Array.isArray(candidate.entries) &&
    'ownerId' in candidate
  );
};

export interface HistoryEntry {
  id: string;
  provider: ProviderType;
  voiceId: string;
  text: string;
  createdAt: string;
  durationMs: number;
  transcript?: GenerationTranscript;
}

interface HistoryState {
  entries: HistoryEntry[];
  hydrated: boolean;
  error?: string;
  actions: {
    hydrate: () => Promise<void>;
    record: (entry: HistoryEntry) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
}

async function loadEntries(): Promise<HistoryEntry[]> {
  if (!isBrowser()) {
    return [];
  }

  const persisted = await get<HistoryEntry[] | PersistedHistoryEnvelope>(STORAGE_KEY);
  if (!persisted) {
    return [];
  }

  const { userId, isAuthenticated } = getAccountContext();

  if (Array.isArray(persisted)) {
    if (isAuthenticated) {
      return [];
    }
    return sortEntriesByCreatedAt(persisted);
  }

  if (!isPersistedHistoryEnvelope(persisted)) {
    return [];
  }

  if (persisted.entries.length === 0) {
    return [];
  }

  if (isAuthenticated) {
    if (!userId || persisted.ownerId !== userId) {
      return [];
    }
    return sortEntriesByCreatedAt(persisted.entries);
  }

  if (persisted.ownerId && persisted.ownerId !== userId) {
    return [];
  }

  return sortEntriesByCreatedAt(persisted.entries);
}

async function persistEntries(entries: HistoryEntry[]): Promise<void> {
  if (!isBrowser()) {
    return;
  }
  const { userId } = getAccountContext();
  await set(STORAGE_KEY, {
    version: PERSISTED_HISTORY_VERSION,
    ownerId: userId,
    entries: sortEntriesByCreatedAt(entries).slice(0, ENTRY_LIMIT),
  });
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  hydrated: false,
  error: undefined,
  actions: {
    hydrate: async () => {
      if (!isBrowser()) {
        set({ hydrated: true });
        return;
      }
      try {
        if (shouldUseRemoteHistory()) {
          try {
            const [remoteEntries, localEntries] = await Promise.all([
              fetchHistoryEntries(),
              loadEntries(),
            ]);

            const remoteIds = new Set(remoteEntries.map((entry) => entry.id));
            const unsynced = localEntries.filter((entry) => !remoteIds.has(entry.id));

            if (unsynced.length > 0) {
              await Promise.allSettled(unsynced.map((entry) => recordHistoryEntry(entry)));
            }

            const combinedEntries = [...unsynced, ...remoteEntries]
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .slice(0, ENTRY_LIMIT);

            set({ entries: combinedEntries, hydrated: true, error: undefined });
            await persistEntries(combinedEntries);
            return;
          } catch (remoteError) {
            console.error('Failed to load remote history, falling back to local', remoteError);
          }
        }

        const entries = await loadEntries();
        set({ entries, hydrated: true });
      } catch (error) {
        console.error('Failed to hydrate history', error);
        set({ error: 'Unable to load history', hydrated: true });
      }
    },
    record: async (entry) => {
      const current = get().entries;
      const withoutExisting = current.filter((existing) => existing.id !== entry.id);
      const next = [entry, ...withoutExisting].slice(0, ENTRY_LIMIT);
      set({ entries: next });
      await persistEntries(next);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await recordHistoryEntry(entry);
        } catch (error) {
          console.error('Failed to persist remote history entry', error);
        }
      }
    },
    remove: async (id) => {
      const filtered = get().entries.filter((entry) => entry.id !== id);
      set({ entries: filtered });
      await persistEntries(filtered);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await removeHistoryEntry(id);
        } catch (error) {
          console.error('Failed to remove remote history entry', error);
        }
      }
    },
    clear: async () => {
      set({ entries: [] });
      await persistEntries([]);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await clearHistoryEntries();
        } catch (error) {
          console.error('Failed to clear remote history entries', error);
        }
      }
    },
  },
}));

let hasSubscribedToAccountStore = false;

function ensureAccountStoreSubscription() {
  if (hasSubscribedToAccountStore || typeof window === 'undefined') {
    return;
  }
  hasSubscribedToAccountStore = true;
  let lastSessionKind = useAccountStore.getState().sessionKind;
  useAccountStore.subscribe((state) => {
    if (state.sessionKind === lastSessionKind) {
      return;
    }
    lastSessionKind = state.sessionKind;
    const { hydrate } = useHistoryStore.getState().actions;
    void hydrate();
  });
}

ensureAccountStoreSubscription();
