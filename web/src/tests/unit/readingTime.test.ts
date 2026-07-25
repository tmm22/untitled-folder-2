import { describe, expect, it } from 'vitest';
import { estimateReadingMinutes } from '@/lib/summarize/readingTime';

describe('estimateReadingMinutes', () => {
  it('returns 0 only for empty input', () => {
    expect(estimateReadingMinutes('')).toBe(0);
    expect(estimateReadingMinutes('   \n\t ')).toBe(0);
  });

  it('rounds any real content up to at least one minute', () => {
    expect(estimateReadingMinutes('Just a few words here.')).toBe(1);
  });

  it('scales with word count', () => {
    const words = Array.from({ length: 660 }, () => 'word').join(' ');
    expect(estimateReadingMinutes(words)).toBe(3);
  });

  it('ignores extra whitespace between words', () => {
    const spaced = Array.from({ length: 220 }, () => 'word').join('   \n  ');
    expect(estimateReadingMinutes(spaced)).toBe(1);
  });
});
