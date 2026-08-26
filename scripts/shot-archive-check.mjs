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
  await page.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document.documentElement.classList.add("is-document-mode");
    window.dispatchEvent(new Event("enterprize:zoom-activate"));
    document.querySelector("#unit-site")?.classList.add("is-archive-active");
    for (const sel of ["#loading-screen", "#mobile-screen", ".explore-panel"]) {
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
      140;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDirectory, `check-${name}-hero-fold.png`) });

  // 影像记录标题
  await page.evaluate(() => {
    const y =
      document.querySelector("#archive-media").getBoundingClientRect().top +
      window.scrollY -
      24;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDirectory, `check-${name}-media-head.png`) });

  // 影像记录底部 (原 ::after 渐变处)
  await page.evaluate(() => {
    const el = document.querySelector(".archive-media__grid");
    const y = el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 120;
    window.scrollTo(0, y);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outputDirectory, `check-${name}-media-bottom.png`) });

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
  await page.screenshot({ path: path.join(outputDirectory, `check-${name}-steps.png`) });
}

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await desktop.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
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
  await mpage.waitForTimeout(2500); // 移动端降级, 无 3D boot
  await mpage.evaluate(() => {
    document.documentElement.classList.remove("is-scroll-locked");
    document.documentElement.classList.add("is-document-mode");
    document.querySelector("#unit-site")?.classList.add("is-archive-active");
    for (const sel of ["#loading-screen", "#mobile-screen", ".explore-panel"]) {
      const el = document.querySelector(sel);
      if (el) el.style.display = "none";
    }
  });
  await mpage.waitForTimeout(800);
  await shoot(mpage, "mobile");
  await mobile.close();
} finally {
  await browser.close();
}

console.log("done");
