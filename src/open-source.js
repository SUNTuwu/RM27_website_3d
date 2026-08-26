/* 开源档案页: 星空 + 跃迁 (Canvas 2D, 复用参考页行为) + 项目档案渲染 */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var warpBoost = 0;
  var targetBoost = 0;
  var navigating = false;

  /* ---------- 星空: 缓慢漂星 + 跃迁拉线, 少量红蓝星点 ---------- */
  var canvas = document.getElementById("warp");
  if (!reduced && canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
    } else {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var width = 0;
      var height = 0;
      var stars = [];
      var STAR_COLORS = [
        { c: "207,228,255", w: 0.7 }, // 主色: 冷白蓝
        { c: "255,45,77", w: 0.12 }, // 红
        { c: "46,155,255", w: 0.18 }, // 蓝
      ];

      function pickColor() {
        var roll = Math.random();
        var acc = 0;
        for (var i = 0; i < STAR_COLORS.length; i++) {
          acc += STAR_COLORS[i].w;
          if (roll <= acc) return STAR_COLORS[i].c;
        }
        return STAR_COLORS[0].c;
      }

      function spawn(deep) {
        var angle = Math.random() * Math.PI * 2;
        var radius = 24 + Math.random() * 350;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: deep ? 1200 : Math.random() * 1200 + 1,
          color: pickColor(),
          twinkle: Math.random() * Math.PI * 2,
        };
      }

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var target = width < 720 ? 240 : 620;
        while (stars.length < target) stars.push(spawn(false));
        stars.length = target;
      }

      resize();
      window.addEventListener("resize", resize, { passive: true });

      var running = true;
      document.addEventListener("visibilitychange", function () {
        running = !document.hidden;
        if (running) requestAnimationFrame(frame);
      });

      var time = 0;
      function frame() {
        if (!running) return;
        time += 1 / 60;
        warpBoost += (targetBoost - warpBoost) * 0.07;
        var velocity = 0.55 + warpBoost * 17;
        var stretch = 4 + warpBoost * 130;
        var fov = 340 / (1 + warpBoost * 0.55);
        var cx = width / 2;
        var cy = height / 2;

        ctx.clearRect(0, 0, width, height);
        ctx.lineCap = "round";

        for (var i = 0; i < stars.length; i++) {
          var star = stars[i];
          star.z -= velocity;
          if (star.z < 4) {
            stars[i] = spawn(true);
            star = stars[i];
          }
          var depth = Math.max(star.z, 4);
          var sx = cx + (star.x / depth) * fov;
          var sy = cy + (star.y / depth) * fov;
          var tailDepth = Math.min(depth + stretch, 1300);
          var tx = cx + (star.x / tailDepth) * fov;
          var ty = cy + (star.y / tailDepth) * fov;
          if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) {
            continue;
          }
          var alpha =
            (0.28 + 0.5 * (1 - depth / 1300)) *
            (0.72 + 0.28 * Math.sin(time * 2.1 + star.twinkle));
          ctx.strokeStyle = "rgba(" + star.color + "," + alpha.toFixed(3) + ")";
          ctx.lineWidth = depth < 260 ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
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
      targetBoost = 1;
      document.body.classList.add("is-warping");
      setTimeout(function () {
        window.location.assign(destination);
      }, 880);
    });
  });
})();
