import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAccountCookieValue } from '@/lib/auth/accountCookie';

describe('account cookie secret enforcement', () => {
  beforeEach(() => {
    // getSecret() trims, so an empty string behaves as unset.
    vi.stubEnv('ACCOUNT_ID_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when secret missing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => buildAccountCookieValue('user-1')).toThrow(/ACCOUNT_ID_SECRET/);
  });

  it('throws when secret too short in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCOUNT_ID_SECRET', 'short-secret');
    expect(() => buildAccountCookieValue('user-1')).toThrow(/ACCOUNT_ID_SECRET/);
  });

  it('rejects short secrets outside production too', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ACCOUNT_ID_SECRET', 'short-secret');
    expect(() => buildAccountCookieValue('user-1')).toThrow(/ACCOUNT_ID_SECRET/);
  });

  it('accepts a sufficiently long secret', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ACCOUNT_ID_SECRET', 'a'.repeat(32));
    expect(() => buildAccountCookieValue('user-1')).not.toThrow();
  });

  it('falls back to an ephemeral secret outside production when unset', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => buildAccountCookieValue('user-1')).not.toThrow();
  });
});
