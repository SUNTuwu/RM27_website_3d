import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const readSource = (path) => readFile(new URL(path, root), 'utf8')

test('recruitment content has one data source', async () => {
  const [data, homepage] = await Promise.all([
    readSource('data/recruitment.js'),
    readSource('index.html'),
  ])

  assert.match(data, /ENTERPRIZE_RECRUITMENT/)
  assert.match(data, /departments/)
  assert.match(data, /path/)
  assert.match(data, /faq/)
  assert.match(homepage, /data\/recruitment\.js/)
  assert.match(homepage, /id="department-grid"/)
  assert.match(homepage, /id="recruitment-path"/)
  assert.match(homepage, /id="faq-list"/)
  assert.match(homepage, /data-recruit-primary/)
  assert.match(homepage, /data-recruit-status-title/)
})

test('homepage navigation and dynamic content remain keyboard accessible', async () => {
  const homepage = await readSource('index.html')

  assert.match(homepage, /class="skip-link"/)
  assert.match(homepage, /id="nav-toggle"/)
  assert.match(homepage, /aria-controls="primary-navigation"/)
  assert.match(homepage, /aria-expanded="false"/)
  assert.match(homepage, /:focus-visible/)
  assert.match(homepage, /prefers-reduced-motion/)
  assert.match(homepage, /<details[^>]*data-faq-details/)
})

test('archive provides search, sorting, results, and project details', async () => {
  const archive = await readSource('open-source.html')

  assert.match(archive, /id="project-search"/)
  assert.match(archive, /id="project-sort"/)
  assert.match(archive, /id="archive-results"/)
  assert.match(archive, /id="project-dialog"/)
  assert.match(archive, /data-details-index/)
  assert.match(archive, /showModal/)
  assert.match(archive, /<img class="preview"[^>]*loading="lazy"[^>]*decoding="async"/)
})

test('improvement roadmap records scope and acceptance criteria', async () => {
  const roadmap = await readSource('docs/website-improvement-roadmap.md')

  assert.match(roadmap, /P0/)
  assert.match(roadmap, /招新转化/)
  assert.match(roadmap, /开源项目/)
  assert.match(roadmap, /无障碍/)
  assert.match(roadmap, /验收/)
})

test('pages publish share metadata and structured data', async () => {
  const [homepage, archive] = await Promise.all([
    readSource('index.html'),
    readSource('open-source.html'),
  ])

  const extractJsonLd = (page) => {
    const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    assert.ok(match, 'JSON-LD block must exist')
    return JSON.parse(match[1])
  }

  for (const page of [homepage, archive]) {
    assert.match(page, /<link rel="icon"[^>]*assets\/logo\.png/)
    assert.match(page, /<link rel="apple-touch-icon"/)
    assert.match(page, /name="theme-color"/)
    assert.match(page, /property="og:site_name"/)
    assert.match(page, /property="og:locale"/)
    assert.match(page, /name="twitter:card"/)
    assert.equal(extractJsonLd(page)['@context'], 'https://schema.org')
  }

  assert.equal(extractJsonLd(homepage)['@type'], 'SportsTeam')
  assert.equal(extractJsonLd(archive)['@type'], 'CollectionPage')
})

test('archive project details are shareable deep links', async () => {
  const archive = await readSource('open-source.html')

  assert.match(archive, /#project-/)
  assert.match(archive, /data-copy-project-link/)
  assert.match(archive, /openProjectFromHash/)
  assert.match(archive, /hashchange/)
  assert.match(archive, /replaceState/)
})

test('interactive tags ship sci-fi open and close animations', async () => {
  const [homepage, archive] = await Promise.all([
    readSource('index.html'),
    readSource('open-source.html'),
  ])

  // 首页 FAQ 折叠面板：科幻样式钩子 + WAAPI 双向高度动画 + reduced-motion 原生回退
  assert.match(homepage, /initFaqAnimations/)
  assert.match(homepage, /@keyframes faq-scan/)
  assert.match(homepage, /@keyframes faq-boot/)
  assert.match(homepage, /@keyframes faq-line/)
  assert.match(homepage, /summary::after/)
  assert.match(homepage, /is-animating/)
  assert.match(homepage, /if \(reduced\) return/)

  // 档案页：筛选标签充能扫光、项目标签辉光、详情对话框跃迁开/关
  assert.match(archive, /@keyframes filter-charge/)
  assert.match(archive, /@keyframes dialog-warp-in/)
  assert.match(archive, /@keyframes dialog-scan/)
  assert.match(archive, /@keyframes backdrop-fade/)
  assert.match(archive, /closeProjectDialog/)
  assert.match(archive, /addEventListener\('cancel'/)
  assert.match(archive, /\.filter::after,\.project-dialog\[open\]/)
})
