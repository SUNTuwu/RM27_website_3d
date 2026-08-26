// 验证: 开源档案库 CTA 亮色样式 + 档案模式章节滚动吸附
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5175";
const outDir =
  process.env.ENTERPRIZE_VERIFY_DIR ??
  path.join(os.tmpdir(), "enterprize-snap-cta-verification");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

// 起始界面需要点击「启航」才会离开 boot (跃迁转场 -> ASSEMBLE -> EXPLORE)
await page.waitForSelector("#intro-root button", { timeout: 120_000 });
await page.click("#intro-root button");

await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "explore",
  null,
  { timeout: 120_000 },
);
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 600);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "scrub",
  null,
  { timeout: 60_000 },
);
for (let i = 0; i < 80; i++) {
  const progress = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0,
  );
  if (progress >= 0.98) break;
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(260);
}
await page.mouse.wheel(0, 600);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "end",
  null,
  { timeout: 30_000 },
);
await page.waitForTimeout(1800);

// 吸附检查: proximity 由真实滚轮手势触发
const tops = await page.evaluate(() => ({
  heroTop: document.querySelector("#archive-hero").getBoundingClientRect().top + window.scrollY,
  teamTop: document.querySelector("#archive-team").getBoundingClientRect().top + window.scrollY,
  revealTop: document.querySelector("#unit-reveal").getBoundingClientRect().top + window.scrollY,
}));
console.log("[tops]", JSON.stringify(tops));

// headless SwiftShader 下滚轮事件处理有秒级延迟: 轮询至滚动停止再额外等待吸附完成
async function settleAndRead(beforeY) {
  if (beforeY !== undefined) {
    // 先等滚轮事件真正生效 (位置离开初始值), 避免事件延迟造成的假稳定
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const y = await page.evaluate(() => window.scrollY);
      if (Math.abs(y - beforeY) > 4) break;
    }
  }
  let prev = -1;
  let sameCount = 0;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    const y = await page.evaluate(() => window.scrollY);
    if (Math.abs(y - prev) < 2 && i >= 3) { // 至少观测 2s, 防止滚轮延迟造成误判
      sameCount += 1;
      if (sameCount >= 2) break; // 连续 1s 无变化 -> 滚动已停
    } else {
      sameCount = 0;
      prev = y;
    }
  }
  await page.waitForTimeout(2000); // 吸引收敛 + 锁定
  return page.evaluate(() => window.scrollY);
}

// A: 从 hero 顶部向下滚一小段 -> 应吸附回 hero 顶部
await page.evaluate((y) => window.scrollTo(0, y), tops.heroTop);
await settleAndRead();
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 120); // 120 < 向上阈值 0.18vh, 应被弱吸附拉回
const afterNear = await settleAndRead(tops.heroTop);

// B: 从 team 上方 160px 处继续向下 -> 应吸附到 team 顶部
await page.evaluate((y) => window.scrollTo(0, y - 160), tops.teamTop);
await settleAndRead(); // scrollTo 本身会先触发一次吸附到 team 顶
await page.mouse.wheel(0, 90);
const afterFar = await settleAndRead(tops.teamTop - 160);

// C: 从 hero 顶部向上大幅滚动 -> 不应被拉回 (保留向上返回 3D 的路径)
await page.evaluate((y) => window.scrollTo(0, y), tops.heroTop);
await settleAndRead();
await page.mouse.wheel(0, -500);
const afterEscape = await settleAndRead(tops.heroTop);

// D: 从 hero 上方 300px 向下抵达 -> 应被向下强吸附拉到 hero 顶 (修复 WHO WE ARE 不吸)
await page.evaluate((y) => window.scrollTo(0, y - 300), tops.heroTop);
await settleAndRead();
await page.mouse.wheel(0, 120);
const afterArrive = await settleAndRead(tops.heroTop - 300);

// E: 从 unit-reveal 上方 200px 向下 -> 应吸附到「你的选择是什么?」顶部
await page.evaluate((y) => window.scrollTo(0, y - 200), tops.revealTop);
await settleAndRead();
await page.mouse.wheel(0, 120);
const afterReveal = await settleAndRead(tops.revealTop - 200);

const snapResult = { ...tops, afterNear, afterFar, afterEscape, afterArrive, afterReveal };
console.log("[snap]", JSON.stringify(snapResult));
const snappedToHero = Math.abs(afterNear - tops.heroTop) < 4;
const snappedToTeam = Math.abs(afterFar - tops.teamTop) < 4;
const escapeFree = afterEscape < tops.heroTop - 200;
const arrivedAtHero = Math.abs(afterArrive - tops.heroTop) < 4;
const snappedToReveal = Math.abs(afterReveal - tops.revealTop) < 4;
console.log(
  snappedToHero ? "[ok] 接近 hero 时吸附到 hero 顶部" : "[fail] hero 吸附失效",
  "|",
  snappedToTeam ? "[ok] 接近 team 时吸附到 team 顶部" : "[fail] team 吸附失效",
  "|",
  escapeFree ? "[ok] 向上大幅滚动不被拉回" : "[fail] 向上滚动被吸附拦截",
  "|",
  arrivedAtHero ? "[ok] 从上方抵达 hero 被吸附" : "[fail] hero 抵达吸附失效",
  "|",
  snappedToReveal ? "[ok] unit-reveal 吸附生效" : "[fail] unit-reveal 吸附失效",
);

// CTA 截图
await page.evaluate(() => {
  document.querySelector(".archive-os-cta").scrollIntoView({ block: "center" });
});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, "os-cta.png") });

const ctaStyle = await page.evaluate(() => {
  const el = document.querySelector(".archive-os-cta");
  const cs = getComputedStyle(el);
  return { background: cs.backgroundColor, color: cs.color };
});
console.log("[cta]", JSON.stringify(ctaStyle));

await browser.close();
if (!snappedToHero || !snappedToTeam || !escapeFree || !arrivedAtHero || !snappedToReveal) {
  process.exit(1);
}
console.log("[ok] done ->", outDir);
