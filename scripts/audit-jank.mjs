import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5176/";
const outputPath = path.resolve(
  process.argv[3] ?? "ANALYSIS/performance-audit-current.json",
);
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found");
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(Math.floor((sorted.length - 1) * ratio), sorted.length - 1)];
}

function summarizeIntervals(timestamps) {
  const intervals = timestamps
    .slice(1)
    .map((value, index) => value - timestamps[index])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  return {
    samples: intervals.length,
    meanMs: intervals.length ? Number((total / intervals.length).toFixed(2)) : 0,
    p50Ms: Number(percentile(intervals, 0.5).toFixed(2)),
    p95Ms: Number(percentile(intervals, 0.95).toFixed(2)),
    p99Ms: Number(percentile(intervals, 0.99).toFixed(2)),
    maxMs: Number((intervals.at(-1) ?? 0).toFixed(2)),
    over20ms: intervals.filter((value) => value > 20).length,
    over50ms: intervals.filter((value) => value > 50).length,
  };
}

function relevantResource(entry) {
  return (
    entry.name.includes("/assets/models/") ||
    entry.name.includes("/assets/pointcloud/") ||
    entry.name.includes("/assets/images/zoom/") ||
    entry.name.includes("player.bilibili.com")
  );
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const requestLog = [];
const failedRequests = [];
const responses = [];
const pageErrors = [];
const runStartedAt = Date.now();

page.on("pageerror", (error) => {
  pageErrors.push({
    atMs: Date.now() - runStartedAt,
    message: error.message,
    stack: error.stack ?? null,
  });
});

page.on("request", (request) => {
  const url = request.url();
  if (
    url.includes("/assets/models/") ||
    url.includes("/assets/pointcloud/") ||
    url.includes("/assets/images/zoom/") ||
    url.includes("player.bilibili.com")
  ) {
    requestLog.push({
      atMs: Date.now() - runStartedAt,
      resourceType: request.resourceType(),
      url,
    });
  }
});
page.on("requestfailed", (request) => {
  failedRequests.push({
    atMs: Date.now() - runStartedAt,
    error: request.failure()?.errorText ?? "unknown",
    url: request.url(),
  });
});
page.on("response", (response) => {
  const url = response.url();
  if (
    url.includes("/assets/models/") ||
    url.includes("/assets/pointcloud/") ||
    url.includes("/assets/images/zoom/") ||
    url.includes("player.bilibili.com")
  ) {
    responses.push({ status: response.status(), url });
  }
});

await page.addInitScript(() => {
  window.__ENTERPRIZE_JANK_AUDIT__ = {
    longTasks: [],
    layoutShifts: [],
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__ENTERPRIZE_JANK_AUDIT__.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__ENTERPRIZE_JANK_AUDIT__.layoutShifts.push({
            startTime: entry.startTime,
            value: entry.value,
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
});

async function auditSnapshot() {
  return page.evaluate(() => {
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }))
      .filter(
        (entry) =>
          entry.name.includes("/assets/models/") ||
          entry.name.includes("/assets/pointcloud/") ||
          entry.name.includes("/assets/images/zoom/") ||
          entry.name.includes("player.bilibili.com"),
      );
    return {
      at: performance.now(),
      state: window.__ENTERPRIZE_DEMO__?.state ?? null,
      deferredAssetsReady:
        window.__ENTERPRIZE_DEMO__?.deferredAssetsReady ?? false,
      loadedAssetKeys: window.__ENTERPRIZE_DEMO__?.loadedAssetKeys ?? [],
      longTasks: [...window.__ENTERPRIZE_JANK_AUDIT__.longTasks],
      layoutShifts: [...window.__ENTERPRIZE_JANK_AUDIT__.layoutShifts],
      resources,
    };
  });
}

async function sampleFrames(durationMs) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const timestamps = [];
        const startedAt = performance.now();
        const tick = (now) => {
          timestamps.push(now);
          if (now - startedAt >= duration) {
            resolve(timestamps);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
  timeout: 120_000,
});

const readySnapshot = await auditSnapshot();
const typingProbe = await page.evaluate(
  (duration) =>
    new Promise((resolve) => {
      const root = document.querySelector("#intro-root");
      const changes = [];
      let lastLength = root?.textContent?.length ?? 0;
      const observer = new MutationObserver(() => {
        const length = root?.textContent?.length ?? 0;
        if (length !== lastLength) {
          lastLength = length;
          changes.push({ at: performance.now(), length });
        }
      });
      if (root) observer.observe(root, { childList: true, characterData: true, subtree: true });
      const frames = [];
      const startedAt = performance.now();
      const tick = (now) => {
        frames.push(now);
        if (now - startedAt < duration) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => {
        observer.disconnect();
        resolve({
          startedAt,
          endedAt: performance.now(),
          changes,
          frames,
          finalText: root?.textContent ?? "",
        });
      }, duration);
    }),
  4_800,
);
const afterTypingSnapshot = await auditSnapshot();

await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
  timeout: 60_000,
});
const exploreFrames = await sampleFrames(2_000);
const exploreSnapshot = await auditSnapshot();

await page.mouse.move(720, 450);
await page.mouse.wheel(0, 600);
let scrubReached = true;
let scrubProbeError = null;
try {
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
    timeout: 20_000,
  });
} catch (error) {
  scrubReached = false;
  scrubProbeError = error instanceof Error ? error.message : String(error);
}
const scrubSnapshot = await auditSnapshot();

const zoomBeforeActivation = await auditSnapshot();
await page.evaluate(() => {
  document.documentElement.classList.remove("is-scroll-locked");
  document.documentElement.classList.add("is-document-mode");
  document.querySelector("#unit-site")?.classList.add("is-archive-active");
  document.querySelector("#app")?.setAttribute("data-state", "end");
  window.dispatchEvent(new Event("enterprize:zoom-activate"));
});
await page.waitForTimeout(5_000);
const zoomAfterActivation = await auditSnapshot();

const zoomFrames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const gallery = document.querySelector("#zoom-parallax-gallery");
      const startY = gallery.getBoundingClientRect().top + window.scrollY;
      const endY = Math.max(
        startY + gallery.getBoundingClientRect().height - window.innerHeight,
        startY,
      );
      window.scrollTo(0, startY);
      const frames = [];
      const positions = [];
      const startedAt = performance.now();
      const travelMs = 3_600;
      const settleMs = 1_400;
      const tick = (now) => {
        const elapsed = now - startedAt;
        const progress = Math.min(elapsed / travelMs, 1);
        const eased = progress * progress * (3 - 2 * progress);
        if (progress < 1) window.scrollTo(0, startY + (endY - startY) * eased);
        frames.push(now);
        positions.push(window.scrollY);
        if (elapsed < travelMs + settleMs) {
          requestAnimationFrame(tick);
        } else {
          resolve({ frames, positions, startY, endY, startedAt, endedAt: now });
        }
      };
      requestAnimationFrame(tick);
    }),
);
const zoomScrollSnapshot = await auditSnapshot();

const snapTarget = await page.evaluate(() => {
  const target = document.querySelector("#archive-team");
  const top = target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, Math.max(top - 260, 0));
  return { top, initialY: window.scrollY };
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const samples = [];
  const startedAt = performance.now();
  window.__ENTERPRIZE_SNAP_AUDIT__ = { samples, startedAt, endedAt: null };
  const tick = (now) => {
    samples.push({ at: now, y: window.scrollY });
    if (now - startedAt < 6_000) {
      requestAnimationFrame(tick);
    } else {
      window.__ENTERPRIZE_SNAP_AUDIT__.endedAt = now;
    }
  };
  requestAnimationFrame(tick);
});
await page.mouse.move(720, 450);
await page.mouse.wheel(0, 120);
await page.waitForTimeout(6_200);
const snapProbe = await page.evaluate(() => window.__ENTERPRIZE_SNAP_AUDIT__);
const finalSnapshot = await auditSnapshot();

const typingChangeTimes = typingProbe.changes.map((change) => change.at);
const snapFrameTimes = snapProbe.samples.map((sample) => sample.at);
const snapMovingSamples = snapProbe.samples.filter(
  (sample, index, samples) => index > 0 && Math.abs(sample.y - samples[index - 1].y) > 0.1,
);
const lastMovementAt = snapMovingSamples.at(-1)?.at ?? snapProbe.startedAt;
const lastMovementIndex = snapProbe.samples.findIndex((sample) => sample.at >= lastMovementAt);
const snapTail = snapProbe.samples.slice(Math.max(lastMovementIndex - 20, 0), lastMovementIndex + 2);

const report = {
  generatedAt: new Date().toISOString(),
  targetUrl,
  environment: {
    browser: "Microsoft Edge via Playwright",
    rendering: "headless SwiftShader; frame timings are diagnostic, not production FPS",
    viewport: "1440x900@1x",
  },
  milestones: {
    readyAtMs: Number(readySnapshot.at.toFixed(2)),
    afterTypingAtMs: Number(afterTypingSnapshot.at.toFixed(2)),
    exploreAtMs: Number(exploreSnapshot.at.toFixed(2)),
    scrubAtMs: scrubReached ? Number(scrubSnapshot.at.toFixed(2)) : null,
  },
  flow: {
    scrubReached,
    stateAtScrubProbe: scrubSnapshot.state,
    deferredAssetsReadyAtScrubProbe: scrubSnapshot.deferredAssetsReady,
    scrubProbeError,
  },
  typing: {
    textMutations: typingProbe.changes.length,
    characterCadence: summarizeIntervals(typingChangeTimes),
    frameCadence: summarizeIntervals(typingProbe.frames),
    longTasksDuringProbe: afterTypingSnapshot.longTasks.filter(
      (task) => task.startTime >= typingProbe.startedAt && task.startTime <= typingProbe.endedAt,
    ),
    deferredAssetsReadyAtEnd: afterTypingSnapshot.deferredAssetsReady,
    loadedAssetKeysAtEnd: afterTypingSnapshot.loadedAssetKeys,
  },
  explore: {
    frameCadence: summarizeIntervals(exploreFrames),
    loadedAssetKeys: exploreSnapshot.loadedAssetKeys,
  },
  mediaTiming: {
    bilibiliRequestsAtReady: readySnapshot.resources.filter((entry) => entry.name.includes("player.bilibili.com")).length,
    bilibiliRequestsAtExplore: exploreSnapshot.resources.filter((entry) => entry.name.includes("player.bilibili.com")).length,
    bilibiliRequestsAtScrub: scrubReached
      ? scrubSnapshot.resources.filter((entry) => entry.name.includes("player.bilibili.com")).length
      : null,
    bilibiliRequestsAtPostExploreProbe: scrubSnapshot.resources.filter((entry) => entry.name.includes("player.bilibili.com")).length,
  },
  zoomGallery: {
    resourcesBeforeActivation: zoomBeforeActivation.resources.filter((entry) => entry.name.includes("/assets/images/zoom/")).length,
    resourcesAfterActivation: zoomAfterActivation.resources.filter((entry) => entry.name.includes("/assets/images/zoom/")).length,
    frameCadence: summarizeIntervals(zoomFrames.frames),
    longTasksDuringActivationAndScroll: zoomScrollSnapshot.longTasks.filter(
      (task) => task.startTime >= zoomBeforeActivation.at && task.startTime <= zoomScrollSnapshot.at,
    ),
  },
  chapterSnap: {
    targetTop: snapTarget.top,
    initialY: snapTarget.initialY,
    finalY: snapProbe.samples.at(-1)?.y ?? null,
    settleDurationMs: Number((lastMovementAt - snapProbe.startedAt).toFixed(2)),
    movingFrames: snapMovingSamples.length,
    frameCadence: summarizeIntervals(snapFrameTimes),
    tailSamples: snapTail,
  },
  longTasks: finalSnapshot.longTasks,
  layoutShifts: finalSnapshot.layoutShifts,
  resourceTiming: finalSnapshot.resources.filter(relevantResource),
  requestLog,
  responses,
  failedRequests,
  pageErrors,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await browser.close();

console.log(JSON.stringify({ outputPath, summary: {
  typing: report.typing,
  mediaTiming: report.mediaTiming,
  zoomGallery: report.zoomGallery,
  chapterSnap: report.chapterSnap,
  failedRequests: report.failedRequests,
}}, null, 2));
