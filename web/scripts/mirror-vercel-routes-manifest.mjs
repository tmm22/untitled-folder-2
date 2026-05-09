import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const deterministicManifest = 'routes-manifest-deterministic.json';
const routesManifest = 'routes-manifest.json';
const manifestNames = [deterministicManifest, routesManifest];

const sourceDirectories = [
  path.join(cwd, '.next'),
  path.join(cwd, 'web', '.next'),
];

const destinationDirectories = [
  path.join(cwd, '.next'),
  path.join(path.resolve(cwd, '..'), '.next'),
];

const source = sourceDirectories
  .flatMap((directory) => manifestNames.map((fileName) => path.join(directory, fileName)))
  .find((filePath) => existsSync(filePath));

if (!source) {
  console.warn('No Next routes manifest found to mirror for Vercel finalization.');
  process.exit(0);
}

for (const directory of new Set(destinationDirectories)) {
  mkdirSync(directory, { recursive: true });
  copyFileSync(source, path.join(directory, deterministicManifest));
}

console.log(`Mirrored ${path.relative(cwd, source)} for Vercel route manifest finalization.`);
