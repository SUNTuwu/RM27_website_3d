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
    // join-fleet 导航锚点在章节 header (wrap 上方留白 ~198px), 落点以 header 为准
    const joinFleet = document.querySelector('[data-snap-scene="join-fleet"]');
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
      joinFleetTop: joinFleet?.getBoundingClientRect().top ?? null,
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
      directArchiveState.joinFleetTop !== null &&
      Math.abs(directArchiveState.joinFleetTop) <= 48 &&
      directArchiveState.joinBottom > 0,
    "direct archive navigation lands at #archive-join (join-fleet header anchor)",
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
      // 纯原生滚动: scrollIntoView block:start 落点即章节顶
      return Number.isFinite(top) && top >= -3 && top <= Math.min(120, window.innerHeight * 0.15);
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

    const stats = [...document.querySelectorAll(".archive-stat")].map((card) => {
      const style = getComputedStyle(card);
      const background = style.backgroundImage;
      return {
        background,
        dark:
          background.includes("rgb(16, 24, 39)") &&
          background.includes("rgb(5, 7, 13)"),
      };
    });
    const logo = document.querySelector(".archive-hero__logo");
    const logoStyle = logo ? getComputedStyle(logo) : null;
    const logoSrc = logo?.currentSrc || logo?.getAttribute("src") || "";
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
      // 手机端应不请求队标资源 (picture source 仅 min-width: 601px)
      logoSrc,
      logoNaturalWidth: logo?.naturalWidth ?? -1,
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
    mobileHeroState.logoDisplay === "none" &&
      mobileHeroState.logoRectCount === 0 &&
      !mobileHeroState.logoSrc &&
      mobileHeroState.logoNaturalWidth === 0,
    "390x844 hides and does not load the floating archive hero logo",
    {
      display: mobileHeroState.logoDisplay,
      rectCount: mobileHeroState.logoRectCount,
      logoSrc: mobileHeroState.logoSrc,
      logoNaturalWidth: mobileHeroState.logoNaturalWidth,
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

  const foldRevealState = await page.evaluate(() => {
    const hero = document.querySelector("#archive-hero");
    const inner = document.querySelector(".archive-hero__inner");
    const unitSite = document.querySelector("#unit-site");
    const stage = document.querySelector("[data-zoom-stage]");
    const image = [...document.querySelectorAll("img[data-zoom-image]")].find(
      (candidate) => new URL(candidate.currentSrc || candidate.src).pathname.endsWith("/zoom/1.webp"),
    );
    if (!hero || !inner || !unitSite || !stage || !image) return null;

    const heroRect = hero.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const sample = (xRatio, yOffset) => {
      const x = heroRect.left + heroRect.width * xRatio;
      const y = Math.max(1, heroRect.top + yOffset);
      const stack = document.elementsFromPoint(x, y);
      return {
        x,
        y,
        innerHit: stack.some((element) => element === inner || inner.contains(element)),
        stageHit: stack.some((element) => element === stage || stage.contains(element)),
        imageHit: stack.includes(image),
        imageCovers:
          imageRect.left <= x &&
          imageRect.right >= x &&
          imageRect.top <= y &&
          imageRect.bottom >= y,
      };
    };

    return {
      cutouts: [sample(0.01, 8), sample(0.5, 8)],
      tab: sample(0.1, 8),
      belowFold: [sample(0.01, 30), sample(0.1, 30), sample(0.5, 30)],
      heroBackground: getComputedStyle(hero).backgroundColor,
      unitSiteBackground: getComputedStyle(unitSite).backgroundImage,
      unitSiteBoxShadow: getComputedStyle(unitSite).boxShadow,
      stageRect: {
        top: stageRect.top,
        bottom: stageRect.bottom,
      },
      viewportHeight: window.innerHeight,
      image: {
        source: new URL(image.currentSrc || image.src).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      },
      foldHosts: [...document.querySelectorAll(".archive-fold")].map((element) => ({
        id: element.id,
        side: element.classList.contains("archive-fold--right") ? "right" : "left",
      })),
      mediaAfter: getComputedStyle(document.querySelector("#archive-media"), "::after").content,
      returnAfter: getComputedStyle(document.querySelector("#archive-return"), "::after").content,
    };
  });
  check(
    foldRevealState &&
      foldRevealState.cutouts.every(
        (sample) =>
          !sample.innerHit && sample.stageHit && sample.imageCovers,
      ) &&
      foldRevealState.tab.innerHit &&
      foldRevealState.belowFold.every((sample) => sample.innerHit) &&
      foldRevealState.heroBackground === "rgba(0, 0, 0, 0)" &&
      foldRevealState.unitSiteBackground.includes("rgba(0, 0, 0, 0)") &&
      foldRevealState.unitSiteBackground.includes("rgb(5, 7, 13)") &&
      (foldRevealState.unitSiteBoxShadow === "none" ||
        foldRevealState.unitSiteBoxShadow === "") &&
      foldRevealState.stageRect.top <= 1 &&
      foldRevealState.stageRect.bottom >= foldRevealState.viewportHeight - 1 &&
      foldRevealState.image.source.endsWith("/zoom/1.webp") &&
      foldRevealState.image.complete &&
      foldRevealState.image.naturalWidth > 0,
    "WHO WE ARE fold cutouts reveal the loaded Zoom photo wall without a dark veil",
    foldRevealState,
  );
  check(
    JSON.stringify(foldRevealState?.foldHosts) ===
      JSON.stringify([
        { id: "archive-hero", side: "left" },
        { id: "archive-team", side: "right" },
        { id: "archive-units", side: "left" },
        { id: "archive-join", side: "right" },
      ]) &&
      foldRevealState.mediaAfter === "none" &&
      foldRevealState.returnAfter === "none",
    "archive folds alternate while MEDIA and BACK TO THE ARENA stay unframed",
    foldRevealState,
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
