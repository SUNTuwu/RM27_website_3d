# Cloudflare Pages deployment

本项目使用 GitHub 集成自动部署到 Cloudflare Pages。Vite 原生产产物为 `dist/`；为了兼容现有 Pages 项目设置，`scripts/build-site.mjs` 会执行 Vite 构建并将结果复制到 `site/`。

## Dashboard configuration

Cloudflare Pages 项目应连接 `hkustenterprize/RM2027-webpage`，并使用以下设置：

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Framework preset | None |
| Build command | `node scripts/build-site.mjs` |
| Build output directory | `site` |
| Node.js version | `.node-version` 中的 `22.16.0` |

检查 Dashboard 中是否存在旧的 `NODE_VERSION` 环境变量。如果存在，其值必须与 `.node-version` 一致，或删除该变量以免覆盖仓库配置。

每次推送或合并到 `main` 都应触发生产部署；其他 Git 分支产生预览部署。若推送后没有构建记录，请在 **Settings -> Builds & deployments** 中确认 Git 集成和 production deployments 均已启用。

## Public access

预览和生产部署均直接公开访问，不加载 `functions/_middleware.js`，也不使用 `SITE_PASSWORD`。Dashboard 中若仍保留旧的 `SITE_PASSWORD` Secret，可以删除；该变量不会再被站点读取。

## Public verification file

`public/252478fc73dc3522687c788d2f12f490.txt` 会由 Vite 复制到部署产物根目录。不要重命名、删除或改变文件内容。

## Metric refresh

`.github/workflows/refresh-metrics.yml` 每周一刷新 GitHub Stars 和 RoboMaster 论坛引用数据，输出到：

```text
assets/open-source/data/metrics.json
```

Action 只在数据发生变化时提交该文件。由机器人写入 `main` 的提交也会触发一次 Pages 生产部署。若之后启用严格分支保护，需要为该工作流保留写入方式，或将刷新改成自动 Pull Request。

## Local validation

在提交部署 PR 前执行：

```powershell
npm run check
```

也可以分开执行：

```powershell
npm run build:site
npm run verify:deployment
```

产物审计会检查关键页面、开源档案数据、公开验证文件、文件数量、单文件 25 MiB 限制、不应进入 `site/` 的源码和本地目录，以及仓库中不存在密码中间件。

## Deployment verification

PR 分支推送后：

1. 在 GitHub PR Checks 中确认 `Validate site` 成功，并在 Cloudflare Dashboard 中确认预览构建成功。
2. 在私密窗口直接检查 `/` 与 `/open-source.html`，确认不再出现登录页或 `401`。
3. 访问 `/252478fc73dc3522687c788d2f12f490.txt`，确认返回验证 token。
4. 合并到 `main` 后检查生产部署对应的 commit SHA。
5. 在私密窗口访问 `https://test.hkustenterprize.win`，确认主要页面可以直接打开。

## Rollback

迁移前的目标仓库状态保存在远程分支：

```text
backup/main-before-vite-20260826-023821
```

不要直接强推回滚。优先在目标仓库创建一个以备份分支内容为基准的回滚 PR，使变更和恢复过程都保留审计记录。

## Pre-release gate

构建产物隔离不能替代内容审核。正式公开前仍需确认：

- 图片、动图、图纸和复用素材的发布授权；
- 战队成绩、招新状态、联系方式和学校信息；
- 第三方品牌、字体、项目仓库图片与许可证要求；
- `assets/` 中所有随运行时一起发布的文件确实允许公开。
