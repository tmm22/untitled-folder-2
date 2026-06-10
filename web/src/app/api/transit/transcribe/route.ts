import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { isAuthFailure, requireVerifiedIdentity } from '../../_lib/requireAuth';
import { transcribeAudioWithOpenAI } from '@/lib/transit/openaiTranscription';
import { applyTranscriptCleanup, generateTranscriptInsights } from '@/lib/pipelines/openai';
import { OpenAIClientError, OpenAIUnavailableError } from '@/lib/openai/client';
import {
  type TransitCleanupResult,
  type TransitStreamPayload,
  type TransitTranscriptSegment,
  type TransitTranscriptionRecord,
  type TransitTranscriptionSource,
} from '@/modules/transitTranscription/types';
import { getTransitTranscriptionRepository } from '@/lib/transit/repository';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();

// Containers OpenAI transcription accepts; checked against the uploaded MIME
// type (when present) and the file extension as a fallback.
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'video/webm',
  'video/mp4',
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  'wav',
  'mp3',
  'mpga',
  'mpeg',
  'mp4',
  'm4a',
  'aac',
  'webm',
  'ogg',
  'oga',
  'flac',
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

function normalizeMimeType(raw: string | undefined): string {
  return (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function extensionOf(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex + 1).toLowerCase();
}

function isAllowedAudioUpload(file: File): boolean {
  const mime = normalizeMimeType(file.type);
  if (mime) {
    return ALLOWED_AUDIO_MIME_TYPES.has(mime);
  }
  return ALLOWED_AUDIO_EXTENSIONS.has(extensionOf(file.name ?? ''));
}

/** Build an upload filename whose extension matches the actual MIME type. */
function buildUploadFileName(file: File): string {
  const mime = normalizeMimeType(file.type);
  const preferredExtension = EXTENSION_BY_MIME[mime];
  const currentName = file.name?.trim() || '';
  const currentExtension = extensionOf(currentName);

  if (currentName && currentExtension && (!preferredExtension || currentExtension === preferredExtension)) {
    return currentName;
  }

  const base = currentName ? currentName.replace(/\.[^.]*$/, '') : `transit-audio-${Date.now()}`;
  return `${base}.${preferredExtension ?? currentExtension ?? 'webm'}`;
}

function sanitizeTranscriptionError(error: unknown): string {
  if (error instanceof OpenAIUnavailableError) {
    return 'OpenAI is not configured for transcription.';
  }

  if (error instanceof OpenAIClientError) {
    if (error.status === 401 || error.status === 403) {
      return 'OpenAI authentication failed. Check your API key.';
    }
    if (error.status === 413) {
      return 'Audio file exceeds provider limits. Use a smaller file.';
    }
    if (error.status === 415) {
      return 'Unsupported audio format. Please upload a common audio format such as WAV or MP3.';
    }
    if (error.status === 429) {
      return 'OpenAI rate limit exceeded. Please retry in a moment.';
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Transcription failed';
}

function normalizeSource(value: FormDataEntryValue | null): TransitTranscriptionSource {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized === 'microphone') {
    return 'microphone';
  }
  return 'upload';
}

function normalizeTitle(raw: FormDataEntryValue | null): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length > 0) {
    return text.slice(0, 180);
  }
  const stamp = new Date().toISOString().split('T')[0] ?? 'today';
  return `Transit transcription ${stamp}`;
}

function sendEvent(controller: ReadableStreamDefaultController, payload: TransitStreamPayload) {
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

function toSegment(segment: { text: string; start?: number; end?: number }, index: number): TransitTranscriptSegment {
  const startMs = segment.start ? Math.max(0, Math.round(segment.start * 1000)) : index * 4000;
  const endMs = segment.end ? Math.max(startMs, Math.round(segment.end * 1000)) : startMs + 3500;
  return {
    index: index + 1,
    startMs,
    endMs,
    text: segment.text.trim(),
  };
}

export async function POST(request: Request) {
  // Transcription burns server-paid OpenAI quota — verified identities only.
  const identity = requireVerifiedIdentity(request);
  if (isAuthFailure(identity)) {
    return identity;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 });
  }

  const fileEntry = form.get('file');
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
  }

  const size = fileEntry.size ?? 0;
  if (size <= 0 || size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'Audio file size is invalid or exceeds 25 MB limit' }, { status: 413 });
  }

  if (!isAllowedAudioUpload(fileEntry)) {
    return NextResponse.json(
      { error: 'Unsupported audio format. Please upload a common audio format such as WAV, MP3, M4A, WEBM, OGG, or FLAC.' },
      { status: 415 },
    );
  }

  const source = normalizeSource(form.get('source'));
  const title = normalizeTitle(form.get('title'));
  const languageHintRaw = form.get('languageHint');
  const languageHint =
    typeof languageHintRaw === 'string' ? languageHintRaw.trim() || undefined : undefined;
  const cleanupInstructionRaw = form.get('cleanupInstruction');
  const cleanupInstruction =
    typeof cleanupInstructionRaw === 'string' ? cleanupInstructionRaw.trim() : '';
  const cleanupLabelRaw = form.get('cleanupLabel');
  const cleanupLabel = typeof cleanupLabelRaw === 'string' ? cleanupLabelRaw.trim() : '';

  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, { event: 'status', data: { stage: 'received' } });
      try {
        sendEvent(controller, { event: 'status', data: { stage: 'transcribing' } });

        const audioBuffer = await fileEntry.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);
        const uploadName = buildUploadFileName(fileEntry);
        const audioFile = new File([audioBytes], uploadName, {
          type: normalizeMimeType(fileEntry.type) || 'audio/webm',
        });

        const transcription = await transcribeAudioWithOpenAI({
          file: audioFile,
          fileName: audioFile.name,
          mimeType: audioFile.type,
          language: languageHint,
          signal: request.signal,
        });

        audioBytes.fill(0);
        form.delete('file');

        const segments: TransitTranscriptSegment[] = transcription.segments
          .filter((segment) => typeof segment.text === 'string' && segment.text.trim().length > 0)
          .map((segment, index) => toSegment(segment, index));

        for (const segment of segments) {
          sendEvent(controller, { event: 'segment', data: segment });
        }

        sendEvent(controller, { event: 'status', data: { stage: 'summarising' } });
        const insights = await generateTranscriptInsights(transcription.text, request.signal);
        if (insights) {
          sendEvent(controller, { event: 'summary', data: insights });
        }

        let cleanup: TransitCleanupResult | null = null;
        if (cleanupInstruction.length > 0) {
          sendEvent(controller, { event: 'status', data: { stage: 'cleaning' } });
          try {
            const cleaned = await applyTranscriptCleanup(
              transcription.text,
              { instruction: cleanupInstruction },
              request.signal,
            );
            const normalized = cleaned.trim().length > 0 ? cleaned.trim() : transcription.text;
            cleanup = {
              instruction: cleanupInstruction,
              output: normalized,
              label: cleanupLabel.length > 0 ? cleanupLabel : undefined,
            };
          } catch (cleanupError) {
            console.error('Transit transcript cleanup failed', cleanupError);
            cleanup = {
              instruction: cleanupInstruction,
              output: transcription.text,
              label: cleanupLabel.length > 0 ? cleanupLabel : undefined,
            };
          }

          if (cleanup) {
            sendEvent(controller, { event: 'cleanup', data: cleanup });
          }
        }

        const record: TransitTranscriptionRecord = {
          id: randomUUID(),
          title,
          transcript: transcription.text,
          segments,
          summary: insights,
          cleanup,
          language: transcription.language ?? null,
          durationMs: transcription.durationMs,
          createdAt: new Date().toISOString(),
          source,
          confidence: (() => {
            const confidences =
              transcription.segments
                .map((segment) =>
                  typeof segment.avg_logprob === 'number' ? segment.avg_logprob : undefined,
                )
                .filter((value): value is number => value !== undefined) ?? [];
            if (confidences.length === 0) {
              return undefined;
            }
            const average = confidences.reduce((total, value) => total + value, 0) / confidences.length;
            const normalized = Math.max(0, Math.min(1, 1 + average / 5));
            return Number.isFinite(normalized) ? Number(normalized.toFixed(2)) : undefined;
          })(),
        };

        if (identity.userId) {
          sendEvent(controller, { event: 'status', data: { stage: 'persisting' } });
          try {
            const repository = getTransitTranscriptionRepository();
            await repository.save(identity.userId, record);
          } catch (persistError) {
            console.warn('Failed to persist transit transcription for user', persistError);
          }
        }

        sendEvent(controller, { event: 'status', data: { stage: 'complete' } });
        sendEvent(controller, { event: 'complete', data: record });
      } catch (error) {
        const message = sanitizeTranscriptionError(error);
        sendEvent(controller, { event: 'error', data: { message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  });
}
