// 驱动完整 3D 流程到达 2D 档案, 截图验证 unit-stack 斜切图集
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5175";
const outDir =
  process.env.ENTERPRIZE_VERIFY_DIR ??
  path.join(os.tmpdir(), "enterprize-unit-stack-verification");
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

// explore -> scan -> scrub
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "explore",
  null,
  { timeout: 120_000 },
);
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 600);
await page.waitForFunction(
  () => window.__ENTERPRISE_DEMO__?.state === "scrub" || window.__ENTERPRIZE_DEMO__?.state === "scrub",
  null,
  { timeout: 60_000 },
);
// scrub 满进度
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

// 滚动到兵种图集
await page.evaluate(() => {
  document.querySelector(".unit-stack").scrollIntoView({ block: "center" });
});
await page.mouse.move(800, 40); // 移出图集, 截取纯折叠态
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outDir, "unit-stack-collapsed.png") });

// 悬停第 5 格 (空中机器人) 验证展开
const slots = page.locator(".unit-slot");
const slotCount = await slots.count();
console.log("[info] slot count:", slotCount);
await slots.nth(4).hover();
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, "unit-stack-hover-drone.png") });

// 悬停最后一格 (问号)
await slots.nth(7).hover();
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, "unit-stack-hover-unknown.png") });

await page.close();

// 移动端: 页面直接展示档案
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
mobile.on("pageerror", (e) => console.error("[pageerror:mobile]", e.message));
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
await mobile.waitForTimeout(2500);
await mobile.evaluate(() => {
  document.querySelector(".unit-stack")?.scrollIntoView({ block: "center" });
});
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: path.join(outDir, "unit-stack-mobile.png") });
await mobile.locator(".unit-slot").nth(0).tap().catch(() => {});
await mobile.waitForTimeout(700);
await mobile.screenshot({ path: path.join(outDir, "unit-stack-mobile-tap.png") });
await mobile.close();

await browser.close();
console.log("[ok] unit-stack verification done ->", outDir);
