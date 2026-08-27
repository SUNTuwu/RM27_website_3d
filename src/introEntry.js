import "./styles.css";
import "./tailwind.css";

import { assetUrl } from "./core/assetUrl.js";
import { fetchPointCloudBuffer } from "./pointcloud/pointCloudData.js";
import { mountIntroScreen } from "./ui/introScreen";

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

const pointCloudUrl = assetUrl("pointcloud/arena_points.bin");
const bootstrap = {
  introMounted: false,
  introPainted: false,
  typingDone: false,
  pointFetchStarted: false,
  pointFetchDone: false,
  pointBytes: 0,
  runtimeImportStarted: false,
  runtimeImported: false,
};
window.__ENTERPRIZE_BOOTSTRAP__ = bootstrap;

let launchArenaScene = null;
const intro = mountIntroScreen({
  ready: false,
  onLaunch: () => launchArenaScene?.(),
});
bootstrap.introMounted = Boolean(intro);
performance.mark?.("enterprize:intro-mounted");

bootstrap.pointFetchStarted = true;
performance.mark?.("enterprize:point-fetch-start");
const pointCloudBufferPromise = fetchPointCloudBuffer(pointCloudUrl, {
  onProgress: ({ loaded }) => {
    bootstrap.pointBytes = loaded;
  },
}).then((buffer) => {
  bootstrap.pointFetchDone = true;
  bootstrap.pointBytes = buffer.byteLength;
  performance.mark?.("enterprize:point-fetch-end");
  return buffer;
});
// The runtime consumes the same promise after typing; attach a handler now so an
// early network failure is never reported as an unhandled rejection.
void pointCloudBufferPromise.catch(() => {});

async function start() {
  if (intro) {
    await waitForNextPaint();
    bootstrap.introPainted = true;
    performance.mark?.("enterprize:intro-paint-window");
    await intro.control.waitForTypingDone?.();
    bootstrap.typingDone = true;
    performance.mark?.("enterprize:intro-typing-complete");
    // Paint the completed copy and disabled preparation CTA before parsing Three.
    await waitForNextPaint();
  }

  bootstrap.runtimeImportStarted = true;
  performance.mark?.("enterprize:runtime-import-start");
  const { startArenaRuntime } = await import("./main.js");
  bootstrap.runtimeImported = true;
  performance.mark?.("enterprize:runtime-import-end");

  await startArenaRuntime({
    intro,
    pointCloudUrl,
    pointCloudBufferPromise,
    onSceneReady: (launch) => {
      launchArenaScene = launch;
    },
  });
}

start().catch((error) => {
  console.error("[ENTERPRIZE] Boot failed", error);
  document.documentElement.dataset.bootFailed = "true";
});
