import packageJson from '../../../package.json';

const FALLBACK_BUILD_SUFFIX = 'dev.local';
const PACKAGE_VERSION =
  typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson
    ? (packageJson as { version?: string }).version ?? '0.0.0'
    : '0.0.0';

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
  let versionSource: 'env' | 'package' = 'env';
  let version =
    env.NEXT_PUBLIC_APP_VERSION ??
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_VERSION : undefined);

  if (!version) {
    versionSource = 'package';
    version = PACKAGE_VERSION;
  }

  let buildSource: 'env' | 'fallback' = 'env';
  let build =
    env.NEXT_PUBLIC_APP_BUILD ??
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_BUILD : undefined);

  if (!build) {
    buildSource = 'fallback';
    build = `${version}+${FALLBACK_BUILD_SUFFIX}`;
  }

  const commitMatch = build.match(/commit\.([0-9a-fA-F]+)/);
  const commitHash = commitMatch?.[1];

  return {
    version,
    build,
    commitHash,
    isFallback: versionSource !== 'env' || buildSource !== 'env',
  };
}

export function formatAppVersion(info: AppVersionInfo = getAppVersionInfo()): string {
  return info.commitHash ? `${info.version} (${info.commitHash})` : info.version;
}
