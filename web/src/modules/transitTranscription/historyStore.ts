'use client';

import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import {
  fetchTransitTranscriptions,
  saveTransitTranscription,
  removeTransitTranscription,
  clearTransitTranscriptions,
} from '@/lib/transit/transcriptionsClient';
import type { TransitTranscriptionRecord } from './types';
import { useAccountStore } from '@/modules/account/store';

const STORAGE_KEY = 'transit-transcriptions-history-v1';
const RECORD_LIMIT = 200;
const PERSISTED_VERSION = 1;

const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;
const isClient = () => typeof window !== 'undefined';

const coerceRecord = (record: TransitTranscriptionRecord): TransitTranscriptionRecord => ({
  ...record,
  summary: record.summary ?? null,
  cleanup: record.cleanup ?? null,
  language: record.language ?? null,
});

const sortRecords = (records: TransitTranscriptionRecord[]) =>
  [...records]
    .map(coerceRecord)
    .sort((a, b) => {
      if (a.createdAt > b.createdAt) {
        return -1;
      }
      if (a.createdAt < b.createdAt) {
        return 1;
      }
      return 0;
    });

const shouldUseRemoteHistory = () => {
  const account = useAccountStore.getState();
  return account.sessionKind === 'authenticated';
};

interface PersistedEnvelope {
  version: number;
  ownerId: string | null;
  records: TransitTranscriptionRecord[];
}

const isPersistedEnvelope = (value: unknown): value is PersistedEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PersistedEnvelope>;
  return candidate.version === PERSISTED_VERSION && Array.isArray(candidate.records) && 'ownerId' in candidate;
};

const getAccountContext = () => {
  const { userId, sessionKind } = useAccountStore.getState();
  const normalizedUserId = userId?.trim() || null;
  return {
    userId: normalizedUserId,
    sessionKind,
    isAuthenticated: sessionKind === 'authenticated',
  };
};

async function loadRecords(): Promise<TransitTranscriptionRecord[]> {
  if (!isBrowser()) {
    return [];
  }

  const persisted = await get<TransitTranscriptionRecord[] | PersistedEnvelope>(STORAGE_KEY);
  if (!persisted) {
    return [];
  }

  const { userId, isAuthenticated } = getAccountContext();

  if (Array.isArray(persisted)) {
    if (isAuthenticated) {
      return [];
    }
    return sortRecords(persisted);
  }

  if (!isPersistedEnvelope(persisted)) {
    return [];
  }

  if (persisted.records.length === 0) {
    return [];
  }

  if (isAuthenticated) {
    if (!userId || persisted.ownerId !== userId) {
      return [];
    }
    return sortRecords(persisted.records);
  }

  if (persisted.ownerId && persisted.ownerId !== userId) {
    return [];
  }

  return sortRecords(persisted.records);
}

async function persistRecords(records: TransitTranscriptionRecord[]): Promise<void> {
  if (!isBrowser()) {
    return;
  }
  const { userId } = getAccountContext();
  await set(STORAGE_KEY, {
    version: PERSISTED_VERSION,
    ownerId: userId,
    records: sortRecords(records).slice(0, RECORD_LIMIT),
  });
}

interface TransitTranscriptionHistoryState {
  records: TransitTranscriptionRecord[];
  hydrated: boolean;
  error?: string;
  actions: {
    hydrate: () => Promise<void>;
    record: (record: TransitTranscriptionRecord) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
}

export const useTransitTranscriptionHistoryStore = create<TransitTranscriptionHistoryState>((set, get) => ({
  records: [],
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
            const [remoteRecords, localRecords] = await Promise.all([fetchTransitTranscriptions(), loadRecords()]);

            const remoteIds = new Set(remoteRecords.map((record) => record.id));
            const unsynced = localRecords.filter((record) => !remoteIds.has(record.id));

            if (unsynced.length > 0) {
              await Promise.allSettled(unsynced.map((record) => saveTransitTranscription(record)));
            }

            const combinedMap = new Map(remoteRecords.map((record) => [record.id, record] as const));
            for (const record of unsynced) {
              combinedMap.set(record.id, record);
            }

            const combined = sortRecords([...combinedMap.values()]).slice(0, RECORD_LIMIT);
            set({ records: combined, hydrated: true, error: undefined });
            await persistRecords(combined);
            return;
          } catch (remoteError) {
            console.error('Failed to load remote transit transcripts; falling back to local cache', remoteError);
          }
        }

        const records = await loadRecords();
        set({ records, hydrated: true, error: undefined });
      } catch (error) {
        console.error('Failed to hydrate transit transcription history', error);
        set({ error: 'Unable to load transcript history', hydrated: true });
      }
    },
    record: async (record) => {
      const current = get().records;
      const withoutExisting = current.filter((existing) => existing.id !== record.id);
      const next = sortRecords([record, ...withoutExisting]).slice(0, RECORD_LIMIT);
      set({ records: next });
      await persistRecords(next);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await saveTransitTranscription(record);
        } catch (error) {
          console.error('Failed to persist remote transit transcript', error);
        }
      }
    },
    remove: async (id) => {
      const filtered = get()
        .records
        .filter((record) => record.id !== id);
      set({ records: filtered });
      await persistRecords(filtered);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await removeTransitTranscription(id);
        } catch (error) {
          console.error('Failed to remove remote transit transcript', error);
        }
      }
    },
    clear: async () => {
      set({ records: [] });
      await persistRecords([]);

      if (isClient() && shouldUseRemoteHistory()) {
        try {
          await clearTransitTranscriptions();
        } catch (error) {
          console.error('Failed to clear remote transit transcripts', error);
        }
      }
    },
  },
}));

let accountSubscribed = false;

function ensureAccountSubscription() {
  if (accountSubscribed || typeof window === 'undefined') {
    return;
  }
  accountSubscribed = true;
  let lastSessionKind = useAccountStore.getState().sessionKind;
  useAccountStore.subscribe((state) => {
    if (state.sessionKind === lastSessionKind) {
      return;
    }
    lastSessionKind = state.sessionKind;
    const { hydrate } = useTransitTranscriptionHistoryStore.getState().actions;
    void hydrate();
  });
}

ensureAccountSubscription();
