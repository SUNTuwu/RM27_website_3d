// 验证: 多目标 FOCUS (红蓝机器人点击引导圈 + 点击进入 FOCUS + 每机器人独立幻灯片)
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5175";
const outDir =
  process.env.ENTERPRIZE_VERIFY_DIR ??
  path.join(os.tmpdir(), "enterprize-focus-verify");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

await page.waitForSelector("#intro-root button", { timeout: 120_000 });
await page.click("#intro-root button");
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "explore",
  null,
  { timeout: 120_000 },
);
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 600);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "scrub",
  null,
  { timeout: 60_000 },
);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1500);

// scrub 中 timeline 自动播放相机会持续移动: 点击前必须取实时投影坐标
async function readTarget(key) {
  const targets = await page.evaluate(() =>
    window.__ENTERPRIZE_DEMO__.focusTargetScreenPositions(),
  );
  console.log(
    "[targets]",
    JSON.stringify(
      targets.map((t) => ({ key: t.key, x: Math.round(t.x), y: Math.round(t.y) })),
    ),
  );
  return targets.find((t) => t.key === key && !t.behind);
}
await page.screenshot({ path: path.join(outDir, "scrub-guides.png") });

const hero = await readTarget("hero");
if (hero) {
  await page.mouse.click(hero.x, hero.y);
  const entered = await page
    .waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "focus",
      null,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  console.log("[click hero -> focus]", entered);

  if (!entered) {
    // 兜底: 直接在 canvas 上派发 pointer 事件, 区分是事件没到 canvas 还是射线未命中
    await page.evaluate((p) => {
      const canvas = document.querySelector("#scene-canvas");
      const opts = {
        clientX: p.x,
        clientY: p.y,
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
        isPrimary: true,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opts));
      canvas.dispatchEvent(new PointerEvent("pointerup", opts));
    }, hero);
    await page.waitForTimeout(3000);
    console.log(
      "[direct dispatch state]",
      await page.evaluate(() => window.__ENTERPRIZE_DEMO__.state),
    );
  }

  if (entered) {
    await page.waitForTimeout(3500); // 等进入动画完成
    const media = await page.evaluate(() => ({
      title: document.querySelector("#focus-title")?.textContent,
      index: document.querySelector("#focus-index")?.textContent,
      img: document.querySelector("#focus-image")?.getAttribute("src"),
      unit: document.querySelector(".focus-panel__name-main")?.textContent,
      cn: document.querySelector(".focus-panel__cn")?.textContent,
    }));
    console.log("[focus media]", JSON.stringify(media));
    await page.screenshot({ path: path.join(outDir, "focus-hero.png") });

    // 退出 FOCUS (滚轮) -> 点击红方 sentry
    await page.mouse.wheel(0, 400);
    await page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.state === "scrub",
      null,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(2500);
    const sentryRed = await readTarget("sentry-red");
    if (sentryRed) {
      await page.mouse.click(sentryRed.x, sentryRed.y);
      const enteredRed = await page
        .waitForFunction(
          () => window.__ENTERPRIZE_DEMO__?.state === "focus",
          null,
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);
      console.log("[click sentry-red -> focus]", enteredRed);
      if (enteredRed) {
        await page.waitForTimeout(3500);
        const mediaRed = await page.evaluate(() => ({
          title: document.querySelector("#focus-title")?.textContent,
          index: document.querySelector("#focus-index")?.textContent,
          img: document.querySelector("#focus-image")?.getAttribute("src"),
          unit: document.querySelector(".focus-panel__name-main")?.textContent,
          cn: document.querySelector(".focus-panel__cn")?.textContent,
        }));
        console.log("[focus media red]", JSON.stringify(mediaRed));
        await page.screenshot({ path: path.join(outDir, "focus-sentry-red.png") });
      }
    }
  }
}

await browser.close();
console.log("[ok] done ->", outDir);
