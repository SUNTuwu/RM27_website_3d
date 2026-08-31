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
  if (url.includes("/assets/pointcloud/") && url.includes("_points.bin")) {
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
      !pointCloudRequests.some((url) => url.includes("/arena_points.bin")) ||
      scriptRequests.some((url) => /(?:^|[/\\])three(?:\.module)?\.js(?:[?#]|$)/i.test(url)),
    "typing starts point-cloud prefetch without importing the Three runtime",
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
    explorePointFetchDone:
      window.__ENTERPRIZE_BOOTSTRAP__?.explorePointFetchDone ?? 0,
    exploreCloudKeysReady:
      window.__ENTERPRIZE_DEMO__?.exploreCloudKeysReady ?? [],
  }));
  failIf(
    modelRequests.length !== 0 ||
      !bootRuntimeState.introReady ||
      bootRuntimeState.loadedAssetKeys.length !== 0 ||
      bootRuntimeState.deferredAssetsReady ||
      bootRuntimeState.archiveIslandsReady ||
      pointCloudRequests.length !== 4 ||
      !["arena", "dart", "infantry", "engineer"].every((key) =>
        pointCloudRequests.some((url) => url.includes(`/${key}_points.bin`)),
      ) ||
      bootRuntimeState.explorePointFetchDone !== 3 ||
      !["arena", "dart", "infantry", "engineer"].every((key) =>
        bootRuntimeState.exploreCloudKeysReady.includes(key),
      ),
    "BOOT prebuilds EXPLORE clouds while leaving P1 glTF and 2D islands deferred",
    { modelRequests, bootRuntimeState },
  );

  const launchButtonSelector = "#intro-root [data-intro-cta]";
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("aria-busy") === "false",
    launchButtonSelector,
    { timeout: 10_000 },
  );
  await page.click(launchButtonSelector);
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
  await page.waitForFunction(
    () =>
      document.querySelectorAll('iframe[data-video-hydrated="preloaded"]').length >= 2,
    null,
    { timeout: 5_000 },
  );
  const scrubVideoState = await page.evaluate(() => ({
    playing: document.querySelectorAll('iframe[data-video-playing="true"]').length,
    sources: [...document.querySelectorAll('iframe[data-video-hydrated="preloaded"]')].map(
      (frame) => ({
        autoplay: new URL(frame.src).searchParams.get("autoplay"),
        muted: new URL(frame.src).searchParams.get("muted"),
        facadeHidden: frame.parentElement?.querySelector("[data-video-facade]")?.hidden,
      }),
    ),
  }));
  const scrubPrewarmRequests = [...bilibiliPlayerRequests];
  const scrubPrewarmIntervals = scrubPrewarmRequests
    .slice(1)
    .map((entry, index) => entry.at - scrubPrewarmRequests[index].at);
  failIf(
    scrubPrewarmRequests.length < 2 ||
      scrubVideoState.playing !== 0 ||
      scrubVideoState.sources.some(
        (source) =>
          source.autoplay !== "0" ||
          source.muted !== "1" ||
          source.facadeHidden !== false,
      ) ||
      scrubPrewarmIntervals.some((interval) => interval < 500),
    "SCRUB prewarms muted Bilibili players without autoplay through a staggered queue",
    { scrubVideoState, scrubPrewarmRequests, scrubPrewarmIntervals },
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
    const nativeScrollTo = window.scrollTo.bind(window);
    window.__ENTERPRIZE_HANDOFF_PROBE__ = { calls: [] };
    window.scrollTo = (...args) => {
      window.__ENTERPRIZE_HANDOFF_PROBE__.calls.push({
        at: performance.now(),
        args,
      });
      return nativeScrollTo(...args);
    };
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
  // 模拟真实滚轮惯性: 进档后仍有短暂 wheel 余波, 不应掐掉自动滑屏
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(
    () => {
      const target = document.querySelector("#zoom-parallax-root");
      return (
        document.documentElement.classList.contains("is-document-mode") &&
        target &&
        // 新契约: 99→100 穿越进档后自动向下滚满一整屏揭示距离
        // (≈zoom 根 offsetTop), 期间测试不发出任何 wheel 输入
        window.scrollY >= target.offsetTop - 2
      );
    },
    null,
    { timeout: 8_000 },
  );
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.archiveAutoScrollActive === false,
    null,
    { timeout: 4_000 },
  );
  const documentModeState = await page.evaluate(() => ({
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
    state: window.__ENTERPRIZE_DEMO__?.state,
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    scrollY: window.scrollY,
    zoomRootTop: document
      .querySelector("#zoom-parallax-root")
      ?.getBoundingClientRect().top,
    viewportH: window.innerHeight,
    targetY: document.querySelector("#zoom-parallax-root")?.offsetTop ?? null,
    zoomVisibility: getComputedStyle(
      document.querySelector("#zoom-parallax-root"),
    ).visibility,
    unitSiteVisibility: getComputedStyle(
      document.querySelector("#unit-site"),
    ).visibility,
    enteringClass: document.documentElement.classList.contains(
      "is-document-entering",
    ),
    transitioningClass: document.documentElement.classList.contains(
      "is-document-transitioning",
    ),
    handoffProbe: window.__ENTERPRIZE_HANDOFF_PROBE__,
  }));
  failIf(
    documentModeState.renderLoopActive !== false ||
      !documentModeState.documentMode ||
      documentModeState.zoomVisibility !== "visible" ||
      documentModeState.unitSiteVisibility !== "visible" ||
      Math.abs(documentModeState.scrollY - documentModeState.targetY) > 2 ||
      Math.abs(
        documentModeState.zoomRootTop +
          documentModeState.scrollY -
          documentModeState.viewportH,
      ) > 2 ||
      documentModeState.enteringClass ||
      documentModeState.transitioningClass ||
      documentModeState.handoffProbe.calls.length < 2,
    "timeline_0 completion auto-scrolls one reveal screen into the archive and pauses Three",
    { documentModeState },
  );
  // 反向纯手动: 无输入静置后档案不得自动回 3D, 滚动位置不得漂移
  await page.waitForTimeout(700);
  const idleArchiveState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    scrollY: window.scrollY,
  }));
  failIf(
    idleArchiveState.state !== "end" ||
      Math.abs(idleArchiveState.scrollY - documentModeState.scrollY) > 4,
    "archive stays put without input (2D→3D return remains manual only)",
    { handoffScrollY: documentModeState.scrollY, idleArchiveState },
  );

  await page.waitForFunction(
    () => document.querySelectorAll('iframe[data-video-hydrated="preloaded"]').length === 5,
    null,
    { timeout: 10_000 },
  );
  const preMediaVideoState = await page.evaluate(() => ({
    playing: document.querySelectorAll('iframe[data-video-playing="true"]').length,
    sources: [...document.querySelectorAll("iframe[data-video-hydrated]")].map((frame) => ({
      state: frame.dataset.videoHydrated,
      autoplay: new URL(frame.src).searchParams.get("autoplay"),
      muted: new URL(frame.src).searchParams.get("muted"),
      facadeHidden: frame.parentElement?.querySelector("[data-video-facade]")?.hidden,
    })),
  }));
  failIf(
    preMediaVideoState.sources.length !== 5 ||
      preMediaVideoState.playing !== 0 ||
      preMediaVideoState.sources.some(
        (source) =>
          source.state !== "preloaded" ||
          source.autoplay !== "0" ||
          source.muted !== "1" ||
          source.facadeHidden !== false,
      ),
    "all Bilibili players remain preloaded and paused before their media enters the viewport",
    preMediaVideoState,
  );

  const archiveMediaFrameCount = await page.locator("#archive-media iframe").count();
  failIf(
    archiveMediaFrameCount !== 4,
    "ON THE RECORD exposes the expected four deferred players",
    { archiveMediaFrameCount },
  );
  await page.evaluate(() =>
    document
      .querySelector("#archive-media .archive-media__feature .archive-media__player")
      ?.scrollIntoView({ block: "center" }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector(
        '#archive-media .archive-media__feature iframe[data-video-playing="true"]',
      ),
    null,
    { timeout: 8_000 },
  );
  const featureVisibleState = await page.evaluate(() => ({
    featurePlaying: document.querySelectorAll(
      '#archive-media .archive-media__feature iframe[data-video-playing="true"]',
    ).length,
    featureAutoplay: new URL(
      document.querySelector("#archive-media .archive-media__feature iframe").src,
    ).searchParams.get("autoplay"),
    gridPlaying: document.querySelectorAll(
      '#archive-media .archive-media__grid iframe[data-video-playing="true"]',
    ).length,
    gridAutoplay: [
      ...document.querySelectorAll("#archive-media .archive-media__grid iframe"),
    ].map((frame) => new URL(frame.src).searchParams.get("autoplay")),
  }));
  failIf(
    featureVisibleState.featurePlaying !== 1 ||
      featureVisibleState.featureAutoplay !== "1" ||
      featureVisibleState.gridPlaying !== 0 ||
      featureVisibleState.gridAutoplay.some((autoplay) => autoplay !== "0"),
    "the feature player starts only after it is visible while the highlight grid stays paused",
    featureVisibleState,
  );

  await page.evaluate(() =>
    document
      .querySelector("#archive-media .archive-media__grid")
      ?.scrollIntoView({ block: "center" }),
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '#archive-media .archive-media__grid iframe[data-video-playing="true"]',
      ).length === 3,
    null,
    { timeout: 8_000 },
  );
  const mediaVideoState = await page.evaluate(() => ({
    hydrated: document.querySelectorAll("#archive-media iframe[data-video-hydrated]").length,
    playing: document.querySelectorAll('#archive-media iframe[data-video-playing="true"]').length,
    sources: [...document.querySelectorAll("#archive-media iframe[data-video-hydrated]")].map(
      (frame) => ({
        autoplay: new URL(frame.src).searchParams.get("autoplay"),
        muted: new URL(frame.src).searchParams.get("muted"),
        allow: frame.getAttribute("allow"),
      }),
    ),
    offscreenSource: document.querySelector(".archive-media-row--intro iframe")?.src,
    offscreenPlaying: document
      .querySelector(".archive-media-row--intro iframe")
      ?.hasAttribute("data-video-playing"),
  }));
  const visiblePlayRequests = bilibiliPlayerRequests.filter(
    (entry) => new URL(entry.url).searchParams.get("autoplay") === "1",
  );
  const offscreenParams = new URL(mediaVideoState.offscreenSource).searchParams;
  failIf(
    mediaVideoState.hydrated !== 4 ||
      mediaVideoState.playing !== 4 ||
      mediaVideoState.sources.some(
        (source) =>
          source.autoplay !== "1" ||
          source.muted !== "1" ||
          !source.allow?.includes("autoplay"),
      ) ||
      visiblePlayRequests.length < 1 ||
      mediaVideoState.offscreenPlaying !== false ||
      offscreenParams.get("autoplay") !== "0" ||
      offscreenParams.get("muted") !== "1",
    "MATCH HIGHLIGHTS autoplay only after becoming visible while later media stays paused",
    { mediaVideoState, visiblePlayRequests, bilibiliPlayerRequests },
  );

  await page.evaluate(() =>
    document
      .querySelector(".archive-media-row--intro")
      ?.scrollIntoView({ block: "center" }),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector(".archive-media-row--intro iframe")
        ?.hasAttribute("data-video-playing"),
    null,
    { timeout: 8_000 },
  );
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
    "What is RoboMaster autoplays only when its row is visible",
    whatIsRmVideoState,
  );

  await page.evaluate(() =>
    document
      .querySelector('[data-action="return-arena"]')
      ?.scrollIntoView({ block: "center" }),
  );
  await page.click('[data-action="return-arena"]');
  await page.waitForFunction(
    () =>
      window.__ENTERPRIZE_DEMO__?.state === "scrub" &&
      window.__ENTERPRIZE_DEMO__?.lookAroundMode !== "idle" &&
      document.documentElement.dataset.arenaReturnPhase === "idle",
    null,
    { timeout: 15_000 },
  );
  const returnedState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
    lookAroundMode: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    fadeVisible: document
      .querySelector("#archive-return-fade")
      ?.classList.contains("is-visible"),
    returnCompleteMarks: performance.getEntriesByName(
      "enterprize:arena-return-complete",
    ).length,
  }));
  failIf(
    returnedState.renderLoopActive !== true ||
      returnedState.state !== "scrub" ||
      returnedState.lookAroundMode === "idle" ||
      returnedState.documentMode ||
      returnedState.fadeVisible ||
      returnedState.returnCompleteMarks !== 1,
    "ENTER THE ARENA fades into a stable look-around view without re-entering the archive",
    returnedState,
  );

  console.log(
    "[summary]",
    JSON.stringify({
      bilibiliPlayerRequests: bilibiliPlayerRequests.length,
      introPreReadyState,
      bootOrderState,
      documentHandoffScrollCalls: documentModeState.handoffProbe.calls.length,
      mediaVideoState,
      whatIsRmVideoState,
    }),
  );
} finally {
  await browser.close();
}
