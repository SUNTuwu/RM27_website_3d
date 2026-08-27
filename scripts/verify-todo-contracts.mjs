import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const root = process.cwd();
const source = {};

for (const file of [
  "index.html",
  "open-source.html",
  "src/archive.css",
  "src/components/glowing-channels-section.tsx",
  "src/components/intro-screen.tsx",
  "src/components/ui/zoom-parallax.tsx",
  "src/introEntry.js",
  "src/main.js",
  "src/open-source.js",
  "src/space-starfield.ts",
  "src/styles.css",
  "src/timeline/lookAroundController.js",
  "src/ui/hud.js",
  "src/ui/unitSite.js",
]) {
  source[file] = await readFile(resolve(root, file), "utf8");
}

function check(condition, message) {
  if (!condition) throw new Error(`[fail] ${message}`);
  console.log(`[ok] ${message}`);
}

const allCopy = Object.values(source).join("\n");
check(
  !/(?:EST\.?|ESTABLISHED)\s*2015|成立年份\s*·\s*EST\.?/i.test(allCopy),
  "all 2015 foundation labels use SINCE",
);
check(
  ["index.html", "open-source.html"].every((file) =>
    source[file].includes(
      '<link rel="icon" type="image/png" href="/assets/icon/blue_logo.png"',
    ),
  ),
  "both pages use the blue logo favicon",
);

const intro = source["src/components/intro-screen.tsx"];
const entry = source["src/introEntry.js"];
const openSource = source["src/open-source.js"];
const starfield = source["src/space-starfield.ts"];
check(
  intro.includes('role="progressbar"') &&
    intro.includes("data-intro-cta") &&
    intro.includes("ENTRY QUEUED") &&
    intro.includes("RELOAD ARENA"),
  "Intro CTA exposes progress, queued entry, and visible retry states",
);
check(
  intro.includes("createSpaceStarfield") &&
    openSource.includes("createSpaceStarfield") &&
    !intro.includes("function WarpCanvas") &&
    starfield.includes("SPACE_STARFIELD_BASE_VELOCITY = 16.5") &&
    starfield.includes("velocityPerSecond * deltaSeconds") &&
    starfield.includes("animationFrame === 0"),
  "Intro and open-source share one frame-rate-independent half-speed starfield",
);
check(
  intro.includes('event.code !== "Space"') &&
    intro.includes('window.addEventListener("wheel"') &&
    intro.includes('window.addEventListener("touchstart"') &&
    intro.includes('control?.openArchive?.("#archive-hero")'),
  "Intro keyboard, wheel, touch, and 2D shortcuts share implemented entry paths",
);
check(
  entry.includes('enterprize:intro-completed:v1') &&
    entry.includes("fetchPointCloudWithRetry") &&
    entry.includes("directArchiveTarget") &&
    entry.includes('params.delete(ARCHIVE_VIEW_PARAM)'),
  "Intro session restore, bounded point retry, and direct archive routing are present",
);

const hud = source["src/ui/hud.js"];
check(
  ["点按波纹", "拖拽环视", "滑动进入"].every(
    (copy) => (hud.match(new RegExp(copy, "g")) ?? []).length >= 2,
  ) &&
    ["CLICK", "TAP", "DRAG", "SCROLL", "SWIPE UP"].every((copy) =>
      hud.includes(`en: "${copy}"`),
    ),
  "desktop and touch EXPLORE hints use matching English and Chinese actions",
);
check(
  source["index.html"].includes("SCROLL TO ENTER") &&
    source["index.html"].includes("下滑进入战场") &&
    source["index.html"].includes("hud-bilingual__en") &&
    source["index.html"].includes("hud-bilingual__cn"),
  "EXPLORE key controls use one bilingual battlefield-entry hierarchy",
);

const styles = source["src/styles.css"];
check(
    styles.includes("background: var(--bg);") &&
    styles.includes("#app[data-state=\"explore\"] .explore-brand-mark::before") &&
    styles.includes("animation: explore-brand-float") &&
    styles.includes("transform: translate3d(0, -10px, 0);") &&
    styles.includes(".hud-bilingual__en") &&
    styles.includes(".hud-bilingual__cn"),
  "EXPLORE logo starts continuously and HUD bilingual colors share one visual system",
);
check(
  /\.timeline-track\s*\{[^}]*height:\s*34px/s.test(styles) &&
    /\.timeline-marker\s*\{[^}]*top:\s*15px/s.test(styles),
  "timeline labels are positioned below the progress line",
);
check(
  styles.includes("flex-direction: column;") &&
    styles.includes(".archive-return-fade.is-visible"),
  "mobile battlefield lead wraps and archive return has a full-page fade",
);

const main = source["src/main.js"];
check(
  main.includes("const activeTouchPoints = new Map()") &&
    main.includes("lookAround.zoom(pinchDelta)") &&
    main.includes("touchGesture.suppressUntilClear"),
  "mobile pinch zoom uses tracked touches without leaking click or timeline input",
);
check(
  main.includes('new Event("enterprize:video-prewarm")') &&
    main.includes("enterprize:explore-first-paint") &&
    main.includes("enterprize:p1-start") &&
    main.includes("DEFERRED_SCENE_LAYER") &&
    main.includes("warmDeferredRoots") &&
    main.includes("EXPLORE_CLOUD_BOOT_BUDGET_MS") &&
    main.includes("prepareRemainingExploreClouds") &&
    main.includes("warmCamera.layers.set(DEFERRED_SCENE_LAYER)") &&
    main.includes("object.frustumCulled = false") &&
    entry.includes("explorePointCloudBufferPromises"),
  "EXPLORE point artifacts use bounded startup work and isolated GPU warmup",
);
check(
  main.includes("returnToArenaOverview") &&
    main.includes("lookAround.enterOverview()") &&
    source["src/timeline/lookAroundController.js"].includes("overviewPinned"),
  "final CTA returns through the fade into a stable look-around overview",
);

const archive = source["src/archive.css"];
check(
  /@media \(max-width: 600px\)[\s\S]*?\.archive-hero__title\s*\{[\s\S]*?white-space:\s*nowrap/s.test(
    archive,
  ) &&
    archive.includes(".archive-hero__media .archive-hero__logo") &&
    archive.includes("linear-gradient(145deg, #101827 0%, #05070d 100%)") &&
    archive.includes(".archive-stat:nth-child(even)") &&
    archive.includes("border-radius: 15px"),
  "archive title stays constrained while stats use dark accent cards on every viewport",
);
check(
  source["src/components/glowing-channels-section.tsx"].includes("p-7") &&
    source["src/components/glowing-channels-section.tsx"].includes("sm:p-8"),
  "coordinate cards have expanded content spacing",
);
check(
  source["src/components/ui/zoom-parallax.tsx"].includes("useLayoutEffect") &&
    source["src/components/ui/zoom-parallax.tsx"].includes("naturalWidth > 0") &&
    source["src/components/ui/zoom-parallax.tsx"].includes("data-zoom-load-state"),
  "photo wall handles cached completion, retry state, and visible load state",
);
check(
  source["src/ui/unitSite.js"].includes('source.searchParams.set("autoplay", autoplay ? "1" : "0")') &&
    source["src/ui/unitSite.js"].includes('"enterprize:video-prewarm"') &&
    source["src/ui/unitSite.js"].includes("intersectionRatio < 0.2"),
  "Bilibili players separate paused prewarm from viewport playback",
);
check(
  source["open-source.html"].includes('/?view=archive#archive-join'),
  "open-source Join Us links directly to the 2D archive",
);

for (let index = 2; index <= 6; index += 1) {
  const metadata = await sharp(
    resolve(root, `assets/images/zoom/${index}.webp`),
  ).metadata();
  check(
    Math.max(metadata.width ?? 0, metadata.height ?? 0) <= 1280,
    `zoom/${index}.webp is bounded to 1280px`,
  );
}

console.log("TODO source and asset contracts passed without screenshots.");
