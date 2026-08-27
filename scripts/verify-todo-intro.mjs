import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const targetUrl = new URL(
  process.argv[2] ?? "http://127.0.0.1:5173/",
);
targetUrl.searchParams.set("intro", "1");

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

async function revealIntroCompletion(page) {
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
          const hint = document.querySelector("[data-intro-mobile-hint]");
          const typedRect = typed?.getBoundingClientRect();
          const copyRect = copy?.getBoundingClientRect();
          const wrapperRect = wrapper?.getBoundingClientRect();
          const buttonRect = button?.getBoundingClientRect();
          const hintRect = hint?.getBoundingClientRect();
          const hintStyle = hint ? getComputedStyle(hint) : null;
          const sample = {
            elapsed: now - startedAt,
            stage: stageRoot?.dataset.introCompletionStage ?? null,
            typedTop: typedRect?.top ?? null,
            copyOpacity: copy ? Number(getComputedStyle(copy).opacity) : null,
            ctaOpacity: wrapper
              ? Number(getComputedStyle(wrapper).opacity)
              : null,
            hintOpacity: hintStyle ? Number(hintStyle.opacity) : null,
            hintVisible: hintStyle?.display !== "none",
            disabled: button?.disabled ?? null,
            tabIndex: button?.tabIndex ?? null,
            pointerEvents: wrapper
              ? getComputedStyle(wrapper).pointerEvents
              : null,
            left: buttonRect?.left ?? null,
            right: buttonRect?.right ?? null,
            top: buttonRect?.top ?? null,
            bottom: buttonRect?.bottom ?? null,
            width: buttonRect?.width ?? null,
            height: buttonRect?.height ?? null,
            copyGap:
              wrapperRect && copyRect
                ? wrapperRect.top - copyRect.bottom
                : null,
            hintGap:
              hintRect && buttonRect ? hintRect.top - buttonRect.bottom : null,
            hintBottom: hintRect?.bottom ?? null,
          };
          samples.push(sample);

          const hintDone =
            !sample.hintVisible || (sample.hintOpacity ?? 0) >= 0.95;
          if (
            (sample.stage === "ready" &&
              (sample.ctaOpacity ?? 0) >= 0.98 &&
              hintDone) ||
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

function checkCompletionSequence(sequence, label, { reduced = false } = {}) {
  const first = sequence.samples[0];
  const final = sequence.samples.at(-1);
  const copyStart = sequence.samples.find((sample) => sample.copyOpacity > 0.02);
  const ctaStart = sequence.samples.find((sample) => sample.ctaOpacity > 0.02);
  const beforeReady = sequence.samples.filter(
    (sample) => sample.stage !== "ready",
  );

  check(
    first?.copyOpacity <= 0.02 && first?.ctaOpacity <= 0.02,
    `${label} completion copy mounts without a visible flash`,
    { first, beforeTop: sequence.beforeTop },
  );
  if (!reduced) {
    check(
      Math.abs(first.typedTop - sequence.beforeTop) <= 3 &&
        final.typedTop < sequence.beforeTop - 8 &&
        copyStart?.elapsed >= 350,
      `${label} typed copy moves continuously before the Chinese reveal`,
      { first, final, copyStart, beforeTop: sequence.beforeTop },
    );
  }
  check(
    copyStart &&
      ctaStart &&
      ctaStart.elapsed > copyStart.elapsed &&
      ctaStart.copyOpacity >= 0.9,
    `${label} CTA starts only after the Chinese copy has faded in`,
    { copyStart, ctaStart },
  );
  check(
    beforeReady.length > 0 &&
      beforeReady.every(
        (sample) =>
          sample.disabled === true &&
          sample.tabIndex === -1 &&
          sample.pointerEvents === "none",
      ) &&
      final.stage === "ready" &&
      final.disabled === false &&
      final.tabIndex === 0 &&
      final.pointerEvents === "auto",
    `${label} hidden and fading CTA remains non-interactive`,
    { beforeReady: beforeReady.at(-1), final },
  );
  return final;
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 320, height: 720 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForSelector("[data-intro-archive]");
  const earlyLinks = await page.evaluate(() => ({
    archive: getComputedStyle(document.querySelector("[data-intro-archive]")).visibility,
    openSource: getComputedStyle(
      document.querySelector("[data-intro-open-source]"),
    ).visibility,
    runtimeImportStarted:
      window.__ENTERPRIZE_BOOTSTRAP__?.runtimeImportStarted ?? null,
  }));
  check(
    earlyLinks.archive === "visible" &&
      earlyLinks.openSource === "visible" &&
      earlyLinks.runtimeImportStarted === false,
    "Intro shortcuts are visible before the 3D runtime import",
    earlyLinks,
  );

  const sequence320 = await revealIntroCompletion(page);
  const final320 = checkCompletionSequence(sequence320, "320px Intro");
  const layout = await page.evaluate(() => {
    const button = document.querySelector("[data-intro-cta]");
    const rect = button?.getBoundingClientRect();
    const style = button ? getComputedStyle(button) : null;
    const copy = document.querySelector("[data-intro-origin-copy]");
    const shortcutStyle = getComputedStyle(
      document.querySelector("[data-intro-open-source]"),
    );
    const shortcutRects = [
      ...document.querySelectorAll(".intro-outline-link"),
    ].map((element) => element.getBoundingClientRect());
    const starfield = document.querySelector("[data-intro-starfield]");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      left: rect?.left ?? null,
      right: rect?.right ?? null,
      top: rect?.top ?? null,
      bottom: rect?.bottom ?? null,
      width: rect?.width ?? null,
      height: rect?.height ?? null,
      scrollWidth: button?.scrollWidth ?? null,
      clientWidth: button?.clientWidth ?? null,
      paddingLeft: Number.parseFloat(style?.paddingLeft ?? "0"),
      paddingRight: Number.parseFloat(style?.paddingRight ?? "0"),
      copyColor: copy ? getComputedStyle(copy).color : null,
      shortcutBorderColor: shortcutStyle.borderColor,
      shortcutColor: shortcutStyle.color,
      shortcutPadding: shortcutStyle.padding,
      shortcutsDoNotOverlap:
        shortcutRects.length === 2 && shortcutRects[0].right <= shortcutRects[1].left,
      hasNebula: Boolean(document.querySelector("[data-intro-nebula]")),
      starfieldWidth: starfield?.width ?? 0,
      starfieldHeight: starfield?.height ?? 0,
      busy: button?.getAttribute("aria-busy") ?? null,
      progressValue: button
        ?.querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow") ?? null,
    };
  });

  check(
    layout.left >= 0 &&
      layout.right <= layout.viewportWidth &&
      layout.top >= 0 &&
      layout.bottom <= layout.viewportHeight &&
      layout.scrollWidth <= layout.clientWidth,
    "320px Intro CTA and its content fit without viewport clipping",
    layout,
  );
  check(
    layout.width >= layout.viewportWidth * 0.85 &&
      layout.height >= 72 &&
      layout.paddingLeft >= 32 &&
      layout.paddingRight >= 32,
    "Intro CTA keeps the enlarged frame and generous horizontal spacing",
    layout,
  );
  check(
    final320.copyGap >= 46 &&
      final320.copyGap <= 50 &&
      layout.copyColor === "rgb(184, 194, 207)",
    "320px Intro CTA keeps the tightened 48px copy gap and light-gray copy",
    { final320, layout },
  );
  check(
    final320.hintGap >= 52 &&
      final320.hintBottom <= layout.viewportHeight,
    "touch guidance clears the CTA shadow and remains inside the viewport",
    { final320, layout },
  );
  check(
    layout.shortcutBorderColor === "rgba(46, 155, 255, 0.45)" &&
      layout.shortcutColor === "rgb(127, 212, 255)" &&
      layout.shortcutPadding === "11px 22px" &&
      layout.shortcutsDoNotOverlap,
    "Intro shortcuts match the open-source outline button treatment",
    layout,
  );
  check(
    layout.hasNebula && layout.starfieldWidth > 0 && layout.starfieldHeight > 0,
    "Intro renders the shared open-source nebula and starfield from first paint",
    layout,
  );
  check(
    ["true", "false"].includes(layout.busy) &&
      Number(layout.progressValue) >= 0,
    "Intro CTA exposes a valid loading progress state",
    layout,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const sequence390 = await revealIntroCompletion(page);
  const final390 = checkCompletionSequence(sequence390, "390px Intro");
  check(
    final390.left >= 0 &&
      final390.right <= 390 &&
      final390.top >= 0 &&
      final390.bottom <= 844 &&
      final390.copyGap >= 46 &&
      final390.copyGap <= 50 &&
      final390.hintBottom <= 844,
    "390px Intro completion layout fits with the tightened copy gap",
    final390,
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const reducedSequence = await revealIntroCompletion(page);
  const reducedFinal = checkCompletionSequence(
    reducedSequence,
    "reduced-motion Intro",
    { reduced: true },
  );
  check(
    reducedFinal.left >= 0 &&
      reducedFinal.right <= 390 &&
      reducedFinal.top >= 0 &&
      reducedFinal.bottom <= 844 &&
      reducedFinal.copyGap >= 46 &&
      reducedFinal.copyGap <= 50,
    "reduced-motion completion preserves layout and staged opacity reveals",
    reducedFinal,
  );
} finally {
  await context.close();
  await browser.close();
}
