import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright-core";
import sharp from "sharp";

const cliArguments = process.argv.slice(2);
const positionalArguments = cliArguments.filter(
  (argument) => !argument.startsWith("--"),
);
const targetUrl = new URL(
  positionalArguments[0] ??
    process.env.ENTERPRIZE_URL ??
    "http://127.0.0.1:5173/",
);
targetUrl.searchParams.set("intro", "1");
const rendererMode =
  cliArguments.includes("--hardware") ? "hardware" : "swiftshader";
const outputDirectory = path.resolve(
  positionalArguments[1] ?? path.join(os.tmpdir(), "enterprize-explore-polish"),
);
await mkdir(outputDirectory, { recursive: true });

const executablePath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!executablePath) throw new Error("Microsoft Edge was not found");

function check(condition, message, detail) {
  if (!condition) {
    throw new Error(
      `[fail] ${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
  console.log(`[ok] ${message}`);
}

async function openPage(context) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 120_000,
  });
  return { page, pageErrors };
}

async function launchToExplore(page) {
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.state === "assemble",
    null,
    { timeout: 30_000 },
  );
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const mark = document.querySelector(".explore-brand-mark");
        let lastAssembleY = null;
        const startedAt = performance.now();
        const readY = () => {
          const transform = getComputedStyle(mark, "::before").transform;
          return transform === "none" ? 0 : new DOMMatrix(transform).m42;
        };
        const sample = () => {
          const state = window.__ENTERPRIZE_DEMO__?.state;
          if (state === "assemble") lastAssembleY = readY();
          if (state === "explore") {
            resolve({
              lastAssembleY,
              firstExploreY: readY(),
              state,
            });
            return;
          }
          if (performance.now() - startedAt > 12_000) {
            reject(new Error(`EXPLORE transition timed out from ${state}`));
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

function maxFrameGap(timestamps, from = 0) {
  let maximum = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] < from) continue;
    maximum = Math.max(maximum, timestamps[index] - timestamps[index - 1]);
  }
  return maximum;
}

async function verifyCanvasPixels(page, filename) {
  const outputPath = path.join(outputDirectory, filename);
  await page.locator("#scene-canvas").screenshot({ path: outputPath });
  const stats = await sharp(outputPath).stats();
  const colorChannels = stats.channels.slice(0, 3);
  return {
    outputPath,
    means: colorChannels.map((channel) => Number(channel.mean.toFixed(2))),
    deviations: colorChannels.map((channel) =>
      Number(channel.stdev.toFixed(2)),
    ),
    nonblank:
      colorChannels.some((channel) => channel.mean > 5) &&
      colorChannels.some((channel) => channel.stdev > 3),
  };
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    ...(rendererMode === "swiftshader" ? ["--use-angle=swiftshader"] : []),
  ],
});

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const { page, pageErrors } = await openPage(desktopContext);

  const launchState = await page.evaluate(() => ({
    fetched: window.__ENTERPRIZE_BOOTSTRAP__?.explorePointFetchDone ?? 0,
    clouds: window.__ENTERPRIZE_DEMO__?.exploreCloudKeysReady ?? [],
  }));
  check(
    launchState.fetched === 3 &&
      ["arena", "dart", "infantry", "engineer"].every((key) =>
        launchState.clouds.includes(key),
      ),
    "all EXPLORE point artifacts are fetched during Intro and built before launch",
    launchState,
  );

  const logoTransition = await launchToExplore(page);
  check(
    Number.isFinite(logoTransition.lastAssembleY) &&
      Math.abs(
        logoTransition.firstExploreY - logoTransition.lastAssembleY,
      ) <= 2,
    "EXPLORE logo animation starts without a vertical first-frame jump",
    logoTransition,
  );

  const desktopCopy = await page.evaluate(() => {
    const color = (selector) =>
      getComputedStyle(document.querySelector(selector)).color;
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    return {
      hint: document.querySelector("#hint-text")?.textContent ?? "",
      lead: document.querySelector(".key-hints__lead")?.textContent ?? "",
      actions: [...document.querySelectorAll(".key-hint__action")].map(
        (element) => element.textContent ?? "",
      ),
      hintEnglish: color(".hint-bar__item .hud-bilingual__en"),
      hintChinese: color(".hint-bar__item .hud-bilingual__cn"),
      leadEnglish: color(".key-hints__lead .hud-bilingual__en"),
      leadChinese: color(".key-hints__lead .hud-bilingual__cn"),
      hintBounds: bounds(".hint-bar"),
      keyBounds: bounds(".key-hints"),
    };
  });
  check(
    ["CLICK", "点按波纹", "DRAG", "拖拽环视", "SCROLL", "滑动进入"].every(
      (copy) => desktopCopy.hint.includes(copy),
    ),
    "desktop EXPLORE hint pairs every English action with Chinese copy",
    desktopCopy,
  );
  check(
    desktopCopy.lead.includes("SCROLL TO ENTER") &&
      desktopCopy.lead.includes("下滑进入战场") &&
      desktopCopy.actions.every((copy) => /[A-Z]+/.test(copy) && /[\u4e00-\u9fff]/.test(copy)),
    "battlefield lead and all shortcut annotations are bilingual",
    desktopCopy,
  );
  check(
    desktopCopy.hintEnglish === desktopCopy.leadEnglish &&
      desktopCopy.hintChinese === desktopCopy.leadChinese &&
      desktopCopy.hintEnglish !== desktopCopy.hintChinese,
    "HUD consistently renders English gray and Chinese white",
    desktopCopy,
  );
  check(
    desktopCopy.keyBounds.right <= desktopCopy.hintBounds.left ||
      desktopCopy.hintBounds.right <= desktopCopy.keyBounds.left,
    "bilingual shortcut controls do not overlap the shared hint bar",
    desktopCopy,
  );

  const p1Probe = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        const startedAt = performance.now();
        let readyAt = null;
        const tick = (now) => {
          frames.push(now);
          if (window.__ENTERPRIZE_DEMO__?.deferredAssetsReady && readyAt === null) {
            readyAt = now;
          }
          if ((readyAt !== null && now - readyAt >= 1_500) || now - startedAt > 120_000) {
            resolve({
              frames,
              readyAt,
              p1StartAt:
                performance.getEntriesByName("enterprize:p1-start")[0]?.startTime ??
                null,
              layer: window.__ENTERPRIZE_DEMO__?.deferredSceneLayerState,
              warmReport: window.__ENTERPRIZE_DEMO__?.deferredWarmReport ?? [],
              measures: performance
                .getEntriesByType("measure")
                .filter((entry) => entry.name.startsWith("enterprize:p1-"))
                .map((entry) => ({ name: entry.name, duration: entry.duration })),
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const duringP1MaxGap = maxFrameGap(
    p1Probe.frames,
    p1Probe.p1StartAt ?? Number.POSITIVE_INFINITY,
  );
  const afterReadyMaxGap = maxFrameGap(
    p1Probe.frames,
    p1Probe.readyAt ?? Number.POSITIVE_INFINITY,
  );
  check(
    p1Probe.p1StartAt !== null && p1Probe.readyAt !== null,
    "P1 background preparation starts and completes during EXPLORE",
    p1Probe,
  );
  check(
    p1Probe.layer?.cameraEnabled === false &&
      [p1Probe.layer?.arenaMasks, p1Probe.layer?.timelineMasks, p1Probe.layer?.squadMasks]
        .every((masks) => masks?.length === 1 && masks[0] === 2),
    "P1 roots stay isolated from the EXPLORE camera after warmup",
    p1Probe.layer,
  );
  check(
    p1Probe.measures.filter((entry) => entry.name.startsWith("enterprize:p1-warm-"))
      .length === p1Probe.warmReport.length &&
      p1Probe.warmReport.length > 4,
    "P1 GPU upload is split into per-material warmup batches",
    p1Probe.measures,
  );
  check(
    ["arena", "timeline", "squad-blue", "squad-red"].every((group) =>
      p1Probe.warmReport.some((entry) => entry.group === group),
    ) &&
      p1Probe.warmReport.every(
        (entry) =>
          entry.cameraMask === 2 &&
          entry.renderableCount > 0 &&
          entry.frustumCullingDisabled === true,
      ),
    "P1 warmup renders only the deferred layer with culling disabled",
    p1Probe.warmReport,
  );
  check(
    duringP1MaxGap <= 1_000,
    "background P1 preparation avoids a multi-second EXPLORE freeze",
    {
      duringP1MaxGap,
      measures: p1Probe.measures
        .map((entry) => ({
          name: entry.name,
          duration: Number(entry.duration.toFixed(2)),
        }))
        .sort((a, b) => b.duration - a.duration),
    },
  );
  check(
    afterReadyMaxGap <= 500,
    "P1 readiness is not followed by a second EXPLORE stall",
    { afterReadyMaxGap },
  );
  console.log(
    `[info] desktop max frame gap during P1: ${duringP1MaxGap.toFixed(2)}ms`,
  );
  console.log(
    `[info] desktop max frame gap after P1 ready: ${afterReadyMaxGap.toFixed(2)}ms`,
  );
  const desktopCanvas = await verifyCanvasPixels(
    page,
    "explore-desktop-canvas.png",
  );
  await page.screenshot({
    path: path.join(outputDirectory, "explore-desktop.png"),
    fullPage: false,
  });
  check(
    desktopCanvas.nonblank,
    "desktop EXPLORE canvas contains nonblank rendered pixels",
    desktopCanvas,
  );

  await page.evaluate(() => {
    const probe = { frames: [], active: true };
    window.__ENTERPRIZE_SCAN_FRAME_PROBE__ = probe;
    const tick = (now) => {
      if (!probe.active) return;
      probe.frames.push(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(
    () => ["scan", "scrub"].includes(window.__ENTERPRIZE_DEMO__?.state),
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1_500);
  const scanProbe = await page.evaluate(() => {
    const probe = window.__ENTERPRIZE_SCAN_FRAME_PROBE__;
    probe.active = false;
    return probe.frames;
  });
  const scanMaxGap = maxFrameGap(scanProbe);
  const scanGaps = scanProbe
    .slice(1)
    .map((timestamp, index) => timestamp - scanProbe[index])
    .sort((a, b) => a - b);
  const scanGapSummary = {
    samples: scanGaps.length,
    p50: Number((scanGaps[Math.floor(scanGaps.length * 0.5)] ?? 0).toFixed(2)),
    p95: Number((scanGaps[Math.floor(scanGaps.length * 0.95)] ?? 0).toFixed(2)),
    maximum: Number(scanMaxGap.toFixed(2)),
    top: scanGaps.slice(-6).reverse().map((gap) => Number(gap.toFixed(2))),
  };
  const scanLayer = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.deferredSceneLayerState,
  );
  check(
    scanLayer?.cameraEnabled === true,
    "SCAN enables the already-warmed P1 layer on the live camera",
    scanLayer,
  );
  check(
    scanMaxGap <= (rendererMode === "hardware" ? 500 : 1_250),
    `first SCAN frames stay within the ${rendererMode} diagnostic budget`,
    scanGapSummary,
  );
  check(pageErrors.length === 0, "desktop EXPLORE flow has no page errors", pageErrors);
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobileResult = await openPage(mobileContext);
  await launchToExplore(mobileResult.page);
  const mobileCopy = await mobileResult.page.evaluate(() => {
    const lead = document.querySelector(".key-hints__lead");
    const hint = document.querySelector(".hint-bar");
    const leadRect = lead.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    return {
      hint: document.querySelector("#hint-text")?.textContent ?? "",
      lead: lead.textContent ?? "",
      leadDirection: getComputedStyle(lead).flexDirection,
      leadInside:
        leadRect.left >= 0 &&
        leadRect.right <= window.innerWidth &&
        leadRect.top >= 0 &&
        leadRect.bottom <= window.innerHeight,
      hintInside:
        hintRect.left >= 0 &&
        hintRect.right <= window.innerWidth &&
        hintRect.top >= 0 &&
        hintRect.bottom <= window.innerHeight,
      leadToHintGap: hintRect.top - leadRect.bottom,
      visibleKeys: [...document.querySelectorAll(".key-hint")].filter(
        (element) => getComputedStyle(element).display !== "none",
      ).length,
    };
  });
  check(
    ["TAP", "点按波纹", "DRAG", "拖拽环视", "SWIPE UP", "滑动进入"].every(
      (copy) => mobileCopy.hint.includes(copy),
    ),
    "mobile EXPLORE hint uses the same bilingual hierarchy with touch verbs",
    mobileCopy,
  );
  check(
      mobileCopy.leadDirection === "column" &&
      mobileCopy.leadInside &&
      mobileCopy.hintInside &&
      mobileCopy.leadToHintGap >= 8 &&
      mobileCopy.visibleKeys === 0,
    "mobile lead wraps above the hint without overlap or viewport clipping",
    mobileCopy,
  );
  const mobileCanvas = await verifyCanvasPixels(
    mobileResult.page,
    "explore-mobile-canvas.png",
  );
  await mobileResult.page.screenshot({
    path: path.join(outputDirectory, "explore-mobile.png"),
    fullPage: false,
  });
  check(
    mobileCanvas.nonblank,
    "mobile EXPLORE canvas contains nonblank rendered pixels",
    mobileCanvas,
  );
  check(
    mobileResult.pageErrors.length === 0,
    "mobile EXPLORE flow has no page errors",
    mobileResult.pageErrors,
  );
  await mobileContext.close();
  console.log(`[info] screenshots: ${outputDirectory}`);
} finally {
  await browser.close();
}
