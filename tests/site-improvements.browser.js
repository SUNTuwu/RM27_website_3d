const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const baseUrl = 'http://127.0.0.1:8377'

async function openPage(browser, path, options = {}) {
  const page = await browser.newPage(options)
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  return { page, errors }
}

;(async () => {
  const browser = await chromium.launch()

  try {
    const homepageResult = await openPage(browser, '/index.html', {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    const homepage = homepageResult.page

    assert.equal(await homepage.locator('#department-grid .planet-card').count(), 4)
    assert.equal(await homepage.locator('#recruitment-path .step').count(), 6)
    assert.equal(await homepage.locator('#faq-list details').count(), 5)
    assert.equal(await homepage.locator('[data-recruit-primary]').textContent(), '获取开招提醒 ⟶')
    assert.match(await homepage.locator('[data-recruit-status-title]').textContent(), /筹备中/)
    assert.equal(await homepage.locator('.stat b[data-n="35"]').textContent(), '35')
    await homepage.locator('.skip-link').focus()
    await homepage.keyboard.press('Enter')
    assert.equal(await homepage.evaluate(() => location.hash), '#main-content')
    assert.equal(await homepage.evaluate(() => document.activeElement.id), 'main-content')
    assert.deepEqual(homepageResult.errors, [])

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
    assert.equal(await deepLinkPage.evaluate(() => location.hash), '')

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
