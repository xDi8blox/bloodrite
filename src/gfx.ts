import * as THREE from 'three';
export let seed = 7; export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const vrand = Math.random;
export function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export const std = (c: number, r = 0.85, m = 0, e = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e, emissiveIntensity: ei });
export const glow = (c: number, i = 4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false });
export const dotTex = canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, '#fff'); r.addColorStop(0.3, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
export const starTex = canvasTex(256, (g, s) => {
  g.translate(s / 2, s / 2); const r = g.createRadialGradient(0, 0, 0, 0, 0, s / 2); r.addColorStop(0, '#fff'); r.addColorStop(.15, 'rgba(255,240,200,.9)'); r.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = r; for (let i = 0; i < 10; i++) { g.rotate(Math.PI / 5 + 0.2); g.beginPath(); g.moveTo(0, -6); g.lineTo(s / 2 * (i % 2 ? .6 : 1), 0); g.lineTo(0, 6); g.fill(); }
  g.beginPath(); g.arc(0, 0, s / 7, 0, 7); g.fill();
});
export const bloodTex = canvasTex(128, (g, s) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) { const r = 6 + Math.random() * 22, a = Math.random() * 6.28, d = Math.random() * 30; g.fillStyle = `rgba(${90 + Math.random() * 60},0,${Math.random() * 10},${0.7 + Math.random() * 0.3})`; g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, 7); g.fill(); }
});
export class Pool {
  n: number; pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; base: Float32Array; pts: THREE.Points; i = 0; grav: number; drag: number; floor = true;
  constructor(scene: THREE.Object3D, n: number, size: number, additive: boolean, grav = 0, drag = 0) {
    this.n = n; this.grav = grav; this.drag = drag;
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: THREE.Color) {
    const i = this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = c.r; this.base[i * 3 + 1] = c.g; this.base[i * 3 + 2] = c.b; this.life[i] = life; this.max[i] = life;
  }
  update(dt: number, fade: (k: number, i: number) => number = k => k, onFloor?: (i: number) => void) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt; const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav * dt; const d = 1 - this.drag * dt;
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= d; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      if (this.floor && this.grav > 0 && this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; if (onFloor && this.vel[i * 3 + 1] < -1) onFloor(i); this.vel[i * 3] *= 0.3; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] *= 0.3; }
      const f = fade(k, i); for (let a = 0; a < 3; a++) this.col[i * 3 + a] = this.base[i * 3 + a] * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}
// spark streaks: line segments head->tail along velocity
export class Streaks {
  n: number; p: Float32Array; v: Float32Array; life: Float32Array; max: Float32Array; c: Float32Array; pos: Float32Array; col: Float32Array; lines: THREE.LineSegments; i = 0;
  constructor(scene: THREE.Object3D, n: number) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.c = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false; scene.add(this.lines);
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: THREE.Color) {
    const i = this.i = (this.i + 1) % this.n; this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.life[i] = this.max[i] = life; this.c.set([c.r, c.g, c.b], i * 3);
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      if (this.life[i] <= 0) { for (let a = 0; a < 6; a++) this.pos[o + a] = 0; for (let a = 0; a < 6; a++) this.col[o + a] = 0; continue; }
      this.life[i] -= dt; const k = Math.max(0, this.life[i] / this.max[i]);
      this.v[i * 3 + 1] -= 9 * dt; for (let a = 0; a < 3; a++) { this.v[i * 3 + a] *= 1 - 2 * dt; this.p[i * 3 + a] += this.v[i * 3 + a] * dt; }
      for (let a = 0; a < 3; a++) { this.pos[o + a] = this.p[i * 3 + a]; this.pos[o + 3 + a] = this.p[i * 3 + a] - this.v[i * 3 + a] * 0.035; this.col[o + a] = this.c[i * 3 + a] * k; this.col[o + 3 + a] = this.c[i * 3 + a] * k * 0.2; }
    }
    this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}
