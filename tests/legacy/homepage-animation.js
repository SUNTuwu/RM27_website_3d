const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'v10-top.png' });

  const op = () => page.evaluate(() => getComputedStyle(document.querySelector('.hero-bg')).opacity);
  console.log('t0 heroOp:', await op());

  // 分步滚动：照片应原地溶解（逐步变透明），而不是平移
  for (let step = 1; step <= 4; step++) {
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 180); await page.waitForTimeout(50); }
    await page.waitForTimeout(1300);
    console.log('step' + step, 'heroOp:', await op());
    await page.screenshot({ path: `v10-fade${step}.png` });
  }
  console.log('pageerrors:', errs.length ? errs : 'none ✅');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
