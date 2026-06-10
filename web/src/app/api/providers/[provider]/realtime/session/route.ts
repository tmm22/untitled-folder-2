import { NextResponse } from 'next/server';
import type { ProviderType } from '@/modules/tts/types';
import { resolveProviderAuthorization } from '@/app/api/_lib/providerAuth';
import { isAuthFailure, requireVerifiedIdentity } from '@/app/api/_lib/requireAuth';
import { OpenAIClient, OpenAIClientError, OpenAIUnavailableError } from '@/lib/openai/client';
import { isRealtimeTTSEnabled } from '@/lib/openai/featureFlags';

type ProviderRouteContext = {
  params: Promise<{
    provider?: string;
  }>;
};

interface RealtimeProviderSessionRequest {
  voice?: string;
}

function mapRealtimeError(error: unknown): { message: string; status: number } {
  if (error instanceof OpenAIUnavailableError) {
    return { message: error.message, status: 503 };
  }
  if (error instanceof OpenAIClientError) {
    return { message: error.message, status: error.status ?? 502 };
  }
  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }
  return { message: 'Unable to bootstrap realtime session', status: 500 };
}

export async function POST(request: Request, context: ProviderRouteContext) {
  const params = await context.params;
  const provider = params.provider as ProviderType | undefined;
  if (!provider) {
    return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
  }

  if (provider !== 'openAI') {
    return NextResponse.json({ error: 'Realtime sessions are currently available for OpenAI only.' }, { status: 400 });
  }

  if (!isRealtimeTTSEnabled()) {
    return NextResponse.json({ error: 'Realtime TTS is disabled.' }, { status: 404 });
  }

  let requestBody: RealtimeProviderSessionRequest = {};
  try {
    requestBody = (await request.json()) as RealtimeProviderSessionRequest;
  } catch {
    requestBody = {};
  }

  const auth = await resolveProviderAuthorization(request, provider);
  // Managed-provisioning tokens are pseudo tokens for usage accounting — they
  // are NOT OpenAI API keys and must never be sent upstream. Realtime minting
  // uses the caller's own key (BYOK) or the server key.
  const byokKey = auth.apiKey?.trim();
  const apiKey = byokKey || process.env.OPENAI_API_KEY?.trim();

  if (!byokKey) {
    // Spending the server key requires a verified identity.
    const verified = requireVerifiedIdentity(request);
    if (isAuthFailure(verified)) {
      return verified;
    }
  }

  try {
    const client = new OpenAIClient({ apiKey });
    const session = await client.createRealtimeSession({
      type: 'realtime',
      voice: requestBody.voice?.trim(),
      instructions: 'You are assisting with a live narration studio voice session. Keep responses concise and natural.',
      outputModalities: ['audio'],
      signal: request.signal,
    });

    return NextResponse.json({
      enabled: true,
      model: session.model,
      clientSecret: session.clientSecret,
      expiresAt: session.expiresAt,
      websocketUrl: process.env.OPENAI_REALTIME_WS_URL?.trim() || 'wss://api.openai.com/v1/realtime',
    });
  } catch (error) {
    const mapped = mapRealtimeError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
