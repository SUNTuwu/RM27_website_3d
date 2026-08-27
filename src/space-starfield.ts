// The old 0.55-units-per-frame drift equals 33 units/s at 60 Hz.
export const SPACE_STARFIELD_BASE_VELOCITY = 16.5;

const BOOST_VELOCITY_PER_SECOND = 1020;
const BOOST_RESPONSE_PER_SECOND = 4.35;
const MAX_DELTA_SECONDS = 0.05;
const MOBILE_BREAKPOINT = 720;
const MOBILE_STAR_COUNT = 240;
const DESKTOP_STAR_COUNT = 620;

const STAR_COLORS = [
  { value: "207,228,255", weight: 0.7 },
  { value: "255,45,77", weight: 0.12 },
  { value: "46,155,255", weight: 0.18 },
] as const;

type Star = {
  x: number;
  y: number;
  z: number;
  color: string;
  twinkle: number;
};

export type SpaceStarfieldController = {
  setBoost: (boost: number) => void;
  destroy: () => void;
};

function pickColor() {
  const roll = Math.random();
  let accumulatedWeight = 0;
  for (const color of STAR_COLORS) {
    accumulatedWeight += color.weight;
    if (roll <= accumulatedWeight) return color.value;
  }
  return STAR_COLORS[0].value;
}

function spawnStar(deep: boolean): Star {
  const angle = Math.random() * Math.PI * 2;
  const radius = 24 + Math.random() * 350;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: deep ? 1200 : Math.random() * 1200 + 1,
    color: pickColor(),
    twinkle: Math.random() * Math.PI * 2,
  };
}

export function createSpaceStarfield(
  canvas: HTMLCanvasElement,
): SpaceStarfieldController | null {
  const context = canvas.getContext("2d");
  if (!context) return null;

  let width = 1;
  let height = 1;
  let stars: Star[] = [];
  let currentBoost = 0;
  let targetBoost = 0;
  let twinkleTime = 0;
  let animationFrame = 0;
  let previousFrameTime: number | null = null;
  let running = !document.hidden;
  let destroyed = false;

  const resize = () => {
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetCount =
      width < MOBILE_BREAKPOINT ? MOBILE_STAR_COUNT : DESKTOP_STAR_COUNT;
    while (stars.length < targetCount) stars.push(spawnStar(false));
    stars.length = targetCount;
  };

  const scheduleFrame = () => {
    if (!destroyed && running && animationFrame === 0) {
      animationFrame = window.requestAnimationFrame(renderFrame);
    }
  };

  const renderFrame = (now: number) => {
    animationFrame = 0;
    if (!running || destroyed) return;

    const deltaSeconds =
      previousFrameTime === null
        ? 1 / 60
        : Math.min(Math.max((now - previousFrameTime) / 1000, 0), MAX_DELTA_SECONDS);
    previousFrameTime = now;
    twinkleTime += deltaSeconds;

    const boostBlend = 1 - Math.exp(-BOOST_RESPONSE_PER_SECOND * deltaSeconds);
    currentBoost += (targetBoost - currentBoost) * boostBlend;

    const velocityPerSecond =
      SPACE_STARFIELD_BASE_VELOCITY + currentBoost * BOOST_VELOCITY_PER_SECOND;
    const stretch = 4 + currentBoost * 130;
    const fov = 340 / (1 + currentBoost * 0.55);
    const centerX = width / 2;
    const centerY = height / 2;

    context.clearRect(0, 0, width, height);
    context.lineCap = "round";

    for (let index = 0; index < stars.length; index += 1) {
      let star = stars[index];
      star.z -= velocityPerSecond * deltaSeconds;
      if (star.z < 4) {
        star = spawnStar(true);
        stars[index] = star;
      }

      const depth = Math.max(star.z, 4);
      const screenX = centerX + (star.x / depth) * fov;
      const screenY = centerY + (star.y / depth) * fov;
      const tailDepth = Math.min(depth + stretch, 1300);
      const tailX = centerX + (star.x / tailDepth) * fov;
      const tailY = centerY + (star.y / tailDepth) * fov;
      if (
        screenX < -40 ||
        screenX > width + 40 ||
        screenY < -40 ||
        screenY > height + 40
      ) {
        continue;
      }

      const alpha =
        (0.28 + 0.5 * (1 - depth / 1300)) *
        (0.72 + 0.28 * Math.sin(twinkleTime * 2.1 + star.twinkle));
      context.strokeStyle = `rgba(${star.color},${alpha.toFixed(3)})`;
      context.lineWidth = depth < 260 ? 1.6 : 1;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(screenX, screenY);
      context.stroke();
    }

    scheduleFrame();
  };

  const handleVisibilityChange = () => {
    running = !document.hidden;
    previousFrameTime = null;
    if (!running && animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    scheduleFrame();
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleFrame();

  return {
    setBoost(boost) {
      targetBoost = Math.min(Math.max(boost, 0), 1);
    },
    destroy() {
      destroyed = true;
      running = false;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    },
  };
}
