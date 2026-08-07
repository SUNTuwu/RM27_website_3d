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

  // EXPLORE 右侧滚动引导: 白线数量 / 流星依次下落间隔 / 各阶段时长均由 config 驱动,
  // 关键帧百分比依赖周期时长, 故在此动态生成
  const setupScrollCue = () => {
    const cue = document.querySelector("#scroll-cue");
    const linesBox = document.querySelector("#scroll-cue-lines");
    const textEl = document.querySelector("#scroll-cue-text");
    if (!cue || !linesBox) return;
    const cfg = VISUAL_CONFIG.explore.scrollCue ?? {};
    const num = (value, fallback) =>
      Number.isFinite(Number(value)) ? Number(value) : fallback;
    const cycle = Math.max(num(cfg.cycleSeconds, 10), 0.1);
    const meteorDuration = Math.max(num(cfg.meteorDurationSeconds, 1.7), 0.1);
    const meteorLength = Math.max(num(cfg.meteorLengthPx, 110), 10);
    const stagger = Math.max(num(cfg.staggerSeconds, 0.5), 0);
    const lineCount = Math.min(Math.max(Math.round(num(cfg.lineCount, 5)), 1), 12);
    const textDelay = Math.max(num(cfg.textDelaySeconds, 1.4), 0);
    const textFadeIn = Math.max(num(cfg.textFadeInSeconds, 1.2), 0.1);
    const textHold = Math.max(num(cfg.textHoldSeconds, 2.0), 0);
    const textFadeOut = Math.max(num(cfg.textFadeOutSeconds, 0.9), 0.1);
    const textTopOffset = num(cfg.textTopOffsetPx, 170);
    const dropIn = num(cfg.textDropInPx, 56);
    const dropOut = num(cfg.textDropOutPx, 88);

    const pct = (seconds) => `${((seconds / cycle) * 100).toFixed(3)}%`;
    const textInStart = textDelay;
    const textInEnd = textInStart + textFadeIn;
    const textHoldEnd = textInEnd + textHold;
    const textOutEnd = textHoldEnd + textFadeOut;

    const style = document.createElement("style");
    style.dataset.scrollCue = "true";
    style.textContent = `
@keyframes scroll-cue-meteor {
  0% { top: ${-meteorLength}px; opacity: 0; }
  ${pct(meteorDuration * 0.18)} { opacity: 1; }
  ${pct(meteorDuration)} { top: 100%; opacity: 1; }
  ${pct(meteorDuration + 0.15)} { top: 100%; opacity: 0; }
  100% { top: ${-meteorLength}px; opacity: 0; }
}
@keyframes scroll-cue-text {
  0%, ${pct(textInStart)} { opacity: 0; transform: translateY(${textTopOffset - dropIn}px); }
  ${pct(textInEnd)} { opacity: 1; transform: translateY(${textTopOffset}px); }
  ${pct(textHoldEnd)} { opacity: 1; transform: translateY(${textTopOffset}px); }
  ${pct(textOutEnd)} { opacity: 0; transform: translateY(${textTopOffset + dropOut}px); }
  100% { opacity: 0; transform: translateY(${textTopOffset + dropOut}px); }
}`;
    document.head.appendChild(style);

    cue.style.setProperty("--scroll-cue-cycle", `${cycle}s`);
    cue.style.setProperty("--scroll-cue-meteor-length", `${meteorLength}px`);
    cue.style.setProperty("--scroll-cue-right", `${num(cfg.rightVw, 33.3)}vw`);
    cue.style.setProperty(
      "--scroll-cue-line-width",
      `${Math.max(num(cfg.lineWidthPx, 3), 1)}px`,
    );
    cue.style.setProperty(
      "--scroll-cue-line-opacity",
      String(Math.min(Math.max(num(cfg.lineOpacity, 0.14), 0), 1)),
    );
    cue.style.setProperty(
      "--scroll-cue-font-size",
      `${Math.max(num(cfg.textFontSizePx, 20), 8)}px`,
    );
    if (textEl) {
      if (typeof cfg.text === "string" && cfg.text.trim()) {
        textEl.textContent = cfg.text;
      }
    }
    linesBox.replaceChildren();
    // 左长右短: 每根线高 = 容器高 * lengthDecay^i
    const decay = Math.min(Math.max(num(cfg.lengthDecay, 0.82), 0.1), 1);
    for (let i = 0; i < lineCount; i += 1) {
      const line = document.createElement("i");
      line.style.height = `${(Math.pow(decay, i) * 100).toFixed(2)}%`;
      line.style.setProperty(
        "--scroll-cue-delay",
        `${(i * stagger).toFixed(2)}s`,
      );
      linesBox.appendChild(line);
    }
  };
  setupScrollCue();

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
  const keyPrev = document.querySelector("#key-prev");
  const keySpace = document.querySelector("#key-space");
  const keyNext = document.querySelector("#key-next");

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
      // 左下角按键方块与键盘行为一致 (Space = 上一款); 点击后失焦,
      // 避免焦点停留在按钮上时按空格同时触发 click 与 keydown 双重切换
      keyPrev.addEventListener("click", (event) => {
        handler(-1);
        event.currentTarget.blur();
      });
      keySpace.addEventListener("click", (event) => {
        handler(-1);
        event.currentTarget.blur();
      });
      keyNext.addEventListener("click", (event) => {
        handler(1);
        event.currentTarget.blur();
      });
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
