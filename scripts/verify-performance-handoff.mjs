import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5177/";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

function failIf(condition, message, detail = undefined) {
  if (!condition) {
    console.log(`[ok] ${message}`);
    return;
  }
  const suffix = detail === undefined ? "" : `: ${JSON.stringify(detail)}`;
  throw new Error(`[fail] ${message}${suffix}`);
}

async function waitState(page, state, timeout = 30_000) {
  await page.waitForFunction(
    (wanted) => window.__ENTERPRIZE_DEMO__?.state === wanted,
    state,
    { timeout },
  );
}

async function findVisibleFocusTarget(page, viewport) {
  const edgeMargin = 72;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const targets = await page.evaluate(() =>
      window.__ENTERPRIZE_DEMO__?.focusTargetScreenPositions() ?? [],
    );
    const target = targets.find(
      (entry) =>
        !entry.behind &&
        entry.x > edgeMargin &&
        entry.x < viewport.width - edgeMargin &&
        entry.y > edgeMargin &&
        entry.y < viewport.height - edgeMargin,
    );
    if (target) {
      return target;
    }
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(550);
  }
  return null;
}

const browser = await chromium.launch({ executablePath, headless: true });
const viewport = { width: 1366, height: 768 };
const page = await browser.newPage({ viewport });
const bilibiliPlayerRequests = [];
const modelRequests = [];

page.on("request", (request) => {
  const url = request.url();
  if (url.startsWith("https://player.bilibili.com/player.html")) {
    bilibiliPlayerRequests.push(url);
  }
  if (url.includes("/assets/models/")) {
    modelRequests.push(url);
  }
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#intro-root > *", { timeout: 8_000 });
  const introPreReadyState = await page.evaluate(() => {
    const introRoot = document.querySelector("#intro-root");
    return {
      demoReady: window.__ENTERPRIZE_DEMO__?.ready === true,
      hasIntroRoot: Boolean(introRoot),
      hasIntroContent: Boolean(introRoot?.children.length),
      modelRequests: performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/assets/models/")).length,
    };
  });
  failIf(
    !introPreReadyState.hasIntroRoot || !introPreReadyState.hasIntroContent,
    "Intro root renders before waiting for the 3D runtime",
    introPreReadyState,
  );

  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.ready === true,
    null,
    { timeout: 90_000 },
  );
  const bootOrderState = await page.evaluate(() => {
    const lastMark = (name) =>
      performance.getEntriesByName(name).at(-1)?.startTime ?? null;
    return {
      introMountedAt: lastMark("enterprize:intro-mounted"),
      introPaintWindowAt: lastMark("enterprize:intro-paint-window"),
      p0ReadyAt: lastMark("enterprize:p0-ready"),
    };
  });
  failIf(
    bootOrderState.introPaintWindowAt === null ||
      bootOrderState.p0ReadyAt === null ||
      bootOrderState.introPaintWindowAt > bootOrderState.p0ReadyAt,
    "Intro paint window is scheduled before P0 scene readiness",
    bootOrderState,
  );

  const initialVideoState = await page.evaluate(() => ({
    directSrc: document.querySelectorAll(
      'iframe[src^="https://player.bilibili.com/player.html"]',
    ).length,
    deferredSrc: document.querySelectorAll("iframe[data-src]").length,
    facade: document.querySelectorAll("[data-video-facade]").length,
  }));
  failIf(
    initialVideoState.directSrc !== 0 ||
      initialVideoState.deferredSrc !== 5 ||
      initialVideoState.facade !== 5,
    "Bilibili iframes start as five deferred facades",
    initialVideoState,
  );
  const bootRuntimeState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    introReady: window.__ENTERPRIZE_DEMO__?.introReady,
    loadedAssetKeys: window.__ENTERPRIZE_DEMO__?.loadedAssetKeys,
    deferredAssetsReady: window.__ENTERPRIZE_DEMO__?.deferredAssetsReady,
    archiveIslandsReady: window.__ENTERPRIZE_DEMO__?.archiveIslandsReady,
  }));
  failIf(
    modelRequests.length !== 0 ||
      !bootRuntimeState.introReady ||
      bootRuntimeState.loadedAssetKeys.length !== 0 ||
      bootRuntimeState.deferredAssetsReady ||
      bootRuntimeState.archiveIslandsReady,
    "BOOT leaves P1 glTF and 2D React islands deferred",
    { modelRequests, bootRuntimeState },
  );

  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await waitState(page, "explore", 45_000);
  await page.waitForTimeout(1_000);
  const exploreFlowState = await page.evaluate(() => {
    const centerElement = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight / 2,
    );
    const archiveHeroRect = document
      .querySelector("#archive-hero")
      ?.getBoundingClientRect();
    const unitSiteRect = document.querySelector("#unit-site")?.getBoundingClientRect();
    return {
      state: window.__ENTERPRIZE_DEMO__?.state,
      documentMode: document.documentElement.classList.contains("is-document-mode"),
      scrollY: window.scrollY,
      centerInArchive: Boolean(
        centerElement?.closest("#unit-site, #zoom-parallax-root"),
      ),
      archiveHeroTop: archiveHeroRect?.top ?? null,
      unitSiteTop: unitSiteRect?.top ?? null,
      viewportHeight: window.innerHeight,
    };
  });
  failIf(
    exploreFlowState.documentMode ||
      exploreFlowState.centerInArchive ||
      exploreFlowState.archiveHeroTop < exploreFlowState.viewportHeight * 0.75,
    "Intro hands off to EXPLORE instead of the 2D archive hero",
    exploreFlowState,
  );
  failIf(
    bilibiliPlayerRequests.length !== 0,
    "EXPLORE does not create Bilibili player documents",
    bilibiliPlayerRequests,
  );

  await page.mouse.wheel(0, 600);
  await waitState(page, "scan", 12_000);
  await waitState(page, "scrub", 60_000);
  await page.waitForTimeout(500);
  failIf(
    bilibiliPlayerRequests.length !== 0,
    "SCRUB timeline still has zero Bilibili player requests",
    bilibiliPlayerRequests,
  );

  const focusTarget = await findVisibleFocusTarget(page, viewport);
  failIf(!focusTarget, "a focus target is hittable in SCRUB");
  await page.mouse.click(focusTarget.x, focusTarget.y);
  await waitState(page, "focus", 20_000);
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.focusMode === "active",
    null,
    { timeout: 30_000 },
  );

  const focusExitStart = Date.now();
  await page.mouse.wheel(0, 320);
  await page.mouse.wheel(0, 320);
  await page.mouse.wheel(0, 320);
  await page.waitForFunction(
    () =>
      window.__ENTERPRIZE_DEMO__?.state === "scrub" &&
      window.__ENTERPRIZE_DEMO__?.focusMode === "idle",
    null,
    { timeout: 4_000 },
  );
  const focusExitMs = Date.now() - focusExitStart;
  const afterFocusExit = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    focusMode: window.__ENTERPRIZE_DEMO__?.focusMode,
    velocity: window.__ENTERPRIZE_DEMO__?.debugTimelineVelocity,
  }));
  failIf(
    focusExitMs > 2_200,
    "FOCUS exits without the old 500ms + 1000ms + retrigger tail",
    { focusExitMs, afterFocusExit },
  );

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 640, viewport.height / 2 - 80, {
    steps: 18,
  });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode !== "idle",
    null,
    { timeout: 5_000 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "holding",
    null,
    { timeout: 3_000 },
  );
  const heldLookAround = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    lookAroundMode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    distance: window.__ENTERPRIZE_DEMO__?.lookAroundDistance,
    holdRemaining: window.__ENTERPRIZE_DEMO__?.lookAroundHoldRemaining,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
    velocity: window.__ENTERPRIZE_DEMO__?.debugTimelineVelocity,
  }));
  await page.waitForTimeout(700);
  const afterHoldWindow = await page.evaluate(() => ({
    mode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
  }));
  failIf(
    afterHoldWindow.mode !== "holding" ||
      Math.abs(afterHoldWindow.progress - heldLookAround.progress) > 1e-4,
    "look-around stays available after pointer-up and keeps the timeline frozen",
    { heldLookAround, afterHoldWindow },
  );

  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(200);
  const zoomedLookAround = await page.evaluate(() => ({
    mode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    distance: window.__ENTERPRIZE_DEMO__?.lookAroundDistance,
    holdRemaining: window.__ENTERPRIZE_DEMO__?.lookAroundHoldRemaining,
  }));
  failIf(
    zoomedLookAround.mode === "idle" ||
      zoomedLookAround.distance >= heldLookAround.distance - 0.05 ||
      zoomedLookAround.holdRemaining < 2,
    "wheel zooms in during look-around and refreshes its hold window",
    { heldLookAround, zoomedLookAround },
  );

  const heldFocusTarget = await findVisibleFocusTarget(page, viewport);
  failIf(!heldFocusTarget, "a focus target remains hittable while look-around is held");
  await page.mouse.click(heldFocusTarget.x, heldFocusTarget.y);
  await waitState(page, "focus", 20_000);
  await page.mouse.wheel(0, 320);
  await page.waitForFunction(
    () =>
      window.__ENTERPRIZE_DEMO__?.state === "scrub" &&
      window.__ENTERPRIZE_DEMO__?.focusMode === "idle",
    null,
    { timeout: 4_000 },
  );

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 260, viewport.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "holding",
    null,
    { timeout: 3_000 },
  );
  const lookReturnStart = Date.now();
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "idle",
    null,
    { timeout: 6_000 },
  );
  const lookReturnMs = Date.now() - lookReturnStart;
  failIf(
    lookReturnMs < 2_300 || lookReturnMs > 4_200,
    "look-around returns to the timeline after its click window expires",
    { lookReturnMs },
  );

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (state === "end") {
      break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(160);
  }
  await waitState(page, "end", 15_000);
  await page.waitForTimeout(300);
  const documentModeState = await page.evaluate(() => ({
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
    state: window.__ENTERPRIZE_DEMO__?.state,
  }));
  failIf(
    documentModeState.renderLoopActive !== false,
    "Three animation loop is paused in 2D archive mode",
    documentModeState,
  );

  await page.evaluate(() =>
    document.querySelector("#archive-media")?.scrollIntoView({ block: "start" }),
  );
  await page.waitForTimeout(1_200);
  const mediaVideoState = await page.evaluate(() => ({
    hydrated: document.querySelectorAll("iframe[data-video-hydrated]").length,
    directSrc: document.querySelectorAll(
      'iframe[src^="https://player.bilibili.com/player.html"]',
    ).length,
  }));
  failIf(
    mediaVideoState.hydrated !== 1 || mediaVideoState.directSrc !== 1,
    "media section autoloads only the main video iframe",
    mediaVideoState,
  );

  await page.click(".archive-media__grid [data-video-facade]");
  await page.waitForTimeout(300);
  const clickedVideoState = await page.evaluate(() => ({
    hydrated: document.querySelectorAll("iframe[data-video-hydrated]").length,
    directSrc: document.querySelectorAll(
      'iframe[src^="https://player.bilibili.com/player.html"]',
    ).length,
  }));
  failIf(
    clickedVideoState.hydrated !== 2 || clickedVideoState.directSrc !== 2,
    "highlight video hydrates only after its facade is clicked",
    clickedVideoState,
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await waitState(page, "scrub", 15_000);
  const returnedState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
  }));
  failIf(
    returnedState.renderLoopActive !== true,
    "returning to timeline resumes the Three animation loop",
    returnedState,
  );

  console.log(
    "[summary]",
    JSON.stringify({
      focusExitMs,
      lookReturnMs,
      bilibiliPlayerRequests: bilibiliPlayerRequests.length,
      introPreReadyState,
      bootOrderState,
      mediaVideoState,
      clickedVideoState,
    }),
  );
} finally {
  await browser.close();
}
