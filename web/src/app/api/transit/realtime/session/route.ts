import { NextResponse } from 'next/server';
import { isAuthFailure, requireVerifiedIdentity } from '../../../_lib/requireAuth';
import { OpenAIClient, OpenAIClientError, OpenAIUnavailableError } from '@/lib/openai/client';
import { isRealtimeTransitEnabled } from '@/lib/openai/featureFlags';

interface RealtimeTransitSessionRequest {
  languageHint?: string;
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

export async function POST(request: Request) {
  if (!isRealtimeTransitEnabled()) {
    return NextResponse.json(
      { error: 'Realtime transit transcription is disabled.' },
      { status: 404 },
    );
  }

  // Ephemeral tokens are billed against the server API key — never mint them
  // for anonymous callers.
  const auth = requireVerifiedIdentity(request);
  if (isAuthFailure(auth)) {
    return auth;
  }

  let payload: RealtimeTransitSessionRequest = {};
  try {
    payload = (await request.json()) as RealtimeTransitSessionRequest;
  } catch {
    payload = {};
  }

  void payload.languageHint;

  try {
    const client = new OpenAIClient();
    // Live transcription wants a transcription-type session (no audio output).
    const session = await client.createRealtimeSession({
      type: 'transcription',
      model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() || undefined,
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
