import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = path.join(os.tmpdir(), "enterprize-switch-check");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("pageerror", (error) => console.error("[pageerror]", error.message));
page.on("console", (message) => {
  if (message.type() === "error") console.error("[console]", message.text().slice(0, 400));
});

await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, { timeout: 60_000 });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, { timeout: 30_000 });
await page.waitForTimeout(500);

// 点切换按钮, 连拍过渡中间帧 (无头节流环境下动画会被拉长)
await page.click("#explore-next");
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outputDirectory, "50-switch-a.png") });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outputDirectory, "51-switch-b.png") });
await page.waitForTimeout(1_500);
await page.screenshot({ path: path.join(outputDirectory, "52-switch-c.png") });
await page.waitForTimeout(2_500);
await page.screenshot({ path: path.join(outputDirectory, "53-switch-done.png") });

await browser.close();
console.log(`Screenshots: ${outputDirectory}`);
