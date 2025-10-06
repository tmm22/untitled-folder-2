'use client';

import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import type { TextSnippet } from '@/modules/tts/types';

const STORAGE_KEY = 'tts-snippets-v1';
const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;

interface SnippetState {
  snippets: TextSnippet[];
  hydrated: boolean;
  actions: {
    hydrate: () => Promise<void>;
    saveSnippet: (snippet: TextSnippet) => Promise<void>;
    deleteSnippet: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
}

async function loadSnippets(): Promise<TextSnippet[]> {
  if (!isBrowser()) {
    return [];
  }
  const stored = await get<TextSnippet[]>(STORAGE_KEY);
  return stored ?? [];
}

async function persistSnippets(snippets: TextSnippet[]) {
  if (!isBrowser()) {
    return;
  }
  await set(STORAGE_KEY, snippets);
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  hydrated: false,
  actions: {
    hydrate: async () => {
      if (!isBrowser()) {
        set({ hydrated: true });
        return;
      }
      const snippets = await loadSnippets();
      set({ snippets, hydrated: true });
    },
    saveSnippet: async (snippet) => {
      const current = get().snippets;
      const next = [snippet, ...current.filter((item) => item.id !== snippet.id)];
      set({ snippets: next });
      await persistSnippets(next);
    },
    deleteSnippet: async (id) => {
      const filtered = get().snippets.filter((snippet) => snippet.id !== id);
      set({ snippets: filtered });
      await persistSnippets(filtered);
    },
    clear: async () => {
      set({ snippets: [] });
      await persistSnippets([]);
    },
  },
}));
