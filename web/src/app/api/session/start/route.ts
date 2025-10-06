import { NextResponse } from 'next/server';
import { registerSession } from '@/app/api/_lib/sessionRegistry';

interface SessionStartPayload {
  sessionId?: string;
  secret?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SessionStartPayload;
  const sessionId = body.sessionId?.trim();
  const secret = body.secret?.trim();

  if (!sessionId || !secret) {
    return NextResponse.json({ error: 'Missing sessionId or secret' }, { status: 400 });
  }

  if (secret.length < 32) {
    return NextResponse.json({ error: 'Secret is too short' }, { status: 400 });
  }

  await registerSession(sessionId, secret);
  return NextResponse.json({ ok: true });
}
