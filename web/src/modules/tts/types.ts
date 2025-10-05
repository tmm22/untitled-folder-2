export type ProviderType = 'openAI' | 'elevenLabs' | 'google' | 'tightAss';

export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'flac';

export interface ProviderStyleControl {
  id: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  valueFormat: 'percentage' | { type: 'decimal'; places: number };
}

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender: 'female' | 'male' | 'neutral';
  provider: ProviderType;
  previewUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface AudioSettings {
  speed: number; // 0.5 - 2.0
  pitch: number; // 0.5 - 2.0
  volume: number; // 0.0 - 1.0
  format: AudioFormat;
  sampleRate: number;
  styleValues: Record<string, number>;
}

export interface GenerationTranscript {
  srt?: string;
  vtt?: string;
}

export interface GenerationMetadata {
  id: string;
  provider: ProviderType;
  voiceId: string;
  createdAt: string;
  durationMs: number;
  characterCount: number;
}

export interface GenerationHistoryItem {
  metadata: GenerationMetadata;
  text: string;
  audioUrl: string;
  audioContentType?: string;
  transcript?: GenerationTranscript;
  label?: string;
}

export interface BatchGenerationItem {
  id: string;
  text: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  errorMessage?: string;
  result?: GenerationHistoryItem;
}

export interface PronunciationRule {
  id: string;
  provider: ProviderType | 'all';
  search: string;
  replace: string;
  isRegex: boolean;
}

export interface ProviderLimits {
  maxCharacters: number;
  supportsBatch: boolean;
  supportsTranscripts: boolean;
}

export interface ProviderDescriptor {
  id: ProviderType;
  displayName: string;
  description: string;
  defaultVoiceId?: string;
  limits: ProviderLimits;
  supportedFormats: AudioFormat[];
  defaultSettings: AudioSettings;
  styleControls: ProviderStyleControl[];
  apiKeyName: string;
}

export interface ProviderSynthesisPayload {
  text: string;
  voiceId: string;
  settings: AudioSettings;
  glossaryRules?: PronunciationRule[];
  requestId?: string;
}

export interface ProviderSynthesisResponse {
  audioBase64: string;
  audioContentType: string;
  transcript?: GenerationTranscript;
  durationMs?: number;
  requestId: string;
}

export interface TextSnippet {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}
