import { NextResponse } from 'next/server';
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

  let payload: RealtimeTransitSessionRequest = {};
  try {
    payload = (await request.json()) as RealtimeTransitSessionRequest;
  } catch {
    payload = {};
  }

  try {
    const client = new OpenAIClient();
    const session = await client.createRealtimeSession({
      instructions: `Provide accurate live transcription for transit operations audio. Use concise punctuation. Language hint: ${payload.languageHint?.trim() || 'auto-detect'}.`,
      modalities: ['text', 'audio'],
      metadata: {
        surface: 'transit',
      },
    });

    return NextResponse.json({
      enabled: true,
      model: session.model ?? process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
      session,
      websocketUrl: process.env.OPENAI_REALTIME_WS_URL?.trim() || 'wss://api.openai.com/v1/realtime',
    });
  } catch (error) {
    const mapped = mapRealtimeError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
