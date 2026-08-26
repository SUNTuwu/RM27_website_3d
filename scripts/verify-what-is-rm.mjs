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
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
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
    const heavy = [
      ...document.querySelectorAll("#archive-units .archive-media-row"),
    ].find((el) => !el.classList.contains("archive-media-row--intro"));
    const row = document.querySelector(".archive-media-row--intro");
    const visual = row.querySelector(".archive-media-row__visual");
    const rowRect = row.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const body = row.querySelector(".archive-media-row__body");
    const bodyChildren = [...body.children].map((el) => ({
      cls: el.className,
      minW: getComputedStyle(el).minWidth,
      scrollW: el.scrollWidth,
      rectW: Math.round(el.getBoundingClientRect().width),
    }));
    const diag = {
      rowCols: getComputedStyle(row).gridTemplateColumns,
      rowDisplay: getComputedStyle(row).display,
      bodyMinW: getComputedStyle(body).minWidth,
      bodyScrollW: body.scrollWidth,
      bodyRectW: Math.round(body.getBoundingClientRect().width),
      bodyChildren,
      visualMinH: getComputedStyle(visual).minHeight,
      visualMinW: getComputedStyle(visual).minWidth,
      visualJustify: getComputedStyle(visual).justifySelf,
      visualAlign: getComputedStyle(visual).alignSelf,
      framePos: getComputedStyle(frame).position,
      frameWidthCss: getComputedStyle(frame).width,
      frameAspect: getComputedStyle(frame).aspectRatio,
    };
    return {
      diag,
      src: frame.getAttribute("src"),
      loading: frame.loading,
      box: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      rowBox: `${Math.round(rowRect.width)}x${Math.round(rowRect.height)}`,
      visualBox: `${Math.round(visualRect.width)}x${Math.round(visualRect.height)}`,
      rowsFound: document.querySelectorAll("#archive-units .archive-media-row").length,
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
