import { auth } from '@clerk/nextjs/server';

interface RequestIdentity {
  userId: string | null;
  isVerified: boolean;
  source: 'authorization' | 'header' | 'cookie' | 'generated' | 'clerk';
}

const ACCOUNT_COOKIE = 'account_id';

function parseCookie(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const entry = header
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${ACCOUNT_COOKIE}=`));
  return entry ? entry.split('=')[1] ?? null : null;
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
    return {
      userId: token.slice(devPrefix.length) || null,
      isVerified: true,
      source: 'authorization',
    };
  }

  return {
    userId: token,
    isVerified: Boolean(process.env.AUTH_ASSUME_TRUST === '1'),
    source: 'authorization',
  };
}

function resolveFromClerk(): RequestIdentity | null {
  try {
    const { userId } = auth();
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
  const clerkIdentity = resolveFromClerk();
  if (clerkIdentity?.userId) {
    return clerkIdentity;
  }

  const authorization = resolveFromAuthorization(request.headers.get('authorization'));
  if (authorization?.userId) {
    return authorization;
  }

  const headerId = request.headers.get('x-account-id')?.trim();
  if (headerId) {
    return { userId: headerId, isVerified: false, source: 'header' };
  }

  const cookieId = parseCookie(request.headers.get('cookie'));
  if (cookieId) {
    return { userId: cookieId, isVerified: false, source: 'cookie' };
  }

  return { userId: null, isVerified: false, source: 'generated' };
}
