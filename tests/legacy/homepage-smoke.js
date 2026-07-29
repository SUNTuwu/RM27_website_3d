const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  const pageErrors = [];
  const failedReqs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('requestfailed', r => failedReqs.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));

  console.log('== 1. 加载页面 ==');
  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);

  // 星场是否在渲染：抓两帧 canvas 像素对比
  const shot = () => page.evaluate(() => {
    const c = document.getElementById('warp');
    const t = document.createElement('canvas');
    t.width = 160; t.height = 90;
    t.getContext('2d').drawImage(c, 0, 0, 160, 90);
    return t.toDataURL().length;
  });
  const f1 = await shot();
  await page.waitForTimeout(500);
  const f2 = await shot();
  console.log('canvas frame sizes:', f1, f2, '->', f1 !== f2 ? 'ANIMATING ✅' : 'STATIC ❌');

  // WebGL 上下文存活
  const webgl = await page.evaluate(() => {
    const c = document.getElementById('warp');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  });
  console.log('webgl context:', webgl ? 'OK' : 'MISSING');

  console.log('== 2. 滚动驱动曲速 ==');
  const velBefore = await page.textContent('#vel-val');
  // 模拟快速滚动
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  const velDuring = await page.textContent('#vel-val');
  console.log('warp velocity before/after scroll:', velBefore, '/', velDuring,
    '->', parseFloat(velDuring) > parseFloat(velBefore) ? 'SCROLL DRIVES WARP ✅' : 'NO RESPONSE ❌');

  console.log('== 3. 各航点截图 ==');
  const stops = ['hero', 'about', 'honors', 'depts', 'tech', 'join'];
  for (const id of stops) {
    await page.evaluate(id => document.getElementById(id).scrollIntoView(), id);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `shot-${id}.png` });
    console.log('saved shot-' + id + '.png');
  }

  console.log('== 4. 跃迁按钮 ==');
  await page.evaluate(() => document.getElementById('join').scrollIntoView());
  await page.waitForTimeout(1200);
  await page.click('#jump-btn');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shot-jump.png' });
  const flashVisible = await page.evaluate(() => document.querySelector('#join .grid').getBoundingClientRect().top < window.innerHeight);
  console.log('after jump, contact grid in view:', flashVisible ? '✅' : '❌');
  console.log('saved shot-jump.png');

  console.log('\n== 控制台错误 ==');
  console.log(consoleErrors.length ? consoleErrors : 'none ✅');
  console.log('== 页面异常 ==');
  console.log(pageErrors.length ? pageErrors : 'none ✅');
  console.log('== 请求失败 ==');
  console.log(failedReqs.length ? failedReqs : 'none ✅');

  await browser.close();
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
