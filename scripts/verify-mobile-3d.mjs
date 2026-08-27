// Mobile 3D flow check: touch gestures drive the state machine.
// explore (swipe up -> SCAN) -> scrub (vertical swipe drives TIMELINE_0) -> focus (swipe up exits)
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

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let cdp;
async function swipe(x0, y0, x1, y1, steps = 12) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0, id: 1 }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 },
      ],
    });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function tap(x, y) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

try {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await mobile.newPage();
  cdp = await mobile.newCDPSession(page);

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready, null, {
    timeout: 90_000,
  });
  check("boot: demo ready on mobile", true);

  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
    timeout: 60_000,
  });
  check("intro launch -> explore", true);

  const hint = await page.evaluate(() => document.querySelector("#hint-text")?.textContent ?? "");
  check("explore hint uses touch wording", hint.includes("SWIPE UP") && hint.includes("TAP"), hint);

  // SwiftShader context has devicePixelRatio=2; coarse-pointer cap should clamp to 1.5
  const pr = await page.evaluate(() => {
    const canvas = document.querySelector("#scene-canvas");
    return canvas.width / canvas.clientWidth;
  });
  check("renderer pixel ratio capped at 1.5", Math.abs(pr - 1.5) < 0.01, `actual=${pr}`);

  // swipe up -> SCAN (assets may still be preparing; scan is brief; final state is scrub)
  await swipe(195, 620, 195, 260);
  await page.waitForFunction(
    () => ["scan", "scrub"].includes(window.__ENTERPRIZE_DEMO__?.state),
    null,
    { timeout: 60_000 },
  );
  check("swipe up in explore triggers scan", true);

  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
    timeout: 60_000,
  });
  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-mobile-scrub.png") });

  // tap robot -> FOCUS, then swipe up exits.
  // 竖屏下机器人锚点在部分时间轴区间位于视口外, 先用竖滑推进时间轴直到入画
  let target = null;
  for (let i = 0; i < 10; i += 1) {
    target = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.robotScreenPosition());
    if (
      target &&
      !target.behind &&
      target.x > 40 &&
      target.x < 350 &&
      target.y > 80 &&
      target.y < 700
    ) {
      break;
    }
    target = null;
    const st = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (st !== "scrub") break;
    await swipe(195, 620, 195, 460, 8);
    await page.waitForTimeout(320);
  }
  if (target) {
    await tap(Math.round(target.x), Math.round(target.y));
    await page.waitForTimeout(1200);
  }
  const focusMode = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.focusMode);
  if (focusMode && focusMode !== "idle") {
    check("tap robot enters focus", true, `mode=${focusMode}`);
    await swipe(195, 620, 195, 300);
    await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
      timeout: 15_000,
    });
    check("swipe up exits focus", true);
  } else {
    check("tap robot enters focus", false, `mode=${focusMode} (proxy may have missed, recheck manually)`);
  }

  // vertical swipe drives the timeline (stop early if archive mode engages)
  const before = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0);
  for (let i = 0; i < 6; i += 1) {
    const st = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
    if (st !== "scrub") break;
    await swipe(195, 620, 195, 420, 8);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(600);
  const after = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__?.timelineProgress ?? 0,
  );
  check("vertical swipe drives timeline", after > before, `progress ${before.toFixed(3)} -> ${after.toFixed(3)}`);

  // timeline 完成后上滑会进入档案模式; 若是则先回到时间轴
  const stateAfterDrive = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.state);
  if (stateAfterDrive === "end") {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scrub", null, {
      timeout: 15_000,
    });
  }

  // horizontal drag = look-around gesture (assert the look-around controller engages)
  await swipe(80, 500, 320, 490, 10);
  await page.waitForTimeout(400);
  const lookMode = await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.lookAroundMode);
  check(
    "horizontal drag engages look-around (not timeline)",
    typeof lookMode === "string" && lookMode !== "idle",
    `mode=${lookMode}`,
  );

  await page.screenshot({ timeout: 60000, path: path.join(outputDirectory, "check-mobile-final.png") });
  await mobile.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
