import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? process.env.ENTERPRIZE_URL ?? "http://127.0.0.1:5173";
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

const targets = [
  { name: "beyond-arena", align: "start", selector: "#zoom-parallax-section > header" },
  {
    name: "archive-hero-image",
    align: "center",
    selector: ".archive-hero__media > img:first-child",
  },
  { name: "media-record", align: "start", selector: "#archive-media .archive-head" },
  { name: "team-history", align: "start", selector: "#archive-team > .archive-wrap" },
  { name: "team-manifesto", align: "center", selector: "#archive-banner" },
  { name: "unit-archive", align: "start", selector: "#archive-units > .archive-wrap" },
  {
    name: "unit-choice",
    align: "start",
    selector: "#unit-reveal .unit-reveal__text[data-snap-scene]",
  },
  { name: "join-fleet", align: "start", selector: "#archive-join .archive-head" },
  { name: "return-arena", align: "center", selector: "#archive-return .archive-return__inner" },
];

const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForScrollToSettle(page) {
  let previous = Number.NaN;
  let stableFrames = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    await page.waitForTimeout(16);
    const y = await page.evaluate(() => window.scrollY);
    if (Math.abs(y - previous) < 0.25) {
      stableFrames += 1;
      if (stableFrames >= 8) return;
    } else {
      stableFrames = 0;
    }
    previous = y;
  }
  throw new Error("scroll did not settle within 3 seconds");
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu"],
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const url = new URL(baseUrl);
    url.searchParams.set("view", "archive");
    url.hash = "archive-hero";

    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      (count) =>
        document.documentElement.classList.contains("is-document-mode") &&
        window.__ENTERPRIZE_BOOTSTRAP__?.directArchiveReady === true &&
        document.querySelectorAll("[data-snap-scene]").length === count,
      targets.length,
      { timeout: 30_000 },
    );
    await page.evaluate(async () => {
      await document.fonts?.ready;
      const hero = document.querySelector(".archive-hero__media > img:first-child");
      if (hero instanceof HTMLImageElement && !hero.complete) {
        await new Promise((resolve) => {
          hero.addEventListener("load", resolve, { once: true });
          hero.addEventListener("error", resolve, { once: true });
        });
      }
    });
    // Snap geometry is measured after the one-time archive reveal transform ends.
    await page.waitForTimeout(850);

    const contract = await page.evaluate(() => ({
      names: [...document.querySelectorAll("[data-snap-scene]")].map((element) => ({
        name: element.dataset.snapScene,
        align: element.dataset.snapAlign,
      })),
      snapType: getComputedStyle(document.documentElement).scrollSnapType,
      snapPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
      snapPaddingBottom: getComputedStyle(document.documentElement).scrollPaddingBottom,
      unitRevealPosition: getComputedStyle(document.querySelector("#unit-reveal")).position,
      unitRevealIsTarget: document.querySelector("#unit-reveal").hasAttribute("data-snap-scene"),
    }));

    assert(contract.names.length === targets.length, `${viewport.label}: unexpected snap target count`);
    assert(contract.snapType.includes("y"), `${viewport.label}: vertical scroll snap is inactive`);
    assert(contract.snapPaddingTop === "0px", `${viewport.label}: top targets cannot sit flush`);
    assert(contract.snapPaddingBottom === "0px", `${viewport.label}: center targets use a shifted snapport`);
    assert(contract.unitRevealPosition !== "sticky", `${viewport.label}: unit reveal must not be sticky`);
    assert(!contract.unitRevealIsTarget, `${viewport.label}: unit reveal container must not snap`);

    const directLandingDeviation = await page.evaluate(() => {
      const image = document.querySelector('[data-snap-scene="archive-hero-image"]');
      const rect = image.getBoundingClientRect();
      return Number(Math.abs(rect.top - (window.innerHeight - rect.height) / 2).toFixed(2));
    });
    assert(
      directLandingDeviation <= 2,
      `${viewport.label}: direct #archive-hero link missed its image by ${directLandingDeviation}px`,
    );

    for (const target of targets) {
      const matching = contract.names.filter(({ name }) => name === target.name);
      assert(matching.length === 1, `${viewport.label}: ${target.name} must exist exactly once`);
      assert(matching[0].align === target.align, `${viewport.label}: ${target.name} alignment mismatch`);
      const selectorMatches = await page.locator(target.selector).evaluateAll(
        (elements, name) =>
          elements.filter((element) => element.dataset.snapScene === name).length,
        target.name,
      );
      assert(selectorMatches === 1, `${viewport.label}: ${target.name} is attached to the wrong element`);
    }

    const measurements = [];
    for (const target of targets) {
      await page.evaluate(
        ({ name, align }) => {
          const element = document.querySelector(`[data-snap-scene="${name}"]`);
          element.scrollIntoView({ behavior: "auto", block: align, inline: "nearest" });
        },
        target,
      );
      await waitForScrollToSettle(page);

      const measurement = await page.evaluate(({ name, align }) => {
        const element = document.querySelector(`[data-snap-scene="${name}"]`);
        const rect = element.getBoundingClientRect();
        const expectedTop = align === "center" ? (window.innerHeight - rect.height) / 2 : 0;
        return {
          name,
          align,
          actualTop: Number(rect.top.toFixed(2)),
          expectedTop: Number(expectedTop.toFixed(2)),
          deviation: Number(Math.abs(rect.top - expectedTop).toFixed(2)),
          height: Number(rect.height.toFixed(2)),
          scrollY: Number(window.scrollY.toFixed(2)),
        };
      }, target);
      measurements.push(measurement);
      assert(
        measurement.deviation <= 2,
        `${viewport.label}: ${target.name} snap deviation ${measurement.deviation}px`,
      );
    }

    console.log(
      `[${viewport.label}] ${JSON.stringify({ contract, directLandingDeviation, measurements })}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

console.log("[ok] explicit archive snap targets align within 2px at 1440px and 390px");
