const FALLBACK_VERSION = '0.0.0';
const FALLBACK_BUILD_SUFFIX = 'dev.local';

export type AppVersionInfo = {
  version: string;
  build: string;
  commitHash?: string;
  isFallback: boolean;
};

/**
 * Reads the version metadata exposed by Next.js env wiring.
 * Returns sensible fallbacks for local development when the env is missing.
 */
export function getAppVersionInfo(env: NodeJS.ProcessEnv = process.env): AppVersionInfo {
  const version = env.NEXT_PUBLIC_APP_VERSION ?? FALLBACK_VERSION;
  const build = env.NEXT_PUBLIC_APP_BUILD ?? `${version}+${FALLBACK_BUILD_SUFFIX}`;
  const commitMatch = build.match(/commit\.([0-9a-fA-F]+)/);
  const commitHash = commitMatch?.[1];

  return {
    version,
    build,
    commitHash,
    isFallback: !(env.NEXT_PUBLIC_APP_VERSION && env.NEXT_PUBLIC_APP_BUILD),
  };
}

export function formatAppVersion(info: AppVersionInfo = getAppVersionInfo()): string {
  return info.commitHash ? `${info.version} (${info.commitHash})` : info.version;
}
