import "./styles.css";

import * as THREE from "three";

import {
  auditProjectAssets,
  assetUrl,
  configureLoadedScene,
  loadProjectAssets,
} from "./core/assetPipeline.js";
import { createStage } from "./core/stage.js";
import { FAR_SCAN, createPointCloud } from "./pointcloud/pointCloud.js";
import { createBackRing } from "./pointcloud/backRing.js";
import { createTimelineController } from "./timeline/timelineController.js";
import { createLookAroundController } from "./timeline/lookAroundController.js";
import { createFocusController } from "./focus/focusController.js";
import { createHud } from "./ui/hud.js";
import { createPulseGuide } from "./ui/pulseGuide.js";
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
  configureLoadedScene(assets.dart.scene, stage.renderer);

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
  // 机器人点云归一化: 缩放到与场地点云接近的观感尺寸, 中心对齐场地中心
  const robotCloud = createPointCloud(assets.robot.scene, {
    ...VISUAL_CONFIG.pointCloud,
    recenter: true, // 机器人网格原点不在几何中心, 重定位后绕自身中心旋转
  });
  const arenaMaxExtent = Math.max(cloud.extent.x, cloud.extent.y, cloud.extent.z);
  const robotMaxExtent = Math.max(
    robotCloud.extent.x,
    robotCloud.extent.y,
    robotCloud.extent.z,
  );
  const robotModelConfig = VISUAL_CONFIG.explore.models.robot;
  const robotFit =
    (arenaMaxExtent * robotModelConfig.fitScale) / robotMaxExtent;
  // 涟漪波速/振幅按模型比例缩放, 否则小尺寸模型的波纹会瞬间炸穿
  robotCloud.setRippleScale(
    (robotMaxExtent / arenaMaxExtent) * robotModelConfig.rippleBoost,
  );
  cloud.setRippleScale(VISUAL_CONFIG.explore.models.arena.rippleBoost);
  robotCloud.points.scale.setScalar(robotFit);
  robotCloud.points.position
    .copy(cloud.center)
    .sub(robotCloud.center.clone().multiplyScalar(robotFit));
  robotCloud.points.visible = false;
  robotCloud.setProgress(1); // 切换时直接呈现完整形态
  stage.scene.add(robotCloud.points);

  // 飞镖点云沿用机器人展示流程: 以自身中心旋转, 再归一化到场地点云尺度
  const dartCloud = createPointCloud(assets.dart.scene, {
    ...VISUAL_CONFIG.pointCloud,
    recenter: true,
  });
  const dartMaxExtent = Math.max(
    dartCloud.extent.x,
    dartCloud.extent.y,
    dartCloud.extent.z,
  );
  const dartModelConfig = VISUAL_CONFIG.explore.models.dart;
  const dartFit = (arenaMaxExtent * dartModelConfig.fitScale) / dartMaxExtent;
  dartCloud.setRippleScale(
    (dartMaxExtent / arenaMaxExtent) * dartModelConfig.rippleBoost,
  );
  dartCloud.points.scale.setScalar(dartFit);
  dartCloud.points.position
    .copy(cloud.center)
    .sub(dartCloud.center.clone().multiplyScalar(dartFit));
  dartCloud.points.visible = false;
  dartCloud.setProgress(1);
  stage.scene.add(dartCloud.points);

  const exploreModels = [
    {
      name: "RMUC ARENA",
      desc: "RMUC 标准赛场点云重建, 完整保留功能分区、增益点与掩体布局。",
      cloud,
    },
    {
      name: "ROBOT_1",
      desc: "步兵机器人整机表面采样点云, 源自高精度 glTF 模型。",
      cloud: robotCloud,
    },
    {
      name: "DART",
      desc: "飞镖弹体表面采样点云, 保留 glTF 导出的姿态与外形细节。",
      cloud: dartCloud,
    },
  ];
  const ARENA_MODEL_INDEX = 0;
  let exploreModelIndex = 0;
  let exploreTransitioning = false;
  let switchTween = null;
  let scanRequested = false;

  // ---------- FOCUS 右侧图片卡 (兵种档案幻灯片) ----------
  const focusSlides = [
    {
      image: assetUrl("images/hero/wheel-leg-4-web.jpg"),
      title: "WHEEL-LEG / 赛场实拍",
      desc: "轮腿构型机器人在赛场中央区域的机动瞬间, 兼具轮式速度与腿式越障能力。",
    },
    {
      image: assetUrl("images/hero/arena-fleet.jpg"),
      title: "BASE / 基地与前哨",
      desc: "蓝方基地与前哨站全景, 机器人列阵待命, 等待开局倒计时。",
    },
    {
      image: assetUrl("images/hero/rm2024-supercapacitor-controller.webp"),
      title: "SUPERCAP / 超级电容控制器",
      desc: "RM2024 超级电容控制器与电容组, 为底盘爆发机动提供瞬时大功率输出。",
    },
  ];
  let focusSlideIndex = 0;

  function switchFocusSlide(step) {
    const total = focusSlides.length;
    focusSlideIndex = ((focusSlideIndex + step) % total + total) % total;
    hud.setFocusMedia(focusSlideIndex, total, focusSlides[focusSlideIndex]);
  }
  focusSlides.forEach((slide) => {
    const preload = new Image(); // 预加载, 避免首次切换时图片闪烁
    preload.src = slide.image;
  });
  switchFocusSlide(0);
  hud.setFocusSwitchHandler(switchFocusSlide);

  function switchExploreModel(next) {
    if (exploreTransitioning) {
      return;
    }
    const total = exploreModels.length;
    const nextIndex = ((next % total) + total) % total;
    const outgoing = exploreModels[exploreModelIndex];
    const incoming = exploreModels[nextIndex];
    exploreModelIndex = nextIndex;
    hud.setExploreModel(nextIndex, total, incoming.name, incoming.desc);
    if (nextIndex === exploreModels.indexOf(outgoing)) {
      return; // 初始化调用: 仅刷新 HUD
    }

    // 模型已在 boot 时采样完成；点击后同帧启用两套点云并执行屏幕蒙版交接。
    exploreTransitioning = true;
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
        continueScanRequest();
      },
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
    wheelImpulse: VISUAL_CONFIG.timeline0.scroll.wheelImpulse,
    maxRate: VISUAL_CONFIG.timeline0.scroll.maxRate,
    velocityDecay: VISUAL_CONFIG.timeline0.scroll.velocityDecay,
    autoHoldSeconds: VISUAL_CONFIG.timeline0.scroll.autoHoldSeconds,
  });
  const animateTimeOffset = THREE.MathUtils.clamp(
    VISUAL_CONFIG.timeline0.animateTimeOffset,
    0,
    Math.min(SCAN_DURATION, timeline.clip.duration),
  );
  const cameraTimeOffset = THREE.MathUtils.clamp(
    VISUAL_CONFIG.timeline0.cameraTimeOffset,
    0,
    animateTimeOffset,
  );
  const timelinePreplayStart = SCAN_DURATION - animateTimeOffset;
  const cameraAttachScanTime = timelinePreplayStart + cameraTimeOffset;
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
      this.thetaT -= dx * 0.0042;
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
    const prev = state;
    state = next;
    hud.setState(next);
    focus.setHighlightTarget(next === "scrub" || next === "focus" ? 1 : 0);
    if (next === "explore") {
      exploreLastClickAt = elapsedNow; // 进入 EXPLORE 重新计时闲置引导
    } else if (prev === "explore") {
      clickGuide.hide();
    }
    if (next === "scrub") {
      timeline.setAutoDrive(true); // 切换到 timeline_0 自动推进进度条
    }
  }

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
    scanRequested = true;
    continueScanRequest();
  }

  function continueScanRequest() {
    if (!scanRequested || state !== "explore" || exploreTransitioning) {
      return;
    }
    if (exploreModelIndex !== ARENA_MODEL_INDEX) {
      switchExploreModel(ARENA_MODEL_INDEX);
      return;
    }
    beginScan();
  }

  function beginScan() {
    scanRequested = false;
    // Arena 蒙版切换已完成后才开始 SCAN 与相机变换。
    exploreModels.forEach((entry) => {
      entry.cloud.points.visible = entry.cloud === cloud;
    });
    // 防御性清理切换状态，正常路径下此处已经没有活动补间。
    if (switchTween) {
      tweens.delete(switchTween);
      switchTween = null;
    }
    backRing.setSpeedScale(1);
    exploreTransitioning = false;
    exploreModels.forEach((entry) => {
      entry.cloud.points.rotation.y = 0;
      entry.cloud.resetScreenMask();
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

  // EXPLORE 点击引导圈 (2D 通用组件): 无点击超时后出现, 指向点云中心屏幕投影
  const clickGuideConfig = VISUAL_CONFIG.explore.clickGuide;
  const clickGuide = createPulseGuide({
    size: clickGuideConfig.sizePx,
    rhythmSeconds: clickGuideConfig.rhythmSeconds,
    fadeSeconds: clickGuideConfig.fadeSeconds,
  });
  const clickGuideProjected = new THREE.Vector3();
  let exploreLastClickAt = 0;

  function handleClick(event) {
    pointerNdc.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    if (state === "explore") {
      if (exploreTransitioning) {
        return; // 切换动画期间禁用涟漪点击
      }
      raycaster.setFromCamera(pointerNdc, freeCamera);
      if (raycaster.ray.intersectPlane(groundPlane, clickPoint)) {
        // 激活模型的点云可能有缩放/平移 (ROBOT_1), 涟漪参数需要本地坐标
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
          requestScan();
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

  // EXPLORE 模型切换: 屏幕箭头按钮 + 键盘左右方向键 / 空格键
  hud.setExploreSwitchHandler((step) => {
    if (state === "explore") {
      switchExploreModel(exploreModelIndex + step);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (state === "focus") {
      // FOCUS 下左右方向键切换右侧图片
      if (event.key === "ArrowLeft") {
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

  stage.start(({ delta, elapsed }) => {
    elapsedNow = elapsed;
    updateTweens(delta);
    const pointPixelRatio = stage.renderer.getPixelRatio();
    const viewportHeight = stage.renderer.domElement.height;
    cloud.update(elapsed, pointPixelRatio, viewportHeight);
    if (robotCloud.points.visible) {
      robotCloud.update(elapsed, pointPixelRatio, viewportHeight);
    }
    if (dartCloud.points.visible) {
      dartCloud.update(elapsed, pointPixelRatio, viewportHeight);
    }
    if (backRing.group.visible) {
      backRing.update(delta);
    }
    if (state === "assemble" || state === "explore" || state === "scan") {
      applyViewOffset(); // 每帧应用, 跟随窗口尺寸变化
    }
    focus.update(delta, elapsed);

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
      } else {
        timeline.update(delta, !lookAround.isIdle);
      }
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
    get debugTimelineVelocity() {
      return timeline.velocity;
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
