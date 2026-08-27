import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = resolve(root, "site");
const maxFiles = 20_000;
const maxFileBytes = 25 * 1024 * 1024;

const requiredPaths = [
  "index.html",
  "open-source.html",
  "252478fc73dc3522687c788d2f12f490.txt",
  "assets/open-source/data/open-source-projects.js",
  "assets/open-source/data/metrics.json",
];

const forbiddenTopLevelPaths = [
  "ANALYSIS",
  "REFERENCES",
  "blender",
  "functions",
  "node_modules",
  "scripts",
  "src",
];

const forbiddenRepositoryPaths = [
  "functions/_middleware.js",
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

for (const path of requiredPaths) {
  await access(resolve(site, path));
}

for (const path of forbiddenTopLevelPaths) {
  try {
    await access(resolve(site, path));
    throw new Error(`Deployment output unexpectedly contains ${path}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

for (const path of forbiddenRepositoryPaths) {
  try {
    await access(resolve(root, path));
    throw new Error(`Repository unexpectedly contains ${path}; preview deployments must remain public.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const files = await collectFiles(site);
if (files.length > maxFiles) {
  throw new Error(`Deployment contains ${files.length} files; Cloudflare Pages allows ${maxFiles}.`);
}

let totalBytes = 0;
let largest = { path: "", bytes: 0 };
for (const path of files) {
  const file = await stat(path);
  totalBytes += file.size;
  if (file.size > largest.bytes) largest = { path, bytes: file.size };
  if (file.size > maxFileBytes) {
    throw new Error(`${relative(site, path)} exceeds the Cloudflare Pages 25 MiB file limit.`);
  }

  if (basename(path).startsWith(".env")) {
    throw new Error(`Deployment output contains environment file ${relative(site, path)}.`);
  }
}

const verificationToken = (await readFile(resolve(site, requiredPaths[2]), "utf8")).trim();
if (!/^[a-f0-9]{40}$/.test(verificationToken)) {
  throw new Error("Public verification file does not contain the expected token format.");
}

const toMiB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log([
  "Cloudflare deployment artifact passed.",
  `Files: ${files.length}`,
  `Total: ${toMiB(totalBytes)} MiB`,
  `Largest: ${relative(site, largest.path)} (${toMiB(largest.bytes)} MiB)`,
].join("\n"));
