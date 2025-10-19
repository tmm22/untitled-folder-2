const OPENAI_TRANSCRIPTION_URL =
  process.env.OPENAI_TRANSCRIPTIONS_URL?.trim() || 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'whisper-1';

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

function resolveApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('OpenAI API key is not configured for transcription');
  }
  return key;
}

function buildFormData(input: TranscriptionInput): FormData {
  const formData = new FormData();
  formData.append('model', OPENAI_TRANSCRIPTION_MODEL);
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  formData.append('timestamp_granularities[]', 'segment');

  if (input.language) {
    formData.append('language', input.language);
  }

  const blob = input.file instanceof File ? input.file : new File([input.file], input.fileName, { type: input.mimeType });
  formData.append('file', blob, input.fileName);
  return formData;
}

function toMilliseconds(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 1000));
}

export async function transcribeAudioWithOpenAI(input: TranscriptionInput): Promise<TranscriptionResult> {
  const apiKey = resolveApiKey();
  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: buildFormData(input),
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '');
    throw new Error(`OpenAI transcription failed (${response.status}): ${errorPayload}`);
  }

  const payload = (await response.json()) as OpenAITranscriptPayload;
  const segments = Array.isArray(payload.segments) ? payload.segments : [];

  return {
    text: payload.text ?? '',
    language: payload.language ?? null,
    durationMs: toMilliseconds(payload.duration),
    segments,
    raw: payload,
  };
}
