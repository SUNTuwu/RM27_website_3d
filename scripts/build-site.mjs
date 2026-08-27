import { access, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "dist");
const site = resolve(root, "site");

await build({ root });

await access(resolve(dist, "index.html"));
await rm(site, { recursive: true, force: true });
await cp(dist, site, { recursive: true });

console.log(`Built Cloudflare Pages output in ${site}.`);
