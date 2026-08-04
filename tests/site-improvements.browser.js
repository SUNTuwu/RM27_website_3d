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

    console.log('site improvement browser checks passed')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
