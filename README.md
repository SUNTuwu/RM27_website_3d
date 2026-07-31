# ENTERPRIZE RM2027 Website

香港科技大学 RoboMaster 战队 **ENTERPRIZE** 的 RM2027 网站、设计迭代与调研资料仓库。

> 当前仓库以网站内容、视觉方向与研究资料为主；发布前应由战队确认比赛成绩、招新状态、联系方式、赞助信息和图片使用授权。

## Repository layout

- `index.html` — 当前的单页招新网站入口。
- `assets/` — 网站运行所需素材、第三方浏览器库，以及可供后续设计迭代使用的视觉素材。
- `data/metrics.json` — 自动同步的 GitHub Stars 与 RoboMaster 论坛引用指标；由 GitHub Actions 定期刷新。
- `scripts/` — 生成受限的 Cloudflare Pages 发布目录，以及刷新公开指标的脚本。
- `functions/_middleware.js` — Cloudflare Pages 全站临时密码门禁；密码通过 Pages 加密 Secret `SITE_PASSWORD` 配置，不进入 Git，访问者不需要用户名。
- `drafts/homepage/` — 首页的历史设计草稿（`index-v1.html`、`index-v2.html`）。
- `research/` — 网站策略、战队资料与竞品调研信息，仅供内部内容和设计决策参考。
- `tests/legacy/` — 历史 Playwright 浏览器检查脚本；尚未整理为 CI 测试套件。

## Local preview

The site is static. For full development preview from the repository root, run:

```bash
python -m http.server 8377
```

Then open <http://127.0.0.1:8377/>.

For the production-equivalent Cloudflare Pages artifact, build the explicit public allowlist instead:

```bash
node scripts/build-site.mjs
python -m http.server 8377 --directory site
```

Only `site/` is intended for public deployment. See [Cloudflare Pages deployment](docs/cloudflare-pages.md) for the dashboard configuration and pre-release requirements.

## Legacy browser checks

The scripts in `tests/legacy/` require Node.js and Playwright. After installing Playwright locally, run a script while the preview server is running:

```bash
node tests/legacy/homepage-smoke.js
```

These scripts currently create screenshots and log observations. They are retained as migration-era QA references and should be converted to deterministic assertions before CI is introduced.

## Contribution conventions

- Make every change through a new Git commit; do not rewrite the initial migration history.
- Use Conventional Commit-style subjects, for example: `feat: add sponsorship landing page` or `fix: improve mobile navigation`.
- Keep the production site self-contained under the repository root unless a future refactor introduces a documented build/deployment structure.
- Do not commit temporary working files, generated screenshots, local credentials, or unapproved personal data.

## Third-party browser libraries

The current page vendors browser bundles under `assets/vendor/`:

- Three.js (r128, MIT License)
- GSAP and ScrollTrigger (v3.12.5; see GreenSock licensing terms)
- Lenis (v1.0.42; retain its upstream license information when upgrading or repackaging)

Before public deployment, confirm the applicable licensing terms and keep any required notices.
