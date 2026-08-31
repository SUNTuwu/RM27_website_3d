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
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.ready === true,
    null,
    { timeout: 90_000 },
  );
  const launchButtonSelector = "#intro-root [data-intro-cta]";
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("aria-busy") === "false",
    launchButtonSelector,
    { timeout: 10_000 },
  );
  await page.click(launchButtonSelector);
  await waitState(page, "explore", 45_000);
  await page.mouse.wheel(0, 600);
  await waitState(page, "scan", 12_000);
  await waitState(page, "scrub", 120_000);
  console.log("[ok] reached SCRUB");

  // 关键断言: 不碰滚轮, 自动播放必须自己播到 100% 并自动进入 2D 档案
  const scrubStartProgress = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.timelineProgress,
  );
  const progressLog = [];
  let autoEntered = false;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => ({
      state: window.__ENTERPRIZE_DEMO__?.state,
      progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
      velocity: window.__ENTERPRIZE_DEMO__?.debugTimelineVelocity,
    }));
    progressLog.push(snapshot);
    if (snapshot.state === "end") {
      autoEntered = true;
      break;
    }
    await page.waitForTimeout(2_000);
  }
  failIf(
    !autoEntered,
    "SCRUB autoplay reaches 100% and auto-enters the 2D archive without wheel input",
    { scrubStartProgress, tail: progressLog.slice(-5) },
  );
  console.log(
    `[info] autoplay ${scrubStartProgress.toFixed(3)} -> end in ${progressLog.length * 2}s`,
  );

  const documentModeState = await page.evaluate(() => ({
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    autoScrollActive: window.__ENTERPRIZE_DEMO__?.archiveAutoScrollActive,
    renderLoopActive: window.__ENTERPRIZE_DEMO__?.renderLoopActive,
  }));
  failIf(
    !documentModeState.documentMode,
    "auto entry switches into document mode",
    documentModeState,
  );
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.archiveAutoScrollActive === false,
    null,
    { timeout: 10_000 },
  );

  // ---------- 第二次循环: 滚回 2D 顶部返场, 上翻回卷后自动重播必须再次自动进档 ----------
  await page.waitForTimeout(1_200); // 等进档保护窗 (900ms) 结束
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (state === "scrub") break;
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(200);
  }
  await waitState(page, "scrub", 10_000);
  const returnedProgress = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.timelineProgress,
  );
  failIf(
    returnedProgress < 0.995,
    "scroll-to-top return lands back on the SCRUB timeline end",
    { returnedProgress },
  );
  await page.waitForTimeout(2_500);
  const noBounceState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
  }));
  failIf(
    noBounceState.state !== "scrub",
    "returning to the timeline end does not bounce back into the archive",
    noBounceState,
  );

  // 主动上翻回卷到 90% 以下, 然后完全不再输入, 等自动播放第二次播完
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const progress = await page.evaluate(
      () => window.__ENTERPRIZE_DEMO__?.timelineProgress,
    );
    if (progress < 0.9) break;
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(220);
  }
  const rewoundProgress = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.timelineProgress,
  );
  failIf(
    rewoundProgress >= 0.9,
    "wheel-up rewinds the timeline below 90%",
    { rewoundProgress },
  );
  let reEntered = false;
  const replayDeadline = Date.now() + 30_000;
  while (Date.now() < replayDeadline) {
    const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (state === "end") {
      reEntered = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  failIf(
    !reEntered,
    "second autoplay run reaches 100% and auto-enters the archive again",
    { rewoundProgress },
  );

  // 返场后环视结束停在 100%: 没有输入不能再次被吸回档案
  await page.evaluate(() =>
    document
      .querySelector('[data-action="return-arena"]')
      ?.scrollIntoView({ block: "center" }),
  );
  await page.click('[data-action="return-arena"]');
  await page.waitForFunction(
    () =>
      window.__ENTERPRIZE_DEMO__?.state === "scrub" &&
      document.documentElement.dataset.arenaReturnPhase === "idle",
    null,
    { timeout: 15_000 },
  );
  // 返场钉住 overview: 拖一次环视让它走完 active -> holding -> idle
  await page.mouse.move(683, 384);
  await page.mouse.down();
  await page.mouse.move(883, 384, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.lookAroundMode === "idle",
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(4_000);
  const idleAfterReturn = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    progress: window.__ENTERPRIZE_DEMO__?.timelineProgress,
  }));
  failIf(
    idleAfterReturn.state !== "scrub",
    "after arena return the timeline stays at 100% without sucking back into the archive",
    idleAfterReturn,
  );

  // 主动下滑仍然进档
  await page.mouse.wheel(0, 1800);
  await waitState(page, "end", 15_000);
  console.log("[ok] explicit wheel-down at 100% still enters the archive");

  console.log("[summary] auto archive entry verified end-to-end");
} finally {
  await browser.close();
}
