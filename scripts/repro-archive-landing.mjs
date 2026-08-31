import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5174";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => console.log("pageerror:", error.message));

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

async function probe(label) {
  const data = await page.evaluate(() => {
    const header = document.querySelector('[data-snap-scene="beyond-arena"]');
    const title = header?.querySelector("h2");
    const hr = header?.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    return {
      state: window.__ENTERPRIZE_DEMO__?.state,
      scrollY: Math.round(window.scrollY),
      entering: document.documentElement.classList.contains(
        "is-document-entering",
      ),
      headerTop: hr ? Math.round(hr.top) : null,
      headerH: hr ? Math.round(hr.height) : null,
      titleTop: tr ? Math.round(tr.top) : null,
      titleBottom: tr ? Math.round(tr.bottom) : null,
      vh: window.innerHeight,
      docH: document.documentElement.scrollHeight,
    };
  });
  log(label, JSON.stringify(data));
  return data;
}

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
  timeout: 120_000,
});
await page.evaluate(() => window.__ENTERPRIZE_DEMO__.launchIntro());
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "explore",
  null,
  { timeout: 120_000 },
);
log("explore reached");

await page.evaluate(() => {
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
});
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scan", null, {
  timeout: 30_000,
});
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
  timeout: 240_000,
});
log("scrub reached");

// 推到底, 触发自动进档
for (let round = 0; round < 40; round += 1) {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 240, cancelable: true }),
      );
    });
    await page.waitForTimeout(100);
  }
  const state = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
  if (state === "end") break;
}
await probe("immediately after end");

// 新契约: 进档落在 scrollY=0, 标题仍在视口下方; 随滚动逐步升起
await page.waitForTimeout(1000); // 等进档保护窗结束
const landed = await probe("landed (expect scrollY 0, title below viewport)");
await page.screenshot({ path: "scripts/out/landing-at-top.png" });

// 逐步下滚, 标题应随滚动量线性升起 (不瞬跳)
for (const y of [150, 300, 450, 600, 750, 900]) {
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await page.waitForTimeout(120);
  await probe(`scrollTo ${y}`);
  if (y === 450) {
    await page.screenshot({ path: "scripts/out/landing-mid-rise.png" });
  }
}
await page.screenshot({ path: "scripts/out/landing-full-rise.png" });

// 浅位置小幅回滚 (未贴顶) 不应返场
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForTimeout(150);
await probe("nudge up to 700 (should stay in 2D)");

// 回滚贴顶 -> 返回 3D
await page.evaluate(() => window.scrollTo(0, 10));
await page.waitForTimeout(400);
await probe("scroll back to top (should return to 3D)");

await browser.close();
