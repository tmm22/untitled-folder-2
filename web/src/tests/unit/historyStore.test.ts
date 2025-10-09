import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useHistoryStore } from '@/modules/history/store';
import type { HistoryEntry } from '@/modules/history/store';
import { useAccountStore } from '@/modules/account/store';

const mockFetchHistoryEntries = vi.fn<[], Promise<HistoryEntry[]>>();
const mockRecordHistoryEntry = vi.fn<[HistoryEntry], Promise<void>>();
const mockRemoveHistoryEntry = vi.fn<[string], Promise<void>>();
const mockClearHistoryEntries = vi.fn<[], Promise<void>>();

vi.mock('@/lib/history/client', () => ({
  fetchHistoryEntries: () => mockFetchHistoryEntries(),
  recordHistoryEntry: (entry: HistoryEntry) => mockRecordHistoryEntry(entry),
  removeHistoryEntry: (id: string) => mockRemoveHistoryEntry(id),
  clearHistoryEntries: () => mockClearHistoryEntries(),
}));

const createEntry = (overrides?: Partial<HistoryEntry>): HistoryEntry => ({
  id: overrides?.id ?? 'history-1',
  provider: overrides?.provider ?? 'openAI',
  voiceId: overrides?.voiceId ?? 'alloy',
  text: overrides?.text ?? 'Sample script',
  createdAt: overrides?.createdAt ?? new Date().toISOString(),
  durationMs: overrides?.durationMs ?? 1200,
  transcript: overrides?.transcript,
});

describe('useHistoryStore', () => {
  beforeEach(async () => {
    useHistoryStore.setState({ entries: [], hydrated: true, error: undefined });
    await useHistoryStore.getState().actions.clear();
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'guest' }));
    mockFetchHistoryEntries.mockReset();
    mockFetchHistoryEntries.mockResolvedValue([]);
    mockRecordHistoryEntry.mockReset();
    mockRemoveHistoryEntry.mockReset();
    mockClearHistoryEntries.mockReset();
  });

  test('records entries and keeps the latest first', async () => {
    const actions = useHistoryStore.getState().actions;
    await actions.record(createEntry({ id: 'history-1', text: 'First' }));
    await actions.record(createEntry({ id: 'history-2', text: 'Second' }));

    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('history-2');
    expect(mockRecordHistoryEntry).not.toHaveBeenCalled();
  });

  test('removes entries', async () => {
    const actions = useHistoryStore.getState().actions;
    await actions.record(createEntry({ id: 'history-1' }));
    await actions.remove('history-1');

    expect(useHistoryStore.getState().entries).toHaveLength(0);
    expect(mockRemoveHistoryEntry).not.toHaveBeenCalled();
  });

  test('clears all entries', async () => {
    const actions = useHistoryStore.getState().actions;
    await actions.record(createEntry({ id: 'history-1' }));
    await actions.record(createEntry({ id: 'history-2' }));

    await actions.clear();

    expect(useHistoryStore.getState().entries).toHaveLength(0);
    expect(mockClearHistoryEntries).not.toHaveBeenCalled();
  });

  test('hydrates and syncs with remote when authenticated', async () => {
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated' }));
    mockFetchHistoryEntries.mockResolvedValue([
      createEntry({ id: 'remote-1', text: 'Remote entry' }),
    ]);

    await useHistoryStore.getState().actions.hydrate();

    expect(mockFetchHistoryEntries).toHaveBeenCalled();
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0]?.id).toBe('remote-1');
  });

  test('records to remote when authenticated', async () => {
    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated' }));
    mockFetchHistoryEntries.mockResolvedValue([]);
    await useHistoryStore.getState().actions.hydrate();

    const actions = useHistoryStore.getState().actions;
    const entry = createEntry({ id: 'remote-record' });
    await actions.record(entry);

    expect(mockRecordHistoryEntry).toHaveBeenCalledWith(entry);
    expect(useHistoryStore.getState().entries[0]?.id).toBe('remote-record');
  });

  test('rehydrates automatically when session changes', async () => {
    mockFetchHistoryEntries.mockResolvedValue([]);
    await useHistoryStore.getState().actions.hydrate();
    mockFetchHistoryEntries.mockReset();
    mockFetchHistoryEntries.mockResolvedValue([createEntry({ id: 'auto', text: 'Auto' })]);

    useAccountStore.setState((prev) => ({ ...prev, sessionKind: 'authenticated' }));

    await vi.waitFor(() => {
      expect(mockFetchHistoryEntries).toHaveBeenCalled();
      expect(useHistoryStore.getState().entries.some((entry) => entry.id === 'auto')).toBe(true);
    });
  });
});
