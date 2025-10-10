import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { AccountPayload } from '@/lib/account/types';
import { resolveRequestIdentity } from '@/lib/auth/identity';
import {
  ACCOUNT_COOKIE_NAME,
  COOKIE_TTL_SECONDS,
  buildAccountCookieValue,
  createGuestAccountId,
} from '@/lib/auth/accountCookie';
import { getAccountRepository } from './context';

function createAccountResponse(payload: AccountPayload) {
  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function applyAccountCookie(response: NextResponse, accountId: string) {
  const secureCookie = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: ACCOUNT_COOKIE_NAME,
    value: buildAccountCookieValue(accountId),
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'strict',
    maxAge: COOKIE_TTL_SECONDS,
    path: '/',
  });
}

export async function GET(request: Request) {
  const identity = resolveRequestIdentity(request);
  const userId = identity.userId ?? createGuestAccountId();

  const repository = getAccountRepository();
  const account = await repository.getOrCreate(userId);
  const response = createAccountResponse(account);
  applyAccountCookie(response, userId);
  return response;
}

export async function PATCH(request: Request) {
  const updateSecret = process.env.ACCOUNT_UPDATE_SECRET?.trim();
  if (!updateSecret) {
    console.error('ACCOUNT_UPDATE_SECRET is not configured; rejecting account update request');
    return NextResponse.json({ error: 'Account updates are disabled' }, { status: 500 });
  }

  const provided = request.headers.get('x-account-update-token')?.trim();
  if (!provided) {
    return NextResponse.json({ error: 'Missing update credentials' }, { status: 401 });
  }

  const expectedBytes = Buffer.from(updateSecret, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return NextResponse.json({ error: 'Invalid update credentials' }, { status: 401 });
  }

  const identity = resolveRequestIdentity(request);
  const userId = identity.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Missing account identifier' }, { status: 400 });
  }

  const repository = getAccountRepository();
  let payload: AccountPayload;
  try {
    payload = (await request.json()) as AccountPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (!payload.planTier || !payload.billingStatus) {
    return NextResponse.json({ error: 'Missing plan attributes' }, { status: 400 });
  }

  const updated = await repository.updateAccount({ ...payload, userId });

  const response = createAccountResponse(updated);
  applyAccountCookie(response, userId);
  return response;
}
