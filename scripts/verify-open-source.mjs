import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5175";
const outDir =
  process.env.ENTERPRIZE_VERIFY_DIR ??
  path.join(os.tmpdir(), "enterprize-open-source-verification");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const pageErrors = [];

async function shoot(name, viewport, actions) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => {
    // Bilibili 播放器 iframe 内部脚本报错与本页代码无关
    if (/bili-user-fingerprint|bilibili/i.test(error.message)) return;
    pageErrors.push(`${name}: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (/bili-user-fingerprint|bilibili/i.test(msg.text())) return;
    pageErrors.push(`${name}: ${msg.text()}`);
  });
  await page.goto(`${baseUrl}/open-source.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, `${name}-hero.png`) });
  await page.evaluate(() => {
    document.querySelector("#archive").scrollIntoView();
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, `${name}-archive.png`) });
  const stats = await page.evaluate(() => ({
    cards: document.querySelectorAll(".project-card").length,
    firstMetric: document.querySelector("[data-total-stars]")?.textContent,
    status: document.querySelector("#metrics-status")?.textContent,
    canvas: !!document.querySelector("#warp"),
  }));
  console.log(`[${name}]`, JSON.stringify(stats));
  if (stats.cards !== 32) failures.push(`${name}: expected 32 cards, got ${stats.cards}`);
  if (!stats.canvas) failures.push(`${name}: starfield canvas missing`);
  if (actions) await actions(page);
  await page.close();
}

await shoot("desktop", { width: 1600, height: 900 }, async (page) => {
  // 悬停第一张卡片, 验证放大预览交互
  await page.hover(".project-card");
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outDir, "desktop-card-hover.png") });
  // 切换筛选
  await page.click('[data-filter="power"]');
  await page.waitForTimeout(400);
  const visible = await page.evaluate(
    () => document.querySelectorAll(".project-card:not([hidden])").length,
  );
  console.log("[desktop] power filter visible:", visible);
  if (visible === 0 || visible >= 32) {
    failures.push(`desktop: power filter visible=${visible}`);
  }
  await page.screenshot({ path: path.join(outDir, "desktop-filter-power.png") });
});
await shoot("mobile", { width: 390, height: 844 });

await browser.close();
for (const error of pageErrors) console.error(`[pageerror] ${error}`);
for (const failure of failures) console.error(`[fail] ${failure}`);
if (failures.length || pageErrors.length) process.exit(1);
console.log("[ok] open-source page verification passed ->", outDir);
