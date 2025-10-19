import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { useTransitTranscriptionHistoryStore } from '@/modules/transitTranscription/historyStore';
import type { TransitTranscriptionRecord } from '@/modules/transitTranscription/types';
import { useAccountStore } from '@/modules/account/store';

const mockFetchTransitTranscriptions = vi.fn<[], Promise<TransitTranscriptionRecord[]>>();
const mockSaveTransitTranscription = vi.fn<[TransitTranscriptionRecord], Promise<void>>();
const mockRemoveTransitTranscription = vi.fn<[string], Promise<void>>();
const mockClearTransitTranscriptions = vi.fn<[], Promise<void>>();

const idbState = new Map<string, unknown>();
const mockIdbGet = vi.fn(async (key: string) => idbState.get(key));
const mockIdbSet = vi.fn(async (key: string, value: unknown) => {
  idbState.set(key, value);
});

vi.mock('idb-keyval', () => ({
  get: (key: string) => mockIdbGet(key),
  set: (key: string, value: unknown) => mockIdbSet(key, value),
}));

vi.mock('@/lib/transit/transcriptionsClient', () => ({
  fetchTransitTranscriptions: () => mockFetchTransitTranscriptions(),
  saveTransitTranscription: (record: TransitTranscriptionRecord) => mockSaveTransitTranscription(record),
  removeTransitTranscription: (id: string) => mockRemoveTransitTranscription(id),
  clearTransitTranscriptions: () => mockClearTransitTranscriptions(),
}));

const createRecord = (overrides?: Partial<TransitTranscriptionRecord>): TransitTranscriptionRecord => ({
  id: overrides?.id ?? 'transcript-1',
  title: overrides?.title ?? 'Dispatch call',
  transcript: overrides?.transcript ?? 'Unit five respond to incident 42.',
  segments:
    overrides?.segments ??
    [
      {
        index: 1,
        startMs: 0,
        endMs: 2000,
        text: overrides?.transcript ?? 'Unit five respond to incident 42.',
      },
    ],
  summary:
    overrides?.summary ??
    {
      summary: 'Summary',
      actionItems: [],
      scheduleRecommendation: null,
    },
  cleanup: overrides?.cleanup ?? null,
  language: overrides?.language ?? 'en',
  durationMs: overrides?.durationMs ?? 2000,
  confidence: overrides?.confidence ?? 0.85,
  createdAt: overrides?.createdAt ?? new Date().toISOString(),
  source: overrides?.source ?? 'upload',
});

const STORAGE_KEY = 'transit-transcriptions-history-v1';

beforeAll(() => {
  if (typeof window !== 'undefined' && !('indexedDB' in window)) {
    Object.defineProperty(window, 'indexedDB', {
      value: {},
      configurable: true,
    });
  }
});

describe('useTransitTranscriptionHistoryStore', () => {
  beforeEach(() => {
    idbState.clear();
    mockIdbGet.mockClear();
    mockIdbSet.mockClear();
    mockFetchTransitTranscriptions.mockReset();
    mockSaveTransitTranscription.mockReset();
    mockRemoveTransitTranscription.mockReset();
    mockClearTransitTranscriptions.mockReset();
    mockFetchTransitTranscriptions.mockResolvedValue([]);
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'guest', userId: 'guest-id' }));
    useTransitTranscriptionHistoryStore.setState({ records: [], hydrated: false, error: undefined });
  });

  test('records transcripts and keeps the latest first', async () => {
    const actions = useTransitTranscriptionHistoryStore.getState().actions;
    await actions.record(createRecord({ id: 'transcript-1', title: 'First' }));
    await actions.record(createRecord({ id: 'transcript-2', title: 'Second' }));

    const records = useTransitTranscriptionHistoryStore.getState().records;
    expect(records).toHaveLength(2);
    expect(records[0]?.id).toBe('transcript-2');
    expect(mockSaveTransitTranscription).not.toHaveBeenCalled();
  });

  test('removes transcripts locally', async () => {
    const actions = useTransitTranscriptionHistoryStore.getState().actions;
    await actions.record(createRecord({ id: 'transcript-remove' }));
    await actions.remove('transcript-remove');

    expect(useTransitTranscriptionHistoryStore.getState().records).toHaveLength(0);
    expect(mockRemoveTransitTranscription).not.toHaveBeenCalled();
  });

  test('clears transcript history locally', async () => {
    const actions = useTransitTranscriptionHistoryStore.getState().actions;
    await actions.record(createRecord({ id: 'transcript-1' }));
    await actions.record(createRecord({ id: 'transcript-2' }));

    await actions.clear();

    expect(useTransitTranscriptionHistoryStore.getState().records).toHaveLength(0);
    expect(mockClearTransitTranscriptions).not.toHaveBeenCalled();
  });

  test('hydrates from remote when authenticated', async () => {
    const record = createRecord({ id: 'remote-1', title: 'Remote' });
    mockFetchTransitTranscriptions.mockResolvedValue([record]);
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated', userId: 'account-1' }));

    await useTransitTranscriptionHistoryStore.getState().actions.hydrate();

    expect(mockFetchTransitTranscriptions).toHaveBeenCalled();
    const records = useTransitTranscriptionHistoryStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('remote-1');
  });

  test('persists to remote when authenticated', async () => {
    mockFetchTransitTranscriptions.mockResolvedValue([]);
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated', userId: 'account-2' }));
    await useTransitTranscriptionHistoryStore.getState().actions.hydrate();

    const record = createRecord({ id: 'remote-record' });
    await useTransitTranscriptionHistoryStore.getState().actions.record(record);

    expect(mockSaveTransitTranscription).toHaveBeenCalledWith(record);
    expect(useTransitTranscriptionHistoryStore.getState().records[0]?.id).toBe('remote-record');
  });

  test('transitions trigger rehydrate on session change', async () => {
    mockFetchTransitTranscriptions.mockResolvedValue([]);
    await useTransitTranscriptionHistoryStore.getState().actions.hydrate();
    mockFetchTransitTranscriptions.mockReset();
    mockFetchTransitTranscriptions.mockResolvedValue([createRecord({ id: 'post-login' })]);

    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated', userId: 'account-3' }));

    await vi.waitFor(() => {
      expect(mockFetchTransitTranscriptions).toHaveBeenCalled();
      expect(
        useTransitTranscriptionHistoryStore.getState().records.some((record) => record.id === 'post-login'),
      ).toBe(true);
    });
  });

  test('syncs stored entries belonging to the authenticated account', async () => {
    const storedRecord = createRecord({ id: 'stored-1', title: 'Stored' });
    idbState.set(STORAGE_KEY, {
      version: 1,
      ownerId: 'account-4',
      records: [storedRecord],
    });
    mockFetchTransitTranscriptions.mockResolvedValue([]);
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated', userId: 'account-4' }));

    await useTransitTranscriptionHistoryStore.getState().actions.hydrate();

    expect(mockSaveTransitTranscription).toHaveBeenCalledWith(storedRecord);
    expect(useTransitTranscriptionHistoryStore.getState().records[0]?.id).toBe('stored-1');
  });
});
