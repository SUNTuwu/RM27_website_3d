// 2D 战队档案 (unit-site): 滚动 reveal、章节导航、FAQ 对话框与 3D 返场。
// 不依赖 Three.js/GSAP; 移动端不启动 3D 时同样完整可用。
// 队员心声改为 React 岛渲染 (#stagger-testimonials-root, 见 ui/staggerTestimonials.tsx)。

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

/* ---------- 滚动 reveal + 数字滚动 ---------- */

function setupReveals(root) {
  const targets = root.querySelectorAll(".reveal");
  if (REDUCED_MOTION.matches || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    root.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = el.dataset.count;
    });
    return;
  }

  const countObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countObserver.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.count);
        const startedAt = performance.now();
        const tick = (now) => {
          const p = clamp01((now - startedAt) / 1100);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(end * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.6 },
  );

  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );

  targets.forEach((el) => revealObserver.observe(el));
  root.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));
}

/* ---------- 章节导航: 滚动侦测 + 点击跳转 ---------- */

function setupChapterNav(root, nav) {
  const chapters = [...root.querySelectorAll("[data-chapter]")];
  const chapterAnchors = new Map(
    chapters.map((chapter) => [
      chapter,
      chapter.matches("[data-snap-scene]")
        ? chapter
        : (chapter.querySelector("[data-snap-scene]") ?? chapter),
    ]),
  );
  const buttons = chapters.map((chapter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-nav__item";
    button.setAttribute(
      "aria-label",
      `${chapter.dataset.num} ${chapter.dataset.name} · ${chapter.dataset.cn}`,
    );
    button.innerHTML =
      `<span class="archive-nav__num">${chapter.dataset.num}</span>` +
      `<span class="archive-nav__label">${chapter.dataset.name}</span>` +
      `<span class="archive-nav__dot" aria-hidden="true"></span>`;
    button.addEventListener("click", () => {
      chapterAnchors.get(chapter).scrollIntoView({
        behavior: REDUCED_MOTION.matches ? "auto" : "smooth",
        block: "start",
      });
    });
    nav.appendChild(button);
    return button;
  });

  if (!("IntersectionObserver" in window)) return;
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = chapters.indexOf(entry.target);
        buttons.forEach((button, i) => {
          button.classList.toggle("is-active", i === index);
        });
      }
    },
    { rootMargin: "-42% 0px -42% 0px" },
  );
  chapters.forEach((chapter) => spy.observe(chapter));
}

/* ---------- 阅读进度条 ---------- */

function setupProgress(root, fill) {
  let ticking = false;
  const update = () => {
    ticking = false;
    const start = root.offsetTop;
    const span = Math.max(root.scrollHeight - window.innerHeight, 1);
    const progress = clamp01(
      (window.scrollY - start + window.innerHeight * 0.2) / span,
    );
    fill.style.transform = `scaleX(${progress.toFixed(4)})`;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

function setupArchiveActivation(root) {
  const update = () => {
    const rect = root.getBoundingClientRect();
    const active = rect.top <= window.innerHeight * 0.25 && rect.bottom > 0;
    root.classList.toggle("is-archive-active", active);
  };

  onScrub(update);
}

/* ---------- 滚动 scrub 公用: rAF 节流的 scroll/resize 驱动 ---------- */

function onScrub(update) {
  let ticking = false;
  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
}

/* ---------- 视频 facade: iframe 真正需要时再创建 ---------- */

function setupVideoFacades(root) {
  const frames = [...root.querySelectorAll("iframe[data-src]")];
  if (!frames.length) {
    return;
  }

  const hydrate = (frame) => {
    if (frame.src || !frame.dataset.src) {
      return;
    }
    frame.src = frame.dataset.src;
    frame.dataset.videoHydrated = "true";
    const facade = frame.parentElement?.querySelector("[data-video-facade]");
    if (facade) {
      facade.hidden = true;
    }
  };

  frames.forEach((frame) => {
    const facade = frame.parentElement?.querySelector("[data-video-facade]");
    facade?.addEventListener("click", () => hydrate(frame));
  });

  const autoFrames = frames.filter((frame) =>
    frame.hasAttribute("data-video-autoload"),
  );
  if (!autoFrames.length || !("IntersectionObserver" in window)) {
    return;
  }

  const targetToFrame = new WeakMap();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const frame = targetToFrame.get(entry.target);
        if (frame) {
          hydrate(frame);
        }
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "150% 0px 80% 0px", threshold: 0.01 },
  );

  autoFrames.forEach((frame) => {
    const target =
      frame.closest(".archive-media__player, .archive-media-row__visual") ??
      frame;
    targetToFrame.set(target, frame);
    observer.observe(target);
  });
}

/* ---------- 兵种图文揭示: GIF 裁切展开 (scrub) + 悬停跟随大图 ---------- */

function setupUnitReveal(root) {
  const moduleEl = root.querySelector("[data-unit-reveal]");
  if (!moduleEl) return;

  const medias = [...moduleEl.querySelectorAll(".unit-reveal__media")];

  // 每行 GIF 宽度随滚动从 0 展开 (对应 ScrollTrigger start 'top 85%' / end 'top 40%')
  if (!REDUCED_MOTION.matches) {
    onScrub(() => {
      const vh = window.innerHeight;
      for (const media of medias) {
        const top = media.getBoundingClientRect().top;
        const progress = clamp01((vh * 0.85 - top) / (vh * 0.45));
        media.style.setProperty("--p", progress.toFixed(3));
      }
    });
  }

  // 悬停跟随大图: 仅精确指针设备, lerp 平滑跟随
  const follower = moduleEl.querySelector("#unit-reveal-follower");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  if (!follower || REDUCED_MOTION.matches || !finePointer.matches) return;

  const followerImg = follower.querySelector("img");
  let active = false;
  let raf = 0;
  let idleFrames = 0;
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let posX = targetX;
  let posY = targetY;
  let scale = 0.85;

  const frame = () => {
    posX += (targetX - posX) * 0.18;
    posY += (targetY - posY) * 0.18;
    scale += ((active ? 1 : 0.85) - scale) * 0.18;
    follower.style.transform =
      `translate3d(${posX.toFixed(1)}px, ${posY.toFixed(1)}px, 0) ` +
      `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    idleFrames = active ? 0 : idleFrames + 1;
    if (active || idleFrames < 24) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
    }
  };

  window.addEventListener(
    "mousemove",
    (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
    },
    { passive: true },
  );

  medias.forEach((media) => {
    media.addEventListener("mouseenter", () => {
      const src = media.dataset.followSrc;
      if (src && followerImg.getAttribute("src") !== src) {
        followerImg.src = src;
      }
      if (!active) {
        posX = targetX;
        posY = targetY;
      }
      active = true;
      follower.classList.add("is-on");
      if (!raf) raf = requestAnimationFrame(frame);
    });
    media.addEventListener("mouseleave", () => {
      active = false;
      follower.classList.remove("is-on");
    });
  });
}

/* ---------- RETURN 两侧半透明大字: 滚动时向外扩散显现 ---------- */

function setupReturnGhosts(root) {
  const section = root.querySelector("#archive-return");
  if (!section || REDUCED_MOTION.matches) return;
  const left = section.querySelector('[data-ghost="left"]');
  const right = section.querySelector('[data-ghost="right"]');
  if (!left || !right) return;

  onScrub(() => {
    const vh = window.innerHeight;
    const top = section.getBoundingClientRect().top;
    const progress = clamp01((vh * 0.92 - top) / (vh * 0.55));
    const eased = 1 - Math.pow(1 - progress, 2);
    const spread = Math.min(window.innerWidth * 0.22, 300) * (1 - eased);
    const scale = (0.92 + 0.08 * eased).toFixed(3);
    const opacity = eased.toFixed(3);
    left.style.transform = `translate3d(${spread.toFixed(1)}px, -50%, 0) scale(${scale})`;
    right.style.transform = `translate3d(${(-spread).toFixed(1)}px, -50%, 0) scale(${scale})`;
    left.style.opacity = opacity;
    right.style.opacity = opacity;
  });
}

/* ---------- FAQ：对话框点击交互 ---------- */

function setupFaq(root) {
  const container = root.querySelector("[data-faq]");
  if (!container) return;

  const items = [...container.querySelectorAll(".archive-faq__item")];

  function open(item) {
    const wasOpen = item.classList.contains("is-open");
    items.forEach((i) => i.classList.remove("is-open"));
    if (!wasOpen) item.classList.add("is-open");
  }

  items.forEach((item) => {
    const question = item.querySelector(".archive-faq__question");
    question.addEventListener("click", () => open(item));
    question.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(item);
      }
    });
    question.setAttribute("tabindex", "0");
    question.setAttribute("role", "button");
    question.setAttribute("aria-expanded", "false");
  });

  container.addEventListener("click", (event) => {
    const item = event.target.closest(".archive-faq__item");
    if (!item) return;
    const question = item.querySelector(".archive-faq__question");
    if (event.target.closest(".archive-faq__question") === question) return;
    open(item);
  });

  // 同步 aria-expanded
  const mo = new MutationObserver((records) => {
    for (const record of records) {
      const item = record.target;
      const question = item.querySelector(".archive-faq__question");
      question.setAttribute(
        "aria-expanded",
        item.classList.contains("is-open") ? "true" : "false",
      );
    }
  });
  items.forEach((item) => mo.observe(item, { attributes: true, attributeFilter: ["class"] }));
}

/* ---------- 主装配 ---------- */

/* 兵种图集: 触屏无 hover, 点按切换展开态 (桌面 hover 由 CSS 处理) */
function setupUnitStack(root) {
  const stack = root.querySelector(".unit-stack");
  if (!stack) {
    return;
  }
  const slots = [...stack.querySelectorAll(".unit-slot")];
  slots.forEach((slot) => {
    slot.addEventListener("click", () => {
      const active = slot.classList.contains("is-active");
      slots.forEach((item) => item.classList.remove("is-active"));
      slot.classList.toggle("is-active", !active);
    });
  });
}

export function createUnitSite({ onReturnToArena } = {}) {
  const root = document.querySelector("#unit-site");
  if (!root) {
    return { setReturnHandler() {} };
  }

  let returnHandler =
    typeof onReturnToArena === "function"
      ? onReturnToArena
      : () => window.scrollTo({ top: 0, behavior: "smooth" });

  setupReveals(root);
  setupChapterNav(root, root.querySelector("#archive-nav"));
  setupProgress(root, root.querySelector("#archive-progress-fill"));
  setupArchiveActivation(root);
  setupVideoFacades(root);
  setupUnitReveal(root);
  setupUnitStack(root);
  setupReturnGhosts(root);
  setupFaq(root);

  root.addEventListener("click", (event) => {
    const returnButton = event.target.closest('[data-action="return-arena"]');
    if (returnButton) {
      returnHandler();
    }
  });

  return {
    setReturnHandler(handler) {
      if (typeof handler === "function") {
        returnHandler = handler;
      }
    },
  };
}
