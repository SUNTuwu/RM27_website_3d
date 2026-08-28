import { createSpaceStarfield } from "./space-starfield";

/* 开源档案页: 共享恒速星场 + 跃迁 + 项目档案渲染 */
(function () {
  // 与主站一致: 禁 pinch / ctrl-wheel / ctrl± 页面缩放
  function blockZoomWheel(event) {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }
  function blockZoomKeys(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (
      event.key === "+" ||
      event.key === "=" ||
      event.key === "-" ||
      event.key === "_" ||
      event.code === "NumpadAdd" ||
      event.code === "NumpadSubtract" ||
      event.key === "0"
    ) {
      event.preventDefault();
    }
  }
  function blockGesture(event) {
    event.preventDefault();
  }
  window.addEventListener("wheel", blockZoomWheel, { passive: false, capture: true });
  window.addEventListener("keydown", blockZoomKeys, { capture: true });
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
  document.addEventListener("gestureend", blockGesture, { passive: false });

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var navigating = false;

  /* ---------- 星空: 缓慢漂星 + 跃迁拉线, 少量红蓝星点 ---------- */
  var canvas = document.getElementById("warp");
  var starfield = null;
  if (!reduced && canvas) {
    starfield = createSpaceStarfield(canvas);
    if (!starfield) {
      canvas.remove();
    }
  } else if (canvas && reduced) {
    canvas.remove();
  }

  /* ---------- 项目档案 (逻辑与文案同参考页) ---------- */
  var tracks = {
    power: { label: "POWER", tone: "var(--os-gold)" },
    vision: { label: "VISION", tone: "var(--os-cyan)" },
    mechanics: { label: "MECHANICS", tone: "var(--os-purple)" },
    embedded: { label: "EMBEDDED", tone: "var(--os-green)" },
    training: { label: "TRAINING", tone: "var(--os-pink)" },
    other: { label: "OTHER", tone: "var(--os-steel)" },
  };
  var grid = document.getElementById("repo-grid");

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[character];
    });
  }

  function cardTemplate(project) {
    var track = tracks[project.track] || tracks.other;
    var forum = project.articleId
      ? "https://bbs.robomaster.com/article/" + project.articleId
      : null;
    var image = project.image
      ? '<img class="preview" src="' +
        escapeHtml(project.image) +
        '" alt="' +
        escapeHtml(project.imageAlt) +
        '" loading="lazy" decoding="async">'
      : '<div class="preview placeholder" aria-hidden="true"></div>';
    var tags = project.tags
      .map(function (tag) {
        return '<span class="tag">' + escapeHtml(tag) + "</span>";
      })
      .join("");
    var forumLink = forum
      ? '<a class="source" data-warp-link href="' + forum + '">论坛原帖</a>'
      : '<span class="source status">' +
        escapeHtml(project.status || "来源待补充") +
        "</span>";
    var repoLink = project.repository
      ? '<a class="source" data-warp-link href="https://github.com/hkustenterprize/' +
        escapeHtml(project.repository) +
        '">GitHub</a>'
      : "";
    var stars = project.repository
      ? '<div class="metric"><b data-stars>—</b><span>GitHub Stars</span></div>'
      : "";
    var citation = project.articleId
      ? '<div class="metric"><b data-citations>—</b><span>论坛被引用</span></div>'
      : "";
    var credit = project.imageCredit
      ? '<span class="image-credit">' + escapeHtml(project.imageCredit) + "</span>"
      : "";
    var placeholder = project.image
      ? ""
      : '<span class="placeholder-note">PROJECT PREVIEW · PENDING</span>';
    return (
      '<article class="project-card" data-track="' +
      escapeHtml(project.track) +
      '" data-article="' +
      (project.articleId || "") +
      '" data-repository="' +
      (project.repository || "") +
      '" style="--tone:' +
      track.tone +
      '">' +
      image +
      '<span class="index">INDEX ' +
      String(project.index).padStart(2, "0") +
      " · " +
      escapeHtml(project.season) +
      " · " +
      track.label +
      "</span><h3>" +
      escapeHtml(project.title) +
      "</h3><p>" +
      escapeHtml(project.summary) +
      '</p><div class="card-bottom"><div class="tags">' +
      tags +
      '</div><div class="metrics">' +
      stars +
      citation +
      '</div><div class="card-links">' +
      forumLink +
      repoLink +
      credit +
      "</div></div>" +
      placeholder +
      "</article>"
    );
  }

  var projects = window.OPEN_SOURCE_PROJECTS || [];
  grid.innerHTML = projects.map(cardTemplate).join("");

  var buttons = document.querySelectorAll("[data-filter]");
  var cards = document.querySelectorAll(".project-card");
  var empty = document.getElementById("empty-state");
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var filter = button.dataset.filter;
      var visible = 0;
      buttons.forEach(function (item) {
        var selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      cards.forEach(function (card) {
        var show =
          filter === "all" ||
          card.dataset.track === filter ||
          (filter === "training" && card.dataset.track === "other");
        card.hidden = !show;
        if (show) visible++;
      });
      empty.style.display = visible ? "none" : "block";
    });
  });

  function formatMetric(value) {
    return Number.isFinite(Number(value))
      ? Number(value).toLocaleString("en-US")
      : "—";
  }
  function updateMetric(element, value) {
    element.textContent = formatMetric(value);
  }

  fetch("/assets/open-source/data/metrics.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("metrics unavailable");
      return response.json();
    })
    .then(function (data) {
      var repositories = (data.github && data.github.repositories) || {};
      var forumProjects = (data.forum && data.forum.projects) || {};
      document.querySelectorAll("[data-total-stars]").forEach(function (element) {
        updateMetric(element, data.github && data.github.totalTrackedStars);
        element.closest(".stat").dataset.state = "ready";
      });
      document
        .querySelectorAll("[data-archive-citations]")
        .forEach(function (element) {
          updateMetric(
            element,
            data.forum && data.forum.archive && data.forum.archive.citations
          );
          element.closest(".stat").dataset.state = "ready";
        });
      cards.forEach(function (card) {
        var github = repositories[card.dataset.repository];
        var forum = forumProjects[card.dataset.article];
        card.querySelectorAll("[data-stars]").forEach(function (element) {
          updateMetric(element, github && github.stars);
        });
        card.querySelectorAll("[data-citations]").forEach(function (element) {
          updateMetric(element, forum && forum.citations);
        });
      });
      var status = document.getElementById("metrics-status");
      if (data.generatedAt) {
        status.textContent =
          "项目指标最近同步：" +
          new Intl.DateTimeFormat("zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(data.generatedAt)) +
          " · 点击来源可核验原始数据。";
      }
    })
    .catch(function () {
      document.getElementById("metrics-status").textContent =
        "项目指标暂时无法更新；页面保留静态项目索引，请以原始链接为准。";
    });

  /* ---------- 跃迁跳转 ---------- */
  document.querySelectorAll("[data-warp-link]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (
        navigating ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      var destination = link.href;
      if (reduced) {
        window.location.assign(destination);
        return;
      }
      navigating = true;
      starfield?.setBoost(1);
      document.body.classList.add("is-warping");
      setTimeout(function () {
        window.location.assign(destination);
      }, 880);
    });
  });
})();
