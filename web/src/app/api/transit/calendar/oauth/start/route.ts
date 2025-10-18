import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import { buildOAuthUrl, createPkcePair } from '@/lib/transit/googleClient';
import { registerSession } from '@/app/api/_lib/sessionRegistry';

interface SessionPayload {
  userId: string;
  codeVerifier: string;
  createdAt: number;
}

function base64Encode(data: SessionPayload): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
}

export async function POST(request: Request) {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { verifier, challenge } = createPkcePair();
    const state = crypto.randomBytes(16).toString('hex');

    const payload: SessionPayload = {
      userId: identity.userId,
      codeVerifier: verifier,
      createdAt: Date.now(),
    };

    await registerSession(state, base64Encode(payload));
    const url = buildOAuthUrl(state, challenge);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Failed to initialise Google OAuth flow', error);
    return NextResponse.json({ error: 'Unable to start OAuth flow' }, { status: 500 });
  }
}
