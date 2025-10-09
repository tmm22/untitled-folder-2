import type { ProviderType } from '@/modules/tts/types';
import type { GenerationTranscript } from '@/modules/tts/types';

export interface HistoryEntryPayload {
  id: string;
  userId: string;
  provider: ProviderType;
  voiceId: string;
  text: string;
  createdAt: string;
  durationMs: number;
  transcript?: GenerationTranscript;
}

