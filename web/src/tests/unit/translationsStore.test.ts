import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useTranslationHistoryStore } from '@/modules/translations/store';
import type { TranslationRecord } from '@/lib/translations/types';
import {
  fetchTranslations,
  createTranslation,
  promoteTranslation,
  clearTranslations,
  markTranslationAdopted,
} from '@/lib/translations/client';

vi.mock('@/lib/translations/client', () => ({
  fetchTranslations: vi.fn(),
  createTranslation: vi.fn(),
  promoteTranslation: vi.fn(),
  clearTranslations: vi.fn(),
  markTranslationAdopted: vi.fn(),
}));

const buildTranslation = (overrides: Partial<TranslationRecord> = {}): TranslationRecord => ({
  id: overrides.id ?? 'translation-1',
  sequenceIndex: overrides.sequenceIndex ?? 1,
  createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2025-01-01T00:00:00.000Z',
  sourceText: overrides.sourceText ?? 'Hello world',
  sourceLanguageCode: overrides.sourceLanguageCode ?? 'en',
  targetLanguageCode: overrides.targetLanguageCode ?? 'fr',
  translatedText: overrides.translatedText ?? 'Bonjour le monde',
  keepOriginalApplied: overrides.keepOriginalApplied ?? true,
  provider: overrides.provider ?? 'openai',
  metadata: overrides.metadata,
  adoptedAt: overrides.adoptedAt,
});

const resetStore = () => {
  useTranslationHistoryStore.getState().actions.reset();
};

describe('useTranslationHistoryStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetStore();
  });

  it('translates and collapses history when keepOriginal is false', async () => {
    const translation = buildTranslation({ id: 't-5', sequenceIndex: 1, translatedText: 'Hallo Welt', targetLanguageCode: 'de' });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [],
      activeTranslation: null,
      nextCursor: undefined,
      isHydrated: true,
      isLoading: false,
      error: undefined,
      keepOriginal: false,
      targetLanguageCode: 'de',
    });

    vi.mocked(createTranslation).mockResolvedValue({
      translation,
      historySize: 1,
    });

    vi.mocked(markTranslationAdopted).mockResolvedValue({
      translation: { ...translation, keepOriginalApplied: false },
      collapsed: true,
    });

    await useTranslationHistoryStore.getState().actions.translate('Hello world');

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.keepOriginalApplied).toBe(false);
    expect(state.nextCursor).toBeUndefined();
    expect(markTranslationAdopted).toHaveBeenCalledWith('doc-1', 't-5', true);
  });

  afterEach(() => {
    resetStore();
  });

  it('hydrates translations for a document', async () => {
    const translation = buildTranslation({ id: 't-1', sequenceIndex: 2 });
    vi.mocked(fetchTranslations).mockResolvedValue({
      items: [translation],
      nextCursor: '1',
    });

    await useTranslationHistoryStore.getState().actions.hydrate('doc-1');

    const state = useTranslationHistoryStore.getState();
    expect(state.documentId).toBe('doc-1');
    expect(state.history).toHaveLength(1);
    expect(state.activeTranslation?.id).toBe('t-1');
    expect(state.nextCursor).toBe('1');
    expect(state.isHydrated).toBe(true);
    expect(fetchTranslations).toHaveBeenCalledWith('doc-1');
  });

  it('treats unauthorized responses as empty history', async () => {
    vi.mocked(fetchTranslations).mockResolvedValue({ items: [] });

    await useTranslationHistoryStore.getState().actions.hydrate('doc-1');

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(0);
    expect(state.error).toBeUndefined();
    expect(state.isHydrated).toBe(true);
  });

  it('loads more translations and merges with existing history', async () => {
    const initial = buildTranslation({ id: 't-1', sequenceIndex: 3 });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [initial],
      activeTranslation: initial,
      nextCursor: '3',
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    const next = buildTranslation({ id: 't-2', sequenceIndex: 2 });
    vi.mocked(fetchTranslations).mockResolvedValue({
      items: [next],
      nextCursor: undefined,
    });

    await useTranslationHistoryStore.getState().actions.loadMore();

    const state = useTranslationHistoryStore.getState();
    expect(state.history.map((item) => item.id)).toEqual(['t-1', 't-2']);
    expect(state.nextCursor).toBeUndefined();
    expect(fetchTranslations).toHaveBeenCalledWith('doc-1', { cursor: '3' });
  });

  it('creates a new translation and promotes it to the top of history', async () => {
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [],
      activeTranslation: null,
      nextCursor: undefined,
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    useTranslationHistoryStore.getState().actions.setTargetLanguageCode('fr');

    const translation = buildTranslation({ id: 't-1', sequenceIndex: 1, targetLanguageCode: 'fr' });
    vi.mocked(createTranslation).mockResolvedValue({
      translation,
      historySize: 1,
    });

    const result = await useTranslationHistoryStore.getState().actions.translate('Hello world');

    expect(result?.id).toBe('t-1');
    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.activeTranslation?.id).toBe('t-1');
    expect(createTranslation).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ text: 'Hello world', targetLanguageCode: 'fr', keepOriginalApplied: true }),
    );
  });

  it('promotes an existing translation and updates ordering', async () => {
    const first = buildTranslation({ id: 't-1', sequenceIndex: 1 });
    const second = buildTranslation({ id: 't-2', sequenceIndex: 2 });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [second, first],
      activeTranslation: second,
      nextCursor: undefined,
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(promoteTranslation).mockResolvedValue({
      translation: { ...first, sequenceIndex: 3, updatedAt: '2025-01-02T00:00:00.000Z' },
      reordered: true,
    });

    await useTranslationHistoryStore.getState().actions.promote('t-1');

    const state = useTranslationHistoryStore.getState();
    expect(state.history[0]?.id).toBe('t-1');
    expect(state.history[0]?.sequenceIndex).toBe(3);
    expect(promoteTranslation).toHaveBeenCalledWith('doc-1', 't-1');
  });

  it('re-hydrates when promoting a missing translation', async () => {
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [],
      activeTranslation: null,
      nextCursor: undefined,
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(promoteTranslation).mockResolvedValue({
      translation: null,
      reordered: false,
    });

    const hydratedTranslation = buildTranslation({ id: 't-3', sequenceIndex: 1 });
    vi.mocked(fetchTranslations).mockResolvedValue({
      items: [hydratedTranslation],
      nextCursor: undefined,
    });

    await useTranslationHistoryStore.getState().actions.promote('missing');

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.id).toBe('t-3');
    expect(fetchTranslations).toHaveBeenCalledWith('doc-1');
  });

  it('marks a translation as adopted without collapsing history', async () => {
    const first = buildTranslation({ id: 't-1', sequenceIndex: 2 });
    const second = buildTranslation({ id: 't-2', sequenceIndex: 1 });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [first, second],
      activeTranslation: first,
      nextCursor: undefined,
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(markTranslationAdopted).mockResolvedValue({
      translation: { ...second, keepOriginalApplied: false, adoptedAt: '2025-01-02T00:00:00.000Z' },
      collapsed: false,
    });

    await useTranslationHistoryStore.getState().actions.markAdopted('t-2', false);

    const state = useTranslationHistoryStore.getState();
    expect(state.history[0]?.id).toBe('t-1');
    const updated = state.history.find((entry) => entry.id === 't-2');
    expect(updated?.keepOriginalApplied).toBe(false);
    expect(markTranslationAdopted).toHaveBeenCalledWith('doc-1', 't-2', false);
  });

  it('marks a translation as adopted and collapses history', async () => {
    const translation = buildTranslation({ id: 't-1', sequenceIndex: 2 });
    const other = buildTranslation({ id: 't-2', sequenceIndex: 1 });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [translation, other],
      activeTranslation: translation,
      nextCursor: 'cursor',
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(markTranslationAdopted).mockResolvedValue({
      translation: { ...translation, keepOriginalApplied: false },
      collapsed: true,
    });

    await useTranslationHistoryStore.getState().actions.markAdopted('t-1', true);

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.id).toBe('t-1');
    expect(state.nextCursor).toBeUndefined();
  });

  it('clears history and keeps the latest translation when requested', async () => {
    const first = buildTranslation({ id: 't-1', sequenceIndex: 2 });
    const second = buildTranslation({ id: 't-2', sequenceIndex: 1 });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [first, second],
      activeTranslation: first,
      nextCursor: 'cursor',
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(clearTranslations).mockResolvedValue({ deletedCount: 1 });

    await useTranslationHistoryStore.getState().actions.clear({ keepLatest: true });

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.id).toBe('t-1');
    expect(state.history[0]?.sequenceIndex).toBe(1);
    expect(state.nextCursor).toBeUndefined();
  });

  it('clears entire translation history', async () => {
    const translation = buildTranslation({ id: 't-1' });
    useTranslationHistoryStore.setState({
      documentId: 'doc-1',
      history: [translation],
      activeTranslation: translation,
      nextCursor: 'cursor',
      isHydrated: true,
      isLoading: false,
      error: undefined,
    });

    vi.mocked(clearTranslations).mockResolvedValue({ deletedCount: 1 });

    await useTranslationHistoryStore.getState().actions.clear({ keepLatest: false });

    const state = useTranslationHistoryStore.getState();
    expect(state.history).toHaveLength(0);
    expect(state.activeTranslation).toBeNull();
  });
});
