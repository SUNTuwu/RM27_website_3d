import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { VISUAL_CONFIG } from "../src/config.js";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory =
  process.env.ENTERPRIZE_VERIFY_DIR ?? path.join(os.tmpdir(), "enterprize-demo-verification");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

const failures = [];
function failIf(condition, message) {
  if (condition) {
    failures.push(message);
    console.error(`[fail] ${message}`);
  } else {
    console.log(`[ok] ${message}`);
  }
}

function rectanglesOverlap(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

async function getState(page) {
  return page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
}

async function getProgress(page) {
  return page.evaluate(() => window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0);
}

async function waitState(page, expected, timeout = 30_000) {
  await page.waitForFunction(
    (wanted) => window.__ENTERPRIZE_DEMO__?.state === wanted,
    expected,
    { timeout },
  );
}

try {
  // ---------------- 桌面端: 完整交互链路 ----------------
  // SwiftShader 渲染慢, 用小视口换取帧率; 高度需 >= 760 避免触发移动端降级
  const viewW = 1024;
  const viewH = 768;
  const edgeMargin = 40;
  const context = await browser.newContext({
    viewport: { width: viewW, height: viewH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const modelResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/assets/models/")) {
      modelResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 60_000,
  });
  console.log("[ok] demo booted");

  // BOOT -> ASSEMBLE -> EXPLORE
  await waitState(page, "explore", 30_000);
  failIf(false, "state reached EXPLORE (point cloud assembled)");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDirectory, "01-explore.png") });
  const exploreLayout = await page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
      };
    };
    return {
      keyHints: [...document.querySelectorAll(".key-hint")].map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
        };
      }),
      keyCaps: [...document.querySelectorAll(".key-hint__key")].map((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          width: bounds.width,
          height: bounds.height,
          transform: style.transform,
          backgroundImage: style.backgroundImage,
        };
      }),
      arrowHasHatch: [...document.querySelectorAll(".hud-slant-button")].some(
        (element) => getComputedStyle(element).backgroundImage.includes("repeating"),
      ),
      hintSkew: Math.abs(
        new DOMMatrix(getComputedStyle(document.querySelector(".hint-bar")).transform).c,
      ),
      hintColors: {
        action: getComputedStyle(document.querySelector(".hint-bar")).color,
        title: getComputedStyle(document.querySelector(".hint-bar b")).color,
        stateAction: getComputedStyle(document.querySelector(".state-chip__label")).color,
        stateTitle: getComputedStyle(document.querySelector(".state-chip__index")).color,
      },
      hint: rect(".hint-bar"),
      switcher: rect(".explore-panel__switcher"),
    };
  });
  const [leftKey, spaceKey, rightKey] = exploreLayout.keyCaps;
  failIf(
    Math.abs(leftKey.height - rightKey.height) > 1 ||
      Math.max(leftKey.width, rightKey.width) >= 70 ||
      spaceKey.width <= 150 ||
      spaceKey.height <= 60 ||
      exploreLayout.keyCaps.some(
        (key) => key.transform !== "none" || key.backgroundImage !== "none",
      ),
    "EXPLORE shortcuts retain the original rectangular key sizes",
  );
  failIf(
    exploreLayout.keyHints.some((bounds) =>
      rectanglesOverlap(bounds, exploreLayout.hint),
    ),
    "EXPLORE shortcut controls do not overlap the shared hint bar",
  );
  failIf(
    exploreLayout.switcher.right > viewW - edgeMargin,
    "EXPLORE model switcher remains inside the viewport frame",
  );
  failIf(
    exploreLayout.arrowHasHatch,
    "switcher arrow buttons contain no diagonal hatch texture",
  );
  failIf(
    exploreLayout.hintSkew > 1e-6,
    "the bottom hint bar remains rectangular like the state chip",
  );
  failIf(
    exploreLayout.hintColors.action !== exploreLayout.hintColors.stateAction ||
      exploreLayout.hintColors.title !== exploreLayout.hintColors.stateTitle,
    "the bottom hint uses the state chip gray-title and white-text hierarchy",
  );

  // EXPLORE: 点击径向扩散
  await page.mouse.move(viewW / 2, viewH / 2);
  await page.mouse.click(viewW / 2, viewH / 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDirectory, "02-ripple.png") });
  failIf((await getState(page)) !== "explore", "click ripple keeps EXPLORE state");

  // EXPLORE -> SCAN -> SCRUB
  await page.mouse.wheel(0, 600);
  await waitState(page, "scan", 10_000);
  await page.waitForTimeout(1_600);
  await page.screenshot({ path: path.join(outputDirectory, "03-scan-mid.png") });
  await waitState(page, "scrub", 45_000);
  failIf(false, "SCAN transition completed into SCRUB");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDirectory, "04-scrub-start.png") });

  // SCRUB: 自动推进 (无滚轮输入)
  const progressBefore = await getProgress(page);
  await page.waitForTimeout(6_000);
  const progressAfter = await getProgress(page);
  failIf(progressAfter <= progressBefore + 0.05, "auto-drive pushes timeline without wheel input");

  // SCRUB: 滚轮回滚
  const progressPeak = await getProgress(page);
  await page.mouse.wheel(0, -3000);
  await page
    .waitForFunction(
      (peak) => (window.__ENTERPRIZE_DEMO__?.timelineProgress ?? peak) < peak,
      progressPeak,
      { timeout: 15_000 },
    )
    .catch(() => {});
  const progressRewound = await getProgress(page);
  failIf(progressRewound >= progressPeak, "wheel rewind pulls timeline backward");

  // SCRUB -> FOCUS: 推进到机器人可见后点击
  let robotPos = await page.evaluate(() => window.__ENTERPRIZE_DEMO__.robotScreenPosition());
  for (let attempt = 0; attempt < 12 && (robotPos.behind || robotPos.x < edgeMargin || robotPos.x > viewW - edgeMargin || robotPos.y < edgeMargin || robotPos.y > viewH - edgeMargin); attempt++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(900);
    robotPos = await page.evaluate(() => window.__ENTERPRIZE_DEMO__.robotScreenPosition());
  }
  failIf(robotPos.behind, "robot anchor became visible in timeline camera");
  await page.mouse.click(robotPos.x, robotPos.y);
  await waitState(page, "focus", 20_000);
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.focusMode === "active", null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDirectory, "05-focus.png") });
  const focusLayout = await page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    };
    return {
      mediaBar: rect(".focus-panel__bar"),
      mediaDescription: rect(".focus-panel__slide-desc"),
      hint: rect(".hint-bar"),
      timeline: rect(".timeline-hud"),
    };
  });
  failIf(
    rectanglesOverlap(focusLayout.mediaBar, focusLayout.mediaDescription),
    "FOCUS media switcher does not overlap its description",
  );
  failIf(
    rectanglesOverlap(focusLayout.mediaDescription, focusLayout.hint),
    "FOCUS media description does not overlap the shared hint bar",
  );
  failIf(
    rectanglesOverlap(focusLayout.hint, focusLayout.timeline),
    "FOCUS hint bar does not overlap the timeline panel",
  );
  failIf(false, "FOCUS state active around robot");

  // FOCUS: 拖拽观察 + 滚轮退出
  await page.mouse.move(robotPos.x, robotPos.y);
  await page.mouse.down();
  await page.mouse.move(robotPos.x + 220, robotPos.y - 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDirectory, "06-focus-drag.png") });
  await page.mouse.move(viewW / 2, viewH / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.state === "scrub" && window.__ENTERPRIZE_DEMO__?.focusMode === "idle",
    null,
    { timeout: 30_000 },
  );
  failIf(false, "wheel exits FOCUS back to SCRUB seamlessly");

  // SCRUB 满进度 (无 END 锁定) + 滚轮回拨
  for (let attempt = 0; attempt < 60 && (await getProgress(page)) < 0.98; attempt++) {
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(400);
  }
  const fullProgress = await getProgress(page);
  failIf(fullProgress < 0.98, "timeline reaches full progress");
  failIf((await getState(page)) !== "scrub", "state stays SCRUB at 100% (no END lock)");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDirectory, "07-full-progress.png") });
  await page.mouse.wheel(0, -2400);
  await page.waitForTimeout(1_200);
  const rewoundProgress = await getProgress(page);
  failIf(rewoundProgress >= fullProgress, "wheel rewind works at 100% progress");

  // 运行时断言
  failIf(consoleErrors.length > 0, `no console errors: ${consoleErrors.join(" | ")}`);
  failIf(pageErrors.length > 0, `no page errors: ${pageErrors.join(" | ")}`);
  failIf(failedRequests.length > 0, `no failed requests: ${failedRequests.join(" | ")}`);
  failIf(
    modelResponses.some((response) => response.status !== 200),
    "all model resources return HTTP 200",
  );
  failIf(modelResponses.length < 9, `model resources observed: ${modelResponses.length} >= 9`);
  const pointCount = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.pointCount ?? 0);
  failIf(
    pointCount !== VISUAL_CONFIG.pointCloud.count,
    `point cloud count ${pointCount} matches config ${VISUAL_CONFIG.pointCloud.count}`,
  );
  const arenaSymmetry = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.arenaSymmetry,
  );
  failIf(
    arenaSymmetry?.halfCount !== 2 ||
      arenaSymmetry?.rotationAxis !== "y" ||
      Math.abs((arenaSymmetry?.rotationRadians ?? 0) - Math.PI) > 1e-6,
    "arena contains two halves with a 180-degree vertical-axis rotation",
  );
  failIf(
    !arenaSymmetry?.geometryShared ||
      !arenaSymmetry?.texturesShared ||
      !arenaSymmetry?.materialsIndependent,
    "arena halves share geometry/textures and isolate materials",
  );
  failIf(
    arenaSymmetry?.mixerCount !== 2 ||
      arenaSymmetry?.mixerTimes.some((time) => time <= 0),
    "both arena animation mixers are running",
  );
  failIf(
    modelResponses.filter((response) =>
      response.url.includes("/assets/models/arena/arena_half_blue.gltf"),
    ).length !== 1,
    "the blue half-arena glTF is transferred once",
  );

  // 截图非空启发式: 3D 画面 PNG 应远大于纯色图
  for (const name of ["01-explore.png", "04-scrub-start.png", "05-focus.png"]) {
    const details = await stat(path.join(outputDirectory, name));
    failIf(details.size < 40_000, `${name} looks non-blank (${details.size} bytes)`);
  }

  await context.close();

  // ---------------- 移动端: 降级 ----------------
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileModelRequests = [];
  mobilePage.on("response", (response) => {
    if (response.url().includes("/assets/models/")) {
      mobileModelRequests.push(response.url());
    }
  });
  await mobilePage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await mobilePage.waitForTimeout(2_500);
  const mobileVisible = await mobilePage.evaluate(() => {
    const screen = document.querySelector("#mobile-screen");
    return screen && !screen.hidden;
  });
  failIf(!mobileVisible, "mobile fallback screen is shown");
  failIf(mobileModelRequests.length > 0, "mobile fallback downloads no glTF assets");
  const demoHandle = await mobilePage.evaluate(() => window.__ENTERPRIZE_DEMO__);
  failIf(demoHandle !== undefined, "mobile fallback does not boot the 3D demo");
  await mobilePage.screenshot({ path: path.join(outputDirectory, "08-mobile.png") });
  await mobileContext.close();
} finally {
  await browser.close();
}

console.log(`\nScreenshots: ${outputDirectory}`);
if (failures.length) {
  throw new Error(`Visual verification failed:\n${failures.join("\n")}`);
}
console.log("\nDemo E2E verification passed.");
