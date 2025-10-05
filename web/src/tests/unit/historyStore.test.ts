import { beforeEach, describe, expect, test } from 'vitest';
import { useHistoryStore } from '@/modules/history/store';
import type { HistoryEntry } from '@/modules/history/store';

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
  });

  test('records entries and keeps the latest first', async () => {
    const actions = useHistoryStore.getState().actions;
    await actions.record(createEntry({ id: 'history-1', text: 'First' }));
    await actions.record(createEntry({ id: 'history-2', text: 'Second' }));

    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('history-2');
  });

  test('removes entries', async () => {
    const actions = useHistoryStore.getState().actions;
    await actions.record(createEntry({ id: 'history-1' }));
    await actions.remove('history-1');

    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });
});
