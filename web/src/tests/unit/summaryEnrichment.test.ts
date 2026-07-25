import { describe, expect, it } from 'vitest';
import { normaliseSummaryEnrichment } from '@/lib/pipelines/openai';
import { MAX_KEY_POINTS, MAX_TAGS } from '@/lib/summarize/types';

describe('normaliseSummaryEnrichment', () => {
  it('rejects payloads that are not objects', () => {
    expect(normaliseSummaryEnrichment(null)).toBeUndefined();
    expect(normaliseSummaryEnrichment('a summary')).toBeUndefined();
  });

  it('rejects payloads without a usable summary', () => {
    expect(normaliseSummaryEnrichment({ keyPoints: ['a'], tags: ['b'] })).toBeUndefined();
    expect(normaliseSummaryEnrichment({ summary: '   ' })).toBeUndefined();
  });

  it('keeps a valid payload intact', () => {
    const result = normaliseSummaryEnrichment({
      summary: 'Solar installs doubled this year.',
      keyPoints: ['Panel prices fell sharply.', 'Battery storage improved.'],
      tags: ['solar', 'batteries'],
    });
    expect(result).toEqual({
      summary: 'Solar installs doubled this year.',
      keyPoints: ['Panel prices fell sharply.', 'Battery storage improved.'],
      tags: ['solar', 'batteries'],
    });
  });

  it('defaults missing lists to empty arrays', () => {
    const result = normaliseSummaryEnrichment({ summary: 'A summary.' });
    expect(result).toEqual({ summary: 'A summary.', keyPoints: [], tags: [] });
  });

  it('caps key points and tags at the shared limits', () => {
    const result = normaliseSummaryEnrichment({
      summary: 'A summary.',
      keyPoints: Array.from({ length: 12 }, (_, index) => `Distinct key point number ${index}.`),
      tags: Array.from({ length: 12 }, (_, index) => `tag${index}`),
    });
    expect(result?.keyPoints).toHaveLength(MAX_KEY_POINTS);
    expect(result?.tags).toHaveLength(MAX_TAGS);
  });

  it('drops non-string and empty entries', () => {
    const result = normaliseSummaryEnrichment({
      summary: 'A summary.',
      keyPoints: ['A real point.', 42, null, '   ', 'Another real point.'],
      tags: ['solar', 7, ''],
    });
    expect(result?.keyPoints).toEqual(['A real point.', 'Another real point.']);
    expect(result?.tags).toEqual(['solar']);
  });

  it('deduplicates case-insensitively and lowercases tags', () => {
    const result = normaliseSummaryEnrichment({
      summary: 'A summary.',
      keyPoints: ['Repeated point.', 'REPEATED POINT.'],
      tags: ['Solar', 'solar', 'BATTERIES'],
    });
    expect(result?.keyPoints).toEqual(['Repeated point.']);
    expect(result?.tags).toEqual(['solar', 'batteries']);
  });

  it('strips narration-hostile artifacts the model may emit', () => {
    const result = normaliseSummaryEnrichment({
      summary: 'Solar **installs** doubled, see https://example.com/data for detail [1].',
      keyPoints: ['- Prices fell [2].'],
      tags: ['solar'],
    });
    expect(result?.summary).toBeDefined();
    expect(result?.summary).not.toContain('https://');
    expect(result?.summary).not.toContain('**');
    expect(result?.summary).not.toContain('[1]');
    expect(result?.keyPoints).toEqual(['Prices fell.']);
  });

  it('rejects a summary that is entirely boilerplate once cleaned', () => {
    expect(
      normaliseSummaryEnrichment({ summary: 'Read more at https://example.com/article' }),
    ).toBeUndefined();
  });
});
