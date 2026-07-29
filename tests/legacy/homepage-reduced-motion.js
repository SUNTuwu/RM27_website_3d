const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  // 用 reduced-motion 做整页布局检查（所有 reveal 直接可见，无 Lenis 干扰）
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'full.png', fullPage: true });
  console.log('full-page screenshot saved; pageerrors:', errs.length ? errs : 'none ✅');

  // 普通模式：验证 hero 首屏 + scroll-hint 不再漂浮 + 滚动截图
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  await p2.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: 'hero.png' });
  // 滚到星球区（用滚轮，兼容 Lenis）
  for (let i = 0; i < 30; i++) { await p2.mouse.wheel(0, 500); await p2.waitForTimeout(50); }
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: 'mid.png' });
  console.log('hero/mid saved; pageerrors:', errs2.length ? errs2 : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
