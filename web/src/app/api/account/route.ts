import { NextResponse } from 'next/server';
import type { AccountPayload } from '@/lib/account/types';
import { getAccountRepository } from './context';

const ACCOUNT_ID_HEADER = 'x-account-id';

function requireAccountId(request: Request): string | null {
  const header = request.headers.get(ACCOUNT_ID_HEADER)?.trim();
  if (header) {
    return header;
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookieMatch = cookieHeader.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith('account_id='));
  if (!cookieMatch) {
    return null;
  }

  return cookieMatch.split('=')[1] ?? null;
}

const ACCOUNT_ID_COOKIE = 'account_id';
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function createAccountResponse(payload: AccountPayload) {
  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: Request) {
  let userId = requireAccountId(request);
  if (!userId) {
    userId = crypto.randomUUID();
  }

  const repository = getAccountRepository();
  const account = await repository.getOrCreate(userId);
  const response = createAccountResponse(account);
  response.headers.append('Set-Cookie', `${ACCOUNT_ID_COOKIE}=${userId}; Path=/; Max-Age=${COOKIE_TTL_SECONDS}; SameSite=Lax`);
  return response;
}

export async function PATCH(request: Request) {
  const userId = requireAccountId(request);
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
  response.headers.append('Set-Cookie', `${ACCOUNT_ID_COOKIE}=${userId}; Path=/; Max-Age=${COOKIE_TTL_SECONDS}; SameSite=Lax`);
  return response;
}
