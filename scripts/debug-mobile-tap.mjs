// Debug: why does the scrub-state tap on the robot proxy miss on mobile?
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl = process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5174/";
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

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await mobile.newPage();
const cdp = await mobile.newCDPSession(page);

page.on("console", (msg) => console.log("[page]", msg.text()));

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, { timeout: 90_000 });
await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, { timeout: 60_000 });

// straight into scan to reach scrub quickly
await page.evaluate(() => {
  // simulate the wheel path for speed
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
});
await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, { timeout: 60_000 });
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const pos = window.__ENTERPRIZE_DEMO__?.robotScreenPosition();
  const el = pos ? document.elementFromPoint(pos.x, pos.y) : null;
  const describe = (n) =>
    n ? `${n.tagName}#${n.id || ""}.${String(n.className?.baseVal ?? n.className ?? "").slice(0, 60)}` : "null";
  const chain = [];
  let cur = el;
  while (cur && chain.length < 5) {
    chain.push(describe(cur));
    cur = cur.parentElement;
  }
  return { pos, hit: describe(el), chain, vw: window.innerWidth, vh: window.innerHeight };
});
console.log(JSON.stringify(info, null, 2));

if (info.pos && !info.pos.behind) {
  const x = Math.round(info.pos.x);
  const y = Math.round(info.pos.y);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__?.state,
    focusMode: window.__ENTERPRIZE_DEMO__?.focusMode,
  }));
  console.log("after tap:", JSON.stringify(after));

  // compare with a synthetic mouse click at the same point
  if (after.focusMode === "idle") {
    await page.mouse.click(x, y);
    await page.waitForTimeout(1500);
    const afterMouse = await page.evaluate(() => ({
      state: window.__ENTERPRIZE_DEMO__?.state,
      focusMode: window.__ENTERPRIZE_DEMO__?.focusMode,
    }));
    console.log("after mouse click:", JSON.stringify(afterMouse));
  }
}

await browser.close();
