import { launch, open } from './pw.mjs';
const U = 'http://127.0.0.1:4400/'; const b = await launch(); const vp = { width: 640, height: 360 }; const ex = { storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:4400', localStorage: [{ name: 'br_settings', value: JSON.stringify({ master: 0, music: 0, sfx: 0, quality: 'low', difficulty: 'normal', voice: false }) }] }] } };
const h = await open(b, U, vp, ex); await h.waitForTimeout(800);
await h.evaluate(() => { BR.toMenu(); BR.onlineLobby(); }); await h.click('#nbc'); await h.waitForTimeout(400);
await h.keyboard.press('ArrowRight'); await h.waitForTimeout(200);
if (await h.evaluate(() => BR.screen()) === 'arena') { await h.keyboard.press('Enter'); await h.waitForTimeout(300); }
let room; for (let i = 0; i < 60 && !room; i++) { await h.waitForTimeout(500); room = await h.evaluate(() => BR.room()); }
console.log('room', room, await h.evaluate(() => document.getElementById('netstatus')?.textContent));
await h.waitForTimeout(3000);
const g = await open(b, U + '?room=' + room, vp, ex); await g.waitForTimeout(1500);
console.log('guest screen', await g.evaluate(() => BR.screen())); await g.keyboard.press('KeyJ'); await g.waitForTimeout(300); await g.keyboard.press('Enter');
let ok = false; for (let i = 0; i < 60 && !ok; i++) { await g.waitForTimeout(500); ok = await g.evaluate(() => !!BR.net()) && await h.evaluate(() => !!BR.net()); }
console.log('match started', ok); if (!ok) { console.log(await g.evaluate(() => document.getElementById('onlinebody')?.innerText), h.errs, g.errs); process.exit(1); }
const keys = ['KeyD', 'KeyJ', 'KeyK', 'KeyA', 'KeyS', 'KeyI', 'KeyO'];
for (let t = 0; t < 90; t++) { const k1 = keys[t % 7], k2 = keys[(t * 3) % 7];
  await Promise.all([h.keyboard.down(k1), g.keyboard.down(k2)]); await h.waitForTimeout(120); await Promise.all([h.keyboard.up(k1), g.keyboard.up(k2)]); await h.waitForTimeout(80); }
await h.waitForTimeout(1500);
const nh = await h.evaluate(() => BR.net()), ng = await g.evaluate(() => BR.net());
const mg = new Map(ng.hashes); let cmp = 0, bad = 0; for (const [f, x] of nh.hashes) if (mg.has(f)) { cmp++; if (mg.get(f) !== x) bad++; }
console.log('host', { ...nh, hashes: nh.hashes.length }, '\nguest', { ...ng, hashes: ng.hashes.length }, '\ncompared', cmp, 'mismatch', bad);
console.log('hp host', await h.evaluate(() => BR.gs().f.map(f => f.hp)), 'guest', await g.evaluate(() => BR.gs().f.map(f => f.hp)));
await h.screenshot({ path: 'screenshots/60_online_host.png' }); await g.screenshot({ path: 'screenshots/61_online_guest.png' });
await g.context().close(); for (let i = 0; i < 16; i++) { await h.waitForTimeout(500); if (await h.evaluate(() => BR.screen()) === 'online') break; }
console.log('after guest left, host screen:', await h.evaluate(() => BR.screen()), await h.evaluate(() => document.getElementById('onlinebody')?.innerText));
await h.screenshot({ path: 'screenshots/62_online_disconnect.png' }); console.log('errs', h.errs, g.errs); await b.close();
