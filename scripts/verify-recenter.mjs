import { chromium } from "playwright-core";

const EDGE =
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE:", msg.text());
});
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

for (const wait of [10000, 20000, 40000]) {
  await page.waitForTimeout(wait);
  const info = await page.evaluate(() => ({
    state: document.querySelector("#app")?.dataset.state,
    demo: window.__ENTERPRIZE_DEMO__
      ? { ready: window.__ENTERPRIZE_DEMO__.ready, state: window.__ENTERPRIZE_DEMO__.state }
      : null,
  }));
  console.log("probe:", JSON.stringify(info));
  await page.screenshot({ path: `shots/probe-${wait}.png` });
  if (info.state === "explore") break;
}

// 快进到 explore: boot -> assemble -> explore
await page.waitForFunction(
  () => document.querySelector("#app")?.dataset.state === "explore",
  null,
  { timeout: 300000, polling: 500 },
);
await page.waitForTimeout(1500);

// 切换到 ROBOT_1, 捕捉过渡中段与结束帧
await page.click("#explore-next");
await page.waitForTimeout(900);
await page.screenshot({ path: "shots/recenter-mid.png" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "shots/recenter-after.png" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "shots/recenter-after2.png" });

await browser.close();
console.log("done");
