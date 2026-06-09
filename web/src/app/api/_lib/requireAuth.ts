import { NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/identity';

export interface VerifiedIdentity {
  userId: string;
}

/**
 * Guard for routes that must only be reachable by a verified (Clerk or
 * explicitly trusted dev) identity. Signed guest cookies are NOT sufficient:
 * they prove continuity of a browser session, not account ownership.
 *
 * Returns the verified identity, or a 401 response to return as-is.
 */
export function requireVerifiedIdentity(request: Request): VerifiedIdentity | Response {
  const identity = resolveRequestIdentity(request);
  if (!identity.userId || !identity.isVerified) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return { userId: identity.userId };
}

export function isAuthFailure(value: VerifiedIdentity | Response): value is Response {
  return value instanceof Response;
}
