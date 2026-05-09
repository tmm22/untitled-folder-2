import { copyFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

if (!process.env.VERCEL) {
  console.log('Skipping Vercel Next output mirror outside Vercel.');
  process.exit(0);
}

const source = path.join(cwd, '.next');
const destination = path.join(path.resolve(cwd, '..'), '.next');

if (!existsSync(source)) {
  console.warn('No Next build output found to mirror for Vercel finalization.');
  process.exit(0);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, {
  recursive: true,
  force: true,
  filter: (sourcePath) => path.relative(source, sourcePath).split(path.sep)[0] !== 'cache',
});

const routesManifest = path.join(destination, 'routes-manifest.json');
const deterministicRoutesManifest = path.join(destination, 'routes-manifest-deterministic.json');

if (!existsSync(deterministicRoutesManifest) && existsSync(routesManifest)) {
  copyFileSync(routesManifest, deterministicRoutesManifest);
}

console.log(`Mirrored ${path.relative(cwd, source)} to ${path.relative(cwd, destination)} for Vercel finalization.`);
