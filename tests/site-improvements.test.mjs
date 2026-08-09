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

test('homepage introduces the team, competition, and team-related highlights', async () => {
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

  // 工程日志前移到赛事科普之前；高光展示只嵌入三条港科相关影像
  assert.match(homepage, /id="field-log"/)
  assert.ok(homepage.indexOf('id="field-log"') < homepage.indexOf('id="what-is-rm"'))
  assert.match(homepage, /id="showcase"/)
  assert.match(homepage, /香港科技大学24赛季高燃混剪/)
  assert.match(homepage, /24赛季混剪第二弹——HKUST 再创佳绩/)
  assert.match(homepage, /给视觉磕一个/)
  assert.match(homepage, /团队相关创作者/)
  assert.match(homepage, /BV1b94y1v7rt/)
  assert.match(homepage, /BV1TH4y1c7tU/)
  assert.match(homepage, /BV1xGwezFEUN/)
  assert.match(homepage, /BV1QU411m795/)
  assert.match(homepage, /BV18kdPBiEsy/)
  assert.match(homepage, /space\.bilibili\.com\/634988052/)
  assert.match(homepage, /space\.bilibili\.com\/20554233/)
  assert.match(homepage, /data-wp="what-is-rm"/)

  // 新板块插入后 Waypoint 编号连续重排
  for (const label of [
    'WAYPOINT 03 // FIELD LOG',
    'WAYPOINT 04 // FIRST CONTACT',
    'WAYPOINT 05 // HIGHLIGHT REEL',
    'WAYPOINT 06 // CRUISE',
    'WAYPOINT 07 // PLANETS',
    'WAYPOINT 08 // SYSTEMS',
    'WAYPOINT 09 // FLIGHT PLAN',
    'WAYPOINT 10 // THE JUMP',
  ]) {
    assert.ok(homepage.includes(label), label)
  }

  // 八段视频只在至少 25% 可见时加载；未接管时执行最佳努力重播
  assert.match(homepage, /initDeferredVideos/)
  assert.match(homepage, /IntersectionObserver/)
  const expectedBvids = [
    'BV1rMaVzTEh1',
    'BV1uH8bzdE61',
    'BV1Y482zjERP',
    'BV1ex4y1s72c',
    'BV14g4y1z7QC',
    'BV1HBHyeGEQT',
    'BV1sJHSefErC',
    'BV1TP8jzSEVA',
  ]
  const iframes = homepage.match(/<iframe[^>]+data-video-src="[^"]+"[^>]*>/g) || []
  assert.equal(iframes.length, expectedBvids.length)
  assert.deepEqual(
    iframes.map((iframe) => iframe.match(/bvid=(BV1[a-zA-Z0-9]+)/)?.[1]),
    expectedBvids,
  )
  for (const iframe of iframes) {
    assert.match(iframe, /src="about:blank"/)
    assert.match(iframe, /player\.bilibili\.com\/player\.html/)
    assert.match(iframe, /autoplay=1/)
    assert.match(iframe, /muted=1/)
    assert.match(iframe, /data-video-duration="\d+"/)
    assert.match(iframe, /data-video-loop/)
    assert.match(iframe, /tabindex="-1"/)
    assert.match(iframe, /loading="lazy"/)
    assert.match(iframe, /allow="autoplay; fullscreen; encrypted-media"/)
    assert.match(iframe, /\sallowfullscreen(?:\s|>)/)
    assert.doesNotMatch(iframe, /allowfullscreen=/)
    assert.match(iframe, /referrerpolicy="no-referrer"/)
    assert.match(iframe, /title="[^"]+"/)
  }
  for (const obsoleteBvid of ['BV1LB55z9EUL', 'BV1pA7pzhEkF', 'BV1QQ4y1B7Cy']) {
    assert.doesNotMatch(homepage, new RegExp(obsoleteBvid))
  }
  const fallbackLinks = homepage.match(/<noscript><p class="video-fallback"><a[^>]+www\.bilibili\.com\/video\/BV1[^>]+>/g) || []
  assert.equal(fallbackLinks.length, expectedBvids.length)
  assert.match(homepage, /iframe\[data-video-src\]\{display:none\}/)
  assert.match(homepage, /VIDEO_VISIBILITY_THRESHOLD = \.25/)
  assert.match(homepage, /markVideoAsUserControlled/)
  assert.match(homepage, /document\.activeElement === frame/)
  assert.match(homepage, /scheduleVideoReplay/)
  assert.match(homepage, /if \(reduced \|\| document\.visibilityState/)
  assert.match(homepage, /url\.searchParams\.set\('autoplay', '0'\)/)
  assert.match(homepage, /document\.visibilityState/)
  assert.match(homepage, /clearVideoReplay/)
  assert.match(homepage, /addEventListener\('pagehide'/)
  assert.match(homepage, /addEventListener\('pageshow'/)
  assert.match(homepage, /reduced \|\| !\('IntersectionObserver' in window\)/)
  assert.doesNotMatch(homepage, /rootMargin: '160px|loop=1|video-facade|initVideoFacades|data-video-embed/)
})
