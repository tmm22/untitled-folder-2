import { describe, expect, it } from 'vitest';
import { buildConvexClientOptions } from '@/lib/convex/client';

describe('buildConvexClientOptions', () => {
  it('returns admin token options by default', () => {
    const options = buildConvexClientOptions({
      baseUrl: 'https://example.convex.cloud/',
      authToken: 'admin-token',
    });

    expect(options).toEqual(
      expect.objectContaining({
        url: 'https://example.convex.cloud',
        adminToken: 'admin-token',
        skipConvexDeploymentUrlCheck: true,
      }),
    );
  });

  it('honours bearer auth scheme for user tokens', () => {
    const options = buildConvexClientOptions({
      baseUrl: 'https://example.convex.cloud',
      authToken: 'user-token',
      authScheme: 'Bearer',
    });

    expect(options).toMatchObject({
      url: 'https://example.convex.cloud',
      token: 'user-token',
      skipConvexDeploymentUrlCheck: true,
    });
    expect(options).not.toHaveProperty('adminToken');
  });

  it('falls back to admin token for unknown schemes', () => {
    const options = buildConvexClientOptions({
      baseUrl: 'https://example.convex.cloud',
      authToken: 'mystery-token',
      authScheme: 'Unknown',
    });

    expect(options).toEqual(
      expect.objectContaining({
        adminToken: 'mystery-token',
      }),
    );
  });

  it('canonicalises convex site domains to convex cloud', () => {
    const options = buildConvexClientOptions({
      baseUrl: 'https://cheery-chihuahua-877.convex.site',
      authToken: 'token',
    });

    expect(options.url).toBe('https://cheery-chihuahua-877.convex.cloud');
  });
});
