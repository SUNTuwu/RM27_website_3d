// 临时校验脚本: 强制进入档案模式, 截图 HERO 上沿折线与入队航线时间线
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5174/";
const outputDirectory = path.resolve("shots");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Edge not found");

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

async function enterArchive(page) {
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
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
    document.querySelector("#unit-site")?.classList.add("is-archive-active");
    for (const sel of ["#loading-screen", ".explore-panel"]) {
      const el = document.querySelector(sel);
      if (el) el.style.display = "none";
    }
  });
  await page.waitForTimeout(800);
}

async function shoot(page, name) {
  // 等待图集/媒体加载导致的布局位移稳定
  await page.waitForTimeout(2000);

  // HERO 上沿: 滚动到 hero 上方 140px 处, 让折线入画
  await page.evaluate(() => {
    const y =
      document.querySelector("#archive-hero").getBoundingClientRect().top +
      window.scrollY -
      Math.round(window.innerHeight * 0.45);
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, `check-${name}-hero-fold.png`) });

  // 影像记录标题
  await page.evaluate(() => {
    const y =
      document.querySelector("#archive-media").getBoundingClientRect().top +
      window.scrollY -
      24;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, `check-${name}-media-head.png`) });

  // 影像记录底部 (原 ::after 渐变处)
  await page.evaluate(() => {
    const el = document.querySelector(".archive-media__grid");
    const y = el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 120;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, `check-${name}-media-bottom.png`) });

  // 入队航线时间线
  await page.evaluate(() => {
    const el = document.querySelector(".archive-steps");
    const y =
      el.getBoundingClientRect().top +
      window.scrollY -
      (window.innerHeight - el.offsetHeight) / 2;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, `check-${name}-steps.png`) });
}

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await desktop.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  // ---------- 起始界面: 打字 -> 按钮 -> 跃迁 ----------
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1400); // 打字中段
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-intro-typing.png") });
  await page.mouse.click(720, 450); // 点击跳过打字
  await page.waitForTimeout(1100); // 按钮弹出
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-intro-button.png") });
  await page.click("#intro-root button");
  await page.waitForTimeout(800); // 跃迁中段: 星线后掠 + 眩光
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-intro-warp.png") });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-intro-explore.png") });

  await enterArchive(page);
  await shoot(page, "desktop");
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await mpage.goto(targetUrl, { waitUntil: "domcontentloaded" });

  // ---------- 移动端也跑完整 3D: 起始界面 -> 启航 -> EXPLORE ----------
  await mpage.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
    timeout: 90_000,
  });
  await mpage.waitForTimeout(1400);
  await mpage.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-mobile-intro-typing.png") });
  await mpage.evaluate(() => document.querySelector("#intro-root")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await mpage.waitForTimeout(1100);
  await mpage.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-mobile-intro-button.png") });
  await mpage.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await mpage.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
    timeout: 60_000,
  });
  await mpage.waitForTimeout(800);
  await mpage.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-mobile-explore.png") });

  await enterArchive(mpage);
  await shoot(mpage, "mobile");
  await mobile.close();
} finally {
  await browser.close();
}

console.log("done");
