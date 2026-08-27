/**
 * 2D 点击引导圈 (通用组件):
 * 动态韵律收缩的圆圈, 用于引导用户点击屏幕上的目标位置。
 * 纯 DOM/CSS 实现, 与 3D 场景解耦; 通过 setPosition 跟随屏幕坐标,
 * 保持为通用的屏幕空间点击引导组件。
 */
export function createPulseGuide({
  mount = document.querySelector("#app"),
  size = 120,
  rhythmSeconds = 1.6,
  fadeSeconds = 0.45,
  color,
} = {}) {
  const element = document.createElement("div");
  element.className = "pulse-guide";
  element.setAttribute("aria-hidden", "true");
  element.style.setProperty("--pulse-guide-size", `${size}px`);
  element.style.setProperty("--pulse-guide-rhythm", `${rhythmSeconds}s`);
  element.style.setProperty("--pulse-guide-fade", `${fadeSeconds}s`);
  if (color) {
    element.style.setProperty("--pulse-guide-ring", color);
    element.style.setProperty("--pulse-guide-core", color);
  }

  const ringA = document.createElement("span");
  ringA.className = "pulse-guide__ring";
  const ringB = document.createElement("span");
  ringB.className = "pulse-guide__ring pulse-guide__ring--beat";
  const core = document.createElement("span");
  core.className = "pulse-guide__core";
  element.append(ringA, ringB, core);
  mount.appendChild(element);

  let visible = false;

  return {
    element,
    get visible() {
      return visible;
    },
    show() {
      if (!visible) {
        visible = true;
        element.classList.add("is-visible");
      }
    },
    hide() {
      if (visible) {
        visible = false;
        element.classList.remove("is-visible");
      }
    },
    // 屏幕像素坐标 (圆圈中心), 每帧调用以跟随 3D 投影点
    setPosition(x, y) {
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },
    destroy() {
      element.remove();
    },
  };
}
