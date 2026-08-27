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

const browser = await chromium.launch({ executablePath, headless: true });
const viewport = { width: 1366, height: 768 };
const page = await browser.newPage({ viewport });
const bilibiliPlayerRequests = [];
const modelRequests = [];
const pointCloudRequests = [];
const scriptRequests = [];

page.on("request", (request) => {
  const url = request.url();
  if (request.resourceType() === "script") {
    scriptRequests.push(url);
  }
  if (url.startsWith("https://player.bilibili.com/player.html")) {
    bilibiliPlayerRequests.push({ url, at: Date.now() });
  }
  if (url.includes("/assets/models/")) {
    modelRequests.push(url);
  }
  if (url.includes("/assets/pointcloud/arena_points.bin")) {
    pointCloudRequests.push(url);
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
      bootstrap: window.__ENTERPRIZE_BOOTSTRAP__ ?? null,
      runtimeImportAt:
        performance.getEntriesByName("enterprize:runtime-import-start").at(-1)
          ?.startTime ?? null,
      geometryStartAt:
        performance.getEntriesByName("enterprize:p0-geometry-start").at(-1)
          ?.startTime ?? null,
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
  failIf(
    !introPreReadyState.bootstrap?.pointFetchStarted ||
      introPreReadyState.bootstrap?.runtimeImportStarted ||
      introPreReadyState.runtimeImportAt !== null ||
      introPreReadyState.geometryStartAt !== null ||
      pointCloudRequests.length !== 1 ||
      scriptRequests.some((url) => /(?:^|[/\\])three(?:\.module)?\.js(?:[?#]|$)/i.test(url)),
    "typing starts with point-cloud network prefetch but without the Three runtime",
    {
      introPreReadyState,
      pointCloudRequests,
      scriptRequests,
    },
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
      pointFetchStartAt: lastMark("enterprize:point-fetch-start"),
      pointFetchEndAt: lastMark("enterprize:point-fetch-end"),
      typingCompleteAt: lastMark("enterprize:intro-typing-complete"),
      runtimeImportStartAt: lastMark("enterprize:runtime-import-start"),
      runtimeImportEndAt: lastMark("enterprize:runtime-import-end"),
      pointBufferReadyAt: lastMark("enterprize:point-buffer-ready"),
      geometryStartAt: lastMark("enterprize:p0-geometry-start"),
      geometryCreatedAt: lastMark("enterprize:p0-geometry-created"),
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
  const orderedBootMarks = [
    bootOrderState.introPaintWindowAt,
    bootOrderState.typingCompleteAt,
    bootOrderState.runtimeImportStartAt,
    bootOrderState.runtimeImportEndAt,
    bootOrderState.pointBufferReadyAt,
    bootOrderState.geometryStartAt,
    bootOrderState.geometryCreatedAt,
    bootOrderState.p0ReadyAt,
  ];
  failIf(
    orderedBootMarks.some((value) => value === null) ||
      orderedBootMarks.some(
        (value, index) => index > 0 && value < orderedBootMarks[index - 1],
      ) ||
      bootOrderState.pointFetchStartAt === null ||
      bootOrderState.pointFetchEndAt === null ||
      bootOrderState.pointFetchStartAt > bootOrderState.typingCompleteAt ||
      bootOrderState.pointFetchEndAt > bootOrderState.pointBufferReadyAt,
    "point fetch, typing, runtime import, geometry, and P0 compile have one staged order",
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

  await page.waitForSelector("#intro-root button:not([disabled])", { timeout: 10_000 });
  await page.click("#intro-root button:not([disabled])");
  await waitState(page, "explore", 45_000);
  await page.waitForTimeout(1_000);
  const exploreFlowState = await page.evaluate(() => {
    const centerElement = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight / 2,
    );
    const bottomElement = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight - 1,
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
      bottomInArchive: Boolean(
        bottomElement?.closest("#unit-site, #zoom-parallax-root"),
      ),
      zoomVisibility: getComputedStyle(
        document.querySelector("#zoom-parallax-root"),
      ).visibility,
      unitSiteVisibility: getComputedStyle(
        document.querySelector("#unit-site"),
      ).visibility,
      archiveHeroTop: archiveHeroRect?.top ?? null,
      unitSiteTop: unitSiteRect?.top ?? null,
      viewportHeight: window.innerHeight,
    };
  });
  failIf(
    exploreFlowState.documentMode ||
      exploreFlowState.centerInArchive ||
      exploreFlowState.bottomInArchive ||
      exploreFlowState.zoomVisibility !== "hidden" ||
      exploreFlowState.unitSiteVisibility !== "hidden" ||
      exploreFlowState.archiveHeroTop < exploreFlowState.viewportHeight * 0.75,
    "EXPLORE hides the 2D roots and their top fold across the full viewport",
    exploreFlowState,
  );
  failIf(
    bilibiliPlayerRequests.length !== 0,
    "EXPLORE does not create Bilibili player documents",
    bilibiliPlayerRequests,
  );

  await page.mouse.wheel(0, 600);
  await waitState(page, "scan", 12_000);
  await waitState(page, "scrub", 120_000);
  await page.waitForTimeout(500);
  failIf(
    bilibiliPlayerRequests.length !== 0,
    "SCRUB timeline still has zero Bilibili player requests",
    bilibiliPlayerRequests,
  );

  const beforeScrubDrag = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    mode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
    cameraPose: window.__ENTERPRIZE_DEMO__?.cameraPose,
  }));
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 420, viewport.height / 2 - 90, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterScrubDrag = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    mode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
    cameraPose: window.__ENTERPRIZE_DEMO__?.cameraPose,
  }));
  const lookCameraDistance = Math.hypot(
    ...afterScrubDrag.cameraPose.position.map(
      (value, index) => value - beforeScrubDrag.cameraPose.position[index],
    ),
  );
  failIf(
    beforeScrubDrag.mode !== "idle" ||
      afterScrubDrag.mode === "idle" ||
      afterScrubDrag.state !== "scrub" ||
      lookCameraDistance < 0.1 ||
      Math.abs(afterScrubDrag.progress - beforeScrubDrag.progress) > 0.02,
    "SCRUB horizontal drag engages look-around while freezing timeline progress",
    { beforeScrubDrag, afterScrubDrag, lookCameraDistance },
  );

  const lookReleasedAt = Date.now();
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "idle",
    null,
    { timeout: 7_000 },
  );
  const lookReturnMs = Date.now() - lookReleasedAt;
  failIf(
    lookReturnMs < 2_400 || lookReturnMs > 5_000,
    "look-around holds the composition and returns to timeline once",
    { lookReturnMs },
  );

  const focusTarget = await page.evaluate(() =>
    window.__ENTERPRIZE_DEMO__
      .focusTargetScreenPositions()
      .filter(
        (target) =>
          !target.behind &&
          target.x > 60 &&
          target.x < innerWidth - 60 &&
          target.y > 80 &&
          target.y < innerHeight - 80,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) -
          Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2),
      )[0] ?? null,
  );
  failIf(!focusTarget, "a visible desktop robot can be framed for FOCUS");
  if (focusTarget) {
    await page.mouse.click(focusTarget.x, focusTarget.y);
    await waitState(page, "focus", 5_000);
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.focusMode === "active",
      null,
      { timeout: 5_000 },
    );
    const focusState = await page.evaluate(() => ({
      key: window.__ENTERPRIZE_DEMO__?.focusTargetKey,
      interaction: window.__ENTERPRIZE_DEMO__?.interactionDebug,
      title: document.querySelector(".focus-panel__name-main")?.textContent,
    }));
    failIf(
      focusState.interaction.lastClick.selectedKey !== focusState.key ||
        focusState.title !== focusState.key.replace(/-red$/, "").toUpperCase(),
      "FOCUS selection and unit panel resolve to the same robot",
      focusState,
    );

    const focusExitAt = Date.now();
    await page.mouse.wheel(0, 180);
    await waitState(page, "scrub", 3_000);
    const focusExitMs = Date.now() - focusExitAt;
    const focusExitState = await page.evaluate(() => ({
      state: window.__ENTERPRIZE_DEMO__?.state,
      mode: window.__ENTERPRIZE_DEMO__?.focusMode,
      phase: window.__ENTERPRIZE_DEMO__?.focusExitPhase,
      attempts: window.__ENTERPRIZE_DEMO__?.interactionDebug.focusExitAttempts,
    }));
    failIf(
      focusExitMs < 850 ||
        focusExitMs > 1_600 ||
        focusExitState.state !== "scrub" ||
        focusExitState.mode !== "idle" ||
        focusExitState.phase !== "idle" ||
        focusExitState.attempts !== 1,
      "FOCUS exits through one camera transaction and hands back to SCRUB",
      { focusExitMs, focusExitState },
    );
  }

  const velocityBeforeWheel = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.debugTimelineVelocity ?? 0,
  );
  await page.mouse.wheel(0, 720);
  const velocityAfterWheel = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.debugTimelineVelocity ?? 0,
  );
  failIf(
    velocityAfterWheel <= velocityBeforeWheel,
    "wheel input remains the SCRUB timeline speed control",
    { velocityBeforeWheel, velocityAfterWheel },
  );

  await page.evaluate(() => {
    const probe = { startedAt: null, endedAt: null, samples: [] };
    window.__ENTERPRIZE_REVEAL_PROBE__ = probe;
    const sample = (now) => {
      const active = document.documentElement.classList.contains(
        "is-document-transitioning",
      );
      if (active) {
        probe.startedAt ??= now;
        probe.samples.push(window.scrollY);
      } else if (probe.startedAt !== null) {
        probe.endedAt = now;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (state === "end") {
      break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(160);
  }
  await waitState(page, "end", 15_000);
  const documentRevealStartedAt = Date.now();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("is-document-transitioning"),
    null,
    { timeout: 5_000 },
  );
  const documentRevealMs = Date.now() - documentRevealStartedAt;
  const documentModeState = await page.evaluate(() => ({
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
    state: window.__ENTERPRIZE_DEMO__?.state,
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    scrollY: window.scrollY,
    targetY: document.querySelector("#zoom-parallax-root")?.offsetTop ?? null,
    zoomVisibility: getComputedStyle(
      document.querySelector("#zoom-parallax-root"),
    ).visibility,
    unitSiteVisibility: getComputedStyle(
      document.querySelector("#unit-site"),
    ).visibility,
    revealProbe: window.__ENTERPRIZE_REVEAL_PROBE__,
  }));
  const probedRevealMs =
    documentModeState.revealProbe.endedAt -
    documentModeState.revealProbe.startedAt;
  failIf(
    documentModeState.renderLoopActive !== false ||
      !documentModeState.documentMode ||
      documentModeState.zoomVisibility !== "visible" ||
      documentModeState.unitSiteVisibility !== "visible" ||
      Math.abs(documentModeState.scrollY - documentModeState.targetY) > 3 ||
      probedRevealMs < 500 ||
      documentModeState.revealProbe.samples.length < 4,
    "timeline_0 completion smoothly reveals BEYOND THE ARENA and pauses Three",
    { documentRevealMs, probedRevealMs, documentModeState },
  );

  await page.evaluate(() =>
    document.querySelector("#archive-media")?.scrollIntoView({ block: "start" }),
  );
  await page.waitForTimeout(2_800);
  const mediaVideoState = await page.evaluate(() => ({
    hydrated: document.querySelectorAll("iframe[data-video-hydrated]").length,
    directSrc: document.querySelectorAll(
      'iframe[src^="https://player.bilibili.com/player.html"]',
    ).length,
    sources: [...document.querySelectorAll("iframe[data-video-hydrated]")].map(
      (frame) => ({
        autoplay: new URL(frame.src).searchParams.get("autoplay"),
        muted: new URL(frame.src).searchParams.get("muted"),
        allow: frame.getAttribute("allow"),
      }),
    ),
  }));
  const requestIntervals = bilibiliPlayerRequests
    .slice(1, 4)
    .map((entry, index) => entry.at - bilibiliPlayerRequests[index].at);
  failIf(
    mediaVideoState.hydrated !== 4 ||
      mediaVideoState.directSrc !== 4 ||
      mediaVideoState.sources.some(
        (source) =>
          source.autoplay !== "1" ||
          source.muted !== "1" ||
          !source.allow?.includes("autoplay"),
      ) ||
      requestIntervals.some((interval) => interval < 500),
    "MATCH HIGHLIGHTS autoplay muted and hydrate through a staggered queue",
    { mediaVideoState, requestIntervals, bilibiliPlayerRequests },
  );

  await page.evaluate(() =>
    document
      .querySelector(".archive-media-row--intro")
      ?.scrollIntoView({ block: "center" }),
  );
  await page.waitForTimeout(1_000);
  const whatIsRmVideoState = await page.evaluate(() => ({
    hydrated: document.querySelectorAll("iframe[data-video-hydrated]").length,
    directSrc: document.querySelectorAll(
      'iframe[src^="https://player.bilibili.com/player.html"]',
    ).length,
    source: document.querySelector(".archive-media-row--intro iframe")?.src,
  }));
  const whatIsRmParams = new URL(whatIsRmVideoState.source).searchParams;
  failIf(
    whatIsRmVideoState.hydrated !== 5 ||
      whatIsRmVideoState.directSrc !== 5 ||
      whatIsRmParams.get("autoplay") !== "1" ||
      whatIsRmParams.get("muted") !== "1",
    "What is RoboMaster autoplays when its row approaches the viewport",
    whatIsRmVideoState,
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await waitState(page, "scrub", 15_000);
  await page.waitForTimeout(700);
  const returnedState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
  }));
  failIf(
    returnedState.renderLoopActive !== true || returnedState.state !== "scrub",
    "returning to timeline resumes Three without immediately re-entering the archive",
    returnedState,
  );

  console.log(
    "[summary]",
    JSON.stringify({
      bilibiliPlayerRequests: bilibiliPlayerRequests.length,
      introPreReadyState,
      bootOrderState,
      documentRevealMs,
      mediaVideoState,
      whatIsRmVideoState,
    }),
  );
} finally {
  await browser.close();
}
