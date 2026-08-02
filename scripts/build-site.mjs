import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'site');
const files = ['index.html', 'open-source.html', '252478fc73dc3522687c788d2f12f490.txt'];
const directories = [
  'assets/vendor',
  'assets/department-patterns',
  'assets/open-source/web',
  'data',
];
const individualAssets = [
  'assets/logo.png',
  'assets/arena-fleet-web.jpg',
  'assets/wheel-leg-4-web.jpg',
  'assets/radar-teaser.png',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  ...files.map((file) => cp(resolve(root, file), resolve(output, file))),
  ...individualAssets.map((file) => cp(resolve(root, file), resolve(output, file))),
  ...directories.map((directory) => cp(resolve(root, directory), resolve(output, directory), { recursive: true })),
]);

console.log(`Built allowlisted Cloudflare Pages output in ${output}.`);
