import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) {
  throw new Error("Microsoft Edge not found");
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.goto("http://localhost:5173", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector("#archive-hero", { timeout: 30000 });
await page.waitForTimeout(2500);

// 绕过 3D 状态机: 直接解锁滚动进入文档模式, 只验证 2D 档案区
await page.evaluate(() => {
  document.documentElement.classList.remove("is-scroll-locked");
  document.documentElement.classList.add("is-document-mode");
  document.querySelector("#app").dataset.state = "end";
});

async function shotAt(selector, name, extraScroll = 0) {
  await page.evaluate(
    ({ selector, extraScroll }) => {
      const el = document.querySelector(selector);
      const y = el.getBoundingClientRect().top + window.scrollY + extraScroll;
      window.scrollTo(0, y);
    },
    { selector, extraScroll },
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `shots/${name}.png` });
}

await shotAt("#archive-hero", "2d-hero");
await shotAt(".archive-circuit", "2d-circuit");
await shotAt(".archive-circuit", "2d-circuit-2", 900);
await shotAt("#archive-banner", "2d-banner");
await shotAt(".archive-media-row", "2d-media-row", -120);
await shotAt(".archive-depts", "2d-depts", -160);
await shotAt("[data-voices]", "2d-voices", -200);
await shotAt("[data-faq]", "2d-faq", -160);
await shotAt("#archive-return", "2d-return");

// 交互: 点击第 2 张便利贴 + 打开第 1 条 FAQ
await page.evaluate(() => {
  document.querySelectorAll(".archive-voice")[1]?.click();
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  document.querySelector("[data-voices]").scrollIntoView({ block: "center" });
});
await page.waitForTimeout(800);
await page.screenshot({ path: "shots/2d-voices-active.png" });

await page.evaluate(() => {
  document.querySelector(".archive-faq__item .archive-faq__question")?.click();
  document.querySelector("[data-faq]").scrollIntoView({ block: "center" });
});
await page.waitForTimeout(900);
await page.screenshot({ path: "shots/2d-faq-open.png" });

await browser.close();
console.log("done");
