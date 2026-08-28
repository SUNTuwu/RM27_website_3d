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
const htmlSnapScenes = [
  ...sources["index.html"].matchAll(/data-snap-scene="([^"]+)"/g),
].map((match) => match[1]);
const zoomSnapScenes = [
  ...sources["src/components/zoom-parallax-section.tsx"].matchAll(
    /data-snap-scene="([^"]+)"/g,
  ),
].map((match) => match[1]);
const liveSnapScenes = [...zoomSnapScenes, ...htmlSnapScenes];
assert(
  JSON.stringify(liveSnapScenes) === JSON.stringify(expectedSnapScenes),
  `unexpected snap scene set: ${JSON.stringify(liveSnapScenes)}`,
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
  /--snap-who-we-are-offset:\s*-/.test(sources["src/styles.css"]),
  "who-we-are snap offset must be negative to hide the fold above the viewport",
);
assert(
  !/data-snap-scene="unit-choice"/.test(sources["index.html"]),
  "unit-choice snap scene should be removed",
);
assert(
  /scroll-snap-type:\s*y\s+mandatory/.test(sources["src/styles.css"]),
  "document-mode mandatory snap is missing",
);
assert(
  /scroll-snap-stop:\s*always/.test(sources["src/styles.css"]),
  "document-mode snap stop always is missing",
);
assert(
  /is-snap-suppressed/.test(sources["src/styles.css"]) &&
    /is-snap-suppressed/.test(sources["src/ui/unitSite.js"]),
  "programmatic snap suppression is missing",
);
assert(
  /html\.is-document-entering[\s\S]*?scroll-snap-type:\s*none/.test(
    sources["src/styles.css"],
  ),
  "document enter must disable snap during the rise animation",
);
assert(!/scroll-behavior\s*:\s*smooth/.test(combinedSource), "CSS smooth scrolling remains");
assert(!/behavior\s*:\s*["']smooth["']/.test(combinedSource), "smooth JS scrolling remains");
assert(!/useSpring|ZoomParallaxSpring|\bdamping\b/.test(zoomSource), "zoom scroll damping remains");
assert(!/documentReveal|is-document-transitioning/.test(combinedSource), "document reveal takeover remains");
assert(
  /is-document-entering/.test(sources["src/styles.css"]) &&
    /is-document-entering/.test(sources["src/main.js"]),
  "document sheet rise entry animation is missing",
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
  /classList\.add\(\s*["']is-document-entering["']\s*\)/.test(archiveEntrySource),
  "archive entry no longer arms the CSS rise animation",
);
const runtimeWheelHandler = runtimeSource.match(
  /window\.addEventListener\(\s*["']wheel["'][\s\S]*?\{\s*passive:\s*false\s*\}\s*,?\s*\);/,
)?.[0];
assert(runtimeWheelHandler, "runtime wheel handler is missing");
assert(
  /state\s*===\s*["']end["'][\s\S]*documentEnterInProgress/.test(runtimeWheelHandler),
  "END wheel lock during document entry is missing",
);
assert(
  !/returnToTimeline\(\)/.test(runtimeWheelHandler),
  "END wheel still owns return-to-timeline",
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
    // 程序定位后会短暂 is-snap-suppressed; 等 mandatory 重新生效再量落点
    await page.waitForFunction(
      () =>
        !document.documentElement.classList.contains("is-snap-suppressed") &&
        /mandatory/.test(getComputedStyle(document.documentElement).scrollSnapType),
      null,
      { timeout: 5_000 },
    );

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
      /mandatory/.test(contract.scrollSnapType),
      `${viewport.label}: scroll snap is ${contract.scrollSnapType}`,
    );
    assert(contract.scrollBehavior === "auto", `${viewport.label}: scroll behavior is ${contract.scrollBehavior}`);
    assert(
      Math.abs(contract.directTop ?? Number.POSITIVE_INFINITY) <= 3,
      `${viewport.label}: direct archive route missed team snap start (${contract.directTop})`,
    );

    let navTop = null;
    if (viewport.label === "desktop") {
      await page.locator(".archive-nav__item").nth(2).click();
      await page.waitForTimeout(180);
      navTop = await page.locator('[data-snap-scene="unit-archive"]').evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      assert(Math.abs(navTop) <= 3, `${viewport.label}: chapter navigation missed unit snap start (${navTop})`);
    }

    // 程序定位时关 snap, 确认 free-scroll 路径仍可用; 再开 snap 验证翻页吸附
    const positionStability = await page.evaluate(async () => {
      const root = document.documentElement;
      root.classList.add("is-snap-suppressed");
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
      root.classList.remove("is-snap-suppressed");
      return { requested: value, early, late };
    });
    assert(
      Math.abs(positionStability.early - positionStability.requested) <= 1 &&
        Math.abs(positionStability.late - positionStability.early) <= 1,
      `${viewport.label}: snap-suppressed position drifted (${JSON.stringify(positionStability)})`,
    );

    // team-history 内容很高: 从后段再向下滚一段, mandatory snap 应落到 banner 居中。
    // 用 scrollBy (snap 开启) 模拟翻页; Playwright mouse.wheel 在该文档滚动链路上不稳定。
    const pageTurn = await page.evaluate(async () => {
      const root = document.documentElement;
      const banner = document.querySelector("#archive-banner");
      const mid = () => window.innerHeight / 2;
      const bannerOffset = () => {
        const rect = banner?.getBoundingClientRect();
        return rect ? Math.abs(rect.top + rect.height / 2 - mid()) : null;
      };
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

      root.classList.add("is-snap-suppressed");
      const rect = banner.getBoundingClientRect();
      const bannerCenter = rect.top + window.scrollY + rect.height / 2;
      window.scrollTo(0, Math.max(bannerCenter - window.innerHeight * 1.05, 0));
      await frames(2);
      const preTurn = { scrollY: window.scrollY, bannerCenterOffset: bannerOffset() };
      root.classList.remove("is-snap-suppressed");
      await frames(2);
      window.scrollBy(0, Math.floor(window.innerHeight * 0.4));
      await frames(24);
      return {
        scrollY: window.scrollY,
        bannerCenterOffset: bannerOffset(),
        preTurn,
      };
    });
    assert(
      pageTurn.bannerCenterOffset !== null && pageTurn.bannerCenterOffset <= 48,
      `${viewport.label}: page turn did not settle on banner (${JSON.stringify(pageTurn)})`,
    );
    assert(
      (pageTurn.preTurn?.bannerCenterOffset ?? 0) > 48,
      `${viewport.label}: page-turn start already on banner (${JSON.stringify(pageTurn.preTurn)})`,
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
      `[${viewport.label}] ${JSON.stringify({ contract, navTop, positionStability, pageTurn, transformTail })}`,
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

console.log("[ok] 2D pages use limited mandatory page snap without damping");
