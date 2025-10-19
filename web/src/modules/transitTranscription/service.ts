import type {
  TransitStreamPayload,
  TransitTranscriptionSource,
} from '@/modules/transitTranscription/types';

export interface StreamTranscriptionOptions {
  file: Blob;
  title?: string;
  source: TransitTranscriptionSource;
  languageHint?: string;
  cleanupInstruction?: string;
  cleanupLabel?: string;
  signal?: AbortSignal;
  onEvent: (payload: TransitStreamPayload) => void;
}

const DECODER = new TextDecoder();

function buildFormData(options: StreamTranscriptionOptions): FormData {
  const formData = new FormData();
  formData.append('file', options.file, options.file instanceof File ? options.file.name : 'audio.webm');
  formData.append('source', options.source);
  if (options.title) {
    formData.append('title', options.title);
  }
  if (options.languageHint) {
    formData.append('languageHint', options.languageHint);
  }
  if (options.cleanupInstruction) {
    formData.append('cleanupInstruction', options.cleanupInstruction);
  }
  if (options.cleanupLabel) {
    formData.append('cleanupLabel', options.cleanupLabel);
  }
  return formData;
}

function parseLines(buffer: string, emit: (payload: TransitStreamPayload) => void): string {
  let working = buffer;
  let newlineIndex = working.indexOf('\n');

  while (newlineIndex >= 0) {
    const candidate = working.slice(0, newlineIndex).trim();
    working = working.slice(newlineIndex + 1);

    if (candidate.length > 0) {
      try {
        const parsed = JSON.parse(candidate) as TransitStreamPayload;
        emit(parsed);
      } catch (error) {
        console.warn('Failed to parse transcription stream payload', error, candidate);
      }
    }

    newlineIndex = working.indexOf('\n');
  }

  return working;
}

export async function streamTransitTranscription(options: StreamTranscriptionOptions): Promise<void> {
  const response = await fetch('/api/transit/transcribe', {
    method: 'POST',
    body: buildFormData(options),
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Transcription request failed: ${errorText}`);
  }

  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += DECODER.decode(value, { stream: true });
    buffer = parseLines(buffer, options.onEvent);
  }

  if (buffer.trim().length > 0) {
    parseLines(buffer, options.onEvent);
  }
}
