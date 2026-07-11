import { NextResponse } from 'next/server';
import { registerSession } from '@/app/api/_lib/sessionRegistry';

interface SessionStartPayload {
  sessionId?: string;
  secret?: string;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 512) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }
  let body: SessionStartPayload;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 512) {
      return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
    }
    body = JSON.parse(rawBody) as SessionStartPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim();
  const secret = body.secret?.trim();

  if (!sessionId || !secret) {
    return NextResponse.json({ error: 'Missing sessionId or secret' }, { status: 400 });
  }

  const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Pattern.test(sessionId) || Buffer.from(sessionId, 'base64').byteLength !== 18) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  if (!base64Pattern.test(secret) || Buffer.from(secret, 'base64').byteLength !== 32) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 400 });
  }

  await registerSession(sessionId, secret);
  return NextResponse.json({ ok: true });
}
