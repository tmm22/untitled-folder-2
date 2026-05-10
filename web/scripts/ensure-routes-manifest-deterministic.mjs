import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const nextDir = path.resolve(process.cwd(), '.next');
const routesManifest = path.join(nextDir, 'routes-manifest.json');
const deterministicManifest = path.join(nextDir, 'routes-manifest-deterministic.json');

if (!existsSync(routesManifest)) {
  console.warn('[build] routes-manifest.json not found; skipping deterministic manifest compatibility copy.');
  process.exit(0);
}

copyFileSync(routesManifest, deterministicManifest);
console.log('[build] Created .next/routes-manifest-deterministic.json compatibility file.');
