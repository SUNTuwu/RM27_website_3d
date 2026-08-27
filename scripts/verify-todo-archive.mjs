import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const inputUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const archiveUrl = new URL(inputUrl);
archiveUrl.searchParams.set("view", "archive");
archiveUrl.hash = "archive-join";

const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

const failures = [];
function check(condition, message, detail = undefined) {
  if (condition) {
    console.log(`[ok] ${message}`);
    return;
  }
  failures.push(message);
  const suffix = detail === undefined ? "" : `: ${JSON.stringify(detail)}`;
  console.error(`[fail] ${message}${suffix}`);
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
let abortedBilibiliRequests = 0;

await context.route("**/*", (route) => {
  const hostname = new URL(route.request().url()).hostname;
  const isBilibili = ["bilibili.com", "bilivideo.com", "hdslb.com"].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (isBilibili) {
    abortedBilibiliRequests += 1;
    return route.abort("blockedbyclient");
  }
  return route.continue();
});

try {
  await page.goto(archiveUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_BOOTSTRAP__?.directArchiveReady === true,
    null,
    { timeout: 30_000 },
  );
  await page.waitForSelector('[data-zoom-parallax][data-active="true"]', {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

  const directArchiveState = await page.evaluate(() => {
    const bootstrap = window.__ENTERPRIZE_BOOTSTRAP__;
    const join = document.querySelector("#archive-join");
    const joinRect = join?.getBoundingClientRect();
    const app = document.querySelector("#app");
    return {
      bootstrapMode: bootstrap?.mode ?? null,
      directArchiveReady: bootstrap?.directArchiveReady ?? false,
      introMounted: bootstrap?.introMounted ?? null,
      runtimeImportStarted: bootstrap?.runtimeImportStarted ?? null,
      documentMode: document.documentElement.classList.contains("is-document-mode"),
      directArchiveFlag: document.documentElement.dataset.directArchive ?? null,
      introChildren: document.querySelector("#intro-root")?.childElementCount ?? -1,
      appHidden: app?.hidden ?? false,
      appAriaHidden: app?.getAttribute("aria-hidden") ?? null,
      hash: window.location.hash,
      requestedView: new URLSearchParams(window.location.search).get("view"),
      joinExists: Boolean(join),
      joinTop: joinRect?.top ?? null,
      joinBottom: joinRect?.bottom ?? null,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    };
  });

  check(
    directArchiveState.bootstrapMode === "archive" &&
      directArchiveState.directArchiveReady &&
      directArchiveState.documentMode &&
      directArchiveState.directArchiveFlag === "true",
    "archive query enters direct document mode",
    directArchiveState,
  );
  check(
    directArchiveState.introMounted === false &&
      directArchiveState.introChildren === 0 &&
      directArchiveState.runtimeImportStarted === false &&
      directArchiveState.appHidden &&
      directArchiveState.appAriaHidden === "true",
    "direct archive navigation bypasses Intro and the 3D runtime",
    directArchiveState,
  );
  check(
    directArchiveState.requestedView === "archive" &&
      directArchiveState.hash === "#archive-join" &&
      directArchiveState.joinExists &&
      directArchiveState.scrollY > 0 &&
      directArchiveState.joinTop >= 0 &&
      directArchiveState.joinTop <= Math.min(120, directArchiveState.viewportHeight * 0.15) &&
      directArchiveState.joinBottom > 0,
    "direct archive navigation lands at #archive-join",
    directArchiveState,
  );

  await page.evaluate(() =>
    document.querySelector("#archive-hero")?.scrollIntoView({
      behavior: "auto",
      block: "start",
    }),
  );
  await page.waitForFunction(
    () => {
      const top = document.querySelector("#archive-hero")?.getBoundingClientRect().top;
      return Number.isFinite(top) && top >= 0 && top <= Math.min(120, window.innerHeight * 0.15);
    },
    null,
    { timeout: 8_000 },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

  const mobileHeroState = await page.evaluate(() => {
    const title = document.querySelector(".archive-hero__title");
    const titleRect = title?.getBoundingClientRect();
    const titleStyle = title ? getComputedStyle(title) : null;
    const titleRange = document.createRange();
    if (title) titleRange.selectNodeContents(title);

    const parseColor = (value) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        red: channels[0] ?? 255,
        green: channels[1] ?? 255,
        blue: channels[2] ?? 255,
        alpha: channels[3] ?? 1,
      };
    };
    const stats = [...document.querySelectorAll(".archive-stat")].map((card) => {
      const background = getComputedStyle(card).backgroundColor;
      const color = parseColor(background);
      const luminance =
        (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255;
      return {
        background,
        dark: luminance < 0.15 && color.alpha >= 0.8,
      };
    });
    const logo = document.querySelector(".archive-hero__logo");
    const logoStyle = logo ? getComputedStyle(logo) : null;
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      titleText: title?.textContent?.trim() ?? null,
      titleWhiteSpace: titleStyle?.whiteSpace ?? null,
      titleLeft: titleRect?.left ?? null,
      titleRight: titleRect?.right ?? null,
      titleTextLineCount: title ? titleRange.getClientRects().length : 0,
      statCount: stats.length,
      stats,
      logoDisplay: logoStyle?.display ?? null,
      logoRectCount: logo?.getClientRects().length ?? -1,
    };
  });

  check(
    mobileHeroState.viewportWidth === 390 &&
      mobileHeroState.viewportHeight === 844 &&
      mobileHeroState.titleText === "ENTERPRIZE" &&
      mobileHeroState.titleWhiteSpace === "nowrap" &&
      mobileHeroState.titleTextLineCount === 1 &&
      mobileHeroState.titleLeft >= -0.5 &&
      mobileHeroState.titleRight <= mobileHeroState.viewportWidth + 0.5,
    "390x844 hero ENTERPRIZE stays on one line inside the viewport",
    mobileHeroState,
  );
  check(
    mobileHeroState.statCount === 4 &&
      mobileHeroState.stats.every((stat) => stat.dark),
    "390x844 renders all four statistics as dark cards",
    mobileHeroState.stats,
  );
  check(
    mobileHeroState.logoDisplay === "none" && mobileHeroState.logoRectCount === 0,
    "390x844 hides the floating archive hero logo",
    {
      display: mobileHeroState.logoDisplay,
      rectCount: mobileHeroState.logoRectCount,
    },
  );

  await page.waitForFunction(
    () => {
      const images = [...document.querySelectorAll("img[data-zoom-image]")];
      return (
        images.length === 6 &&
        images.every(
          (image) =>
            image.complete &&
            image.naturalWidth > 0 &&
            image.dataset.zoomLoadState === "loaded",
        )
      );
    },
    null,
    { timeout: 30_000 },
  );
  const zoomImageState = await page.evaluate(() =>
    [...document.querySelectorAll("img[data-zoom-image]")].map((image) => ({
      source: new URL(image.currentSrc || image.src).pathname,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      loadState: image.dataset.zoomLoadState,
    })),
  );
  check(
    zoomImageState.length === 6 &&
      zoomImageState.every(
        (image) =>
          image.complete && image.naturalWidth > 0 && image.loadState === "loaded",
      ),
    "all six Zoom Parallax images finish in the loaded state",
    zoomImageState,
  );

  const channelSpacing = await page.evaluate(() => {
    const frame = document.querySelector("[data-channel-frame]");
    const card = document.querySelector("[data-channel-card]");
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const cardStyle = card ? getComputedStyle(card) : null;
    return {
      framePadding: Number.parseFloat(frameStyle?.paddingTop ?? "0"),
      cardPadding: Number.parseFloat(cardStyle?.paddingTop ?? "0"),
    };
  });
  check(
    channelSpacing.framePadding >= 8 && channelSpacing.cardPadding >= 28,
    "coordinate cards keep expanded border and content spacing",
    channelSpacing,
  );

  const faviconState = await page.evaluate(() => {
    const icon = [...document.querySelectorAll('link[rel~="icon"]')][0];
    return {
      href: icon?.href ?? null,
      type: icon?.getAttribute("type") ?? null,
    };
  });
  const faviconResponse = faviconState.href
    ? await context.request.get(faviconState.href)
    : null;
  const faviconBytes = faviconResponse ? await faviconResponse.body() : Buffer.alloc(0);
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const faviconPath = faviconState.href ? new URL(faviconState.href).pathname : null;
  check(
    faviconPath === "/assets/icon/blue_logo.png" &&
      faviconState.type === "image/png" &&
      faviconResponse?.ok() === true &&
      pngSignature.every((byte, index) => faviconBytes[index] === byte),
    "favicon points to the blue ENTERPRIZE PNG and returns valid PNG bytes",
    {
      ...faviconState,
      path: faviconPath,
      status: faviconResponse?.status() ?? null,
      contentType: faviconResponse?.headers()["content-type"] ?? null,
      bytes: faviconBytes.byteLength,
    },
  );

  if (failures.length) {
    throw new Error(`TODO archive verification failed: ${failures.join(" | ")}`);
  }
  console.log(
    "[summary]",
    JSON.stringify({
      url: archiveUrl.href,
      viewport: "390x844",
      zoomImages: zoomImageState.length,
      abortedBilibiliRequests,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
