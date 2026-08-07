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
