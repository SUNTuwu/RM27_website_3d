import * as THREE from "three";

// 仿 Endfield lore 页面的三层 HUD 装饰环:
//   1) 内侧细实线圆 (静止)
//   2) 中段四段刻度环 (正转)
//   3) 外侧四段厚弧 (落在刻度缺口, 反转)
// 每层用离屏 canvas 绘制后作为 sprite 贴图, 加色混合叠在点云背后。

const CANVAS_SIZE = 1024;
const CENTER = CANVAS_SIZE / 2;
const DEG = Math.PI / 180;

const SEGMENTS = 4;
const SEGMENT_SPAN = 60 * DEG; // 每段刻度覆盖角度
const GAP_SPAN = 30 * DEG; // 段间缺口, 厚弧落在缺口中央
const TICK_STEP = 4 * DEG;
const ARC_SPAN = 36 * DEG;

function makeLayerTexture(style, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.translate(CENTER, CENTER);
  draw(ctx, style);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawSolidCircle(ctx, { radius, width, alpha }) {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(0, 0, radius * CENTER, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTickRing(ctx, { outer, length, width, alpha }) {
  const rOut = outer * CENTER;
  const rIn = (outer - length) * CENTER;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = width;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const start = s * (SEGMENT_SPAN + GAP_SPAN);
    for (let a = start; a <= start + SEGMENT_SPAN + 1e-6; a += TICK_STEP) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.stroke();
    }
  }
}

function drawArcRing(ctx, { inner, outer, alpha }) {
  const radius = ((inner + outer) / 2) * CENTER;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = (outer - inner) * CENTER;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const center =
      s * (SEGMENT_SPAN + GAP_SPAN) + SEGMENT_SPAN + GAP_SPAN / 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, center - ARC_SPAN / 2, center + ARC_SPAN / 2);
    ctx.stroke();
  }
}

function makeSprite(texture) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Sprite(material);
}

/**
 * 三层装饰环, 尺寸由 group.scale 统一控制 (1 世界单位 = 贴图外径)。
 * setLevel 驱动整体透明度 (0..1), 供入场/退场补间调用。
 */
export function createBackRing({
  opacity,
  tickSpeed,
  arcSpeed,
  solid: solidStyle,
  ticks: tickStyle,
  arcs: arcStyle,
}) {
  const group = new THREE.Group();
  group.name = "back_ring";
  const solid = makeSprite(makeLayerTexture(solidStyle, drawSolidCircle));
  const ticks = makeSprite(makeLayerTexture(tickStyle, drawTickRing));
  const arcs = makeSprite(makeLayerTexture(arcStyle, drawArcRing));
  group.add(solid, ticks, arcs);
  group.visible = false;

  let level = 0;
  let speedScale = 1;

  return {
    group,
    setLevel(value) {
      level = value;
      solid.material.opacity = value * opacity;
      ticks.material.opacity = value * opacity;
      arcs.material.opacity = value * opacity;
    },
    setSpeedScale(value) {
      speedScale = Number.isFinite(value) ? Math.max(value, 0) : 1;
    },
    update(delta) {
      ticks.material.rotation += delta * tickSpeed * speedScale;
      arcs.material.rotation += delta * arcSpeed * speedScale;
    },
  };
}
