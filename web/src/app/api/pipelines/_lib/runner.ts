import { fetchReadableContent } from '@/lib/imports/fetcher';
import {
  adjustTone,
  OpenAIUnavailableError,
  summariseText,
  translateText,
} from '@/lib/pipelines/openai';
import {
  normaliseWhitespace,
  splitIntoParagraphs,
  stripBulletMarkers,
  chunkText,
} from '@/lib/pipelines/text';
import type {
  PipelineDefinition,
  PipelineQueueSpec,
  PipelineRunInput,
  PipelineRunResult,
  PipelineSummariseStep,
  PipelineTranslateStep,
  PipelineToneStep,
  PipelineChunkStep,
} from '@/lib/pipelines/types';

interface PipelineContextState {
  title?: string;
  content: string;
  summary?: string;
  segments: string[];
  queue?: PipelineQueueSpec;
}

async function resolveInitialContent(
  pipeline: PipelineDefinition,
  input: PipelineRunInput,
): Promise<PipelineContextState> {
  let content = input.content?.trim();
  let title = input.title?.trim();
  let summary = input.summary?.trim();

  const source = input.source ?? (pipeline.defaultSource
    ? { type: 'url' as const, identifier: pipeline.defaultSource.value }
    : undefined);

  if (!content && source?.type === 'url' && source.identifier) {
    try {
      const fetched = await fetchReadableContent(source.identifier);
      content = fetched.content ?? '';
      title = title ?? fetched.title;
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      throw new Error('Unable to fetch content from source URL');
    }
  }

  if (!content) {
    throw new Error('No content available to process');
  }

  return {
    title,
    content,
    summary,
    segments: [],
    queue: undefined,
  };
}

function applyCleaning(content: string, options: { normaliseWhitespace?: boolean; stripBullets?: boolean }): string {
  let result = content;
  if (options.normaliseWhitespace !== false) {
    result = normaliseWhitespace(result);
  }
  if (options.stripBullets) {
    result = stripBulletMarkers(result);
  }
  return result;
}

async function applySummarise(step: PipelineSummariseStep, context: PipelineContextState, warnings: string[]) {
  const summary = await summariseText(context.content, {
    bulletCount: step.options.bulletCount,
    includeKeywords: step.options.includeKeywords,
    style: step.options.style,
  });
  if (!summary) {
    warnings.push('Summarisation skipped (OpenAI unavailable or request failed).');
    return;
  }
  context.summary = summary;
}

async function applyTranslate(step: PipelineTranslateStep, context: PipelineContextState, warnings: string[]) {
  try {
    const translated = await translateText(context.content, {
      targetLanguage: step.options.targetLanguage,
      keepOriginal: step.options.keepOriginal,
    });
    context.content = translated;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      warnings.push('Translation unavailable because OpenAI is not configured.');
      return;
    }
    warnings.push('Translation failed; original content retained.');
  }
}

async function applyTone(step: PipelineToneStep, context: PipelineContextState, warnings: string[]) {
  try {
    const adjusted = await adjustTone(context.content, {
      tone: step.options.tone,
      audienceHint: step.options.audienceHint,
    });
    context.content = adjusted;
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) {
      warnings.push('Tone adjustment unavailable because OpenAI is not configured.');
      return;
    }
    warnings.push('Tone adjustment failed; original content retained.');
  }
}

function applyChunking(step: PipelineChunkStep, context: PipelineContextState) {
  context.segments = chunkText(context.content, {
    strategy: step.options.strategy,
    maxCharacters: step.options.maxCharacters,
    joinShortSegments: step.options.joinShortSegments,
  });
}

function ensureSegments(context: PipelineContextState): string[] {
  if (context.segments.length > 0) {
    return context.segments;
  }
  const paragraphs = splitIntoParagraphs(context.content);
  if (paragraphs.length > 0) {
    return paragraphs;
  }
  return [context.content.trim()];
}

export async function runPipelineOnServer(
  pipeline: PipelineDefinition,
  input: PipelineRunInput,
): Promise<PipelineRunResult> {
  const warnings: string[] = [];
  const startedAt = new Date().toISOString();
  const context = await resolveInitialContent(pipeline, input);

  for (const step of pipeline.steps) {
    switch (step.kind) {
      case 'clean':
        context.content = applyCleaning(context.content, step.options);
        break;
      case 'summarise':
        await applySummarise(step, context, warnings);
        break;
      case 'translate':
        await applyTranslate(step, context, warnings);
        break;
      case 'tone':
        await applyTone(step, context, warnings);
        break;
      case 'chunk':
        applyChunking(step, context);
        break;
      case 'queue':
        context.queue = {
          provider: step.options.provider,
          voicePreference: step.options.voicePreference,
          voiceId: step.options.voiceId,
          segmentDelayMs: step.options.segmentDelayMs,
        };
        break;
      default:
        warnings.push('Unsupported pipeline step encountered.');
        break;
    }
  }

  const segments = ensureSegments(context);
  const completedAt = new Date().toISOString();

  return {
    pipelineId: pipeline.id,
    startedAt,
    completedAt,
    artifacts: {
      content: context.content,
      summary: context.summary,
      segments,
      queue: context.queue,
    },
    warnings,
  };
}
