'use client';

import { create } from 'zustand';
import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'tts-imports-v1';
const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;

import type { SummaryEngine } from '@/lib/summarize/onDevice';

export interface ImportedEntry {
  id: string;
  source: string;
  title: string;
  content: string;
  createdAt: string;
  summary?: string;
  summaryEngine?: SummaryEngine;
}

interface ImportState {
  entries: ImportedEntry[];
  hydrated: boolean;
  error?: string;
  actions: {
    hydrate: () => Promise<void>;
    record: (entry: ImportedEntry) => Promise<void>;
    update: (id: string, patch: Partial<Omit<ImportedEntry, 'id'>>) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
}

async function loadImports(): Promise<ImportedEntry[]> {
  if (!isBrowser()) {
    return [];
  }
  return (await get<ImportedEntry[]>(STORAGE_KEY)) ?? [];
}

async function persistImports(entries: ImportedEntry[]) {
  if (!isBrowser()) {
    return;
  }
  await set(STORAGE_KEY, entries);
}

export const useImportStore = create<ImportState>((set, get) => ({
  entries: [],
  hydrated: false,
  error: undefined,
  actions: {
    hydrate: async () => {
      if (!isBrowser()) {
        set({ hydrated: true });
        return;
      }
      const entries = await loadImports();
      set({ entries, hydrated: true });
    },
    record: async (entry) => {
      const next = [entry, ...get().entries];
      set({ entries: next });
      await persistImports(next);
    },
    update: async (id, patch) => {
      const next = get().entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
      set({ entries: next });
      await persistImports(next);
    },
    remove: async (id) => {
      const next = get().entries.filter((entry) => entry.id !== id);
      set({ entries: next });
      await persistImports(next);
    },
    clear: async () => {
      set({ entries: [] });
      await persistImports([]);
    },
  },
}));
