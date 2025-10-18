import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { transcribeAudioWithOpenAI } from '@/lib/transit/openaiTranscription';
import { generateTranscriptInsights } from '@/lib/pipelines/openai';
import {
  type TransitStreamPayload,
  type TransitTranscriptSegment,
  type TransitTranscriptionRecord,
  type TransitTranscriptionSource,
} from '@/modules/transitTranscription/types';
import { getTransitTranscriptionRepository } from '@/lib/transit/repository';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();

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
  const identity = resolveRequestIdentity(request);

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

  const source = normalizeSource(form.get('source'));
  const title = normalizeTitle(form.get('title'));
  const languageHintRaw = form.get('languageHint');
  const languageHint =
    typeof languageHintRaw === 'string' ? languageHintRaw.trim() || undefined : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, { event: 'status', data: { stage: 'received' } });
      try {
        sendEvent(controller, { event: 'status', data: { stage: 'transcribing' } });

        const audioBuffer = await fileEntry.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);
        const audioFile = new File([audioBytes], fileEntry.name || `transit-audio-${Date.now()}.wav`, {
          type: fileEntry.type || 'audio/wav',
        });

        const transcription = await transcribeAudioWithOpenAI({
          file: audioFile,
          fileName: audioFile.name,
          mimeType: audioFile.type,
          language: languageHint,
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
        const insights = await generateTranscriptInsights(transcription.text);
        if (insights) {
          sendEvent(controller, { event: 'summary', data: insights });
        }

        const record: TransitTranscriptionRecord = {
          id: randomUUID(),
          title,
          transcript: transcription.text,
          segments,
          summary: insights,
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
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Transcription failed';
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
