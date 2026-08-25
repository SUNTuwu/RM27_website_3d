import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5175/";
const outputDirectory = path.resolve("shots", "what-is-rm");
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
  await page.waitForSelector(".archive-media-row--intro iframe", {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document
      .querySelector(".archive-media-row--intro")
      ?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(outputDirectory, `${name}.png`) });
  const stats = await page.evaluate(() => {
    const frame = document.querySelector(".archive-media-row--intro iframe");
    const rect = frame.getBoundingClientRect();
    const heavy = document.querySelector(
      "#archive-units .archive-media-row:not(.archive-media-row--intro)",
    );
    return {
      src: frame.getAttribute("src"),
      loading: frame.loading,
      box: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      clientWidth: document.documentElement.clientWidth,
      wrapWidth: Math.round(
        document.querySelector("#archive-units .archive-wrap").getBoundingClientRect().width,
      ),
      heavyRowWidth: heavy
        ? Math.round(heavy.getBoundingClientRect().width)
        : null,
    };
  });
  console.log(name, JSON.stringify(stats));
  await page.close();
}

await capture("desktop", { width: 1600, height: 900 });
await capture("mobile", { width: 390, height: 844 });
await browser.close();
