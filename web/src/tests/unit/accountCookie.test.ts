import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountCookieValue } from '@/lib/auth/accountCookie';

describe('account cookie secret enforcement', () => {
  const originalEnv = {
    ACCOUNT_ID_SECRET: process.env.ACCOUNT_ID_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    delete process.env.ACCOUNT_ID_SECRET;
  });

  afterEach(() => {
    if (originalEnv.ACCOUNT_ID_SECRET !== undefined) {
      process.env.ACCOUNT_ID_SECRET = originalEnv.ACCOUNT_ID_SECRET;
    } else {
      delete process.env.ACCOUNT_ID_SECRET;
    }
    process.env.NODE_ENV = originalEnv.NODE_ENV ?? 'test';
  });

  it('throws when secret missing in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => buildAccountCookieValue('user-1')).toThrow(/ACCOUNT_ID_SECRET/);
  });

  it('throws when secret too short in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ACCOUNT_ID_SECRET = 'short-secret';
    expect(() => buildAccountCookieValue('user-1')).toThrow(/ACCOUNT_ID_SECRET/);
  });

  it('uses provided secret outside production, even if short', () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCOUNT_ID_SECRET = 'short-secret';
    expect(() => buildAccountCookieValue('user-1')).not.toThrow();
  });
});
