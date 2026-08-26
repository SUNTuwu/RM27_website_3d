import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5176/";
const outDir = path.join(os.tmpdir(), "enterprize-join-shots");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

const browser = await chromium.launch({ executablePath, headless: true });

async function shoot(name, viewport, tasks) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error(`[pageerror:${name}]`, err.message));
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
  });
  await tasks(page, `${name}`);
  await context.close();
}

async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: "center" });
  }, selector);
  await page.waitForTimeout(1400);
}

await shoot("desktop", { width: 1440, height: 900 }, async (page, name) => {
  await scrollTo(page, ".archive-duo");
  await page.screenshot({ path: path.join(outDir, `${name}-duo.png`) });

  await scrollTo(page, ".archive-steps");
  await page.screenshot({ path: path.join(outDir, `${name}-steps.png`) });

  await scrollTo(page, "[data-faq]");
  await page.screenshot({ path: path.join(outDir, `${name}-faq.png`) });
  const questions = page.locator(".archive-faq__question");
  await questions.nth(0).click();
  await questions.nth(3).click();
  await page.waitForTimeout(700);
  await scrollTo(page, "[data-faq]");
  await page.screenshot({ path: path.join(outDir, `${name}-faq-open.png`) });

  await scrollTo(page, "#glowing-channels-root");
  await page.screenshot({ path: path.join(outDir, `${name}-channels.png`) });
  const card = page.locator("#glowing-channels-root li").nth(1);
  const box = await card.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 12 });
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, `${name}-channels-glow.png`) });
});

await shoot("mobile", { width: 390, height: 844 }, async (page, name) => {
  await scrollTo(page, ".archive-duo");
  await page.screenshot({ path: path.join(outDir, `${name}-duo.png`) });
  await scrollTo(page, ".archive-steps");
  await page.screenshot({ path: path.join(outDir, `${name}-steps.png`) });
  await scrollTo(page, "[data-faq]");
  await page.screenshot({ path: path.join(outDir, `${name}-faq.png`) });
  await scrollTo(page, "#glowing-channels-root");
  await page.screenshot({ path: path.join(outDir, `${name}-channels.png`) });
});

await browser.close();
console.log("shots saved to", outDir);
