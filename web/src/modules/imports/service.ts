import { secureFetchJson } from '@/lib/fetch/secureFetch';
import type { ImportedEntry } from './store';

interface ImportResponse {
  title?: string;
  content?: string;
  summary?: string;
  error?: string;
}

export async function importFromUrl(url: string): Promise<ImportResponse> {
  try {
    return await secureFetchJson<ImportResponse>('/api/imports', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
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
}): ImportedEntry {
  return {
    id: input.id,
    source: input.source,
    title: input.title ?? input.source,
    content: input.content,
    summary: input.summary,
    createdAt: new Date().toISOString(),
  };
}
