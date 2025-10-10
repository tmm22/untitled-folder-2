import type { ProviderType } from '@/modules/tts/types';

export type PipelineStepKind = 'clean' | 'summarise' | 'translate' | 'tone' | 'chunk' | 'queue';

export type PipelineVoicePreference = 'history' | 'default' | 'custom';

export interface PipelineScheduleConfig {
  cron: string;
  description?: string;
}

export interface PipelineSourceConfig {
  kind: 'url';
  value: string;
}

interface PipelineStepBase<TKind extends PipelineStepKind, TOptions> {
  id: string;
  kind: TKind;
  options: Readonly<TOptions>;
  label?: string;
}

export interface CleanStepOptions {
  preserveQuotes?: boolean;
  normaliseWhitespace?: boolean;
  stripBullets?: boolean;
}

export interface SummariseStepOptions {
  bulletCount: number;
  includeKeywords?: boolean;
  style?: 'bullets' | 'paragraph';
}

export interface TranslateStepOptions {
  targetLanguage: string;
  keepOriginal?: boolean;
}

export interface ToneStepOptions {
  tone: 'neutral' | 'friendly' | 'formal' | 'dramatic';
  audienceHint?: string;
}

export interface ChunkStepOptions {
  strategy: 'paragraph' | 'sentence';
  maxCharacters: number;
  joinShortSegments?: boolean;
}

export interface QueueStepOptions {
  provider: ProviderType;
  voicePreference: PipelineVoicePreference;
  voiceId?: string;
  segmentDelayMs?: number;
}

export type PipelineCleanStep = PipelineStepBase<'clean', CleanStepOptions>;
export type PipelineSummariseStep = PipelineStepBase<'summarise', SummariseStepOptions>;
export type PipelineTranslateStep = PipelineStepBase<'translate', TranslateStepOptions>;
export type PipelineToneStep = PipelineStepBase<'tone', ToneStepOptions>;
export type PipelineChunkStep = PipelineStepBase<'chunk', ChunkStepOptions>;
export type PipelineQueueStep = PipelineStepBase<'queue', QueueStepOptions>;

export type PipelineStep =
  | PipelineCleanStep
  | PipelineSummariseStep
  | PipelineTranslateStep
  | PipelineToneStep
  | PipelineChunkStep
  | PipelineQueueStep;

export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  createdAt: string;
  updatedAt: string;
  webhookSecret: string;
  schedule?: PipelineScheduleConfig;
  defaultSource?: PipelineSourceConfig;
  lastRunAt?: string;
}

export interface PipelineCreateInput {
  name: string;
  description?: string;
  steps: PipelineStep[];
  schedule?: PipelineScheduleConfig;
  defaultSource?: PipelineSourceConfig;
}

export interface PipelineUpdateInput {
  name?: string;
  description?: string;
  steps?: PipelineStep[];
  schedule?: PipelineScheduleConfig | null;
  defaultSource?: PipelineSourceConfig | null;
  rotateSecret?: boolean;
}

export interface PipelineRunSource {
  type: 'import' | 'url' | 'manual';
  identifier?: string;
}

export interface PipelineRunInput {
  pipelineId: string;
  content?: string;
  title?: string;
  summary?: string;
  source?: PipelineRunSource;
}

export interface PipelineQueueSpec {
  provider: ProviderType;
  voicePreference: PipelineVoicePreference;
  voiceId?: string;
  segmentDelayMs?: number;
}

export interface PipelineRunArtifacts {
  content: string;
  summary?: string;
  segments: string[];
  queue?: PipelineQueueSpec;
}

export interface PipelineRunResult {
  pipelineId: string;
  startedAt: string;
  completedAt: string;
  artifacts: PipelineRunArtifacts;
  warnings: string[];
}

export interface PipelineListItem {
  id: string;
  name: string;
  description?: string;
  schedule?: PipelineScheduleConfig;
  lastRunAt?: string;
}
