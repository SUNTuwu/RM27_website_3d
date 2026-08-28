import "./styles.css";
import "./tailwind.css";

import { assetUrl } from "./core/assetUrl.js";
import { fetchPointCloudBuffer } from "./pointcloud/pointCloudData.js";
import { mountIntroScreen } from "./ui/introScreen";

// 全站禁浏览器缩放: pinch / ctrl-wheel / ctrl± 都会和 3D 手势抢控制权
function installViewportZoomLock() {
  const blockZoomWheel = (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  };
  const blockZoomKeys = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (
      event.key === "+" ||
      event.key === "=" ||
      event.key === "-" ||
      event.key === "_" ||
      event.code === "NumpadAdd" ||
      event.code === "NumpadSubtract" ||
      event.key === "0"
    ) {
      event.preventDefault();
    }
  };
  const blockGesture = (event) => {
    event.preventDefault();
  };
  // 3D 锁滚阶段吞掉非交互 touchmove, 防止 body 橡皮筋把 absolute HUD 一起拽走
  const blockLockedTouchMove = (event) => {
    if (!document.documentElement.classList.contains("is-scroll-locked")) {
      return;
    }
    if (event.touches?.length > 1) {
      event.preventDefault();
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "input, textarea, select, button, a, [role='button'], [data-allow-touch-scroll]",
      )
    ) {
      return;
    }
    event.preventDefault();
  };

  window.addEventListener("wheel", blockZoomWheel, { passive: false, capture: true });
  window.addEventListener("keydown", blockZoomKeys, { capture: true });
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
  document.addEventListener("gestureend", blockGesture, { passive: false });
  window.addEventListener("touchmove", blockLockedTouchMove, {
    passive: false,
    capture: true,
  });
}

installViewportZoomLock();

const INTRO_SESSION_KEY = "enterprize:intro-completed:v1";
const FORCE_INTRO_PARAM = "intro";
const ARCHIVE_VIEW_PARAM = "view";
const ARCHIVE_VIEW_VALUE = "archive";
const POINT_FETCH_RETRY_DELAYS_MS = [180, 480];
const DIRECT_ARCHIVE_HASHES = new Set([
  "#archive-hero",
  "#archive-media",
  "#archive-team",
  "#archive-units",
  "#archive-join",
  "#archive-coords",
  "#archive-return",
]);

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function waitFor(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function sessionHasCompletedIntro() {
  if (new URLSearchParams(window.location.search).get(FORCE_INTRO_PARAM) === "1") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroCompleted() {
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    // Storage can be unavailable in privacy modes; the current document still
    // keeps the Intro unmounted after a successful transition.
  }
}

function directArchiveTarget() {
  if (DIRECT_ARCHIVE_HASHES.has(window.location.hash)) {
    return window.location.hash;
  }
  const requestedView = new URLSearchParams(window.location.search).get(
    ARCHIVE_VIEW_PARAM,
  );
  return requestedView === ARCHIVE_VIEW_VALUE ? "#archive-hero" : null;
}

const pointCloudUrl = assetUrl("pointcloud/arena_points.bin");
const explorePointCloudUrls = Object.freeze({
  dart: assetUrl("pointcloud/dart_points.bin"),
  infantry: assetUrl("pointcloud/infantry_points.bin"),
  engineer: assetUrl("pointcloud/engineer_points.bin"),
});
const bootstrap = {
  mode: directArchiveTarget() ? "archive" : "arena",
  introMounted: false,
  introPainted: false,
  typingDone: false,
  pointFetchStarted: false,
  pointFetchDone: false,
  pointFetchAttempts: 0,
  pointBytes: 0,
  explorePointFetchStarted: false,
  explorePointFetchDone: 0,
  explorePointFetchErrors: 0,
  explorePointBytes: 0,
  loadProgress: 0,
  loadStatus: "WAITING FOR INTRO",
  loadError: null,
  runtimeImportStarted: false,
  runtimeImported: false,
  directArchiveReady: false,
};
window.__ENTERPRIZE_BOOTSTRAP__ = bootstrap;

let mode = bootstrap.mode;
let intro = null;
let launchArenaScene = null;
let directArchivePromise = null;

function reportProgress(value, status) {
  const normalized = Math.min(Math.max(Number(value) || 0, 0), 1);
  bootstrap.loadProgress = Math.max(bootstrap.loadProgress, normalized);
  if (status) bootstrap.loadStatus = status;
  if (!intro) return;
  intro.control.progress = bootstrap.loadProgress;
  intro.control.status = bootstrap.loadStatus;
  intro.control.setProgress?.(bootstrap.loadProgress, bootstrap.loadStatus);
}

function reportError(error) {
  const message = error?.message ?? String(error);
  bootstrap.loadError = message;
  document.documentElement.dataset.bootFailed = "true";
  if (!intro) return;
  intro.control.error = message;
  intro.control.setError?.(message);
}

function returnFromDirectArchive() {
  markIntroCompleted();
  const params = new URLSearchParams(window.location.search);
  params.delete(ARCHIVE_VIEW_PARAM);
  const search = params.toString();
  const arenaUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
  window.history.replaceState(window.history.state, "", arenaUrl);
  window.location.reload();
}

function installDirectArchiveReturnCapture() {
  if (document.documentElement.dataset.directArchiveReturnBound === "true") return;
  document.documentElement.dataset.directArchiveReturnBound = "true";
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-action="return-arena"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      returnFromDirectArchive();
    },
    true,
  );
}

function openDirectArchive(targetHash = "#archive-hero") {
  if (!DIRECT_ARCHIVE_HASHES.has(targetHash)) targetHash = "#archive-hero";
  if (directArchivePromise) return directArchivePromise;

  mode = "archive";
  bootstrap.mode = mode;
  markIntroCompleted();
  reportProgress(1, "OPENING 2D ARCHIVE");
  document.documentElement.classList.add("is-document-mode");
  document.documentElement.classList.remove(
    "is-scroll-locked",
  );
  document.documentElement.dataset.directArchive = "true";
  const app = document.querySelector("#app");
  if (app) {
    app.hidden = true;
    app.setAttribute("aria-hidden", "true");
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}${targetHash}`,
  );
  installDirectArchiveReturnCapture();

  directArchivePromise = Promise.all([
    import("./ui/unitSite.js"),
    import("./ui/zoomParallax"),
    import("./ui/staggerTestimonials"),
    import("./ui/glowingChannels"),
  ])
    .then(
      async ([unitSite, zoomParallax, staggerTestimonials, glowingChannels]) => {
        const archiveNav = document.querySelector("#archive-nav");
        if (!archiveNav?.children.length) {
          unitSite.createUnitSite({ onReturnToArena: returnFromDirectArchive });
        }
        zoomParallax.mountZoomParallax();
        staggerTestimonials.mountStaggerTestimonials();
        glowingChannels.mountGlowingChannels();
        await waitForNextPaint();
        window.dispatchEvent(new Event("enterprize:zoom-activate"));
        await document.fonts?.ready;
        await waitForNextPaint();
        const section =
          document.querySelector(targetHash) ??
          document.querySelector("#archive-team") ??
          document.querySelector("#unit-site");
        // 章节壳本身不一定是 snap 点; 跳到内部 data-snap-scene, 避免 mandatory 再拽一次
        const scrollTarget =
          section?.matches?.("[data-snap-scene]")
            ? section
            : (section?.querySelector?.("[data-snap-scene]") ?? section);
        const root = document.documentElement;
        root.classList.add("is-snap-suppressed");
        scrollTarget?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.setTimeout(() => {
              root.classList.remove("is-snap-suppressed");
            }, 120);
          });
        });
        bootstrap.directArchiveReady = true;
        performance.mark?.("enterprize:direct-archive-ready");
      },
    )
    .catch((error) => {
      directArchivePromise = null;
      reportError(error);
      throw error;
    });
  return directArchivePromise;
}

function mountIntro() {
  const handle = mountIntroScreen({
    ready: false,
    onLaunch: () => {
      if (mode === "arena") launchArenaScene?.();
    },
  });
  if (!handle) return null;
  handle.control.progress = bootstrap.loadProgress;
  handle.control.status = bootstrap.loadStatus;
  handle.control.error = bootstrap.loadError;
  handle.control.retry = () => window.location.reload();
  handle.control.markCompleted = markIntroCompleted;
  handle.control.openArchive = openDirectArchive;
  return handle;
}

async function fetchPointCloudWithRetry(onProgress) {
  let lastError;
  for (
    let attemptIndex = 0;
    attemptIndex <= POINT_FETCH_RETRY_DELAYS_MS.length;
    attemptIndex += 1
  ) {
    bootstrap.pointFetchAttempts = attemptIndex + 1;
    try {
      return await fetchPointCloudBuffer(pointCloudUrl, { onProgress });
    } catch (error) {
      lastError = error;
      const retryDelay = POINT_FETCH_RETRY_DELAYS_MS[attemptIndex];
      if (retryDelay === undefined || mode !== "arena") throw error;
      reportProgress(
        bootstrap.loadProgress,
        `RETRYING POINT DATA ${attemptIndex + 1}/${POINT_FETCH_RETRY_DELAYS_MS.length}`,
      );
      await waitFor(retryDelay);
    }
  }
  throw lastError;
}

async function startArena() {
  const skipIntro = sessionHasCompletedIntro();
  intro = skipIntro ? null : mountIntro();
  bootstrap.introMounted = Boolean(intro);
  if (intro) performance.mark?.("enterprize:intro-mounted");

  bootstrap.pointFetchStarted = true;
  reportProgress(0.08, "FETCHING POINT CLOUD");
  performance.mark?.("enterprize:point-fetch-start");
  const pointCloudBufferPromise = fetchPointCloudWithRetry(
    ({ ratio, loaded, total }) => {
      bootstrap.pointBytes = loaded;
      const pointRatio = Number.isFinite(ratio) ? ratio : 0;
      const detail =
        total > 0
          ? `POINT DATA ${Math.round(pointRatio * 100)}%`
          : `POINT DATA ${Math.max(Math.round(loaded / 1024), 0)} KB`;
      reportProgress(0.08 + pointRatio * 0.47, detail);
    },
  )
    .then((buffer) => {
      bootstrap.pointFetchDone = true;
      bootstrap.pointBytes = buffer.byteLength;
      reportProgress(0.55, "POINT DATA READY");
      performance.mark?.("enterprize:point-fetch-end");
      return buffer;
    })
    .catch((error) => {
      reportError(error);
      throw error;
    });
  // The runtime consumes the same promise after typing; attach a handler now so
  // an early network failure is never reported as an unhandled rejection.
  void pointCloudBufferPromise.catch(() => {});

  // Give the arena point cloud network priority, then use the remaining typing
  // window to fetch the three EXPLORE variants without importing Three.js yet.
  const explorePointCloudBufferPromises = Object.fromEntries(
    Object.entries(explorePointCloudUrls).map(([key, url]) => {
      const promise = pointCloudBufferPromise
        .then(() => {
          bootstrap.explorePointFetchStarted = true;
          return fetchPointCloudBuffer(url);
        })
        .then((buffer) => {
          bootstrap.explorePointFetchDone += 1;
          bootstrap.explorePointBytes += buffer.byteLength;
          return buffer;
        })
        .catch((error) => {
          bootstrap.explorePointFetchErrors += 1;
          throw error;
        });
      void promise.catch(() => {});
      return [key, promise];
    }),
  );

  if (intro) {
    await waitForNextPaint();
    if (mode !== "arena") return;
    bootstrap.introPainted = true;
    performance.mark?.("enterprize:intro-paint-window");
    await intro.control.waitForTypingDone?.();
    if (mode !== "arena") return;
    bootstrap.typingDone = true;
    reportProgress(0.58, "LOADING 3D RUNTIME");
    performance.mark?.("enterprize:intro-typing-complete");
    await waitForNextPaint();
    if (mode !== "arena") return;
  }

  bootstrap.runtimeImportStarted = true;
  reportProgress(0.62, "LOADING 3D RUNTIME");
  performance.mark?.("enterprize:runtime-import-start");
  const { startArenaRuntime } = await import("./main.js");
  if (mode !== "arena") return;
  bootstrap.runtimeImported = true;
  reportProgress(0.76, "BUILDING POINT CLOUD");
  performance.mark?.("enterprize:runtime-import-end");

  reportProgress(0.82, "COMPILING ARENA SCENE");
  await startArenaRuntime({
    intro,
    pointCloudUrl,
    pointCloudBufferPromise,
    explorePointCloudUrls,
    explorePointCloudBufferPromises,
    onSceneReady: (launch) => {
      launchArenaScene = launch;
      reportProgress(1, "ARENA READY");
    },
  });
}

async function start() {
  const archiveTarget = directArchiveTarget();
  if (archiveTarget) {
    await openDirectArchive(archiveTarget);
    return;
  }
  await startArena();
}

start().catch((error) => {
  console.error("[ENTERPRIZE] Boot failed", error);
  reportError(error);
});
