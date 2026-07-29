const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'v3-hero.png' });

  // 滚动驱动曲速
  const v0 = await page.textContent('#vel-val');
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  const v1 = await page.textContent('#vel-val');
  console.log('warp:', v0, '->', v1, parseFloat(v1) > parseFloat(v0) ? '✅' : '❌');

  // 横幅视差区截图
  await page.evaluate(() => window.scrollTo(0, 0));
  const banner = await page.locator('#banner');
  await banner.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'v3-banner.png' });

  // 跃迁按钮
  await page.evaluate(() => document.getElementById('join').scrollIntoView());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'v3-join.png' });
  await page.click('#jump-btn');
  await page.waitForTimeout(1600);
  const jumped = await page.evaluate(() => document.querySelector('#join .grid').getBoundingClientRect().top < window.innerHeight);
  console.log('jump:', jumped ? '✅' : '❌');

  // 移动端
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merrs = [];
  m.on('pageerror', e => merrs.push(String(e)));
  await m.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await m.waitForTimeout(2000);
  await m.screenshot({ path: 'v3-mobile.png' });

  console.log('desktop pageerrors:', errs.length ? errs : 'none ✅');
  console.log('mobile pageerrors:', merrs.length ? merrs : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
