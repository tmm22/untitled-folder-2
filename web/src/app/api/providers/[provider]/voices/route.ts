import { NextResponse } from 'next/server';
import type { ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';
import { resolveRequestIdentity } from '@/lib/auth/identity';

const SUPPORTED_PROVIDERS: readonly ProviderType[] = ['openAI', 'elevenLabs', 'google', 'tightAss'];

function parseProvider(value: string | undefined): ProviderType | undefined {
  return SUPPORTED_PROVIDERS.find((candidate) => candidate === value);
}

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
  const provider = parseProvider(params.provider);

  if (!provider) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }
  const authorization = await resolveProviderAuthorization(request, provider);
  const identity = resolveRequestIdentity(request);

  try {
    // Unverified callers without their own key get the static voice lists;
    // live vendor listings on the server key require a verified identity.
    const adapter = resolveProviderAdapter({
      provider,
      apiKey: authorization.apiKey,
      managedCredential: authorization.managedCredential,
      allowServerKey: Boolean(identity.userId && identity.isVerified),
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
