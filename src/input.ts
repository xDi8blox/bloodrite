import { U, D, L, R, P, K, B, T, S } from './sim';
const keys = new Set<string>();
const MAP1: Record<string, number> = { KeyW: U, KeyS: D, KeyA: L, KeyD: R, KeyJ: P, KeyK: K, KeyL: B, KeyI: T, KeyO: S, Space: U };
const MAP2: Record<string, number> = { ArrowUp: U, ArrowDown: D, ArrowLeft: L, ArrowRight: R, Numpad1: P, Numpad2: K, Numpad3: B, Numpad4: T, Numpad5: S, KeyN: P, KeyM: K, Comma: B, Period: T, Slash: S };
export const CONTROLS = { p1: 'Move W A S D · Punch J · Kick K · Block L · Throw I · Super/Finisher O', p2: 'Move Arrows · Punch Num1/N · Kick Num2/M · Block Num3/, · Throw Num4/. · Super Num5//', pad: 'Gamepad: D-pad/Stick move · X Punch · A Kick · RB Block · Y Throw · RT Super · Start Pause' };
type Nav = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'pause';
const navQ: { n: Nav; src: number }[] = [];
addEventListener('keydown', e => {
  if (e.repeat) return; keys.add(e.code);
  const n: Nav | undefined = ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', KeyJ: 'ok', Numpad1: 'ok', Escape: 'back', Backspace: 'back', KeyK: 'back' } as Record<string, Nav>)[e.code];
  if (n) navQ.push({ n, src: e.code.startsWith('Arrow') || e.code.startsWith('Numpad') ? 1 : 0 });
  if (e.code === 'Escape' || e.code === 'KeyP') navQ.push({ n: 'pause', src: 0 });
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
export const touch = { bits: 0 };
const padPrev: number[] = [0, 0, 0, 0];
function padBits(i: number) {
  const gp = navigator.getGamepads?.()[i]; if (!gp) return 0; let b = 0; const bt = (n: number) => gp.buttons[n]?.pressed;
  const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
  if (bt(12) || ay < -0.5) b |= U; if (bt(13) || ay > 0.5) b |= D; if (bt(14) || ax < -0.5) b |= L; if (bt(15) || ax > 0.5) b |= R;
  if (bt(2)) b |= P; if (bt(0)) b |= K; if (bt(5) || bt(4)) b |= B; if (bt(3)) b |= T; if (bt(7) || bt(6)) b |= S;
  if (bt(9)) b |= 1 << 12;
  return b;
}
export function pollPadsNav() {
  for (let i = 0; i < 4; i++) {
    const b = padBits(i), pr = b & ~padPrev[i]; padPrev[i] = b;
    if (pr & U) navQ.push({ n: 'up', src: i }); if (pr & D) navQ.push({ n: 'down', src: i }); if (pr & L) navQ.push({ n: 'left', src: i }); if (pr & R) navQ.push({ n: 'right', src: i });
    if (pr & (P | K) && pr & P) navQ.push({ n: 'ok', src: i }); else if (pr & K) navQ.push({ n: 'back', src: i }); if (pr & (1 << 12)) navQ.push({ n: 'pause', src: i });
  }
}
export function takeNav() { return navQ.splice(0); }
function kb(map: Record<string, number>) { let b = 0; for (const k of keys) b |= map[k] ?? 0; return b; }
/** mode: 'solo' = P1 may use every keyboard set + pad0 + touch; 'local' = split */
export function readInput(player: 0 | 1, mode: 'solo' | 'local') {
  let b: number;
  if (mode === 'solo') b = kb(MAP1) | kb(MAP2) | padBits(0) | padBits(1) | touch.bits;
  else b = player === 0 ? kb(MAP1) | padBits(0) | touch.bits : kb(MAP2) | padBits(1);
  if ((b & L) && (b & R)) b &= ~(L | R);
  return b & 511;
}
export function anyKey() { return keys.size > 0 || padBits(0) !== 0 || touch.bits !== 0; }
// ---- touch controls ----
export function setupTouch(el: HTMLElement) {
  const btns = el.querySelectorAll<HTMLElement>('[data-b]');
  const active = new Map<number, number>();
  const recompute = () => { let b = 0; active.forEach(v => b |= v); touch.bits = b; btns.forEach(x => x.classList.toggle('on', [...active.values()].some(v => v & +x.dataset.b!))); };
  const hit = (x: number, y: number) => { const t = document.elementFromPoint(x, y) as HTMLElement | null; const d = t?.closest('[data-b]') as HTMLElement | null; return d ? +d.dataset.b! : 0; };
  const pad = el.querySelector<HTMLElement>('#dpad')!;
  const padBitsAt = (x: number, y: number) => { const r = pad.getBoundingClientRect(); const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2); if (Math.hypot(dx, dy) < r.width * 0.12) return 0; let b = 0; if (dx > r.width * 0.15) b |= R; if (dx < -r.width * 0.15) b |= L; if (dy < -r.height * 0.15) b |= U; if (dy > r.height * 0.15) b |= D; return b; };
  const onT = (e: TouchEvent) => {
    e.preventDefault(); active.clear();
    for (const t of Array.from(e.touches)) { const r = pad.getBoundingClientRect(); const inPad = t.clientX < r.right + 30 && t.clientY > r.top - 30; active.set(t.identifier, inPad ? padBitsAt(t.clientX, t.clientY) : hit(t.clientX, t.clientY)); }
    recompute();
  };
  el.addEventListener('touchstart', onT, { passive: false }); el.addEventListener('touchmove', onT, { passive: false }); el.addEventListener('touchend', onT, { passive: false }); el.addEventListener('touchcancel', onT, { passive: false });
}
