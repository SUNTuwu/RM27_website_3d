const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const op = () => page.evaluate(() => ({
    y: Math.round(window.scrollY),
    heroOp: getComputedStyle(document.querySelector('.hero-bg')).opacity,
    st: !!window.ScrollTrigger
  }));

  console.log('t0', await op());
  // 分步滚动，记录每步透明度
  for (let step = 1; step <= 8; step++) {
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 250); await page.waitForTimeout(50); }
    await page.waitForTimeout(1200); // 等 Lenis 稳定 + scrub 跟上
    const s = await op();
    console.log('step' + step, JSON.stringify(s));
    if (step === 3 || step === 5) await page.screenshot({ path: `fade-${step}.png` });
  }
  console.log('errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
