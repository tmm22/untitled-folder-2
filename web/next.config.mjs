import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const semver = packageJson.version;

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.COMMIT_SHA ??
  process.env.SOURCE_VERSION ??
  process.env.BUILD_VCS_NUMBER ??
  '';

const commitFragment = commitSha ? commitSha.substring(0, 7) : '';
const buildMetadata = commitFragment ? `commit.${commitFragment}` : 'dev.local';
const buildVersion = `${semver}+${buildMetadata}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: rootDir,
  env: {
    NEXT_PUBLIC_APP_VERSION: semver,
    NEXT_PUBLIC_APP_BUILD: buildVersion,
  },
};

export default nextConfig;
