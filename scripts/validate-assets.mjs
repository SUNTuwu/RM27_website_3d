import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetPaths = {
  arena: "assets/models/arena/arena_half_blue.gltf",
  timeline: "assets/models/timeline_0/arena.gltf",
  dart: "assets/models/dart/dart.gltf",
  arenaPoints: "assets/pointcloud/arena_points.bin",
  dartPoints: "assets/pointcloud/dart_points.bin",
  infantryPoints: "assets/pointcloud/infantry_points.bin",
  engineerPoints: "assets/pointcloud/engineer_points.bin",
};
const failures = [];

function check(condition, message) {
  if (condition) {
    console.log(`[ok] ${message}`);
  } else {
    failures.push(message);
    console.error(`[fail] ${message}`);
  }
}

async function readGltf(relativePath) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  return {
    absolutePath,
    directory: path.dirname(absolutePath),
    data: JSON.parse(source),
  };
}

function collectExternalUris(gltf) {
  return [
    ...(gltf.buffers ?? []).map((buffer) => buffer.uri),
    ...(gltf.images ?? []).map((image) => image.uri),
  ].filter((uri) => uri && !uri.startsWith("data:"));
}

async function validateExternalUris(label, document) {
  const uris = collectExternalUris(document.data);
  check(uris.length > 0, `${label} declares external binary or image resources`);

  for (const uri of uris) {
    const target = path.resolve(document.directory, decodeURIComponent(uri));
    try {
      await access(target);
      const details = await stat(target);
      check(details.size > 0, `${label} dependency exists: ${uri}`);
    } catch {
      check(false, `${label} dependency exists: ${uri}`);
    }
  }
}

function animationDuration(gltf, animation) {
  const maxima = (animation.samplers ?? []).flatMap((sampler) => {
    const accessor = gltf.accessors?.[sampler.input];
    return accessor?.max ?? [];
  });
  return maxima.length ? Math.max(...maxima) : 0;
}

async function validatePointCloud(label, relativePath) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const data = await readFile(absolutePath);
  check(data.byteLength >= 32, `${label} point-cloud data contains a complete header`);
  if (data.byteLength < 32) {
    return { count: 0, bytes: data.byteLength };
  }

  check(data.toString("ascii", 0, 4) === "EPC1", `${label} point-cloud data uses EPC1 format`);
  const count = data.readUInt32LE(4);
  check(count === 50_000, `${label} point-cloud data contains 50,000 targets`);
  check(
    data.byteLength === 32 + count * 3 * Float32Array.BYTES_PER_ELEMENT,
    `${label} point-cloud data byte length matches its header`,
  );
  const bounds = Array.from({ length: 6 }, (_, index) =>
    data.readFloatLE(8 + index * 4),
  );
  check(
    bounds.every(Number.isFinite) &&
      bounds.slice(0, 3).every((value, index) => value <= bounds[index + 3]),
    `${label} point-cloud data contains finite ordered bounds`,
  );
  return { count, bytes: data.byteLength, bounds };
}

async function run() {
  const arena = await readGltf(assetPaths.arena);
  const timeline = await readGltf(assetPaths.timeline);
  const dart = await readGltf(assetPaths.dart);
  const arenaPoints = await validatePointCloud("arena", assetPaths.arenaPoints);
  const explorePoints = Object.fromEntries(
    await Promise.all(
      ["dart", "infantry", "engineer"].map(async (key) => [
        key,
        await validatePointCloud(key, assetPaths[`${key}Points`]),
      ]),
    ),
  );

  await Promise.all([
    validateExternalUris("arena", arena),
    validateExternalUris("timeline_0", timeline),
    validateExternalUris("dart", dart),
  ]);

  const arenaNodeNames = new Set((arena.data.nodes ?? []).map((node) => node.name));
  ["ground", "outpost", "base", "rune_blue"].forEach((nodePrefix) => {
    check(
      [...arenaNodeNames].some((nodeName) => nodeName?.startsWith(nodePrefix)),
      `blue half-arena contains a ${nodePrefix} node`,
    );
  });
  check(
    arena.data.extensionsUsed?.includes("KHR_materials_emissive_strength"),
    "arena enables KHR_materials_emissive_strength",
  );
  const emissiveMaterials = (arena.data.materials ?? []).filter((material) => {
    const emissive = material.emissiveFactor ?? [0, 0, 0];
    return emissive.some((channel) => channel > 0);
  });
  const blueTeamMaterials = emissiveMaterials.filter((material) =>
    material.name?.startsWith("EMISSION_BLUE"),
  );
  check(blueTeamMaterials.length >= 2, "blue half-arena contains team emissive materials");
  check(
    !(arena.data.materials ?? []).some((material) =>
      material.name?.startsWith("EMISSION_RED"),
    ),
    "source arena contains only the canonical blue team materials",
  );

  // The canonical blue-half clip is bound independently under both runtime team roots.
  const arenaClips = arena.data.animations ?? [];
  check(arenaClips.length > 0, "arena contains a loop animation clip");
  const runeChannels = arenaClips.flatMap((animation) =>
    (animation.channels ?? []).map((channel) => ({
      name: arena.data.nodes?.[channel.target.node]?.name,
      path: channel.target.path,
    })),
  );
  check(
    runeChannels.some(
      ({ name, path }) => name?.startsWith("rune_blue") && path === "rotation",
    ),
    "blue half-arena loop animates rune rotation",
  );
  check(
    runeChannels.some(
      ({ name, path }) => name?.startsWith("rune_blue") && path === "translation",
    ),
    "blue half-arena loop animates rune translation",
  );
  const arenaDuration = animationDuration(arena.data, arenaClips[0]);
  check(
    arenaDuration >= 6 && arenaDuration <= 6.1,
    "blue half-arena loop duration is approximately 6.04s",
  );
  check(
    arenaPoints.bounds[0] < -14 && arenaPoints.bounds[3] > 14,
    "arena point cloud contains both rotated halves",
  );
  check(
    Math.abs(arenaPoints.bounds[0] + arenaPoints.bounds[3]) < 0.1,
    "arena point-cloud X bounds are symmetric around the world origin",
  );
  for (const [key, pointCloud] of Object.entries(explorePoints)) {
    check(
      [0, 1, 2].every(
        (axis) => Math.abs(pointCloud.bounds[axis] + pointCloud.bounds[axis + 3]) < 0.01,
      ),
      `${key} EXPLORE point cloud is recentered for stable model rotation`,
    );
  }

  const cameraNodeIndex = (timeline.data.nodes ?? []).findIndex(
    (node) => node.camera !== undefined,
  );
  check(cameraNodeIndex >= 0, "timeline_0 contains an exported camera node");
  check((timeline.data.cameras ?? []).length === 1, "timeline_0 contains one camera definition");
  check((timeline.data.animations ?? []).length > 0, "timeline_0 contains animation clips");

  const cameraPaths = new Set(
    (timeline.data.animations ?? []).flatMap((animation) =>
      (animation.channels ?? [])
        .filter((channel) => channel.target.node === cameraNodeIndex)
        .map((channel) => channel.target.path),
    ),
  );
  check(cameraPaths.has("translation"), "timeline camera has a translation track");
  check(cameraPaths.has("rotation"), "timeline camera has a rotation track");

  const clipSummary = (timeline.data.animations ?? []).map((animation) => ({
    name: animation.name || "Untitled",
    duration: animationDuration(timeline.data, animation),
    channels: animation.channels?.length ?? 0,
  }));
  const primaryClip = clipSummary[0];
  check(primaryClip?.duration >= 6 && primaryClip?.duration <= 6.1, "timeline clip duration is approximately 6.04s");
  check(primaryClip?.channels === 11, "timeline clip contains 11 animation channels");

  const dartNode = (dart.data.nodes ?? []).find((node) => node.name === "dart");
  check(Boolean(dartNode), "dart asset exposes the dart node");

  console.log("\nAsset summary");
  console.table({
    arena: {
      nodes: arena.data.nodes?.length ?? 0,
      meshes: arena.data.meshes?.length ?? 0,
      materials: arena.data.materials?.length ?? 0,
      clips: arena.data.animations?.length ?? 0,
    },
    timeline: {
      nodes: timeline.data.nodes?.length ?? 0,
      meshes: timeline.data.meshes?.length ?? 0,
      materials: timeline.data.materials?.length ?? 0,
      clips: clipSummary.map((clip) => `${clip.name} ${clip.duration.toFixed(2)}s`).join(", "),
    },
    dart: {
      nodes: dart.data.nodes?.length ?? 0,
      meshes: dart.data.meshes?.length ?? 0,
      materials: dart.data.materials?.length ?? 0,
      clips: dart.data.animations?.length ?? 0,
    },
    arenaPoints: {
      nodes: "-",
      meshes: arenaPoints.count.toLocaleString("en-US"),
      materials: "-",
      clips: `${(arenaPoints.bytes / 1024).toFixed(1)} KiB`,
    },
    explorePoints: {
      nodes: "-",
      meshes: Object.values(explorePoints)
        .map((entry) => entry.count.toLocaleString("en-US"))
        .join(" / "),
      materials: "-",
      clips: Object.values(explorePoints)
        .map((entry) => `${(entry.bytes / 1024).toFixed(1)} KiB`)
        .join(" / "),
    },
  });

  if (failures.length) {
    throw new Error(`${failures.length} asset validation check(s) failed`);
  }

  console.log("\nM1 asset validation passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
