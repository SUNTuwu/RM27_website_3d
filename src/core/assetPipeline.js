import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ASSET_MANIFEST = Object.freeze({
  arena: "models/arena/arena.gltf", // 场地几何 + rune 环循环动画 (2026-08-07 更新)
  timeline: "models/timeline_0/arena.gltf",
  robot: "models/robot_1/robot_1.gltf",
  dart: "models/dart/dart.gltf",
});

export function assetUrl(relativePath) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/${relativePath.replace(/^\/+/, "")}`;
}

function configureTexture(texture, maxAnisotropy) {
  if (!texture?.isTexture) {
    return;
  }

  texture.anisotropy = Math.min(maxAnisotropy, 8);
  texture.needsUpdate = true;
}

export function configureLoadedScene(root, renderer, { lightIntensityScale = 1 } = {}) {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const materials = new Set();

  root.traverse((object) => {
    if (object.isLight && lightIntensityScale !== 1) {
      object.userData.exportedIntensity = object.intensity;
      object.intensity *= lightIntensityScale;
    }

    if (!object.isMesh) {
      return;
    }

    object.castShadow = false;
    object.receiveShadow = false;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  const textureSlots = [
    "map",
    "emissiveMap",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "alphaMap",
  ];

  materials.forEach((material) => {
    textureSlots.forEach((slot) => configureTexture(material[slot], maxAnisotropy));
  });
}

export async function loadProjectAssets({ onProgress, onError } = {}) {
  const manager = new THREE.LoadingManager();
  let lastProgress = 0;

  manager.onProgress = (url, loaded, total) => {
    const ratio = total > 0 ? loaded / total : 0;
    lastProgress = Math.max(lastProgress, Math.min(ratio, 0.98));
    onProgress?.({ ratio: lastProgress, loaded, total, url });
  };

  manager.onError = (url) => {
    onError?.(new Error(`Failed to load asset dependency: ${url}`));
  };

  const loader = new GLTFLoader(manager);
  const entries = Object.entries(ASSET_MANIFEST);

  const loadedEntries = await Promise.all(
    entries.map(async ([key, relativePath]) => {
      const url = assetUrl(relativePath);
      try {
        const gltf = await loader.loadAsync(url);
        gltf.scene.name = `${key}_root`;
        return [key, gltf];
      } catch (cause) {
        throw new Error(`Unable to load ${key} from ${url}`, { cause });
      }
    }),
  );

  onProgress?.({ ratio: 1, loaded: entries.length, total: entries.length, url: "complete" });
  return Object.fromEntries(loadedEntries);
}

function collectSceneStats(root) {
  const meshes = [];
  const materials = new Set();

  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    meshes.push(object);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  const emissiveMaterials = [...materials].filter((material) => {
    return (
      material.emissive?.getHex() !== 0 &&
      Number.isFinite(material.emissiveIntensity) &&
      material.emissiveIntensity > 0
    );
  });

  return {
    meshes,
    materials: [...materials],
    emissiveMaterials,
  };
}

export function auditProjectAssets(assets) {
  const arenaStats = collectSceneStats(assets.arena.scene);
  const timelineStats = collectSceneStats(assets.timeline.scene);
  const robotStats = collectSceneStats(assets.robot.scene);
  const dartStats = collectSceneStats(assets.dart.scene);
  const camera =
    assets.timeline.cameras[0] ??
    assets.timeline.scene.getObjectByProperty("isCamera", true) ??
    null;
  const clips = assets.timeline.animations.map((clip) => ({
    name: clip.name || "Untitled",
    duration: clip.duration,
    tracks: clip.tracks.length,
  }));
  const issues = [];

  if (arenaStats.meshes.length === 0) {
    issues.push("arena_static contains no renderable meshes");
  }
  if (arenaStats.emissiveMaterials.length === 0) {
    issues.push("arena_static contains no active emissive materials");
  }
  if (!camera) {
    issues.push("timeline_0 contains no camera");
  }
  if (clips.length === 0) {
    issues.push("timeline_0 contains no animation clips");
  }
  if (!robotStats.meshes.some((mesh) => mesh.name.startsWith("robot_"))) {
    issues.push("robot asset does not expose a robot_* mesh");
  }
  if (dartStats.meshes.length === 0) {
    issues.push("dart asset contains no renderable meshes");
  }

  const allMaterials = new Set([
    ...arenaStats.materials,
    ...timelineStats.materials,
    ...robotStats.materials,
    ...dartStats.materials,
  ]);

  return {
    arena: {
      ...arenaStats,
      sourceClips: assets.arena.animations,
    },
    timeline: {
      ...timelineStats,
      camera,
      clips,
      sourceClips: assets.timeline.animations,
    },
    robot: robotStats,
    dart: dartStats,
    totals: {
      meshes:
        arenaStats.meshes.length +
        timelineStats.meshes.length +
        robotStats.meshes.length +
        dartStats.meshes.length,
      materials: allMaterials.size,
      emissive: arenaStats.emissiveMaterials.length,
    },
    issues,
  };
}
