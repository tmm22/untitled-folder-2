import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { __test as convexHttpTestHelpers } from '../../../convex/http';

const { requireAdmin } = convexHttpTestHelpers;

function buildRequest(headers: Record<string, string>) {
  return new Request('http://localhost', { headers });
}

describe('Convex HTTP admin guard', () => {
  const originalEnv = {
    CONVEX_DEPLOYMENT_KEY: process.env.CONVEX_DEPLOYMENT_KEY,
    CONVEX_ADMIN_KEY: process.env.CONVEX_ADMIN_KEY,
    CONVEX_AUTH_SCHEME: process.env.CONVEX_AUTH_SCHEME,
  };

  beforeEach(() => {
    delete process.env.CONVEX_DEPLOYMENT_KEY;
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_AUTH_SCHEME;
  });

  afterEach(() => {
    if (originalEnv.CONVEX_DEPLOYMENT_KEY) {
      process.env.CONVEX_DEPLOYMENT_KEY = originalEnv.CONVEX_DEPLOYMENT_KEY;
    } else {
      delete process.env.CONVEX_DEPLOYMENT_KEY;
    }
    if (originalEnv.CONVEX_ADMIN_KEY) {
      process.env.CONVEX_ADMIN_KEY = originalEnv.CONVEX_ADMIN_KEY;
    } else {
      delete process.env.CONVEX_ADMIN_KEY;
    }
    if (originalEnv.CONVEX_AUTH_SCHEME) {
      process.env.CONVEX_AUTH_SCHEME = originalEnv.CONVEX_AUTH_SCHEME;
    } else {
      delete process.env.CONVEX_AUTH_SCHEME;
    }
  });

  it('rejects requests when no admin tokens are configured', () => {
    const request = buildRequest({});
    try {
      requireAdmin(request);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(500);
    }
  });

  it('authorises requests with matching token and default scheme', () => {
    process.env.CONVEX_DEPLOYMENT_KEY = 'test-token';
    const request = buildRequest({ authorization: 'Bearer test-token' });
    expect(() => requireAdmin(request)).not.toThrow();
  });

  it('rejects requests with mismatched token', () => {
    process.env.CONVEX_DEPLOYMENT_KEY = 'allowed-token';
    const request = buildRequest({ authorization: 'Bearer other-token' });
    try {
      requireAdmin(request);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });

  it('enforces explicit auth scheme when configured', () => {
    process.env.CONVEX_DEPLOYMENT_KEY = 'scheme-token';
    process.env.CONVEX_AUTH_SCHEME = 'Deployment';
    const request = buildRequest({ authorization: 'Bearer scheme-token' });
    try {
      requireAdmin(request);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });

  it('accepts fallback header when tokens configured', () => {
    process.env.CONVEX_ADMIN_KEY = 'admin-token';
    const request = buildRequest({ 'x-convex-admin-key': 'admin-token' });
    expect(() => requireAdmin(request)).not.toThrow();
  });
});
