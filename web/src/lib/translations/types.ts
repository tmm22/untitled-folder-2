export interface TranslationRecord {
  id: string;
  sequenceIndex: number;
  createdAt: string;
  updatedAt: string;
  sourceText: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translatedText: string;
  keepOriginalApplied: boolean;
  adoptedAt?: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface TranslationListResult {
  items: TranslationRecord[];
  nextCursor?: string;
}

export interface CreateTranslationInput {
  translationId?: string;
  sourceText: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translatedText: string;
  keepOriginalApplied: boolean;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface TranslateTextRequest {
  translationId?: string;
  text: string;
  targetLanguageCode: string;
  keepOriginalApplied: boolean;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface PromoteResult {
  translation: TranslationRecord | null;
  reordered: boolean;
}

export interface MarkAdoptedResult {
  translation: TranslationRecord | null;
  collapsed: boolean;
}
