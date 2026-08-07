import { VISUAL_CONFIG } from "../config.js";

const STATE_META = {
  boot: {
    index: "00",
    label: "BOOT SEQUENCE",
    hint: "INITIALIZING RENDERER…",
  },
  assemble: {
    index: "01",
    label: "POINT CLOUD",
    hint: "SYNCHRONIZING POINT CLOUD…",
  },
  explore: {
    index: "01",
    label: "POINT CLOUD",
    hint: "<b>CLICK</b> PULSE WAVE &nbsp;·&nbsp; <b>DRAG</b> ORBIT VIEW &nbsp;·&nbsp; <b>SCROLL</b> INITIATE SCAN",
  },
  scan: {
    index: "02",
    label: "X-SCAN",
    hint: "DEPTH SCAN IN PROGRESS…",
  },
  scrub: {
    index: "03",
    label: "TIMELINE_0",
    hint: "<b>SCROLL</b> DRIVE TIMELINE &nbsp;·&nbsp; <b>CLICK ROBOT</b> FOCUS UNIT",
  },
  focus: {
    index: "04",
    label: "UNIT FOCUS",
    hint: "<b>DRAG</b> ORBIT UNIT &nbsp;·&nbsp; <b>RELEASE</b> RECENTER &nbsp;·&nbsp; <b>SCROLL</b> EXIT FOCUS",
  },
};

export function createHud() {
  const app = document.querySelector("#app");
  const brandMarkConfig = VISUAL_CONFIG.explore.brandMark;
  const configuredBrandOpacity = Number(
    brandMarkConfig.opacity,
  );
  const brandOpacity = Number.isFinite(configuredBrandOpacity)
    ? Math.min(Math.max(configuredBrandOpacity, 0), 1)
    : 0.16;
  app.style.setProperty("--explore-brand-opacity", String(brandOpacity));

  const setBrandColor = (property, value, fallback) => {
    const resolvedValue =
      typeof value === "string" && CSS.supports("color", value)
        ? value
        : fallback;
    app.style.setProperty(property, resolvedValue);
  };
  setBrandColor(
    "--explore-brand-color-start",
    brandMarkConfig.colors?.start,
    "#ff2d4d",
  );
  setBrandColor(
    "--explore-brand-color-middle",
    brandMarkConfig.colors?.middle,
    "#d54488",
  );
  setBrandColor(
    "--explore-brand-color-end",
    brandMarkConfig.colors?.end,
    "#2e9bff",
  );

  const setBrandDimension = (property, value, fallback, unit) => {
    const numericValue = Number(value);
    const resolvedValue = Number.isFinite(numericValue)
      ? numericValue
      : fallback;
    app.style.setProperty(property, `${resolvedValue}${unit}`);
  };
  setBrandDimension(
    "--explore-brand-right",
    brandMarkConfig.position.rightVw,
    3.4,
    "vw",
  );
  setBrandDimension(
    "--explore-brand-top",
    brandMarkConfig.position.topVh,
    50,
    "vh",
  );
  setBrandDimension(
    "--explore-brand-width",
    brandMarkConfig.size.widthVw,
    60,
    "vw",
  );
  setBrandDimension(
    "--explore-brand-min-width",
    brandMarkConfig.size.minWidthPx,
    600,
    "px",
  );
  setBrandDimension(
    "--explore-brand-max-width",
    brandMarkConfig.size.maxWidthPx,
    1040,
    "px",
  );
  setBrandDimension(
    "--explore-brand-max-height",
    brandMarkConfig.size.maxHeightVh,
    120,
    "vh",
  );
  setBrandDimension(
    "--explore-brand-gradient-angle",
    brandMarkConfig.rhythm.gradientAngleDeg,
    135,
    "deg",
  );
  setBrandDimension(
    "--explore-brand-rhythm-duration",
    brandMarkConfig.rhythm.durationSeconds,
    3.2,
    "s",
  );
  const stateIndex = document.querySelector("#state-index");
  const stateLabel = document.querySelector("#state-label");
  const hintText = document.querySelector("#hint-text");
  const timelineHud = document.querySelector("#timeline-hud");
  const timelineFill = document.querySelector("#timeline-fill");
  const timelinePct = document.querySelector("#timeline-pct");
  const loadingScreen = document.querySelector("#loading-screen");
  const loadingFill = document.querySelector("#loading-bar-fill");
  const loadingPercent = document.querySelector("#loading-percent");
  const loadingDetail = document.querySelector("#loading-detail");
  const mobileScreen = document.querySelector("#mobile-screen");
  const errorScreen = document.querySelector("#error-screen");
  const errorMessage = document.querySelector("#error-message");
  const fpsReadout = document.querySelector("#fps-readout");
  const exploreName = document.querySelector("#explore-name");
  const exploreLabel = document.querySelector("#explore-label");
  const exploreIndex = document.querySelector("#explore-index");
  const exploreSegments = document.querySelector("#explore-segments");
  const exploreDesc = document.querySelector("#explore-desc");
  const explorePrev = document.querySelector("#explore-prev");
  const exploreNext = document.querySelector("#explore-next");

  return {
    setState(state) {
      const meta = STATE_META[state];
      if (!meta) {
        return;
      }
      app.dataset.state = state;
      stateIndex.textContent = meta.index;
      stateLabel.textContent = meta.label;
      hintText.innerHTML = meta.hint;
      timelineHud.hidden = !(state === "scrub" || state === "focus");
    },
    setLoading(ratio, detail) {
      const percent = Math.round(Math.min(ratio, 1) * 100);
      loadingFill.style.width = `${percent}%`;
      loadingPercent.textContent = `${String(percent).padStart(3, "0")}%`;
      if (detail) {
        const short = detail.split("/").pop();
        loadingDetail.textContent = short || detail;
      }
    },
    finishLoading() {
      loadingScreen.classList.add("is-done");
    },
    setTimeline(progress) {
      const percent = Math.round(progress * 100);
      timelineFill.style.width = `${percent}%`;
      timelinePct.textContent = `${String(percent).padStart(3, "0")}%`;
    },
    setExploreModel(index, total, name, desc) {
      exploreName.textContent = name;
      exploreLabel.textContent = name;
      exploreIndex.textContent = `${index + 1} / ${total}`;
      exploreDesc.textContent = desc ?? "";
      exploreSegments.innerHTML = "";
      for (let i = 0; i < total; i += 1) {
        const seg = document.createElement("i");
        if (i === index) {
          seg.className = "active";
        }
        exploreSegments.appendChild(seg);
      }
    },
    setExploreSwitchHandler(handler) {
      explorePrev.addEventListener("click", () => handler(-1));
      exploreNext.addEventListener("click", () => handler(1));
    },
    setFps(value) {
      fpsReadout.textContent = `${value} FPS`;
    },
    showMobile() {
      app.dataset.state = "mobile";
      mobileScreen.hidden = false;
      loadingScreen.classList.add("is-done");
    },
    showError(error) {
      errorScreen.hidden = false;
      errorMessage.textContent = error?.message ?? String(error);
      loadingScreen.classList.add("is-done");
    },
  };
}
