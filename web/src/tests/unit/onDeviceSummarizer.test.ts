import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enrichOnDevice,
  extractiveKeyPoints,
  extractiveSummary,
  extractiveTags,
  summarizeOnDevice,
} from '@/lib/summarize/onDevice';
import { MAX_KEY_POINTS, MAX_TAGS } from '@/lib/summarize/types';

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

describe('extractiveKeyPoints', () => {
  it('returns nothing for empty input', () => {
    expect(extractiveKeyPoints('   ')).toEqual([]);
  });

  it('returns discrete narratable sentences capped at the requested count', () => {
    const points = extractiveKeyPoints(ARTICLE, { title: 'Solar power boom', count: 3 });
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.length).toBeGreaterThan(11);
    }
  });

  it('defaults to the shared key-point cap', () => {
    const points = extractiveKeyPoints(ARTICLE, { title: 'Solar power boom' });
    expect(points.length).toBeLessThanOrEqual(MAX_KEY_POINTS);
  });

  it('skips sentences already covered by the summary', () => {
    const summary = extractiveSummary(ARTICLE, { title: 'Solar power boom', sentenceCount: 3 });
    const points = extractiveKeyPoints(ARTICLE, { title: 'Solar power boom', exclude: summary });
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(summary).not.toContain(point);
    }
  });

  it('returns an empty list when the summary already covers every sentence', () => {
    const text = 'Solar power adoption is accelerating quickly across the country this year.';
    expect(extractiveKeyPoints(text, { exclude: text })).toEqual([]);
  });
});

describe('extractiveTags', () => {
  it('returns nothing for empty input', () => {
    expect(extractiveTags('   ')).toEqual([]);
  });

  it('surfaces recurring topic terms and respects the cap', () => {
    const tags = extractiveTags(ARTICLE, { title: 'Solar power boom' });
    expect(tags).toContain('solar');
    expect(tags.length).toBeLessThanOrEqual(MAX_TAGS);
  });

  it('promotes title terms above raw frequency', () => {
    const tags = extractiveTags(ARTICLE, { title: 'Battery storage' });
    expect(tags[0]).toBe('battery');
  });

  it('excludes short words', () => {
    const tags = extractiveTags(ARTICLE, { title: 'Solar power boom' });
    for (const tag of tags) {
      expect(tag.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('enrichOnDevice', () => {
  afterEach(() => {
    delete (window as { Summarizer?: unknown }).Summarizer;
    vi.restoreAllMocks();
  });

  it('returns a summary with key points and tags from the extractive engine', async () => {
    const result = await enrichOnDevice(ARTICLE, { title: 'Solar power boom' });
    expect(result.engine).toBe('extractive');
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.tags).toContain('solar');
  });

  it('keeps key points out of the summary', async () => {
    const result = await enrichOnDevice(ARTICLE, { title: 'Solar power boom' });
    for (const point of result.keyPoints) {
      expect(result.summary).not.toContain(point);
    }
  });

  it('pairs a browser-AI summary with extractive key points and tags', async () => {
    (window as { Summarizer?: unknown }).Summarizer = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        summarize: vi.fn(async () => 'Browser AI summary.'),
        destroy: vi.fn(),
      })),
    };

    const result = await enrichOnDevice(ARTICLE, { title: 'Solar power boom' });
    expect(result.engine).toBe('browser-ai');
    expect(result.summary).toBe('Browser AI summary.');
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.tags.length).toBeGreaterThan(0);
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
