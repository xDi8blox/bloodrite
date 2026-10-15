import Peer, { type DataConnection } from 'peerjs';
import { step, hashGS, type GS, type CharSim } from './sim';
const PREFIX = 'bloodrite-v1-';
export function roomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
export class Session {
  peer: Peer; conn?: DataConnection; role: 'host' | 'guest'; code: string; onMsg: (m: any) => void = () => {}; onStatus: (s: string) => void = () => {}; onClose: (why: string) => void = () => {};
  lastRecv = 0; closed = false; hb?: number;
  constructor(role: 'host' | 'guest', code: string) {
    this.role = role; this.code = code;
    this.peer = role === 'host' ? new Peer(PREFIX + code, { debug: 0 }) : new Peer({ debug: 0 });
    this.peer.on('open', () => {
      this.onStatus(role === 'host' ? 'Room open — waiting for challenger…' : 'Connecting to room ' + code + '…');
      if (role === 'guest') this.attach(this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }));
    });
    this.peer.on('connection', c => { if (this.conn) { c.close(); return; } this.attach(c); });
    this.peer.on('error', (e: any) => { this.onStatus('Network error: ' + (e.type || e.message)); if (['peer-unavailable', 'unavailable-id', 'network', 'server-error', 'browser-incompatible'].includes(e.type)) this.close('Connection failed: ' + e.type); });
    this.peer.on('disconnected', () => { if (!this.conn) this.onStatus('Lost signaling server…'); });
  }
  attach(c: DataConnection) {
    this.conn = c;
    c.on('open', () => { this.lastRecv = performance.now(); this.onStatus('Connected'); this.onMsg({ t: 'open' });
      this.hb = window.setInterval(() => { this.send({ t: 'hb' }); if (performance.now() - this.lastRecv > 5000) this.close('Opponent timed out'); }, 1000); });
    c.on('data', (d: any) => { this.lastRecv = performance.now(); if (d?.t !== 'hb') this.onMsg(d); });
    c.on('close', () => this.close('Opponent disconnected'));
    c.on('error', () => this.close('Connection error'));
  }
  send(m: any) { try { if (this.conn?.open) this.conn.send(m); } catch { /* ignore */ } }
  close(why = 'closed') { if (this.closed) return; this.closed = true; clearInterval(this.hb); try { this.conn?.close(); this.peer.destroy(); } catch { /* */ } this.onClose(why); }
}
/** Rollback netcode ("rollback-lite"): input delay + prediction (repeat last input) + resimulation on mispredict, capped at MAXPRED frames. */
export class NetRunner {
  gs: GS; frame = 0; me: 0 | 1; local = new Map<number, number>(); remote = new Map<number, number>(); lastRemote = -1; pred = new Map<number, number>();
  snaps = new Map<number, GS>(); rollbackFrom = Infinity; delay = 2; MAXPRED = 8; sess: Session; chars: CharSim[]; stalls = 0; rollbacks = 0; hashes = new Map<number, number>(); remoteHashes = new Map<number, number>(); desync = false;
  onEvents: (ev: GS['events']) => void = () => {};
  constructor(gs: GS, me: 0 | 1, sess: Session, chars: CharSim[]) {
    this.gs = gs; this.me = me; this.sess = sess; this.chars = chars;
    for (let f = 0; f < this.delay; f++) this.local.set(f, 0);
  }
  onMsg(m: any) {
    if (m.t === 'in') { for (let k = 0; k < m.i.length; k++) { const f = m.f - k; if (f < 0 || this.remote.has(f)) continue; this.remote.set(f, m.i[k]); if (f < this.frame && this.pred.get(f) !== m.i[k]) this.rollbackFrom = Math.min(this.rollbackFrom, f); }
      while (this.remote.has(this.lastRemote + 1)) this.lastRemote++; }
    if (m.t === 'h') { this.remoteHashes.set(m.f, m.h); const mine = this.hashes.get(m.f); if (mine !== undefined && mine !== m.h) this.desync = true; }
  }
  private remoteFor(f: number) { return this.remote.has(f) ? this.remote.get(f)! : (this.lastRemote >= 0 ? this.remote.get(Math.min(f, this.lastRemote))! : 0); }
  private sim(f: number, emit: boolean) {
    const li = this.local.get(f) ?? 0, ri = this.remoteFor(f); this.pred.set(f, ri);
    step(this.gs, this.me === 0 ? [li, ri] : [ri, li], this.chars);
    if (emit) this.onEvents(this.gs.events);
    if (f <= this.lastRemote && !this.hashes.has(f)) { const h = hashGS(this.gs); this.hashes.set(f, h); if (f % 30 === 0) this.sess.send({ t: 'h', f, h }); const rh = this.remoteHashes.get(f); if (rh !== undefined && rh !== h) this.desync = true; }
  }
  /** called once per 60 Hz tick with the freshly sampled local input */
  tick(localInput: number): boolean {
    // rollback if needed
    if (this.rollbackFrom < this.frame) {
      const f0 = this.rollbackFrom; const s = this.snaps.get(f0);
      if (s) { this.gs = structuredClone(s); this.rollbacks++; for (let f = f0; f < this.frame; f++) { this.snaps.set(f, structuredClone(this.gs)); this.hashes.delete(f); this.sim(f, true); } }
    }
    this.rollbackFrom = Infinity;
    if (this.frame - this.lastRemote > this.MAXPRED) { this.stalls++; this.sendInputs(); return false; }
    const tf = this.frame + this.delay; if (!this.local.has(tf)) this.local.set(tf, localInput);
    this.sendInputs();
    this.snaps.set(this.frame, structuredClone(this.gs));
    this.sim(this.frame, true); this.frame++;
    const old = Math.min(this.lastRemote, this.frame) - 4; for (const k of this.snaps.keys()) if (k < old) this.snaps.delete(k);
    for (const k of this.local.keys()) if (k < old - 30) { this.local.delete(k); this.pred.delete(k); }
    return true;
  }
  private sendInputs() { const top = this.frame + this.delay; const arr: number[] = []; for (let k = 0; k < 12; k++) { const f = top - k; if (f < 0) break; arr.push(this.local.get(f) ?? 0); } this.sess.send({ t: 'in', f: top, i: arr }); }
}
