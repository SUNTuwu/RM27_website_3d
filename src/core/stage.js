import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { VISUAL_CONFIG } from "../config.js";

const MAX_PIXEL_RATIO = 2;
// 触屏设备 GPU 较弱, 限制像素比以保帧率
const COARSE_POINTER_MAX_PIXEL_RATIO = 1.5;

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function updateCameraAspect(camera, width, height) {
  if (!camera?.isPerspectiveCamera) {
    return;
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function createStage(
  canvas,
  {
    bloom = VISUAL_CONFIG.bloom,
    arena = VISUAL_CONFIG.arena,
  } = {},
) {
  const { glow, lighting } = arena;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.0075);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.setClearColor(scene.background, 1);
  // X 轴扫描转场依赖局部裁剪平面
  renderer.localClippingEnabled = true;

  // 自由相机：承接 EXPLORE / SCAN，并在 SCRUB 中同步 timeline 相机姿态。
  const freeCamera = new THREE.PerspectiveCamera(53.7, 1, 0.08, 420);
  freeCamera.name = "free_camera";
  freeCamera.position.set(-22, 9, 18);
  scene.add(freeCamera);

  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentMap = environmentGenerator.fromScene(roomEnvironment, 0.04).texture;
  scene.environment = environmentMap;
  environmentGenerator.dispose();

  const skyLight = new THREE.HemisphereLight(
    lighting.sky.color,
    lighting.sky.groundColor,
    lighting.sky.intensity,
  );
  skyLight.position.fromArray(lighting.sky.position);
  scene.add(skyLight);

  const keyLight = new THREE.DirectionalLight(
    lighting.key.color,
    lighting.key.intensity,
  );
  keyLight.position.fromArray(lighting.key.position);
  scene.add(keyLight);

  const blueFill = new THREE.PointLight(
    glow.blue.light.color,
    glow.blue.light.intensity,
    glow.blue.light.distance,
    glow.blue.light.decay,
  );
  blueFill.position.fromArray(glow.blue.light.position);
  scene.add(blueFill);

  const redFill = new THREE.PointLight(
    glow.red.light.color,
    glow.red.light.intensity,
    glow.red.light.distance,
    glow.red.light.decay,
  );
  redFill.position.fromArray(glow.red.light.position);
  scene.add(redFill);

  // 照明电平: 白色/中性灯 (天光, 白色主光, 环境 IBL) 恒定 20% 不参与全开;
  // 仅红蓝强调灯在 SCAN 转场期间开到 100%
  skyLight.intensity = lighting.sky.intensity * lighting.brightness;
  keyLight.intensity = lighting.key.intensity * lighting.brightness;
  scene.environmentIntensity =
    lighting.environmentIntensity * lighting.brightness;
  const accentRig = [
    { light: blueFill, full: glow.blue.light.intensity },
    { light: redFill, full: glow.red.light.intensity },
  ];
  function setLightLevel(level) {
    accentRig.forEach(({ light, full }) => {
      light.intensity = full * level;
    });
  }
  setLightLevel(lighting.brightness);

  const renderPass = new RenderPass(scene, freeCamera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    bloom.strength,
    bloom.radius,
    bloom.threshold,
  );
  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const cameras = new Set([freeCamera]);
  const clock = new THREE.Clock();
  let loopCallback = null;
  let disposed = false;
  let running = false;

  function tick() {
    const delta = Math.min(clock.getDelta(), 0.1);
    loopCallback?.({ delta, elapsed: clock.elapsedTime });
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const cap = isCoarsePointer()
      ? COARSE_POINTER_MAX_PIXEL_RATIO
      : MAX_PIXEL_RATIO;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, cap);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    bloomPass.resolution.set(width, height);

    cameras.forEach((camera) => updateCameraAspect(camera, width, height));
  }

  function registerCamera(camera) {
    if (!camera) {
      return;
    }

    cameras.add(camera);
    updateCameraAspect(
      camera,
      Math.max(canvas.clientWidth, 1),
      Math.max(canvas.clientHeight, 1),
    );
  }

  function render(camera = freeCamera, delta = 0) {
    renderPass.camera = camera;
    composer.render(delta);
  }

  function start(callback) {
    loopCallback = callback;
    clock.start();
    running = true;
    renderer.setAnimationLoop(tick);
  }

  function pause() {
    if (!running || disposed) {
      return;
    }
    renderer.setAnimationLoop(null);
    clock.stop();
    running = false;
  }

  function resume() {
    if (running || disposed || !loopCallback) {
      return;
    }
    clock.start();
    running = true;
    renderer.setAnimationLoop(tick);
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    window.removeEventListener("resize", resize);
    renderer.setAnimationLoop(null);
    running = false;
    environmentMap.dispose();
    roomEnvironment.clear();
    composer.dispose();
    renderer.dispose();
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  return {
    scene,
    renderer,
    freeCamera,
    registerCamera,
    setLightLevel,
    render,
    resize,
    start,
    pause,
    resume,
    get running() {
      return running;
    },
    dispose,
  };
}
