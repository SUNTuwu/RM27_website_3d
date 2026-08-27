import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const targets = [
  ["assets/models/arena/arena_new.png", "assets/models/arena/arena_new.webp", 512],
  ["assets/models/timeline_0/dart.jpg", "assets/models/timeline_0/dart.webp", 512],
  ["assets/models/timeline_0/hit.png", "assets/models/timeline_0/hit.webp", 512],
  ["assets/models/hero/tripo_node_825405b6_BaseColor.jpg", "assets/models/hero/base-color.webp", 1024],
  ["assets/models/engineer/tripo_node_6c18264b-5c27-4731-a203-7066cc836da8_BaseColor.jpg", "assets/models/engineer/base-color.webp", 1024],
  ["assets/models/infantry/tripo_node_d7df7fef-2a09-40ee-a8b3-6e150dd117bf_BaseColor.jpg", "assets/models/infantry/base-color.webp", 1024],
  ["assets/models/sentry/tripo_image_255135ac_0.png", "assets/models/sentry/base-color.webp", 1024],
  ["assets/models/dart/dart.jpg", "assets/models/dart/dart.webp", 1024],
];

for (const [sourceRelative, outputRelative, maxEdge] of targets) {
  const source = path.resolve(root, sourceRelative);
  const output = path.resolve(root, outputRelative);
  await mkdir(path.dirname(output), { recursive: true });
  const result = await sharp(source)
    .autoOrient()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: sourceRelative.endsWith(".png") ? 86 : 82,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(output);
  console.log(
    `[model-texture] ${sourceRelative} -> ${outputRelative} (${result.width}x${result.height}, ${result.size} bytes)`,
  );
}
