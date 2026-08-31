import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

const browser = await chromium.launch({ executablePath, headless: true });

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function newTrackedPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("crash", () => log("!!! PAGE CRASHED"));
  page.on("pageerror", (error) => log("pageerror:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") log("console.error:", message.text().slice(0, 200));
  });
  return page;
}

async function waitState(page, expected, timeoutMs = 90_000) {
  await withTimeout(
    page.waitForFunction(
      (want) => window.__ENTERPRIZE_DEMO__?.state === want,
      expected,
      { timeout: timeoutMs },
    ),
    timeoutMs + 5_000,
    `wait state ${expected}`,
  );
}

async function rafCadence(page, ms = 1500) {
  return withTimeout(
    page.evaluate(
      (duration) =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames += 1;
            if (performance.now() - start >= duration) resolve(frames);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      ms,
    ),
    ms + 4_000,
    "rafCadence evaluate (page main thread hung?)",
  );
}

async function snapshot(page) {
  return withTimeout(
    page.evaluate(() => ({
      state: window.__ENTERPRIZE_DEMO__?.state,
      timeline: window.__ENTERPRIZE_DEMO__?.timelineProgress,
      lookAround: window.__ENTERPRIZE_DEMO__?.lookAroundMode,
      scrollY: window.scrollY,
      docMode: document.documentElement.classList.contains("is-document-mode"),
      arenaEnter: document.documentElement.classList.contains("is-arena-enter"),
      renderLoop: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
      deferred: window.__ENTERPRIZE_DEMO__?.deferredAssetsReady,
    })),
    5_000,
    "snapshot evaluate (page main thread hung?)",
  );
}

// ---------- 场景 B: EXPLORE -> 招新直达 -> 2D 上滑回 3D ----------
async function scenarioExploreRecruitReturn() {
  log("=== scenario B: explore -> recruit -> scroll up -> return to 3D ===");
  const page = await newTrackedPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await withTimeout(
    page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, { timeout: 120_000 }),
    125_000,
    "demo ready",
  );
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__.launchIntro());
  await waitState(page, "explore", 120_000);
  log("explore reached", await snapshot(page));

  await page.click("#recruit-jump");
  await withTimeout(
    page.waitForFunction(
      () => document.documentElement.classList.contains("is-document-mode"),
      null,
      { timeout: 15_000 },
    ),
    20_000,
    "document-mode after recruit jump",
  );
  await page.waitForTimeout(1500);
  log("after recruit jump", await snapshot(page));

  // 用户上滑回顶: 程序化 scrollTo(0) 触发 scroll 事件 -> returnToTimeline
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const snap1 = await snapshot(page);
  log("immediately after scroll-to-top", snap1);

  const frames = await rafCadence(page, 1500);
  log("rAF frames in 1500ms after return:", frames);

  await page.waitForTimeout(1500);
  const snap2 = await snapshot(page);
  log("1.5s later", snap2);
  const frames2 = await rafCadence(page, 1500);
  log("rAF frames later:", frames2);
  await page.close();
  return { snap1, snap2, frames, frames2 };
}

// ---------- 场景 A: SCRUB 尾端下滑 -> 3D 到 2D ----------
async function scenarioScrubDownToArchive() {
  log("=== scenario A: scrub to end -> wheel down -> expect 2D archive ===");
  const page = await newTrackedPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await withTimeout(
    page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, { timeout: 120_000 }),
    125_000,
    "demo ready",
  );
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__.launchIntro());
  await waitState(page, "explore", 120_000);
  log("explore reached");

  // 下滑触发 SCAN
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
  });
  await waitState(page, "scan", 30_000);
  log("scan reached, waiting for scrub (deferred assets load)...");
  await waitState(page, "scrub", 240_000);
  log("scrub reached", await snapshot(page));

  // 连续下滑把 timeline 推到底
  const pushWheel = async (count) => {
    for (let i = 0; i < count; i += 1) {
      await withTimeout(
        page.evaluate(() => {
          window.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, cancelable: true }));
        }),
        8_000,
        "pushWheel evaluate (page hung?)",
      );
      await page.waitForTimeout(120);
    }
  };
  for (let round = 0; round < 30; round += 1) {
    await pushWheel(6);
    const snap = await snapshot(page);
    log(`round ${round}`, JSON.stringify(snap));
    if (snap.state === "end") {
      log("OK: entered archive (end) from scrub wheel-down");
      await page.close();
      return { entered: true };
    }
    if (snap.timeline >= 0.999) {
      // 已在底部, 继续下滑应该触发跳转
      await pushWheel(8);
      const after = await snapshot(page);
      log("at bottom + extra wheel-down", JSON.stringify(after));
      await page.close();
      return { entered: after.state === "end", atBottom: snap, after };
    }
  }
  await page.close();
  return { entered: false, reason: "never reached bottom" };
}

// ---------- 场景 C: SCRUB->2D->回顶返场->再下滑进 2D 往返 ----------
async function scenarioRoundTrip() {
  log("=== scenario C: scrub -> archive -> return -> wheel down again ===");
  const page = await newTrackedPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await withTimeout(
    page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, { timeout: 120_000 }),
    125_000,
    "demo ready",
  );
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__.launchIntro());
  await waitState(page, "explore", 120_000);
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
  });
  await waitState(page, "scan", 30_000);
  await waitState(page, "scrub", 240_000);
  log("scrub reached");

  const pushWheel = async (count) => {
    for (let i = 0; i < count; i += 1) {
      await withTimeout(
        page.evaluate(() => {
          window.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, cancelable: true }));
        }),
        8_000,
        "pushWheel evaluate (page hung?)",
      );
      await page.waitForTimeout(120);
    }
  };

  // 第一次进 2D
  for (let round = 0; round < 30; round += 1) {
    await pushWheel(6);
    const snap = await snapshot(page);
    if (snap.state === "end") break;
  }
  let snap = await snapshot(page);
  log("entered archive first pass", JSON.stringify(snap));
  if (snap.state !== "end") {
    await page.close();
    return { ok: false, reason: "first entry failed" };
  }

  // 等进档动画 (2100ms) + 保护窗结束再上滑
  await page.waitForTimeout(2600);
  // 上滑回顶返场 (模拟用户连续上滑: 多次触发)
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const probe = await snapshot(page);
    if (probe.state !== "end") break;
  }
  snap = await snapshot(page);
  log("after scroll-to-top return", JSON.stringify(snap));
  if (snap.state === "end" || snap.docMode) {
    await page.close();
    return { ok: false, reason: "return to 3D failed", snap };
  }
  const frames = await rafCadence(page, 1500);
  log("rAF after return:", frames);

  // 3D 里再下滑: 应能再次进入 2D
  for (let round = 0; round < 12; round += 1) {
    await pushWheel(5);
    snap = await snapshot(page);
    if (snap.state === "end") break;
  }
  log("re-entry attempt result", JSON.stringify(snap));
  const reentered = snap.state === "end" && snap.docMode;
  const framesAfter = await rafCadence(page, 1200).catch(() => -1);
  await page.close();
  return { ok: reentered, snap, framesAfterReturn: frames, framesAfterReentry: framesAfter };
}

const only = process.argv[3]?.toUpperCase() ?? null;
const wants = (name) => !only || only === name;
if (wants("B")) {
  try {
    const b = await scenarioExploreRecruitReturn();
    log("scenario B result:", JSON.stringify(b));
  } catch (error) {
    log("scenario B FAILED:", error.message);
  }
}
if (wants("C")) {
  try {
    const c = await scenarioRoundTrip();
    log("scenario C result:", JSON.stringify(c));
  } catch (error) {
    log("scenario C FAILED:", error.message);
  }
}
if (wants("A")) {
  try {
    const a = await scenarioScrubDownToArchive();
    log("scenario A result:", JSON.stringify(a));
  } catch (error) {
    log("scenario A FAILED:", error.message);
  }
}
await browser.close();
