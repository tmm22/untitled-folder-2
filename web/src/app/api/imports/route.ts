import { NextResponse } from 'next/server';
import { isAuthFailure, requireVerifiedIdentity } from '../_lib/requireAuth';
import { resolveProviderAuthorization } from '../_lib/providerAuth';
import { fetchReadableContent } from '@/lib/imports/fetcher';
import { summariseTextEnriched } from '@/lib/pipelines/openai';
import type { SummaryEnrichment } from '@/lib/summarize/types';

interface ImportRequestBody {
  url?: string;
}

export async function POST(request: Request) {
  // Imports trigger server-side fetches; restrict to verified identities.
  const auth = requireVerifiedIdentity(request);
  if (isAuthFailure(auth)) {
    return auth;
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const { title, content } = await fetchReadableContent(rawUrl);

    if (!content) {
      return NextResponse.json({ error: 'No readable content found' }, { status: 422 });
    }

    // OpenAI enrichment runs only for callers with their own entitlement:
    // BYOK keys are used directly; managed (provisioned) credentials spend the
    // server key. Everyone else gets content only and the client produces a
    // free on-device enrichment.
    const authorization = await resolveProviderAuthorization(request, 'openAI');
    let enrichment: SummaryEnrichment | undefined;
    if (authorization.apiKey) {
      enrichment = await summariseTextEnriched(content, { apiKey: authorization.apiKey });
    } else if (authorization.managedCredential) {
      enrichment = await summariseTextEnriched(content);
    }

    return NextResponse.json({
      title,
      content,
      summary: enrichment?.summary,
      keyPoints: enrichment?.keyPoints,
      tags: enrichment?.tags,
      summaryEngine: enrichment ? 'openai' : undefined,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Import failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
