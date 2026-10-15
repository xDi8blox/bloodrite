// Deterministic fighting simulation (60 Hz fixed step). Plain data only, so it can be cloned for rollback.
export const U = 1, D = 2, L = 4, R = 8, P = 16, K = 32, B = 64, T = 128, S = 256;
export type SpecialKind = 'proj' | 'pull' | 'rush' | 'slide' | 'teleport' | 'pillar';
export interface SpecialDef { name: string; motion: 'qcf' | 'bf' | 'dd'; btn: 'P' | 'K'; kind: SpecialKind; dmg: number; color: number }
export interface CharSim { specials: SpecialDef[]; superName: string; speed: number; power: number }
export interface Move { anim: string; total: number; a0: number; a1: number; dmg: number; range: number; h: 'high' | 'mid' | 'low'; stun: number; kb: number; launch?: number; knock?: boolean; throw?: boolean; air?: boolean; heavy?: boolean; fwd?: number; special?: SpecialDef; superMove?: boolean }
export const MOVES: Record<string, Move> = {
  jab: { anim: 'jab', total: 17, a0: 5, a1: 8, dmg: 4, range: 1.15, h: 'high', stun: 15, kb: 0.035 },
  cross: { anim: 'cross', total: 21, a0: 6, a1: 9, dmg: 6, range: 1.2, h: 'high', stun: 17, kb: 0.04 },
  hook: { anim: 'hook', total: 30, a0: 11, a1: 14, dmg: 8, range: 1.2, h: 'mid', stun: 22, kb: 0.05, launch: 0.21, heavy: true },
  upper: { anim: 'upper', total: 30, a0: 7, a1: 11, dmg: 9, range: 1.1, h: 'mid', stun: 22, kb: 0.03, launch: 0.27, heavy: true },
  kick: { anim: 'kick', total: 28, a0: 10, a1: 14, dmg: 8, range: 1.5, h: 'mid', stun: 20, kb: 0.08, heavy: true },
  lowk: { anim: 'lowk', total: 26, a0: 8, a1: 11, dmg: 6, range: 1.45, h: 'low', stun: 18, kb: 0.03, knock: true },
  airk: { anim: 'airk', total: 24, a0: 4, a1: 16, dmg: 7, range: 1.35, h: 'high', stun: 18, kb: 0.05, air: true },
  airp: { anim: 'airp', total: 18, a0: 3, a1: 11, dmg: 5, range: 1.1, h: 'high', stun: 16, kb: 0.03, air: true },
  throw: { anim: 'throw', total: 44, a0: 4, a1: 6, dmg: 12, range: 0.95, h: 'mid', stun: 0, kb: 0, throw: true, heavy: true },
};
export interface Proj { x: number; y: number; vx: number; owner: number; dmg: number; life: number; kind: SpecialKind; color: number; id: number }
export interface Hazard { x: number; t: number; owner: number; dmg: number; color: number; hit: boolean }
export interface FS {
  ch: number; x: number; y: number; vx: number; vy: number; face: number; hp: number; meter: number; st: string; t: number; mv: string; hit: boolean;
  combo: number; comboDmg: number; juggle: number; stun: number; inv: number; hist: number[]; prev: number; wins: number; chain: number; hidden: boolean; lastHitF: number;
}
export interface Ev { type: string; f: number; who: number; x?: number; y?: number; heavy?: boolean; blocked?: boolean; text?: string; color?: number; kind?: string; n?: number }
export interface GS {
  frame: number; f: FS[]; projs: Proj[]; haz: Hazard[]; phase: string; pt: number; round: number; timer: number; hitstop: number; slow: number; freeze: number; superBy: number;
  rng: number; events: Ev[]; winner: number; over: boolean; practice: boolean; nid: number; finisher: number; finishOk: boolean; matchText: string;
}
export const NAMES = ['VORATH', 'KAIJIN', 'NYXARA', 'MORGRIM'];
const GRAV = 0.0155, WALL = 6.6, MAXD = 5.2;
export const ROUND_TIME = 99 * 60;
function mkF(ch: number, x: number, face: number): FS {
  return { ch, x, y: 0, vx: 0, vy: 0, face, hp: 100, meter: 0, st: 'idle', t: 0, mv: '', hit: false, combo: 0, comboDmg: 0, juggle: 0, stun: 0, inv: 0, hist: [], prev: 0, wins: 0, chain: 0, hidden: false, lastHitF: -999 };
}
export function createGame(c0: number, c1: number, seed: number, practice = false): GS {
  return { frame: 0, f: [mkF(c0, -1.6, 1), mkF(c1, 1.6, -1)], projs: [], haz: [], phase: 'intro', pt: 0, round: 1, timer: ROUND_TIME, hitstop: 0, slow: 0, freeze: 0, superBy: -1,
    rng: seed >>> 0 || 1, events: [], winner: -1, over: false, practice, nid: 1, finisher: -1, finishOk: false, matchText: '' };
}
function rand(g: GS) { g.rng = (Math.imul(g.rng, 1664525) + 1013904223) >>> 0; return g.rng / 4294967296; }
function ev(g: GS, e: Omit<Ev, 'f'>) { g.events.push({ ...e, f: g.frame }); }
function resetRound(g: GS) {
  const [a, b] = g.f;
  for (const [f, x, face] of [[a, -1.6, 1], [b, 1.6, -1]] as [FS, number, number][]) Object.assign(f, { x, y: 0, vx: 0, vy: 0, face, hp: 100, st: 'idle', t: 0, mv: '', stun: 0, inv: 0, juggle: 0, combo: 0, hidden: false, hist: [] });
  g.projs = []; g.haz = []; g.timer = ROUND_TIME; g.phase = 'intro'; g.pt = 0; g.slow = 0;
}
// numpad direction relative to facing
function dirOf(inp: number, face: number) {
  const fwd = face > 0 ? (inp & R) : (inp & L), back = face > 0 ? (inp & L) : (inp & R);
  const h = fwd ? 1 : back ? -1 : 0, v = inp & U ? 1 : inp & D ? -1 : 0;
  return 5 + h + v * 3;
}
function motion(h: number[], m: string) {
  const n = h.length; const seq = m === 'qcf' ? [2, 3, 6] : m === 'bf' ? [4, 6] : [2, 5, 2];
  let k = seq.length - 1;
  for (let i = n - 1; i >= Math.max(0, n - 18) && k >= 0; i--) {
    const d = h[i];
    if (d === seq[k] || (m === 'qcf' && k === 2 && d === 6) || (m === 'dd' && k === 1 && d !== 2 && d !== 1 && d !== 3)) k--;
    else if (m === 'bf' && k === 0 && (d === 1 || d === 7)) k--;
  }
  return k < 0;
}
const grounded = (f: FS) => f.y <= 0 && !['air', 'jump', 'thrown'].includes(f.st);
const actionable = (f: FS) => ['idle', 'walk', 'back', 'crouch', 'block', 'cblock'].includes(f.st);
function startMove(g: GS, f: FS, mv: string) { f.st = 'attack'; f.mv = mv; f.t = 0; f.hit = false; ev(g, { type: 'whoosh', who: g.f.indexOf(f), heavy: !!MOVES[mv]?.heavy }); }
export function moveOf(f: FS, chars: CharSim[]): Move {
  if (f.mv.startsWith('sp')) { const s = chars[f.ch].specials[+f.mv[2]]; return SPECIAL_MOVE(s); }
  if (f.mv === 'super') return SUPER_MOVE;
  return MOVES[f.mv];
}
export const SUPER_MOVE: Move = { anim: 'super', total: 84, a0: 26, a1: 66, dmg: 4, range: 7.5, h: 'mid', stun: 20, kb: 0.0, superMove: true, heavy: true };
const spCache = new Map<SpecialDef, Move>();
export function SPECIAL_MOVE(s: SpecialDef): Move {
  let m = spCache.get(s); if (m) return m;
  const base = { anim: 'spell', h: 'mid' as const, stun: 22, kb: 0.06, special: s, heavy: true, dmg: s.dmg, range: 0 };
  if (s.kind === 'proj' || s.kind === 'pull') m = { ...base, total: 40, a0: 999, a1: 999 };
  else if (s.kind === 'rush') m = { ...base, anim: 'rush', total: 34, a0: 7, a1: 22, range: 1.2, knock: true, fwd: 0.15 };
  else if (s.kind === 'slide') m = { ...base, anim: 'slide', h: 'low', total: 34, a0: 5, a1: 22, range: 1.3, knock: true, fwd: 0.17 };
  else if (s.kind === 'teleport') m = { ...base, anim: 'tele', total: 40, a0: 18, a1: 24, range: 1.3, launch: 0.2 };
  else m = { ...base, anim: 'spell', total: 46, a0: 999, a1: 999 };
  spCache.set(s, m); return m;
}
function canAct(g: GS) { return g.phase === 'fight' || g.phase === 'finish' || (g.practice && g.phase !== 'intro'); }

function controls(g: GS, i: number, inp: number, chars: CharSim[]) {
  const f = g.f[i], o = g.f[1 - i]; const pressed = inp & ~f.prev; f.prev = inp;
  const d = dirOf(inp, f.face); f.hist.push(d); if (f.hist.length > 24) f.hist.shift();
  if (!canAct(g)) { if (actionable(f)) { f.st = 'idle'; f.vx = 0; } return; }
  if (g.phase === 'finish' && i !== g.winner) return;
  const cs = chars[f.ch];
  // finisher
  if (g.phase === 'finish' && i === g.winner && (pressed & S) && Math.abs(f.x - o.x) < 2.4 && grounded(f)) {
    g.phase = 'fatal'; g.pt = 0; f.st = 'fatal'; f.t = 0; o.st = 'fatalv'; o.t = 0; g.finisher = i; ev(g, { type: 'finisher', who: i }); ev(g, { type: 'announce', who: i, text: 'DAMNATION' }); return;
  }
  // chain cancels / specials from normals
  const inAtk = f.st === 'attack';
  const cancelable = inAtk && f.hit && f.t > 4 && !f.mv.startsWith('sp') && f.mv !== 'super' && f.mv !== 'throw';
  if (!(actionable(f) || cancelable || f.st === 'jump')) return;
  if (f.st !== 'jump' && grounded(f)) {
    if ((pressed & S) && f.meter >= 100 && g.phase === 'fight' || (pressed & S) && g.practice && f.meter >= 100) { f.meter = 0; startMove(g, f, 'super'); g.freeze = 40; g.superBy = i; ev(g, { type: 'super', who: i }); return; }
    if (pressed & (P | K)) {
      const btn = pressed & P ? 'P' : 'K';
      const si = cs.specials.findIndex(s => s.btn === btn && motion(f.hist, s.motion));
      if (si >= 0 && (!inAtk || cancelable)) { startMove(g, f, 'sp' + si); f.hist = []; ev(g, { type: 'special', who: i, n: si }); return; }
    }
    if ((pressed & T || (pressed & (P | K)) && (inp & P) && (inp & K)) && !inAtk) { startMove(g, f, 'throw'); return; }
    if (pressed & P) {
      if (cancelable && (f.mv === 'jab' || f.mv === 'cross')) { startMove(g, f, f.mv === 'jab' ? 'cross' : 'hook'); return; }
      if (!inAtk) { startMove(g, f, d <= 3 ? 'upper' : 'jab'); return; }
    }
    if (pressed & K) { if (!inAtk || cancelable) { startMove(g, f, d <= 3 ? 'lowk' : 'kick'); return; } }
    if (inAtk) return;
    const blk = inp & B;
    if (d <= 3) { f.st = blk ? 'cblock' : 'crouch'; f.vx = 0; return; }
    if (blk) { f.st = 'block'; f.vx = 0; return; }
    if (d >= 7) { f.st = 'jump'; f.t = 0; f.vy = 0.245; f.vx = d === 9 ? 0.06 * f.face : d === 7 ? -0.05 * f.face : 0; f.y = 0.001; ev(g, { type: 'jump', who: i }); return; }
    if (d === 6) { f.st = 'walk'; f.vx = 0.047 * cs.speed * f.face; } else if (d === 4) { f.st = 'back'; f.vx = -0.037 * cs.speed * f.face; } else { f.st = 'idle'; f.vx = 0; }
  } else if (f.st === 'jump') {
    if (pressed & K) { startMove(g, f, 'airk'); } else if (pressed & P) { startMove(g, f, 'airp'); }
  }
}
function hitTest(g: GS, ai: number, mv: Move, chars: CharSim[]) {
  const a = g.f[ai], o = g.f[1 - ai];
  if (o.inv > 0 || o.hidden || ['down', 'getup', 'ko', 'fatalv'].includes(o.st)) return;
  const dx = (o.x - a.x) * a.face; if (dx < 0 || dx > mv.range) return;
  if (Math.abs(o.y - a.y) > (mv.air ? 1.3 : 1.0)) return;
  if (mv.throw && (!grounded(o) || o.st === 'hitstun' || o.st === 'blockstun')) return;
  a.hit = true; applyHit(g, ai, mv, a.x + a.face * Math.min(dx, mv.range) * 0.8, a.y + (mv.h === 'low' ? 0.45 : mv.air ? 1.1 : 1.35), chars);
}
function applyHit(g: GS, ai: number, mv: Move, hx: number, hy: number, chars: CharSim[]) {
  const a = g.f[ai], o = g.f[1 - ai]; const di = 1 - ai;
  const standBlock = o.st === 'block' || (o.st === 'blockstun' && o.y <= 0 && o.mv !== 'c');
  const crouchBlock = o.st === 'cblock' || (o.st === 'blockstun' && o.mv === 'c');
  const blocked = !mv.throw && ((standBlock && mv.h !== 'low') || crouchBlock);
  const power = chars[a.ch].power;
  if (blocked) {
    const chip = mv.superMove ? 1.2 : mv.special ? 1 : 0.4;
    o.hp = Math.max(g.practice ? 1 : 0, o.hp - chip); o.mv = crouchBlock ? 'c' : ''; o.st = 'blockstun'; o.stun = 10; o.vx = a.face * (mv.superMove ? 0.02 : 0.07); o.t = 0;
    a.meter = Math.min(100, a.meter + 3); o.meter = Math.min(100, o.meter + 4); g.hitstop = 4;
    ev(g, { type: 'hit', who: ai, x: hx, y: hy, blocked: true, heavy: !!mv.heavy, color: mv.special?.color ?? -1 });
    return;
  }
  const juggled = o.st === 'air' || o.y > 0.05;
  const comboing = o.st === 'hitstun' || o.st === 'air' || o.st === 'thrown';
  a.combo = comboing ? a.combo + 1 : 1; if (a.combo === 1) a.comboDmg = 0;
  const scale = Math.max(0.35, 1 - 0.09 * (a.combo - 1));
  const dmg = mv.dmg * power * scale; a.comboDmg += dmg; a.lastHitF = g.frame;
  o.hp = Math.max(g.practice ? 1 : 0, o.hp - dmg);
  a.meter = Math.min(100, a.meter + 5 + dmg * 0.5); o.meter = Math.min(100, o.meter + 3);
  o.combo = 0; o.t = 0; o.mv = '';
  if (mv.throw) {
    o.st = 'thrown'; o.stun = 34; o.vx = 0; o.vy = 0; a.vx = 0;
    ev(g, { type: 'throw', who: ai, x: hx, y: hy });
  } else if (mv.launch || juggled || mv.knock || o.hp <= 0) {
    o.juggle++; const decay = Math.max(0.35, 1 - 0.18 * (o.juggle - 1));
    o.st = 'air'; o.vy = (mv.launch ?? (mv.knock ? 0.12 : 0.14)) * (juggled ? decay : 1); if (o.hp <= 0) o.vy = Math.max(o.vy, 0.17);
    o.vx = a.face * (mv.knock ? 0.07 : 0.035); o.y = Math.max(o.y, 0.02);
    if (o.juggle > 6) { o.vy = -0.05; }
  } else { o.st = 'hitstun'; o.stun = mv.stun; o.vx = a.face * mv.kb; }
  if (mv.special?.kind === 'pull') { o.st = 'hitstun'; o.stun = 46; o.x = a.x + a.face * 0.95; o.vx = 0; o.y = 0; o.vy = 0; }
  g.hitstop = mv.superMove ? 3 : mv.heavy ? 9 : 6;
  ev(g, { type: 'hit', who: ai, x: hx, y: hy, heavy: !!mv.heavy, blocked: false, color: mv.special?.color ?? -1, n: a.combo });
  if (o.hp <= 0 && g.phase === 'fight') {
    g.phase = 'ko'; g.pt = 0; g.winner = ai; a.wins++; g.slow = 90; ev(g, { type: 'announce', who: ai, text: 'K.O.' }); ev(g, { type: 'ko', who: di });
  }
  void di;
}
function physics(g: GS, f: FS, i: number) {
  const o = g.f[1 - i];
  if (f.st === 'jump' || f.st === 'air' || (f.st === 'attack' && f.y > 0) || f.st === 'thrown' && false) {
    f.x += f.vx; f.y += f.vy; f.vy -= GRAV * (f.st === 'air' ? 0.95 : 1);
    if (f.y <= 0) {
      f.y = 0; f.vy = 0;
      if (f.st === 'air') { f.st = f.hp <= 0 ? 'ko' : 'down'; f.t = 0; f.juggle = 0; f.vx = 0; ev(g, { type: 'land', who: i, heavy: true, x: f.x }); }
      else { f.st = 'idle'; f.vx = 0; f.mv = ''; ev(g, { type: 'land', who: i, x: f.x }); }
    }
  } else { f.x += f.vx; if (f.st === 'hitstun' || f.st === 'blockstun') f.vx *= 0.88; }
  f.x = Math.max(-WALL, Math.min(WALL, f.x));
  // keep fighters within camera range
  if (Math.abs(f.x - o.x) > MAXD) f.x = o.x + Math.sign(f.x - o.x) * MAXD;
}
export function step(g: GS, inputs: [number, number], chars: CharSim[]) {
  g.events = [];
  g.frame++;
  if (g.slow > 0) { g.slow--; if (g.frame % 3 !== 0) { phaseTick(g); return; } }
  if (g.freeze > 0) { g.freeze--; const sf = g.f[g.superBy]; if (sf) sf.t++; return; }
  for (let i = 0; i < 2; i++) controls(g, i, inputs[i], chars);
  if (g.hitstop > 0) { g.hitstop--; return; }
  const [a, b] = g.f;
  for (let i = 0; i < 2; i++) {
    const f = g.f[i], o = g.f[1 - i]; f.t++;
    if (f.inv > 0) f.inv--;
    if (actionable(f) || f.st === 'jump' && f.t < 2) f.face = o.x > f.x ? 1 : -1;
    switch (f.st) {
      case 'hitstun': case 'blockstun': if (--f.stun <= 0) { f.st = 'idle'; f.vx = 0; } break;
      case 'down': if (f.t > 40) { f.st = 'getup'; f.t = 0; f.inv = 24; } break;
      case 'getup': if (f.t > 24) { f.st = 'idle'; } break;
      case 'thrown': {
        if (f.t === 18) { f.x = o.x - o.face * 0.4; }
        if (f.t >= 34) { f.st = 'air'; f.vy = 0.1; f.vx = o.face * -0.08 * -1; f.y = 0.05; f.face = -o.face; ev(g, { type: 'slam', who: i, x: f.x }); if (f.hp <= 0 && g.phase === 'fight') { /* handled on land */ } }
        break; }
      case 'attack': {
        const mv = moveOf(f, chars);
        if (mv.fwd && f.t >= mv.a0 - 2 && f.t <= mv.a1) f.vx = mv.fwd * f.face; else if (grounded(f)) f.vx *= 0.7;
        const s = mv.special;
        if (s && (s.kind === 'proj' || s.kind === 'pull') && f.t === 14) { g.projs.push({ x: f.x + f.face * 0.7, y: 1.3, vx: f.face * (s.kind === 'pull' ? 0.2 : 0.14), owner: i, dmg: s.dmg, life: 70, kind: s.kind, color: s.color, id: g.nid++ }); ev(g, { type: 'proj', who: i, color: s.color }); }
        if (s && s.kind === 'pillar' && f.t === 16) { g.haz.push({ x: o.x, t: 0, owner: i, dmg: s.dmg, color: s.color, hit: false }); ev(g, { type: 'pillar', who: i, x: o.x, color: s.color }); }
        if (s && s.kind === 'teleport') { if (f.t === 6) { f.hidden = true; f.inv = 14; } if (f.t === 14) { f.x = o.x - o.face * 0.95; f.face = o.x > f.x ? 1 : -1; f.hidden = false; ev(g, { type: 'tele', who: i, x: f.x, color: s.color }); } }
        if (mv.superMove) { if (f.t >= mv.a0 && f.t <= mv.a1 && (f.t - mv.a0) % 8 === 0) { f.hit = false; } if (f.t === mv.a1) { /* final blast */ } }
        if (f.t >= mv.a0 && f.t <= mv.a1 && !f.hit) {
          if (mv.superMove) {
            const dx = (o.x - f.x) * f.face;
            if (dx > 0 && dx < mv.range && o.inv <= 0 && !['down', 'getup', 'ko'].includes(o.st)) { f.hit = true; const fin = f.t + 8 > mv.a1; applyHit(g, i, fin ? { ...mv, dmg: 12, launch: 0.24 } : mv, o.x - f.face * 0.2, 1.3, chars); }
          } else hitTest(g, i, mv, chars);
        }
        if (f.t >= mv.total) { f.st = f.y > 0 ? 'jump' : 'idle'; f.mv = ''; f.vx = f.y > 0 ? f.vx : 0; }
        break; }
      case 'fatal': break;
    }
    physics(g, f, i);
  }
  // push apart
  if (!a.hidden && !b.hidden && Math.abs(a.y - b.y) < 1.2) { const d = b.x - a.x, min = 0.62; if (Math.abs(d) < min) { const p = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1); a.x -= p; b.x += p; } }
  // projectiles
  for (const pr of g.projs) {
    pr.x += pr.vx; pr.life--; const o = g.f[1 - pr.owner];
    const other = g.projs.find(q => q !== pr && q.owner !== pr.owner && Math.abs(q.x - pr.x) < 0.4 && q.life > 0);
    if (other) { pr.life = 0; other.life = 0; ev(g, { type: 'clash', who: pr.owner, x: pr.x, y: pr.y }); continue; }
    if (pr.life > 0 && Math.abs(o.x - pr.x) < 0.45 && o.y < 1.6 && o.st !== 'crouch' && o.st !== 'cblock' || pr.life > 0 && Math.abs(o.x - pr.x) < 0.45 && pr.kind === 'pull' && o.y < 1.6) {
      if (o.inv <= 0 && !o.hidden && !['down', 'getup', 'ko'].includes(o.st)) { pr.life = 0; applyHit(g, pr.owner, { anim: '', total: 1, a0: 0, a1: 0, dmg: pr.dmg, range: 0, h: 'mid', stun: 24, kb: 0.06, heavy: true, special: { name: '', motion: 'qcf', btn: 'P', kind: pr.kind, dmg: pr.dmg, color: pr.color } }, pr.x, pr.y, chars); }
    }
  }
  g.projs = g.projs.filter(p => p.life > 0 && Math.abs(p.x) < 9);
  for (const h of g.haz) {
    h.t++; const o = g.f[1 - h.owner];
    if (h.t >= 14 && h.t <= 26 && !h.hit && Math.abs(o.x - h.x) < 0.65 && o.inv <= 0 && !['down', 'getup', 'ko'].includes(o.st)) {
      h.hit = true; applyHit(g, h.owner, { anim: '', total: 1, a0: 0, a1: 0, dmg: h.dmg, range: 0, h: 'mid', stun: 22, kb: 0.02, launch: 0.26, heavy: true, special: { name: '', motion: 'dd', btn: 'P', kind: 'pillar', dmg: h.dmg, color: h.color } }, h.x, 1.0, chars);
    }
  }
  g.haz = g.haz.filter(h => h.t < 40);
  if (g.practice) for (const f of g.f) { if (f.st === 'idle' && g.frame - g.f[1 - g.f.indexOf(f)].lastHitF > 90) f.hp = Math.min(100, f.hp + 1); }
  for (const f of g.f) if (f.combo && g.frame - f.lastHitF > 60 && g.f[1 - g.f.indexOf(f)].st !== 'hitstun' && g.f[1 - g.f.indexOf(f)].st !== 'air') f.combo = 0;
  phaseTick(g);
}
function phaseTick(g: GS) {
  g.pt++;
  const [a, b] = g.f;
  if (g.phase === 'intro') {
    if (g.pt === 1) ev(g, { type: 'announce', who: -1, text: g.practice ? 'PRACTICE' : g.round === 3 ? 'FINAL ROUND' : 'ROUND ' + g.round });
    if (g.pt === 70) ev(g, { type: 'announce', who: -1, text: 'FIGHT!' });
    if (g.pt >= 90) { g.phase = 'fight'; g.pt = 0; }
  } else if (g.phase === 'fight') {
    if (!g.practice && --g.timer <= 0) { g.winner = a.hp >= b.hp ? 0 : 1; g.f[g.winner].wins++; g.phase = 'ko'; g.pt = 0; ev(g, { type: 'announce', who: g.winner, text: 'TIME' }); g.f[1 - g.winner].st = 'ko'; }
  } else if (g.phase === 'ko') {
    const w = g.f[g.winner], l = g.f[1 - g.winner];
    if (g.pt === 150) {
      if (w.wins >= 2) {
        g.phase = 'finish'; g.pt = 0; l.st = 'dazed'; l.hp = 1; l.y = 0; l.t = 0; l.inv = 0; w.st = 'idle'; w.meter = 100; ev(g, { type: 'announce', who: g.winner, text: 'CONDEMN THEM!' });
      } else { ev(g, { type: 'announce', who: g.winner, text: NAMES[w.ch] + ' WINS' }); }
    }
    if (g.pt === 250 && g.phase === 'ko') { g.round++; resetRound(g); }
  } else if (g.phase === 'finish') {
    if (g.pt === 330) { g.phase = 'match'; g.pt = 0; g.f[1 - g.winner].st = 'ko'; g.matchText = ''; ev(g, { type: 'announce', who: g.winner, text: NAMES[g.f[g.winner].ch] + ' WINS' }); }
  } else if (g.phase === 'fatal') {
    if (g.pt === 250) { g.phase = 'match'; g.pt = 0; g.finishOk = true; ev(g, { type: 'announce', who: g.winner, text: NAMES[g.f[g.winner].ch] + ' WINS' }); }
  } else if (g.phase === 'match') {
    if (g.pt === 200) g.over = true;
  }
}
export function hashGS(g: GS) {
  let h = g.frame | 0; for (const f of g.f) for (const v of [f.x, f.y, f.hp, f.meter, f.t]) h = (Math.imul(h ^ Math.round(v * 1000), 16777619)) >>> 0; return h;
}
