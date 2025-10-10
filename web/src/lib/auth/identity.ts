import { getAuth } from '@clerk/nextjs/server';
import { ACCOUNT_COOKIE_NAME, verifyAccountCookie } from './accountCookie';

interface RequestIdentity {
  userId: string | null;
  isVerified: boolean;
  source: 'authorization' | 'cookie' | 'generated' | 'clerk';
}

function readCookieValue(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  const entry = header
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) || null : null;
}

function resolveFromAuthorization(header: string | null): RequestIdentity | null {
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const devPrefix = 'dev:';
  if (token.startsWith(devPrefix)) {
    if (process.env.AUTH_DEV_TOKENS !== '1') {
      return null;
    }
    return {
      userId: token.slice(devPrefix.length) || null,
      isVerified: true,
      source: 'authorization',
    };
  }

  if (process.env.AUTH_ASSUME_TRUST !== '1') {
    return null;
  }

  return {
    userId: token,
    isVerified: Boolean(process.env.AUTH_ASSUME_TRUST === '1'),
    source: 'authorization',
  };
}

type ClerkRequest = Parameters<typeof getAuth>[0];

function resolveFromClerk(request: Request): RequestIdentity | null {
  try {
    const authState = getAuth(request as ClerkRequest);
    const userId = authState.userId?.trim() || null;
    if (userId) {
      return {
        userId,
        isVerified: true,
        source: 'clerk',
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Clerk auth resolution failed, falling back to legacy headers/cookies', error);
    }
  }
  return null;
}

export function resolveRequestIdentity(request: Request): RequestIdentity {
  const clerkIdentity = resolveFromClerk(request);
  if (clerkIdentity?.userId) {
    return clerkIdentity;
  }

  const authorization = resolveFromAuthorization(request.headers.get('authorization'));
  if (authorization?.userId) {
    return authorization;
  }

  const cookieValue = readCookieValue(request.headers.get('cookie'), ACCOUNT_COOKIE_NAME);
  const cookieId = verifyAccountCookie(cookieValue);
  if (cookieId) {
    return { userId: cookieId, isVerified: false, source: 'cookie' };
  }

  return { userId: null, isVerified: false, source: 'generated' };
}
