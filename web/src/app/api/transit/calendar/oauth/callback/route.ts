import { NextResponse } from 'next/server';
import { resolveSessionSecret, clearSession } from '@/app/api/_lib/sessionRegistry';
import { exchangeAuthorizationCode, type OAuthTokens } from '@/lib/transit/googleClient';
import { getCalendarTokenStore } from '@/lib/transit/calendarTokenStore';

interface SessionPayload {
  userId: string;
  codeVerifier: string;
  createdAt: number;
}

function decodeSessionPayload(secret: Uint8Array | null): SessionPayload | null {
  if (!secret) {
    return null;
  }
  try {
    const buffer = Buffer.from(secret);
    const parsed = JSON.parse(buffer.toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.userId !== 'string') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to decode Google OAuth session payload', error);
    return null;
  }
}

function resolveRedirectUrl(outcome: 'success' | 'error' = 'success'): string {
  const base = process.env.TRANSIT_CALENDAR_POST_CONNECT_REDIRECT?.trim() || '/transit';
  const url = new URL(base, process.env.APP_BASE_URL?.trim() || 'http://localhost:3000');
  url.searchParams.set('calendar', outcome);
  return url.toString();
}

async function persistTokens(userId: string, tokens: OAuthTokens): Promise<void> {
  const store = getCalendarTokenStore();
  await store.save(userId, tokens);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state')?.trim();
  const code = url.searchParams.get('code')?.trim();
  const error = url.searchParams.get('error');

  if (error) {
    console.warn('Google OAuth returned error', error);
    if (state) {
      await clearSession(state);
    }
    return NextResponse.redirect(resolveRedirectUrl('error'));
  }

  if (!state || !code) {
    return NextResponse.json({ error: 'Missing state or authorization code' }, { status: 400 });
  }

  const sessionSecret = await resolveSessionSecret(state);
  const payload = decodeSessionPayload(sessionSecret);

  if (!payload) {
    return NextResponse.json({ error: 'OAuth session expired or invalid' }, { status: 400 });
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, payload.codeVerifier);
    await persistTokens(payload.userId, tokens);
    await clearSession(state);
    return NextResponse.redirect(resolveRedirectUrl('success'));
  } catch (exchangeError) {
    console.error('Google OAuth code exchange failed', exchangeError);
    await clearSession(state);
    return NextResponse.redirect(resolveRedirectUrl('error'));
  }
}
