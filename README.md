# ENTERPRIZE RM2027 Website

香港科技大学 ENTERPRIZE RoboMaster 战队 RM2027 网站。项目包含 Three.js 3D 交互体验、战队档案页与开源项目档案页。

## Local development

环境要求：Node.js `^20.19.0` 或 `>=22.12.0`。仓库通过 `.node-version` 固定 Cloudflare Pages 使用的版本。

```powershell
npm install
npm run dev
```

本地开发服务器默认监听 `http://127.0.0.1:5173`。主要页面：

- `/`：3D 主体验与战队档案。
- `/open-source.html`：开源项目档案。

## Validation

```powershell
npm run check
```

该命令依次执行素材结构校验、TypeScript 检查、Vite 构建、`site/` 兼容产物生成和 Cloudflare Pages 限额审计。

单独生成 Cloudflare Pages 产物：

```powershell
npm run build:site
npm run verify:deployment
```

`assets/images/` 统一使用 WebP；动画图片保留为 animated WebP。新增图片后运行：

```powershell
npm run optimize:images
npm run verify:images
```

优化器会把静态图最长边限制为 1920 px、动画限制在 960 x 720 px 内，并且只在输出更小时替换源文件。

只有生成的 `site/` 目录用于静态资源部署。预览和生产部署均不设置访问密码。

## Deployment

目标仓库为 `hkustenterprize/RM2027-webpage`，Cloudflare Pages 生产分支为 `main`。推送或合并到 `main` 后会触发生产构建，其他分支用于预览部署。

完整的 Dashboard 配置、公开验证文件、指标刷新和回滚说明见 [Cloudflare Pages deployment](docs/cloudflare-pages.md)。

## Project layout

- `src/`：应用逻辑、UI、Three.js 场景与样式。
- `assets/`：glTF、外部二进制、贴图、字体和开源档案数据。
- `public/`：需要原样发布到站点根目录的公开文件。
- `scripts/`：素材校验、部署构建、产物审计和浏览器验证脚本。
- `.github/workflows/refresh-metrics.yml`：每周刷新公开项目指标。
- `.github/workflows/validate-site.yml`：在 Pull Request 和 `main` 推送时执行完整部署检查。

不要提交密码、Cloudflare API Token、临时截图、构建产物或未经确认可以公开的素材。
