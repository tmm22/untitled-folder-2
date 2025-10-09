import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getHistoryRepository } from './context';
import type { HistoryEntryPayload } from '@/lib/history/types';
import type { ProviderType } from '@/modules/tts/types';

const ENTRY_LIMIT = 100;

function createUnauthorizedResponse() {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

const PROVIDER_VALUES: ProviderType[] = ['openAI', 'elevenLabs', 'google', 'tightAss'];

function isValidProvider(value: string | null): value is ProviderType {
  return !!value && (PROVIDER_VALUES as string[]).includes(value);
}

function normalizeEntryPayload(identityUserId: string, raw: unknown): HistoryEntryPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const requiredString = (key: string) => {
    const value = candidate[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  };

  const id = requiredString('id');
  const providerValue = requiredString('provider');
  const voiceId = requiredString('voiceId');
  const text = requiredString('text');
  const createdAt = requiredString('createdAt');
  const durationMsValue = candidate.durationMs;

  if (!id || !isValidProvider(providerValue) || !voiceId || !text || !createdAt) {
    return null;
  }

  const durationMs = typeof durationMsValue === 'number' ? durationMsValue : Number(durationMsValue);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return {
    id,
    userId: identityUserId,
    provider: providerValue,
    voiceId,
    text,
    createdAt,
    durationMs,
    transcript: candidate.transcript as HistoryEntryPayload['transcript'],
  };
}

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return createUnauthorizedResponse();
  }

  try {
    const repository = getHistoryRepository();
    const entries = await repository.list(identity.userId, ENTRY_LIMIT);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Failed to load history entries', error);
    return NextResponse.json({ error: 'Unable to load history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return createUnauthorizedResponse();
  }

  let payload: { entry?: unknown };
  try {
    payload = (await request.json()) as { entry?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const normalized = normalizeEntryPayload(identity.userId, payload.entry);
  if (!normalized) {
    return NextResponse.json({ error: 'Invalid history entry' }, { status: 400 });
  }

  try {
    const repository = getHistoryRepository();
    await repository.record(normalized);
    return NextResponse.json({ entry: normalized });
  } catch (error) {
    console.error('Failed to record history entry', error);
    return NextResponse.json({ error: 'Unable to record history' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return createUnauthorizedResponse();
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim();

  try {
    const repository = getHistoryRepository();
    if (id) {
      await repository.remove(identity.userId, id);
      return NextResponse.json({ removed: id });
    }

    await repository.clear(identity.userId);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('Failed to update history entries', error);
    return NextResponse.json({ error: 'Unable to update history' }, { status: 500 });
  }
}
