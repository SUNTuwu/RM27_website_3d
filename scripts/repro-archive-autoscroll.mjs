// 复现: 触控板式连续滚动把 timeline 推过 99→100,
// 进档后仍持续一小段惯性 wheel —— 自动滑屏应仍完成一整屏揭示。
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5179/";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

async function waitState(state, timeout = 30_000) {
  await page.waitForFunction(
    (wanted) => window.__ENTERPRIZE_DEMO__?.state === wanted,
    state,
    { timeout },
  );
}

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.ready === true,
    null,
    { timeout: 90_000 },
  );
  await page.click("#intro-root [data-intro-cta]");
  await waitState("explore", 45_000);
  await page.mouse.wheel(0, 600);
  await waitState("scan", 12_000);
  await waitState("scrub", 120_000);

  // 触控板式连续滚动: 小增量高频率, 推过 99→100 后仍带惯性余波
  let entered = false;
  for (let i = 0; i < 400; i += 1) {
    const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (state === "end") {
      entered = true;
      break;
    }
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(50);
  }
  if (!entered) throw new Error("[fail] never reached end state");
  await page.evaluate(() => {
    window.__AUTO_SCROLL_TRACE__ = [];
    const started = performance.now();
    const sample = () => {
      window.__AUTO_SCROLL_TRACE__.push({
        t: Math.round(performance.now() - started),
        y: Math.round(window.scrollY),
        active: window.__ENTERPRIZE_DEMO__?.archiveAutoScrollActive,
      });
      if (performance.now() - started < 2_800) {
        window.setTimeout(sample, 100);
      }
    };
    sample();
  });
  // 惯性余波: 进档后 400ms 内继续有 wheel 事件 (真实触控板/鼠标常见)
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 90);
    await page.waitForTimeout(50);
  }

  await page.waitForTimeout(2_800);
  const trace = await page.evaluate(() => window.__AUTO_SCROLL_TRACE__);
  console.log(
    "[trace]",
    trace.map((entry) => `${entry.t}ms:y${entry.y}${entry.active ? "*" : ""}`).join(" "),
  );
  const result = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    autoScrollActive: window.__ENTERPRIZE_DEMO__?.archiveAutoScrollActive,
    lastCancel: window.__ENTERPRIZE_DEMO__?.archiveAutoScrollLastCancel,
    scrollY: window.scrollY,
    targetY: document.querySelector("#zoom-parallax-root")?.offsetTop ?? null,
  }));
  console.log("[probe]", JSON.stringify(result));
  if (
    result.state !== "end" ||
    result.targetY === null ||
    Math.abs(result.scrollY - result.targetY) > 4
  ) {
    throw new Error(
      `[fail] auto scroll did not complete one reveal screen: ${JSON.stringify(result)}`,
    );
  }
  console.log("[ok] inertial wheel does not kill the 3D→2D auto scroll");
} finally {
  await browser.close();
}
