import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:5175/");
const executablePath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!executablePath) throw new Error("Microsoft Edge was not found");

function check(condition, message, detail) {
  if (!condition) {
    throw new Error(
      `[fail] ${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
  console.log(`[ok] ${message}`);
}

function attachErrorChecks(page, errors, label) {
  const record = (message) => {
    if (/bili-user-fingerprint|bilibili/i.test(message)) return;
    errors.push(`${label}: ${message}`);
  };
  page.on("pageerror", (error) => record(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") record(message.text());
  });
}

async function canvasPixelCount(page, selector) {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector);
    const context = canvas?.getContext("2d");
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) painted += 1;
    }
    return painted;
  }, selector);
}

async function revealDesktopIntroCompletion(page) {
  await page.waitForSelector("[data-intro-typed-copy]");
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const typed = document.querySelector("[data-intro-typed-copy]");
        const beforeTop = typed?.getBoundingClientRect().top ?? null;
        const samples = [];
        const startedAt = performance.now();
        const deadline = startedAt + 5_000;

        typed?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );

        const frame = (now) => {
          const stageRoot = document.querySelector(
            "[data-intro-completion-stage]",
          );
          const copy = document.querySelector("[data-intro-origin-copy]");
          const wrapper = document.querySelector("[data-intro-cta-wrap]");
          const button = document.querySelector("[data-intro-cta]");
          const typedRect = typed?.getBoundingClientRect();
          const copyRect = copy?.getBoundingClientRect();
          const wrapperRect = wrapper?.getBoundingClientRect();
          const buttonRect = button?.getBoundingClientRect();
          const sample = {
            elapsed: now - startedAt,
            stage: stageRoot?.dataset.introCompletionStage ?? null,
            typedTop: typedRect?.top ?? null,
            copyOpacity: copy ? Number(getComputedStyle(copy).opacity) : null,
            ctaOpacity: wrapper
              ? Number(getComputedStyle(wrapper).opacity)
              : null,
            disabled: button?.disabled ?? null,
            tabIndex: button?.tabIndex ?? null,
            pointerEvents: wrapper
              ? getComputedStyle(wrapper).pointerEvents
              : null,
            copyGap:
              wrapperRect && copyRect
                ? wrapperRect.top - copyRect.bottom
                : null,
            buttonBottom: buttonRect?.bottom ?? null,
          };
          samples.push(sample);
          if (
            (sample.stage === "ready" && (sample.ctaOpacity ?? 0) >= 0.98) ||
            now >= deadline
          ) {
            resolve({ beforeTop, samples });
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

async function introChecks(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachErrorChecks(page, errors, "intro");

  const introUrl = new URL(baseUrl);
  introUrl.searchParams.set("intro", "1");
  await page.goto(introUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("[data-intro-starfield]");
  await page.waitForFunction(
    () => document.querySelector("[data-intro-starfield]")?.width > 0,
  );
  await page.waitForTimeout(180);

  const paintedPixels = await canvasPixelCount(page, "[data-intro-starfield]");
  check(paintedPixels > 80, "Intro shared starfield paints nonblank pixels", {
    paintedPixels,
  });

  const sequence = await revealDesktopIntroCompletion(page);
  const first = sequence.samples[0];
  const final = sequence.samples.at(-1);
  const copyStart = sequence.samples.find((sample) => sample.copyOpacity > 0.02);
  const ctaStart = sequence.samples.find((sample) => sample.ctaOpacity > 0.02);
  const beforeReady = sequence.samples.filter(
    (sample) => sample.stage !== "ready",
  );

  const layout = await page.evaluate(() => ({
    hasShortcutNav: Boolean(
      document.querySelector(
        "[data-intro-archive], [data-intro-open-source], .intro-outline-link",
      ),
    ),
  }));
  check(
    first.copyOpacity <= 0.02 &&
      first.ctaOpacity <= 0.02 &&
      Math.abs(first.typedTop - sequence.beforeTop) <= 3 &&
      final.typedTop < sequence.beforeTop - 8,
    "desktop Intro completion begins without a copy or layout flash",
    { first, final, beforeTop: sequence.beforeTop },
  );
  check(
    copyStart &&
      ctaStart &&
      copyStart.elapsed >= 350 &&
      ctaStart.elapsed > copyStart.elapsed &&
      ctaStart.copyOpacity >= 0.9,
    "desktop Intro reveals moved copy, Chinese copy, then CTA in order",
    { copyStart, ctaStart },
  );
  check(
    beforeReady.every(
      (sample) =>
        sample.disabled === true &&
        sample.tabIndex === -1 &&
        sample.pointerEvents === "none",
    ) &&
      final.stage === "ready" &&
      final.disabled === false &&
      final.pointerEvents === "auto",
    "desktop Intro CTA cannot be reached before its fade completes",
    { beforeReady: beforeReady.at(-1), final },
  );
  check(
    final.copyGap >= 58 &&
      final.copyGap <= 62 &&
      final.buttonBottom <= 900,
    "desktop Intro CTA keeps the tightened 60px copy gap without clipping",
    final,
  );
  check(
    layout.hasShortcutNav === false,
    "desktop Intro no longer shows the top-right shortcut pair",
    layout,
  );

  await page.click("[data-intro-cta]");
  await page.waitForFunction(
    () => document.querySelector("[data-intro-phase]")?.dataset.introPhase === "accelerate",
  );
  await page.waitForTimeout(320);
  const accelerationVisuals = await page.evaluate(() => {
    const stage = document.querySelector("[data-intro-completion-stage]");
    const typed = document.querySelector("[data-intro-typed-copy]");
    const copy = document.querySelector("[data-intro-origin-copy]");
    const cta = document.querySelector("[data-intro-cta-wrap]");
    const decorations = [
      ...document.querySelectorAll("[data-intro-decorations]"),
    ];
    return {
      phase: document.querySelector("[data-intro-phase]")?.dataset.introPhase,
      stage: stage?.dataset.introCompletionStage,
      stageOpacity: stage ? Number(getComputedStyle(stage).opacity) : 0,
      typedOpacity: typed ? Number(getComputedStyle(typed).opacity) : 0,
      copyOpacity: copy ? Number(getComputedStyle(copy).opacity) : 0,
      ctaOpacity: cta ? Number(getComputedStyle(cta).opacity) : 0,
      decorationOpacities: decorations.map((item) =>
        Number(getComputedStyle(item).opacity),
      ),
    };
  });
  check(
    accelerationVisuals.phase === "accelerate" &&
      accelerationVisuals.stage === "ready" &&
      accelerationVisuals.stageOpacity >= 0.98 &&
      accelerationVisuals.typedOpacity >= 0.98 &&
      accelerationVisuals.copyOpacity >= 0.98 &&
      accelerationVisuals.ctaOpacity >= 0.98 &&
      accelerationVisuals.decorationOpacities.length === 2 &&
      accelerationVisuals.decorationOpacities.every((opacity) => opacity <= 0.02),
    "Intro keeps title, copy, and CTA visible during acceleration without red/blue decorations",
    accelerationVisuals,
  );
  await page.waitForFunction(
    () =>
      performance.getEntriesByName("enterprize:background-acceleration-complete")
        .length === 1,
    null,
    { timeout: 45_000 },
  );
  const transition = await page.evaluate(() => {
    const mark = (name) => performance.getEntriesByName(name).at(-1)?.startTime ?? null;
    return {
      start: mark("enterprize:background-acceleration-start"),
      complete: mark("enterprize:background-acceleration-complete"),
      assemble: mark("enterprize:assemble-requested"),
      legacyWarpMarks: performance.getEntriesByName("enterprize:warp-center-cleared").length,
    };
  });
  const accelerationDuration = transition.complete - transition.start;
  check(
    accelerationDuration >= 800 &&
      accelerationDuration <= 1100 &&
      transition.assemble >= transition.complete &&
      transition.legacyWarpMarks === 0,
    "Intro uses one background acceleration transition before assembly",
    { ...transition, accelerationDuration },
  );

  await page.waitForFunction(
    () => {
      const openSource = document.querySelector("#opensource-jump");
      const recruit = document.querySelector("#recruit-jump");
      if (!openSource || !recruit) return false;
      const openStyle = getComputedStyle(openSource);
      const recruitStyle = getComputedStyle(recruit);
      return (
        openStyle.display !== "none" &&
        recruitStyle.display !== "none" &&
        openSource.getBoundingClientRect().right <=
          recruit.getBoundingClientRect().left
      );
    },
    null,
    { timeout: 45_000 },
  );
  const exploreHud = await page.evaluate(() => {
    const openSource = document.querySelector("#opensource-jump");
    const recruit = document.querySelector("#recruit-jump");
    const openStyle = getComputedStyle(openSource);
    const openRect = openSource.getBoundingClientRect();
    const recruitRect = recruit.getBoundingClientRect();
    return {
      href: openSource.getAttribute("href"),
      label: openSource.textContent?.trim() ?? "",
      display: openStyle.display,
      borderColor: openStyle.borderColor,
      color: openStyle.color,
      backgroundColor: openStyle.backgroundColor,
      openRight: openRect.right,
      recruitLeft: recruitRect.left,
    };
  });
  check(
    exploreHud.href === "/open-source.html" &&
      exploreHud.label === "开源档案" &&
      ["flex", "inline-flex"].includes(exploreHud.display) &&
      exploreHud.borderColor === "rgba(46, 155, 255, 0.45)" &&
      exploreHud.color === "rgb(127, 212, 255)" &&
      exploreHud.backgroundColor === "rgba(46, 155, 255, 0.06)" &&
      exploreHud.openRight <= exploreHud.recruitLeft,
    "desktop EXPLORE shows open-source outline button left of recruit CTA",
    exploreHud,
  );

  await context.close();
}

async function openSourceChecks(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachErrorChecks(page, errors, "open-source");
  const url = new URL("open-source.html", baseUrl);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".project-card").length === 32,
    null,
    { timeout: 12_000 },
  );
  await page.waitForTimeout(180);

  const state = await page.evaluate(() => {
    const buttonStyle = getComputedStyle(document.querySelector(".btn-outline"));
    return {
      cards: document.querySelectorAll(".project-card").length,
      buttonStyle: {
        borderColor: buttonStyle.borderColor,
        color: buttonStyle.color,
        backgroundColor: buttonStyle.backgroundColor,
      },
      sharedChunkCount: performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("space-starfield")).length,
    };
  });
  const paintedPixels = await canvasPixelCount(page, "#warp");
  check(
    state.cards === 32 && paintedPixels > 80,
    "open-source renders all projects over a nonblank shared starfield",
    { ...state, paintedPixels },
  );
  check(
    state.buttonStyle.borderColor === "rgba(46, 155, 255, 0.45)" &&
      state.buttonStyle.color === "rgb(127, 212, 255)" &&
      state.buttonStyle.backgroundColor === "rgba(46, 155, 255, 0.06)",
    "open-source outline button keeps the deep-blue skylight treatment",
    state.buttonStyle,
  );
  check(state.sharedChunkCount === 1, "open-source loads one shared starfield module", state);

  await context.close();
}

async function archiveCardChecks(browser, errors, viewport, label, expectedColumns) {
  const context = await browser.newContext({
    viewport,
    isMobile: label === "mobile",
    hasTouch: label === "mobile",
  });
  const page = await context.newPage();
  attachErrorChecks(page, errors, `archive-${label}`);
  const url = new URL(baseUrl);
  url.searchParams.set("view", "archive");
  url.hash = "archive-hero";
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".archive-stat");

  const cards = await page.evaluate(() => {
    const elements = [...document.querySelectorAll(".archive-stat")];
    const rects = elements.map((element) => element.getBoundingClientRect());
    return {
      count: elements.length,
      gridColumns: getComputedStyle(document.querySelector(".archive-stats"))
        .gridTemplateColumns.split(" ").length,
      styles: elements.map((element) => {
        const style = getComputedStyle(element);
        const numberStyle = getComputedStyle(element.querySelector("b"));
        return {
          backgroundImage: style.backgroundImage,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          numberColor: numberStyle.color,
        };
      }),
      overlap: rects.some((rect, index) =>
        rects.slice(index + 1).some(
          (other) =>
            Math.min(rect.right, other.right) > Math.max(rect.left, other.left) &&
            Math.min(rect.bottom, other.bottom) > Math.max(rect.top, other.top),
        ),
      ),
    };
  });

  check(
    cards.count === 4 &&
      cards.gridColumns === expectedColumns &&
      !cards.overlap &&
      cards.styles.every(
        (style) =>
          style.backgroundImage.includes("linear-gradient") &&
          style.borderRadius === "15px" &&
          style.boxShadow !== "none",
      ) &&
      new Set(cards.styles.map((style) => style.numberColor)).size === 2,
    `${label} WHO WE ARE stats use four non-overlapping dark accent cards`,
    cards,
  );

  await context.close();
}

const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

try {
  await introChecks(browser, errors);
  await openSourceChecks(browser, errors);
  await archiveCardChecks(
    browser,
    errors,
    { width: 1440, height: 900 },
    "desktop",
    2,
  );
  await archiveCardChecks(browser, errors, { width: 320, height: 720 }, "mobile", 1);
  check(errors.length === 0, "requested UI flows produce no page errors", errors);
} finally {
  await browser.close();
}
