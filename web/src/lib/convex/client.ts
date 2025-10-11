import type { NextjsOptions } from 'convex/nextjs';

export interface ConvexClientConfig {
  baseUrl: string;
  authToken?: string;
  authScheme?: string;
}

function normaliseBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function resolveAuthKind(scheme?: string): 'admin' | 'user' | null {
  if (!scheme) {
    return 'admin';
  }

  const normalised = scheme.trim().toLowerCase();
  if (!normalised) {
    return 'admin';
  }

  if (normalised === 'bearer') {
    return 'user';
  }

  if (normalised === 'user') {
    return 'user';
  }

  if (normalised === 'convex') {
    return 'admin';
  }

  if (normalised === 'deployment') {
    return 'admin';
  }

  if (normalised === 'admin') {
    return 'admin';
  }

  return 'admin';
}

export function buildConvexClientOptions(config: ConvexClientConfig): NextjsOptions {
  const baseUrl = normaliseBaseUrl(config.baseUrl);
  const authToken = config.authToken?.trim();
  const options: NextjsOptions = {
    url: baseUrl,
    skipConvexDeploymentUrlCheck: true,
  };

  if (!authToken) {
    return options;
  }

  const authKind = resolveAuthKind(config.authScheme);
  if (authKind === 'user') {
    options.token = authToken;
    return options;
  }

  (options as NextjsOptions & { adminToken?: string }).adminToken = authToken;
  return options;
}
