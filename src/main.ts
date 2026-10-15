import '@fontsource/pirata-one/400.css';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CHARS, ARENAS, MOTION_TEXT } from './chars';
import { createGame, step, type GS, type Ev, P, K, B } from './sim';
import { buildArena, type Arena } from './stage';
import { FighterView, type Assets } from './fighters';
import { Fx } from './fx';
import { AI } from './ai';
import { readInput, takeNav, pollPadsNav, anyKey, setupTouch, CONTROLS } from './input';
import { audioInit, sfxPlay, announce, setMusic, settings, saveSettings } from './audio';
import { Session, NetRunner, roomCode } from './net';
import { drawLogo } from './logo';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const QV: Record<string, number> = { low: 0.35, medium: 0.7, high: 1 };
let Q = QV[settings.quality] ?? 1;
// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; (scene as any).environmentIntensity = 0.22;
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass());
function applyQuality() {
  Q = QV[settings.quality] ?? 1;
  renderer.setPixelRatio(settings.quality === 'low' ? Math.min(devicePixelRatio, 1) * 0.75 : settings.quality === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = Q > 0.4; bloom.enabled = Q > 0.3; bloom.strength = Q > 0.8 ? 0.75 : 0.6;
  resize();
}
function resize() { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1.5 ? 44 : 38; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); applyQuality();

// ---------- screens ----------
let screen = '';
function show(id: string) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('on')); if (id) $('s-' + id).classList.add('on'); screen = id; document.getElementById('touch')?.classList.toggle('hidden', !(id === '' && match && touchWanted())); }
interface Item { label: string; sub?: string; act?: () => void; lr?: (d: number) => void; val?: () => string }
class Menu {
  el: HTMLElement; items: Item[] = []; sel = 0;
  constructor(el: HTMLElement) { this.el = el; }
  set(items: Item[], sel = 0) { this.items = items; this.sel = sel; this.render(); }
  render() {
    this.el.innerHTML = ''; this.items.forEach((it, i) => {
      const d = document.createElement('div'); d.className = 'it' + (i === this.sel ? ' sel' : '');
      d.innerHTML = it.val ? `<span>${it.label}</span><b>◀ ${it.val()} ▶</b>` : `${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}`;
      d.onclick = (e) => { audioInit(); this.sel = i; if (it.lr) { const r = d.getBoundingClientRect(); it.lr((e as MouseEvent).clientX > r.left + r.width / 2 ? 1 : -1); sfxPlay.ui(); } else { sfxPlay.ui(true); it.act?.(); } this.render(); };
      this.el.appendChild(d);
    });
  }
  nav(n: string) {
    if (n === 'up' || n === 'down') { this.sel = (this.sel + (n === 'up' ? -1 : 1) + this.items.length) % this.items.length; sfxPlay.ui(); this.render(); }
    else if ((n === 'left' || n === 'right') && this.items[this.sel].lr) { this.items[this.sel].lr!(n === 'left' ? -1 : 1); sfxPlay.ui(); this.render(); }
    else if (n === 'ok') { const it = this.items[this.sel]; if (it.lr && !it.act) it.lr(1); else { sfxPlay.ui(true); it.act?.(); } this.render(); }
  }
}
const mainMenu = new Menu($('mainmenu')), optMenu = new Menu($('optlist')), pauseMenu = new Menu($('pausemenu')), resMenu = new Menu($('resmenu'));

// ---------- loading ----------
show('loading');
document.fonts.ready.then(() => { const url = drawLogo(); document.querySelectorAll<HTMLElement>('.logo').forEach(l => l.style.backgroundImage = `url(${url})`); (window as any).__logo = url; });
const mgr = new THREE.LoadingManager();
let loadPct = 0; mgr.onProgress = (_u, l, t) => { loadPct = l / t; };
const loader = new GLTFLoader(mgr); loader.setMeshoptDecoder(MeshoptDecoder);
const base = import.meta.env.BASE_URL + 'assets/';
const loadAnim = setInterval(() => { const p = Math.round(loadPct * 100); ($('loadfill') as HTMLElement).style.width = p + '%'; $('loadtxt').textContent = ['Summoning the damned…', 'Sharpening bones…', 'Boiling the lava…', 'Binding souls…'][Math.floor(performance.now() / 900) % 4] + ' ' + p + '%'; }, 100);
const [male, female, hair, an1, an2] = await Promise.all(['male.glb', 'female.glb', 'hair_long.glb', 'anim1.glb', 'anim2.glb'].map(f => loader.loadAsync(base + f)));
const clips: Record<string, THREE.AnimationClip> = {}; for (const c of [...an1.animations, ...an2.animations]) clips[c.name] = c;
const assets: Assets = { male, female, hair, clips };

// ---------- arena / fighters ----------
const arenaCache = new Map<string, Arena>(); let arena: Arena | null = null; let arenaId = '';
function setArena(id: string) {
  if (arenaId === id && arena) return; if (arena) scene.remove(arena.group);
  let a = arenaCache.get(id); if (!a) { a = buildArena(id, Q); arenaCache.set(id, a); }
  arena = a; arenaId = id; scene.add(a.group); scene.fog = a.fog; scene.background = a.bg;
}
let views: FighterView[] = [];
function setFighters(c0: number, c1: number) {
  if (views[0]?.def === CHARS[c0] && views[1]?.def === CHARS[c1]) { views.forEach(v => v.reset()); return; }
  views.forEach(v => v.dispose()); views = [new FighterView(scene, assets, c0, 0), new FighterView(scene, assets, c1, 1)];
}
let fx = new Fx(scene, Q);
// portraits + arena thumbs (rendered once with the real renderer)
const portraits: string[] = [], thumbs: string[] = [];
{
  const W0 = innerWidth, H0 = innerHeight; renderer.setPixelRatio(1); renderer.setSize(300, 400, false); composer.setSize(300, 400);
  setArena('temple');
  for (let i = 0; i < CHARS.length; i++) {
    setFighters(i, (i + 1) % CHARS.length); views[1].root.visible = false; views[1].setExtrasVisible(false);
    const f = { ...createGame(i, 0, 1).f[0], x: 0, face: 1 }; for (let k = 0; k < 20; k++) views[0].update(f, 1 / 30, k / 30);
    views[0].root.rotation.y = Math.PI / 2 - 0.9; views[0].root.updateMatrixWorld(true);
    camera.aspect = 0.75; camera.fov = 30; camera.updateProjectionMatrix(); camera.position.set(0.9, 1.55, 2.6); camera.lookAt(0.05, 1.25, 0);
    composer.render(); portraits.push(renderer.domElement.toDataURL('image/jpeg', 0.85));
  }
  views.forEach(v => v.dispose()); views = [];
  renderer.setSize(480, 300, false); composer.setSize(480, 300); camera.aspect = 1.6; camera.fov = 50; camera.updateProjectionMatrix();
  for (const a of ARENAS) { setArena(a.id); arena!.update(1, 0.016); camera.position.set(0, 2.2, 7); camera.lookAt(0, 2, -4); composer.render(); thumbs.push(renderer.domElement.toDataURL('image/jpeg', 0.85)); }
  renderer.setSize(W0, H0); applyQuality();
}
clearInterval(loadAnim); ($('loadfill') as HTMLElement).style.width = '100%';

// ---------- match ----------
type Mode = 'cpu' | 'local' | 'online' | 'practice';
interface MatchCfg { mode: Mode; c0: number; c1: number; arena: string; seed: number }
class Match {
  gs: GS; cfg: MatchCfg; ai?: AI; net?: NetRunner; acc = 0; seen = new Set<string>(); paused = false; frozen = false; dummy: 'stand' | 'block' | 'cpu' = 'stand';
  fin = { shattered: false, burst: false }; superT = 0; lastCombo = ['', ''];
  constructor(cfg: MatchCfg, sess?: Session, me: 0 | 1 = 0) {
    this.cfg = cfg; this.gs = createGame(cfg.c0, cfg.c1, cfg.seed, cfg.mode === 'practice');
    if (cfg.mode === 'cpu') this.ai = new AI(1, settings.difficulty);
    if (cfg.mode === 'practice') this.ai = new AI(1, 'normal');
    if (sess) { this.net = new NetRunner(this.gs, me, sess, CHARS); this.net.onEvents = e => this.events(e); }
    setArena(cfg.arena); setFighters(cfg.c0, cfg.c1); fx.clear();
    $('nameA').textContent = CHARS[cfg.c0].name; $('nameB').textContent = CHARS[cfg.c1].name;
  }
  input0() { return readInput(0, this.cfg.mode === 'local' ? 'local' : 'solo'); }
  input1() {
    if (this.cfg.mode === 'local') return readInput(1, 'local');
    if (this.cfg.mode === 'practice') return this.dummy === 'cpu' ? this.ai!.input(this.gs) : this.dummy === 'block' ? B : 0;
    return this.ai ? this.ai.input(this.gs) : 0;
  }
  stepOnce(i0?: number, i1?: number) {
    if (this.net) { if (this.net.tick(i0 ?? this.input0())) this.gs = this.net.gs; else this.gs = this.net.gs; return; }
    step(this.gs, [i0 ?? this.input0(), i1 ?? this.input1()], CHARS); this.events(this.gs.events);
    if (this.gs.practice) for (const f of this.gs.f) f.meter = 100;
  }
  tick(dt: number) {
    if (this.paused && !this.net || this.frozen) return;
    this.acc += Math.min(dt, 0.1); let n = 0;
    while (this.acc >= 1 / 60 && n < 6) { this.acc -= 1 / 60; n++; this.stepOnce(); }
  }
  events(evs: Ev[]) {
    for (const e of evs) {
      const key = `${e.f}|${e.type}|${e.who}|${e.n ?? ''}|${e.text ?? ''}`; if (this.seen.has(key)) continue; this.seen.add(key);
      onEvent(e, this);
    }
    if (this.seen.size > 4000) this.seen = new Set([...this.seen].slice(-1000));
  }
}
let match: Match | null = null;
const tmpC = new THREE.Color();
function onEvent(e: Ev, m: Match) {
  const g = m.gs;
  switch (e.type) {
    case 'hit': {
      const a = g.f[e.who]; const c = e.color !== undefined && e.color >= 0 ? tmpC.set(e.color).multiplyScalar(3) : tmpC.setRGB(...CHARS[a.ch].spark);
      fx.hit(e.x!, e.y!, a.face, c.clone(), !!e.heavy, !!e.blocked); e.blocked ? sfxPlay.block() : sfxPlay.hit(!!e.heavy);
      if (!e.blocked) views[1 - e.who].u.flash.value = 0.35; break; }
    case 'whoosh': sfxPlay.whoosh(!!e.heavy); break;
    case 'jump': sfxPlay.jump(); break;
    case 'land': sfxPlay.land(!!e.heavy); if (e.heavy) { fx.shake = Math.max(fx.shake, 0.12); fx.burst(e.x!, 0.1, new THREE.Color(0.5, 0.4, 0.35), 20, 2, 0.5); } break;
    case 'slam': sfxPlay.hit(true); fx.bleed(e.x!, 0.6, 1, 60); fx.shake = 0.25; break;
    case 'throw': sfxPlay.whoosh(true); break;
    case 'special': sfxPlay.special(); fx.burst(g.f[e.who].x + g.f[e.who].face * 0.6, 1.3, tmpC.set(CHARS[g.f[e.who].ch].specials[e.n!].color).multiplyScalar(3).clone(), 40); break;
    case 'pillar': { sfxPlay.pillar(); fx.shake = 0.15; const id = CHARS[g.f[e.who].ch].id; fx.pillar(e.x!, e.color!, id === 'vorath' ? 'fire' : id === 'kaijin' ? 'ice' : 'spike'); break; }
    case 'tele': fx.burst(e.x!, 1, tmpC.set(e.color!).multiplyScalar(3).clone(), 60, 2); sfxPlay.special(); break;
    case 'clash': fx.burst(e.x!, e.y!, new THREE.Color(4, 3, 2), 60, 4); sfxPlay.hit(true); fx.shake = 0.15; break;
    case 'super': { const c = CHARS[g.f[e.who].ch]; superBanner(c.superName); sfxPlay.superHit(); flashScreen(0.35); letterbox(true); setTimeout(() => letterbox(false), 900); break; }
    case 'ko': sfxPlay.ko(); flashScreen(0.45); fx.shake = 0.35; break;
    case 'finisher': letterbox(true); m.fin = { shattered: false, burst: false }; break;
    case 'announce': showAnnounce(e.text!); break;
  }
}
let annT = 0;
function showAnnounce(t: string) {
  const el = $('announce'); el.textContent = t; el.className = 'on' + (/CONDEMN|DAMNATION|K\.O/.test(t) ? ' blood' : ''); annT = /CONDEMN/.test(t) ? 3.2 : 1.6;
  const sub = $('subannounce'); sub.textContent = /CONDEMN/.test(t) ? (navigator.maxTouchPoints ? 'Get close and tap SUP' : 'Get close and press SUPER (O / Num5 / RT)') : ''; sub.className = sub.textContent ? 'on' : '';
  announce(t, /CONDEMN|DAMNATION|WINS/.test(t));
}
function superBanner(t: string) { const el = $('superName'); el.textContent = t; el.style.opacity = '1'; setTimeout(() => el.style.opacity = '0', 1100); }
function flashScreen(a: number) { const f = $('flashov'); f.style.transition = 'none'; f.style.opacity = String(a); requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; }); }
function letterbox(on: boolean) { $('letterbox').classList.toggle('on', on); }

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 1.5, 6), camLook = new THREE.Vector3(0, 1.1, 0);
function fightCamera(g: GS, dt: number, snap = false) {
  const [a, b] = g.f; const mid = (a.x + b.x) / 2, spread = Math.abs(a.x - b.x);
  const tp = new THREE.Vector3(mid, 1.4 + Math.max(a.y, b.y) * 0.3, Math.min(8, 4.3 + spread * 0.45) * (camera.aspect < 1.5 ? 1.25 : 1)), tl = new THREE.Vector3(mid, 1.1 + Math.max(a.y, b.y) * 0.3, 0);
  let k = 1 - Math.pow(0.002, dt);
  if (g.freeze > 0 && g.superBy >= 0) { const f = g.f[g.superBy]; tp.set(f.x + f.face * 1.1, 1.55, 2.2); tl.set(f.x, 1.3, 0); k = 0.15; }
  if (g.phase === 'ko' && g.pt < 90) { const l = g.f[1 - g.winner]; tp.set(l.x * 0.7 + mid * 0.3, 1.2, 3.4); tl.set(l.x, 0.9, 0); k = 0.05; }
  if (g.phase === 'fatal') { const v = g.f[1 - g.winner]; const ang = -0.9 + (g.pt / 250) * 1.9; const r = 2.6 - Math.sin(g.pt / 250 * Math.PI) * 0.6;
    tp.set(v.x + Math.sin(ang) * r, 1.0 + Math.sin(g.pt / 40) * 0.1 + (g.pt > 180 ? (g.pt - 180) / 70 : 0), Math.cos(ang) * r + 0.3); tl.set(v.x, 0.95, 0); k = g.pt < 3 ? 1 : 0.06; }
  if (g.phase === 'match' && g.finishOk) { const w = g.f[g.winner]; tp.set(w.x - w.face * 0.2, 1.5, 3); tl.set(w.x, 1.3, 0); k = 0.03; }
  if (snap) k = 1;
  camPos.lerp(tp, k); camLook.lerp(tl, k);
  camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - .5) * fx.shake, (Math.random() - .5) * fx.shake, 0)); camera.lookAt(camLook);
}
// ---------- finisher visuals ----------
function finisherFx(m: Match) {
  const g = m.gs; if (g.phase !== 'fatal' && !(g.phase === 'match' && g.finishOk)) return;
  const v = views[1 - g.winner], kind = CHARS[g.f[g.winner].ch].finKind, pt = g.phase === 'fatal' ? g.pt : 260, vx = g.f[1 - g.winner].x; const face = g.f[g.winner].face;
  if (kind === 'burn') { v.u.edge.value.setRGB(5, 1.4, 0.2); v.u.veinCol.value.setRGB(5, 1, 0.1); if (pt > 40) v.u.dissolve.value = Math.min(1, (pt - 40) / 170); if (pt < 230) fx.burst(vx, 0.3 + Math.random() * 1.5, new THREE.Color(2.2, 0.6, 0.1), 3, 1.2, 0.7); }
  if (kind === 'shatter') { v.u.frost.value = Math.min(1, Math.max(0, (pt - 15) / 60)); if (pt >= 120 && !m.fin.shattered) { m.fin.shattered = true; fx.shatter(v.model, new THREE.Color(0.6, 0.85, 1)); v.model.visible = false; v.setExtrasVisible(false); fx.bleed(vx, 1.1, face, 120, 5); sfxPlay.ko(); flashScreen(0.3); fx.shake = 0.4; } if (m.fin.shattered) { v.model.visible = false; } }
  if (kind === 'bleed') { v.u.edge.value.setRGB(3, 0, 0.1); if (pt > 30 && pt < 170) { fx.bleed(vx + (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.9, (Math.random() - 0.5) * 2, 10, 2); if (pt % 20 === 0) sfxPlay.splat(); } if (pt > 110) v.u.dissolve.value = Math.min(1, (pt - 110) / 120); }
  if (kind === 'rot') { v.u.edge.value.setRGB(0.8, 4, 0.2); if (pt > 30) v.u.dissolve.value = Math.min(1, (pt - 30) / 190); if (pt < 230) fx.burst(vx, 0.2 + Math.random() * 1.4, new THREE.Color(0.4, 1.8, 0.15), 3, 0.8, 1); }
  if (v.u.dissolve.value > 0.55) v.setExtrasVisible(false);
  if (pt === 200 && !m.fin.burst) { m.fin.burst = true; }
}
// ---------- HUD ----------
let lagA = 100, lagB = 100;
function hud(m: Match) {
  const g = m.gs; const [a, b] = g.f;
  ($('hpA') as HTMLElement).style.transform = `scaleX(${a.hp / 100})`; ($('hpB') as HTMLElement).style.transform = `scaleX(${b.hp / 100})`;
  lagA = a.hp; lagB = b.hp; ($('lagA') as HTMLElement).style.transform = `scaleX(${lagA / 100})`; ($('lagB') as HTMLElement).style.transform = `scaleX(${lagB / 100})`;
  for (const [i, id] of [[0, 'mtA'], [1, 'mtB']] as const) { const el = $(id) as HTMLElement; el.style.width = g.f[i].meter + '%'; el.classList.toggle('full', g.f[i].meter >= 100); }
  $('timer').textContent = g.practice ? '∞' : String(Math.max(0, Math.ceil(g.timer / 60)));
  [...$('mkA').children].forEach((c, i) => c.classList.toggle('on', i < a.wins)); [...$('mkB').children].forEach((c, i) => c.classList.toggle('on', i < b.wins));
  for (const [i, id] of [[0, 'comboL'], [1, 'comboR']] as const) { const f = g.f[i]; const e = $(id); if (f.combo >= 2) { e.innerHTML = `${f.combo} HITS<small>${Math.round(f.comboDmg)}% · ${f.combo >= 5 ? 'SAVAGE' : f.combo >= 3 ? 'BRUTAL' : 'COMBO'}</small>`; e.style.opacity = '1'; } else e.style.opacity = '0'; }
  const ni = $('netinfo'); if (m.net) { const n = m.net; ni.textContent = `ONLINE · frame ${n.frame} · delay ${n.delay}f · rollbacks ${n.rollbacks} · stalls ${n.stalls}${n.desync ? ' · DESYNC!' : ''}`; } else ni.textContent = '';
  $('practiceinfo').textContent = g.practice ? `PRACTICE · dummy: ${m.dummy.toUpperCase()} (Tab)\nlast combo: ${a.combo || '-'} hits ${Math.round(a.comboDmg)}%\nmeter: infinite` : '';
}
// ---------- background scenes for menus ----------
let menuT = 0;
function menuBackdrop(dt: number) {
  menuT += dt;
  if (!views.length || !match) { /* idle fighters */ }
  const r = 5.5, a = menuT * 0.08; camera.position.set(Math.sin(a) * r, 1.8 + Math.sin(menuT * 0.3) * 0.2, Math.cos(a) * r * 0.8 + 1); camera.lookAt(0, 1.3, 0);
}
let bgF: [any, any] | null = null;
function setBackdropFighters(c0: number, c1: number) {
  setArena(arenaId || 'temple'); setFighters(c0, c1);
  const g = createGame(c0, c1, 1); g.f[0].x = -1.2; g.f[1].x = 1.2; bgF = [g.f[0], g.f[1]];
}
// ---------- flows ----------
let flow: { mode: Mode; c0: number; c1: number; arena: string; picking: 0 | 1; hover: [number, number]; online?: 'host' | 'guest' } = { mode: 'cpu', c0: 0, c1: 1, arena: 'temple', picking: 0, hover: [0, 1] };
let sess: Session | null = null;
function toMenu() {
  if (match) { match = null; } if (sess) { sess.onClose = () => {}; sess.close(); sess = null; }
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); letterbox(false); setMusic('menu');
  setBackdropFighters(0, 1); show('menu');
  mainMenu.set([
    { label: 'VERSUS CPU', sub: 'Fight the machine', act: () => startSelect('cpu') },
    { label: '2 PLAYERS', sub: 'Local · keyboard split / gamepads', act: () => startSelect('local') },
    { label: 'ONLINE 1v1', sub: 'Peer-to-peer room link', act: () => startSelect('online') },
    { label: 'PRACTICE', sub: 'Training dummy · infinite meter', act: () => startSelect('practice') },
    { label: 'MOVE LIST', act: () => showMoves('menu') },
    { label: 'OPTIONS', act: () => showOptions() },
    { label: 'CREDITS', act: () => showCredits() },
  ], mainMenu.sel);
}
function showOptions() {
  show('options'); const cyc = (k: string, arr: string[], d: number) => { (settings as any)[k] = arr[(arr.indexOf((settings as any)[k]) + d + arr.length) % arr.length]; saveSettings(); };
  const vol = (k: string) => ({ val: () => Math.round((settings as any)[k] * 10) + '', lr: (d: number) => { (settings as any)[k] = Math.max(0, Math.min(1, Math.round(((settings as any)[k] + d * 0.1) * 10) / 10)); saveSettings(); audioInit(); } });
  optMenu.set([
    { label: 'MASTER VOLUME', ...vol('master') }, { label: 'MUSIC', ...vol('music') }, { label: 'EFFECTS', ...vol('sfx') },
    { label: 'ANNOUNCER VOICE', val: () => settings.voice ? 'ON' : 'OFF', lr: () => { settings.voice = !settings.voice; saveSettings(); } },
    { label: 'GRAPHICS', val: () => settings.quality.toUpperCase(), lr: d => { cyc('quality', ['low', 'medium', 'high'], d); arenaCache.forEach(a => a.dispose()); arenaCache.clear(); const id = arenaId; arenaId = ''; arena && scene.remove(arena.group); arena = null; applyQuality(); setArena(id || 'temple'); fx.dispose(); fx = new Fx(scene, Q); } },
    { label: 'CPU DIFFICULTY', val: () => settings.difficulty.toUpperCase(), lr: d => cyc('difficulty', ['easy', 'normal', 'hard', 'nightmare'], d) },
    { label: 'TOUCH CONTROLS', val: () => (settings.touch ?? 'auto').toUpperCase(), lr: d => cyc('touch', ['auto', 'on', 'off'], d) },
    { label: 'BACK', act: () => toMenu() },
  ]);
  $('ctrls').innerHTML = `<b>PLAYER 1</b> — ${CONTROLS.p1}<br><b>PLAYER 2</b> — ${CONTROLS.p2}<br>${CONTROLS.pad}<br>Throw = Throw button or Punch+Kick · Specials: see Move List · Pause Esc/P`;
}
function moveListHTML() {
  const common = `<div><h3>COMMON</h3>Punch chain: P, P, P (jab → cross → launching hook)<br>Uppercut (launcher): ↓+P · Sweep: ↓+K · Kick: K<br>Jump attacks: P / K in air · Throw: Throw or P+K<br>Block: hold Block (crouch-block for lows)<br>Juggle: launch, then keep hitting while airborne<br>Super (full meter): Super button<br>Finisher: when "CONDEMN THEM!" appears — get close, press Super</div>`;
  return common + CHARS.map(c => `<div><h3 style="color:${c.color}">${c.name}</h3><i>${c.title}</i><br>${c.specials.map(s => `${s.name}: ${MOTION_TEXT[s.motion]} + ${s.btn}`).join('<br>')}<br>Super: ${c.superName}<br>Finisher: ${c.finisher}</div>`).join('');
}
let movesBack = 'menu';
function showMoves(back: string) { movesBack = back; $('movesbody').innerHTML = moveListHTML(); show('moves'); $('s-moves').onclick = () => closeMoves(); }
function closeMoves() { if (movesBack === 'pause') show('pause'); else toMenu(); }
function showCredits() {
  $('creditsbody').innerHTML = `<p><b>BLOODRITE</b> — an original gothic browser fighter. Code MIT.</p>
  <p>Characters & animations: <b>Quaternius</b> — Universal Base Characters, Universal Animation Library 1 & 2 (CC0 1.0)<br>quaternius.com · quaternius.itch.io</p>
  <p>Fonts: Pirata One & Cinzel (SIL Open Font License) via Fontsource</p>
  <p>Audio: 100% procedural Web Audio synthesis (no samples). Announcer: on-device speech synthesis.</p>
  <p>Engine: three.js (MIT) · Netcode transport: PeerJS (MIT) + PeerJS public signaling server</p>
  <p>Arenas, costumes, VFX, shaders: procedural code.</p><div class="btn" id="credback">BACK</div>`; show('credits'); $('credback').onclick = () => toMenu();
}
// Cards are built once per screen and only re-classed afterwards: rebuilding the DOM on hover destroyed the element
// under the finger/pointer before the click landed (iOS fires mouseenter before click), so taps never confirmed.
let selBuilt = false;
function buildSelect() {
  const grid = $('selgrid'); grid.innerHTML = '';
  CHARS.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'card'; d.dataset.i = String(i); d.style.backgroundImage = `url(${portraits[i]})`; d.style.setProperty('--c', c.color);
    d.innerHTML = `<div class="nm" style="color:${c.color}">${c.name}</div><div class="tag t1">P1</div><div class="tag p2"></div>`;
    d.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && flow.hover[flow.picking] !== i) { flow.hover[flow.picking] = i; renderSelect(); } });
    d.addEventListener('click', () => { audioInit(); if (flow.hover[flow.picking] === i) selConfirm(); else { flow.hover[flow.picking] = i; sfxPlay.ui(); renderSelect(); } });
    grid.appendChild(d);
  });
  $('selback').onclick = () => { audioInit(); selBack(); };
  $('selrand').onclick = () => { audioInit(); flow.hover[flow.picking] = (Math.random() * 4) | 0; selConfirm(); };
  $('selok').onclick = () => { audioInit(); selConfirm(); };
  selBuilt = true;
}
function selBack() { sfxPlay.ui(); if (flow.picking === 1) { flow.picking = 0; renderSelect(); } else toMenu(); }
function renderSelect() {
  if (!selBuilt) buildSelect();
  document.querySelectorAll<HTMLElement>('#selgrid .card').forEach((d, i) => {
    d.classList.toggle('sel', flow.hover[0] === i && flow.picking === 0 || flow.picking === 1 && flow.c0 === i);
    d.classList.toggle('sel2', flow.picking === 1 && flow.hover[1] === i);
    (d.querySelector('.t1') as HTMLElement).style.display = flow.c0 === i && flow.picking === 1 ? '' : 'none';
    const t2 = d.querySelector('.p2') as HTMLElement; t2.style.display = flow.picking === 1 && flow.hover[1] === i ? '' : 'none'; t2.textContent = flow.mode === 'local' ? 'P2' : flow.mode === 'practice' ? 'DUMMY' : 'CPU';
  });
  const c = CHARS[flow.hover[flow.picking]];
  $('selinfo').innerHTML = `<div class="t" style="color:${c.color}">${c.name}</div><div class="sub">${c.title.toUpperCase()}</div><div class="bio">${c.bio}</div><div class="sp">${c.specials.map(s => `${s.name} <b>${MOTION_TEXT[s.motion]}+${s.btn}</b>`).join(' · ')} · Super: ${c.superName}</div>`;
  $('seltitle').textContent = flow.picking === 0 ? (flow.mode === 'local' ? 'PLAYER 1 — CHOOSE' : 'CHOOSE YOUR FIGHTER') : flow.mode === 'local' ? 'PLAYER 2 — CHOOSE' : flow.mode === 'practice' ? 'CHOOSE THE DUMMY' : 'CHOOSE YOUR OPPONENT';
  $('selok').textContent = flow.picking === 0 ? (flow.mode === 'online' ? 'CONFIRM ▶ LOBBY' : 'CONFIRM ' + c.name) : 'CONFIRM ' + c.name + ' ▶ ARENA';
  $('selrand').textContent = flow.picking === 1 && flow.mode === 'cpu' ? 'RANDOM OPPONENT' : 'RANDOM';
  const h0 = flow.picking === 0 ? flow.hover[0] : flow.c0, h1 = flow.picking === 1 ? flow.hover[1] : (flow.mode === 'online' ? -1 : flow.hover[1]);
  setBackdropFighters(h0, h1 < 0 ? (h0 + 1) % 4 : h1); if (h1 < 0) { views[1].root.visible = false; views[1].setExtrasVisible(false); }
}
function startSelect(mode: Mode, online?: 'host' | 'guest') { flow = { ...flow, mode, picking: 0, online }; flow.hover = [flow.c0, flow.c1]; show('select'); renderSelect(); }
function selConfirm() {
  sfxPlay.ui(true);
  if (flow.picking === 0) { flow.c0 = flow.hover[0]; if (flow.mode === 'online') return onlineLobby(); flow.picking = 1; if (flow.mode === 'cpu' && flow.hover[1] === flow.c0) flow.hover[1] = (flow.c0 + 1) % 4; renderSelect(); return; }
  flow.c1 = flow.hover[1]; showArena();
}
let arenaSel = 0;
function showArena(after?: () => void) {
  show('arena'); const grid = $('arenagrid');
  grid.innerHTML = ''; ARENAS.forEach((a, i) => { const d = document.createElement('div'); d.className = 'acard'; d.style.backgroundImage = `url(${thumbs[i]})`; d.innerHTML = `<div class="nm">${a.name}<div class="ds">${a.desc}</div></div>`;
    d.addEventListener('click', () => { audioInit(); if (arenaSel === i) go(); else { arenaSel = i; sfxPlay.ui(); render(); } });
    d.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && arenaSel !== i) { arenaSel = i; render(); } }); grid.appendChild(d); });
  const render = () => { grid.querySelectorAll('.acard').forEach((d, i) => d.classList.toggle('sel', i === arenaSel)); $('arenaok').textContent = (after ? 'OPEN ROOM: ' : 'FIGHT IN ') + ARENAS[arenaSel].name.toUpperCase(); setArena(ARENAS[arenaSel].id); };
  $('arenaok').onclick = () => { audioInit(); go(); }; $('arenaback').onclick = () => { audioInit(); arenaNav('back'); };
  const go = () => { sfxPlay.ui(true); flow.arena = ARENAS[arenaSel].id; if (after) after(); else startMatch({ mode: flow.mode, c0: flow.c0, c1: flow.c1, arena: flow.arena, seed: (Math.random() * 1e9) | 0 }); };
  arenaNav = (n: string) => { if (n === 'left' || n === 'up') { arenaSel = (arenaSel + 2) % 3; sfxPlay.ui(); render(); } if (n === 'right' || n === 'down') { arenaSel = (arenaSel + 1) % 3; sfxPlay.ui(); render(); } if (n === 'ok') go(); if (n === 'back') { if (after) toMenu(); else startSelect(flow.mode, flow.online); } };
  render();
}
let arenaNav: (n: string) => void = () => {};
function touchWanted() { const t = settings.touch ?? 'auto'; return t === 'on' || (t === 'auto' && (navigator.maxTouchPoints > 0 || params.has('touch'))); }
function startMatch(cfg: MatchCfg, s?: Session, me: 0 | 1 = 0) {
  match = new Match(cfg, s, me); show(''); $('hud').classList.remove('hidden'); $('touch').classList.toggle('hidden', !touchWanted()); setMusic('fight');
  fightCamera(match.gs, 1, true); (window as any).__match = match;
}
function pause() {
  if (!match) return; match.paused = true; show('pause');
  const items: Item[] = [{ label: 'RESUME', act: () => { match!.paused = false; show(''); } }, { label: 'MOVE LIST', act: () => showMoves('pause') }];
  if (match.cfg.mode === 'practice') items.push({ label: 'DUMMY', val: () => (match?.dummy ?? '').toUpperCase(), lr: () => { const o = ['stand', 'block', 'cpu'] as const; match!.dummy = o[(o.indexOf(match!.dummy) + 1) % 3]; } });
  if (!match.net) items.push({ label: 'RESTART', act: () => startMatch({ ...match!.cfg, seed: (Math.random() * 1e9) | 0 }) });
  items.push({ label: match.net ? 'LEAVE MATCH' : 'QUIT TO MENU', act: () => toMenu() }); pauseMenu.set(items);
}
function results(m: Match) {
  const g = m.gs; const w = CHARS[g.f[g.winner].ch]; show('results'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); letterbox(false); setMusic('menu');
  $('restitle').innerHTML = `<span style="color:${w.color}">${w.name}</span> WINS`; $('ressub').textContent = g.finishOk ? `${w.finisher.toUpperCase()} — DAMNATION` : 'MERCY… THIS TIME';
  const items: Item[] = [];
  if (m.net && sess) items.push({ label: 'REMATCH', act: () => { sess!.send({ t: 'rematch' }); rematchMine = true; tryRematch(); $('ressub').textContent = 'Waiting for opponent…'; } });
  else items.push({ label: 'REMATCH', act: () => startMatch({ ...m.cfg, seed: (Math.random() * 1e9) | 0 }) }, { label: 'CHARACTER SELECT', act: () => startSelect(m.cfg.mode) });
  items.push({ label: 'MAIN MENU', act: () => toMenu() }); resMenu.set(items);
}
// ---------- online ----------
let rematchMine = false, rematchTheirs = false, guestChar = 0;
function tryRematch() { if (!sess || !rematchMine || !rematchTheirs) return; rematchMine = rematchTheirs = false; if (sess.role === 'host') hostStart(); }
function hostStart() { const cfg = { mode: 'online' as Mode, c0: flow.c0, c1: guestChar, arena: flow.arena, seed: (Math.random() * 1e9) | 0 }; sess!.send({ t: 'start', cfg }); startMatch(cfg, sess!, 0); }
function onlineLobby() {
  show('online'); const body = $('onlinebody'); const code = params.get('room');
  const wire = (s: Session) => {
    sess = s; s.onStatus = st => { const el = document.getElementById('netstatus'); if (el) el.textContent = st; };
    s.onClose = why => { if (match?.net) { match = null; } $('hud').classList.add('hidden'); show('online'); body.innerHTML = `<p style="color:#f66">${why}</p><div class="btn" id="nb">MAIN MENU</div>`; $('nb').onclick = () => toMenu(); sess = null; };
    s.onMsg = msg => {
      if (msg.t === 'open' && s.role === 'guest') s.send({ t: 'hello', ch: flow.c0 });
      if (msg.t === 'hello' && s.role === 'host') { guestChar = msg.ch; hostStart(); }
      if (msg.t === 'start' && s.role === 'guest') { startMatch(msg.cfg, s, 1); }
      if (msg.t === 'rematch') { rematchTheirs = true; tryRematch(); }
      if ((msg.t === 'in' || msg.t === 'h') && match?.net) match.net.onMsg(msg);
    };
  };
  if (code) {
    body.innerHTML = `<p>Joining room <b>${code}</b> as <b style="color:${CHARS[flow.c0].color}">${CHARS[flow.c0].name}</b></p><p id="netstatus">Contacting signaling server…</p><div class="btn" id="nb">CANCEL</div>`;
    $('nb').onclick = () => toMenu(); history.replaceState(null, '', location.pathname); params.delete('room'); wire(new Session('guest', code)); return;
  }
  body.innerHTML = `<p>Fighting as <b style="color:${CHARS[flow.c0].color}">${CHARS[flow.c0].name}</b>. Peer-to-peer over WebRTC (PeerJS public signaling). Rollback netcode with ${2}-frame input delay.</p>
    <div class="btn" id="nbc">CREATE ROOM</div><br><input id="codein" placeholder="ROOM CODE" maxlength="6" style="font:20px Cinzel;text-transform:uppercase;width:160px;text-align:center;background:#200;color:#fff;border:1px solid #c9a24a;padding:6px"> <div class="btn" id="nbj">JOIN</div><br><div class="btn" id="nb">BACK</div><p id="netstatus"></p>`;
  $('nb').onclick = () => toMenu();
  $('nbj').onclick = () => { const c = ($('codein') as HTMLInputElement).value.trim().toUpperCase(); if (c.length >= 4) { params.set('room', c); onlineLobby(); } };
  $('nbc').onclick = () => showArena(() => {
    show('online'); const c = roomCode(); const link = location.origin + location.pathname + '?room=' + c;
    body.innerHTML = `<p>Room code <b style="font-size:28px;letter-spacing:6px">${c}</b> · Arena: ${ARENAS.find(a => a.id === flow.arena)!.name}</p><div class="link" id="lnk">${link}</div><div class="btn" id="cp">COPY LINK</div><div class="btn" id="nb">CANCEL</div><p id="netstatus">Opening room…</p>`;
    $('cp').onclick = () => navigator.clipboard?.writeText(link); $('nb').onclick = () => toMenu(); (window as any).__room = c;
    wire(new Session('host', c));
  });
}
// ---------- main loop ----------
let last = performance.now(), simT = 0, titleShown = false;
function navHandle() {
  pollPadsNav();
  for (const { n } of takeNav()) {
    if (screen === 'title') { goTitle(); return; }
    if (screen === 'menu') { if (n !== 'back' && n !== 'pause') mainMenu.nav(n); }
    else if (screen === 'options') { if (n === 'back') toMenu(); else optMenu.nav(n); }
    else if (screen === 'select') {
      const p = flow.picking; const h = flow.hover;
      if (n === 'left') { h[p] = (h[p] + 3) % 4; sfxPlay.ui(); renderSelect(); } if (n === 'right') { h[p] = (h[p] + 1) % 4; sfxPlay.ui(); renderSelect(); }
      if (n === 'ok') selConfirm(); if (n === 'back') selBack();
    }
    else if (screen === 'arena') arenaNav(n);
    else if (screen === 'moves') { if (n === 'back' || n === 'ok' || n === 'pause') closeMoves(); }
    else if (screen === 'credits' || screen === 'online') { if (n === 'back') toMenu(); }
    else if (screen === 'pause') { if (n === 'back' || n === 'pause') { match!.paused = false; show(''); } else pauseMenu.nav(n); }
    else if (screen === 'results') resMenu.nav(n);
    else if (screen === '' && match && n === 'pause') pause();
  }
}
function goTitle() { audioInit(); sfxPlay.ui(true); toMenu(); }
addEventListener('keydown', e => { if (e.code === 'Tab' && match?.cfg.mode === 'practice') { e.preventDefault(); const o = ['stand', 'block', 'cpu'] as const; match.dummy = o[(o.indexOf(match.dummy) + 1) % 3]; } });
addEventListener('pointerdown', () => audioInit());
// title advances on click (not pointerdown): advancing on pointerdown let the same tap's click land on the main-menu item underneath
addEventListener('click', () => { if (screen === 'title') goTitle(); });
$('tpause').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); pause(); });
setupTouch($('touch'));
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; simT += dt;
  navHandle();
  if (match && !match.frozen) {
    match.tick(dt);
    const g = match.gs; renderFight(g, dt);
    if (g.over && screen === '') results(match);
  } else if (!match) {
    arena?.update(simT, dt);
    if (bgF) views.forEach((v, i) => v.update(bgF![i], dt, simT));
    menuBackdrop(dt);
  }
  if (annT > 0) { annT -= dt; if (annT <= 0) { $('announce').className = ''; $('subannounce').className = ''; } }
  composer.render(); requestAnimationFrame(frame);
}
function renderFight(g: GS, dt: number) {
  arena?.update(simT, dt);
  const slow = g.slow > 0 ? 0.33 : 1;
  views.forEach((v, i) => { const frozen = g.freeze > 0 && i !== g.superBy; v.update(g.f[i], frozen ? 0 : dt * slow * (g.hitstop > 0 ? 0.15 : 1) * (g.phase === 'fatal' ? 0.6 : 1), simT); });
  if (g.phase === 'intro' && g.pt < 2) views.forEach(v => v.reset());
  finisherFx(match!); fx.syncProjectiles(g); fx.update(dt * slow, g); fightCamera(g, dt); hud(match!);
  if (g.phase !== 'fatal' && !(g.phase === 'match' && g.finishOk) && $('letterbox').classList.contains('on') && g.freeze <= 0) letterbox(false);
}
// title
setTimeout(() => {
  setBackdropFighters(0, 1);
  if (params.has('room')) { audioInit(); toMenu(); startSelect('online', 'guest'); } else show('title');
  titleShown = true; void titleShown;
}, 200);
requestAnimationFrame(frame);
void anyKey; void P; void K;

// ---------- automation hooks (used for screenshots & the online test) ----------
(window as any).BR = {
  ready: true, show, toMenu, startSelect, showOptions, showArena, showMoves, showCredits, onlineLobby, pause, results: () => match && results(match),
  start(cfg: Partial<MatchCfg>) { startMatch({ mode: 'cpu', c0: 0, c1: 1, arena: 'temple', seed: 7, ...cfg } as MatchCfg); if (cfg.mode === 'cpu' && (cfg as any).noai) match!.ai = undefined; return true; },
  freeze(on: boolean) { if (match) match.frozen = on; },
  /** step n frames with fixed inputs (or per-frame arrays), updating visuals at 60 Hz */
  sim(n: number, i0: number | number[] = 0, i1: number | number[] = 0) {
    const m = match!; for (let k = 0; k < n; k++) { m.stepOnce(Array.isArray(i0) ? i0[k] ?? 0 : i0, Array.isArray(i1) ? i1[k] ?? 0 : i1); simT += 1 / 60; renderFight(m.gs, 1 / 60); if (annT > 0 && (annT -= 1 / 60) <= 0) { $('announce').className = ''; $('subannounce').className = ''; } }
    if (m.gs.over && screen === '') results(m);
    return { phase: m.gs.phase, pt: m.gs.pt, hp: m.gs.f.map(f => Math.round(f.hp)), st: m.gs.f.map(f => f.st + ':' + f.mv), combo: m.gs.f.map(f => f.combo), wins: m.gs.f.map(f => f.wins), x: m.gs.f.map(f => +f.x.toFixed(2)), meter: m.gs.f.map(f => Math.round(f.meter)) };
  },
  set(fn: (g: GS) => void) { fn(match!.gs); },
  gs: () => match?.gs, net: () => match?.net && { frame: match.net.frame, lastRemote: match.net.lastRemote, rollbacks: match.net.rollbacks, stalls: match.net.stalls, desync: match.net.desync, hashes: [...match.net.hashes.entries()].filter(([f]) => f % 30 === 0).slice(-40) },
  screen: () => screen, room: () => (window as any).__room,
};
