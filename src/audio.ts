// 100% procedural WebAudio: SFX, announcer stingers (+ optional speech synthesis) and a generative dark score.
export const settings = JSON.parse(localStorage.getItem('br_settings') || 'null') || { master: 0.8, music: 0.5, sfx: 0.8, quality: 'high', difficulty: 'normal', voice: true };
export function saveSettings() { localStorage.setItem('br_settings', JSON.stringify(settings)); applyVol(); }
let ac: AudioContext | null = null, master!: GainNode, music!: GainNode, sfx!: GainNode, noiseBuf!: AudioBuffer, verb!: ConvolverNode;
export function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  master = ac.createGain(); master.connect(ac.destination); music = ac.createGain(); music.connect(master); sfx = ac.createGain(); sfx.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  verb = ac.createConvolver(); const ir = ac.createBuffer(2, ac.sampleRate * 2.5, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3); }
  verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(master);
  applyVol(); startMusic();
}
function applyVol() { if (!ac) return; master.gain.value = settings.master; music.gain.value = settings.music * 0.5; sfx.gain.value = settings.sfx; }
const now = () => ac!.currentTime;
function env(g: GainNode, t: number, a: number, peak: number, dec: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(t: number, dur: number, f: number, q: number, peak: number, type: BiquadFilterType = 'bandpass', dest: AudioNode = sfx, sweep?: number) {
  const s = ac!.createBufferSource(); s.buffer = noiseBuf; const fl = ac!.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur); fl.Q.value = q;
  const g = ac!.createGain(); env(g, t, 0.004, peak, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.1); return g;
}
function tone(t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine', dest: AudioNode = sfx) {
  const o = ac!.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac!.createGain(); env(g, t, 0.005, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1); return g;
}
export const sfxPlay = {
  hit(heavy: boolean) { if (!ac) return; const t = now(); tone(t, heavy ? 140 : 190, 40, heavy ? 0.25 : 0.15, heavy ? 0.9 : 0.6); noise(t, heavy ? 0.18 : 0.1, heavy ? 900 : 1600, 0.8, heavy ? 0.9 : 0.6); noise(t, 0.05, 4000, 1, 0.3, 'highpass'); if (heavy) noise(t + 0.02, 0.4, 300, 0.5, 0.3, 'lowpass', verb); },
  block() { if (!ac) return; const t = now(); tone(t, 900, 600, 0.12, 0.25, 'square'); noise(t, 0.08, 3000, 3, 0.4); },
  whoosh(heavy: boolean) { if (!ac) return; const t = now(); noise(t, heavy ? 0.25 : 0.16, heavy ? 500 : 800, 1.5, 0.22, 'bandpass', sfx, heavy ? 2500 : 3500); },
  jump() { if (!ac) return; noise(now(), 0.12, 600, 1, 0.12, 'bandpass', sfx, 1500); },
  land(heavy: boolean) { if (!ac) return; const t = now(); tone(t, heavy ? 90 : 120, 35, heavy ? 0.35 : 0.12, heavy ? 0.8 : 0.25); if (heavy) noise(t, 0.3, 200, 0.7, 0.5, 'lowpass'); },
  special() { if (!ac) return; const t = now(); tone(t, 220, 880, 0.35, 0.25, 'sawtooth'); noise(t, 0.5, 400, 2, 0.4, 'bandpass', verb, 4000); },
  pillar() { if (!ac) return; const t = now(); noise(t, 0.8, 120, 0.8, 0.9, 'lowpass', sfx, 1200); tone(t, 60, 30, 0.8, 0.7); },
  superHit() { if (!ac) return; const t = now(); tone(t, 55, 30, 1.6, 1, 'sawtooth'); noise(t, 1.5, 200, 0.5, 0.8, 'lowpass', verb, 3000); tone(t, 110, 55, 1.2, 0.5, 'square', verb); },
  ko() { if (!ac) return; const t = now(); tone(t, 70, 25, 2, 1); noise(t, 2, 150, 0.5, 0.9, 'lowpass', verb); },
  splat() { if (!ac) return; const t = now(); noise(t, 0.3, 500, 1, 0.6, 'lowpass', sfx, 150); tone(t, 80, 30, 0.3, 0.5); },
  ui(confirm = false) { if (!ac) return; const t = now(); tone(t, confirm ? 330 : 520, confirm ? 110 : 480, confirm ? 0.4 : 0.06, confirm ? 0.35 : 0.12, confirm ? 'sawtooth' : 'triangle', confirm ? verb : sfx); if (confirm) tone(t, 82, 41, 0.6, 0.5); },
  stinger(big = false) {
    if (!ac) return; const t = now(); const root = big ? 41.2 : 55;
    for (const m of [1, 1.189, 1.498, 2, 2.378]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * m * 2; o.detune.value = (Math.random() - 0.5) * 20;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 2.2);
      const g = ac.createGain(); env(g, t, 0.01, 0.12, 2.2); o.connect(f); f.connect(g); g.connect(sfx); g.connect(verb); o.start(t); o.stop(t + 2.5); }
    tone(t, root, root / 2, 1.8, 0.9); noise(t, 0.9, 300, 0.6, 0.6, 'lowpass', verb, 60);
  },
};
let lastSpeak = 0;
export function announce(text: string, big = false) {
  sfxPlay.stinger(big);
  if (!settings.voice || typeof speechSynthesis === 'undefined') return;
  try { if (performance.now() - lastSpeak < 300) speechSynthesis.cancel(); lastSpeak = performance.now();
    const u = new SpeechSynthesisUtterance(text.replace(/!/g, '').replace('K.O.', 'K O')); u.pitch = 0.05; u.rate = 0.72; u.volume = settings.master * settings.sfx; speechSynthesis.speak(u); } catch { /* no voice */ }
}
// ---- generative score ----
let mode: 'menu' | 'fight' | 'off' = 'menu', step = 0, nextT = 0, timer: number | undefined;
const SCALE = [0, 1, 3, 5, 7, 8, 11, 12];
export function setMusic(m: 'menu' | 'fight' | 'off') { mode = m; }
function startMusic() {
  // drone pad
  const pad = ac!.createGain(); pad.gain.value = 0.16; const lp = ac!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(pad); pad.connect(music); pad.connect(verb);
  for (const [f, d] of [[36.7, -8], [36.7, 9], [55, 0], [73.4, 4]]) { const o = ac!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(); }
  const lfo = ac!.createOscillator(); lfo.frequency.value = 0.07; const lg = ac!.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  nextT = now() + 0.1;
  timer = window.setInterval(() => {
    if (!ac) return;
    const bpm = mode === 'fight' ? 142 : 78; const sp = 60 / bpm / 4;
    while (nextT < now() + 0.25) {
      const s = step % 32, t = nextT;
      pad.gain.setTargetAtTime(mode === 'off' ? 0 : 0.16, t, 0.5);
      if (mode !== 'off') {
        if (mode === 'fight') {
          if (s % 8 === 0 || s === 22 || s === 27) { tone(t, 110, 38, 0.35, 0.9, 'sine', music); noise(t, 0.08, 200, 0.6, 0.3, 'lowpass', music); }
          if (s % 8 === 4) { noise(t, 0.16, 1800, 0.7, 0.45, 'bandpass', music); tone(t, 220, 120, 0.1, 0.25, 'triangle', music); }
          if (s % 2 === 1) noise(t, 0.03, 8000, 1, 0.08, 'highpass', music);
          if (s % 4 === 0 || s % 4 === 3) { const n = SCALE[[0, 0, 3, 1, 0, 5, 3, 6][(step >> 2) % 8]]; tone(t, 55 * Math.pow(2, n / 12), 55 * Math.pow(2, n / 12) * 0.99, sp * 1.8, 0.35, 'sawtooth', music); }
        } else {
          if (s === 0 || s === 20) { tone(t, 80, 30, 1.6, 0.8, 'sine', music); noise(t, 1.4, 120, 0.5, 0.3, 'lowpass', verb); }
          if (s % 8 === 6 && Math.random() < 0.6) { const n = SCALE[Math.floor(Math.random() * SCALE.length)]; tone(t, 220 * Math.pow(2, n / 12), 220 * Math.pow(2, n / 12), 1.6, 0.06, 'triangle', verb); }
        }
      }
      nextT += sp; step++;
    }
  }, 60);
  void timer;
}
