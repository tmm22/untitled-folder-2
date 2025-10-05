import { describe, expect, test } from 'vitest';
import { buildSrt, buildVtt } from '@/lib/transcript/export';

const sampleText = 'Hello world. This is a test of the transcript exporter! It should split into sentences? Great.';

describe('transcript exporter', () => {
  test('buildSrt produces numbered cues', () => {
    const srt = buildSrt(sampleText, 9000);
    const lines = srt.split('\n');
    expect(lines[0]).toBe('1');
    expect(lines[1]).toMatch(/00:00:00,000 -->/);
    expect(srt).toContain('Hello world.');
  });

  test('buildVtt produces WEBVTT document', () => {
    const vtt = buildVtt(sampleText, 9000);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 -->');
  });
});
