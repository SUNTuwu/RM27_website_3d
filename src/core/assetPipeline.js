import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { assetUrl } from "./assetUrl.js";

export { assetUrl } from "./assetUrl.js";

const ASSET_MANIFEST = Object.freeze({
  arena: "models/arena/arena_half_blue.gltf",
  timeline: "models/timeline_0/arena.gltf",
  dart: "models/dart/dart.gltf",
  hero: "models/hero/hero.gltf",
  engineer: "models/engineer/engineer.gltf",
  infantry: "models/infantry/infantry.gltf",
  sentry: "models/sentry/sentry.gltf",
});

export const PROJECT_ASSET_KEYS = Object.freeze(Object.keys(ASSET_MANIFEST));

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

export function createProjectAssetLoader({ onProgress, onError } = {}) {
  const manager = new THREE.LoadingManager();
  const cache = new Map();
  const loaded = new Map();

  manager.onProgress = (url, loaded, total) => {
    const ratio = total > 0 ? loaded / total : 0;
    onProgress?.({ phase: "dependency", ratio, loaded, total, url });
  };

  manager.onError = (url) => {
    onError?.(new Error(`Failed to load asset dependency: ${url}`));
  };

  const loader = new GLTFLoader(manager);

  function load(key) {
    if (!(key in ASSET_MANIFEST)) {
      return Promise.reject(new Error(`Unknown project asset: ${key}`));
    }
    if (cache.has(key)) {
      return cache.get(key);
    }

    const url = assetUrl(ASSET_MANIFEST[key]);
    onProgress?.({ phase: "start", key, ratio: 0, loaded: 0, total: 1, url });
    const promise = loader
      .loadAsync(url, (event) => {
        const ratio = event.total > 0 ? event.loaded / event.total : 0;
        onProgress?.({
          phase: "transfer",
          key,
          ratio,
          loaded: event.loaded,
          total: event.total,
          url,
        });
      })
      .then((gltf) => {
        gltf.scene.name = `${key}_root`;
        loaded.set(key, gltf);
        onProgress?.({ phase: "complete", key, ratio: 1, loaded: 1, total: 1, url });
        return gltf;
      })
      .catch((cause) => {
        cache.delete(key);
        const error = new Error(`Unable to load ${key} from ${url}`, { cause });
        onError?.(error);
        throw error;
      });

    cache.set(key, promise);
    return promise;
  }

  async function loadMany(keys, { concurrency = Number.POSITIVE_INFINITY } = {}) {
    const uniqueKeys = [...new Set(keys)];
    if (!Number.isFinite(concurrency) || concurrency >= uniqueKeys.length) {
      const entries = await Promise.all(
        uniqueKeys.map(async (key) => [key, await load(key)]),
      );
      return Object.fromEntries(entries);
    }

    const entries = [];
    const workerCount = Math.max(1, Math.min(Math.floor(concurrency), uniqueKeys.length));
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < uniqueKeys.length) {
        const key = uniqueKeys[nextIndex];
        nextIndex += 1;
        entries.push([key, await load(key)]);
      }
    }

    await Promise.all(Array.from({ length: workerCount }, worker));
    return Object.fromEntries(entries);
  }

  return {
    load,
    loadMany,
    has(key) {
      return loaded.has(key);
    },
    get(key) {
      return loaded.get(key) ?? null;
    },
    get loadedKeys() {
      return [...loaded.keys()];
    },
  };
}

export async function loadProjectAssets({ onProgress, onError } = {}) {
  const assetLoader = createProjectAssetLoader({ onProgress, onError });
  return assetLoader.loadMany(PROJECT_ASSET_KEYS);
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

function emptySceneStats() {
  return { meshes: [], materials: [], emissiveMaterials: [] };
}

export function auditProjectAssets(
  assets,
  { required = PROJECT_ASSET_KEYS } = {},
) {
  const requiredKeys = new Set(required);
  const arenaStats = assets.arena
    ? collectSceneStats(assets.arena.scene)
    : emptySceneStats();
  const timelineStats = assets.timeline
    ? collectSceneStats(assets.timeline.scene)
    : emptySceneStats();
  const dartStats = assets.dart
    ? collectSceneStats(assets.dart.scene)
    : emptySceneStats();
  // 红蓝编队机器人 (hero/engineer/infantry/sentry): 网格统计 + 通用空网格检查
  const squadKeys = ["hero", "engineer", "infantry", "sentry"];
  const squadStats = Object.fromEntries(
    squadKeys.map((key) => [
      key,
      assets[key] ? collectSceneStats(assets[key].scene) : emptySceneStats(),
    ]),
  );
  const camera =
    assets.timeline?.cameras[0] ??
    assets.timeline?.scene.getObjectByProperty("isCamera", true) ??
    null;
  const clips = (assets.timeline?.animations ?? []).map((clip) => ({
    name: clip.name || "Untitled",
    duration: clip.duration,
    tracks: clip.tracks.length,
  }));
  const issues = [];

  for (const key of requiredKeys) {
    if (!assets[key]) {
      issues.push(`${key} asset was not loaded`);
    }
  }

  if (assets.arena && arenaStats.meshes.length === 0) {
    issues.push("arena contains no renderable meshes");
  }
  if (assets.arena && arenaStats.emissiveMaterials.length === 0) {
    issues.push("arena contains no active emissive materials");
  }
  if (assets.timeline && !camera) {
    issues.push("timeline_0 contains no camera");
  }
  if (assets.timeline && clips.length === 0) {
    issues.push("timeline_0 contains no animation clips");
  }
  if (assets.dart && dartStats.meshes.length === 0) {
    issues.push("dart asset contains no renderable meshes");
  }
  for (const key of squadKeys) {
    if (assets[key] && squadStats[key].meshes.length === 0) {
      issues.push(`${key} asset contains no renderable meshes`);
    }
  }

  const allMaterials = new Set([
    ...arenaStats.materials,
    ...timelineStats.materials,
    ...dartStats.materials,
    ...squadKeys.flatMap((key) => squadStats[key].materials),
  ]);
  const squadMeshCount = squadKeys.reduce(
    (sum, key) => sum + squadStats[key].meshes.length,
    0,
  );

  return {
    arena: {
      ...arenaStats,
      sourceClips: assets.arena?.animations ?? [],
    },
    timeline: {
      ...timelineStats,
      camera,
      clips,
      sourceClips: assets.timeline?.animations ?? [],
    },
    dart: dartStats,
    hero: squadStats.hero,
    engineer: squadStats.engineer,
    infantry: squadStats.infantry,
    sentry: squadStats.sentry,
    totals: {
      meshes:
        arenaStats.meshes.length +
        timelineStats.meshes.length +
        dartStats.meshes.length +
        squadMeshCount,
      materials: allMaterials.size,
      emissive: arenaStats.emissiveMaterials.length,
    },
    issues,
  };
}
