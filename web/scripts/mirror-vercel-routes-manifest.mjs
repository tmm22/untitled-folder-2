import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, '..');
const webNextDir = path.join(webRoot, '.next');
const repoNextDir = path.join(repoRoot, '.next');
const deterministicManifest = 'routes-manifest-deterministic.json';
const routesManifest = 'routes-manifest.json';

const source =
  [deterministicManifest, routesManifest]
    .map((fileName) => path.join(webNextDir, fileName))
    .find((filePath) => existsSync(filePath));

if (!source) {
  console.warn('No Next routes manifest found to mirror for Vercel finalization.');
  process.exit(0);
}

mkdirSync(repoNextDir, { recursive: true });
copyFileSync(source, path.join(repoNextDir, deterministicManifest));
