// 2D 战队档案 (unit-site) 验证: 进入 END 文档模式后逐章截图检查,
// 覆盖章节导航、reveal、返回 3D 按钮与移动端直读。
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl =
  process.argv[2] ?? process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory =
  process.env.ENTERPRIZE_VERIFY_DIR ??
  path.join(os.tmpdir(), "enterprize-archive-verification");
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
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

const failures = [];
function failIf(condition, message) {
  if (condition) {
    failures.push(message);
    console.error(`[fail] ${message}`);
  } else {
    console.log(`[ok] ${message}`);
  }
}

async function waitState(page, expected, timeout = 30_000) {
  await page.waitForFunction(
    (wanted) => window.__ENTERPRIZE_DEMO__?.state === wanted,
    expected,
    { timeout },
  );
}

try {
  // ---------------- 桌面端: 3D -> 2D 档案 ----------------
  const viewW = 1366;
  const viewH = 820;
  const context = await browser.newContext({
    viewport: { width: viewW, height: viewH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const ignoredEmbedErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const isBilibiliIframeNoise =
      text.includes("@bilibili/bili-user-fingerprint(report)") ||
      (text.includes("WebSocket connection to 'wss://") &&
        text.includes("web-player-tracker.biliapi.net"));
    (isBilibiliIframeNoise ? ignoredEmbedErrors : consoleErrors).push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.ready === true,
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await waitState(page, "explore", 30_000);

  // 快进到 END: EXPLORE 滚轮 -> SCAN -> SCRUB, 推满时间轴后再滚一格
  await page.mouse.wheel(0, 600);
  await waitState(page, "scan", 10_000);
  await waitState(page, "scrub", 45_000);
  for (let attempt = 0; attempt < 80; attempt++) {
    const progress = await page.evaluate(
      () => window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0,
    );
    if (progress >= 0.995) break;
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(350);
  }
  await page.mouse.wheel(0, 800);
  await waitState(page, "end", 10_000);
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const introTop = document
      .querySelector("#zoom-parallax-root")
      .getBoundingClientRect().top;
    return (
      !root.classList.contains("is-document-transitioning") &&
      Math.abs(introTop) < 2
    );
  });
  console.log("[ok] reached END document mode at Zoom Parallax intro");

  // 进入 END 前的额外滚轮会继续原生滚动文档; 归位到档案首页再检查
  await page.evaluate(() => document.fonts?.ready);
  const heroSnap = page.locator("[data-snap-scene='archive-hero-image']");
  await heroSnap.evaluate((element) =>
    element.scrollIntoView({ behavior: "instant", block: "center" }),
  );
  await page.waitForFunction(() =>
    document.querySelector("#unit-site")?.classList.contains("is-archive-active"),
  );
  await page.waitForTimeout(900);
  await heroSnap.evaluate((element) =>
    element.scrollIntoView({ behavior: "instant", block: "center" }),
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outputDirectory, "archive-00-hero.png"),
  });

  const heroChecks = await page.evaluate(() => {
    const visible = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.bottom > 0 && rect.top < window.innerHeight && style.opacity !== "0"
      );
    };
    return {
      bgActive: document
        .querySelector("#unit-site")
        .classList.contains("is-archive-active"),
      navItems: document.querySelectorAll(".archive-nav__item").length,
      navVisible:
        getComputedStyle(document.querySelector("#archive-nav")).visibility ===
        "visible",
      heroTitle: visible(".archive-hero__title"),
      statCount: document.querySelectorAll(".archive-stat").length,
    };
  });
  failIf(!heroChecks.bgActive, "archive background activated in document mode");
  failIf(
    heroChecks.navItems !== 5,
    `chapter nav exposes 5 items (${heroChecks.navItems})`,
  );
  failIf(!heroChecks.navVisible, "chapter nav visible on wide desktop");
  failIf(!heroChecks.heroTitle, "archive hero title revealed");
  failIf(
    heroChecks.statCount !== 4,
    `hero stats render 4 entries (${heroChecks.statCount})`,
  );
  // 数字滚动完成后应达到目标值
  await page.waitForFunction(
    () => document.querySelector("[data-count='35']")?.textContent === "35",
    null,
    { timeout: 8_000 },
  );
  failIf(false, "stat count-up reaches its target value");

  // 逐章跳转截图 + reveal 生效
  for (const [id, name] of [
    ["archive-team", "01-team"],
    ["archive-units", "02-units"],
    ["archive-join", "03-join"],
    ["archive-return", "04-return"],
  ]) {
    await page.evaluate((target) => {
      document
        .getElementById(target)
        .scrollIntoView({ behavior: "instant", block: "start" });
    }, id);
    await page.waitForTimeout(1100);
    await page.screenshot({
      path: path.join(outputDirectory, `archive-${name}.png`),
    });
  }

  const chapterChecks = await page.evaluate(() => {
    const inView = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { exists: false, revealed: false, inViewport: false };
      const rect = el.getBoundingClientRect();
      return {
        exists: true,
        revealed: el.classList.contains("is-in"),
        inViewport: rect.bottom > 0 && rect.top < window.innerHeight,
      };
    };
    return {
      returnTitle: inView(".archive-return__title"),
      returnButton: inView("[data-action='return-arena']"),
      navActiveLabel:
        document.querySelector(".archive-nav__item.is-active .archive-nav__label")
          ?.textContent ?? "",
      progressScale: new DOMMatrix(
        getComputedStyle(document.querySelector("#archive-progress-fill"))
          .transform,
      ).a,
      docHeight: document.documentElement.scrollHeight,
      viewHeight: window.innerHeight,
    };
  });
  failIf(
    !chapterChecks.returnTitle.revealed,
    "return chapter title revealed after jump",
  );
  failIf(
    !chapterChecks.returnButton.inViewport,
    "return-to-arena button on screen",
  );
  failIf(
    chapterChecks.navActiveLabel !== "RETURN",
    `scroll-spy marks RETURN active (${chapterChecks.navActiveLabel})`,
  );
  failIf(
    chapterChecks.progressScale < 0.9,
    `archive progress bar near full at last chapter (${chapterChecks.progressScale})`,
  );
  failIf(
    chapterChecks.docHeight < chapterChecks.viewHeight * 4,
    "archive document is long-form (multiple chapters)",
  );

  // 章节导航点击 -> 平滑跳转到对应章节
  await page.evaluate(() => {
    [...document.querySelectorAll(".archive-nav__item")][1].click();
  });
  const navJump = await page
    .waitForFunction(
      () =>
        Math.abs(
          document
            .querySelector("[data-snap-scene='team-history']")
            .getBoundingClientRect().top,
        ) < 4,
      null,
      { timeout: 8_000, polling: 200 },
    )
    .then(() => true)
    .catch(() => false);
  failIf(!navJump, "chapter nav click lands on the TEAM chapter");

  // 返回按钮 -> 回到 SCRUB 3D 状态
  await page.evaluate(() => {
    document
      .getElementById("archive-return")
      .scrollIntoView({ behavior: "instant" });
  });
  await page.waitForTimeout(400);
  await page.click("[data-action='return-arena']");
  await waitState(page, "scrub", 10_000);
  failIf(
    await page.evaluate(() =>
      document.documentElement.classList.contains("is-document-mode"),
    ),
    "return button exits document mode back to 3D",
  );
  const backAtTop = await page.evaluate(() => window.scrollY);
  failIf(backAtTop !== 0, "return button restores the 3D viewport (scrollY 0)");

  if (ignoredEmbedErrors.length > 0) {
    console.log(`[info] ignored ${ignoredEmbedErrors.length} Bilibili iframe telemetry errors`);
  }
  failIf(
    consoleErrors.length > 0,
    `no console errors: ${consoleErrors.join(" | ")}`,
  );
  failIf(pageErrors.length > 0, `no page errors: ${pageErrors.join(" | ")}`);
  failIf(
    failedRequests.length > 0,
    `no failed requests: ${failedRequests.join(" | ")}`,
  );

  for (const name of [
    "archive-00-hero.png",
    "archive-01-team.png",
    "archive-02-units.png",
    "archive-03-join.png",
    "archive-04-return.png",
  ]) {
    const details = await stat(path.join(outputDirectory, name));
    failIf(
      details.size < 40_000,
      `${name} looks non-blank (${details.size} bytes)`,
    );
  }

  await context.close();

  // ---------------- 移动端: 不启动 3D, 直接滚入档案 ----------------
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  const directArchiveUrl = new URL(targetUrl);
  directArchiveUrl.searchParams.set("view", "archive");
  await mobilePage.goto(directArchiveUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await mobilePage.waitForTimeout(2_500);
  const mobileChecks = await mobilePage.evaluate(() => ({
    demoHandle: window.__ENTERPRIZE_DEMO__,
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    archiveActive: document
      .querySelector("#unit-site")
      ?.classList.contains("is-archive-active"),
    navHidden:
      getComputedStyle(document.querySelector("#archive-nav")).display ===
      "none",
  }));
  failIf(
    mobileChecks.demoHandle !== undefined,
    "mobile direct archive route does not boot the 3D demo",
  );
  failIf(!mobileChecks.documentMode, "mobile direct archive route enters document mode");
  failIf(!mobileChecks.archiveActive, "mobile archive background activates");
  failIf(!mobileChecks.navHidden, "chapter nav hidden on mobile");

  await mobilePage.evaluate(() => document.fonts?.ready);
  const mobileHeroTitle = mobilePage.locator(".archive-hero__title");
  await mobileHeroTitle.scrollIntoViewIfNeeded();
  await mobilePage.waitForTimeout(800);
  await mobileHeroTitle.scrollIntoViewIfNeeded();
  await mobilePage.waitForTimeout(400);
  await mobilePage.screenshot({
    path: path.join(outputDirectory, "archive-mobile-hero.png"),
  });
  const mobileHero = await mobilePage.evaluate(() => {
    const el = document.querySelector(".archive-hero__title");
    const rect = el.getBoundingClientRect();
    return {
      revealed: el.closest(".reveal")?.classList.contains("is-in") ?? false,
      fits: rect.width <= window.innerWidth && rect.left >= 0,
    };
  });
  failIf(!mobileHero.revealed, "mobile hero title revealed without 3D boot");
  failIf(!mobileHero.fits, "mobile hero title fits the viewport width");

  await mobilePage.evaluate(() => {
    document
      .getElementById("archive-return")
      .scrollIntoView({ behavior: "instant" });
  });
  await mobilePage.waitForTimeout(1_000);
  await mobilePage.screenshot({
    path: path.join(outputDirectory, "archive-mobile-return.png"),
  });
  const mobileReturn = await mobilePage.evaluate(() => {
    const button = document.querySelector("[data-action='return-arena']");
    const rect = button.getBoundingClientRect();
    return (
      rect.width <= window.innerWidth &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth + 1
    );
  });
  failIf(!mobileReturn, "mobile return button fits the viewport");
  failIf(mobileErrors.length > 0, `no mobile page errors: ${mobileErrors.join(" | ")}`);
  await mobileContext.close();
} finally {
  await browser.close();
}

console.log(`\nScreenshots: ${outputDirectory}`);
if (failures.length) {
  throw new Error(`Archive verification failed:\n${failures.join("\n")}`);
}
console.log("\nArchive verification passed.");
