import type { NextjsOptions } from 'convex/nextjs';

export interface ConvexClientConfig {
  baseUrl: string;
  authToken?: string;
  authScheme?: string;
}

function canonicaliseDeploymentUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.endsWith('.convex.site')) {
      parsed.hostname = parsed.hostname.replace(/\.convex\.site$/, '.convex.cloud');
    }
    return parsed.toString();
  } catch {
    if (trimmed.endsWith('.convex.site')) {
      return trimmed.replace(/\.convex\.site(?=[/?#]|$)/, '.convex.cloud');
    }
    return trimmed;
  }
}

function normaliseBaseUrl(url: string): string {
  return canonicaliseDeploymentUrl(url).replace(/\/+$/, '');
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
