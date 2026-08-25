import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5174/";
const outputDirectory = path.resolve("shots", "return-bg");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });

async function capture(name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".archive-return__bg", { timeout: 15_000 });
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document
      .querySelector("#archive-return")
      ?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(outputDirectory, `${name}.png`) });
  const stats = await page.evaluate(() => {
    const bg = document.querySelector(".archive-return__bg");
    return {
      loaded: bg.complete && bg.naturalWidth > 0,
      opacity: getComputedStyle(bg).opacity,
    };
  });
  console.log(name, JSON.stringify(stats));
  await page.close();
}

await capture("desktop", { width: 1600, height: 900 });
await capture("mobile", { width: 390, height: 844 });
await browser.close();
