// 验证: robot_1 移除后的 EXPLORE 列表 + SCRUB 回滚到起点渐隐重载 EXPLORE
import { chromium } from "playwright-core";

const EDGE =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = "http://127.0.0.1:5175/";

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") {
    console.log("[console.error]", msg.text());
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
  timeout: 120000,
  polling: 500,
});

// 点击启航进入 ASSEMBLE -> EXPLORE
await page.click("#intro-root button");
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__.state === "explore",
  null,
  { timeout: 300000, polling: 500 },
);
const exploreLabel = await page.textContent("#explore-index");
console.log("explore reached, index label:", exploreLabel);

// 等待 P1 资产就绪, 滚轮进入 SCAN -> SCRUB
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__.deferredAssetsReady,
  null,
  { timeout: 300000, polling: 500 },
);
await page.mouse.wheel(0, 400);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__.state === "scrub",
  null,
  { timeout: 300000, polling: 500 },
);
console.log("scrub reached");

// 回滚时间轴到起点: 反复上滚直到进度接近 0
for (let i = 0; i < 120; i += 1) {
  const progress = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.timelineProgress,
  );
  if (progress <= 0.001) {
    break;
  }
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(120);
}
console.log(
  "timeline rewound to",
  await page.evaluate(() => window.__ENTERPRIZE_DEMO__.timelineProgress),
);

// 起点处继续上滚 -> 应触发渐隐重载 (scrub -> assemble -> explore)
await page.mouse.wheel(0, -400);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__.state === "assemble",
  null,
  { timeout: 60000, polling: 200 },
);
console.log("reload triggered: state=assemble");
const fadeVisible = await page.evaluate(() =>
  document
    .querySelector("#state-fade")
    ?.classList.contains("is-visible"),
);
console.log("fade overlay still visible during assemble:", fadeVisible);
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__.state === "explore",
  null,
  { timeout: 120000, polling: 500 },
);
console.log("explore reloaded, timeline progress:", await page.evaluate(
  () => window.__ENTERPRIZE_DEMO__.timelineProgress,
));

await browser.close();
console.log("PASS: explore reload from timeline start works");
