import { launch, open } from './pw.mjs';
const U = 'http://127.0.0.1:4400/', D = 'screenshots/';
const P = 16, K = 32, T = 128, S = 256, Dn = 2, R = 8, L = 4;
const b = await launch(); const errs = [];
const shot = async (p, n) => { await p.waitForTimeout(650); await p.screenshot({ path: D + n + '.png' }); console.log('shot', n); };
// motion helpers (P1 faces right)
const tap = (x, h = 3, gap = 6) => [...Array(h).fill(x), ...Array(gap).fill(0)];
const qcf = x => [Dn, Dn, Dn, Dn | R, Dn | R, R, R | x, R | x, ...Array(4).fill(0)];
const bf = x => [L, L, L, 0, R, R, R | x, R | x, 0, 0, 0, 0];
const dd = x => [Dn, Dn, 0, 0, Dn, Dn | x, Dn | x, 0, 0, 0, 0];
let p = await open(b, U); await p.waitForTimeout(300); await shot(p, '01_loading_or_title');
await p.waitForTimeout(1500); await shot(p, '02_title');
for (const [n, f] of [['03_menu', 'toMenu()'], ['04_options', 'showOptions()'], ['05_select', "startSelect('cpu')"], ['06_arena_select', 'showArena(()=>{})'], ['07_online_lobby', 'onlineLobby()'], ['08_move_list', 'showMoves()'], ['09_credits', 'showCredits()']]) {
  await p.evaluate(f => { BR.toMenu(); eval('BR.' + f); }, f); await p.waitForTimeout(700); await shot(p, n);
}
await p.evaluate(() => BR.toMenu());
const arenas = ['temple', 'ossuary', 'cathedral']; const pairs = [[0, 1], [2, 3], [3, 0], [1, 2]];
for (let i = 0; i < 4; i++) {
  const [c0, c1] = pairs[i], ar = arenas[i % 3];
  await p.evaluate(c => { BR.start({ mode: 'cpu', ...c, noai: true }); BR.freeze(true); }, { c0, c1, arena: ar });
  await p.evaluate(() => BR.sim(130)); await shot(p, `1${i}a_fight_${ar}_${c0}v${c1}`);
  await p.evaluate(() => BR.set(g => { g.f[0].x = -1; g.f[1].x = 1.6; }));
  const sp = [qcf(P), bf(K), dd(P)][i % 3];
  await p.evaluate(s => BR.sim(s.length, s), sp); await p.evaluate(() => BR.sim(6)); await shot(p, `1${i}b_special`);
  await p.evaluate(() => BR.sim(60));
  await p.evaluate(() => BR.set(g => { g.f[0].x = 0; g.f[1].x = 0.9; }));
  const combo = [...tap(P), ...tap(P), ...tap(Dn | P, 3, 10)];
  await p.evaluate(s => BR.sim(s.length, s), combo); await shot(p, `1${i}c_combo_juggle`);
  await p.evaluate(() => BR.sim(90)); await p.evaluate(() => BR.set(g => { g.f[0].meter = 100; g.f[0].x = 0; g.f[1].x = 2.5; }));
  await p.evaluate(s => BR.sim(s.length, s), tap(S)); await shot(p, `1${i}d_super_freeze`);
  await p.evaluate(() => BR.sim(30)); await shot(p, `1${i}e_super_beam`);
}
await p.evaluate(() => BR.sim(120)); await p.evaluate(() => BR.set(g => { g.f[0].x = 0; g.f[1].x = 0.7; }));
await p.evaluate(s => BR.sim(s.length, s), tap(T, 3, 14)); await shot(p, '20_throw');
// finisher per character
for (let c = 0; c < 4; c++) {
  await p.evaluate(c => { BR.start({ mode: 'cpu', c0: c, c1: (c + 1) % 4, arena: ['temple', 'ossuary', 'cathedral'][c % 3], noai: true }); BR.freeze(true); }, c);
  await p.evaluate(() => BR.sim(130)); await p.evaluate(() => BR.set(g => { g.f[0].wins = 1; g.f[1].hp = 1; g.f[0].x = 0; g.f[1].x = 0.8; }));
  await p.evaluate(s => BR.sim(s.length, s), tap(P, 3, 20)); const r = await p.evaluate(() => BR.sim(200)); console.log(c, r.phase);
  if (c === 0) await shot(p, '30_finisher_prompt');
  await p.evaluate(() => BR.set(g => { g.f[0].x = g.f[1].x - 1.2 * Math.sign(g.f[1].x - g.f[0].x || 1); }));
  await p.evaluate(s => BR.sim(s.length, s), tap(S)); await p.evaluate(() => BR.sim(60)); await shot(p, `3${c + 1}a_finisher_${c}`);
  await p.evaluate(() => BR.sim(80)); await shot(p, `3${c + 1}b_finisher_${c}`);
  const r2 = await p.evaluate(() => BR.sim(200)); console.log(' ->', r2.phase);
}
await p.evaluate(() => BR.sim(300)); await p.waitForTimeout(500); await shot(p, '40_results');
await p.evaluate(() => { BR.start({ mode: 'practice', c0: 2, c1: 3, arena: 'cathedral' }); BR.freeze(true); }); await p.evaluate(() => BR.sim(100));
await p.evaluate(() => BR.pause()); await p.waitForTimeout(400); await shot(p, '41_pause');
errs.push(...p.errs); await p.context().close();
const m = await open(b, U + '?touch=1', { width: 844, height: 390 }, { hasTouch: true, isMobile: true });
await m.waitForTimeout(800); await m.evaluate(() => { BR.start({ mode: 'cpu', c0: 2, c1: 0, arena: 'ossuary', noai: true }); BR.freeze(true); }); await m.evaluate(() => BR.sim(130)); await shot(m, '50_mobile_touch');
errs.push(...m.errs); await m.context().close();
const q = await open(b, U, { width: 390, height: 844 }, { hasTouch: true, isMobile: true }); await q.waitForTimeout(800); await shot(q, '51_mobile_rotate_prompt'); errs.push(...q.errs);
console.log('ERRS', JSON.stringify(errs.slice(0, 20))); await b.close();
