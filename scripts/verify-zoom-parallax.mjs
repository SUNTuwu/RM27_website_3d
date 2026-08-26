import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve("shots", "zoom-verification");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
});

const failures = [];
function check(condition, message) {
  if (condition) {
    console.log(`[ok] ${message}`);
  } else {
    failures.push(message);
    console.error(`[fail] ${message}`);
  }
}

async function settle(page, duration = 850) {
  await page.waitForTimeout(duration);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

async function activateGallery(page) {
  await page.waitForSelector("[data-zoom-parallax]");
  // 起始界面会遮住档案: 等 demo 就绪后自动启航, 并等转场结束卸载
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(() => !document.querySelector("#intro-root"), null, {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document.documentElement.classList.add("is-document-mode");
    window.dispatchEvent(new Event("enterprize:zoom-activate"));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("[data-zoom-parallax]")?.dataset.active === "true" &&
      [...document.querySelectorAll("[data-zoom-image]")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    null,
    { timeout: 30_000 },
  );
}

async function scrollTo(page, selector, progress = 0) {
  await page.evaluate(
    ({ selector: targetSelector, progress: targetProgress }) => {
      const target = document.querySelector(targetSelector);
      const top = target.getBoundingClientRect().top + window.scrollY;
      const range = Math.max(target.getBoundingClientRect().height - window.innerHeight, 0);
      window.scrollTo(0, top + range * targetProgress);
    },
    { selector, progress },
  );
  await settle(page);
}

async function capture(page, name) {
  const filePath = path.join(outputDirectory, name);
  await page.screenshot({ path: filePath });
  const details = await stat(filePath);
  check(details.size > 55_000, `${name} is visually non-blank (${details.size} bytes)`);
}

async function layerScales(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-zoom-layer]")].map((layer) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
      return Math.hypot(matrix.a, matrix.b);
    }),
  );
}

async function verifyDesktop() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await activateGallery(page);

  const structure = await page.evaluate(() => {
    const root = document.querySelector("#zoom-parallax-root");
    const archive = document.querySelector("#unit-site");
    const layers = [...document.querySelectorAll("[data-zoom-layer]")];
    return {
      beforeArchive:
        Boolean(root.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING),
      layerCount: layers.length,
      altCount: document.querySelectorAll("[data-zoom-image][alt]:not([alt=''])").length,
      firstZ: Number(getComputedStyle(layers[0]).zIndex),
      secondZ: Number(getComputedStyle(layers[1]).zIndex),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  check(structure.beforeArchive, "Zoom Parallax is mounted before archive in document order");
  check(structure.layerCount === 12, `all 12 prioritized images render (${structure.layerCount})`);
  check(structure.altCount === 12, "all Zoom Parallax images have accessible alt text");
  check(structure.firstZ > structure.secondZ, "1.jpg has the highest visual stacking priority");
  check(structure.scrollWidth === structure.clientWidth, "desktop document has no horizontal overflow");

  await scrollTo(page, "#zoom-parallax-root", 0);
  await capture(page, "zoom-desktop-intro.png");
  check(
    await page.evaluate(() => getComputedStyle(document.querySelector("#archive-nav")).visibility === "hidden"),
    "archive navigation stays hidden in the Zoom Parallax section",
  );

  await scrollTo(page, "#zoom-parallax-gallery", 0);
  const startScales = await layerScales(page);
  const startAreas = await page.evaluate(() =>
    [...document.querySelectorAll("[data-zoom-frame]")]
      .slice(0, 2)
      .map((frame) => {
        const rect = frame.getBoundingClientRect();
        return rect.width * rect.height;
      }),
  );
  await capture(page, "zoom-desktop-start.png");
  check(Math.abs(startScales[0] - 1) < 0.08, `primary layer starts near scale 1 (${startScales[0].toFixed(2)})`);
  check(startAreas[0] > startAreas[1], "1.jpg starts with more visual area than 2.jpg");

  await scrollTo(page, "#zoom-parallax-gallery", 0.5);
  const midScales = await layerScales(page);
  await capture(page, "zoom-desktop-mid.png");
  check(midScales[0] > 1.75 && midScales[0] < 3.5, `primary layer scales through mid-range (${midScales[0].toFixed(2)})`);
  check(midScales[11] > midScales[0] * 2, "lower-priority outer layers zoom faster than 1.jpg");

  await scrollTo(page, "#zoom-parallax-gallery", 1);
  await settle(page, 1_200);
  const endState = await page.evaluate(() => {
    const stage = document.querySelector("[data-zoom-stage]").getBoundingClientRect();
    const primary = document.querySelector("[data-zoom-index='1'] [data-zoom-frame]").getBoundingClientRect();
    return {
      stageTop: stage.top,
      primaryWidth: primary.width,
      primaryHeight: primary.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  await capture(page, "zoom-desktop-end.png");
  check(Math.abs(endState.stageTop) < 2, "Zoom Parallax stage remains pinned at the viewport top");
  check(
    endState.primaryWidth >= endState.viewportWidth * 0.96 &&
      endState.primaryHeight >= endState.viewportHeight * 0.96,
    "1.jpg expands to cover the desktop viewport at the final frame",
  );

  await scrollTo(page, "#archive-hero", 0);
  await settle(page, 500);
  await capture(page, "zoom-desktop-archive-handoff.png");
  check(
    await page.evaluate(() => getComputedStyle(document.querySelector("#archive-nav")).visibility === "visible"),
    "archive navigation appears after the archive enters the viewport",
  );

  check(consoleErrors.length === 0, `desktop has no console errors: ${consoleErrors.join(" | ")}`);
  check(pageErrors.length === 0, `desktop has no page errors: ${pageErrors.join(" | ")}`);
  check(failedRequests.length === 0, `desktop has no failed requests: ${failedRequests.join(" | ")}`);
  await context.close();
}

async function verifyMobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await activateGallery(page);
  await scrollTo(page, "#zoom-parallax-root", 0);
  await capture(page, "zoom-mobile-intro.png");

  const introLayout = await page.evaluate(() => {
    const title = document.querySelector("#zoom-parallax-section h2").getBoundingClientRect();
    const buttons = [...document.querySelectorAll("#zoom-parallax-section header button")].map((button) =>
      button.getBoundingClientRect(),
    );
    return {
      titleFits: title.left >= 0 && title.right <= window.innerWidth,
      buttonsFit: buttons.every((button) => button.left >= 0 && button.right <= window.innerWidth),
      noOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    };
  });
  check(introLayout.titleFits, "mobile section title fits the viewport");
  check(introLayout.buttonsFit, "mobile section controls fit the viewport");
  check(introLayout.noOverflow, "mobile document has no horizontal overflow");

  await scrollTo(page, "#zoom-parallax-gallery", 0);
  await capture(page, "zoom-mobile-start.png");
  const mobileStart = await page.evaluate(() => {
    const frames = [...document.querySelectorAll("[data-zoom-frame]")];
    return frames.every((frame) => {
      const rect = frame.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  });
  check(mobileStart, "all mobile parallax frames have stable non-zero dimensions");

  await scrollTo(page, "#zoom-parallax-gallery", 0.5);
  await capture(page, "zoom-mobile-mid.png");

  await scrollTo(page, "#zoom-parallax-gallery", 1);
  await settle(page, 1_200);
  const mobileEnd = await page.evaluate(() => {
    const primary = document.querySelector("[data-zoom-index='1'] [data-zoom-frame]").getBoundingClientRect();
    return {
      width: primary.width,
      height: primary.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      noOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    };
  });
  await capture(page, "zoom-mobile-end.png");
  check(
    mobileEnd.width >= mobileEnd.viewportWidth * 0.96 &&
      mobileEnd.height >= mobileEnd.viewportHeight * 0.96,
    "1.jpg expands to cover the mobile viewport at the final frame",
  );
  check(mobileEnd.noOverflow, "mobile remains free of horizontal overflow after scaling");
  check(pageErrors.length === 0, `mobile has no page errors: ${pageErrors.join(" | ")}`);
  await context.close();
}

try {
  await verifyDesktop();
  await verifyMobile();
} finally {
  await browser.close();
}

console.log(`\nScreenshots: ${outputDirectory}`);
if (failures.length) {
  throw new Error(`Zoom Parallax verification failed:\n${failures.join("\n")}`);
}
console.log("\nZoom Parallax verification passed.");
