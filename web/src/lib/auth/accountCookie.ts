import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ACCOUNT_COOKIE_NAME = 'account_id';
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MIN_SECRET_LENGTH = 32;

// Process-unique fallback for non-production runs without ACCOUNT_ID_SECRET.
// Unlike a hardcoded constant it cannot be used to forge cookies, at the cost
// of invalidating dev cookies on restart.
let generatedDevSecret: string | null = null;

function getGeneratedDevSecret(): string {
  if (!generatedDevSecret) {
    generatedDevSecret = randomBytes(32).toString('hex');
    console.warn(
      '[accountCookie] ACCOUNT_ID_SECRET is not set; using an ephemeral secret. Guest cookies will not survive restarts.',
    );
  }
  return generatedDevSecret;
}

function getSecret(): string {
  const secret = process.env.ACCOUNT_ID_SECRET?.trim();
  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`ACCOUNT_ID_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    }
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ACCOUNT_ID_SECRET is required in production environments.');
  }

  return getGeneratedDevSecret();
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
