import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const targetUrl = new URL(
  process.argv[2] ?? "http://127.0.0.1:5173/",
);
targetUrl.searchParams.set("intro", "1");

const executablePath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!executablePath) throw new Error("Microsoft Edge was not found");

function check(condition, message, detail) {
  if (!condition) {
    throw new Error(
      `[fail] ${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
  console.log(`[ok] ${message}`);
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 320, height: 720 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForSelector("[data-intro-archive]");
  const earlyLinks = await page.evaluate(() => ({
    archive: getComputedStyle(document.querySelector("[data-intro-archive]")).visibility,
    openSource: getComputedStyle(
      document.querySelector("[data-intro-open-source]"),
    ).visibility,
    runtimeImportStarted:
      window.__ENTERPRIZE_BOOTSTRAP__?.runtimeImportStarted ?? null,
  }));
  check(
    earlyLinks.archive === "visible" &&
      earlyLinks.openSource === "visible" &&
      earlyLinks.runtimeImportStarted === false,
    "Intro shortcuts are visible before the 3D runtime import",
    earlyLinks,
  );

  await page.keyboard.press("Space");
  await page.waitForSelector("[data-intro-cta]");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const layout = await page.evaluate(() => {
    const button = document.querySelector("[data-intro-cta]");
    const wrapper = button?.parentElement;
    const copy = wrapper?.previousElementSibling;
    const rect = button?.getBoundingClientRect();
    const wrapperRect = wrapper?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const style = button ? getComputedStyle(button) : null;
    const copyStyle = copy ? getComputedStyle(copy) : null;
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      left: rect?.left ?? null,
      right: rect?.right ?? null,
      top: rect?.top ?? null,
      bottom: rect?.bottom ?? null,
      width: rect?.width ?? null,
      height: rect?.height ?? null,
      scrollWidth: button?.scrollWidth ?? null,
      clientWidth: button?.clientWidth ?? null,
      paddingLeft: Number.parseFloat(style?.paddingLeft ?? "0"),
      paddingRight: Number.parseFloat(style?.paddingRight ?? "0"),
      copyGap: (wrapperRect?.top ?? 0) - (copyRect?.bottom ?? 0),
      copyColor: copyStyle?.color ?? null,
      busy: button?.getAttribute("aria-busy") ?? null,
      progressValue: button
        ?.querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow") ?? null,
    };
  });

  check(
    layout.left >= 0 &&
      layout.right <= layout.viewportWidth &&
      layout.top >= 0 &&
      layout.bottom <= layout.viewportHeight &&
      layout.scrollWidth <= layout.clientWidth,
    "320px Intro CTA and its content fit without viewport clipping",
    layout,
  );
  check(
    layout.width >= layout.viewportWidth * 0.85 &&
      layout.height >= 72 &&
      layout.paddingLeft >= 32 &&
      layout.paddingRight >= 32,
    "Intro CTA keeps the enlarged frame and generous horizontal spacing",
    layout,
  );
  check(
    layout.copyGap >= 90 && layout.copyColor === "rgb(184, 194, 207)",
    "Intro CTA sits about 1.5x lower and the Chinese copy is light gray",
    layout,
  );
  check(
    layout.busy === "true" && Number(layout.progressValue) >= 0,
    "Intro CTA exposes its queued loading progress",
    layout,
  );
} finally {
  await context.close();
  await browser.close();
}
