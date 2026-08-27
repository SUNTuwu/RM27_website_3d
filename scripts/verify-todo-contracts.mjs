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
check(
  intro.includes('role="progressbar"') &&
    intro.includes("data-intro-cta") &&
    intro.includes("ENTRY QUEUED") &&
    intro.includes("RELOAD ARENA"),
  "Intro CTA exposes progress, queued entry, and visible retry states",
);
check(
  intro.includes("const starCount = width < 720 ? 180 : 300") &&
    intro.includes("enterprize:warp-center-cleared") &&
    !intro.includes("star.r = 16"),
  "warp uses one bounded star batch and records an empty final frame",
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
  (hud.match(/点按波纹 &nbsp;·&nbsp; 拖拽环视 &nbsp;·&nbsp; 滑动进入/g) ?? [])
    .length >= 2,
  "desktop and touch EXPLORE hints use the requested Chinese copy",
);
check(
  source["index.html"].includes(
    '<p class="key-hints__lead"><span>下滑进入</span><span>战场</span></p>',
  ),
  "EXPLORE key controls include the battlefield entry lead",
);

const styles = source["src/styles.css"];
check(
  styles.includes("background: var(--bg);") &&
    styles.includes("#app[data-state=\"explore\"] .explore-brand-mark::before") &&
    styles.includes("animation: explore-brand-float"),
  "3D transition background and EXPLORE logo animation share the configured visual system",
);
check(
  /\.timeline-track\s*\{[^}]*height:\s*34px/s.test(styles) &&
    /\.timeline-marker\s*\{[^}]*top:\s*15px/s.test(styles),
  "timeline labels are positioned below the progress line",
);
check(
  styles.includes(".key-hints__lead span { display: block; }") &&
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
    main.includes("enterprize:p1-start"),
  "Timeline video prewarm and delayed EXPLORE P1 scheduling are instrumented",
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
    archive.includes("background: rgba(5, 7, 13, 0.92)"),
  "mobile archive title, logo visibility, and dark stats are explicitly constrained",
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
