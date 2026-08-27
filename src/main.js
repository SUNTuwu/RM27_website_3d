import * as THREE from "three";

import {
  auditProjectAssets,
  configureLoadedScene,
  createProjectAssetLoader,
} from "./core/assetPipeline.js";
import { assetUrl } from "./core/assetUrl.js";
import { createSymmetricArena } from "./arena/symmetricArena.js";
import { createStage } from "./core/stage.js";
import {
  FAR_SCAN,
  createPointCloud,
  createPointCloudFromData,
} from "./pointcloud/pointCloud.js";
import {
  fetchPointCloudBuffer,
  parsePointCloudData,
} from "./pointcloud/pointCloudData.js";
import { createBackRing } from "./pointcloud/backRing.js";
import { createTimelineController } from "./timeline/timelineController.js";
import { createLookAroundController } from "./timeline/lookAroundController.js";
import { createFocusController } from "./focus/focusController.js";
import { createRobotSquad } from "./robots/robotSquad.js";
import { createHud } from "./ui/hud.js";
import { createPulseGuide } from "./ui/pulseGuide.js";
import { createUnitSite } from "./ui/unitSite.js";
import { VISUAL_CONFIG } from "./config.js";

const ASSEMBLE_DURATION = 2.6;
const SCAN_DURATION = 3.2;
const DOCUMENT_REVEAL_DURATION_MS = 560;
const DOCUMENT_CANVAS_PARALLAX_RATIO = 0.14;
const EXPLORE_P1_DELAY_MS = 550;
const EXPLORE_CLOUD_BOOT_BUDGET_MS = 1_200;
const DEFERRED_SCENE_LAYER = 1;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function scheduleLowPriority(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 2_000 });
  } else {
    window.setTimeout(callback, 0);
  }
}

function yieldToMainThread() {
  if (globalThis.scheduler?.yield) {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => {
    if (document.visibilityState === "hidden") {
      window.setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function waitForDelay(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function trackPromiseState(promise) {
  if (!promise) return null;
  const state = {
    status: "pending",
    error: null,
    promise: null,
  };
  state.promise = Promise.resolve(promise).then(
    (value) => {
      state.status = "fulfilled";
      return value;
    },
    (error) => {
      state.status = "rejected";
      state.error = error;
      throw error;
    },
  );
  void state.promise.catch(() => {});
  return state;
}

function setObjectLayer(root, layer) {
  root.traverse((object) => object.layers.set(layer));
}

const hud = createHud();

let archiveIslandsPromise = null;
let archiveIslandsMounted = false;

function ensureArchiveIslands() {
  if (!archiveIslandsPromise) {
    archiveIslandsPromise = Promise.all([
      import("./ui/zoomParallax"),
      import("./ui/staggerTestimonials"),
      import("./ui/glowingChannels"),
    ])
      .then(([zoomParallax, staggerTestimonials, glowingChannels]) => {
        zoomParallax.mountZoomParallax();
        staggerTestimonials.mountStaggerTestimonials();
        glowingChannels.mountGlowingChannels();
        archiveIslandsMounted = true;
      })
      .catch((error) => {
        archiveIslandsPromise = null;
        throw error;
      });
  }
  return archiveIslandsPromise;
}

function requestArchiveIslands() {
  void ensureArchiveIslands().catch((error) => {
    console.error("[ENTERPRIZE] Archive islands preparation failed", error);
  });
}

// 2D 战队档案 (unit-site) 与 3D 状态机解耦: 移动端不 boot 时也可用。
// 桌面端 boot 完成后会把返回按钮接到 returnToTimeline 上。
const unitSiteUi = createUnitSite({
  onReturnToArena: () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
});

function releasePageScroll() {
  document.documentElement.classList.remove("is-scroll-locked");
}

function lockPageScroll() {
  document.documentElement.classList.add("is-scroll-locked");
}

let runtimePromise = null;

// 移动端同样运行完整 3D 流程: 竖向滑动手势映射为滚轮等效操作, 渲染端按触屏降 pixel ratio
export function startArenaRuntime(options = {}) {
  if (!runtimePromise) {
    runtimePromise = boot(options).catch((error) => {
      options.intro?.control?.setError?.(error?.message ?? String(error));
      console.error("[ENTERPRIZE] Arena runtime failed", error);
      hud.showError(error);
      releasePageScroll();
      throw error;
    });
  }
  return runtimePromise;
}

async function boot({
  intro = null,
  pointCloudUrl = assetUrl("pointcloud/arena_points.bin"),
  pointCloudBufferPromise = null,
  explorePointCloudUrls = {
    dart: assetUrl("pointcloud/dart_points.bin"),
    infantry: assetUrl("pointcloud/infantry_points.bin"),
    engineer: assetUrl("pointcloud/engineer_points.bin"),
  },
  explorePointCloudBufferPromises = {},
  onSceneReady,
} = {}) {
  hud.setState("boot");
  const introControl = intro?.control ?? null;
  introControl?.setError?.(null);

  const canvas = document.querySelector("#scene-canvas");
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const unitSite = document.querySelector("#unit-site");
  const documentIntro = document.querySelector("#zoom-parallax-root") ?? unitSite;
  const stage = createStage(canvas, VISUAL_CONFIG);
  const freeCamera = stage.freeCamera;
  const exploreFov = Number(VISUAL_CONFIG.explore.cameraFov);
  if (Number.isFinite(exploreFov)) {
    freeCamera.fov = exploreFov;
    freeCamera.updateProjectionMatrix();
  }

  // ---------- P0 资产: 首屏只等待预生成的场地点位 ----------
  const assetLoader = createProjectAssetLoader({
    onError: (error) => {
      console.error("[ENTERPRIZE] Deferred asset load failed", error);
    },
  });
  const pointBufferPromise =
    pointCloudBufferPromise ??
    fetchPointCloudBuffer(pointCloudUrl, {
      onProgress: (progress) => hud.setLoading(progress.ratio, progress.url),
    });
  hud.setLoading(0, pointCloudUrl);
  const pointBuffer = await pointBufferPromise;
  hud.setLoading(1, pointCloudUrl);
  introControl?.setProgress?.(0.72, "POINT CLOUD RECEIVED");
  performance.mark?.("enterprize:point-buffer-ready");
  performance.mark?.("enterprize:p0-geometry-start");
  const pointData = parsePointCloudData(pointBuffer, pointCloudUrl);
  const cloud = createPointCloudFromData(pointData, VISUAL_CONFIG.pointCloud);
  introControl?.setProgress?.(0.82, "POINT CLOUD READY");
  performance.mark?.("enterprize:p0-geometry-created");
  const minX = cloud.bounds.min.x;
  const maxX = cloud.bounds.max.x;

  // ---------- X 轴扫描裁剪平面 (预扫描: 实体全部隐藏) ----------
  const scanPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), minX - 1);
  stage.scene.add(cloud.points);

  // ---------- 点云背景装饰环 (仿 Endfield lore 三层 HUD 环) ----------
  // 面向相机的 sprite 组, 加色混合叠在点云后面; 点云阶段可见, SCAN 时渐隐
  const backRingConfig = VISUAL_CONFIG.backRing;
  const backRing = createBackRing(backRingConfig);
  const backRingDiameter =
    Math.max(cloud.extent.x, cloud.extent.y, cloud.extent.z) *
    backRingConfig.sizeScale;
  backRing.group.position.copy(cloud.center);
  backRing.group.scale.set(backRingDiameter, backRingDiameter, 1);
  stage.scene.add(backRing.group);

  // ---------- EXPLORE 多模型点云 (左右切换) ----------
  const arenaMaxExtent = Math.max(cloud.extent.x, cloud.extent.y, cloud.extent.z);
  cloud.setRippleScale(VISUAL_CONFIG.explore.models.arena.rippleBoost);

  const exploreModels = [
    {
      key: "arena",
      name: "RMUC ARENA",
      desc: "这里不是背景，而是所有战术发生的坐标。功能区、增益点与掩体，让每一次移动都成为决策。",
      cloud,
    },
    {
      key: "dart",
      name: "DART SYSTEM",
      desc: "制导飞镖如航天器修正航迹，以高速机动逼近目标，在唯一的窗口里一击定局。",
      cloud: null,
      loadPromise: null,
      pointCloudUrl: explorePointCloudUrls.dart,
      pointCloudBufferPromise: explorePointCloudBufferPromises.dart,
      pointCloudBufferState: trackPromiseState(
        explorePointCloudBufferPromises.dart,
      ),
    },
    {
      key: "infantry",
      name: "INFANTRY",
      desc: "串联腿赋予步兵高机动性与地形跨越能力；它在障碍之间连续奔行，如同穿梭于星辰。",
      cloud: null,
      loadPromise: null,
      pointCloudUrl: explorePointCloudUrls.infantry,
      pointCloudBufferPromise: explorePointCloudBufferPromises.infantry,
      pointCloudBufferState: trackPromiseState(
        explorePointCloudBufferPromises.infantry,
      ),
    },
    {
      key: "engineer",
      name: "ENGINEER",
      desc: "独特的月球车设计为复杂地形而生；像探索车驶过陌生月面，它把工程作业能力送达赛场的每个角落。",
      cloud: null,
      loadPromise: null,
      pointCloudUrl: explorePointCloudUrls.engineer,
      pointCloudBufferPromise: explorePointCloudBufferPromises.engineer,
      pointCloudBufferState: trackPromiseState(
        explorePointCloudBufferPromises.engineer,
      ),
    },
  ];
  const ARENA_MODEL_INDEX = 0;
  let exploreModelIndex = 0;
  let exploreTransitioning = false;
  let switchTween = null;
  let exploreSwitchRequest = 0;
  let scanRequested = false;
  let remainingExploreCloudsPromise = null;
  let exploreCloudBootState = {
    budgetMs: EXPLORE_CLOUD_BOOT_BUDGET_MS,
    elapsedMs: 0,
    budgetExhausted: false,
    deferredKeys: [],
  };

  const focusSlidesByKey = {
    hero: [
      { image: assetUrl("images/hero/arena-fleet.webp"), title: "HERO / 英雄机器人", desc: "大弹丸吊射与远程压制，是推进战线的核心火力。" },
      { image: assetUrl("images/hero/英雄.webp"), title: "HERO / 赛场机动", desc: "在高速转场中寻找远程打击窗口。" },
      { image: assetUrl("images/hero/英雄1.webp"), title: "HERO / 火力输出", desc: "改变战局的关键一击。" },
    ],
    engineer: [
      { image: assetUrl("images/engineer/0.webp"), title: "ENGINEER / 工程机器人", desc: "独特的月球车设计跨越复杂地形，把工程作业能力送达赛场各处。" },
      { image: assetUrl("images/engineer/工程.webp"), title: "ENGINEER / 机械臂作业", desc: "多自由度机械臂完成取矿、兑换与救援。" },
      { image: assetUrl("images/engineer/工程1.webp"), title: "ENGINEER / 地形跨越", desc: "像探索车驶过陌生月面，稳定穿越障碍。" },
      { image: assetUrl("images/engineer/工程2.webp"), title: "ENGINEER / 资源调度", desc: "持续的资源供给支撑整支队伍。" },
    ],
    infantry: [
      { image: assetUrl("images/infantry/0.webp"), title: "INFANTRY / 步兵机器人", desc: "串联腿带来高机动性与地形跨越能力。" },
      { image: assetUrl("images/infantry/步兵.webp"), title: "INFANTRY / 正面交火", desc: "在掩体与障碍之间持续穿梭。" },
      { image: assetUrl("images/infantry/步兵1.webp"), title: "INFANTRY / 快速机动", desc: "快速转场，像穿行于星辰之间。" },
      { image: assetUrl("images/infantry/步兵2.webp"), title: "INFANTRY / 集火推进", desc: "与队友协同撕开对方防线。" },
    ],
    sentry: [
      { image: assetUrl("images/sentry/0.webp"), title: "SENTRY / 哨兵机器人", desc: "自主巡逻、索敌与防守，是阵地前的持续战力。" },
      { image: assetUrl("images/sentry/哨兵.webp"), title: "SENTRY / 自动索敌", desc: "在无人值守状态下持续感知并响应战场。" },
    ],
  };
  let focusSlideIndex = 0;
  let focusMediaInitialized = false;
  let activeFocusKey = "hero";
  const preloadedFocusSlides = new Set();

  function activeFocusSlides() {
    return focusSlidesByKey[activeFocusKey] ?? focusSlidesByKey.hero;
  }

  function preloadFocusSlide(index) {
    const slides = activeFocusSlides();
    const normalized = ((index % slides.length) + slides.length) % slides.length;
    const cacheKey = `${activeFocusKey}:${normalized}`;
    if (preloadedFocusSlides.has(cacheKey)) return;
    preloadedFocusSlides.add(cacheKey);
    scheduleLowPriority(() => {
      const preload = new Image();
      preload.decoding = "async";
      preload.fetchPriority = "low";
      preload.src = slides[normalized].image;
    });
  }

  function switchFocusSlide(step) {
    const slides = activeFocusSlides();
    if (!slides.length) return;
    focusSlideIndex = ((focusSlideIndex + step) % slides.length + slides.length) % slides.length;
    focusMediaInitialized = true;
    hud.setFocusMedia(focusSlideIndex, slides.length, slides[focusSlideIndex]);
    preloadFocusSlide(focusSlideIndex + 1);
  }

  function ensureFocusMedia() {
    if (!focusMediaInitialized) switchFocusSlide(0);
  }

  hud.setFocusSwitchHandler(switchFocusSlide);

  const stagedAssets = {};
  const configuredAssetKeys = new Set();
  let report = null;
  let timeline = null;
  let focus = null;
  let focusTargets = [];
  let robotGuides = [];
  let arenaInstance = null;
  let robotSquadInstance = null;
  let emissiveMaterials = [];
  let contentMinX = minX;
  let contentMaxX = maxX;
  let animateTimeOffset = 0;
  let cameraTimeOffset = 0;
  let timelinePreplayStart = SCAN_DURATION;
  let cameraAttachScanTime = SCAN_DURATION;
  let cameraLead = 0;
  let deferredAssetsReady = false;
  let deferredAssetsError = null;
  let deferredAssetsPromise = null;
  let deferredWarmReport = [];

  function configureProjectAsset(key, gltf) {
    if (configuredAssetKeys.has(key)) {
      return;
    }
    configureLoadedScene(
      gltf.scene,
      stage.renderer,
      key === "timeline"
        ? { lightIntensityScale: VISUAL_CONFIG.timeline0.lightIntensityScale }
        : undefined,
    );
    configuredAssetKeys.add(key);
  }

  function simplifyTimelineHitMaterial(gltf) {
    const replacements = new Map();
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const nextMaterials = materials.map((material) => {
        if (material?.name?.toLowerCase() !== "hit") return material;
        if (!replacements.has(material)) {
          const replacement = new THREE.MeshBasicMaterial();
          replacement.copy(material);
          replacement.name = material.name;
          replacement.color.set(0xffffff);
          replacement.map = material.emissiveMap ?? material.map;
          replacement.alphaMap = material.alphaMap;
          replacement.depthWrite = false;
          replacement.toneMapped = false;
          replacement.needsUpdate = true;
          replacements.set(material, replacement);
        }
        return replacements.get(material);
      });
      object.material = Array.isArray(object.material)
        ? nextMaterials
        : nextMaterials[0];
    });
    replacements.forEach((_replacement, source) => source.dispose());
  }

  function normalizeExploreCloud(modelCloud, key) {
    const modelMaxExtent = Math.max(
      modelCloud.extent.x,
      modelCloud.extent.y,
      modelCloud.extent.z,
    );
    if (!Number.isFinite(modelMaxExtent) || modelMaxExtent <= 0) {
      throw new Error(`${key} point cloud has invalid bounds`);
    }
    const modelConfig = VISUAL_CONFIG.explore.models[key];
    const fit = (arenaMaxExtent * modelConfig.fitScale) / modelMaxExtent;
    modelCloud.setRippleScale(
      (modelMaxExtent / arenaMaxExtent) * modelConfig.rippleBoost,
    );
    modelCloud.points.scale.setScalar(fit);
    modelCloud.points.position
      .copy(cloud.center)
      .sub(modelCloud.center.clone().multiplyScalar(fit));
    modelCloud.points.visible = false;
    modelCloud.setProgress(1);
    stage.scene.add(modelCloud.points);
  }

  function ensureExploreCloud(entry, { allowModelFallback = true } = {}) {
    if (entry.cloud) {
      return Promise.resolve(entry.cloud);
    }
    if (entry.loadPromise) {
      return entry.loadPromise;
    }

    entry.loadPromise = (async () => {
      if (entry.pointCloudUrl) {
        try {
          const bufferPromise =
            entry.pointCloudBufferState?.promise ??
            entry.pointCloudBufferPromise;
          const buffer = bufferPromise
            ? await bufferPromise
            : await fetchPointCloudBuffer(entry.pointCloudUrl);
          const pointData = parsePointCloudData(buffer, entry.pointCloudUrl);
          const modelCloud = createPointCloudFromData(
            pointData,
            VISUAL_CONFIG.pointCloud,
          );
          normalizeExploreCloud(modelCloud, entry.key);
          entry.cloud = modelCloud;
          return modelCloud;
        } catch (error) {
          if (!allowModelFallback) {
            throw error;
          }
          console.warn(
            `[ENTERPRIZE] ${entry.key} point artifact unavailable; sampling glTF fallback`,
            error,
          );
        }
      }

      const gltf = await assetLoader.load(entry.key);
      stagedAssets[entry.key] = gltf;
      const assetReport = auditProjectAssets(
        { [entry.key]: gltf },
        { required: [entry.key] },
      );
      if (assetReport.issues.length) {
        throw new Error(
          `${entry.key} asset audit failed: ${assetReport.issues.join("; ")}`,
        );
      }
      configureProjectAsset(entry.key, gltf);
      const modelCloud = createPointCloud(gltf.scene, {
        ...VISUAL_CONFIG.pointCloud,
        recenter: true,
      });
      normalizeExploreCloud(modelCloud, entry.key);
      entry.cloud = modelCloud;
      return modelCloud;
    })()
      .catch((error) => {
        entry.loadPromise = null;
        throw error;
      });
    return entry.loadPromise;
  }

  async function prepareExploreCloudsForLaunch() {
    const startedAt = performance.now();
    const deadline = startedAt + EXPLORE_CLOUD_BOOT_BUDGET_MS;
    const pending = new Set(exploreModels.slice(1));

    while (pending.size > 0 && performance.now() < deadline) {
      let settledEntryHandled = false;
      for (const entry of [...pending]) {
        const bufferState = entry.pointCloudBufferState;
        if (bufferState?.status === "rejected") {
          pending.delete(entry);
          settledEntryHandled = true;
          console.warn(
            `[ENTERPRIZE] ${entry.key} EXPLORE point prefetch failed`,
            bufferState.error,
          );
          continue;
        }
        if (!bufferState || bufferState.status !== "fulfilled") continue;
        if (performance.now() >= deadline) break;

        pending.delete(entry);
        settledEntryHandled = true;
        await yieldToMainThread();
        try {
          await ensureExploreCloud(entry, { allowModelFallback: false });
          performance.mark?.(`enterprize:explore-cloud-${entry.key}-ready`);
        } catch (error) {
          // Keep the arena usable if a generated artifact is invalid. Selecting
          // that model later retries through the existing glTF sampling path.
          console.warn(
            `[ENTERPRIZE] Unable to prebuild ${entry.key} EXPLORE cloud`,
            error,
          );
        }
      }

      if (pending.size === 0 || performance.now() >= deadline) break;
      if (!settledEntryHandled) {
        const pendingSettlements = [...pending]
          .map((entry) => entry.pointCloudBufferState?.promise)
          .filter(Boolean)
          .map((promise) => promise.then(
            () => undefined,
            () => undefined,
          ));
        if (pendingSettlements.length === 0) break;
        await Promise.race([
          ...pendingSettlements,
          waitForDelay(Math.max(deadline - performance.now(), 0)),
        ]);
      }
    }

    const deferredKeys = exploreModels
      .slice(1)
      .filter((entry) => !entry.cloud)
      .map((entry) => entry.key);
    exploreCloudBootState = {
      budgetMs: EXPLORE_CLOUD_BOOT_BUDGET_MS,
      elapsedMs: performance.now() - startedAt,
      budgetExhausted:
        deferredKeys.length > 0 && performance.now() >= deadline,
      deferredKeys,
    };
  }

  function prepareRemainingExploreClouds() {
    if (remainingExploreCloudsPromise) return remainingExploreCloudsPromise;

    remainingExploreCloudsPromise = (async () => {
      const pending = new Set(
        exploreModels.slice(1).filter((entry) => !entry.cloud),
      );
      while (pending.size > 0 && state === "explore") {
        const settlement = await Promise.race(
          [...pending].map(async (entry) => {
            try {
              if (entry.pointCloudBufferState?.promise) {
                await entry.pointCloudBufferState.promise;
              }
              return { entry, error: null };
            } catch (error) {
              return { entry, error };
            }
          }),
        );
        pending.delete(settlement.entry);
        if (settlement.error || state !== "explore") continue;

        await yieldToMainThread();
        if (state !== "explore") break;
        try {
          await ensureExploreCloud(settlement.entry, {
            allowModelFallback: false,
          });
          performance.mark?.(
            `enterprize:explore-cloud-${settlement.entry.key}-background-ready`,
          );
        } catch (error) {
          console.warn(
            `[ENTERPRIZE] Background EXPLORE cloud preparation failed for ${settlement.entry.key}`,
            error,
          );
        }
      }
    })();
    return remainingExploreCloudsPromise;
  }

  function startExploreTransition(outgoing, incoming, requestId) {
    const trans = VISUAL_CONFIG.explore.switchTransition;
    const spin = trans.spinTurns * Math.PI * 2;
    const ringSpeedMultiplier = Math.max(
      Number(trans.ringSpeedMultiplier) || 1,
      1,
    );
    const outCloud = outgoing.cloud;
    const inCloud = incoming.cloud;
    const startRotation = outCloud.points.rotation.y;
    const maskStart = -trans.maskFeather;
    const maskEnd = 1 + trans.maskFeather;
    outCloud.points.visible = true;
    inCloud.points.visible = true;
    outCloud.points.rotation.y = startRotation;
    inCloud.points.rotation.y = startRotation;
    outCloud.setScreenMask(
      maskStart,
      1,
      trans.maskFeather,
      trans.maskGlowStrength,
    );
    inCloud.setScreenMask(
      maskStart,
      -1,
      trans.maskFeather,
      trans.maskGlowStrength,
    );

    switchTween = addTween({
      duration: trans.duration,
      onUpdate: (_e, k) => {
        const maskProgress = THREE.MathUtils.lerp(maskStart, maskEnd, k);
        outCloud.setScreenMask(
          maskProgress,
          1,
          trans.maskFeather,
          trans.maskGlowStrength,
        );
        inCloud.setScreenMask(
          maskProgress,
          -1,
          trans.maskFeather,
          trans.maskGlowStrength,
        );

        // 两套点云共用同一加速/减速角度曲线，保持每一帧角速度一致。
        const spinPhase = Math.min(
          k / Math.max(trans.spinCompleteAt, 0.001),
          1,
        );
        const ringSpeedBlend = Math.sin(Math.PI * spinPhase);
        backRing.setSpeedScale(
          THREE.MathUtils.lerp(1, ringSpeedMultiplier, ringSpeedBlend),
        );
        const rotation = startRotation + spin * easeInOutCubic(spinPhase);
        outCloud.points.rotation.y = rotation;
        inCloud.points.rotation.y = rotation;
      },
      onComplete: () => {
        const finalRotation = THREE.MathUtils.euclideanModulo(
          startRotation + spin,
          Math.PI * 2,
        );
        outCloud.points.visible = false;
        outCloud.points.rotation.y = finalRotation;
        inCloud.points.rotation.y = finalRotation;
        outCloud.resetScreenMask();
        inCloud.resetScreenMask();
        backRing.setSpeedScale(1);
        switchTween = null;
        exploreTransitioning = false;
        if (requestId !== exploreSwitchRequest) {
          return;
        }
        continueScanRequest();
      },
    });
  }

  function switchExploreModel(next) {
    if (exploreTransitioning) {
      return;
    }
    const total = exploreModels.length;
    const outgoingIndex = exploreModelIndex;
    const nextIndex = ((next % total) + total) % total;
    const outgoing = exploreModels[outgoingIndex];
    const incoming = exploreModels[nextIndex];
    exploreModelIndex = nextIndex;
    hud.setExploreModel(nextIndex, total, incoming.name, incoming.desc);
    if (nextIndex === outgoingIndex) {
      return; // 初始化调用: 仅刷新 HUD
    }

    exploreTransitioning = true;
    const requestId = ++exploreSwitchRequest;
    if (!incoming.cloud) {
      hud.setExploreModel(
        nextIndex,
        total,
        incoming.name,
        `${incoming.desc} / LOADING...`,
      );
    }
    ensureExploreCloud(incoming)
      .then(() => {
        if (requestId !== exploreSwitchRequest) {
          return;
        }
        hud.setExploreModel(nextIndex, total, incoming.name, incoming.desc);
        startExploreTransition(outgoing, incoming, requestId);
      })
      .catch((error) => {
        if (requestId !== exploreSwitchRequest) {
          return;
        }
        console.error(`[ENTERPRIZE] Unable to prepare ${incoming.key}`, error);
        exploreModelIndex = outgoingIndex;
        exploreTransitioning = false;
        hud.setExploreModel(
          outgoingIndex,
          total,
          outgoing.name,
          outgoing.desc,
        );
        continueScanRequest();
      });
  }

  // ---------- EXPLORE 左偏构图 (点云移到屏幕左 1/3, SCAN 时回中) ----------
  let viewOffsetX = 0;
  let viewOffsetY = 0;
  function applyViewOffset() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    freeCamera.setViewOffset(w, h, viewOffsetX, viewOffsetY, w, h);
  }

  // ---------- 氛围: 星空 ----------
  stage.scene.add(createStars());

  // ---------- P1 资产: EXPLORE 首帧稳定后分批准备 SCAN / SCRUB ----------
  async function runDeferredPhase(name, operation) {
    await yieldToMainThread();
    const startMark = `enterprize:p1-${name}-start`;
    const endMark = `enterprize:p1-${name}-end`;
    performance.mark?.(startMark);
    const result = await operation();
    performance.mark?.(endMark);
    performance.measure?.(`enterprize:p1-${name}`, startMark, endMark);
    return result;
  }

  function collectDeferredWarmEntries(groups) {
    return groups.flatMap(({ name: group, root }) => {
      const entries = [];
      root.traverse((object) => {
        if (
          !object.isMesh &&
          !object.isPoints &&
          !object.isLine &&
          !object.isSprite
        ) {
          return;
        }
        const materials = Array.isArray(object.material)
          ? [...new Set(object.material.filter(Boolean))]
          : [object.material].filter(Boolean);
        materials.forEach((material) => {
          entries.push({
            group,
            name: `${group}-${String(entries.length + 1).padStart(2, "0")}`,
            root: object,
            material,
          });
        });
      });
      return entries;
    });
  }

  async function warmDeferredRoots(entries) {
    const renderer = stage.renderer;
    const warmCamera = freeCamera.clone();
    warmCamera.layers.set(DEFERRED_SCENE_LAYER);
    deferredWarmReport = [];
    const initializedTextures = new Set();
    const warmTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    const previousVisibility = new Map(
      entries.map(({ root }) => [root, root.visible]),
    );

    const collectTextures = (root) => {
      const textures = [];
      const appendTexture = (value) => {
        if (value?.isTexture && !initializedTextures.has(value)) {
          initializedTextures.add(value);
          textures.push(value);
        }
      };
      root.traverse((object) => {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          Object.values(material).forEach(appendTexture);
          Object.values(material.uniforms ?? {}).forEach((uniform) => {
            const value = uniform?.value;
            if (Array.isArray(value)) value.forEach(appendTexture);
            else appendTexture(value);
          });
        });
      });
      return textures;
    };

    try {
      renderer.initRenderTarget(warmTarget);
      for (const { group, name, root, material } of entries) {
        await yieldToMainThread();
        entries.forEach(({ root: candidate }) => {
          candidate.visible = candidate === root;
        });
        const objectStates = [];
        const previousMaterial = root.material;
        root.material = material;
        let renderableCount = 0;
        root.traverse((object) => {
          objectStates.push({
            object,
            visible: object.visible,
            frustumCulled: object.frustumCulled,
          });
          object.visible = true;
          object.frustumCulled = false;
          if (
            object.isMesh ||
            object.isPoints ||
            object.isLine ||
            object.isSprite
          ) {
            renderableCount += 1;
          }
        });

        try {
          const startMark = `enterprize:p1-warm-${name}-start`;
          const endMark = `enterprize:p1-warm-${name}-end`;
          performance.mark?.(startMark);
          const textures = collectTextures(root);
          for (const [textureIndex, texture] of textures.entries()) {
            await yieldToMainThread();
            const textureMark = `enterprize:p1-texture-${name}-${textureIndex + 1}`;
            performance.mark?.(`${textureMark}-start`);
            renderer.initTexture(texture);
            performance.mark?.(`${textureMark}-end`);
            performance.measure?.(
              textureMark,
              `${textureMark}-start`,
              `${textureMark}-end`,
            );
          }
          await yieldToMainThread();
          const compileMark = `enterprize:p1-object-compile-${name}`;
          performance.mark?.(`${compileMark}-start`);
          await renderer.compileAsync(root, warmCamera, stage.scene);
          performance.mark?.(`${compileMark}-end`);
          performance.measure?.(
            compileMark,
            `${compileMark}-start`,
            `${compileMark}-end`,
          );
          await yieldToMainThread();

          const uploadMark = `enterprize:p1-object-upload-${name}`;
          performance.mark?.(`${uploadMark}-start`);
          const previousTarget = renderer.getRenderTarget();
          const previousViewport = renderer.getViewport(new THREE.Vector4());
          const previousScissor = renderer.getScissor(new THREE.Vector4());
          const previousScissorTest = renderer.getScissorTest();
          try {
            renderer.setRenderTarget(warmTarget);
            renderer.setViewport(0, 0, 1, 1);
            renderer.setScissorTest(false);
            renderer.clear();
            renderer.render(stage.scene, warmCamera);
          } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setViewport(previousViewport);
            renderer.setScissor(previousScissor);
            renderer.setScissorTest(previousScissorTest);
          }
          performance.mark?.(`${uploadMark}-end`);
          performance.measure?.(
            uploadMark,
            `${uploadMark}-start`,
            `${uploadMark}-end`,
          );
          performance.mark?.(endMark);
          performance.measure?.(
            `enterprize:p1-warm-${name}`,
            startMark,
            endMark,
          );
          deferredWarmReport.push({
            group,
            name,
            material: material.name ?? material.type,
            cameraMask: warmCamera.layers.mask,
            renderableCount,
            textureCount: textures.length,
            frustumCullingDisabled: true,
          });
        } finally {
          root.material = previousMaterial;
          objectStates.forEach(({ object, visible, frustumCulled }) => {
            object.visible = visible;
            object.frustumCulled = frustumCulled;
          });
          root.visible = previousVisibility.get(root);
        }
      }
    } finally {
      entries.forEach(({ root }) => {
        root.visible = previousVisibility.get(root);
      });
      warmTarget.dispose();
    }
  }

  function prepareDeferredAssets() {
    if (deferredAssetsPromise) {
      return deferredAssetsPromise;
    }

    performance.mark?.("enterprize:p1-start");
    deferredAssetsPromise = (async () => {
      const assetLoadConcurrency = isCoarsePointer ? 1 : 2;
      const scanCore = await assetLoader.loadMany(["arena", "timeline"], {
        concurrency: assetLoadConcurrency,
      });
      performance.mark?.("enterprize:p1-scan-core-loaded");
      await yieldToMainThread();
      const squadAssets = await assetLoader.loadMany(
        ["hero", "engineer", "infantry", "sentry"],
        { concurrency: assetLoadConcurrency },
      );
      performance.mark?.("enterprize:p1-squad-loaded");
      const loaded = { ...scanCore, ...squadAssets };
      arenaInstance = await runDeferredPhase(
        "arena-symmetry",
        () => createSymmetricArena(
          loaded.arena,
          VISUAL_CONFIG.arena.symmetry,
        ),
      );
      loaded.arena = arenaInstance.asset;
      simplifyTimelineHitMaterial(loaded.timeline);
      Object.assign(stagedAssets, loaded);
      report = await runDeferredPhase("asset-audit", () =>
        auditProjectAssets(stagedAssets, {
          required: [
            "arena",
            "timeline",
            "hero",
            "engineer",
            "infantry",
            "sentry",
          ],
        }),
      );
      if (report.issues.length) {
        throw new Error(`Asset audit failed: ${report.issues.join("; ")}`);
      }

      for (const key of [
        "arena",
        "timeline",
        "hero",
        "engineer",
        "infantry",
        "sentry",
      ]) {
        await runDeferredPhase(`configure-${key}`, () => {
          configureProjectAsset(key, loaded[key]);
        });
      }
      // 红蓝两侧编队: 蓝侧为导出原始位姿, 红侧绕 Y 轴旋转 π 镜像
      robotSquadInstance = await runDeferredPhase("squad-create", () =>
        createRobotSquad(
          {
            hero: loaded.hero,
            engineer: loaded.engineer,
            infantry: loaded.infantry,
            sentry: loaded.sentry,
          },
          { ...VISUAL_CONFIG.arena.symmetry, ...VISUAL_CONFIG.robots },
        ),
      );
      performance.mark?.("enterprize:p1-squad-created");
      await yieldToMainThread();

      [
        ...report.arena.materials,
        ...report.timeline.materials,
        ...robotSquadInstance.materials,
      ].forEach((material) => {
        material.clippingPlanes = [scanPlane];
        material.clipShadows = false;
      });
      const deferredSceneRoots = [
        loaded.arena.scene,
        loaded.timeline.scene,
        robotSquadInstance.root,
      ];
      deferredSceneRoots.forEach((root) => {
        setObjectLayer(root, DEFERRED_SCENE_LAYER);
      });
      // The warm camera only sees the deferred layer. Keep lights on layer 0
      // for the live scene, while also exposing them to layer 1 so PBR shader
      // variants compile with the same light rig used by the SCAN camera.
      stage.scene.traverse((object) => {
        if (object.isLight) object.layers.enable(DEFERRED_SCENE_LAYER);
      });
      stage.scene.add(
        ...deferredSceneRoots,
      );
      await yieldToMainThread();

      const timelineCamera = report.timeline.camera;
      stage.registerCamera(timelineCamera);
      freeCamera.fov = timelineCamera.fov;
      freeCamera.updateProjectionMatrix();
      timeline = createTimelineController({
        root: loaded.timeline.scene,
        clip: report.timeline.sourceClips[0],
        camera: timelineCamera,
        wheelImpulse: VISUAL_CONFIG.timeline0.scroll.wheelImpulse,
        maxRate: VISUAL_CONFIG.timeline0.scroll.maxRate,
        velocityDecay: VISUAL_CONFIG.timeline0.scroll.velocityDecay,
        autoHoldSeconds: VISUAL_CONFIG.timeline0.scroll.autoHoldSeconds,
      });
      animateTimeOffset = THREE.MathUtils.clamp(
        VISUAL_CONFIG.timeline0.animateTimeOffset,
        0,
        Math.min(SCAN_DURATION, timeline.clip.duration),
      );
      cameraTimeOffset = THREE.MathUtils.clamp(
        VISUAL_CONFIG.timeline0.cameraTimeOffset,
        0,
        animateTimeOffset,
      );
      timelinePreplayStart = SCAN_DURATION - animateTimeOffset;
      cameraAttachScanTime = timelinePreplayStart + cameraTimeOffset;
      cameraLead = THREE.MathUtils.clamp(
        VISUAL_CONFIG.timeline0.cameraLeadSeconds ?? 0,
        0,
        Math.max(SCAN_DURATION - 0.1, 0),
      );

      const focusPanels = {
        hero: { name: "HERO", index: "#01", cn: "英雄机器人", desc: "地面主力输出兵种，以大弹丸远程压制打开推进空间。" },
        engineer: { name: "ENGINEER", index: "#02", cn: "工程机器人", desc: "独特的月球车设计跨越复杂地形，以机械臂完成取矿、兑换与救援。" },
        infantry: { name: "INFANTRY", index: "#04", cn: "步兵机器人", desc: "串联腿赋予高机动性与地形跨越能力，在障碍之间持续穿梭。" },
        sentry: { name: "SENTRY", index: "#07", cn: "哨兵机器人", desc: "自主巡逻、索敌与防守，持续守住基地与前哨站。" },
      };
      const squad = robotSquadInstance;
      const squadTarget = (key, side) => ({
        key: side === "red" ? `${key}-red` : key,
        name: focusPanels[key].name,
        root: side === "red" ? squad.redRobots[key] : squad.blueRobots[key],
        ringColor: side === "red" ? 0xff2d4d : 0x2e9bff,
        highlightMaterials: false,
        trackNode: squad.trackNodes[side][key],
        panel: focusPanels[key],
      });
      focusTargets = [
        squadTarget("hero", "blue"),
        { ...squadTarget("engineer", "blue"), guide: "#2e9bff" },
        { ...squadTarget("infantry", "blue"), guide: "#2e9bff" },
        squadTarget("sentry", "blue"),
        { ...squadTarget("hero", "red"), guide: "#ff2d4d" },
        squadTarget("engineer", "red"),
        squadTarget("infantry", "red"),
        { ...squadTarget("sentry", "red"), guide: "#ff2d4d" },
      ];
      const focusConfig = VISUAL_CONFIG.focus;
      await yieldToMainThread();
      focus = createFocusController({
        camera: freeCamera,
        targets: focusTargets,
        scene: stage.scene,
        distanceRatio: isCoarsePointer
          ? focusConfig.mobileDistanceRatio
          : focusConfig.distanceRatio,
        hitRadiusScale: isCoarsePointer
          ? focusConfig.mobileHitRadiusScale
          : focusConfig.hitRadiusScale,
        hitHeightScale: isCoarsePointer
          ? focusConfig.mobileHitHeightScale
          : focusConfig.hitHeightScale,
      });
      robotGuides = focusTargets.map((target) =>
        target.guide
          ? createPulseGuide({
              size: isCoarsePointer
                ? Math.max(clickGuideConfig.sizePx, 52)
                : clickGuideConfig.sizePx,
              rhythmSeconds: clickGuideConfig.rhythmSeconds,
              fadeSeconds: clickGuideConfig.fadeSeconds,
              color: target.guide,
            })
          : null,
      );
      focus.setOnModeChange((mode, finished) => {
        if (
          mode === "idle" &&
          finished === "exiting" &&
          (state === "focus" || focusExitPhase === "exiting")
        ) {
          delete appElement.dataset.focusLeaving;
          focusExitPhase = "idle";
          setState("scrub");
          timeline.resumeFromCameraOverride();
          timelineHandoffThisFrame = true;
          archiveAutoEntryArmed = false;
          archiveAutoEntryRequiresInput = true;
        }
      });

      const timelineBounds = new THREE.Box3().setFromObject(loaded.timeline.scene);
      const squadBounds = new THREE.Box3().setFromObject(robotSquadInstance.root);
      contentMinX = Math.min(
        cloud.bounds.min.x,
        timelineBounds.min.x,
        squadBounds.min.x,
      );
      contentMaxX = Math.max(
        cloud.bounds.max.x,
        timelineBounds.max.x,
        squadBounds.max.x,
      );
      scanPlane.constant = contentMinX - 1;
      await yieldToMainThread();

      const glowGroups = [
        VISUAL_CONFIG.arena.glow.red,
        VISUAL_CONFIG.arena.glow.blue,
      ];
      emissiveMaterials = report.arena.emissiveMaterials.map((material) => {
        const glowGroup = glowGroups.find((group) =>
          material.name.startsWith(group.materialPrefix),
        );
        const base =
          material.emissiveIntensity *
          (glowGroup?.emissiveIntensityScale ?? 1);
        material.emissiveIntensity = base;
        return { material, base };
      });

      const deferredWarmEntries = collectDeferredWarmEntries([
        { name: "arena", root: loaded.arena.scene },
        { name: "timeline", root: loaded.timeline.scene },
        { name: "squad-blue", root: robotSquadInstance.teamRoots.blue },
        { name: "squad-red", root: robotSquadInstance.teamRoots.red },
      ]);
      performance.mark?.("enterprize:p1-compile-start");
      await warmDeferredRoots(deferredWarmEntries);
      performance.mark?.("enterprize:p1-compile-end");
      deferredAssetsReady = true;
      performance.mark?.("enterprize:p1-ready");
      console.info("[ENTERPRIZE] deferred SCAN assets ready");
      continueScanRequest();
      return stagedAssets;
    })().catch((error) => {
      deferredAssetsError = error;
      throw error;
    });
    return deferredAssetsPromise;
  }

  // ---------- 轻量 tween ----------
  const tweens = new Set();
  function addTween({ duration, ease = easeInOutCubic, onUpdate, onComplete }) {
    const item = { elapsed: 0, duration, ease, onUpdate, onComplete };
    tweens.add(item);
    return item;
  }
  function updateTweens(delta) {
    for (const item of [...tweens]) {
      item.elapsed += delta;
      const k = Math.min(item.elapsed / item.duration, 1);
      item.onUpdate?.(item.ease(k), k);
      if (k >= 1) {
        tweens.delete(item);
        item.onComplete?.();
      }
    }
  }

  // ---------- EXPLORE 环绕视角 ----------
  const orbitTarget = cloud.center.clone();
  orbitTarget.y += cloud.extent.y * 0.08;
  const configuredInitialPitch = Number(
    VISUAL_CONFIG.explore.initialPitchDeg,
  );
  const initialPitchDeg = Number.isFinite(configuredInitialPitch)
    ? configuredInitialPitch
    : 35;
  const initialOrbitPhi = THREE.MathUtils.clamp(
    Math.PI / 2 - THREE.MathUtils.degToRad(initialPitchDeg),
    0.55,
    1.45,
  );
  const orbit = {
    radius: THREE.MathUtils.clamp(
      (Math.max(cloud.extent.x, cloud.extent.z) * 1.02) /
        VISUAL_CONFIG.explore.zoom,
      16 / VISUAL_CONFIG.explore.zoom,
      42 / VISUAL_CONFIG.explore.zoom,
    ),
    theta: -0.85,
    phi: initialOrbitPhi,
    thetaT: -0.85,
    phiT: initialOrbitPhi,
    drag(dx, dy) {
      this.thetaT += dx * 0.0042;
      this.phiT = THREE.MathUtils.clamp(this.phiT - dy * 0.0042, 0.55, 1.45);
    },
    update(delta) {
      this.thetaT += delta * VISUAL_CONFIG.explore.autoRotateSpeed;
      const k = 1 - Math.exp(-delta * 7);
      this.theta += (this.thetaT - this.theta) * k;
      this.phi += (this.phiT - this.phi) * k;
      const sinPhi = Math.sin(this.phi);
      freeCamera.position.set(
        orbitTarget.x + this.radius * sinPhi * Math.cos(this.theta),
        orbitTarget.y + this.radius * Math.cos(this.phi),
        orbitTarget.z + this.radius * sinPhi * Math.sin(this.theta),
      );
      freeCamera.lookAt(orbitTarget);
    },
  };
  orbit.update(0); // 初始取景

  const lookPivot = cloud.center.clone();
  lookPivot.y = 0;
  const lookAroundConfig = {
    ...VISUAL_CONFIG.timeline0.lookAround,
    yawSpeed: isCoarsePointer
      ? VISUAL_CONFIG.timeline0.lookAround.mobileYawSpeed
      : VISUAL_CONFIG.timeline0.lookAround.yawSpeed,
  };
  const lookAround = createLookAroundController({
    camera: freeCamera,
    pivot: lookPivot,
    config: lookAroundConfig,
  });

  // ---------- 全局状态机 ----------
  let state = "boot";
  let documentRevealFrame = 0;
  let documentRevealInProgress = false;

  function updateDocumentParallax(scrollY = window.scrollY) {
    const revealDistance = Math.max(documentIntro.offsetTop, 1);
    const progress = Math.min(Math.max(scrollY / revealDistance, 0), 1);
    const canvasShift =
      -window.innerHeight * DOCUMENT_CANVAS_PARALLAX_RATIO * progress;
    document.documentElement.style.setProperty(
      "--document-canvas-shift",
      `${canvasShift.toFixed(2)}px`,
    );
  }

  function stopDocumentReveal() {
    if (documentRevealFrame) {
      cancelAnimationFrame(documentRevealFrame);
      documentRevealFrame = 0;
    }
    documentRevealInProgress = false;
    document.documentElement.classList.remove("is-document-transitioning");
  }

  function revealUnitArchive() {
    stopDocumentReveal();
    const root = document.documentElement;
    const maxScrollY = Math.max(root.scrollHeight - window.innerHeight, 0);
    const targetY = Math.min(documentIntro.offsetTop, maxScrollY);
    const startY = window.scrollY;
    const distance = targetY - startY;

    documentRevealInProgress = true;
    root.classList.add("is-document-transitioning");

    if (
      Math.abs(distance) < 1 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      updateDocumentParallax(targetY);
      window.scrollTo(0, targetY);
      stopDocumentReveal();
      return;
    }

    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(
        (now - startedAt) / DOCUMENT_REVEAL_DURATION_MS,
        1,
      );
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextScrollY = startY + distance * eased;
      updateDocumentParallax(nextScrollY);
      window.scrollTo(0, nextScrollY);

      if (progress < 1) {
        documentRevealFrame = requestAnimationFrame(step);
        return;
      }

      window.scrollTo(0, targetY);
      stopDocumentReveal();
    };

    documentRevealFrame = requestAnimationFrame(step);
  }

  let exploreCloudScheduleToken = 0;
  let exploreP1Timer = 0;

  function cancelExploreCloudSchedule() {
    exploreCloudScheduleToken += 1;
    if (exploreP1Timer) {
      window.clearTimeout(exploreP1Timer);
      exploreP1Timer = 0;
    }
  }

  function scheduleExploreCloudCompletion() {
    cancelExploreCloudSchedule();
    const token = exploreCloudScheduleToken;
    performance.mark?.("enterprize:explore-enter");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (token !== exploreCloudScheduleToken || state !== "explore") return;
        performance.mark?.("enterprize:explore-first-paint");
        scheduleLowPriority(() => {
          if (token !== exploreCloudScheduleToken || state !== "explore") return;
          void prepareRemainingExploreClouds().catch((error) => {
            console.error(
              "[ENTERPRIZE] Remaining EXPLORE cloud preparation failed",
              error,
            );
          });
        });
        exploreP1Timer = window.setTimeout(() => {
          exploreP1Timer = 0;
          scheduleLowPriority(() => {
            if (token !== exploreCloudScheduleToken || state !== "explore") return;
            void prepareDeferredAssets().catch((error) => {
              console.error(
                "[ENTERPRIZE] Deferred SCAN asset preparation failed",
                error,
              );
            });
          });
        }, EXPLORE_P1_DELAY_MS);
      });
    });
  }

  function setState(next) {
    if (next !== state && (state === "scrub" || next === "scrub")) {
      lookAround.reset();
    }
    const prev = state;
    state = next;
    if (["scan", "scrub", "focus", "end"].includes(next)) {
      freeCamera.layers.enable(DEFERRED_SCENE_LAYER);
    } else {
      freeCamera.layers.disable(DEFERRED_SCENE_LAYER);
    }
    hud.setState(next);
    focus?.setHighlightTarget(next === "scrub" || next === "focus" ? 1 : 0);
    if (next === "explore") {
      exploreLastClickAt = elapsedNow; // 进入 EXPLORE 重新计时闲置引导
      scheduleExploreCloudCompletion();
    } else if (prev === "explore") {
      cancelExploreCloudSchedule();
      clickGuide.hide();
    }
    if (next === "scrub") {
      timeline?.setAutoDrive(true); // 切换到 timeline_0 自动推进进度条
      scheduleLowPriority(requestArchiveIslands);
      window.dispatchEvent(new Event("enterprize:video-prewarm"));
    }
  }

  let archiveEntryPending = false;
  let archiveAutoEntryArmed = true;
  let archiveAutoEntryRequiresInput = false;
  function enterUnitArchive() {
    if (state !== "scrub" || !lookAround.isIdle || archiveEntryPending) {
      return;
    }
    archiveAutoEntryArmed = false;
    archiveEntryPending = true;
    timeline.setAutoDrive(false);
    const startArchive = () => {
      archiveEntryPending = false;
      setState("end");
      document.documentElement.classList.add("is-document-mode");
      window.dispatchEvent(new Event("enterprize:zoom-activate"));
      releasePageScroll();
      updateDocumentParallax();
      revealUnitArchive();
      stage.pause();
    };
    if (archiveIslandsMounted) {
      startArchive();
      return;
    }
    void ensureArchiveIslands()
      .then(startArchive)
      .catch((error) => {
        archiveEntryPending = false;
        hud.showError(error);
        releasePageScroll();
      });
  }

  function returnToTimeline() {
    if (state !== "end") {
      return;
    }
    stage.resume();
    stopDocumentReveal();
    window.scrollTo(0, 0);
    document.documentElement.classList.remove("is-document-mode");
    document.documentElement.style.removeProperty("--document-canvas-shift");
    lockPageScroll();
    setState("scrub");
    hud.setTimeline(timeline.progress);
  }

  const archiveReturnFade = document.querySelector("#archive-return-fade");
  let arenaReturnInProgress = false;

  function cssTimeToMs(value) {
    const trimmed = value.trim();
    const numeric = Number.parseFloat(trimmed);
    if (!Number.isFinite(numeric)) return 0;
    return trimmed.endsWith("ms") ? numeric : numeric * 1_000;
  }

  function waitForOpacityTransition(element) {
    if (!element) return Promise.resolve();
    const style = getComputedStyle(element);
    const durations = style.transitionDuration.split(",").map(cssTimeToMs);
    const delays = style.transitionDelay.split(",").map(cssTimeToMs);
    const maxDuration = durations.reduce(
      (max, duration, index) =>
        Math.max(max, duration + (delays[index % delays.length] ?? 0)),
      0,
    );
    if (maxDuration <= 0) return Promise.resolve();

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        element.removeEventListener("transitionend", onTransitionEnd);
        window.clearTimeout(timeout);
        resolve();
      };
      const onTransitionEnd = (event) => {
        if (event.target === element && event.propertyName === "opacity") finish();
      };
      const timeout = window.setTimeout(finish, maxDuration + 100);
      element.addEventListener("transitionend", onTransitionEnd);
    });
  }

  async function setArchiveReturnFade(visible) {
    if (!archiveReturnFade) return;
    void archiveReturnFade.offsetWidth;
    const transition = waitForOpacityTransition(archiveReturnFade);
    archiveReturnFade.classList.toggle("is-visible", visible);
    await transition;
  }

  function waitForTwoFrames() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  async function returnToArenaOverview() {
    if (state !== "end" || arenaReturnInProgress) return;
    arenaReturnInProgress = true;
    archiveAutoEntryArmed = false;
    archiveAutoEntryRequiresInput = true;
    const root = document.documentElement;
    root.dataset.arenaReturnPhase = "covering";
    performance.mark?.("enterprize:arena-return-start");

    try {
      await setArchiveReturnFade(true);
      root.dataset.arenaReturnPhase = "preparing";
      stage.resume();
      stopDocumentReveal();
      window.scrollTo(0, 0);
      root.classList.remove("is-document-mode");
      root.style.removeProperty("--document-canvas-shift");
      lockPageScroll();
      setState("scrub");
      hud.setTimeline(timeline.progress);
      archiveAutoEntryArmed = false;
      archiveAutoEntryRequiresInput = true;
      lookAround.enterOverview();

      await waitForTwoFrames();
      root.dataset.arenaReturnPhase = "revealing";
      await setArchiveReturnFade(false);
      performance.mark?.("enterprize:arena-return-complete");
    } finally {
      archiveReturnFade?.classList.remove("is-visible");
      root.dataset.arenaReturnPhase = "idle";
      arenaReturnInProgress = false;
    }
  }

  // ---------- SCRUB 回滚到起点: 渐隐黑场后从点云聚拢前重新加载 EXPLORE ----------
  const stateFade = document.querySelector("#state-fade");
  let exploreReloading = false;

  function restartExploreFromStart() {
    if (exploreReloading || state !== "scrub") {
      return;
    }
    exploreReloading = true;
    archiveAutoEntryArmed = true;
    archiveAutoEntryRequiresInput = false;
    timeline.setAutoDrive(false);
    lookAround.reset();
    robotGuides.forEach((guide) => guide?.hide());
    const reloadConfig = VISUAL_CONFIG.explore.reloadFromStart;
    stateFade.style.transitionDuration = `${reloadConfig.fadeOutSeconds}s`;
    stateFade.classList.add("is-visible");
    window.setTimeout(() => {
      // 黑场中复位: 时间轴与扫描裁剪回到起点, 实体重新隐藏, 点云回到聚拢前
      timeline.seekImmediate(0);
      hud.setTimeline(0);
      scanRequested = false;
      scanPlane.constant = contentMinX - 1;
      cloud.setScanX(contentMinX - 1);
      cloud.points.rotation.y = 0;
      cloud.resetScreenMask();
      cloud.points.visible = true;
      cloud.setProgress(0);
      exploreModels.forEach((entry, index) => {
        if (entry.cloud && index !== ARENA_MODEL_INDEX) {
          entry.cloud.points.visible = false;
          entry.cloud.resetScreenMask();
        }
      });
      exploreModelIndex = ARENA_MODEL_INDEX;
      const arenaEntry = exploreModels[ARENA_MODEL_INDEX];
      hud.setExploreModel(
        ARENA_MODEL_INDEX,
        exploreModels.length,
        arenaEntry.name,
        arenaEntry.desc,
      );
      // 与入场转场一致的左偏构图 + 背景环渐显
      viewOffsetX = window.innerWidth * VISUAL_CONFIG.explore.sideOffset;
      viewOffsetY = -window.innerHeight * VISUAL_CONFIG.explore.verticalOffset;
      backRing.group.visible = true;
      backRing.setLevel(0);
      addTween({
        duration: backRingConfig.fadeInSeconds,
        onUpdate: (k) => {
          backRing.setLevel(k);
        },
      });
      setState("assemble");
      stateFade.style.transitionDuration = `${reloadConfig.fadeInSeconds}s`;
      stateFade.classList.remove("is-visible");
      addTween({
        duration: ASSEMBLE_DURATION,
        ease: (x) => x, // shader 内部已做逐点缓动, 进度线性推进
        onUpdate: (k) => cloud.setProgress(k),
        onComplete: () => {
          exploreReloading = false;
          setState("explore");
        },
      });
    }, reloadConfig.fadeOutSeconds * 1000);
  }

  // 档案末端按钮以黑场交接到稳定环视；滚轮/回顶仍保持原 Timeline 返回语义。
  unitSiteUi.setReturnHandler(() => {
    void returnToArenaOverview().catch((error) => {
      console.error("[ENTERPRIZE] Unable to return to arena overview", error);
    });
  });

  // SCAN 相机混合: 先接入 cameraTimeOffset 姿态, 再贴合当前预设轨迹
  const scanHandoffPos = new THREE.Vector3();
  const scanHandoffQuat = new THREE.Quaternion();
  const scanTrackPos = new THREE.Vector3();
  const scanTrackQuat = new THREE.Quaternion();
  const scanOrbitPos = new THREE.Vector3();
  const scanOrbitQuat = new THREE.Quaternion();
  let scanBlend = 0;
  let scanAttachedToTrack = false;
  let timelineHandoffThisFrame = false;

  function requestScan() {
    if (state !== "explore" || scanRequested) {
      return;
    }
    if (exploreTransitioning && !switchTween) {
      exploreSwitchRequest += 1;
      exploreTransitioning = false;
      exploreModelIndex = ARENA_MODEL_INDEX;
      const arenaEntry = exploreModels[ARENA_MODEL_INDEX];
      hud.setExploreModel(
        ARENA_MODEL_INDEX,
        exploreModels.length,
        arenaEntry.name,
        arenaEntry.desc,
      );
    }
    scanRequested = true;
    if (deferredAssetsError) {
      scanRequested = false;
      hud.showError(deferredAssetsError);
      releasePageScroll();
      return;
    }
    if (!deferredAssetsReady) {
      const activeEntry = exploreModels[exploreModelIndex];
      hud.setExploreModel(
        exploreModelIndex,
        exploreModels.length,
        activeEntry.name,
        `${activeEntry.desc} / PREPARING SCAN...`,
      );
      void prepareDeferredAssets()
        .then(continueScanRequest)
        .catch((error) => {
          scanRequested = false;
          hud.showError(error);
          releasePageScroll();
        });
    }
    continueScanRequest();
  }

  function continueScanRequest() {
    if (
      !scanRequested ||
      state !== "explore" ||
      exploreTransitioning ||
      !deferredAssetsReady
    ) {
      return;
    }
    if (exploreModelIndex !== ARENA_MODEL_INDEX) {
      switchExploreModel(ARENA_MODEL_INDEX);
      return;
    }
    beginScan();
  }

  function beginScan() {
    if (!timeline || !focus || !report) {
      return;
    }
    scanRequested = false;
    // Arena 蒙版切换已完成后才开始 SCAN 与相机变换。
    exploreModels.forEach((entry) => {
      if (entry.cloud) {
        entry.cloud.points.visible = entry.cloud === cloud;
      }
    });
    // 防御性清理切换状态，正常路径下此处已经没有活动补间。
    if (switchTween) {
      tweens.delete(switchTween);
      switchTween = null;
    }
    backRing.setSpeedScale(1);
    exploreTransitioning = false;
    exploreModels.forEach((entry) => {
      if (entry.cloud) {
        entry.cloud.points.rotation.y = 0;
        entry.cloud.resetScreenMask();
      }
    });

    // 背景装饰环渐隐退出, 结束后彻底隐藏 (不进入后续状态)
    addTween({
      duration: backRingConfig.fadeOutSeconds,
      onUpdate: (k) => {
        backRing.setLevel(1 - k);
      },
      onComplete: () => {
        backRing.group.visible = false;
      },
    });

    const cameraOffsetProgress = cameraTimeOffset / timeline.clip.duration;
    // 接轨点从提前播放的第 0 秒计算，即 timeline_0 的 cameraTimeOffset 姿态。
    timeline.seekImmediate(cameraOffsetProgress);
    const handoffPose = timeline.readCameraPose();
    scanHandoffPos.copy(handoffPose.position);
    scanHandoffQuat.copy(handoffPose.quaternion);
    timeline.seekImmediate(0);
    const initialTrackPose = timeline.readCameraPose();
    scanTrackPos.copy(initialTrackPose.position);
    scanTrackQuat.copy(initialTrackPose.quaternion);
    scanAttachedToTrack = false;

    setState("scan");

    addTween({
      duration: SCAN_DURATION,
      onUpdate: (easedK, linearK) => {
        const scanElapsed = linearK * SCAN_DURATION;
        const cameraBlendK = THREE.MathUtils.clamp(
          scanElapsed / Math.max(cameraAttachScanTime, 1e-3),
          0,
          1,
        );
        scanBlend = easeInOutCubic(cameraBlendK);
        viewOffsetX =
          (1 - easedK) * (window.innerWidth * VISUAL_CONFIG.explore.sideOffset); // 左偏构图平滑回中
        viewOffsetY =
          (1 - easedK) *
          (-window.innerHeight * VISUAL_CONFIG.explore.verticalOffset);
        const scanK = THREE.MathUtils.clamp(
          (easedK * SCAN_DURATION - cameraLead) /
            (SCAN_DURATION - cameraLead),
          0,
          1,
        );
        if (scanK > 0) {
          // 相机提前量期间扫描线未动: 保持 -FAR_SCAN, 点云边缘不点亮
          const scanX = THREE.MathUtils.lerp(contentMinX - 1, contentMaxX + 1.5, scanK);
          scanPlane.constant = scanX;
          cloud.setScanX(scanX);
        }
        // 播放头使用线性真实时间, 不跟随相机缓动减速或等待相机到位。
        const playhead = Math.max(
          0,
          scanElapsed - timelinePreplayStart,
        );
        timeline.seekImmediate(playhead / timeline.clip.duration);
        const currentTrackPose = timeline.readCameraPose();
        scanTrackPos.copy(currentTrackPose.position);
        scanTrackQuat.copy(currentTrackPose.quaternion);
        scanAttachedToTrack = scanElapsed >= cameraAttachScanTime;
      },
      onComplete: () => {
        viewOffsetX = 0;
        viewOffsetY = 0;
        freeCamera.clearViewOffset();
        scanPlane.constant = FAR_SCAN; // 实体全部显现
        cloud.points.visible = false; // 点云不回头, 省一次 draw
        freeCamera.position.copy(scanTrackPos);
        freeCamera.quaternion.copy(scanTrackQuat);
        // seekImmediate 会清零速度; 在交接帧恢复实时速度, 避免 timeline_0 顿一下。
        timeline.setAutoDrive(true, { immediate: true });
        timelineHandoffThisFrame = true;
        setState("scrub");
      },
    });
  }

  function enterFocus(targetIndex = 0) {
    if (state !== "scrub" || !focus) return;
    const target = focusTargets[targetIndex];
    if (target?.panel) hud.setFocusUnit(target.panel);
    activeFocusKey = (target?.key ?? "hero").replace(/-red$/, "");
    focusSlideIndex = 0;
    focusMediaInitialized = false;
    ensureFocusMedia();
    focusExitPhase = "idle";
    delete appElement.dataset.focusLeaving;
    setState("focus");
    focus.enter(targetIndex, elapsedNow);
  }

  const appElement = document.querySelector("#app");
  let focusExitPhase = "idle";

  function exitFocus() {
    interactionDebug.focusExitAttempts += 1;
    if (state !== "focus" || focusExitPhase !== "idle" || !focus) return;
    focusExitPhase = "exiting";
    appElement.dataset.focusLeaving = "true";
    const accepted = focus.exit(timeline.readCameraPose(), elapsedNow);
    if (!accepted) {
      focusExitPhase = "idle";
      delete appElement.dataset.focusLeaving;
    }
  }

  hud.setFocusExitHandler(exitFocus);

  // ---------- 输入 ----------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const focusHitProjected = new THREE.Vector3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const clickPoint = new THREE.Vector3();
  const pointer = { down: false, x: 0, y: 0, moved: 0, time: 0 };
  const interactionDebug = {
    lastTouchAxis: null,
    lastTouchSwipeDelta: 0,
    lastPinchDelta: 0,
    pinchZoomEvents: 0,
    activeTouchCount: 0,
    focusExitAttempts: 0,
    lastClick: null,
  };

  // EXPLORE 点击引导圈 (2D 通用组件): 无点击超时后出现, 指向点云中心屏幕投影
  const clickGuideConfig = VISUAL_CONFIG.explore.clickGuide;
  const clickGuide = createPulseGuide({
    size: clickGuideConfig.sizePx,
    rhythmSeconds: clickGuideConfig.rhythmSeconds,
    fadeSeconds: clickGuideConfig.fadeSeconds,
  });
  const clickGuideProjected = new THREE.Vector3();
  const robotGuideProjected = new THREE.Vector3();
  let exploreLastClickAt = 0;

  function handleClick(event) {
    pointerNdc.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    interactionDebug.lastClick = {
      x: event.clientX,
      y: event.clientY,
      selectedIndex: null,
    };
    if (state === "explore") {
      if (exploreTransitioning) {
        return; // 切换动画期间禁用涟漪点击
      }
      raycaster.setFromCamera(pointerNdc, freeCamera);
      if (raycaster.ray.intersectPlane(groundPlane, clickPoint)) {
        // 激活模型的点云可能有缩放/平移, 涟漪参数需要本地坐标
        const active = exploreModels[exploreModelIndex].cloud;
        const localPoint = active.points.worldToLocal(clickPoint.clone());
        localPoint.x = THREE.MathUtils.clamp(
          localPoint.x,
          active.bounds.min.x,
          active.bounds.max.x,
        );
        localPoint.z = THREE.MathUtils.clamp(
          localPoint.z,
          active.bounds.min.z,
          active.bounds.max.z,
        );
        active.addClick(localPoint, clockElapsed());
        exploreLastClickAt = clockElapsed(); // 点击后重新计时并收起引导圈
        clickGuide.hide();
      }
    } else if (state === "scrub" && focus) {
      raycaster.setFromCamera(pointerNdc, freeCamera);
      const hits = raycaster.intersectObjects(focus.proxies, false);
      const hitIndices = [
        ...new Set(
          hits.map((hit) => hit.object.userData.focusTargetIndex ?? 0),
        ),
      ];
      let targetIndex = null;
      let nearestGuideIndex = null;
      let nearestGuideDistance = Number.POSITIVE_INFINITY;
      focus.anchors.forEach((anchor, index) => {
        focusHitProjected.copy(anchor).project(freeCamera);
        if (focusHitProjected.z < -1 || focusHitProjected.z > 1) return;
        const dx =
          (focusHitProjected.x - pointerNdc.x) * window.innerWidth * 0.5;
        const dy =
          (focusHitProjected.y - pointerNdc.y) * window.innerHeight * 0.5;
        const screenDistance = dx * dx + dy * dy;
        if (screenDistance < nearestGuideDistance) {
          nearestGuideDistance = screenDistance;
          nearestGuideIndex = index;
        }
      });
      const guideHitRadius = isCoarsePointer ? 72 : 40;
      if (nearestGuideDistance <= guideHitRadius * guideHitRadius) {
        targetIndex = nearestGuideIndex;
      } else if (hitIndices.length > 0) {
        targetIndex = hitIndices[0];
        let nearestScreenDistance = Number.POSITIVE_INFINITY;
        hitIndices.forEach((index) => {
          focusHitProjected.copy(focus.anchors[index]).project(freeCamera);
          const dx =
            (focusHitProjected.x - pointerNdc.x) * window.innerWidth * 0.5;
          const dy =
            (focusHitProjected.y - pointerNdc.y) * window.innerHeight * 0.5;
          const screenDistance = dx * dx + dy * dy;
          if (screenDistance < nearestScreenDistance) {
            nearestScreenDistance = screenDistance;
            targetIndex = index;
          }
        });
      }
      if (targetIndex !== null) {
        interactionDebug.lastClick.selectedIndex = targetIndex;
        interactionDebug.lastClick.selectedKey = focusTargets[targetIndex]?.key;
        interactionDebug.lastClick.nearestGuideIndex = nearestGuideIndex;
        interactionDebug.lastClick.nearestGuideDistance = Math.sqrt(
          nearestGuideDistance,
        );
        interactionDebug.lastClick.hitIndices = hitIndices;
        enterFocus(targetIndex);
      }
    }
  }

  // 触屏先锁定主轴：横向交给环视/FOCUS，纵向保留给时间轴和状态退出。
  // SCRUB 环视期间双指距离独立映射为缩放，并在整次 pinch 内屏蔽点击与纵向时间轴。
  const activeTouchPoints = new Map();
  const PINCH_ZOOM_SCALE = 2;
  const touchGesture = {
    originState: null,
    primaryPointerId: null,
    axis: null,
    accumX: 0,
    accumY: 0,
    swipeAccum: 0,
    dragTarget: null,
    pinching: false,
    pinchDistance: 0,
    suppressUntilClear: false,
  };

  function touchDistance() {
    const points = [...activeTouchPoints.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  function resetTouchGesture() {
    pointer.down = false;
    touchGesture.originState = null;
    touchGesture.primaryPointerId = null;
    touchGesture.axis = null;
    touchGesture.accumX = 0;
    touchGesture.accumY = 0;
    touchGesture.swipeAccum = 0;
    touchGesture.dragTarget = null;
    touchGesture.pinching = false;
    touchGesture.pinchDistance = 0;
    touchGesture.suppressUntilClear = false;
    interactionDebug.activeTouchCount = 0;
  }

  function startTouchDrag() {
    if (touchGesture.dragTarget) return;
    if (state === "focus") {
      touchGesture.dragTarget = "focus";
      focus.startDrag();
    } else if (state === "scrub") {
      touchGesture.dragTarget = "scrub";
      lookAround.startDrag();
    }
  }

  function endTouchDrag() {
    if (touchGesture.dragTarget === "focus") focus.endDrag();
    if (touchGesture.dragTarget === "scrub") lookAround.endDrag();
    touchGesture.dragTarget = null;
  }

  function handleTouchSwipe(delta) {
    interactionDebug.lastTouchSwipeDelta = delta;
    const gestureState = touchGesture.originState ?? state;
    if (gestureState === "explore") {
      touchGesture.swipeAccum = Math.max(0, touchGesture.swipeAccum + delta);
      if (touchGesture.swipeAccum > 56) {
        touchGesture.swipeAccum = Number.NEGATIVE_INFINITY; // 触发一次后本次手势内不再重复
        requestScan();
      }
    } else if (gestureState === "scrub" && state === "scrub") {
      if (
        delta < 0 &&
        lookAround.isIdle &&
        timeline.progress <=
          VISUAL_CONFIG.explore.reloadFromStart.progressThreshold
      ) {
        restartExploreFromStart();
        return;
      }
      if (lookAround.isIdle) {
        if (delta > 0) {
          archiveAutoEntryArmed = true;
          archiveAutoEntryRequiresInput = false;
        }
        timeline.addWheel(delta * 3.2);
      }
    } else if (
      gestureState === "focus" &&
      state === "focus" &&
      focusExitPhase === "idle"
    ) {
      touchGesture.swipeAccum = Math.max(0, touchGesture.swipeAccum + delta);
      if (touchGesture.swipeAccum > 60) {
        touchGesture.swipeAccum = Number.NEGATIVE_INFINITY;
        exitFocus();
      }
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") {
      activeTouchPoints.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      interactionDebug.activeTouchCount = activeTouchPoints.size;
      if (activeTouchPoints.size === 1) {
        pointer.down = true;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.moved = 0;
        pointer.time = performance.now();
        touchGesture.originState = state;
        touchGesture.primaryPointerId = event.pointerId;
        touchGesture.axis = null;
        touchGesture.accumX = 0;
        touchGesture.accumY = 0;
        touchGesture.swipeAccum = 0;
        touchGesture.dragTarget = null;
        touchGesture.pinching = false;
        touchGesture.pinchDistance = 0;
        touchGesture.suppressUntilClear = false;
        return;
      }

      pointer.moved = Number.POSITIVE_INFINITY;
      touchGesture.suppressUntilClear = true;
      touchGesture.axis = null;
      endTouchDrag();
      touchGesture.pinching =
        activeTouchPoints.size === 2 &&
        touchGesture.originState === "scrub" &&
        state === "scrub" &&
        !lookAround.isIdle;
      touchGesture.pinchDistance = touchGesture.pinching ? touchDistance() : 0;
      return;
    }

    pointer.down = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = 0;
    pointer.time = performance.now();
    if (state === "focus") {
      focus.startDrag();
    } else if (state === "scrub") {
      lookAround.startDrag();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      const previous = activeTouchPoints.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      activeTouchPoints.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      interactionDebug.activeTouchCount = activeTouchPoints.size;

      if (touchGesture.suppressUntilClear) {
        if (touchGesture.pinching && activeTouchPoints.size === 2) {
          const nextDistance = touchDistance();
          const pinchDelta =
            (touchGesture.pinchDistance - nextDistance) * PINCH_ZOOM_SCALE;
          touchGesture.pinchDistance = nextDistance;
          if (Math.abs(pinchDelta) > 0.01 && lookAround.zoom(pinchDelta)) {
            interactionDebug.lastPinchDelta = pinchDelta;
            interactionDebug.pinchZoomEvents += 1;
          }
        }
        return;
      }
      if (event.pointerId !== touchGesture.primaryPointerId) return;

      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      touchGesture.accumX += dx;
      touchGesture.accumY += dy;
      if (
        !touchGesture.axis &&
        Math.max(Math.abs(touchGesture.accumX), Math.abs(touchGesture.accumY)) > 14
      ) {
        touchGesture.axis =
          Math.abs(touchGesture.accumY) > Math.abs(touchGesture.accumX) * 1.2
            ? "y"
            : "x";
        interactionDebug.lastTouchAxis = touchGesture.axis;
      }
      if (touchGesture.axis === "y") {
        // 手指上滑 = 滚轮下滚 (delta 为正)
        handleTouchSwipe(-dy);
        return;
      }
      if (touchGesture.axis === "x") {
        startTouchDrag();
      }
      if (state === "explore") {
        orbit.drag(dx, dy);
      } else if (state === "focus") {
        focus.drag(dx, dy);
      } else if (state === "scrub") {
        lookAround.drag(dx);
      }
      return;
    }

    if (!pointer.down) {
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (state === "explore") {
      orbit.drag(dx, dy);
    } else if (state === "focus") {
      focus.drag(dx, dy);
    } else if (state === "scrub") {
      lookAround.drag(dx);
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      if (!activeTouchPoints.delete(event.pointerId)) return;
      interactionDebug.activeTouchCount = activeTouchPoints.size;
      if (touchGesture.suppressUntilClear) {
        if (activeTouchPoints.size === 0) resetTouchGesture();
        return;
      }
      if (event.pointerId !== touchGesture.primaryPointerId) return;

      pointer.down = false;
      endTouchDrag();
      const isClick =
        pointer.moved < 18 && performance.now() - pointer.time < 700;
      if (isClick) {
        handleClick({ clientX: pointer.x, clientY: pointer.y });
      }
      resetTouchGesture();
      return;
    }

    pointer.down = false;
    if (state === "focus") {
      focus.endDrag();
    } else if (state === "scrub") {
      lookAround.endDrag();
    }
    const isClick =
      pointer.moved < 6 && performance.now() - pointer.time < 500;
    if (isClick) {
      handleClick({ clientX: pointer.x, clientY: pointer.y });
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") {
      activeTouchPoints.clear();
      endTouchDrag();
      resetTouchGesture();
      return;
    }
    pointer.down = false;
    focus?.endDrag();
    lookAround.endDrag();
  });

  window.addEventListener(
    "wheel",
    (event) => {
      if (state === "explore") {
        event.preventDefault();
        if (event.deltaY > 4) {
          requestScan();
        }
      } else if (state === "scrub") {
        if (!lookAround.isIdle) {
          event.preventDefault();
          lookAround.zoom(event.deltaY);
          return;
        }
        if (
          event.deltaY < 0 &&
          timeline.progress <=
            VISUAL_CONFIG.explore.reloadFromStart.progressThreshold
        ) {
          event.preventDefault();
          restartExploreFromStart();
          return;
        }
        event.preventDefault();
        if (event.deltaY > 0) {
          archiveAutoEntryArmed = true;
          archiveAutoEntryRequiresInput = false;
        }
        timeline.addWheel(event.deltaY);
      } else if (state === "focus") {
        event.preventDefault();
        if (Math.abs(event.deltaY) > 4) exitFocus();
      } else if (state === "end") {
        if (documentRevealInProgress) {
          event.preventDefault();
        } else if (event.deltaY < 0 && window.scrollY <= 1) {
          event.preventDefault();
          returnToTimeline();
        }
      } else if (state === "assemble" || state === "scan" || state === "boot") {
        event.preventDefault();
      }
      // end: 释放滚轮, 不再捕获
    },
    { passive: false },
  );

  window.addEventListener(
    "scroll",
    () => {
      if (state === "end") {
        updateDocumentParallax();
      }
      if (
        state === "end" &&
        !documentRevealInProgress &&
        window.scrollY <= 1
      ) {
        returnToTimeline();
      }
    },
    { passive: true },
  );

  // EXPLORE 模型切换: 屏幕箭头按钮 + 键盘左右方向键 / 空格键
  hud.setExploreSwitchHandler((step) => {
    if (state === "explore") {
      switchExploreModel(exploreModelIndex + step);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (state === "focus") {
      if (event.key === "Escape") {
        exitFocus();
      } else if (event.key === "ArrowLeft") {
        switchFocusSlide(-1);
      } else if (event.key === "ArrowRight") {
        switchFocusSlide(1);
      }
      return;
    }
    if (state !== "explore") {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        switchExploreModel(exploreModelIndex - 1);
      }
    } else if (event.key === "ArrowLeft") {
      switchExploreModel(exploreModelIndex - 1);
    } else if (event.key === "ArrowRight") {
      switchExploreModel(exploreModelIndex + 1);
    }
  });

  // ---------- 帧循环 ----------
  let elapsedNow = 0;
  const clockElapsed = () => elapsedNow;
  let fpsFrames = 0;
  let fpsTime = 0;
  let lightLevel = VISUAL_CONFIG.arena.lighting.brightness;
  let assembled = false;

  stage.start(({ delta, elapsed }) => {
    elapsedNow = elapsed;
    updateTweens(delta);
    const pointPixelRatio = stage.renderer.getPixelRatio();
    const viewportHeight = stage.renderer.domElement.height;
    cloud.update(elapsed, pointPixelRatio, viewportHeight);
    // arena 之外的展示点云 (dart/infantry/engineer) 仅在可见时更新
    exploreModels.forEach((entry) => {
      if (entry.cloud && entry.cloud !== cloud && entry.cloud.points.visible) {
        entry.cloud.update(elapsed, pointPixelRatio, viewportHeight);
      }
    });
    if (backRing.group.visible) {
      backRing.update(delta);
    }
    if (state === "assemble" || state === "explore" || state === "scan") {
      applyViewOffset(); // 每帧应用, 跟随窗口尺寸变化
    }
    if (freeCamera.layers.isEnabled(DEFERRED_SCENE_LAYER)) {
      // 先推进车辆动画，再同步 FOCUS anchor/proxy/camera，避免跟踪落后一帧。
      robotSquadInstance?.update(delta);
      focus?.update(delta, elapsed);
    }
    // 点击引导圈: EXPLORE 闲置超时后跟随点云中心投影, 点击或离开状态即隐藏
    if (
      state === "explore" &&
      !exploreTransitioning &&
      elapsedNow - exploreLastClickAt >= clickGuideConfig.idleSeconds
    ) {
      clickGuideProjected.copy(orbitTarget).project(freeCamera);
      clickGuide.setPosition(
        ((clickGuideProjected.x + 1) / 2) * window.innerWidth,
        ((1 - clickGuideProjected.y) / 2) * window.innerHeight,
      );
      clickGuide.show();
    } else if (clickGuide.visible) {
      clickGuide.hide();
    }

    if (state === "scrub" && focus) {
      focus.anchors.forEach((anchor, index) => {
        const guide = robotGuides[index];
        if (!guide) return;
        robotGuideProjected.copy(anchor).project(freeCamera);
        const guideX = ((robotGuideProjected.x + 1) / 2) * window.innerWidth;
        const guideY = ((1 - robotGuideProjected.y) / 2) * window.innerHeight;
        const margin = isCoarsePointer ? 28 : 40;
        const guideOnScreen =
          robotGuideProjected.z > -1 &&
          robotGuideProjected.z < 1 &&
          guideX > margin &&
          guideX < window.innerWidth - margin &&
          guideY > margin &&
          guideY < window.innerHeight - margin;
        if (guideOnScreen) {
          guide.setPosition(guideX, guideY);
          guide.show();
        } else if (guide.visible) {
          guide.hide();
        }
      });
    } else {
      robotGuides.forEach((guide) => guide?.hide());
    }

    // 红蓝强调灯电平滑动: scan 时全开 (白色灯不参与)
    const lightTarget =
      state === "scan"
        ? VISUAL_CONFIG.arena.lighting.scanBrightness
        : VISUAL_CONFIG.arena.lighting.brightness;
    lightLevel +=
      (lightTarget - lightLevel) *
      (1 - Math.exp(-delta * VISUAL_CONFIG.arena.lighting.transitionSpeed));
    stage.setLightLevel(lightLevel);

    // 场地循环动画: gltf 内置 clip + 自发光呼吸
    if (freeCamera.layers.isEnabled(DEFERRED_SCENE_LAYER)) {
      arenaInstance?.update(delta);
    }
    const glowPulse = VISUAL_CONFIG.arena.glow.pulse;
    emissiveMaterials.forEach(({ material, base }, index) => {
      material.emissiveIntensity =
        base *
        (glowPulse.center +
          glowPulse.amplitude *
            Math.sin(elapsed * glowPulse.speed + index * glowPulse.phaseStep));
    });

    if (state === "assemble" || state === "explore") {
      orbit.update(delta);
    } else if (state === "scan") {
      orbit.update(delta); // 缓慢旋转保持, 随 scanBlend 淡出
      if (scanAttachedToTrack) {
        freeCamera.position.copy(scanTrackPos);
        freeCamera.quaternion.copy(scanTrackQuat);
      } else {
        scanOrbitPos.copy(freeCamera.position);
        scanOrbitQuat.copy(freeCamera.quaternion);
        freeCamera.position.lerpVectors(
          scanOrbitPos,
          scanHandoffPos,
          scanBlend,
        );
        freeCamera.quaternion.slerpQuaternions(
          scanOrbitQuat,
          scanHandoffQuat,
          scanBlend,
        );
      }
    } else if (state === "scrub") {
      if (timelineHandoffThisFrame) {
        timelineHandoffThisFrame = false;
        hud.setTimeline(timeline.progress);
      } else {
        timeline.update(delta, !lookAround.isIdle);
        hud.setTimeline(timeline.progress);
        const lookAroundResult = lookAround.update(
          delta,
          timeline.readCameraPose(),
        );
        if (lookAroundResult?.finishedThisFrame) {
          timeline.resumeFromCameraOverride();
          timelineHandoffThisFrame = true;
          if (timeline.progress >= 0.995) {
            archiveAutoEntryArmed = false;
            archiveAutoEntryRequiresInput = true;
          }
        }
      }
      if (timeline.progress < 0.995) {
        if (!archiveAutoEntryRequiresInput) archiveAutoEntryArmed = true;
      } else if (
        archiveAutoEntryArmed &&
        timeline.isComplete &&
        lookAround.isIdle
      ) {
        enterUnitArchive();
      }
    }

    stage.render(freeCamera, delta);

    fpsFrames += 1;
    fpsTime += delta;
    if (fpsTime >= 1) {
      hud.setFps(Math.round(fpsFrames / fpsTime));
      fpsFrames = 0;
      fpsTime = 0;
    }
  });
  if (introControl) {
    stage.pause();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stage.pause();
    } else if (state !== "end" && (!introControl || assembled)) {
      stage.resume();
    }
  });

  // ---------- 入场: 起始界面 -> 星线跃迁 -> ASSEMBLE ----------
  // P0 只预热首屏点云、装饰环与星空；完整 PBR 场景在后台单独预热。
  introControl?.setProgress?.(0.88, "PREPARING EXPLORE CLOUDS");
  performance.mark?.("enterprize:explore-clouds-build-start");
  await prepareExploreCloudsForLaunch();
  performance.mark?.("enterprize:explore-clouds-build-end");
  introControl?.setProgress?.(0.92, "COMPILING ARENA");
  await stage.renderer.compileAsync(stage.scene, freeCamera);
  stage.render(freeCamera, 0);
  introControl?.setProgress?.(1, "ARENA READY");
  performance.mark?.("enterprize:p0-ready");

  hud.finishLoading();

  const beginAssemble = () => {
    if (assembled) {
      return;
    }
    stage.resume();
    assembled = true;
    setState("assemble");
    // 左偏构图: 点云按 sideOffset 比例左移, 右侧面板展示模型名
    viewOffsetX = window.innerWidth * VISUAL_CONFIG.explore.sideOffset;
    // setViewOffset 的 y 与内容位移相反: 向下挪传负值
    viewOffsetY = -window.innerHeight * VISUAL_CONFIG.explore.verticalOffset;
    switchExploreModel(0);
    // 背景装饰环随 ASSEMBLE 渐显进入
    backRing.group.visible = true;
    addTween({
      duration: backRingConfig.fadeInSeconds,
      onUpdate: (k) => {
        backRing.setLevel(k);
      },
    });
    addTween({
      duration: ASSEMBLE_DURATION,
      ease: (x) => x, // shader 内部已做逐点缓动, 进度线性推进
      onUpdate: (k) => cloud.setProgress(k),
      onComplete: () => setState("explore"),
    });
  };

  // 点云聚拢由起始界面的入场按钮触发；P0 预热完成后才解锁 CTA。
  onSceneReady?.(beginAssemble);
  if (introControl) {
    introControl.ready = true;
    introControl.setReady?.(true);
  }
  if (!intro) {
    beginAssemble(); // 兜底: 容器缺失时直接进入聚拢
  }

  // ---------- E2E / 调试钩子 ----------
  window.__ENTERPRIZE_DEMO__ = {
    ready: true,
    pointCount: cloud.count,
    launchIntro() {
      introControl?.launch();
    },
    get state() {
      return state;
    },
    get timelineProgress() {
      return timeline?.progress ?? 0;
    },
    get debugTimelineVelocity() {
      return timeline?.velocity ?? 0;
    },
    get focusMode() {
      return focus?.mode ?? "idle";
    },
    get focusExitPhase() {
      return focusExitPhase;
    },
    get interactionDebug() {
      return { ...interactionDebug };
    },
    get focusTargetKey() {
      return focusTargets[focus?.activeIndex ?? -1]?.key ?? null;
    },
    get lookAroundMode() {
      return lookAround.mode;
    },
    get lookAroundDistance() {
      return lookAround.distance;
    },
    get lookAroundHoldRemaining() {
      return lookAround.holdRemaining;
    },
    get cameraPose() {
      return {
        position: freeCamera.position.toArray(),
        quaternion: freeCamera.quaternion.toArray(),
      };
    },
    get debugTweens() {
      return tweens.size;
    },
    get debugElapsed() {
      return elapsedNow;
    },
    get debugScanBlend() {
      return scanBlend;
    },
    get renderLoopActive() {
      return stage.running;
    },
    get introReady() {
      return introControl?.ready ?? !intro;
    },
    get archiveIslandsReady() {
      return archiveIslandsMounted;
    },
    get deferredAssetsReady() {
      return deferredAssetsReady;
    },
    get deferredSceneLayerState() {
      const collectMasks = (root) => {
        const masks = new Set();
        root?.traverse((object) => masks.add(object.layers.mask));
        return [...masks];
      };
      return {
        layer: DEFERRED_SCENE_LAYER,
        cameraEnabled: freeCamera.layers.isEnabled(DEFERRED_SCENE_LAYER),
        arenaMasks: collectMasks(arenaInstance?.root),
        timelineMasks: collectMasks(stagedAssets.timeline?.scene),
        squadMasks: collectMasks(robotSquadInstance?.root),
      };
    },
    get deferredWarmReport() {
      return deferredWarmReport.map((entry) => ({ ...entry }));
    },
    get exploreCloudKeysReady() {
      return exploreModels.filter((entry) => entry.cloud).map((entry) => entry.key);
    },
    get exploreCloudBootState() {
      return { ...exploreCloudBootState };
    },
    get exploreTransitioning() {
      return exploreTransitioning;
    },
    get loadedAssetKeys() {
      return assetLoader.loadedKeys;
    },
    get arenaSymmetry() {
      return arenaInstance?.getDebugState() ?? null;
    },
    get robotSquad() {
      if (!robotSquadInstance) {
        return null;
      }
      const colorOf = (materials) =>
        materials.map((material) => ({
          name: material.name,
          emissive: material.emissive?.getHexString?.() ?? null,
        }));
      return {
        blue: colorOf(robotSquadInstance.teamMaterials.blue),
        red: colorOf(robotSquadInstance.teamMaterials.red),
        mixerCount: robotSquadInstance.mixers.length,
        mixerTimes: robotSquadInstance.mixers.map((mixer) =>
          Number(mixer.time.toFixed(3)),
        ),
      };
    },
    robotScreenPosition() {
      const projected = (focus?.anchor ?? cloud.center).clone().project(freeCamera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
        behind: projected.z < -1 || projected.z > 1,
      };
    },
    focusTargetScreenPositions() {
      if (!focus) return [];
      return focus.anchors.map((anchor, index) => {
        const projected = anchor.clone().project(freeCamera);
        return {
          index,
          key: focusTargets[index]?.key ?? null,
          x: ((projected.x + 1) / 2) * window.innerWidth,
          y: ((1 - projected.y) / 2) * window.innerHeight,
          behind: projected.z < -1 || projected.z > 1,
        };
      });
    },
  };
  console.info("[ENTERPRIZE] demo ready, points:", cloud.count);
}

function createStars(count = 1500) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    { color: new THREE.Color(0xcfe4ff), weight: 0.7 },
    { color: new THREE.Color(0xff2d4d), weight: 0.12 },
    { color: new THREE.Color(0x2e9bff), weight: 0.18 },
  ];
  const pickColor = () => {
    const roll = Math.random();
    let acc = 0;
    for (const entry of palette) {
      acc += entry.weight;
      if (roll <= acc) return entry.color;
    }
    return palette[0].color;
  };
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 130 + Math.random() * 160;
    positions[i * 3] = s * Math.cos(phi) * r;
    positions[i * 3 + 1] = Math.abs(u) * r * 0.6 - 10; // 偏上半球
    positions[i * 3 + 2] = s * Math.sin(phi) * r;
    const color = pickColor();
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = "background_stars";
  stars.frustumCulled = false;
  return stars;
}
