import { secureFetchJson } from '@/lib/fetch/secureFetch';
import { useCredentialStore } from '@/modules/credentials/store';
import { summarizeOnDevice, type SummaryEngine } from '@/lib/summarize/onDevice';
import type { ImportedEntry } from './store';

interface ImportResponse {
  title?: string;
  content?: string;
  summary?: string;
  summaryEngine?: SummaryEngine;
  error?: string;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    return await useCredentialStore.getState().actions.getAuthHeaders('openAI');
  } catch (error) {
    console.error('Unable to prepare auth headers for import', error);
    return {};
  }
}

export async function importFromUrl(url: string): Promise<ImportResponse> {
  try {
    const headers = await buildAuthHeaders();
    const response = await secureFetchJson<ImportResponse>('/api/imports', {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers,
      // Same-origin cookies carry the Clerk session for the verified-identity check.
      credentials: 'same-origin',
    });

    // Callers without an OpenAI entitlement get content only; produce a free
    // on-device summary so imports work without any account or API key.
    if (!response.error && response.content && !response.summary) {
      const onDevice = await summarizeOnDevice(response.content, { title: response.title });
      if (onDevice.summary) {
        return { ...response, summary: onDevice.summary, summaryEngine: onDevice.engine };
      }
    }

    return response;
  } catch (error) {
    console.error('Import failed', error);
    return { error: error instanceof Error ? error.message : 'Unable to import content' };
  }
}

export function buildImportedEntry(input: {
  id: string;
  source: string;
  title?: string;
  content: string;
  summary?: string;
  summaryEngine?: SummaryEngine;
}): ImportedEntry {
  return {
    id: input.id,
    source: input.source,
    title: input.title ?? input.source,
    content: input.content,
    summary: input.summary,
    summaryEngine: input.summary ? input.summaryEngine : undefined,
    createdAt: new Date().toISOString(),
  };
}
