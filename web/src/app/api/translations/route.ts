import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { getTranslationRepository } from './context';
import type { TranslateTextRequest } from '@/lib/translations/types';
import { translateDocumentText } from '@/lib/translations/service';

const MAX_PAGE_SIZE = 50;

function unauthorized() {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function normalizeLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, parsed));
}

function normalizeTranslatePayload(raw: unknown): TranslateTextRequest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;

  const translationId = isNonEmptyString(candidate.translationId) ? candidate.translationId.trim() : undefined;
  const text = isNonEmptyString(candidate.text) ? candidate.text.trim() : null;
  const targetLanguageCode = isNonEmptyString(candidate.targetLanguageCode)
    ? candidate.targetLanguageCode.trim()
    : null;
  const provider = isNonEmptyString(candidate.provider) ? candidate.provider.trim() : null;

  const keepOriginalValue = candidate.keepOriginalApplied;
  const keepOriginalApplied =
    typeof keepOriginalValue === 'boolean'
      ? keepOriginalValue
      : typeof keepOriginalValue === 'string'
        ? keepOriginalValue.toLowerCase() === 'true'
        : true;

  if (!text || !targetLanguageCode || !provider) {
    return null;
  }

  const metadata =
    candidate.metadata && typeof candidate.metadata === 'object' ? (candidate.metadata as Record<string, unknown>) : undefined;

  return {
    translationId,
    text,
    targetLanguageCode,
    keepOriginalApplied,
    provider,
    metadata,
  };
}

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get('documentId')?.trim();
  if (!documentId) {
    return badRequest('Missing documentId');
  }

  const cursor = url.searchParams.get('cursor')?.trim() || undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = normalizeLimit(limitParam);
  if (limitParam && limit === undefined) {
    return badRequest('Invalid limit parameter');
  }

  try {
    const repository = getTranslationRepository();
    const result = await repository.list(identity.userId, documentId, { cursor, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to load translations', error);
    return NextResponse.json({ error: 'Unable to load translations' }, { status: 500 });
  }
}

type TranslationAction =
  | { action: 'translate'; documentId: string; payload: TranslateTextRequest }
  | { action: 'promote'; documentId: string; translationId: string }
  | { action: 'clear'; documentId: string; keepLatest?: boolean }
  | { action: 'adopt'; documentId: string; translationId: string; collapseHistory?: boolean };

function normalizeActionPayload(raw: unknown): TranslationAction | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const actionValue = typeof candidate.action === 'string' ? candidate.action.trim().toLowerCase() : null;
  const documentId = isNonEmptyString(candidate.documentId) ? candidate.documentId.trim() : null;

  if (!actionValue || !documentId) {
    return null;
  }

  switch (actionValue) {
    case 'translate': {
      const payload = normalizeTranslatePayload(candidate.payload);
      if (!payload) {
        return null;
      }
      return { action: 'translate', documentId, payload };
    }
    case 'promote': {
      const translationId = isNonEmptyString(candidate.translationId) ? candidate.translationId.trim() : null;
      if (!translationId) {
        return null;
      }
      return { action: 'promote', documentId, translationId };
    }
    case 'clear': {
      const keepLatest = typeof candidate.keepLatest === 'boolean' ? candidate.keepLatest : undefined;
      return { action: 'clear', documentId, keepLatest };
    }
    case 'adopt': {
      const translationId = isNonEmptyString(candidate.translationId) ? candidate.translationId.trim() : null;
      if (!translationId) {
        return null;
      }
      const collapseHistory =
        typeof candidate.collapseHistory === 'boolean' ? candidate.collapseHistory : undefined;
      return { action: 'adopt', documentId, translationId, collapseHistory };
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return unauthorized();
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = await request.json();
  } catch {
    return badRequest('Invalid payload');
  }

  const action = normalizeActionPayload(payloadRaw);
  if (!action) {
    return badRequest('Invalid translation action');
  }

  const repository = getTranslationRepository();

  try {
    switch (action.action) {
      case 'translate': {
        const trimmedText = action.payload.text.trim();
        if (!trimmedText) {
          return badRequest('No text to translate');
        }

        const translatedText = await translateDocumentText(trimmedText, action.payload.targetLanguageCode);

        const result = await repository.create(identity.userId, action.documentId, {
          translationId: action.payload.translationId,
          sourceText: trimmedText,
          sourceLanguageCode: 'unknown',
          targetLanguageCode: action.payload.targetLanguageCode,
          translatedText,
          keepOriginalApplied: action.payload.keepOriginalApplied,
          provider: action.payload.provider,
          metadata: action.payload.metadata,
        });
        if (!result.translation) {
          return NextResponse.json({ error: 'Unable to create translation' }, { status: 500 });
        }
        return NextResponse.json(result);
      }
      case 'promote': {
        const result = await repository.promote(identity.userId, action.documentId, action.translationId);
        if (!result.translation) {
          return NextResponse.json({ error: 'Translation not found' }, { status: 404 });
        }
        return NextResponse.json(result);
      }
      case 'clear': {
        const deletedCount = await repository.clear(identity.userId, action.documentId, {
          keepLatest: action.keepLatest,
        });
        return NextResponse.json({ deletedCount });
      }
      case 'adopt': {
        const result = await repository.markAdopted(
          identity.userId,
          action.documentId,
          action.translationId,
          action.collapseHistory,
        );
        if (!result.translation) {
          return NextResponse.json({ translation: null, collapsed: result.collapsed }, { status: 404 });
        }
        return NextResponse.json(result);
      }
      default:
        return badRequest('Unsupported translation action');
    }
  } catch (error) {
    console.error('Failed to process translation action', error);
    return NextResponse.json({ error: 'Unable to process translation request' }, { status: 500 });
  }
}
