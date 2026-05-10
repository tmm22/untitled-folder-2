import { OpenAIClient } from '@/lib/openai/client';

const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-transcribe';

interface OpenAITranscriptSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

interface OpenAITranscriptPayload {
  text: string;
  language?: string;
  duration?: number;
  segments?: OpenAITranscriptSegment[];
}

export interface TranscriptionInput {
  file: File | Blob;
  fileName: string;
  mimeType?: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
  durationMs: number;
  segments: OpenAITranscriptSegment[];
  raw: OpenAITranscriptPayload;
}

function toMilliseconds(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 1000));
}

export async function transcribeAudioWithOpenAI(input: TranscriptionInput): Promise<TranscriptionResult> {
  const client = new OpenAIClient();
  const payload = (await client.createTranscription({
    file: input.file,
    fileName: input.fileName,
    mimeType: input.mimeType,
    language: input.language,
    model: OPENAI_TRANSCRIPTION_MODEL,
  })) as OpenAITranscriptPayload;
  const segments = Array.isArray(payload.segments)
    ? payload.segments.filter((segment) => {
        return (
          segment &&
          typeof segment.text === 'string' &&
          typeof segment.start === 'number' &&
          typeof segment.end === 'number'
        );
      })
    : [];

  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    language: typeof payload.language === 'string' ? payload.language : null,
    durationMs: toMilliseconds(payload.duration),
    segments,
    raw: payload,
  };
}
