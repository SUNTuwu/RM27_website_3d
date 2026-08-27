import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";

const targetUrl =
  process.env.ENTERPRIZE_URL ?? process.argv[2] ?? "http://127.0.0.1:5177/";
const outputDirectory = path.resolve("shots");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Edge not found");

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

let cdp;
async function swipe(x0, y0, x1, y1, steps = 12) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0, id: 1 }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: x0 + ((x1 - x0) * i) / steps,
        y: y0 + ((y1 - y0) * i) / steps,
        id: 1,
      }],
    });
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function tap(x, y) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

function poseDistance(a, b) {
  return Math.hypot(
    ...a.position.map((value, index) => value - b.position[index]),
  );
}

function isKnownBilibiliConsoleNoise(message) {
  return (
    message.includes("@bilibili/bili-user-fingerprint(report)") ||
    (/WebSocket connection to/.test(message) &&
      /web-player-tracker\.biliapi\.net/.test(message))
  );
}

try {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await mobile.newPage();
  cdp = await mobile.newCDPSession(page);

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !isKnownBilibiliConsoleNoise(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
    timeout: 90_000,
  });
  check("boot: demo ready on mobile", true);

  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.state === "explore",
    null,
    { timeout: 60_000 },
  );
  const exploreHint = await page.locator("#hint-text").textContent();
  check(
    "explore exposes touch guidance",
    exploreHint.includes("SWIPE UP") &&
      exploreHint.includes("TAP") &&
      exploreHint.includes("点按波纹") &&
      exploreHint.includes("拖拽环视") &&
      exploreHint.includes("滑动进入"),
    exploreHint,
  );

  const pixelRatio = await page.evaluate(() => {
    const canvas = document.querySelector("#scene-canvas");
    return canvas.width / canvas.clientWidth;
  });
  check(
    "renderer pixel ratio capped at 1.5",
    Math.abs(pixelRatio - 1.5) < 0.01,
    `actual=${pixelRatio}`,
  );

  await swipe(195, 650, 195, 260);
  await page.waitForFunction(
    () => ["scan", "scrub"].includes(window.__ENTERPRIZE_DEMO__?.state),
    null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.state === "scrub",
    null,
    { timeout: 60_000 },
  );

  const scrubHint = await page.locator("#hint-text").textContent();
  check(
    "SCRUB describes timeline, look-around, and FOCUS",
    scrubHint.includes("SWIPE VERTICAL") &&
      scrubHint.includes("DRAG HORIZONTAL") &&
      scrubHint.includes("TAP ROBOT") &&
      scrubHint.includes("推进时间轴") &&
      scrubHint.includes("拖拽环视") &&
      scrubHint.includes("聚焦兵种"),
    scrubHint,
  );

  const beforeLookPose = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.cameraPose,
  );
  await swipe(70, 440, 325, 435, 12);
  const lookState = await page.evaluate(() => ({
    mode: window.__ENTERPRIZE_DEMO__.lookAroundMode,
    pose: window.__ENTERPRIZE_DEMO__.cameraPose,
    progress: window.__ENTERPRIZE_DEMO__.timelineProgress,
  }));
  check(
    "horizontal SCRUB drag engages look-around camera",
    lookState.mode !== "idle" && poseDistance(beforeLookPose, lookState.pose) > 0.05,
    JSON.stringify({
      mode: lookState.mode,
      distance: poseDistance(beforeLookPose, lookState.pose),
    }),
  );

  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "idle",
    null,
    { timeout: 10_000 },
  );

  const progressBeforeSwipe = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.timelineProgress,
  );
  await swipe(195, 620, 195, 470, 8);
  await page.waitForTimeout(180);
  const timelineState = await page.evaluate(() => ({
    progress: window.__ENTERPRIZE_DEMO__.timelineProgress,
    velocity: window.__ENTERPRIZE_DEMO__.debugTimelineVelocity,
    lookMode: window.__ENTERPRIZE_DEMO__.lookAroundMode,
  }));
  check(
    "vertical SCRUB swipe drives timeline without stealing look-around",
    timelineState.lookMode === "idle" &&
      (timelineState.progress > progressBeforeSwipe || timelineState.velocity > 0),
    JSON.stringify({ progressBeforeSwipe, timelineState }),
  );

  let visibleTarget = null;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    visibleTarget = await page.evaluate(() => {
      const candidates = window.__ENTERPRIZE_DEMO__
        .focusTargetScreenPositions()
        .filter(
          (target) =>
            !target.behind &&
            target.x > 34 &&
            target.x < window.innerWidth - 34 &&
            target.y > 190 &&
            target.y < window.innerHeight - 120,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) -
            Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2),
        );
      return candidates[0] ?? null;
    });
    if (visibleTarget) break;
    await swipe(195, 610, 195, 520, 6);
    await page.waitForTimeout(220);
  }

  check(
    "a visible mobile FOCUS proxy can be framed",
    Boolean(visibleTarget),
    JSON.stringify(visibleTarget),
  );
  if (visibleTarget) {
    await tap(Math.round(visibleTarget.x), Math.round(visibleTarget.y));
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "focus",
      null,
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.focusMode === "active",
      null,
      { timeout: 5_000 },
    );

    const focusLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const textFits = [...document.querySelectorAll(
        ".focus-panel__name-main, .focus-panel__name-index, .focus-panel__status b",
      )].every((element) => element.scrollWidth <= element.clientWidth + 1);
      return {
        intro: rect(".focus-panel__intro"),
        media: rect(".focus-panel__media"),
        close: rect(".focus-panel__close"),
        textFits,
        closeVisible: getComputedStyle(
          document.querySelector(".focus-panel__close"),
        ).visibility,
        title: document.querySelector(".focus-panel__name-main").textContent,
        targetKey: window.__ENTERPRIZE_DEMO__.focusTargetKey,
        interaction: window.__ENTERPRIZE_DEMO__.interactionDebug,
        gestureTarget: (() => {
          const element = document.elementFromPoint(195, 520);
          return {
            tag: element?.tagName ?? null,
            id: element?.id ?? null,
            className: element?.className ?? null,
            pointerEvents: element ? getComputedStyle(element).pointerEvents : null,
          };
        })(),
      };
    });
    const selectedBaseKey = focusLayout.targetKey?.replace(/-red$/, "");
    check(
      "tap resolves overlapping proxies to a matching FOCUS panel",
      focusLayout.interaction.lastClick.selectedKey === focusLayout.targetKey &&
        focusLayout.title === selectedBaseKey?.toUpperCase(),
      JSON.stringify({ visibleTarget, focusLayout }),
    );
    check(
      "mobile FOCUS leaves a clear central 3D viewport",
      focusLayout.intro.bottom < focusLayout.media.top - 80 &&
        focusLayout.close.width >= 44 &&
        focusLayout.close.height >= 44 &&
        focusLayout.closeVisible === "visible" &&
        focusLayout.textFits,
      JSON.stringify(focusLayout),
    );

    const focusShotPath = path.join(outputDirectory, "check-mobile-focus.png");
    await page.screenshot({ path: focusShotPath, timeout: 60_000 });
    const centerCrop = await page.screenshot({
      clip: { x: 90, y: 250, width: 210, height: 260 },
      timeout: 60_000,
    });
    const centerStats = await sharp(centerCrop).stats();
    const centerDeviation = centerStats.channels
      .slice(0, 3)
      .reduce((sum, channel) => sum + channel.stdev, 0);
    check(
      "mobile FOCUS canvas center is nonblank",
      centerDeviation > 8,
      `rgb stdev sum=${centerDeviation.toFixed(2)}`,
    );

    const focusPoseBefore = await page.evaluate(
      () => window.__ENTERPRIZE_DEMO__.cameraPose,
    );
    await swipe(85, 420, 305, 425, 12);
    const focusDragState = await page.evaluate(() => ({
      pose: window.__ENTERPRIZE_DEMO__.cameraPose,
      mode: window.__ENTERPRIZE_DEMO__.focusMode,
      state: window.__ENTERPRIZE_DEMO__.state,
    }));
    check(
      "horizontal drag orbits the focused unit",
      focusDragState.state === "focus" &&
        focusDragState.mode !== "idle" &&
        poseDistance(focusPoseBefore, focusDragState.pose) > 0.02,
      JSON.stringify({
        mode: focusDragState.mode,
        distance: poseDistance(focusPoseBefore, focusDragState.pose),
      }),
    );

    await swipe(195, 520, 195, 260, 12);
    await page.waitForTimeout(350);
    const exitGestureState = await page.evaluate(() => ({
      state: window.__ENTERPRIZE_DEMO__.state,
      mode: window.__ENTERPRIZE_DEMO__.focusMode,
      phase: window.__ENTERPRIZE_DEMO__.focusExitPhase,
      interaction: window.__ENTERPRIZE_DEMO__.interactionDebug,
    }));
    check(
      "central upward swipe starts the FOCUS exit transaction",
      exitGestureState.phase === "exiting" || exitGestureState.state === "scrub",
      JSON.stringify(exitGestureState),
    );
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "scrub",
      null,
      { timeout: 8_000 },
    );
    check("swipe up exits mobile FOCUS exactly once", true);
  }

  check("no mobile page errors", pageErrors.length === 0, pageErrors.join(" | "));
  check(
    "no mobile console errors",
    consoleErrors.length === 0,
    consoleErrors.join(" | "),
  );
  await page.screenshot({
    path: path.join(outputDirectory, "check-mobile-final.png"),
    timeout: 60_000,
  });
  await mobile.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
