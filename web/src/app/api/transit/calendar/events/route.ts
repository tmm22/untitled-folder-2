import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getCalendarTokenStore } from '@/lib/transit/calendarTokenStore';
import { createCalendarEvent, refreshAccessToken } from '@/lib/transit/googleClient';

interface CalendarEventPayload {
  title?: unknown;
  startWindow?: unknown;
  durationMinutes?: unknown;
  participants?: unknown;
  notes?: unknown;
  transcriptId?: unknown;
}

const MAX_PARTICIPANTS = 12;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_TIME_ZONE = process.env.TRANSIT_CALENDAR_DEFAULT_TIMEZONE?.trim() || 'UTC';

function normalizePayload(raw: CalendarEventPayload) {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const startWindow =
    typeof raw.startWindow === 'string' && raw.startWindow.trim().length > 0 ? raw.startWindow.trim() : undefined;
  const durationMinutes =
    typeof raw.durationMinutes === 'number' && Number.isFinite(raw.durationMinutes)
      ? Math.max(0, Math.round(raw.durationMinutes))
      : undefined;
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : undefined;
  const transcriptId =
    typeof raw.transcriptId === 'string' && raw.transcriptId.trim().length > 0 ? raw.transcriptId.trim() : undefined;

  const participants =
    Array.isArray(raw.participants) && raw.participants.length > 0
      ? raw.participants
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry) => entry.length > 0)
          .slice(0, MAX_PARTICIPANTS)
      : [];

  if (!title) {
    return null;
  }

  return {
    title,
    startWindow,
    durationMinutes,
    participants,
    notes,
    transcriptId,
  };
}

function parseStartWindow(raw: string | undefined): Date | null {
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
}

function resolveEventWindow(startWindow: string | undefined, durationMinutes: number): { start: Date; end: Date } {
  const start = parseStartWindow(startWindow) ?? new Date(Date.now() + 30 * 60 * 1000);
  const end = new Date(start.getTime() + Math.max(15, durationMinutes) * 60 * 1000);
  return { start, end };
}

function buildDescription(input: {
  notes?: string;
  startWindow?: string;
  transcriptId?: string;
}): string | undefined {
  const lines: string[] = [];
  if (input.notes) {
    lines.push(input.notes);
  }
  if (input.startWindow && !parseStartWindow(input.startWindow)) {
    lines.push(`Preferred window: ${input.startWindow}`);
  }
  if (input.transcriptId) {
    lines.push(`Transit transcription ID: ${input.transcriptId}`);
  }
  if (lines.length === 0) {
    return undefined;
  }
  return lines.join('\n\n');
}

async function ensureAccessToken(userId: string) {
  const store = getCalendarTokenStore();
  const tokens = await store.get(userId);
  if (!tokens) {
    return null;
  }
  if (tokens.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return tokens;
  }
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  await store.save(userId, refreshed);
  return refreshed;
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: CalendarEventPayload;
  try {
    payload = (await request.json()) as CalendarEventPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const normalized = normalizePayload(payload);
  if (!normalized) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  try {
    const tokens = await ensureAccessToken(identity.userId);
    if (!tokens) {
      return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 403 });
    }

    const participants = normalized.participants;
    const duration = normalized.durationMinutes ?? 30;
    const window = resolveEventWindow(normalized.startWindow, duration);
    const event = await createCalendarEvent(tokens.accessToken, {
      summary: normalized.title,
      description: buildDescription({
        notes: normalized.notes,
        startWindow: normalized.startWindow,
        transcriptId: normalized.transcriptId,
      }),
      startDateTime: window.start.toISOString(),
      endDateTime: window.end.toISOString(),
      timeZone: DEFAULT_TIME_ZONE,
      attendees: participants,
    });

    return NextResponse.json(
      {
        status: 'scheduled',
        event,
      },
      { status: 201 },
    );
  } catch (calendarError) {
    console.error('Google Calendar event scheduling failed', calendarError);
    return NextResponse.json(
      { error: calendarError instanceof Error ? calendarError.message : 'Calendar scheduling failed' },
      { status: 502 },
    );
  }
}
