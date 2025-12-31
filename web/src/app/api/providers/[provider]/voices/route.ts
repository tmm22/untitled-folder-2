import { NextResponse } from 'next/server';
import type { ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';

type ProviderRouteContext = {
  params: Promise<{
    provider?: string;
  }>;
};

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load voices';
  }
  if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('403')) {
    return 'Authentication failed. Please check your API key.';
  }
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    return 'Rate limit exceeded. Please try again later.';
  }
  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    return 'Request timed out. Please try again.';
  }
  return 'Unable to load voices';
}

export async function GET(request: Request, context: ProviderRouteContext) {
  const params = await context.params;
  const provider = params.provider as ProviderType | undefined;

  if (!provider) {
    return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
  }
  const authorization = await resolveProviderAuthorization(request, provider);

  try {
    const adapter = resolveProviderAdapter({
      provider,
      apiKey: authorization.apiKey,
      managedCredential: authorization.managedCredential,
    });
    const voices = await adapter.listVoices();
    return NextResponse.json(voices);
  } catch (error) {
    console.error('Failed to load voices', error);
    return NextResponse.json(
      {
        error: sanitizeErrorMessage(error),
      },
      { status: 400 },
    );
  }
}
