import { chromium } from 'playwright-core';
import { readdirSync } from 'fs';
const d = process.env.HOME + '/.cache/ms-playwright/'; const exe = d + readdirSync(d).find(x => /^chromium-\d/.test(x)) + '/chrome-linux64/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:4400/'); await p.waitForFunction(() => window.G, null, { timeout: 120000 });
for (const n of (process.argv[2] || 'idle,punch,kick,combo,closeA,closeB').split(',')) {
  const r = await p.evaluate(n => window.G.shot(n), n); await p.waitForTimeout(1500);
  await p.screenshot({ path: `screenshots/${n}.png` }); console.log(n, JSON.stringify(r));
}
console.log('errors', errs.slice(0, 5)); await b.close();
