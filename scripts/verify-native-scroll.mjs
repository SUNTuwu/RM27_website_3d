import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const positionalArgs = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const baseUrl = positionalArgs[0] ?? process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

const sourcePaths = [
  "index.html",
  "src/styles.css",
  "src/archive.css",
  "src/open-source.css",
  "src/introEntry.js",
  "src/main.js",
  "src/ui/unitSite.js",
  "src/components/zoom-parallax-section.tsx",
  "src/components/ui/zoom-parallax.tsx",
];
const sources = Object.fromEntries(
  await Promise.all(sourcePaths.map(async (file) => [file, await read(file)])),
);
const combinedSource = Object.values(sources).join("\n");
const pageScrollOwners = `${sources["src/introEntry.js"]}\n${sources["src/ui/unitSite.js"]}`;
const zoomSource = sources["src/components/ui/zoom-parallax.tsx"];
const runtimeSource = sources["src/main.js"];
const archiveEntrySource = runtimeSource
  .split(/function positionUnitArchive\s*\([^)]*\)\s*(?:=\s*\{\s*\}\s*)?\{/, 2)[1]
  ?.split("let exploreCloudScheduleToken", 1)[0];

const expectedSnapScenes = [
  "beyond-arena",
  "who-we-are",
  "media-record",
  "team-history",
  "team-manifesto",
  "unit-archive",
  "join-fleet",
  "return-arena",
];
const liveSnapScenes = [
  ...sources["index.html"].matchAll(/data-snap-scene="([^"]+)"/g),
  ...sources["src/components/zoom-parallax-section.tsx"].matchAll(
    /data-snap-scene="([^"]+)"/g),
].map((match) => match[1]);
const orderedSnapScenes = (() => {
  const htmlOnly = [
    ...sources["index.html"].matchAll(/data-snap-scene="([^"]+)"/g),
  ].map((match) => match[1]);
  const zoomOnly = [
    ...sources["src/components/zoom-parallax-section.tsx"].matchAll(
      /data-snap-scene="([^"]+)"/g,
    ),
  ].map((match) => match[1]);
  return [...zoomOnly, ...htmlOnly];
})();
assert(
  JSON.stringify(orderedSnapScenes) === JSON.stringify(expectedSnapScenes),
  `unexpected snap scene set: ${JSON.stringify(orderedSnapScenes)} (raw ${JSON.stringify(liveSnapScenes)})`,
);
assert(
  !/data-snap-scene="arena-3d"/.test(sources["index.html"]) &&
    !/#app\[data-snap-scene="arena-3d"\]/.test(sources["src/styles.css"]),
  "arena-3d must not be a snap page (BEYOND→3D corridor freeze)",
);
assert(
  /user-scalable=no/.test(sources["index.html"]) &&
    /maximum-scale=1/.test(sources["index.html"]),
  "site viewport zoom lock is missing",
);
assert(
  /installViewportZoomLock|gesturestart|ctrlKey/.test(
    sources["src/introEntry.js"],
  ),
  "runtime viewport zoom lock is missing",
);
assert(
  /position:\s*fixed/.test(
    sources["src/styles.css"].match(/\.explore-panel\s*\{[\s\S]*?\}/)?.[0] ?? "",
  ),
  "explore panel must be viewport-fixed so scroll-lock rubber-band cannot drag it",
);
assert(
  !/data-snap-scene="unit-choice"/.test(sources["index.html"]),
  "unit-choice snap scene should be removed",
);
// 自动吸附已整体移除: 2D 纯原生滚动, 不得再出现任何 snap CSS / 闸门代码
assert(
  !/scroll-snap-type|scroll-snap-align|scroll-snap-stop/.test(
    sources["src/styles.css"],
  ) && !/scroll-snap-align|scroll-snap-stop/.test(sources["src/archive.css"]),
  "all scroll-snap CSS must be removed (native scroll only)",
);
assert(
  !/setupUnitEndSnap|setupSnapProximityGate|setupSettledSnap|nextSnapTargetDelta|SNAP_ARM|WHEEL_VELOCITY_GAIN/.test(
    sources["src/ui/unitSite.js"],
  ) &&
    !/is-snap-armed|is-intra-chapter/.test(sources["src/ui/unitSite.js"]) &&
    !/is-snap-armed|is-intra-chapter/.test(sources["src/styles.css"]),
  "snap gate code must stay removed (native scroll only)",
);
assert(
  /function armArenaEnterSnap/.test(sources["src/main.js"]) &&
    /crossedTimelineEnd/.test(sources["src/main.js"]),
  "3D→BEYOND snap must arm only on 99→100 crossing or explicit downward wheel",
);
assert(
  !/<[^>]*class="[^"]*archive-sub[^"]*"[^>]*data-snap-scene/.test(
    sources["index.html"],
  ) && !/data-snap-scene="[^"]+"[^>]*archive-sub/.test(sources["index.html"]),
  "small titles (archive-sub) must not be snap scenes",
);
assert(
  !/data-snap-scene="media-reel/.test(sources["index.html"]),
  "video reels must not be snap scenes (videos never snap)",
);
assert(
  !/is-snap-suppressed/.test(sources["src/styles.css"]) &&
    !/is-snap-suppressed/.test(sources["src/ui/unitSite.js"]) &&
    !/is-snap-suppressed/.test(sources["src/introEntry.js"]) &&
    !/is-snap-suppressed/.test(sources["src/main.js"]),
  "snap suppression plumbing must stay removed (no snap left to suppress)",
);
assert(!/scroll-behavior\s*:\s*smooth/.test(combinedSource), "CSS smooth scrolling remains");
assert(!/behavior\s*:\s*["']smooth["']/.test(combinedSource), "smooth JS scrolling remains");
assert(!/useSpring|ZoomParallaxSpring|\bdamping\b/.test(zoomSource), "zoom scroll damping remains");
assert(!/documentReveal|is-document-transitioning/.test(combinedSource), "document reveal takeover remains");
assert(
  !/is-document-entering|document-sheet-rise/.test(sources["src/styles.css"]) &&
    !/is-document-entering|document-sheet-rise|DOCUMENT_ENTER_DURATION_MS/.test(
      sources["src/main.js"],
    ),
  "auto sheet-rise entry animation must stay removed (sheet rises with native scroll)",
);
assert(archiveEntrySource, "immediate archive entry function is missing");
assert(
  !/requestAnimationFrame|cancelAnimationFrame/.test(archiveEntrySource),
  "archive entry still animates page scroll with rAF",
);
assert(
  (archiveEntrySource.match(/window\.scrollTo\(/g) ?? []).length === 1,
  "archive entry must use exactly one scrollTo call",
);
assert(
  /window\.scrollTo\(\s*0\s*,\s*0\s*\)/.test(archiveEntrySource),
  "archive entry must land at document top so the 2D sheet rises with native scroll",
);
assert(
  /if \(autoScroll\) beginArchiveAutoScroll\(\);/.test(runtimeSource) &&
    /enterUnitArchive\(\{\s*autoScroll:\s*true\s*\}\)/.test(runtimeSource),
  "99→100 crossing must enter the archive with autoScroll enabled",
);
assert(
  (runtimeSource.match(/beginArchiveAutoScroll\(\)/g) ?? []).length === 2 &&
    (runtimeSource.match(/enterUnitArchive\(\{\s*autoScroll:\s*true\s*\}\)/g) ?? [])
      .length === 1,
  "auto scroll is wired only to the timeline-completion entry (never the 2D→3D return)",
);
assert(
  /prefers-reduced-motion:\s*reduce/.test(runtimeSource) &&
    /addEventListener\(\s*["']wheel["']\s*,\s*cancelArchiveAutoScrollOnWheel/.test(
      runtimeSource,
    ) &&
    /function cancelArchiveAutoScrollOnWheel[\s\S]*?deltaY[^;]*<\s*0/.test(
      runtimeSource,
    ) &&
    /["']touchstart["'][\s\S]{0,120}?cancelArchiveAutoScroll\(["']touch["']\)/.test(
      runtimeSource,
    ),
  "only opposite-direction wheel, touch, or keys cancel the archive auto scroll",
);
assert(
  /function returnToTimeline[\s\S]{0,320}?cancelArchiveAutoScroll\(\)/.test(
    runtimeSource,
  ) &&
    !/function returnToTimeline[\s\S]*?beginArchiveAutoScroll/.test(
      runtimeSource.split("function returnToTimeline")[1]?.split("function ")[0] ??
        "",
    ),
  "manual 2D→3D return cancels auto scroll and never restarts it",
);
assert(
  /html\.is-document-mode\s+#scene-canvas\s*\{[^}]*touch-action:\s*pan-y/.test(
    sources["src/styles.css"],
  ),
  "document-mode canvas must allow vertical native scroll on touch",
);
assert(
  /scrollingUp[\s\S]*?canReturnToTimelineByScroll\(\)/.test(runtimeSource) &&
    /lastDocumentScrollY/.test(runtimeSource),
  "scroll return must be direction-aware (only upward scroll at top returns to 3D)",
);
const runtimeWheelHandler = runtimeSource.match(
  /window\.addEventListener\(\s*["']wheel["'][\s\S]*?\{\s*passive:\s*false\s*\}\s*,?\s*\);/,
)?.[0];
assert(runtimeWheelHandler, "runtime wheel handler is missing");
assert(
  /state\s*===\s*["']end["'][\s\S]*?deltaY\s*<\s*0[\s\S]*?ARCHIVE_RETURN_SCROLL_Y[\s\S]*?returnToTimeline\(\)/.test(
    runtimeWheelHandler,
  ),
  "END wheel must return to timeline only on guarded upward wheel at document top",
);
assert(
  !/documentEnterInProgress/.test(runtimeWheelHandler),
  "END wheel entry lock must stay removed (native scroll owns the rise)",
);
// 允许 viewport zoom-lock / scroll-lock 防护监听; 禁止 2D 自己接管翻页滚动
const pageScrollOwnerCore = pageScrollOwners
  .replace(/function installViewportZoomLock\s*\([\s\S]*?\n\}\s*\n/, "\n")
  .replace(/installViewportZoomLock\s*\(\s*\)\s*;?/g, "");
assert(
  !/addEventListener\(\s*["'](?:wheel|touchstart|touchmove|touchend)["']/.test(
    pageScrollOwnerCore,
  ),
  "2D entry or archive code still owns wheel/touch scrolling",
);
assert(
  !/function setupBeyondWhoWeAreSoftSnap/.test(sources["src/ui/unitSite.js"]) &&
    !/BEYOND_WHO_SNAP_MS/.test(sources["src/ui/unitSite.js"]),
  "beyond/who special soft snap must stay removed",
);
assert(
  /data-focus-leaving="true"[\s\S]*?\.hint-bar/.test(sources["src/styles.css"]),
  "focus exit must fade hint-bar with other focus chrome",
);
assert(
  /chapterScrollTarget\([\s\S]*?\)\?\.scrollIntoView\(\{[\s\S]*?behavior:\s*["']auto["'][\s\S]*?block:\s*["']start["']/.test(
    sources["src/ui/unitSite.js"],
  ) ||
    /scrollIntoView\(\{[\s\S]*?behavior:\s*["']auto["'][\s\S]*?block:\s*["']start["']/.test(
      sources["src/ui/unitSite.js"],
    ),
  "chapter navigation is not an immediate start-aligned jump",
);
assert(
  /scrollTarget\?\.scrollIntoView\(\{[\s\S]*?behavior:\s*["']auto["'][\s\S]*?block:\s*["']start["']/.test(
    sources["src/introEntry.js"],
  ),
  "direct archive routing is not an immediate start-aligned jump",
);

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu"],
});

try {
  for (const viewport of [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const url = new URL(baseUrl);
    url.searchParams.set("view", "archive");
    url.hash = "archive-team";
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains("is-document-mode") &&
        window.__ENTERPRIZE_BOOTSTRAP__?.directArchiveReady === true,
      null,
      { timeout: 30_000 },
    );
    await page.evaluate(() => document.fonts?.ready);
    // 纯原生滚动: 程序定位即最终落点, 等两帧布局稳定即可
    await page.waitForTimeout(220);

    const contract = await page.evaluate(() => {
      const scenes = [...document.querySelectorAll("[data-snap-scene]")].map((element) => ({
        name: element.getAttribute("data-snap-scene"),
        align: element.getAttribute("data-snap-align"),
      }));
      // 直达 #archive-team 时落到内部 team-history snap (wrap 顶), 不是章节壳顶
      const teamSnap = document.querySelector('[data-snap-scene="team-history"]');
      return {
        scenes,
        scrollSnapType: getComputedStyle(document.documentElement).scrollSnapType,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        directTop: teamSnap?.getBoundingClientRect().top,
      };
    });
    assert(
      JSON.stringify(contract.scenes) ===
        JSON.stringify([
          { name: "beyond-arena", align: "start" },
          { name: "who-we-are", align: "start" },
          { name: "media-record", align: "start" },
          { name: "team-history", align: "start" },
          { name: "team-manifesto", align: "center" },
          { name: "unit-archive", align: "start" },
          { name: "join-fleet", align: "start" },
          { name: "return-arena", align: "center" },
        ]),
      `${viewport.label}: unexpected live snap scenes (${JSON.stringify(contract.scenes)})`,
    );
    assert(
      contract.scrollSnapType === "none",
      `${viewport.label}: idle document must stay native scroll (snap ${contract.scrollSnapType})`,
    );
    assert(
      contract.scrollBehavior === "auto",
      `${viewport.label}: scroll behavior is ${contract.scrollBehavior}`,
    );
    assert(
      Math.abs(contract.directTop ?? Number.POSITIVE_INFINITY) <= 48,
      `${viewport.label}: direct archive route missed team snap start (${contract.directTop})`,
    );

    let navTop = null;
    if (viewport.label === "desktop") {
      await page.locator(".archive-nav__item").nth(2).click();
      await page.waitForTimeout(180);
      navTop = await page.locator('[data-snap-scene="unit-archive"]').evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      assert(Math.abs(navTop) <= 48, `${viewport.label}: chapter navigation missed unit snap start (${navTop})`);
    }

    // 原生滚动: 程序定位后位置不得漂移 (无 snap 拉拽)
    const positionStability = await page.evaluate(async () => {
      const section = document.querySelector("#archive-units");
      const top = section.getBoundingClientRect().top + window.scrollY;
      const value = Math.round(top + 321);
      window.scrollTo(0, value);
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      await frames(2);
      const early = window.scrollY;
      await frames(12);
      const late = window.scrollY;
      return { requested: value, early, late };
    });
    assert(
      Math.abs(positionStability.early - positionStability.requested) <= 1 &&
        Math.abs(positionStability.late - positionStability.early) <= 1,
      `${viewport.label}: native position drifted (${JSON.stringify(positionStability)})`,
    );

    // 章内小板块 (英雄重炮破阵) 原地停住, 不被拽到大标题
    const intraChapter = await page.evaluate(async () => {
      const reveal = document.querySelector("#unit-reveal");
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const target = reveal.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo(0, Math.max(target, 0));
      await frames(2);
      const early = { scrollY: window.scrollY };
      await frames(24);
      return { early, lateScrollY: window.scrollY };
    });
    assert(
      Math.abs(intraChapter.lateScrollY - intraChapter.early.scrollY) <= 8,
      `${viewport.label}: mid-chapter block moved without user scroll (${JSON.stringify(intraChapter)})`,
    );

    // 纯原生: 逼近 banner 再向下 nudge 也不吸, 位移恒等于请求值
    const pageTurn = await page.evaluate(async () => {
      const banner = document.querySelector("#archive-banner");
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const rect = banner.getBoundingClientRect();
      const bannerCenter = rect.top + window.scrollY + rect.height / 2;
      window.scrollTo(0, Math.max(bannerCenter - window.innerHeight * 1.25, 0));
      await frames(8);
      const nudge = Math.floor(window.innerHeight * 0.42);
      const beforeNudge = window.scrollY;
      window.scrollBy(0, nudge);
      await frames(24);
      return { scrollY: window.scrollY, expected: beforeNudge + nudge };
    });
    assert(
      Math.abs(pageTurn.scrollY - pageTurn.expected) <= 8,
      `${viewport.label}: downward nudge near banner must stay native (${JSON.stringify(pageTurn)})`,
    );

    // 上滑全程原生: 位移恒等于请求值, scroll-snap-type 恒为 none
    const upwardNative = await page.evaluate(async () => {
      const root = document.documentElement;
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const step = Math.floor(window.innerHeight * 0.3);
      const before = window.scrollY;
      window.scrollBy(0, -step);
      await frames(16);
      return {
        before,
        after: window.scrollY,
        expected: before - step,
        snapType: getComputedStyle(root).scrollSnapType,
      };
    });
    assert(
      Math.abs(upwardNative.after - upwardNative.expected) <= 8 &&
        upwardNative.snapType === "none",
      `${viewport.label}: upward scroll must be native (${JSON.stringify(upwardNative)})`,
    );

    // 视频区原生滚动: media-record 下方连续小步向下, 每步位移 = 请求位移
    const reelNative = await page.evaluate(async () => {
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      const media = document.querySelector('[data-snap-scene="media-record"]');
      window.scrollTo(0, media.getBoundingClientRect().top + window.scrollY);
      await frames(4);
      const step = Math.floor(window.innerHeight * 0.3);
      const steps = [];
      for (let i = 0; i < 4; i += 1) {
        const beforeStep = window.scrollY;
        window.scrollBy(0, step);
        await frames(10);
        steps.push({ moved: window.scrollY - beforeStep });
      }
      return { steps, requested: step };
    });
    assert(
      reelNative.steps.every(
        (entry) => Math.abs(entry.moved - reelNative.requested) <= 8,
      ),
      `${viewport.label}: reel area must scroll natively (${JSON.stringify(reelNative)})`,
    );

    const transformTail = await page.evaluate(async () => {
      const gallery = document.querySelector("#zoom-parallax-gallery");
      const layer = gallery?.querySelector("[data-zoom-layer]");
      if (!gallery || !layer) return null;
      const top = gallery.getBoundingClientRect().top + window.scrollY;
      const range = Math.max(gallery.getBoundingClientRect().height - window.innerHeight, 1);
      window.scrollTo(0, top + range * 0.45);
      const frames = (count) =>
        new Promise((resolve) => {
          const tick = () => {
            if (count <= 0) {
              resolve();
              return;
            }
            count -= 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      await frames(2);
      const early = getComputedStyle(layer).transform;
      await frames(12);
      const late = getComputedStyle(layer).transform;
      return { early, late };
    });
    assert(transformTail, `${viewport.label}: zoom layer was not mounted`);
    assert(
      transformTail.early === transformTail.late,
      `${viewport.label}: zoom transform still trails scroll (${transformTail.early} -> ${transformTail.late})`,
    );

    console.log(
      `[${viewport.label}] ${JSON.stringify({ contract, navTop, positionStability, intraChapter, pageTurn, upwardNative, reelNative, transformTail })}`,
    );
    await page.close();
  }

  const openSourcePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openSourcePage.goto(new URL("open-source.html", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const openSourceScrollBehavior = await openSourcePage.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  assert(
    openSourceScrollBehavior === "auto",
    `open-source page scroll behavior is ${openSourceScrollBehavior}`,
  );
  await openSourcePage.close();
} finally {
  await browser.close();
}

console.log("[ok] 2D pages use pure native scrolling (no snap logic)");
