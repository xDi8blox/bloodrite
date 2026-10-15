import { U, D, L, R, P, K, B, T, S, type GS, MOVES } from './sim';
import { CHARS } from './chars';
const LV = { easy: { react: 26, block: 0.15, aggro: 0.25, special: 0.08, combo: 0.2, aa: 0.1, super: 0.2 }, normal: { react: 16, block: 0.4, aggro: 0.45, special: 0.2, combo: 0.5, aa: 0.35, super: 0.5 },
  hard: { react: 9, block: 0.65, aggro: 0.6, special: 0.3, combo: 0.8, aa: 0.6, super: 0.8 }, nightmare: { react: 4, block: 0.85, aggro: 0.75, special: 0.35, combo: 0.95, aa: 0.85, super: 1 } };
export class AI {
  plan: number[] = []; hold = 0; holdBits = 0; cool = 0; lv: typeof LV.normal; me: number; seen = new Map<string, number>();
  constructor(me: number, level: string) { this.me = me; this.lv = (LV as any)[level] ?? LV.normal; }
  input(g: GS): number {
    const f = g.f[this.me], o = g.f[1 - this.me]; const fwd = f.face > 0 ? R : L, back = f.face > 0 ? L : R;
    if (g.phase === 'finish' && g.winner === this.me) { const d = Math.abs(f.x - o.x); return d > 2 ? fwd : (g.pt % 20 < 10 ? S : 0); }
    if (g.phase !== 'fight' && !g.practice) { this.plan = []; return 0; }
    if (this.plan.length) return this.plan.shift()!;
    if (this.hold > 0) { this.hold--; return this.holdBits; }
    const r = Math.random; const dist = Math.abs(o.x - f.x); const lv = this.lv;
    // react to threats (delayed by reaction time)
    const threatKey = o.st === 'attack' ? 'a' + o.mv + (g.frame - o.t) : '';
    if (threatKey && !this.seen.has(threatKey)) this.seen.set(threatKey, g.frame);
    const seenAt = threatKey ? this.seen.get(threatKey)! : 0; if (this.seen.size > 50) this.seen.clear();
    const reacted = threatKey && g.frame - seenAt >= lv.react;
    const proj = g.projs.find(p => p.owner !== this.me && Math.abs(p.x - f.x) < 4 && Math.sign(f.x - p.x) === Math.sign(p.vx));
    if (proj && Math.abs(proj.x - f.x) < 2.5 && r() < lv.block) { if (r() < 0.5) { this.hold = 14; this.holdBits = B; return B; } this.plan = [U | fwd, U | fwd]; return U | fwd; }
    if (reacted && dist < 2 && f.st !== 'attack' && r() < lv.block * 0.5) { const low = MOVES[o.mv]?.h === 'low'; this.hold = 12 + (lv.react < 10 ? 6 : 0); this.holdBits = low ? B | D : B; return this.holdBits; }
    if ((o.st === 'jump' || o.st === 'attack' && o.y > 0.3) && dist < 1.8 && r() < lv.aa * 0.15) { this.plan = [D, D, D | P]; return D; }
    if (this.cool > 0) { this.cool--; return dist > 1.2 ? (r() < 0.6 ? fwd : 0) : 0; }
    const ch = CHARS[f.ch];
    // punish / combo when opponent is in hitstun or juggle
    if ((o.st === 'hitstun' || o.st === 'air') && f.st !== 'attack' && dist < 1.5 && r() < lv.combo) { this.plan = o.st === 'air' ? [0, 0, K, 0, 0] : [P, 0, 0, 0, 0, 0, 0, 0, P]; return 0; }
    if (f.meter >= 100 && dist < 6 && r() < lv.super * 0.05) { this.cool = 30; return S; }
    if (dist > 2.6) {
      if (r() < lv.special * 0.06) { const sp = ch.specials.findIndex(s => s.kind === 'proj' || s.kind === 'pull'); if (sp >= 0) { this.plan = [D, D, D | fwd, D | fwd, fwd, fwd | P]; this.cool = 40; return D; } }
      if (r() < lv.special * 0.02) { this.plan = [D, D, 0, D, D | P]; this.cool = 40; return D; }
      if (r() < lv.aggro * 0.08) { this.plan = [U | fwd]; this.cool = 30; return U | fwd; }
      this.hold = 8; this.holdBits = r() < 0.85 ? fwd : 0; return this.holdBits;
    }
    if (dist > 1.25) {
      if (r() < lv.special * 0.05) { this.plan = [back, back, 0, fwd, fwd | K]; this.cool = 40; return back; }
      this.hold = 4; this.holdBits = r() < lv.aggro + 0.3 ? fwd : (r() < 0.3 ? back : 0); return this.holdBits;
    }
    // close range
    const x = r();
    if (x < lv.aggro * 0.12) { const c = r(); this.cool = Math.round(18 + 30 * (1 - lv.aggro));
      if (c < 0.35) { this.plan = [P, 0, 0, 0, 0, 0, 0, P, 0, 0, 0, 0, 0, 0, 0, 0, P]; return 0; }
      if (c < 0.55) return K; if (c < 0.7) return D | K; if (c < 0.82) return T; if (c < 0.92) { this.plan = [D, D | P]; return D; }
      this.plan = [D, D, 0, D, D | P]; return D; }
    if (x < 0.02) { this.hold = 10; this.holdBits = back; return back; }
    return 0;
  }
}
void U;
