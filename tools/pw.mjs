import { chromium } from 'playwright-core'; import { readdirSync } from 'fs';
const d = process.env.HOME + '/.cache/ms-playwright/'; export const exe = d + readdirSync(d).find(x => /^chromium-\d/.test(x)) + '/chrome-linux64/chrome';
export async function launch() { return chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }); }
export async function open(b, url, vp = { width: 1600, height: 900 }, extra = {}) {
  const ctx = await b.newContext({ viewport: vp, ...extra }); const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') p.errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await p.goto(url); await p.waitForFunction(() => window.BR?.ready, null, { timeout: 180000 }); return p;
}
