'use client';

import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import type { PronunciationRule, ProviderType } from '@/modules/tts/types';

const STORAGE_KEY = 'tts-pronunciation-v1';
const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;

interface PronunciationState {
  rules: PronunciationRule[];
  hydrated: boolean;
  actions: {
    hydrate: () => Promise<void>;
    addRule: (rule: PronunciationRule) => Promise<void>;
    deleteRule: (id: string) => Promise<void>;
    clear: () => Promise<void>;
    getApplicableRules: (provider: ProviderType) => PronunciationRule[];
  };
}

async function loadRules(): Promise<PronunciationRule[]> {
  if (!isBrowser()) {
    return [];
  }
  return (await get<PronunciationRule[]>(STORAGE_KEY)) ?? [];
}

async function persistRules(rules: PronunciationRule[]) {
  if (!isBrowser()) {
    return;
  }
  await set(STORAGE_KEY, rules);
}

export const usePronunciationStore = create<PronunciationState>((set, get) => ({
  rules: [],
  hydrated: !isBrowser(),
  actions: {
    hydrate: async () => {
      if (!isBrowser()) {
        return;
      }
      const rules = await loadRules();
      set({ rules, hydrated: true });
    },
    addRule: async (rule) => {
      const next = [rule, ...get().rules];
      set({ rules: next });
      await persistRules(next);
    },
    deleteRule: async (id) => {
      const next = get().rules.filter((rule) => rule.id !== id);
      set({ rules: next });
      await persistRules(next);
    },
    clear: async () => {
      set({ rules: [] });
      await persistRules([]);
    },
    getApplicableRules: (provider) => {
      return get().rules.filter((rule) => rule.provider === 'all' || rule.provider === provider);
    },
  },
}));

