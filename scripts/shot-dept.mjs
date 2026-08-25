import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = "shots/dept-blueprint";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge was not found");

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

async function shoot(name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document
      .querySelector(".archive-depts")
      ?.scrollIntoView({ block: "start", behavior: "instant" });
    document.querySelectorAll(".archive-depts .reveal").forEach((el) => {
      el.classList.add("is-visible", "in-view", "visible");
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outputDirectory}/${name}.png` });
  const first = await page
    .locator(".archive-dept")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  console.log(`[${name}] background-image:`, first.slice(0, 200));
  await page.close();
}

await shoot("dept-desktop", { width: 1440, height: 900 });
await shoot("dept-mobile", { width: 390, height: 844 });
await browser.close();
