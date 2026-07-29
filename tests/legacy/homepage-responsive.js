const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // 滚过 hero，看星空区
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(50); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'v11-a.png' });

  // 静止状态下，间隔 6 秒两帧：前进动画 + 明暗变化应使画面明显不同
  const f1 = await page.screenshot();
  await page.waitForTimeout(6000);
  const f2 = await page.screenshot();
  console.log('sky motion (6s apart):', !f1.equals(f2) ? 'MOVING ✅' : 'STATIC ❌');
  await page.screenshot({ path: 'v11-b.png' });

  // 亮度检查：星空区平均亮度
  const lum = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 100; c.height = 60;
    // 截屏无法直接读，改用 computed opacity/filter 确认
    const s1 = getComputedStyle(document.getElementById('sky1'));
    const s2 = getComputedStyle(document.getElementById('sky2'));
    return { sky1: { opacity: s1.opacity, filter: s1.filter }, sky2: { opacity: s2.opacity } };
  });
  console.log(JSON.stringify(lum, null, 1));
  console.log('pageerrors:', errs.length ? errs : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
