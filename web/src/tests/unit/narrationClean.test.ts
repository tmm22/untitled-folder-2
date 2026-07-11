import { describe, expect, it } from 'vitest';
import { cleanForNarration, isNarratableSentence } from '@/lib/summarize/narrationClean';
import { extractiveSummary } from '@/lib/summarize/onDevice';

describe('cleanForNarration', () => {
  it('strips URLs and emails', () => {
    const cleaned = cleanForNarration(
      'Visit https://example.com/story?id=1 or www.example.org for details. Contact news@example.com today.',
    );
    expect(cleaned).not.toContain('http');
    expect(cleaned).not.toContain('www.');
    expect(cleaned).not.toContain('@');
    expect(cleaned).toContain('for details');
  });

  it('unwraps markdown links and removes images, headings, and emphasis', () => {
    const cleaned = cleanForNarration(
      '## Big News\n![chart](https://img.example.com/x.png)\nThe **quarterly** results were [strong](https://example.com) according to _analysts_.',
    );
    expect(cleaned).toContain('The quarterly results were strong according to analysts.');
    expect(cleaned).not.toContain('#');
    expect(cleaned).not.toContain('![');
    expect(cleaned).not.toContain('**');
  });

  it('removes citation markers', () => {
    const cleaned = cleanForNarration('The claim was verified.[12] Some disagreed.[citation needed]');
    expect(cleaned).toBe('The claim was verified. Some disagreed.');
  });

  it('drops boilerplate lines that should not be narrated', () => {
    const cleaned = cleanForNarration(
      [
        'Advertisement',
        'The council approved the new bridge on Tuesday.',
        'Sign up for our free newsletter',
        'Photo: Jane Smith / Getty Images',
        'Construction begins next month.',
        'Share this article',
        'By John Writer',
        '5 min read',
        '© 2026 Example Media. All rights reserved.',
      ].join('\n'),
    );
    expect(cleaned).toContain('The council approved the new bridge on Tuesday.');
    expect(cleaned).toContain('Construction begins next month.');
    expect(cleaned).not.toMatch(/advertisement/i);
    expect(cleaned).not.toMatch(/sign up/i);
    expect(cleaned).not.toMatch(/photo:/i);
    expect(cleaned).not.toMatch(/share this/i);
    expect(cleaned).not.toMatch(/min read/i);
    expect(cleaned).not.toContain('©');
    expect(cleaned).not.toContain('John Writer');
  });

  it('removes unspeakable symbols and decodes entities', () => {
    const cleaned = cleanForNarration('Home » News • Tech | AT&amp;T shares rose 5% — analysts cheered™.');
    expect(cleaned).not.toContain('»');
    expect(cleaned).not.toContain('•');
    expect(cleaned).not.toContain('|');
    expect(cleaned).not.toContain('™');
    expect(cleaned).toContain('AT&T shares rose 5%');
  });

  it('leaves clean prose unchanged apart from whitespace', () => {
    const prose = 'The market rallied on Friday. Investors welcomed the news.';
    expect(cleanForNarration(prose)).toBe(prose);
  });
});

describe('isNarratableSentence', () => {
  it('rejects fragments, boilerplate, and symbol soup', () => {
    expect(isNarratableSentence('Menu')).toBe(false);
    expect(isNarratableSentence('Subscribe to our newsletter today')).toBe(false);
    expect(isNarratableSentence('12:45 | 03.04.2026 >>')).toBe(false);
    expect(isNarratableSentence('The premier announced new funding for regional rail.')).toBe(true);
  });
});

describe('extractiveSummary narration hygiene', () => {
  it('produces a summary free of links, credits, and promos from messy article text', () => {
    const messyArticle = [
      'Advertisement',
      'Photo: AAP / Getty Images',
      'The state government announced a record investment in renewable energy storage on Monday.',
      'Officials said the projects would deliver two gigawatts of capacity by 2030. Read more at https://example.com/energy.',
      'Sign up for our morning briefing newsletter',
      'The investment includes grid-scale batteries in three regional towns, creating hundreds of jobs.[3]',
      'Share this article',
      'Industry groups welcomed the announcement and called for faster planning approvals.',
      'By Jane Reporter',
      '4 min read',
      '© 2026 Example News. All rights reserved.',
    ].join('\n');

    const summary = extractiveSummary(messyArticle, { title: 'Renewable energy investment', sentenceCount: 3 });
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).not.toContain('http');
    expect(summary).not.toMatch(/advertisement/i);
    expect(summary).not.toMatch(/sign up/i);
    expect(summary).not.toMatch(/share this/i);
    expect(summary).not.toMatch(/photo:/i);
    expect(summary).not.toContain('©');
    expect(summary).not.toContain('[3]');
    expect(summary).toContain('renewable energy');
  });
});
