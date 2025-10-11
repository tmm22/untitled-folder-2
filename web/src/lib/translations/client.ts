import type {
  MarkAdoptedResult,
  PromoteResult,
  TranslateTextRequest,
  TranslationListResult,
  TranslationRecord,
} from './types';

const BASE_URL = '/api/translations';

interface TranslateResponse {
  translation: TranslationRecord | null;
  historySize: number;
}

function ensureOk(response: Response): Response {
  if (!response.ok) {
    throw new Error(`Translations request failed (${response.status})`);
  }
  return response;
}

function buildUrl(documentId: string, params?: { cursor?: string; limit?: number }): string {
  const searchParams = new URLSearchParams();
  searchParams.set('documentId', documentId);
  if (params?.cursor) {
    searchParams.set('cursor', params.cursor);
  }
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    searchParams.set('limit', String(Math.floor(Math.max(1, params.limit))));
  }
  const query = searchParams.toString();
  return query ? `${BASE_URL}?${query}` : BASE_URL;
}

async function postAction<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await ensureOk(response).json()) as T;
}

export async function fetchTranslations(
  documentId: string,
  options?: { cursor?: string; limit?: number },
): Promise<TranslationListResult> {
  const response = await fetch(buildUrl(documentId, options), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  return (await ensureOk(response).json()) as TranslationListResult;
}

export async function createTranslation(
  documentId: string,
  payload: TranslateTextRequest,
): Promise<TranslateResponse> {
  return await postAction<TranslateResponse>({
    action: 'translate',
    documentId,
    payload,
  });
}

export async function promoteTranslation(
  documentId: string,
  translationId: string,
): Promise<PromoteResult> {
  return await postAction<PromoteResult>({
    action: 'promote',
    documentId,
    translationId,
  });
}

export async function clearTranslations(
  documentId: string,
  keepLatest?: boolean,
): Promise<{ deletedCount: number }> {
  return await postAction<{ deletedCount: number }>({
    action: 'clear',
    documentId,
    keepLatest,
  });
}

export async function markTranslationAdopted(
  documentId: string,
  translationId: string,
  collapseHistory?: boolean,
): Promise<MarkAdoptedResult> {
  return await postAction<MarkAdoptedResult>({
    action: 'adopt',
    documentId,
    translationId,
    collapseHistory,
  });
}
