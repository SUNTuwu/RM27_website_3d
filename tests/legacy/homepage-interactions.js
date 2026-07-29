const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'v8-hero.png' });

  // 滚动驱动曲速 + hero 照片淡出
  const v0 = await page.textContent('#vel-val');
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  const v1 = await page.textContent('#vel-val');
  console.log('warp:', v0, '->', v1, parseFloat(v1) > parseFloat(v0) ? '✅' : '❌');

  const heroOp = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-bg')).opacity);
  console.log('hero-bg opacity after scroll:', heroOp, parseFloat(heroOp) < 0.5 ? '淡出 ✅' : '❌');

  // 横幅淡入
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(40); }
  await page.waitForTimeout(1800);
  const bannerOp = await page.evaluate(() => getComputedStyle(document.querySelector('#banner .bg')).opacity);
  console.log('banner bg opacity:', bannerOp);
  await page.screenshot({ path: 'v8-banner.png' });

  // 移动端
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merrs = [];
  m.on('pageerror', e => merrs.push(String(e)));
  await m.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await m.waitForTimeout(2000);
  await m.screenshot({ path: 'v8-mobile.png' });

  console.log('desktop pageerrors:', errs.length ? errs : 'none ✅');
  console.log('mobile pageerrors:', merrs.length ? merrs : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
