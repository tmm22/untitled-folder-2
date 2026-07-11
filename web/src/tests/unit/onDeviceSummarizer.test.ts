import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractiveSummary, summarizeOnDevice } from '@/lib/summarize/onDevice';

const FILLER_SENTENCES = Array.from(
  { length: 10 },
  (_, index) => `Filler sentence number ${index} rambles pleasantly onward without adding much detail.`,
);

const ARTICLE = [
  'Solar power adoption is accelerating across regional Australia.',
  ...FILLER_SENTENCES.slice(0, 4),
  'New solar power installations doubled this year as panel prices fell and battery storage improved.',
  ...FILLER_SENTENCES.slice(4, 8),
  'Analysts expect solar power with battery storage to dominate new energy investment within a decade.',
  ...FILLER_SENTENCES.slice(8),
].join(' ');

describe('extractiveSummary', () => {
  it('returns short text unchanged', () => {
    const text = 'One short paragraph.';
    expect(extractiveSummary(text)).toBe(text);
  });

  it('returns empty string for empty input', () => {
    expect(extractiveSummary('   ')).toBe('');
  });

  it('selects the most topical sentences in original order', () => {
    const summary = extractiveSummary(ARTICLE, { title: 'Solar power boom', sentenceCount: 3 });
    expect(summary).toContain('Solar power adoption is accelerating');
    expect(summary).toContain('New solar power installations doubled');
    expect(summary.length).toBeLessThan(ARTICLE.length);
    expect(summary.indexOf('Solar power adoption')).toBeLessThan(summary.indexOf('New solar power installations'));
  });

  it('respects the requested sentence count', () => {
    const summary = extractiveSummary(ARTICLE, { sentenceCount: 1 });
    const sentences = summary.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 0);
    expect(sentences).toHaveLength(1);
  });
});

describe('summarizeOnDevice', () => {
  afterEach(() => {
    delete (window as { Summarizer?: unknown }).Summarizer;
    vi.restoreAllMocks();
  });

  it('falls back to the extractive engine when no browser summarizer exists', async () => {
    const result = await summarizeOnDevice(ARTICLE, { title: 'Solar power boom' });
    expect(result.engine).toBe('extractive');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('uses the browser summarizer when it is available', async () => {
    const summarizeMock = vi.fn(async () => 'Browser AI summary.');
    (window as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ summarize: summarizeMock, destroy: vi.fn() })),
    };

    const result = await summarizeOnDevice(ARTICLE);
    expect(result.engine).toBe('browser-ai');
    expect(result.summary).toBe('Browser AI summary.');
    expect(summarizeMock).toHaveBeenCalled();
  });

  it('does not trigger a model download when the summarizer is only downloadable', async () => {
    const createMock = vi.fn();
    (window as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'downloadable'),
      create: createMock,
    };

    const result = await summarizeOnDevice(ARTICLE);
    expect(result.engine).toBe('extractive');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('falls back to extractive when the browser summarizer throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        summarize: vi.fn(async () => {
          throw new Error('model crashed');
        }),
        destroy: vi.fn(),
      })),
    };

    const result = await summarizeOnDevice(ARTICLE);
    expect(result.engine).toBe('extractive');
    expect(result.summary.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });
});
