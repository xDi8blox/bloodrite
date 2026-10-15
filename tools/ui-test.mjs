// Regression: drive title → menu → select → arena → fight with ONLY taps (iPhone landscape emulation) or ONLY mouse clicks.
// usage: node tools/ui-test.mjs [url] [touch|mouse|both]
import { launch } from './pw.mjs'; import { devices } from 'playwright-core';
const URL = process.argv[2] || 'http://127.0.0.1:4400/'; const which = process.argv[3] || 'both';
const LOW = JSON.stringify({ master: 0, music: 0, sfx: 0, quality: 'low', difficulty: 'normal', voice: false });
const b = await launch(); let fails = 0;
async function page(kind) {
  const base = kind === 'touch' ? { ...devices['iPhone 13 landscape'] } : { viewport: { width: 1280, height: 720 } };
  delete base.defaultBrowserType;
  const ctx = await b.newContext(base); await ctx.addInitScript(s => localStorage.setItem('br_settings', s), LOW);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  p.on('console', m => m.type() === 'error' && p.errs.push(m.text().slice(0, 200))); p.on('requestfailed', r => p.errs.push('REQFAIL ' + r.url()));
  p.on('response', r => r.status() >= 400 && p.errs.push(r.status() + ' ' + r.url()));
  await p.goto(URL); await p.waitForFunction(() => window.BR?.ready, null, { timeout: 180000 }); await p.waitForTimeout(800); return p;
}
const act = (p, kind, sel) => kind === 'touch' ? p.locator(sel).first().tap({ timeout: 8000 }) : p.locator(sel).first().click({ timeout: 8000 });
const scr = p => p.evaluate(() => BR.screen());
async function expectScreen(p, want, step) { for (let i = 0; i < 20; i++) { if (await scr(p) === want) return; await p.waitForTimeout(150); } throw new Error(`${step}: expected screen "${want}", got "${await scr(p)}"`); }
async function run(kind, mode, label) {
  const p = await page(kind); const t = `[${kind}/${mode}]`;
  try {
    await act(p, kind, '#s-title'); await expectScreen(p, 'menu', 'title tap');
    await act(p, kind, `#mainmenu .it:has-text("${label}")`); await expectScreen(p, 'select', 'menu → select');
    await act(p, kind, '#selgrid .card >> nth=2');             // pick a fighter by tapping its card
    if (kind === 'touch') { await p.waitForTimeout(200); await act(p, kind, '#selok'); } // touch: first tap highlights, big CONFIRM confirms; mouse: hover highlights, click confirms
    if (mode === 'online') {
      await expectScreen(p, 'online', 'select → lobby'); await act(p, kind, '#nbc'); await expectScreen(p, 'arena', 'create room → arena');
      await act(p, kind, '#arenagrid .acard >> nth=1'); if (kind === 'touch') await act(p, kind, '#arenaok'); await expectScreen(p, 'online', 'arena → room');
      await p.waitForFunction(() => BR.room(), null, { timeout: 15000 }); console.log(t, 'OK room', await p.evaluate(() => BR.room()), '|', await p.locator('#netstatus').textContent());
    } else {
      if (mode === 'cpu') await act(p, kind, '#selrand'); else { await act(p, kind, '#selgrid .card >> nth=3'); if (kind === 'touch') await act(p, kind, '#selgrid .card >> nth=3'); } // touch: tap twice = confirm
      await expectScreen(p, 'arena', 'opponent → arena');
      await act(p, kind, '#arenagrid .acard >> nth=2'); if (kind === 'touch') await act(p, kind, '#arenaok');
      await expectScreen(p, '', 'arena → fight');
      await p.waitForFunction(() => BR.gs()?.phase === 'fight', null, { timeout: 60000 });
      if (kind === 'touch' && !(await p.locator('#touch').isVisible())) throw new Error('touch controls not visible in fight');
      if (kind === 'touch') { await act(p, kind, '#tpause'); await expectScreen(p, 'pause', 'touch pause'); await act(p, kind, '#pausemenu .it:has-text("QUIT")'); await expectScreen(p, 'menu', 'quit'); }
      console.log(t, 'OK fight started', JSON.stringify(await p.evaluate(() => BR.gs()?.f.map(f => f.ch) ?? null)));
    }
    if (p.errs.length) throw new Error('console errors: ' + p.errs.join(' | '));
  } catch (e) { fails++; console.log(t, 'FAIL', e.message.split('\n').slice(0, 12).join(' / ')); await p.screenshot({ path: `/tmp/fail_${kind}_${mode}.png` }); }
  await p.context().close();
}
const modes = [['cpu', 'VERSUS CPU'], ['local', '2 PLAYERS'], ['practice', 'PRACTICE'], ['online', 'ONLINE']];
for (const k of which === 'both' ? ['touch', 'mouse'] : [which]) for (const [m, l] of modes) await run(k, m, l);
// guest joining by link with touch
if (which !== 'mouse') { const g = await (async () => { const p = await page('touch'); return p; })(); await g.goto(URL + '?room=TEST12'); await g.waitForFunction(() => window.BR?.ready); await g.waitForTimeout(1000);
  try { await expectScreen(g, 'select', 'guest link'); await act(g, 'touch', '#selok'); await expectScreen(g, 'online', 'guest confirm'); console.log('[touch/guest] OK', (await g.locator('#onlinebody').innerText()).split('\n')[0]); } catch (e) { fails++; console.log('[touch/guest] FAIL', e.message); }
  await g.context().close(); }
console.log(fails ? `FAILED ${fails}` : 'ALL PASSED'); await b.close(); process.exit(fails ? 1 : 0);
