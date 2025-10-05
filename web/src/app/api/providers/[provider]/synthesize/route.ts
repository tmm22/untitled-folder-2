import { NextResponse } from 'next/server';
import type { ProviderSynthesisPayload, ProviderType } from '@/modules/tts/types';
import { resolveProviderAdapter } from '@/lib/providers';
import { extractApiKey } from '@/app/api/_lib/providerAuth';

interface RouteParams {
  params: {
    provider: string;
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  const provider = params.provider as ProviderType;
  let payload: ProviderSynthesisPayload;

  try {
    payload = (await request.json()) as ProviderSynthesisPayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.text || !payload.voiceId || !payload.settings) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const apiKeyOverride = extractApiKey(request);

  try {
    const adapter = resolveProviderAdapter({ provider, apiKey: apiKeyOverride ?? undefined });
    const result = await adapter.synthesize(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to synthesize speech',
      },
      { status: 500 },
    );
  }
}
