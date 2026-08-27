import { access, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const imageRoot = resolve(root, "assets/images");
const writeChanges = process.argv.includes("--write");
const verifyOnly = process.argv.includes("--verify");
const sourceExtensions = new Set([".gif", ".jpg", ".jpeg", ".png"]);
const supportedExtensions = new Set([...sourceExtensions, ".webp"]);
const staticMaxEdge = 1920;
const animatedMaxWidth = 960;
const animatedMaxHeight = 720;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function webpPath(source) {
  return source.slice(0, -extname(source).length) + ".webp";
}

function frameHeight(metadata) {
  return metadata.pageHeight ?? metadata.height;
}

function totalDuration(metadata) {
  return (metadata.delay ?? []).reduce((total, delay) => total + delay, 0);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function decodeMetadata(input, animated) {
  return sharp(input, { animated }).metadata();
}

async function verifyOutput(data, sourceMetadata) {
  const outputMetadata = await decodeMetadata(data, true);
  const sourcePages = sourceMetadata.pages ?? 1;
  const outputPages = outputMetadata.pages ?? 1;

  if (outputMetadata.format !== "webp") {
    throw new Error(`Expected WebP output, received ${outputMetadata.format}.`);
  }
  if (sourcePages > 1 && outputPages < 2) {
    throw new Error(`Animated input with ${sourcePages} frames became static output.`);
  }

  const sourceDuration = totalDuration(sourceMetadata);
  const outputDuration = totalDuration(outputMetadata);
  if (sourceDuration > 0 && outputDuration !== sourceDuration) {
    throw new Error(`Animation duration changed from ${sourceDuration}ms to ${outputDuration}ms.`);
  }

  return outputMetadata;
}

async function optimizeImage(source) {
  const extension = extname(source).toLowerCase();
  const animated = extension === ".gif";
  const sourceFile = await stat(source);
  const sourceMetadata = await decodeMetadata(source, animated);
  const destination = webpPath(source);

  if (destination !== source && await pathExists(destination)) {
    throw new Error(`Refusing to overwrite existing file ${relative(root, destination)}.`);
  }

  let pipeline = sharp(source, { animated });
  if (animated) {
    pipeline = pipeline.resize({
      width: animatedMaxWidth,
      height: animatedMaxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  } else {
    pipeline = pipeline.autoOrient().resize({
      width: staticMaxEdge,
      height: staticMaxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const options = animated
    ? [{
        quality: 74,
        alphaQuality: 90,
        effort: 6,
        smartSubsample: true,
        minSize: true,
        mixed: true,
        loop: sourceMetadata.loop ?? 0,
        delay: sourceMetadata.delay,
      }]
    : [{
        quality: extension === ".png" ? 88 : 82,
        alphaQuality: 100,
        effort: 6,
        smartSubsample: true,
        preset: extension === ".png" ? "drawing" : "photo",
      }];

  if (extension === ".png") {
    options.push({
      nearLossless: true,
      quality: 80,
      alphaQuality: 100,
      effort: 6,
      preset: "drawing",
    });
  }

  const candidates = await Promise.all(options.map((outputOptions) => (
    pipeline.clone().webp(outputOptions).toBuffer({ resolveWithObject: true })
  )));
  let selected = candidates.reduce((smallest, candidate) => (
    candidate.data.byteLength < smallest.data.byteLength ? candidate : smallest
  ));
  if (selected.data.byteLength >= sourceFile.size && [".jpg", ".jpeg"].includes(extension)) {
    selected = await pipeline.clone().webp({
      quality: 76,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
      preset: "photo",
    }).toBuffer({ resolveWithObject: true });
  }
  const { data } = selected;
  const outputMetadata = await verifyOutput(data, sourceMetadata);

  if (data.byteLength >= sourceFile.size) {
    throw new Error(`WebP output is not smaller for ${relative(root, source)}.`);
  }

  const reduction = (1 - data.byteLength / sourceFile.size) * 100;
  const dimensions = `${outputMetadata.width}x${frameHeight(outputMetadata)}`;
  console.log([
    writeChanges ? "[prepare]" : "[preview]",
    relative(root, source),
    "->",
    relative(root, destination),
    `${formatBytes(sourceFile.size)} -> ${formatBytes(data.byteLength)}`,
    `(-${reduction.toFixed(1)}%, ${dimensions}, ${outputMetadata.pages ?? 1} frame(s))`,
  ].join(" "));

  return {
    source,
    destination,
    data,
    before: sourceFile.size,
    after: data.byteLength,
  };
}

async function writeOptimizedImages(results) {
  for (const result of results) {
    const temporary = `${result.destination}.tmp-${process.pid}`;
    try {
      await writeFile(temporary, result.data);
      await rename(temporary, result.destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  for (const result of results) {
    await unlink(result.source);
  }
}

async function verifyImages(files) {
  const legacy = files.filter((path) => sourceExtensions.has(extname(path).toLowerCase()));
  if (legacy.length > 0) {
    throw new Error(`Found ${legacy.length} unoptimized image(s), starting with ${relative(root, legacy[0])}.`);
  }

  let totalBytes = 0;
  let animatedImages = 0;
  for (const path of files) {
    const file = await stat(path);
    const metadata = await decodeMetadata(path, true);
    if (metadata.format !== "webp") {
      throw new Error(`${relative(root, path)} is not a valid WebP image.`);
    }
    if ((metadata.pages ?? 1) > 1) animatedImages += 1;
    totalBytes += file.size;
  }

  console.log([
    "Image verification passed.",
    `Files: ${files.length}`,
    `Animated: ${animatedImages}`,
    `Total: ${formatBytes(totalBytes)}`,
  ].join("\n"));
}

const files = await collectFiles(imageRoot);

if (verifyOnly) {
  await verifyImages(files);
} else {
  const sources = files.filter((path) => sourceExtensions.has(extname(path).toLowerCase()));
  if (sources.length === 0) {
    console.log("No legacy JPEG, PNG or GIF images remain.");
    process.exit(0);
  }

  const results = [];
  let before = 0;
  let after = 0;

  for (const source of sources) {
    const result = await optimizeImage(source);
    results.push(result);
    before += result.before;
    after += result.after;
  }

  if (writeChanges) {
    await writeOptimizedImages(results);
  }

  console.log([
    `${writeChanges ? "Optimized" : "Previewed"} ${sources.length} image(s).`,
    `${formatBytes(before)} -> ${formatBytes(after)}`,
    `Saved: ${formatBytes(before - after)} (${((1 - after / before) * 100).toFixed(1)}%)`,
  ].join("\n"));
}
