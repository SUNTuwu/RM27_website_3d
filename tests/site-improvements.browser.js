const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const baseUrl = 'http://127.0.0.1:8377'

const isBilibiliHost = (hostname) => [
  'bilibili.com',
  'bilivideo.com',
  'hdslb.com',
].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))

const isBilibiliMediaHost = (hostname) =>
  hostname === 'player.bilibili.com' ||
  hostname === 'bilivideo.com' || hostname.endsWith('.bilivideo.com') ||
  hostname === 'hdslb.com' || hostname.endsWith('.hdslb.com')

async function openPage(browser, path, options = {}, beforeLoad) {
  const page = await browser.newPage(options)
  const errors = []
  const bilibiliRequests = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.route('**/*', (route) => {
    const requestUrl = route.request().url()
    const hostname = new URL(requestUrl).hostname.toLowerCase()
    if (!isBilibiliHost(hostname)) return route.continue()
    bilibiliRequests.push(requestUrl)
    return isBilibiliMediaHost(hostname) ? route.abort() : route.continue()
  })
  if (beforeLoad) await beforeLoad(page)
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  return { page, errors, bilibiliRequests }
}

async function waitForRequestCount(page, getRequests, expected, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (getRequests().length < expected && Date.now() < deadline) {
    await page.waitForTimeout(50)
  }
  assert.equal(getRequests().length, expected)
}

async function installControlledVideoTimers(page) {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window)
    const nativeClearTimeout = window.clearTimeout.bind(window)
    let nextVideoTimerId = -1
    let videoTimers = []
    window.setTimeout = (callback, delay = 0, ...args) => {
      if (delay !== 4010) return nativeSetTimeout(callback, delay, ...args)
      const timer = nextVideoTimerId
      nextVideoTimerId -= 1
      videoTimers = [...videoTimers, { timer, callback, args }]
      return timer
    }
    window.clearTimeout = (timer) => {
      const nextTimers = videoTimers.filter((candidate) => candidate.timer !== timer)
      if (nextTimers.length !== videoTimers.length) {
        videoTimers = nextTimers
        return
      }
      nativeClearTimeout(timer)
    }
    window.__videoReplayTimerCount = () => videoTimers.length
    window.__runNextVideoReplayTimer = () => {
      const [nextTimer, ...remainingTimers] = videoTimers
      if (!nextTimer) return false
      videoTimers = remainingTimers
      nextTimer.callback(...nextTimer.args)
      return true
    }
  })
}

async function installControlledIntersectionObserver(page) {
  await installControlledVideoTimers(page)
  await page.addInitScript(() => {
    let observers = []
    class ControlledIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.targets = new Set()
        observers = [...observers, this]
      }
      observe(target) { this.targets = new Set([...this.targets, target]) }
      unobserve(target) {
        this.targets = new Set([...this.targets].filter((candidate) => candidate !== target))
      }
      disconnect() { this.targets = new Set() }
    }
    window.IntersectionObserver = ControlledIntersectionObserver
    window.__videoObserverCount = () => observers.filter((observer) =>
      [...observer.targets].some((target) => target.matches('iframe[data-video-src]'))
    ).length
    window.__triggerVideoIntersection = (selector, ratio) => {
      const target = document.querySelector(selector)
      if (!target) throw new Error(`Missing intersection target: ${selector}`)
      for (const observer of observers.filter((candidate) => candidate.targets.has(target))) {
        observer.callback([{ target, intersectionRatio: ratio, isIntersecting: ratio > 0 }], observer)
      }
    }
  })
}

async function removeIntersectionObserver(page) {
  await installControlledVideoTimers(page)
  await page.addInitScript(() => {
    delete window.IntersectionObserver
  })
}

;(async () => {
  const browser = await chromium.launch()

  try {
    const homepageResult = await openPage(browser, '/index.html', {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'no-preference',
    }, installControlledIntersectionObserver)
    const homepage = homepageResult.page

    assert.equal(await homepage.locator('#department-grid .planet-card').count(), 4)
    assert.equal(await homepage.locator('#recruitment-path .step').count(), 6)
    assert.equal(await homepage.locator('#faq-list details').count(), 5)
    assert.equal(await homepage.locator('[data-recruit-primary]').textContent(), '获取开招提醒 ⟶')
    assert.match(await homepage.locator('[data-recruit-status-title]').textContent(), /筹备中/)
    assert.equal(await homepage.locator('.stat b[data-n="35"]').getAttribute('data-n'), '35')
    await homepage.locator('.skip-link').focus()
    await homepage.keyboard.press('Enter')
    assert.equal(await homepage.evaluate(() => location.hash), '#main-content')
    assert.equal(await homepage.evaluate(() => document.activeElement.id), 'main-content')

    // 我们是谁 / 工程日志 / 什么是 RoboMaster / 精彩展示
    assert.equal(await homepage.locator('.intro-facts .fact-line').count(), 4)
    assert.equal(await homepage.locator('.intro-facts').getAttribute('role'), 'group')
    assert.equal(await homepage.locator('#what-is-rm .roster .unit').count(), 7)
    assert.equal(await homepage.locator('#what-is-rm .roster').getAttribute('role'), 'group')
    assert.equal(await homepage.locator('#about .team-video-card iframe').count(), 1)
    assert.equal(await homepage.locator('#field-log .team-video-card iframe').count(), 3)
    assert.equal(await homepage.locator('#tech .team-video-card iframe').count(), 0)
    assert.equal(await homepage.locator('#showcase .show-card iframe').count(), 3)
    assert.equal(await homepage.locator('#what-is-rm iframe').count(), 1)
    assert.ok(
      await homepage.locator('#field-log').evaluate((fieldLog) =>
        Boolean(fieldLog.compareDocumentPosition(document.querySelector('#what-is-rm')) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
    )

    // 八段视频在 25% 可见前保持空白；同一观察器负责加载、卸载和重播调度
    const initialVideoContract = await homepage.locator('iframe[data-video-src]').evaluateAll((frames) =>
      frames.map((frame) => {
        const deferredUrl = new URL(frame.dataset.videoSrc)
        return {
          src: frame.getAttribute('src'),
          bvid: deferredUrl.searchParams.get('bvid'),
          autoplay: deferredUrl.searchParams.get('autoplay'),
          muted: deferredUrl.searchParams.get('muted'),
          duration: frame.dataset.videoDuration,
          hasLoopControl: frame.hasAttribute('data-video-loop'),
          loading: frame.loading,
          tabIndex: frame.tabIndex,
          allow: frame.getAttribute('allow'),
          allowFullscreen: frame.hasAttribute('allowfullscreen'),
          referrerPolicy: frame.referrerPolicy,
          title: frame.title,
        }
      })
    )
    assert.deepEqual(initialVideoContract.map((video) => video.bvid), [
      'BV1rMaVzTEh1',
      'BV1uH8bzdE61',
      'BV1Y482zjERP',
      'BV1ex4y1s72c',
      'BV14g4y1z7QC',
      'BV1HBHyeGEQT',
      'BV1sJHSefErC',
      'BV1TP8jzSEVA',
    ])
    for (const video of initialVideoContract) {
      assert.equal(video.src, 'about:blank')
      assert.equal(video.autoplay, '1')
      assert.equal(video.muted, '1')
      assert.ok(Number(video.duration) > 0)
      assert.equal(video.hasLoopControl, true)
      assert.equal(video.loading, 'lazy')
      assert.equal(video.tabIndex, -1)
      assert.equal(video.allow, 'autoplay; fullscreen; encrypted-media')
      assert.equal(video.allowFullscreen, true)
      assert.equal(video.referrerPolicy, 'no-referrer')
      assert.ok(video.title.length > 0)
    }
    assert.equal(homepageResult.bilibiliRequests.length, 0)
    assert.equal(await homepage.evaluate(() => window.__videoObserverCount()), 1)
    assert.equal(await homepage.locator('nav a[data-wp="what-is-rm"]').getAttribute('href'), '#what-is-rm')

    const competitionVideoRequests = () => homepageResult.bilibiliRequests.filter((url) => url.includes('bvid=BV14g4y1z7QC'))
    const competitionFrame = homepage.locator('#what-is-rm iframe')
    await competitionFrame.focus()
    assert.equal(await competitionFrame.evaluate((frame) => document.activeElement === frame), true)
    await homepage.evaluate(() => window.dispatchEvent(new Event('blur')))
    await competitionFrame.scrollIntoViewIfNeeded()
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.24))
    await homepage.waitForTimeout(100)
    assert.equal(competitionVideoRequests().length, 0)
    assert.equal(await competitionFrame.getAttribute('src'), 'about:blank')
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.25))
    await homepage.waitForFunction(() => !document.querySelector('#what-is-rm iframe')?.hasAttribute('data-video-src'))
    await homepage.waitForTimeout(100)
    assert.match(await competitionFrame.getAttribute('src'), /bvid=BV14g4y1z7QC.*autoplay=1.*muted=1/)
    assert.equal(await competitionFrame.getAttribute('tabindex'), '0')
    assert.equal(competitionVideoRequests().length, 1)
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.25))
    await homepage.waitForTimeout(100)
    assert.equal(competitionVideoRequests().length, 1)

    // 未接管时按已核验时长最佳努力重播；离开阈值后清除定时器并卸载播放器
    await competitionFrame.evaluate((frame) => {
      frame.dataset.videoDuration = '0.01'
      frame.dispatchEvent(new Event('load'))
    })
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 1)
    assert.equal(await homepage.evaluate(() => window.__runNextVideoReplayTimer()), true)
    await waitForRequestCount(homepage, competitionVideoRequests, 2)
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.24))
    assert.equal(await competitionFrame.getAttribute('src'), 'about:blank')
    assert.equal(await competitionFrame.getAttribute('tabindex'), '-1')
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 0)
    assert.equal(competitionVideoRequests().length, 2)

    // pagehide 停止定时器；pageshow 只恢复仍可见且未被用户接管的播放器
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.25))
    await homepage.waitForFunction(() => document.querySelector('#what-is-rm iframe')?.getAttribute('src') !== 'about:blank')
    await waitForRequestCount(homepage, competitionVideoRequests, 3)
    await competitionFrame.evaluate((frame) => frame.dispatchEvent(new Event('load')))
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 1)
    await homepage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 0)
    assert.equal(competitionVideoRequests().length, 3)
    await homepage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 1)
    assert.equal(await homepage.evaluate(() => window.__runNextVideoReplayTimer()), true)
    await waitForRequestCount(homepage, competitionVideoRequests, 4)

    // iframe 获得焦点后，父页面不再重播、卸载或在 BFCache 恢复时重载
    await competitionFrame.focus()
    assert.equal(await competitionFrame.evaluate((frame) => document.activeElement === frame), true)
    await homepage.evaluate(() => window.dispatchEvent(new Event('blur')))
    await competitionFrame.evaluate((frame) => frame.dispatchEvent(new Event('load')))
    await homepage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.24))
    assert.match(await competitionFrame.getAttribute('src'), /bvid=BV14g4y1z7QC/)
    await homepage.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    assert.equal(await homepage.evaluate(() => window.__videoReplayTimerCount()), 0)
    assert.equal(competitionVideoRequests().length, 4)
    assert.deepEqual(homepageResult.errors, [])

    // 不支持 IntersectionObserver 时，全部播放器视为可见，但生命周期监听仍然生效
    const fallbackResult = await openPage(browser, '/index.html', {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'no-preference',
    }, removeIntersectionObserver)
    const fallbackPage = fallbackResult.page
    assert.equal(await fallbackPage.evaluate(() => 'IntersectionObserver' in window), false)
    await fallbackPage.waitForFunction(() =>
      document.querySelectorAll('iframe[data-video-src]').length === 0
    )
    assert.equal(fallbackResult.bilibiliRequests.length, 8)
    const fallbackCompetitionRequests = () => fallbackResult.bilibiliRequests.filter((url) =>
      url.includes('bvid=BV14g4y1z7QC')
    )
    const fallbackCompetitionFrame = fallbackPage.locator('#what-is-rm iframe')
    await fallbackCompetitionFrame.evaluate((frame) => {
      frame.dataset.videoDuration = '0.01'
      frame.dispatchEvent(new Event('load'))
    })
    assert.equal(await fallbackPage.evaluate(() => window.__videoReplayTimerCount()), 1)
    await fallbackPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    assert.equal(await fallbackPage.evaluate(() => window.__videoReplayTimerCount()), 0)
    assert.equal(fallbackCompetitionRequests().length, 1)
    await fallbackPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    assert.equal(await fallbackPage.evaluate(() => window.__videoReplayTimerCount()), 1)
    assert.equal(await fallbackPage.evaluate(() => window.__runNextVideoReplayTimer()), true)
    await waitForRequestCount(fallbackPage, fallbackCompetitionRequests, 2)
    assert.deepEqual(fallbackResult.errors, [])
    await fallbackPage.close()

    // reduced-motion 下保留按需播放器，但关闭自动播放与强制重播
    const reducedResult = await openPage(browser, '/index.html', {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    }, installControlledIntersectionObserver)
    const reducedPage = reducedResult.page
    assert.equal(await reducedPage.locator('.stat b[data-n="35"]').textContent(), '35')
    const reducedFaq = reducedPage.locator('#faq-list details').first()
    await reducedFaq.locator('summary').click()
    assert.equal(await reducedFaq.evaluate((details) => details.open), true)
    assert.equal(await reducedFaq.evaluate((details) => details.classList.contains('is-animating')), false)
    await reducedFaq.locator('summary').click()
    assert.equal(await reducedFaq.evaluate((details) => details.open), false)
    const reducedCompetitionFrame = reducedPage.locator('#what-is-rm iframe')
    await reducedCompetitionFrame.scrollIntoViewIfNeeded()
    await reducedPage.evaluate(() => window.__triggerVideoIntersection('#what-is-rm iframe', 0.25))
    await reducedPage.waitForFunction(() => !document.querySelector('#what-is-rm iframe')?.hasAttribute('data-video-src'))
    assert.match(await reducedCompetitionFrame.getAttribute('src'), /bvid=BV14g4y1z7QC.*autoplay=0.*muted=1/)
    const reducedCompetitionRequests = () => reducedResult.bilibiliRequests.filter((url) => url.includes('bvid=BV14g4y1z7QC&'))
    await waitForRequestCount(reducedPage, reducedCompetitionRequests, 1)
    await reducedCompetitionFrame.evaluate((frame) => {
      frame.dataset.videoDuration = '0.01'
      frame.dispatchEvent(new Event('load'))
    })
    assert.equal(await reducedPage.evaluate(() => window.__videoReplayTimerCount()), 0)
    assert.deepEqual(reducedResult.errors, [])
    await reducedPage.close()

    const mobileResult = await openPage(browser, '/index.html', {
      viewport: { width: 375, height: 844 },
      reducedMotion: 'reduce',
    })
    const mobile = mobileResult.page
    const navToggle = mobile.locator('#nav-toggle')

    await navToggle.click()
    assert.equal(await navToggle.getAttribute('aria-expanded'), 'true')
    assert.equal(await mobile.locator('#primary-navigation').evaluate((element) => getComputedStyle(element).display), 'flex')
    await mobile.keyboard.press('Escape')
    assert.equal(await navToggle.getAttribute('aria-expanded'), 'false')
    assert.deepEqual(mobileResult.errors, [])

    const noScriptHomepage = await browser.newPage({ viewport: { width: 375, height: 844 }, javaScriptEnabled: false })
    await noScriptHomepage.goto(`${baseUrl}/index.html`, { waitUntil: 'load' })
    assert.equal(await noScriptHomepage.locator('#primary-navigation').evaluate((element) => getComputedStyle(element).display), 'flex')
    // 无 JS 时 reveal 内容保持可见；八个空 iframe 隐藏且不可聚焦，官方链接保持同序可用
    assert.equal(await noScriptHomepage.locator('#showcase .show-card').first().evaluate((element) => getComputedStyle(element).opacity), '1')
    const noScriptFrames = noScriptHomepage.locator('iframe[data-video-src]')
    assert.equal(await noScriptFrames.count(), 8)
    for (let index = 0; index < await noScriptFrames.count(); index += 1) {
      assert.equal(await noScriptFrames.nth(index).isVisible(), false)
    }
    assert.equal(await noScriptFrames.evaluateAll((frames) => frames.some((frame) => frame.matches(':focus'))), false)
    const noScriptVideoLinks = noScriptHomepage.locator('.video-fallback a')
    assert.equal(await noScriptVideoLinks.count(), 8)
    assert.deepEqual(await noScriptVideoLinks.evaluateAll((links) => links.map((link) => link.href)), [
      'https://www.bilibili.com/video/BV1rMaVzTEh1/',
      'https://www.bilibili.com/video/BV1uH8bzdE61/',
      'https://www.bilibili.com/video/BV1Y482zjERP/',
      'https://www.bilibili.com/video/BV1ex4y1s72c/',
      'https://www.bilibili.com/video/BV14g4y1z7QC/',
      'https://www.bilibili.com/video/BV1HBHyeGEQT/',
      'https://www.bilibili.com/video/BV1sJHSefErC/',
      'https://www.bilibili.com/video/BV1TP8jzSEVA/',
    ])
    await noScriptHomepage.keyboard.press('Tab')
    assert.equal(await noScriptFrames.evaluateAll((frames) => frames.some((frame) => frame.matches(':focus'))), false)
    await noScriptHomepage.close()

    const archiveResult = await openPage(browser, '/open-source.html', {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    const archive = archiveResult.page

    assert.equal(await archive.locator('.project-card').count(), 32)
    const archiveLayout = await archive.evaluate(() => ({
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      overflowingCards: [...document.querySelectorAll('.project-card')].filter((card) => card.scrollHeight > card.clientHeight + 1).length,
    }))
    assert.equal(archiveLayout.hasHorizontalOverflow, false)
    assert.equal(archiveLayout.overflowingCards, 0)
    await archive.locator('#project-sort').selectOption('season-desc')
    assert.match(await archive.locator('.project-card').first().locator('.index').textContent(), /2025/)
    const firstNon2025 = await archive.locator('.project-card').evaluateAll((cards) => cards.findIndex((card) => !card.querySelector('.index').textContent.includes('2025')))
    assert.ok(firstNon2025 > 0, 'latest-season sorting should group 2025 projects before older projects')
    await archive.locator('#project-search').fill('JLink')
    assert.equal(await archive.locator('.project-card').count(), 2)
    assert.equal(await archive.locator('#archive-results').textContent(), '显示 2 / 32 个项目')

    await archive.locator('[data-filter="embedded"]').click()
    assert.equal(await archive.locator('.project-card').count(), 2)
    await archive.locator('#project-sort').selectOption('stars-desc')
    assert.match(await archive.locator('.project-card').first().locator('h3').textContent(), /无线 JLink/)

    const detailButton = archive.locator('[data-details-index="24"]')
    await detailButton.focus()
    await archive.keyboard.press('Enter')
    assert.equal(await archive.locator('#project-dialog').evaluate((dialog) => dialog.open), true)
    assert.equal(await archive.locator('#project-dialog-title').textContent(), '无线 JLink 烧录器')
    await archive.keyboard.press('Escape')
    assert.equal(await archive.locator('#project-dialog').evaluate((dialog) => dialog.open), false)
    assert.equal(await detailButton.evaluate((element) => document.activeElement === element), true)

    await archive.locator('#project-search').fill('不存在的项目关键词')
    assert.equal(await archive.locator('.project-card').count(), 0)
    assert.equal(await archive.locator('#empty-state').evaluate((element) => getComputedStyle(element).display), 'block')
    assert.deepEqual(archiveResult.errors, [])

    const archiveNavToggle = archive.locator('#archive-nav-toggle')
    await archive.setViewportSize({ width: 375, height: 844 })
    await archiveNavToggle.click()
    assert.equal(await archiveNavToggle.getAttribute('aria-expanded'), 'true')
    await archive.setViewportSize({ width: 900, height: 844 })
    await archive.waitForFunction(() => document.querySelector('#archive-nav-toggle')?.getAttribute('aria-expanded') === 'false')
    assert.equal(await archiveNavToggle.getAttribute('aria-expanded'), 'false')

    const noScriptArchive = await browser.newPage({ viewport: { width: 375, height: 844 }, javaScriptEnabled: false })
    await noScriptArchive.goto(`${baseUrl}/open-source.html`, { waitUntil: 'load' })
    assert.equal(await noScriptArchive.locator('#archive-navigation').evaluate((element) => getComputedStyle(element).display), 'flex')
    await noScriptArchive.close()

    const delayedMetricsPage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    await delayedMetricsPage.route('**/data/metrics.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.continue()
    })
    await delayedMetricsPage.goto(`${baseUrl}/open-source.html`, { waitUntil: 'domcontentloaded' })
    const delayedOpener = delayedMetricsPage.locator('[data-details-index="24"]')
    await delayedOpener.click()
    await delayedMetricsPage.waitForTimeout(900)
    await delayedMetricsPage.keyboard.press('Escape')
    const rebuiltOpener = delayedMetricsPage.locator('[data-details-index="24"]')
    await delayedMetricsPage.waitForFunction(() => document.activeElement?.matches('[data-details-index="24"]'))
    assert.equal(await rebuiltOpener.evaluate((element) => document.activeElement === element), true)
    await delayedMetricsPage.close()

    const motionHomepage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'no-preference',
    })
    await motionHomepage.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' })
    const desktopMotion = await motionHomepage.evaluate(() => window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots())
    assert.equal(desktopMotion.length, 1)
    assert.equal(desktopMotion[0].isRunning, true)
    assert.equal(desktopMotion[0].pendingFrameCount, 1)
    assert.ok(desktopMotion[0].callbackCount >= 5)

    // FAQ 科幻开关动效：点击展开 → 高度动画结束 → 点击收起；Enter 键同样可用
    const faqDetails = motionHomepage.locator('#faq-list details').first()
    await faqDetails.locator('summary').click()
    assert.equal(await faqDetails.evaluate((details) => details.open), true)
    await motionHomepage.waitForFunction(() => {
      const details = document.querySelector('#faq-list details')
      return details && !details.classList.contains('is-animating')
    })
    assert.equal(await faqDetails.locator('p').evaluate((body) => getComputedStyle(body).animationName), 'faq-boot')
    const faqBodyHeight = await faqDetails.locator('p').evaluate((body) => body.getBoundingClientRect().height)
    assert.ok(faqBodyHeight > 10, 'expanded faq answer should be visible')
    await faqDetails.locator('summary').click()
    await motionHomepage.waitForFunction(() => !document.querySelector('#faq-list details').open)
    assert.equal(await faqDetails.evaluate((details) => details.open), false)

    await faqDetails.locator('summary').press('Enter')
    await motionHomepage.waitForFunction(() => document.querySelector('#faq-list details').open)
    await motionHomepage.waitForFunction(() => !document.querySelector('#faq-list details').classList.contains('is-animating'))
    assert.ok((await faqDetails.locator('p').evaluate((body) => body.getBoundingClientRect().height)) > 10)
    await faqDetails.locator('summary').press('Enter')
    await motionHomepage.waitForFunction(() => !document.querySelector('#faq-list details').open)

    await motionHomepage.setViewportSize({ width: 3840, height: 2160 })
    await motionHomepage.waitForFunction(() => {
      const canvas = document.querySelector('#warp')
      return !canvas || canvas.width * canvas.height <= 3_000_001
    })
    const resizedDesktopMotion = await motionHomepage.evaluate(() => ({
      scheduler: window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0],
      canvas: (() => {
        const element = document.querySelector('#warp')
        return element ? { physicalPixels: element.width * element.height } : null
      })(),
    }))
    assert.equal(resizedDesktopMotion.scheduler.targetFps, 60)
    if (resizedDesktopMotion.canvas) {
      assert.ok(resizedDesktopMotion.canvas.physicalPixels <= 3_000_001)
    }

    await motionHomepage.setViewportSize({ width: 720, height: 900 })
    await motionHomepage.waitForFunction(() =>
      window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0].targetFps === 30
    )
    const breakpointMotion = await motionHomepage.evaluate(() => window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0])
    assert.equal(breakpointMotion.targetFps, 30)
    const nativeAnchorFallback = await motionHomepage.evaluate(() => {
      const originalScrollIntoView = Element.prototype.scrollIntoView
      let callCount = 0
      Element.prototype.scrollIntoView = function scrollIntoView(options) {
        callCount += 1
        return originalScrollIntoView.call(this, options)
      }
      document.querySelector('a[href="#about"]')?.click()
      Element.prototype.scrollIntoView = originalScrollIntoView
      return callCount
    })
    assert.equal(nativeAnchorFallback, 1)

    await motionHomepage.setViewportSize({ width: 1440, height: 900 })
    await motionHomepage.waitForFunction(() =>
      window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0].targetFps === 60 &&
      document.querySelectorAll('.holo-surface').length > 0
    )

    await motionHomepage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    const pausedMotion = await motionHomepage.evaluate(() => window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0])
    assert.equal(pausedMotion.isRunning, false)
    assert.equal(pausedMotion.pendingFrameCount, 0)
    await motionHomepage.waitForTimeout(150)
    const hiddenMotion = await motionHomepage.evaluate(() => window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0])
    assert.equal(hiddenMotion.tickCount, pausedMotion.tickCount)
    await motionHomepage.close()

    const mobileMotionHomepage = await browser.newPage({
      viewport: { width: 375, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      reducedMotion: 'no-preference',
    })
    await mobileMotionHomepage.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' })
    const mobileMotionState = await mobileMotionHomepage.evaluate(() => ({
      scheduler: window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0],
      canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({
        id: canvas.id,
        physicalWidth: canvas.width,
        cssWidth: canvas.getBoundingClientRect().width,
      })),
      holoSurfaces: document.querySelectorAll('.holo-surface').length,
    }))
    assert.equal(mobileMotionState.scheduler.targetFps, 30)
    assert.equal(mobileMotionState.scheduler.callbackCount, 3)
    assert.equal(mobileMotionState.holoSurfaces, 0)
    for (const canvas of mobileMotionState.canvases.filter((item) => item.id !== 'mouse-warp-canvas')) {
      assert.ok(canvas.physicalWidth <= Math.ceil(canvas.cssWidth), `${canvas.id} must use at most 1x mobile DPR`)
    }
    await mobileMotionHomepage.setViewportSize({ width: 1440, height: 900 })
    await mobileMotionHomepage.waitForTimeout(100)
    const promotedMobileState = await mobileMotionHomepage.evaluate(() => ({
      scheduler: window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0],
      holoSurfaces: document.querySelectorAll('.holo-surface').length,
    }))
    assert.equal(promotedMobileState.scheduler.targetFps, 30)
    assert.equal(promotedMobileState.scheduler.callbackCount, 3)
    assert.equal(promotedMobileState.holoSurfaces, 0)
    await mobileMotionHomepage.close()

    const motionArchive = await browser.newPage({
      viewport: { width: 375, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      reducedMotion: 'no-preference',
    })
    await motionArchive.goto(`${baseUrl}/open-source.html`, { waitUntil: 'networkidle' })
    const archiveMotionState = await motionArchive.evaluate(() => ({
      scheduler: window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0],
      canvas: (() => {
        const element = document.querySelector('#warp')
        return element ? {
          physicalWidth: element.width,
          cssWidth: element.getBoundingClientRect().width,
        } : null
      })(),
    }))
    assert.equal(archiveMotionState.scheduler.targetFps, 30)
    assert.equal(archiveMotionState.scheduler.callbackCount, archiveMotionState.canvas ? 1 : 0)
    if (archiveMotionState.canvas) {
      assert.ok(archiveMotionState.canvas.physicalWidth <= Math.ceil(archiveMotionState.canvas.cssWidth))
    }

    // 详情对话框：跃迁式打开 + 动画化关闭；筛选标签：充能扫光
    await motionArchive.locator('[data-details-index="24"]').click()
    const motionDialog = motionArchive.locator('#project-dialog')
    await motionArchive.waitForFunction(() => document.getElementById('project-dialog').open)
    assert.equal(await motionDialog.evaluate((dialog) => dialog.open), true)
    assert.equal(await motionDialog.evaluate((dialog) => getComputedStyle(dialog).animationName), 'dialog-warp-in')
    assert.equal(await motionDialog.evaluate((dialog) => getComputedStyle(dialog, '::before').animationName), 'dialog-scan')
    await motionArchive.locator('[data-dialog-close]').click()
    await motionArchive.waitForFunction(() => !document.getElementById('project-dialog').open)
    assert.equal(await motionDialog.evaluate((dialog) => dialog.classList.contains('is-closing')), false)

    const visionFilter = motionArchive.locator('[data-filter="vision"]')
    await visionFilter.click()
    assert.equal(await visionFilter.evaluate((button) => button.classList.contains('active')), true)
    assert.equal(await visionFilter.evaluate((button) => getComputedStyle(button, '::after').animationName), 'filter-charge')
    await motionArchive.close()

    const noWebGlBrowser = await chromium.launch({ args: ['--disable-webgl', '--disable-gpu'] })
    try {
      const noWebGlPage = await noWebGlBrowser.newPage({
        viewport: { width: 375, height: 844 },
        hasTouch: true,
        reducedMotion: 'no-preference',
      })
      await noWebGlPage.goto(`${baseUrl}/open-source.html`, { waitUntil: 'networkidle' })
      const fallbackState = await noWebGlPage.evaluate(() => ({
        hasWarpCanvas: Boolean(document.querySelector('#warp')),
        scheduler: window.ENTERPRIZE_PERFORMANCE.getSchedulerSnapshots()[0],
      }))
      assert.equal(fallbackState.hasWarpCanvas, false)
      assert.equal(fallbackState.scheduler.callbackCount, 0)
      await noWebGlPage.close()
    } finally {
      await noWebGlBrowser.close()
    }

    const deepLinkContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const deepLinkPage = await deepLinkContext.newPage()
    await deepLinkPage.goto(`${baseUrl}/open-source.html#project-24`, { waitUntil: 'networkidle' })
    assert.equal(await deepLinkPage.locator('#project-dialog').evaluate((dialog) => dialog.open), true)
    assert.match(await deepLinkPage.locator('#project-dialog-title').textContent(), /无线 JLink/)
    assert.equal(await deepLinkPage.evaluate(() => location.hash), '#project-24')
    assert.match(await deepLinkPage.locator('[data-dialog-metrics]').textContent(), /Stars：\d/)

    await deepLinkPage.evaluate(() => { location.hash = '#project-10' })
    assert.equal(await deepLinkPage.evaluate(() => location.hash), '#project-24')
    assert.match(await deepLinkPage.locator('#project-dialog-title').textContent(), /无线 JLink/)

    await deepLinkPage.keyboard.press('Escape')
    assert.equal(await deepLinkPage.locator('#project-dialog').evaluate((dialog) => dialog.open), false)
    await deepLinkPage.waitForFunction(() => location.hash === '')

    await deepLinkPage.locator('[data-details-index="24"]').click()
    assert.equal(await deepLinkPage.evaluate(() => location.hash), '#project-24')
    await deepLinkPage.locator('[data-copy-project-link]').click()
    await deepLinkPage.waitForFunction(() =>
      document.querySelector('[data-copy-project-link]')?.textContent.includes('已复制')
    )
    const copiedLink = await deepLinkPage.evaluate(() => navigator.clipboard.readText())
    assert.match(copiedLink, /open-source\.html#project-24$/)

    const unknownLinkPage = await deepLinkContext.newPage()
    await unknownLinkPage.goto(`${baseUrl}/open-source.html#project-999`, { waitUntil: 'networkidle' })
    assert.equal(await unknownLinkPage.locator('#project-dialog').evaluate((dialog) => dialog.open), false)
    await deepLinkContext.close()

    console.log('site improvement browser checks passed')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
