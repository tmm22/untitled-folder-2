export type TransitTranscriptionSource = 'microphone' | 'upload';

export interface TransitTranscriptSegment {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TransitSummaryAction {
  text: string;
  ownerHint?: string;
  dueDateHint?: string;
}

export interface TransitScheduleRecommendation {
  title: string;
  startWindow?: string;
  durationMinutes?: number;
  participants?: string[];
}

export interface TransitSummaryBlock {
  summary: string;
  actionItems: TransitSummaryAction[];
  scheduleRecommendation?: TransitScheduleRecommendation | null;
}

export interface TransitTranscriptionRecord {
  id: string;
  title: string;
  transcript: string;
  segments: TransitTranscriptSegment[];
  summary: TransitSummaryBlock | null;
  language: string | null;
  durationMs: number;
  confidence?: number;
  createdAt: string;
  source: TransitTranscriptionSource;
}

export interface TransitStreamEvent<TType extends string, TPayload> {
  event: TType;
  data: TPayload;
}

export type TransitStreamPayload =
  | TransitStreamEvent<'status', { stage: 'received' | 'transcribing' | 'summarising' | 'persisting' | 'complete' }>
  | TransitStreamEvent<'segment', TransitTranscriptSegment>
  | TransitStreamEvent<'summary', TransitSummaryBlock>
  | TransitStreamEvent<'complete', TransitTranscriptionRecord>
  | TransitStreamEvent<'error', { message: string }>;
