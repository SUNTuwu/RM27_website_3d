import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:5177/";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error("Microsoft Edge was not found for Playwright verification");
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

try {
  await page.goto(`${targetUrl}#archive-coords`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => window.__ENTERPRIZE_BOOTSTRAP__?.directArchiveReady === true,
    null,
    { timeout: 60_000 },
  );
  await page.waitForSelector("[data-channel-card]", { timeout: 15_000 });
  await page.waitForTimeout(1_500);

  const cardInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-channel-card]")];
    return cards.map((card) => ({
      tag: card.tagName,
      text: card.textContent?.trim().slice(0, 60),
      hasQrThumb: Boolean(card.querySelector("img")),
    }));
  });
  console.log("[info] channel cards:", JSON.stringify(cardInfo, null, 2));

  const wechatCard = page.locator("[data-channel-card]", {
    hasText: "微信招新群",
  });
  await wechatCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/out/wechat-card.png" });

  await wechatCard.click();
  await page.waitForSelector('[role="dialog"] img', { timeout: 5_000 });
  await page.waitForTimeout(600);
  const openState = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state ?? null,
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    scrollY: window.scrollY,
  }));
  if (openState.documentMode !== true) {
    throw new Error(
      `[fail] lightbox must stay over the 2D archive: ${JSON.stringify(openState)}`,
    );
  }
  console.log("[ok] lightbox opens over the 2D archive", JSON.stringify(openState));
  await page.screenshot({ path: "scripts/out/wechat-lightbox.png" });
  console.log("[ok] lightbox opened with QR image");

  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', {
    state: "detached",
    timeout: 5_000,
  });
  const closedState = await page.evaluate(() => ({
    documentMode: document.documentElement.classList.contains("is-document-mode"),
    scrollY: window.scrollY,
  }));
  if (closedState.documentMode !== true) {
    throw new Error(
      `[fail] closing the lightbox must stay on the 2D archive: ${JSON.stringify(closedState)}`,
    );
  }
  console.log("[ok] Escape closes the lightbox back onto the 2D archive");
} finally {
  await browser.close();
}
