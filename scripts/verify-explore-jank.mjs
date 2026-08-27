import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const targetUrl = new URL(
  process.argv[2] ?? "http://127.0.0.1:5175/",
);
targetUrl.searchParams.set("intro", "1");

const runCount = Math.max(Number.parseInt(process.argv[3] ?? "3", 10) || 1, 1);
const rendererMode = process.argv[4] === "hardware" ? "hardware" : "swiftshader";
const verbose = process.argv.includes("--verbose");
const mobileViewport = process.argv.includes("--mobile");
const edgePath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!edgePath) throw new Error("Microsoft Edge was not found");

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    Math.floor((sortedValues.length - 1) * ratio),
    sortedValues.length - 1,
  );
  return sortedValues[index];
}

function summarizeFrames(frames, from, to) {
  const gaps = [];
  for (let index = 1; index < frames.length; index += 1) {
    const start = frames[index - 1];
    const end = frames[index];
    if (end < from || start > to) continue;
    gaps.push({ start, end, duration: end - start });
  }

  const sorted = gaps.map((entry) => entry.duration).sort((a, b) => a - b);
  return {
    samples: gaps.length,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 0.99).toFixed(2)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
    over20Ms: sorted.filter((duration) => duration > 20).length,
    over33Ms: sorted.filter((duration) => duration > 33).length,
    topGaps: gaps
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8)
      .map((entry) => ({
        startTime: Number(entry.start.toFixed(2)),
        duration: Number(entry.duration.toFixed(2)),
      })),
  };
}

function describeGap(gap, measures, marks, longTasks) {
  const end = gap.startTime + gap.duration;
  const overlaps = (entry) => {
    const entryEnd = entry.startTime + (entry.duration || 0);
    return entry.startTime <= end && entryEnd >= gap.startTime;
  };
  return {
    ...gap,
    measures: measures.filter(overlaps).map((entry) => entry.name),
    nearbyMarks: marks
      .filter((entry) => Math.abs(entry.startTime - gap.startTime) <= 80)
      .map((entry) => entry.name),
    longTasks: longTasks.filter(overlaps),
  };
}

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    ...(rendererMode === "swiftshader" ? ["--use-angle=swiftshader"] : []),
  ],
});

const reports = [];
try {
  for (let run = 1; run <= runCount; run += 1) {
    const context = await browser.newContext({
      viewport: mobileViewport
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: mobileViewport ? 2 : 1,
      isMobile: mobileViewport,
      hasTouch: mobileViewport,
    });
    const page = await context.newPage();
    const cdp = mobileViewport ? await context.newCDPSession(page) : null;
    const pageErrors = [];
    const failedRequests = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown",
      });
    });
    await page.addInitScript(() => {
      window.__ENTERPRIZE_EXPLORE_JANK__ = { longTasks: [] };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__ENTERPRIZE_EXPLORE_JANK__.longTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {}
    });

    await page.goto(targetUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.ready === true,
      null,
      { timeout: 120_000 },
    );
    await page.evaluate(() => {
      const probe = { active: true, frames: [] };
      window.__ENTERPRIZE_EXPLORE_FRAME_PROBE__ = probe;
      const tick = (now) => {
        if (!probe.active) return;
        probe.frames.push(now);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.waitForSelector("#intro-root button:not([disabled])", {
      timeout: 60_000,
    });
    await page.click("#intro-root button:not([disabled])");
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "explore",
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => performance.getEntriesByName("enterprize:p1-start").length > 0,
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.deferredAssetsReady === true,
      null,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(1_500);
    const idleState = await page.evaluate(() => ({
      deferredAssetsReady: window.__ENTERPRIZE_DEMO__?.deferredAssetsReady,
      p1Started:
        performance.getEntriesByName("enterprize:p1-start").length > 0,
      scanInputAt: performance.now(),
    }));
    if (!idleState.deferredAssetsReady || !idleState.p1Started) {
      throw new Error(`Run ${run} did not finish P1 during EXPLORE`);
    }
    if (mobileViewport) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 195, y: 650, id: 1 }],
      });
      for (let step = 1; step <= 12; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: 195,
              y: 650 + ((260 - 650) * step) / 12,
              id: 1,
            },
          ],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(720, 450);
      await page.mouse.wheel(0, 700);
    }
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "scan",
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(2_000);

    const raw = await page.evaluate(() => {
      const probe = window.__ENTERPRIZE_EXPLORE_FRAME_PROBE__;
      probe.active = false;
      const serialize = (entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      });
      return {
        frames: probe.frames,
        marks: performance
          .getEntriesByType("mark")
          .filter((entry) => entry.name.startsWith("enterprize:"))
          .map(serialize),
        measures: performance
          .getEntriesByType("measure")
          .filter((entry) => entry.name.startsWith("enterprize:p1-"))
          .map(serialize),
        longTasks: window.__ENTERPRIZE_EXPLORE_JANK__.longTasks,
        warmReport: window.__ENTERPRIZE_DEMO__.deferredWarmReport,
        loadedAssetKeys: window.__ENTERPRIZE_DEMO__.loadedAssetKeys,
        renderer: (() => {
          const gl = document.querySelector("#scene-canvas")?.getContext("webgl2");
          const extension = gl?.getExtension("WEBGL_debug_renderer_info");
          return extension
            ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
            : gl?.getParameter(gl.RENDERER) ?? null;
        })(),
      };
    });
    const markTime = (name) =>
      raw.marks.find((entry) => entry.name === name)?.startTime ?? null;
    const exploreStart = markTime("enterprize:explore-first-paint");
    const p1Start = markTime("enterprize:p1-start");
    const p1Ready = markTime("enterprize:p1-ready");
    if (exploreStart === null || p1Start === null || p1Ready === null) {
      throw new Error(`Run ${run} did not emit the required EXPLORE/P1 marks`);
    }

    const decorateCadence = (cadence) => ({
      ...cadence,
      topGaps: cadence.topGaps.map((gap) =>
        describeGap(gap, raw.measures, raw.marks, raw.longTasks),
      ),
    });
    const idleCadence = summarizeFrames(
      raw.frames,
      exploreStart,
      idleState.scanInputAt,
    );
    const preparationCadence = summarizeFrames(raw.frames, p1Start, p1Ready);
    const afterReadyCadence = summarizeFrames(
      raw.frames,
      p1Ready,
      p1Ready + 1_500,
    );
    const report = {
      run,
      timings: {
        idleExploreBeforeInputMs: Number(
          (idleState.scanInputAt - exploreStart).toFixed(2),
        ),
        exploreToP1StartMs: Number((p1Start - exploreStart).toFixed(2)),
        p1ReadyBeforeInputMs: Number((idleState.scanInputAt - p1Ready).toFixed(2)),
        p1DurationMs: Number((p1Ready - p1Start).toFixed(2)),
      },
      cadence: {
        idleExplore: decorateCadence(idleCadence),
        backgroundPreparation: decorateCadence(preparationCadence),
        afterReady: decorateCadence(afterReadyCadence),
      },
      measures: raw.measures.map((entry) => ({
        name: entry.name,
        startTime: Number(entry.startTime.toFixed(2)),
        duration: Number(entry.duration.toFixed(2)),
      })),
      warmReport: raw.warmReport,
      loadedAssetKeys: raw.loadedAssetKeys,
      renderer: raw.renderer,
      pageErrors,
      failedRequests,
    };
    reports.push(report);
    const compactCadence = (cadence) => {
      const { topGaps, ...summary } = cadence;
      const topGap = topGaps[0];
      return {
        ...summary,
        topGap: topGap
          ? {
              duration: topGap.duration,
              measures: topGap.measures.slice(0, 4),
              longTasks: topGap.longTasks,
            }
          : null,
      };
    };
    console.log(
      JSON.stringify(
        verbose
          ? report
          : {
              run,
              timings: report.timings,
              cadence: {
                idleExplore: compactCadence(report.cadence.idleExplore),
                backgroundPreparation: compactCadence(
                  report.cadence.backgroundPreparation,
                ),
                afterReady: compactCadence(report.cadence.afterReady),
              },
              renderer: report.renderer,
              pageErrors,
              failedRequests,
            },
        null,
        2,
      ),
    );
    await context.close();
  }
} finally {
  await browser.close();
}

const idleMaxima = reports.map((report) => report.cadence.idleExplore.maxMs);
const preparationMaxima = reports.map(
  (report) => report.cadence.backgroundPreparation.maxMs,
);
console.log(
  JSON.stringify(
    {
      summary: {
        runs: reports.length,
        maxIdleExploreFrameGapMs: Math.max(...idleMaxima),
        meanIdleExploreMaxFrameGapMs: Number(
          (
            idleMaxima.reduce((sum, value) => sum + value, 0) /
            idleMaxima.length
          ).toFixed(2),
        ),
        maxBackgroundPreparationFrameGapMs: Math.max(...preparationMaxima),
        rendererMode,
        viewport: mobileViewport ? "mobile" : "desktop",
        note:
          rendererMode === "swiftshader"
            ? "Headless SwiftShader timings are diagnostic and are not device FPS."
            : "Headless hardware WebGL is closer to the device path but still not user-visible FPS.",
      },
    },
    null,
    2,
  ),
);
