// Debug: sample robot anchor screen position across the whole scrub timeline (portrait)
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5174/";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Edge not found");

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

async function sweep(width, height, label) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  const page = await ctx.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, { timeout: 90_000 });
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
  });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, { timeout: 60_000 });

  console.log(`--- ${label} (${width}x${height}) ---`);
  let last = -1;
  for (let i = 0; i < 60; i += 1) {
    const s = await page.evaluate(() => ({
      p: window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0,
      pos: window.__ENTERPRIZE_DEMO__?.robotScreenPosition(),
      state: window.__ENTERPRIZE_DEMO__?.state,
    }));
    if (Math.abs(s.p - last) > 0.04 || i === 0) {
      last = s.p;
      const inView =
        s.pos && !s.pos.behind && s.pos.x > 0 && s.pos.x < width && s.pos.y > 0 && s.pos.y < height;
      console.log(
        `p=${s.p.toFixed(3)} x=${s.pos?.x.toFixed(0)} y=${s.pos?.y.toFixed(0)} behind=${s.pos?.behind} inView=${inView} state=${s.state}`,
      );
    }
    if (s.p >= 0.999 || s.state !== "scrub") break;
    await page.evaluate(() => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, cancelable: true }));
    });
    await page.waitForTimeout(150);
  }
  await ctx.close();
}

await sweep(390, 844, "portrait phone");
await sweep(1440, 900, "desktop");
await browser.close();
