import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

export interface CalendarEventInput {
  calendarId?: string;
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  attendees?: string[];
}

function getOAuthConfig(): OAuthConfig {
  const clientId = process.env.TRANSIT_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.TRANSIT_GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TRANSIT_GOOGLE_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth configuration is incomplete');
  }

  return { clientId, clientSecret, redirectUri };
}

function encodeBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = encodeBase64Url(crypto.randomBytes(64));
  const challenge = encodeBase64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildOAuthUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestTokens(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Google token request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const payload = await requestTokens({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  if (!payload.refresh_token) {
    throw new Error('Google did not return a refresh token');
  }

  const expiresAt = Date.now() + Math.max(0, payload.expires_in ?? 0) * 1000;
  const scope = payload.scope ? payload.scope.split(/\s+/).filter(Boolean) : [CALENDAR_SCOPE];

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    scope,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = getOAuthConfig();
  const payload = await requestTokens({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const expiresAt = Date.now() + Math.max(0, payload.expires_in ?? 0) * 1000;
  const scope = payload.scope ? payload.scope.split(/\s+/).filter(Boolean) : [CALENDAR_SCOPE];

  return {
    accessToken: payload.access_token,
    refreshToken,
    expiresAt,
    scope,
  };
}

export interface CalendarEventResponse {
  id: string;
  status: string;
  htmlLink?: string;
  summary?: string;
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<CalendarEventResponse> {
  const calendarId = input.calendarId?.trim() || 'primary';
  const response = await fetch(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: {
        dateTime: input.startDateTime,
        timeZone: input.timeZone,
      },
      end: {
        dateTime: input.endDateTime,
        timeZone: input.timeZone,
      },
      attendees: input.attendees?.map((email) => ({ email })),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Google Calendar event creation failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as CalendarEventResponse;
}
