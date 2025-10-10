import { createHmac, timingSafeEqual } from 'node:crypto';

const ACCOUNT_COOKIE_NAME = 'account_id';
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_ACCOUNT_SECRET = 'development-account-secret';

function getSecret(): string {
  const secret = process.env.ACCOUNT_ID_SECRET?.trim();
  if (secret) {
    if (secret.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ACCOUNT_ID_SECRET must be at least 32 characters in production.');
      }
      console.warn('[accountCookie] ACCOUNT_ID_SECRET is shorter than 32 characters; using it only for non-production');
    }
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ACCOUNT_ID_SECRET is required in production environments.');
  }

  return DEFAULT_ACCOUNT_SECRET;
}

function computeSignature(accountId: string): Buffer {
  return createHmac('sha256', getSecret()).update(accountId, 'utf8').digest();
}

export function buildAccountCookieValue(accountId: string): string {
  const signature = computeSignature(accountId).toString('base64url');
  return `${accountId}.${signature}`;
}

export function verifyAccountCookie(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const separatorIndex = rawValue.lastIndexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const accountId = rawValue.slice(0, separatorIndex);
  const providedSignature = rawValue.slice(separatorIndex + 1);
  if (!accountId || !providedSignature) {
    return null;
  }

  try {
    const expected = computeSignature(accountId);
    const provided = Buffer.from(providedSignature, 'base64url');
    if (expected.length !== provided.length) {
      return null;
    }
    if (!timingSafeEqual(expected, provided)) {
      return null;
    }
    return accountId;
  } catch {
    return null;
  }
}

export function createGuestAccountId(): string {
  return `guest-${crypto.randomUUID()}`;
}

export { ACCOUNT_COOKIE_NAME, COOKIE_TTL_SECONDS };
