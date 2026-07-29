const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'v9-hero.png' });

  // 静止时星场是否在动：比较两帧 canvas 区域截图
  const s1 = await page.screenshot();
  await page.waitForTimeout(1500);
  const s2 = await page.screenshot();
  console.log('idle motion:', !s1.equals(s2) ? 'MOVING ✅' : 'STATIC ❌');

  const hud = await page.evaluate(() => {
    const el = document.getElementById('warp-hud');
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), bottomGap: Math.round(window.innerHeight - r.bottom), text: el.textContent };
  });
  console.log('warp-hud:', JSON.stringify(hud));

  // 滚动 + 英雄照片淡出
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const v1 = await page.textContent('#vel-val');
  const heroOp = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-bg')).opacity);
  console.log('warp after scroll:', v1, '| hero-bg opacity:', heroOp);

  console.log('pageerrors:', errs.length ? errs : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
