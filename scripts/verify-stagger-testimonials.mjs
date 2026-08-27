import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5174/";
const outputDirectory = path.resolve("shots", "stagger-testimonials");
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
  await page.waitForSelector("#stagger-testimonials-root figure", {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document
      .querySelector("#stagger-testimonials-root")
      ?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: path.join(outputDirectory, `${name}.png`),
  });
  const stats = await page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll("#stagger-testimonials-root figure"),
    ];
    const columns = [
      ...document.querySelectorAll(
        "#stagger-testimonials-root > div > div > div",
      ),
    ].map(
      (el) => `${el.className} => ${getComputedStyle(el).marginTop}`,
    );
    const media = window.matchMedia("(width >= 64rem)").matches;
    const probe = document.createElement("div");
    probe.className = "lg:mt-16 mt-8 p-6";
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const probeInfo = {
      marginTop: probeStyle.marginTop,
      paddingLeft: probeStyle.paddingLeft,
      spacing: getComputedStyle(document.documentElement).getPropertyValue(
        "--spacing",
      ),
    };
    probe.remove();
    return {
      count: cards.length,
      lgMediaMatches: media,
      probeInfo,
      columnMargins: columns,
      opacity: cards.map((c) => getComputedStyle(c).opacity),
      tops: cards.map((c) => Math.round(c.getBoundingClientRect().top)),
    };
  });
  console.log(name, JSON.stringify(stats));
  await page.close();
}

await capture("desktop", { width: 1600, height: 900 });
await capture("mobile", { width: 390, height: 844 });
await browser.close();
