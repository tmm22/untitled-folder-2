import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getTransitTranscriptionRepository } from '@/lib/transit/repository';
import type { TransitTranscriptSegment, TransitTranscriptionRecord } from '@/modules/transitTranscription/types';

const SOURCE_VALUES = new Set<TransitTranscriptionRecord['source']>(['microphone', 'upload']);

interface RawRecordPayload {
  record?: unknown;
}

function isValidSegment(value: unknown): value is TransitTranscriptSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const index = candidate.index;
  const startMs = candidate.startMs;
  const endMs = candidate.endMs;
  const text = candidate.text;
  return (
    typeof index === 'number' &&
    Number.isFinite(index) &&
    index >= 0 &&
    typeof startMs === 'number' &&
    Number.isFinite(startMs) &&
    startMs >= 0 &&
    typeof endMs === 'number' &&
    Number.isFinite(endMs) &&
    endMs >= startMs &&
    typeof text === 'string' &&
    text.trim().length > 0
  );
}

function normalizeSummary(value: unknown): TransitTranscriptionRecord['summary'] {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const summary = candidate.summary;
  const actionItems = candidate.actionItems;
  const scheduleRecommendation = candidate.scheduleRecommendation;

  if (typeof summary !== 'string' || summary.trim().length === 0) {
    return null;
  }

  const normalizedActionItems = Array.isArray(actionItems)
    ? actionItems
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const actionCandidate = item as Record<string, unknown>;
          const text = actionCandidate.text;
          if (typeof text !== 'string' || text.trim().length === 0) {
            return null;
          }
          const ownerHint = actionCandidate.ownerHint;
          const dueDateHint = actionCandidate.dueDateHint;
          return {
            text: text.trim(),
            ownerHint: typeof ownerHint === 'string' && ownerHint.trim().length > 0 ? ownerHint.trim() : undefined,
            dueDateHint:
              typeof dueDateHint === 'string' && dueDateHint.trim().length > 0 ? dueDateHint.trim() : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  let normalizedSchedule: NonNullable<TransitTranscriptionRecord['summary']>['scheduleRecommendation'] = null;
  if (scheduleRecommendation && typeof scheduleRecommendation === 'object') {
    const scheduleCandidate = scheduleRecommendation as Record<string, unknown>;
    const title = scheduleCandidate.title;
    if (typeof title === 'string' && title.trim().length > 0) {
      const startWindow = scheduleCandidate.startWindow;
      const durationMinutes = scheduleCandidate.durationMinutes;
      const participants = scheduleCandidate.participants;
      normalizedSchedule = {
        title: title.trim(),
        startWindow:
          typeof startWindow === 'string' && startWindow.trim().length > 0 ? startWindow.trim() : undefined,
        durationMinutes:
          typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0
            ? durationMinutes
            : undefined,
        participants: Array.isArray(participants)
          ? participants
              .map((participant) => (typeof participant === 'string' ? participant.trim() : ''))
              .filter((participant) => participant.length > 0)
          : undefined,
      };
    }
  }

  return {
    summary: summary.trim(),
    actionItems: normalizedActionItems,
    scheduleRecommendation: normalizedSchedule,
  };
}

function normalizeRecord(identityUserId: string, raw: RawRecordPayload['record']): TransitTranscriptionRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : null;
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const transcript = typeof candidate.transcript === 'string' ? candidate.transcript.trim() : '';
  const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt.trim() : '';
  const durationMsValue = candidate.durationMs;
  const sourceValue = typeof candidate.source === 'string' ? candidate.source.trim() : '';
  const segmentsValue = candidate.segments;

  if (!id || title.length === 0 || transcript.length === 0 || createdAt.length === 0) {
    return null;
  }

  if (!SOURCE_VALUES.has(sourceValue as TransitTranscriptionRecord['source'])) {
    return null;
  }

  const durationMs =
    typeof durationMsValue === 'number' && Number.isFinite(durationMsValue) && durationMsValue >= 0
      ? durationMsValue
      : Number(durationMsValue);

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  if (!Array.isArray(segmentsValue)) {
    return null;
  }

  const segments = segmentsValue.filter(isValidSegment) as TransitTranscriptSegment[];
  if (segments.length === 0) {
    return null;
  }

  const summary = normalizeSummary(candidate.summary);
  const languageRaw = candidate.language;
  const language =
    typeof languageRaw === 'string' && languageRaw.trim().length > 0 ? languageRaw.trim() : null;
  const confidenceRaw = candidate.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) && confidenceRaw >= 0
      ? confidenceRaw
      : undefined;

  return {
    id,
    title,
    transcript,
    segments,
    summary,
    language,
    durationMs,
    confidence,
    createdAt,
    source: sourceValue as TransitTranscriptionRecord['source'],
  };
}

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const repository = getTransitTranscriptionRepository();
    const records = await repository.list(identity.userId);
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to list transit transcriptions', error);
    return NextResponse.json({ error: 'Unable to load transcripts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: RawRecordPayload;
  try {
    payload = (await request.json()) as RawRecordPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const record = normalizeRecord(identity.userId, payload.record);
  if (!record) {
    return NextResponse.json({ error: 'Invalid transcript record' }, { status: 400 });
  }

  try {
    const repository = getTransitTranscriptionRepository();
    await repository.save(identity.userId, record);
    return NextResponse.json({ record });
  } catch (error) {
    console.error('Failed to persist transit transcription', error);
    return NextResponse.json({ error: 'Unable to persist transcript' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const transcriptId = url.searchParams.get('id')?.trim();

  try {
    const repository = getTransitTranscriptionRepository();
    if (transcriptId) {
      await repository.remove(identity.userId, transcriptId);
      return NextResponse.json({ removed: transcriptId });
    }
    await repository.clear(identity.userId);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('Failed to update transit transcripts', error);
    return NextResponse.json({ error: 'Unable to update transcripts' }, { status: 500 });
  }
}
