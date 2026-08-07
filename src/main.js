import "./styles.css";

import * as THREE from "three";

import {
  auditProjectAssets,
  configureLoadedScene,
  loadProjectAssets,
} from "./core/assetPipeline.js";
import { createStage } from "./core/stage.js";
import { FAR_SCAN, createPointCloud } from "./pointcloud/pointCloud.js";
import { createTimelineController } from "./timeline/timelineController.js";
import { createLookAroundController } from "./timeline/lookAroundController.js";
import { createFocusController } from "./focus/focusController.js";
import { createHud } from "./ui/hud.js";
import { VISUAL_CONFIG } from "./config.js";

const ASSEMBLE_DURATION = 2.6;
const SCAN_DURATION = 3.2;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const hud = createHud();

const isMobileDevice =
  window.matchMedia("(pointer: coarse)").matches ||
  Math.min(window.innerWidth, window.innerHeight) < 760;

if (isMobileDevice) {
  // 移动端降级: 不初始化 WebGL, 不下载 glTF
  hud.showMobile();
} else {
  boot().catch((error) => {
    console.error("[ENTERPRIZE] Boot failed", error);
    hud.showError(error);
  });
}

async function boot() {
  hud.setState("boot");
  const canvas = document.querySelector("#scene-canvas");
  const stage = createStage(canvas, VISUAL_CONFIG);
  const freeCamera = stage.freeCamera;

  // ---------- 资产 ----------
  const assets = await loadProjectAssets({
    onProgress: (progress) => hud.setLoading(progress.ratio, progress.url),
  });
  const report = auditProjectAssets(assets);
  if (report.issues.length) {
    throw new Error(`Asset audit failed: ${report.issues.join("; ")}`);
  }

  configureLoadedScene(assets.arena.scene, stage.renderer);
  configureLoadedScene(assets.timeline.scene, stage.renderer, {
    lightIntensityScale: VISUAL_CONFIG.timeline0.lightIntensityScale,
  });
  configureLoadedScene(assets.robot.scene, stage.renderer);

  // ---------- 点云 (场地实体表面采样) ----------
  const cloud = createPointCloud(assets.arena.scene, VISUAL_CONFIG.pointCloud);
  const minX = cloud.bounds.min.x;
  const maxX = cloud.bounds.max.x;

  // ---------- X 轴扫描裁剪平面 (预扫描: 实体全部隐藏) ----------
  const scanPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), minX - 1);
  [
    ...report.arena.materials,
    ...report.timeline.materials,
    ...report.robot.materials,
  ].forEach((material) => {
    material.clippingPlanes = [scanPlane];
    material.clipShadows = false;
  });

  stage.scene.add(assets.arena.scene);
  stage.scene.add(assets.robot.scene);
  stage.scene.add(cloud.points);
  // 时间轴场景全程 visible: 预扫描期被裁剪平面隐藏, 材质与纹理随首批帧完成编译上传,
  // 避免 SCAN 切换时首次编译 dart/hit 材质 + 上传贴图造成的卡顿
  stage.scene.add(assets.timeline.scene);

  // ---------- 主时间轴 ----------
  const timelineCamera = report.timeline.camera;
  stage.registerCamera(timelineCamera);
  freeCamera.fov = timelineCamera.fov;
  freeCamera.updateProjectionMatrix();
  const timeline = createTimelineController({
    root: assets.timeline.scene,
    clip: report.timeline.sourceClips[0],
    camera: timelineCamera,
    wheelScale: VISUAL_CONFIG.timeline0.scroll.wheelScale,
    maxRate: VISUAL_CONFIG.timeline0.scroll.maxRate,
    autoSuspendSeconds: VISUAL_CONFIG.timeline0.scroll.autoSuspendSeconds,
    autoResumeRampSeconds:
      VISUAL_CONFIG.timeline0.scroll.autoResumeRampSeconds,
  });
  const timelineStartOffset = THREE.MathUtils.clamp(
    VISUAL_CONFIG.timeline0.timeOffsetSeconds,
    0,
    Math.min(SCAN_DURATION, timeline.clip.duration),
  );
  const cameraLead = THREE.MathUtils.clamp(
    VISUAL_CONFIG.timeline0.cameraLeadSeconds ?? 0,
    0,
    Math.max(SCAN_DURATION - 0.1, 0),
  );

  // ---------- 兵种聚焦 ----------
  const focus = createFocusController({
    camera: freeCamera,
    robotRoot: assets.robot.scene,
    scene: stage.scene,
  });

  // 预扫描裁剪边界: 覆盖场地 + 时间轴 (飞镖) + 机器人全部内容
  const timelineBounds = new THREE.Box3().setFromObject(assets.timeline.scene);
  const robotBounds = new THREE.Box3().setFromObject(assets.robot.scene);
  const contentMinX = Math.min(
    cloud.bounds.min.x,
    timelineBounds.min.x,
    robotBounds.min.x,
  );
  const contentMaxX = Math.max(
    cloud.bounds.max.x,
    timelineBounds.max.x,
    robotBounds.max.x,
  );
  scanPlane.constant = contentMinX - 1;

  // ---------- 氛围: 星空 ----------
  stage.scene.add(createStars());

  // ---------- 场地循环动画 (arena.gltf 内置 clip, 独立播放, 不受滚动控制) ----------
  const arenaMixer = new THREE.AnimationMixer(assets.arena.scene);
  if (report.arena.sourceClips.length > 0) {
    const arenaAction = arenaMixer.clipAction(report.arena.sourceClips[0]);
    arenaAction.setLoop(THREE.LoopRepeat, Infinity);
    arenaAction.play();
  }
  const glowGroups = [
    VISUAL_CONFIG.arena.glow.red,
    VISUAL_CONFIG.arena.glow.blue,
  ];
  const emissiveMaterials = report.arena.emissiveMaterials.map((material) => {
    const glowGroup = glowGroups.find((group) =>
      material.name.startsWith(group.materialPrefix),
    );
    const base =
      material.emissiveIntensity *
      (glowGroup?.emissiveIntensityScale ?? 1);
    material.emissiveIntensity = base;
    return { material, base };
  });

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
  const orbit = {
    radius: THREE.MathUtils.clamp(
      Math.max(cloud.extent.x, cloud.extent.z) * 1.02,
      16,
      42,
    ),
    theta: -0.85,
    phi: 1.12,
    thetaT: -0.85,
    phiT: 1.12,
    drag(dx, dy) {
      this.thetaT -= dx * 0.0042;
      this.phiT = THREE.MathUtils.clamp(this.phiT - dy * 0.0042, 0.55, 1.45);
    },
    update(delta) {
      this.thetaT += delta * 0.02; // 缓慢自转
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

  // ---------- SCRUB 环视子状态机 ----------
  const lookPivot = cloud.center.clone();
  lookPivot.y = 0;
  const lookAround = createLookAroundController({
    camera: freeCamera,
    pivot: lookPivot,
    config: VISUAL_CONFIG.timeline0.lookAround,
  });

  // ---------- 全局状态机 ----------
  let state = "boot";
  function setState(next) {
    if (next !== state && (state === "scrub" || next === "scrub")) {
      // 子状态结束时只交出相机控制权，不改写当前姿态。
      lookAround.reset();
    }
    state = next;
    hud.setState(next);
    focus.setHighlightTarget(next === "scrub" || next === "focus" ? 1 : 0);
    if (next === "scrub") {
      timeline.setAutoDrive(true); // 切换到 timeline_0 自动推进进度条
    }
  }

  // SCAN 相机混合: 实时 orbit 姿态 -> timeline_0 起点姿态, 旋转随权重淡出
  const scanEndPos = new THREE.Vector3();
  const scanEndQuat = new THREE.Quaternion();
  const scanOrbitPos = new THREE.Vector3();
  const scanOrbitQuat = new THREE.Quaternion();
  let scanBlend = 0;

  function startScan() {
    const offsetProgress = timelineStartOffset / timeline.clip.duration;
    // 先采样 offset 时刻的相机姿态作为飞行终点, 再回到 0 预推进
    timeline.seekImmediate(offsetProgress);
    const endPose = timeline.readCameraPose();
    scanEndPos.copy(endPose.position);
    scanEndQuat.copy(endPose.quaternion);
    timeline.seekImmediate(0);

    setState("scan");

    addTween({
      duration: SCAN_DURATION,
      onUpdate: (k) => {
        scanBlend = k; // 相机混合全程推进, 比扫描线提前 cameraLead 秒起步
        const scanK = THREE.MathUtils.clamp(
          (k * SCAN_DURATION - cameraLead) / (SCAN_DURATION - cameraLead),
          0,
          1,
        );
        if (scanK > 0) {
          // 相机提前量期间扫描线未动: 保持 -FAR_SCAN, 点云边缘不点亮
          const scanX = THREE.MathUtils.lerp(contentMinX - 1, contentMaxX + 1.5, scanK);
          scanPlane.constant = scanX;
          cloud.setScanX(scanX);
        }
        // 提前播放: SCAN 末段实时推进 timeline_0, 交接时已播放配置的 offset。
        const playhead = Math.max(
          0,
          k * SCAN_DURATION - (SCAN_DURATION - timelineStartOffset),
        );
        timeline.seekImmediate(playhead / timeline.clip.duration);
      },
      onComplete: () => {
        scanPlane.constant = FAR_SCAN; // 实体全部显现
        cloud.points.visible = false; // 点云不回头, 省一次 draw
        setState("scrub");
      },
    });
  }

  function enterFocus() {
    if (state !== "scrub") {
      return;
    }
    setState("focus");
    focus.enter(); // 从环视或 timeline 的当前画面姿态进入
  }

  function exitFocus() {
    if (state !== "focus") {
      return;
    }
    focus.exit(timeline.readCameraPose()); // 回到冻结进度姿态
  }

  focus.setOnModeChange((mode, finished) => {
    if (mode === "idle" && finished === "exiting" && state === "focus") {
      setState("scrub");
    }
  });

  // ---------- 输入 ----------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const clickPoint = new THREE.Vector3();
  const pointer = { down: false, x: 0, y: 0, moved: 0, time: 0 };

  function handleClick(event) {
    pointerNdc.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    if (state === "explore") {
      raycaster.setFromCamera(pointerNdc, freeCamera);
      if (raycaster.ray.intersectPlane(groundPlane, clickPoint)) {
        clickPoint.x = THREE.MathUtils.clamp(clickPoint.x, minX, maxX);
        clickPoint.z = THREE.MathUtils.clamp(
          clickPoint.z,
          cloud.bounds.min.z,
          cloud.bounds.max.z,
        );
        cloud.addClick(clickPoint, clockElapsed());
      }
    } else if (state === "scrub") {
      raycaster.setFromCamera(pointerNdc, freeCamera);
      if (raycaster.intersectObject(focus.proxy, false).length > 0) {
        enterFocus();
      }
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    pointer.down = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = 0;
    pointer.time = performance.now();
    canvas.setPointerCapture(event.pointerId);
    if (state === "focus") {
      focus.startDrag();
    } else if (state === "scrub") {
      lookAround.startDrag();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
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
    pointer.down = false;
    if (state === "focus") {
      focus.endDrag();
    } else if (state === "scrub") {
      lookAround.endDrag();
    }
    const isClick =
      pointer.moved < 6 && performance.now() - pointer.time < 500;
    if (isClick) {
      handleClick(event);
    }
  });

  window.addEventListener(
    "wheel",
    (event) => {
      if (state === "explore") {
        event.preventDefault();
        if (event.deltaY > 4) {
          startScan();
        }
      } else if (state === "scrub") {
        event.preventDefault();
        // 环视状态机交回相机控制权后才恢复滚轮。
        if (lookAround.isIdle) {
          timeline.addWheel(event.deltaY);
        }
      } else if (state === "focus") {
        event.preventDefault();
        exitFocus();
      } else if (state === "assemble" || state === "scan" || state === "boot") {
        event.preventDefault();
      }
      // end: 释放滚轮, 不再捕获
    },
    { passive: false },
  );

  // ---------- 帧循环 ----------
  let elapsedNow = 0;
  const clockElapsed = () => elapsedNow;
  let fpsFrames = 0;
  let fpsTime = 0;
  let lightLevel = VISUAL_CONFIG.arena.lighting.brightness;

  stage.start(({ delta, elapsed }) => {
    elapsedNow = elapsed;
    updateTweens(delta);
    cloud.update(elapsed, stage.renderer.getPixelRatio());
    focus.update(delta, elapsed);

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
    arenaMixer.update(delta);
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
      scanOrbitPos.copy(freeCamera.position);
      scanOrbitQuat.copy(freeCamera.quaternion);
      freeCamera.position.lerpVectors(scanOrbitPos, scanEndPos, scanBlend);
      freeCamera.quaternion.slerpQuaternions(scanOrbitQuat, scanEndQuat, scanBlend);
    } else if (state === "scrub") {
      timeline.update(delta, !lookAround.isIdle);
      hud.setTimeline(timeline.progress);
      lookAround.update(delta, timeline.readCameraPose());
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

  // ---------- 入场: ASSEMBLE ----------
  // 预热: 预编译全部 shader 并触发纹理上传, 在 loading 屏后完成, 避免 SCAN 卡顿
  await stage.renderer.compileAsync(stage.scene, freeCamera);
  stage.render(freeCamera, 0);

  hud.finishLoading();
  setState("assemble");
  addTween({
    duration: ASSEMBLE_DURATION,
    ease: (x) => x, // shader 内部已做逐点缓动, 进度线性推进
    onUpdate: (k) => cloud.setProgress(k),
    onComplete: () => setState("explore"),
  });

  // ---------- E2E / 调试钩子 ----------
  window.__ENTERPRIZE_DEMO__ = {
    ready: true,
    pointCount: cloud.count,
    get state() {
      return state;
    },
    get timelineProgress() {
      return timeline.progress;
    },
    get focusMode() {
      return focus.mode;
    },
    get lookAroundMode() {
      return lookAround.mode;
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
    robotScreenPosition() {
      const projected = focus.anchor.clone().project(freeCamera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
        behind: projected.z > 1,
      };
    },
  };
  console.info("[ENTERPRIZE] demo ready, points:", cloud.count);
}

function createStars(count = 1500) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 130 + Math.random() * 160;
    positions[i * 3] = s * Math.cos(phi) * r;
    positions[i * 3 + 1] = Math.abs(u) * r * 0.6 - 10; // 偏上半球
    positions[i * 3 + 2] = s * Math.sin(phi) * r;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x8fb0dd,
    size: 1.5,
    sizeAttenuation: false,
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
