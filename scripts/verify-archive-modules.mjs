// 聚焦校验 2D 档案页新增模块:
//   1) 兵种图文揭示 (GIF 随滚动裁切展开 + 悬停跟随大图)
//   2) BACK TO THE ARENA 两侧半透明大字 (滚动向外扩散)
// 直接解锁滚动并跳转, 不驱动完整 3D 时间轴 (3D 流程由 verify-visual.mjs 覆盖)。
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "shots",
  "archive-modules",
);
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

// 滚动到目标元素使其顶边落在视口 targetViewportTop 处。
// 懒加载资源会撑高文档, 几何在滚动后仍会变, 故按实时 rect 迭代逼近。
async function scrollToElement(page, selector, targetViewportTop) {
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const delta = await page.evaluate(
      ({ sel, top }) => {
        const el = document.querySelector(sel);
        if (!el) return 0;
        const rectTop = el.getBoundingClientRect().top;
        window.scrollTo(0, window.scrollY + rectTop - top);
        return Math.abs(rectTop - top);
      },
      { sel: selector, top: targetViewportTop },
    );
    await page.waitForTimeout(400);
    if (delta < 4) break;
  }
}

// 轮询断言: 大体积 GIF 解码会间歇占用主线程, 固定等待不可靠
async function waitFor(page, fn, arg, timeout = 9000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 200 });
    return true;
  } catch {
    return false;
  }
}

async function waitAssetsSettled(page) {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("#unit-site img")].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      null,
      { timeout: 45_000, polling: 500 },
    )
    .catch(() => {});
}

// ---------- 桌面端 ----------
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
await desktop.goto(targetUrl, { waitUntil: "load" });
await desktop.waitForSelector("[data-unit-reveal]");
await desktop.waitForTimeout(2000);
await waitAssetsSettled(desktop);

// 进入初期: GIF 应处于收拢/半展开状态
await scrollToElement(desktop, "[data-unit-reveal]", 820);
const earlyCollapsed = await waitFor(desktop, () =>
  [...document.querySelectorAll(".unit-reveal__media")].every((m) => m.offsetWidth <= 10),
);
failIf(
  !earlyCollapsed,
  "reveal GIFs start collapsed when lines are below the fold",
);
await desktop.screenshot({ path: path.join(outputDirectory, "01-reveal-enter.png") });

// 模块居中: 各行按进入先后依次展开 (scrub 级联效果, 截图存档)
await scrollToElement(desktop, "[data-unit-reveal]", 180);
await desktop.screenshot({ path: path.join(outputDirectory, "02-reveal-open.png") });

// 最后一行越过 30% 视口后, 全部 GIF 应完全展开
await scrollToElement(
  desktop,
  ".unit-reveal__line:nth-child(3) .unit-reveal__media",
  270,
);
const desktopMax = 273; // clamp(100px, 19vw, 290px) @1440px
const allOpen = await waitFor(desktop, (max) =>
  [...document.querySelectorAll(".unit-reveal__media")].every((m) => m.offsetWidth >= max * 0.92),
  desktopMax,
);
const finalWidths = await desktop.evaluate(() =>
  [...document.querySelectorAll(".unit-reveal__media")].map((m) => m.offsetWidth),
);
failIf(
  !allOpen,
  `reveal GIFs fully expand when centered (widths: ${finalWidths.join(",")})`,
);

// 悬停跟随大图 (先滚回第一行, 确保目标在视口内)
await scrollToElement(
  desktop,
  ".unit-reveal__line:nth-child(1) .unit-reveal__media",
  320,
);
const firstMedia = await desktop.locator(".unit-reveal__media").first();
const mediaBox = await firstMedia.boundingBox();
if (mediaBox) {
  await desktop.mouse.move(mediaBox.x + mediaBox.width / 2, mediaBox.y + mediaBox.height / 2);
  await desktop.waitForTimeout(700);
}
const followerOn = await waitFor(desktop, () =>
  document.querySelector("#unit-reveal-follower")?.classList.contains("is-on") ?? false,
  null,
  4000,
);
failIf(!followerOn, "hover follower activates over reveal GIF");
await desktop.screenshot({ path: path.join(outputDirectory, "03-reveal-follower.png") });

// RETURN 大字: 半展开与完全展开
await scrollToElement(desktop, "#archive-return", 640);
const midSpread = await waitFor(desktop, () => {
  const o = Number(getComputedStyle(document.querySelector('[data-ghost="left"]')).opacity);
  return o > 0.05 && o < 1;
});
const midOpacityValue = await desktop.evaluate(() =>
  Number(getComputedStyle(document.querySelector('[data-ghost="left"]')).opacity),
);
failIf(
  !midSpread,
  `ghost words mid-spread while scrolling (opacity: ${midOpacityValue})`,
);
await desktop.screenshot({ path: path.join(outputDirectory, "04-return-partial.png") });

await scrollToElement(desktop, "#archive-return", 120);
const ghostFull = await waitFor(desktop, () =>
  Number(getComputedStyle(document.querySelector('[data-ghost="left"]')).opacity) >= 0.95,
);
const ghostState = await desktop.evaluate(() => {
  const left = document.querySelector('[data-ghost="left"]');
  const right = document.querySelector('[data-ghost="right"]');
  return {
    opacity: Number(getComputedStyle(left).opacity),
    leftTransform: left.style.transform,
    rightTransform: right.style.transform,
  };
});
failIf(!ghostFull, `ghost words fully visible at RETURN (opacity: ${ghostState.opacity})`);
failIf(
  !ghostState.leftTransform.includes("translate3d") || !ghostState.rightTransform.includes("translate3d"),
  "ghost words carry scrub transforms",
);
await desktop.screenshot({ path: path.join(outputDirectory, "05-return-full.png") });

const overflow = await desktop.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
failIf(overflow > 1, `no horizontal overflow (excess: ${overflow}px)`);

await desktop.close();

// ---------- 移动端 ----------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
await mobile.goto(targetUrl, { waitUntil: "load" });
await mobile.waitForSelector("[data-unit-reveal]");
await mobile.waitForTimeout(2000);
await waitAssetsSettled(mobile);

await scrollToElement(
  mobile,
  ".unit-reveal__line:nth-child(3) .unit-reveal__media",
  260,
);
const mobileMax = 100; // clamp(100px, 19vw, 290px) @390px 触底 100px
const mobileAllOpen = await waitFor(mobile, (max) =>
  [...document.querySelectorAll(".unit-reveal__media")].every((m) => m.offsetWidth >= max * 0.92),
  mobileMax,
);
const mobileFinalWidths = await mobile.evaluate(() =>
  [...document.querySelectorAll(".unit-reveal__media")].map((m) => m.offsetWidth),
);
failIf(
  !mobileAllOpen,
  `mobile reveal GIFs expand (widths: ${mobileFinalWidths.join(",")})`,
);
await mobile.screenshot({ path: path.join(outputDirectory, "06-mobile-reveal.png") });

await scrollToElement(mobile, "#archive-return", 240);
await mobile.screenshot({ path: path.join(outputDirectory, "07-mobile-return.png") });

const mobileOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
failIf(mobileOverflow > 1, `mobile: no horizontal overflow (excess: ${mobileOverflow}px)`);

await mobile.close();
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} archive-module check(s) failed`);
  process.exit(1);
}
console.log("\nAll archive-module checks passed");
