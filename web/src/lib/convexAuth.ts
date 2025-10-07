export interface ConvexAuthConfig {
  token: string;
  scheme: string;
}

export function resolveConvexAuthConfig(): ConvexAuthConfig | null {
  const token = process.env.CONVEX_DEPLOYMENT_KEY?.trim() ?? process.env.CONVEX_ADMIN_KEY?.trim();
  if (!token) {
    return null;
  }

  const explicitScheme = process.env.CONVEX_AUTH_SCHEME?.trim();
  if (explicitScheme) {
    return { token, scheme: explicitScheme };
  }

  if (process.env.CONVEX_DEPLOYMENT_KEY?.trim()) {
    return { token, scheme: 'Deployment' };
  }

  return { token, scheme: 'Bearer' };
}
