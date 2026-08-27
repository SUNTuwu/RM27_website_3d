import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve("shots");
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

const viewW = 1600;
const viewH = 900;
const edgeMargin = 40;

try {
  const context = await browser.newContext({
    viewport: { width: viewW, height: viewH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[pageerror]", error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
    timeout: 30_000,
  });

  // EXPLORE -> SCAN -> SCRUB
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
    timeout: 60_000,
  });

  // 推进时间轴直到机器人可见, 点击进入 FOCUS
  let robotPos = await page.evaluate(() => window.__ENTERPRIZE_DEMO__.robotScreenPosition());
  for (
    let attempt = 0;
    attempt < 12 &&
    (robotPos.behind ||
      robotPos.x < edgeMargin ||
      robotPos.x > viewW - edgeMargin ||
      robotPos.y < edgeMargin ||
      robotPos.y > viewH - edgeMargin);
    attempt++
  ) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(900);
    robotPos = await page.evaluate(() => window.__ENTERPRIZE_DEMO__.robotScreenPosition());
  }
  await page.mouse.click(robotPos.x, robotPos.y);
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "focus", null, {
    timeout: 20_000,
  });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.focusMode === "active", null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(outputDirectory, "focus-redesign.png") });
  console.log("saved shots/focus-redesign.png");
  await context.close();
} finally {
  await browser.close();
}
