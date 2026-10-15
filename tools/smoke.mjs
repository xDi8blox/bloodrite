import { launch, open } from './pw.mjs';
const b = await launch(); const p = await open(b, 'http://127.0.0.1:4400/');
await p.waitForTimeout(1500); console.log('screen', await p.evaluate(() => BR.screen()));
await p.screenshot({ path: '/tmp/s1.png' });
await p.evaluate(() => { BR.start({ mode: 'cpu', c0: 0, c1: 1, noai: true }); BR.freeze(true); });
console.log(JSON.stringify(await p.evaluate(() => BR.sim(120))));
await p.screenshot({ path: '/tmp/s2.png' }); console.log(p.errs.slice(0, 10)); await b.close();
