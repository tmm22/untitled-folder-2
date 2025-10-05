import { NextResponse } from 'next/server';
import type { ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { extractApiKey } from '@/app/api/_lib/providerAuth';

interface RouteParams {
  params: {
    provider: string;
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  const provider = params.provider as ProviderType;
  const apiKeyOverride = extractApiKey(request);

  try {
    const adapter = resolveProviderAdapter({ provider, apiKey: apiKeyOverride ?? undefined });
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
