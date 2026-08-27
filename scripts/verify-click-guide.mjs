// EXPLORE 点击引导圈 + SPACE 键提示的定向验证。
// 前置: dev server 已在 ENTERPRIZE_URL (默认 http://127.0.0.1:5173/) 运行。
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const targetUrl =
  process.env.ENTERPRIZE_URL ?? process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve("shots");
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

const guideProbe = () => {
  const el = document.querySelector(".pulse-guide");
  const keyHints = document.querySelector(".key-hints");
  const rect = el.getBoundingClientRect();
  const keyRect = keyHints.getBoundingClientRect();
  return {
    guideVisible: el.classList.contains("is-visible"),
    guideCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    keyHintOpacity: Number(getComputedStyle(keyHints).opacity),
    keyHintRect: { left: keyRect.left, bottom: window.innerHeight - keyRect.bottom },
    keyText: keyHints.textContent.replace(/\s+/g, " ").trim(),
    spaceKeyFontSize: Number(
      getComputedStyle(document.querySelector("#key-space .key-hint__key")).fontSize.replace("px", ""),
    ),
  };
};

try {
  const viewW = 1280;
  const viewH = 800;
  const context = await browser.newContext({
    viewport: { width: viewW, height: viewH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(
    () => window.__ENTERPRIZE_DEMO__?.state === "explore",
    null,
    { timeout: 30_000 },
  );
  console.log("[ok] reached EXPLORE");

  await page.waitForTimeout(700); // 等 SPACE 键提示 0.5s 淡入完成

  // 刚进入 EXPLORE: 引导圈未出现, SPACE 键提示可见
  const initial = await page.evaluate(guideProbe);
  failIf(initial.guideVisible, "guide hidden right after entering EXPLORE");
  failIf(initial.keyHintOpacity < 0.9, "key hint visible in EXPLORE");
  failIf(!initial.keyText.includes("SPACE"), "key hint contains SPACE");
  failIf(
    !initial.keyText.includes("SWITCH") || !initial.keyText.includes("切换"),
    `key hint action text: "${initial.keyText}"`,
  );
  failIf(!initial.keyText.includes("LEFT"), "key hint contains LEFT");
  failIf(!initial.keyText.includes("RIGHT"), "key hint contains RIGHT");
  failIf(
    !initial.keyText.includes("前一个") || !initial.keyText.includes("下一个"),
    "LEFT/RIGHT annotated as prev/next",
  );
  failIf(
    Math.abs(initial.spaceKeyFontSize - 30) > 1,
    `SPACE key is 3x size (${initial.spaceKeyFontSize}px)`,
  );
  failIf(initial.keyHintRect.left > 80, "key hint anchored at bottom-left");

  // 闲置超过 5s: 引导圈出现, 位置在点云中心投影附近 (左偏构图, 屏幕左半区)
  await page.waitForTimeout(5_800);
  const idle = await page.evaluate(guideProbe);
  failIf(!idle.guideVisible, "guide appears after 5s idle");
  failIf(
    idle.guideCenter.x < viewW * 0.15 || idle.guideCenter.x > viewW * 0.65,
    `guide x in left-biased area: ${idle.guideCenter.x.toFixed(0)}px`,
  );
  failIf(
    idle.guideCenter.y < viewH * 0.2 || idle.guideCenter.y > viewH * 0.85,
    `guide y in central band: ${idle.guideCenter.y.toFixed(0)}px`,
  );
  await page.screenshot({ path: path.join(outputDirectory, "guide-explore.png") });

  // 点击点云: 引导圈收起, 状态保持 EXPLORE
  await page.mouse.click(idle.guideCenter.x, idle.guideCenter.y);
  await page.waitForTimeout(300);
  const afterClick = await page.evaluate(guideProbe);
  failIf(afterClick.guideVisible, "guide hides immediately after click");
  failIf(
    (await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state)) !== "explore",
    "state stays EXPLORE after click",
  );

  // 再闲置 5s: 引导圈再次出现
  await page.waitForTimeout(5_600);
  const reappeared = await page.evaluate(guideProbe);
  failIf(!reappeared.guideVisible, "guide reappears after another 5s idle");

  // SPACE 切换模型: 状态保持 EXPLORE, 面板索引变化
  const indexBefore = await page.evaluate(
    () => document.querySelector("#explore-index").textContent,
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const indexAfter = await page.evaluate(
    () => document.querySelector("#explore-index").textContent,
  );
  failIf(indexBefore === indexAfter, `SPACE switches model (${indexBefore} -> ${indexAfter})`);
  failIf(
    (await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state)) !== "explore",
    "state stays EXPLORE after SPACE",
  );

  // 按键方块可点击: SPACE 按钮 = 上一款, RIGHT 按钮 = 下一款
  const readIndex = () =>
    page.evaluate(() => document.querySelector("#explore-index").textContent);
  const waitForExploreSwitch = () =>
    page.waitForFunction(
      () => window.__ENTERPRIZE_DEMO__?.exploreTransitioning === false,
      null,
      { timeout: 20_000 },
    );
  await waitForExploreSwitch();
  const beforeSpaceBtn = await readIndex();
  await page.click("#key-space");
  await page.waitForFunction(
    (before) => document.querySelector("#explore-index").textContent !== before,
    beforeSpaceBtn,
    { timeout: 2_000 },
  );
  const afterSpaceBtn = await readIndex();
  failIf(
    beforeSpaceBtn === afterSpaceBtn,
    `SPACE button switches model (${beforeSpaceBtn} -> ${afterSpaceBtn})`,
  );
  await waitForExploreSwitch();
  const beforeNextBtn = await readIndex();
  await page.click("#key-next");
  await page.waitForFunction(
    (before) => document.querySelector("#explore-index").textContent !== before,
    beforeNextBtn,
    { timeout: 2_000 },
  );
  const afterNextBtn = await readIndex();
  failIf(
    beforeNextBtn === afterNextBtn,
    `RIGHT button switches model (${beforeNextBtn} -> ${afterNextBtn})`,
  );
  const beforePrevBtn = afterNextBtn;
  await waitForExploreSwitch();
  await page.click("#key-prev");
  await page.waitForFunction(
    (before) => document.querySelector("#explore-index").textContent !== before,
    beforePrevBtn,
    { timeout: 2_000 },
  );
  const afterPrevBtn = await readIndex();
  failIf(
    beforePrevBtn === afterPrevBtn,
    `LEFT button switches model (${beforePrevBtn} -> ${afterPrevBtn})`,
  );
  await waitForExploreSwitch();
  await page.screenshot({ path: path.join(outputDirectory, "guide-after-space.png") });

  failIf(pageErrors.length > 0, `no page errors: ${pageErrors.join(" | ")}`);
  await context.close();
} finally {
  await browser.close();
}

console.log(`\nScreenshots: ${outputDirectory}`);
if (failures.length) {
  throw new Error(`Click guide verification failed:\n${failures.join("\n")}`);
}
console.log("\nClick guide verification passed.");
