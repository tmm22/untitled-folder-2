import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { PipelineDefinition, PipelineRunInput } from '@/lib/pipelines/types';
import { runPipelineOnServer } from '@/app/api/pipelines/_lib/runner';
import * as openai from '@/lib/pipelines/openai';

vi.mock('@/lib/imports/fetcher', () => ({
  fetchReadableContent: vi.fn(async () => ({
    title: 'Fetched title',
    content: 'Fetched paragraph one.\n\nFetched paragraph two.',
  })),
}));

const summariseSpy = vi.spyOn(openai, 'summariseText');
const translateSpy = vi.spyOn(openai, 'translateText');
const toneSpy = vi.spyOn(openai, 'adjustTone');

const basePipeline: PipelineDefinition = {
  id: 'pipeline-1',
  name: 'Test pipeline',
  description: undefined,
  steps: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  webhookSecret: 'secret',
};

describe('runPipelineOnServer', () => {
  beforeEach(() => {
    summariseSpy.mockReset().mockResolvedValue('Summary content');
    translateSpy.mockReset().mockResolvedValue('Translated text');
    toneSpy.mockReset().mockImplementation(async (text: string) => `Adjusted: ${text}`);
  });

  it('cleans, chunks, and queues content', async () => {
    const pipeline: PipelineDefinition = {
      ...basePipeline,
      steps: [
        {
          id: 'clean',
          kind: 'clean',
          options: { normaliseWhitespace: true, stripBullets: true },
        },
        {
          id: 'chunk',
          kind: 'chunk',
          options: { strategy: 'paragraph', maxCharacters: 20, joinShortSegments: false },
        },
        {
          id: 'queue',
          kind: 'queue',
          options: { provider: 'tightAss', voicePreference: 'default' },
        },
      ],
    };

    const input: PipelineRunInput = {
      pipelineId: pipeline.id,
      content: 'Paragraph one.\n\nParagraph two.',
    };

    const result = await runPipelineOnServer(pipeline, input);
    expect(result.artifacts.segments).toEqual(['Paragraph one.', 'Paragraph two.']);
    expect(result.artifacts.queue).toEqual({
      provider: 'tightAss',
      voicePreference: 'default',
      voiceId: undefined,
      segmentDelayMs: undefined,
    });
    expect(result.warnings).toHaveLength(0);
  });

  it('fetches content when only source url is provided', async () => {
    const pipeline: PipelineDefinition = {
      ...basePipeline,
      defaultSource: { kind: 'url', value: 'https://example.com/article' },
      steps: [
        {
          id: 'chunk',
          kind: 'chunk',
          options: { strategy: 'paragraph', maxCharacters: 30, joinShortSegments: false },
        },
      ],
    };

    const input: PipelineRunInput = {
      pipelineId: pipeline.id,
    };

    const result = await runPipelineOnServer(pipeline, input);
    expect(result.artifacts.segments).toEqual(['Fetched paragraph one.', 'Fetched paragraph two.']);
  });

  it('records warnings when translation is unavailable', async () => {
    translateSpy.mockRejectedValueOnce(new Error('Translation failed'));

    const pipeline: PipelineDefinition = {
      ...basePipeline,
      steps: [
        {
          id: 'translate',
          kind: 'translate',
          options: { targetLanguage: 'French', keepOriginal: false },
        },
        {
          id: 'chunk',
          kind: 'chunk',
          options: { strategy: 'sentence', maxCharacters: 200, joinShortSegments: false },
        },
      ],
    };

    const input: PipelineRunInput = {
      pipelineId: pipeline.id,
      content: 'Hello world.',
    };

    const result = await runPipelineOnServer(pipeline, input);
    expect(result.warnings).toContain('Translation failed; original content retained.');
    expect(result.artifacts.segments).toEqual(['Hello world.']);
  });
});
