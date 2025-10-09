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

const STORAGE_KEY = 'tts-history-v1';
const ENTRY_LIMIT = 100;

const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;
const isClient = () => typeof window !== 'undefined';

const shouldUseRemoteHistory = () => {
  const accountState = useAccountStore.getState();
  return accountState.sessionKind === 'authenticated';
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
  return ((await get<HistoryEntry[]>(STORAGE_KEY)) ?? []).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

async function persistEntries(entries: HistoryEntry[]): Promise<void> {
  if (!isBrowser()) {
    return;
  }
  await set(STORAGE_KEY, entries.slice(0, ENTRY_LIMIT));
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
            const remoteEntries = await fetchHistoryEntries();
            set({ entries: remoteEntries.slice(0, ENTRY_LIMIT), hydrated: true, error: undefined });
            await persistEntries(remoteEntries);
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
