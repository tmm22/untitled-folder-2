import { NextResponse } from 'next/server';
import { isAuthFailure, requireVerifiedIdentity } from '../_lib/requireAuth';
import { resolveProviderAuthorization } from '../_lib/providerAuth';
import { fetchReadableContent } from '@/lib/imports/fetcher';
import { summariseText } from '@/lib/pipelines/openai';

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

    // OpenAI summarisation runs only for callers with their own entitlement:
    // BYOK keys are used directly; managed (provisioned) credentials spend the
    // server key. Everyone else gets content only and the client produces a
    // free on-device summary.
    const authorization = await resolveProviderAuthorization(request, 'openAI');
    let summary: string | undefined;
    let summaryEngine: 'openai' | undefined;
    if (authorization.apiKey) {
      summary = await summariseText(content, { apiKey: authorization.apiKey });
    } else if (authorization.managedCredential) {
      summary = await summariseText(content);
    }
    if (summary) {
      summaryEngine = 'openai';
    }

    return NextResponse.json({
      title,
      content,
      summary,
      summaryEngine,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Import failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
