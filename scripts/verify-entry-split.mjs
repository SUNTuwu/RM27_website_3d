import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const distDir = join(process.cwd(), "dist");
const assetsDir = join(distDir, "assets");
const indexPath = join(distDir, "index.html");

function check(condition, message, detail = undefined) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `: ${JSON.stringify(detail)}`;
    throw new Error(`[fail] ${message}${suffix}`);
  }
  console.log(`[ok] ${message}`);
}

check(existsSync(indexPath), "production index exists; run npm.cmd run build first");
const html = readFileSync(indexPath, "utf8");
const entryMatch = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+\.js)"/i);
check(Boolean(entryMatch), "production index has one module entry");

const entryPath = join(distDir, entryMatch[1].replace(/^\//, ""));
const entryCode = readFileSync(entryPath, "utf8");
const jsFiles = readdirSync(assetsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    path: join(assetsDir, file),
  }));
const runtimeFiles = jsFiles.filter(({ path }) =>
  readFileSync(path, "utf8").includes("enterprize:p0-geometry-start"),
);

check(runtimeFiles.length === 1, "exactly one chunk owns the arena runtime", {
  runtimeFiles: runtimeFiles.map(({ file }) => file),
});
const runtime = runtimeFiles[0];
const runtimeCode = readFileSync(runtime.path, "utf8");
const forbiddenEntryMarkers = [
  "WebGLRenderer",
  "GLTFLoader",
  "enterprize:p0-geometry-start",
  "player.bilibili.com",
  "zoom-parallax-stage",
];
const leakedMarkers = forbiddenEntryMarkers.filter((marker) =>
  entryCode.includes(marker),
);

check(
  entryCode.includes("enterprize:intro-mounted") &&
    entryCode.includes("enterprize:runtime-import-start"),
  "the static entry owns Intro bootstrap and the runtime import boundary",
);
check(
  leakedMarkers.length === 0,
  "the static Intro entry excludes Three, 3D geometry, video players, and photo-wall code",
  { leakedMarkers },
);
check(
  runtimeCode.includes("WebGLRenderer") && runtimeCode.includes("GLTFLoader"),
  "Three and GLTF loading live in the deferred arena chunk",
);
check(
  entryCode.includes(runtime.file),
  "the arena chunk is referenced through the Intro entry's dynamic import",
  { runtime: runtime.file },
);

const entryBytes = statSync(entryPath).size;
const runtimeBytes = statSync(runtime.path).size;
check(
  entryBytes < runtimeBytes,
  "the Intro entry is smaller than the deferred arena runtime",
  { entryBytes, runtimeBytes },
);

console.log(
  "[summary]",
  JSON.stringify({
    entry: basename(entryPath),
    entryBytes,
    runtime: runtime.file,
    runtimeBytes,
  }),
);
