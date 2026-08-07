import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetPaths = {
  arena: "assets/models/arena/arena.gltf",
  timeline: "assets/models/timeline_0/arena.gltf",
  robot: "assets/models/robot_1/robot_1.gltf",
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

async function run() {
  const arena = await readGltf(assetPaths.arena);
  const timeline = await readGltf(assetPaths.timeline);
  const robot = await readGltf(assetPaths.robot);

  await Promise.all([
    validateExternalUris("arena", arena),
    validateExternalUris("timeline_0", timeline),
    validateExternalUris("robot_1", robot),
  ]);

  const arenaNodeNames = new Set((arena.data.nodes ?? []).map((node) => node.name));
  ["ground", "outpost", "base", "rune_blue", "rune_red"].forEach((nodeName) => {
    check(arenaNodeNames.has(nodeName), `arena contains node ${nodeName}`);
  });
  check(
    arena.data.extensionsUsed?.includes("KHR_materials_emissive_strength"),
    "arena enables KHR_materials_emissive_strength",
  );
  const emissiveMaterials = (arena.data.materials ?? []).filter((material) => {
    const emissive = material.emissiveFactor ?? [0, 0, 0];
    return emissive.some((channel) => channel > 0);
  });
  check(emissiveMaterials.length >= 2, "arena contains red/blue emissive materials");

  // arena 循环动画: rune_blue / rune_red 旋转轨道, 首尾关键帧一致可循环
  const arenaClips = arena.data.animations ?? [];
  check(arenaClips.length > 0, "arena contains a loop animation clip");
  const runeRotationTargets = new Set(
    arenaClips.flatMap((animation) =>
      (animation.channels ?? [])
        .filter((channel) => channel.target.path === "rotation")
        .map((channel) => arena.data.nodes?.[channel.target.node]?.name),
    ),
  );
  check(runeRotationTargets.has("rune_blue"), "arena loop animates rune_blue rotation");
  check(runeRotationTargets.has("rune_red"), "arena loop animates rune_red rotation");

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

  const robotNode = (robot.data.nodes ?? []).find((node) => node.name?.startsWith("robot_"));
  check(Boolean(robotNode), "robot asset exposes a robot_* node");

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
    robot: {
      nodes: robot.data.nodes?.length ?? 0,
      meshes: robot.data.meshes?.length ?? 0,
      materials: robot.data.materials?.length ?? 0,
      clips: robot.data.animations?.length ?? 0,
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
