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

test('homepage introduces the team, the competition, and official highlights', async () => {
  const homepage = await readSource('index.html')

  // 我们是谁：叙事介绍 + 战队档案事实行
  assert.match(homepage, /intro-panel/)
  assert.match(homepage, /ENTERPRIZE 是香港科技大学的 RoboMaster 机甲大师战队/)
  assert.match(homepage, /intro-facts/)

  // 什么是 RoboMaster：赛事介绍 + 兵种名录 + 官方宣传片
  assert.match(homepage, /id="what-is-rm"/)
  assert.match(homepage, /什么是 RoboMaster 机甲大师赛/)
  assert.match(homepage, /roster/)
  assert.match(homepage, /bvid=BV14g4y1z7QC/)

  // 精彩展示：三段官方短视频 + 官方账号链接
  assert.match(homepage, /id="showcase"/)
  assert.match(homepage, /bvid=BV1LB55z9EUL/)
  assert.match(homepage, /bvid=BV1pA7pzhEkF/)
  assert.match(homepage, /bvid=BV1QQ4y1B7Cy/)
  assert.match(homepage, /space\.bilibili\.com\/20554233/)
  assert.match(homepage, /data-wp="what-is-rm"/)

  // 新板块插入后 Waypoint 编号连续重排
  for (const label of [
    'WAYPOINT 03 // FIRST CONTACT',
    'WAYPOINT 04 // HIGHLIGHT REEL',
    'WAYPOINT 05 // CRUISE',
    'WAYPOINT 06 // PLANETS',
    'WAYPOINT 07 // SYSTEMS',
    'WAYPOINT 08 // FLIGHT PLAN',
    "WAYPOINT 09 // THE JUMP",
  ]) {
    assert.ok(homepage.includes(label), label)
  }

  // 嵌入视频采用点击加载门面：data-video-embed 持有播放器地址，首屏只载封面，不产生播放器遥测
  assert.match(homepage, /initVideoFacades/)
  // 修饰键点击保留新标签页原生行为；注入的播放器带 autoplay 权限与焦点移交
  assert.match(homepage, /event\.metaKey \|\| event\.ctrlKey/)
  assert.match(homepage, /autoplay; fullscreen; encrypted-media/)
  assert.match(homepage, /iframe\.focus\(\)/)
  const embeds = homepage.match(/data-video-embed="[^"]+"/g) || []
  assert.equal(embeds.length, 4)
  for (const embed of embeds) {
    assert.match(embed, /player\.bilibili\.com\/player\.html/)
    assert.match(embed, /bvid=BV1[a-zA-Z0-9]+/)
    assert.match(embed, /autoplay=1/)
  }
  // 门面封面图懒加载、异步解码且不带 Referer；无 JS 时门面退化为官方视频页链接
  const covers = homepage.match(/<img[^>]+hdslb\.com[^>]*>/g) || []
  assert.equal(covers.length, 4)
  for (const cover of covers) {
    assert.match(cover, /loading="lazy"/)
    assert.match(cover, /decoding="async"/)
    assert.match(cover, /referrerpolicy="no-referrer"/)
  }
  const facades = homepage.match(/<a class="video-facade"[^>]*>/g) || []
  assert.equal(facades.length, 4)
  for (const facade of facades) {
    assert.match(facade, /href="https:\/\/www\.bilibili\.com\/video\/BV1[a-zA-Z0-9]+\/"/)
    assert.match(facade, /target="_blank"/)
    assert.match(facade, /rel="noopener"/)
    assert.match(facade, /aria-label="/)
  }
  // 首页不再直接内嵌播放器 iframe
  assert.equal((homepage.match(/<iframe[^>]+player\.bilibili\.com/g) || []).length, 0)
})
