import { NextResponse } from 'next/server';
import type { ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';

type ProviderRouteContext = {
  params: Promise<{
    provider?: string;
  }>;
};

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load voices',
      },
      { status: 400 },
    );
  }
}
