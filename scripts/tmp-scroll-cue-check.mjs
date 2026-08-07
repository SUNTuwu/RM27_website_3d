import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Edge not found");

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => window.__ENTERPRIZE_DEMO__?.state === "explore",
  null,
  { timeout: 120_000 },
);

const sample = () =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll("#scroll-cue-lines i")];
    const meteors = lines.map((el) => {
      const cs = getComputedStyle(el, "::before");
      return {
        opacity: Number(parseFloat(cs.opacity).toFixed(2)),
        top: Math.round(parseFloat(cs.top)),
      };
    });
    const text = document.querySelector("#scroll-cue-text");
    const ts = getComputedStyle(text);
    const anims = document
      .getAnimations()
      .filter((a) => a.animationName?.startsWith("scroll-cue"))
      .map((a) => ({
        name: a.animationName,
        currentTime: Math.round(a.currentTime ?? -1),
      }));
    return {
      textOpacity: Number(parseFloat(ts.opacity).toFixed(2)),
      meteors,
      anims,
    };
  });

const results = [];
for (let i = 0; i < 11; i += 1) {
  results.push({ tMs: i * 350, ...(await sample()) });
  await page.waitForTimeout(350);
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
