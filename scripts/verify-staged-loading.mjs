import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const targetUrl =
  process.argv[2] ?? process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173/";
const edgeCandidates = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) {
  throw new Error("Microsoft Edge was not found");
}

let releaseModelRequests;
const modelGate = new Promise((resolve) => {
  releaseModelRequests = resolve;
});
const requests = [];
const pageErrors = [];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("request", (request) => requests.push(request.url()));
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/assets/models/**", async (route) => {
  await modelGate;
  await route.continue();
});

function check(condition, message, detail) {
  if (!condition) {
    throw new Error(
      `${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
  console.log(`[ok] ${message}`);
}

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Boot reaches the P1 fetch phase and then stalls on the gated model routes.
  await page.waitForFunction(
    () => performance.getEntriesByName("enterprize:p1-start").length > 0,
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1_000);
  const gatedSnapshot = await page.evaluate(() => ({
    demoReady: window.__ENTERPRIZE_DEMO__?.ready === true,
    loadedAssetKeys: window.__ENTERPRIZE_DEMO__?.loadedAssetKeys ?? [],
    deferredAssetsReady:
      window.__ENTERPRIZE_DEMO__?.deferredAssetsReady ?? false,
  }));
  check(
    requests.some((url) => url.includes("/assets/pointcloud/arena_points.bin")),
    "P0 requests the precomputed arena point cloud",
  );
  check(
    !gatedSnapshot.demoReady && gatedSnapshot.loadedAssetKeys.length === 0,
    "boot holds ARENA READY while P1 glTF assets are gated",
    gatedSnapshot,
  );

  releaseModelRequests();
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.ready === true, null, {
    timeout: 120_000,
  });
  const bootSnapshot = await page.evaluate(() => ({
    state: window.__ENTERPRIZE_DEMO__.state,
    loadedAssetKeys: window.__ENTERPRIZE_DEMO__.loadedAssetKeys,
    deferredAssetsReady: window.__ENTERPRIZE_DEMO__.deferredAssetsReady,
  }));
  check(
    bootSnapshot.deferredAssetsReady &&
      ["arena", "timeline", "hero", "engineer", "infantry", "sentry"].every(
        (key) => bootSnapshot.loadedAssetKeys.includes(key),
      ),
    "boot completes the full P1 glTF warmup before ARENA READY",
    bootSnapshot,
  );
  check(
    !requests.some((url) => url.includes("/assets/images/hero/arena-fleet.webp")),
    "FOCUS media is not requested during BOOT or ASSEMBLE",
  );

  await page.evaluate(() => window.__ENTERPRIZE_DEMO__?.launchIntro());
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "explore", null, {
    timeout: 45_000,
  });
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => window.__ENTERPRIZE_DEMO__?.state === "scan", null, {
    timeout: 30_000,
  });
  const arenaSymmetryBefore = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.arenaSymmetry,
  );
  await page.waitForTimeout(300);
  const loadedAssetKeys = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.loadedAssetKeys,
  );
  check(
    ["arena", "timeline", "hero", "engineer", "infantry", "sentry"].every((key) =>
      loadedAssetKeys.includes(key),
    ),
    "P1 prepares arena, timeline, and the robot squad before SCAN",
  );
  check(
    !requests.some((url) => url.includes("/assets/images/hero/arena-fleet.webp")),
    "FOCUS media remains deferred until a robot is selected",
  );
  const arenaSymmetry = await page.evaluate(
    () => window.__ENTERPRIZE_DEMO__.arenaSymmetry,
  );
  check(
    requests.filter((url) =>
      url.includes("/assets/models/arena/arena_half_blue.gltf"),
    ).length === 1,
    "the canonical blue half-arena glTF is requested once",
  );
  check(
    !requests.some((url) =>
      url.includes("/assets/models/arena/arena_static.gltf"),
    ) &&
      !requests.some((url) =>
        url.includes("/assets/models/arena/arena.gltf"),
      ),
    "the removed full-arena glTF files are never requested",
  );
  check(
    arenaSymmetry?.halfCount === 2 &&
      arenaSymmetry.rotationAxis === "y" &&
      Math.abs(arenaSymmetry.rotationRadians - Math.PI) < 1e-6,
    "the red half rotates 180 degrees around the runtime vertical axis",
  );
  check(
    arenaSymmetry?.geometryShared &&
      arenaSymmetry.texturesShared &&
      arenaSymmetry.materialsIndependent,
    "team instances share geometry/textures and isolate materials",
  );
  check(
    arenaSymmetry?.redMaterialCount >= 2 &&
      arenaSymmetry.redMaterialNames.every((name) =>
        name.startsWith("EMISSION_RED"),
      ) &&
      arenaSymmetry.redEmissiveHexes.every((color) => color === "ff294d"),
    "the reusable material variant creates the red team emissive materials",
  );
  check(
    arenaSymmetry?.mixerCount === 2 &&
      arenaSymmetry.mixerTimes.every((time) => time > 0),
    "both half-arena animation mixers are advancing",
  );
  const poseDelta = arenaSymmetry.animatedPoses[0].quaternion.reduce(
    (total, value, index) =>
      total +
      Math.abs(value - arenaSymmetryBefore.animatedPoses[0].quaternion[index]),
    0,
  );
  check(poseDelta > 1e-4, "the arena animation changes the rune node pose");
  const [bluePose, redPose] = arenaSymmetry.animatedPoses;
  check(
    bluePose.position.every(
      (value, index) => Math.abs(value - redPose.position[index]) < 1e-5,
    ) &&
      bluePose.quaternion.every(
        (value, index) => Math.abs(value - redPose.quaternion[index]) < 1e-5,
      ),
    "both team mixers preserve the same local animation pose",
  );
  check(
    Math.abs(bluePose.worldPosition[0] + redPose.worldPosition[0]) < 1e-4 &&
      Math.abs(bluePose.worldPosition[1] - redPose.worldPosition[1]) < 1e-4 &&
      Math.abs(bluePose.worldPosition[2] + redPose.worldPosition[2]) < 1e-4,
    "animated red and blue nodes remain symmetric around the world origin",
  );
  check(
    pageErrors.length === 0,
    "the staged-loading path has no page errors",
    pageErrors,
  );
} finally {
  releaseModelRequests();
  await browser.close();
}
