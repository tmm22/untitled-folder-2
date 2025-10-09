import type { HistoryEntry } from '@/modules/history/store';

interface RawHistoryEntry extends HistoryEntry {
  userId?: string;
}

interface HistoryListResponse {
  entries: RawHistoryEntry[];
}

interface HistoryRecordResponse {
  entry: HistoryEntry;
}

function ensureOk(response: Response): Response {
  if (!response.ok) {
    throw new Error(`History request failed (${response.status})`);
  }
  return response;
}

export async function fetchHistoryEntries(): Promise<HistoryEntry[]> {
  const response = await fetch('/api/history', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 401) {
    return [];
  }

  const payload = (await ensureOk(response).json()) as HistoryListResponse;
  return (payload.entries ?? []).map((entry) => ({
    id: entry.id,
    provider: entry.provider,
    voiceId: entry.voiceId,
    text: entry.text,
    createdAt: entry.createdAt,
    durationMs: entry.durationMs,
    transcript: entry.transcript,
  }));
}

export async function recordHistoryEntry(entry: HistoryEntry): Promise<void> {
  await ensureOk(
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry }),
    }),
  );
}

export async function removeHistoryEntry(id: string): Promise<void> {
  const url = new URL('/api/history', window.location.origin);
  url.searchParams.set('id', id);

  await ensureOk(
    await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export async function clearHistoryEntries(): Promise<void> {
  await ensureOk(
    await fetch('/api/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}
