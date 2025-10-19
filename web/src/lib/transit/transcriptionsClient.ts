import type { TransitTranscriptionRecord } from '@/modules/transitTranscription/types';

interface TransitTranscriptionsListResponse {
  records: TransitTranscriptionRecord[];
}

interface TransitTranscriptionSaveResponse {
  record: TransitTranscriptionRecord;
}

function ensureOk(response: Response): Response {
  if (!response.ok) {
    throw new Error(`Transit transcription request failed (${response.status})`);
  }
  return response;
}

export async function fetchTransitTranscriptions(): Promise<TransitTranscriptionRecord[]> {
  const response = await fetch('/api/transit/transcriptions', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 401) {
    return [];
  }

  const payload = (await ensureOk(response).json()) as TransitTranscriptionsListResponse;
  return (payload.records ?? []).map((record) => ({
    ...record,
    summary: record.summary ?? null,
    cleanup: record.cleanup ?? null,
    language: record.language ?? null,
  }));
}

export async function saveTransitTranscription(record: TransitTranscriptionRecord): Promise<void> {
  await ensureOk(
    await fetch('/api/transit/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    }),
  );
}

export async function removeTransitTranscription(id: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL('/api/transit/transcriptions', origin);
  url.searchParams.set('id', id);

  await ensureOk(
    await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export async function clearTransitTranscriptions(): Promise<void> {
  await ensureOk(
    await fetch('/api/transit/transcriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}
