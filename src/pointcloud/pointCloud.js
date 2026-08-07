import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { VISUAL_CONFIG } from "../config.js";

const MAX_RIPPLES = 4;

// uScanX 取 ±FAR_SCAN 时表示扫描未开始 / 已全部显示
export const FAR_SCAN = 1e5;

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aScatter;
  attribute float aDelay;
  attribute float aRand;
  attribute vec3 aTint;

  uniform float uProgress;
  uniform float uTime;
  uniform float uScanX;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uScanGlowColor;
  uniform float uScanGlowStrength;
  uniform float uScanGlowFalloff;
  uniform vec4 uClicks[${MAX_RIPPLES}]; // xyz = 点击点, w = 点击时刻

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // 聚合: 逐点随机延迟 + smoothstep 缓动
    float t = clamp(uProgress * 1.45 - aDelay * 0.45, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 pos = mix(aScatter, position, t);

    // 点击径向扩散波 (多点叠加)
    vec3 ripple = vec3(0.0);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 click = uClicks[i];
      float age = uTime - click.w;
      if (age > 0.0 && age < 2.2) {
        float d = distance(position, click.xyz);
        float front = age * 10.0;
        float band = exp(-pow((d - front) * 1.1, 2.0));
        float amp = band * exp(-age * 1.6) * 1.1;
        vec3 dir = normalize(position - click.xyz + vec3(0.0, 0.45, 0.0));
        ripple += dir * amp;
      }
    }
    pos += ripple * t;

    // X 轴扫描: 已转换区域点云渐隐, 扫描前沿发光
    float keep = smoothstep(uScanX - 0.8, uScanX + 0.8, position.x);
    float frontier = exp(-pow((position.x - uScanX) * uScanGlowFalloff, 2.0)) * step(-9000.0, uScanX);

    vAlpha = t * keep;
    vColor = aTint + uScanGlowColor * frontier * uScanGlowStrength;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = 26.0 / max(-mvPosition.z, 0.1);
    gl_PointSize = clamp(uSize * (0.65 + aRand * 0.7) * uPixelRatio * perspective, 1.0, 6.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform vec2 uPointGlowRadii;
  uniform float uAlphaCutoff;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float disc = 1.0 - smoothstep(uPointGlowRadii.x, uPointGlowRadii.y, d);
    float alpha = disc * vAlpha;
    if (alpha < uAlphaCutoff) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/**
 * 从场地实体网格表面采样点云。
 * 点位置 = 实体表面世界坐标, 保证扫描转场时点云与实体空间对齐。
 */
export function createPointCloud(
  arenaRoot,
  {
    count = VISUAL_CONFIG.pointCloud.count,
    size = VISUAL_CONFIG.pointCloud.size,
    glow = VISUAL_CONFIG.pointCloud.glow,
  } = {},
) {
  arenaRoot.updateMatrixWorld(true);

  const geometries = [];
  arenaRoot.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    const source = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    for (const name of Object.keys(source.attributes)) {
      if (name !== "position") {
        source.deleteAttribute(name);
      }
    }
    source.applyMatrix4(object.matrixWorld);
    geometries.push(source);
  });

  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  merged.computeBoundingBox();

  const bounds = merged.boundingBox.clone();
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3());
  const shellRadius = Math.max(extent.x, extent.y, extent.z) * 1.15;

  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();

  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const randoms = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const target = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    sampler.sample(target);
    positions[i * 3] = target.x;
    positions[i * 3 + 1] = target.y;
    positions[i * 3 + 2] = target.z;

    // 初始位置: 视野四周的压扁球壳
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = shellRadius * (0.9 + Math.random() * 0.7);
    scatter[i * 3] = center.x + s * Math.cos(phi) * r;
    scatter[i * 3 + 1] = center.y + u * r * 0.55 + extent.y * 0.25;
    scatter[i * 3 + 2] = center.z + s * Math.sin(phi) * r;

    delays[i] = Math.random();
    randoms[i] = Math.random();

    const roll = Math.random();
    const brightness =
      glow.brightnessMin +
      Math.random() * (glow.brightnessMax - glow.brightnessMin);
    if (roll < 0.05) {
      tints[i * 3] = 1.0 * brightness;
      tints[i * 3 + 1] = 0.22 * brightness;
      tints[i * 3 + 2] = 0.3 * brightness;
    } else if (roll < 0.1) {
      tints[i * 3] = 0.25 * brightness;
      tints[i * 3 + 1] = 0.5 * brightness;
      tints[i * 3 + 2] = 1.0 * brightness;
    } else {
      tints[i * 3] = 0.82 * brightness;
      tints[i * 3 + 1] = 0.88 * brightness;
      tints[i * 3 + 2] = 1.0 * brightness;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(randoms, 1));
  geometry.setAttribute("aTint", new THREE.BufferAttribute(tints, 3));

  const clickSlots = Array.from(
    { length: MAX_RIPPLES },
    () => new THREE.Vector4(0, 0, 0, -1000),
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uScanX: { value: -FAR_SCAN },
      uSize: { value: size },
      uPixelRatio: { value: 1 },
      uScanGlowColor: { value: new THREE.Vector3(...glow.scanColor) },
      uScanGlowStrength: { value: glow.scanStrength },
      uScanGlowFalloff: { value: glow.scanFalloff },
      uPointGlowRadii: {
        value: new THREE.Vector2(glow.coreRadius, glow.edgeRadius),
      },
      uAlphaCutoff: { value: glow.alphaCutoff },
      uClicks: { value: clickSlots },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "arena_point_cloud";
  points.frustumCulled = false; // 聚合动画期间顶点在 shader 内位移, 禁用视锥剔除

  let clickCursor = 0;

  return {
    points,
    bounds,
    center,
    extent,
    count,
    setProgress(value) {
      material.uniforms.uProgress.value = value;
    },
    setScanX(value) {
      material.uniforms.uScanX.value = value;
    },
    addClick(worldPosition, time) {
      const slot = clickSlots[clickCursor % MAX_RIPPLES];
      slot.set(worldPosition.x, worldPosition.y, worldPosition.z, time);
      clickCursor += 1;
    },
    update(elapsed, pixelRatio) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uPixelRatio.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      merged.dispose();
    },
  };
}
