import * as THREE from 'three';
import { Pool, Streaks, starTex, bloodTex, glow } from './gfx';
import type { GS } from './sim';
import { CHARS } from './chars';
const col = (c: number, k = 3) => new THREE.Color(c).multiplyScalar(k);
export class Fx {
  scene: THREE.Scene; q: number; sparks: Streaks; blood: Pool; mist: Pool; magic: Pool; flash: THREE.Sprite; flashT = 0; shake = 0;
  decals: THREE.InstancedMesh; decalN = 0; projMeshes = new Map<number, THREE.Mesh>(); pillars: { g: THREE.Group; t: number; color: number }[] = [];
  beam: THREE.Mesh; beamCore: THREE.Mesh; lights: THREE.PointLight[] = []; shards: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = []; shardG = new THREE.TetrahedronGeometry(0.06);
  constructor(scene: THREE.Scene, q: number) {
    this.scene = scene; this.q = q;
    this.sparks = new Streaks(scene, Math.round(500 * q + 100));
    this.blood = new Pool(scene, Math.round(900 * q + 200), 0.07, false, 11, 0.5);
    this.mist = new Pool(scene, 300, 0.35, false, -0.5, 1.5);
    this.magic = new Pool(scene, Math.round(900 * q + 200), 0.16, true, -1, 1.2);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false }));
    this.flash.scale.setScalar(0); scene.add(this.flash);
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: bloodTex, transparent: true, roughness: 0.15, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 160);
    this.decals.count = 0; this.decals.receiveShadow = true; scene.add(this.decals);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 20, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 12).rotateZ(Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false }));
    this.beam.visible = this.beamCore.visible = false; scene.add(this.beam, this.beamCore);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.5); scene.add(l); this.lights.push(l); }
  }
  clear() { this.decalN = 0; this.decals.count = 0; this.sparks.clear(); this.blood.clear(); this.magic.clear(); this.mist.clear(); this.projMeshes.forEach(m => this.scene.remove(m)); this.projMeshes.clear(); this.pillars.forEach(p => this.scene.remove(p.g)); this.pillars = []; this.shards.forEach(s => this.scene.remove(s.m)); this.shards = []; }
  dispose() { this.clear(); [this.sparks.lines, this.blood.pts, this.mist.pts, this.magic.pts, this.flash, this.decals, this.beam, this.beamCore, ...this.lights].forEach(o => this.scene.remove(o)); }
  hit(x: number, y: number, face: number, c: THREE.Color, heavy: boolean, blocked: boolean) {
    const z = 0.15; const n = (blocked ? 18 : heavy ? 46 : 28) * (0.5 + this.q * 0.5);
    for (let i = 0; i < n; i++) this.sparks.emit(x, y, z, face * (2 + Math.random() * 6), (Math.random() - 0.3) * 7, (Math.random() - 0.5) * 4, 0.15 + Math.random() * 0.3, blocked ? new THREE.Color(2, 2.4, 3) : c);
    this.flash.position.set(x, y, z + 0.1); this.flashT = 0.12; (this.flash.material as THREE.SpriteMaterial).color.copy(blocked ? new THREE.Color(2, 2.5, 3) : c).multiplyScalar(0.8);
    this.shake = Math.max(this.shake, blocked ? 0.04 : heavy ? 0.2 : 0.11);
    if (!blocked) this.bleed(x, y, face, heavy ? 80 : 45);
  }
  bleed(x: number, y: number, face: number, n: number, spread = 4) {
    n *= 0.5 + this.q * 0.5;
    for (let i = 0; i < n; i++) this.blood.emit(x, y, 0.1 + (Math.random() - 0.5) * 0.2, face * (0.5 + Math.random() * spread), 1 + Math.random() * 4, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, new THREE.Color(0.3 + Math.random() * 0.25, 0, 0.01));
    for (let i = 0; i < n / 10; i++) this.mist.emit(x, y, 0.1, face * Math.random() * 1.5, Math.random(), (Math.random() - 0.5), 0.6, new THREE.Color(0.25, 0, 0.01));
  }
  decal(x: number, z: number, s: number) {
    const i = this.decalN++ % 160; const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.006 + i * 0.00002, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28), new THREE.Vector3(s, 1, s * (0.6 + Math.random() * 0.6)));
    this.decals.setMatrixAt(i, m); this.decals.count = Math.min(160, this.decalN); this.decals.instanceMatrix.needsUpdate = true;
  }
  burst(x: number, y: number, c: THREE.Color, n: number, spd = 3, life = 0.8) { for (let i = 0; i < n * this.q + 4; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14; this.magic.emit(x, y, 0.1, Math.cos(a) * Math.sin(b) * spd, Math.cos(b) * spd, Math.sin(a) * Math.sin(b) * spd * 0.5, life * (0.5 + Math.random()), c); } }
  pillar(x: number, color: number, kind: string) {
    const g = new THREE.Group(); const m = glow(color, 2.5); (m as THREE.MeshBasicMaterial).transparent = true;
    const n = kind === 'ice' ? 9 : 5;
    for (let i = 0; i < n; i++) { const c = new THREE.Mesh(kind === 'fire' ? new THREE.CylinderGeometry(0.15, 0.35, 2.4, 10, 1, true) : new THREE.ConeGeometry(0.08 + Math.random() * 0.12, 1.2 + Math.random() * 1.4, 5), m); c.position.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.4); c.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4); g.add(c); }
    g.position.set(x, -2, 0); this.scene.add(g); this.pillars.push({ g, t: 0, color });
  }
  shatter(obj: THREE.Object3D, c: THREE.Color, n = 160) {
    const box = new THREE.Box3().setFromObject(obj); const mat = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, emissive: c, emissiveIntensity: 0.4 });
    for (let i = 0; i < n * (0.5 + this.q * 0.5); i++) { const m = new THREE.Mesh(this.shardG, mat); m.position.set(THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random()), THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random()), (Math.random() - 0.5) * 0.3); m.scale.setScalar(0.6 + Math.random() * 2); m.castShadow = true; this.scene.add(m);
      this.shards.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 4), r: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) }); }
  }
  syncProjectiles(g: GS) {
    const alive = new Set<number>();
    for (const p of g.projs) {
      alive.add(p.id); let m = this.projMeshes.get(p.id);
      if (!m) { m = new THREE.Mesh(new THREE.IcosahedronGeometry(p.kind === 'pull' ? 0.08 : 0.2, 2), glow(p.color, 4)); this.scene.add(m); this.projMeshes.set(p.id, m); }
      m.position.set(p.x, p.y, 0.1); m.rotation.x += 0.3; m.rotation.y += 0.2;
      const c = col(p.color, 3); for (let i = 0; i < 3 * this.q + 1; i++) this.magic.emit(p.x + (Math.random() - 0.5) * 0.15, p.y + (Math.random() - 0.5) * 0.15, 0.1, -p.vx * 20 + (Math.random() - 0.5), (Math.random() - 0.3) * 1.2, (Math.random() - 0.5), 0.35, c);
    }
    for (const [id, m] of this.projMeshes) if (!alive.has(id)) { this.burst(m.position.x, m.position.y, (m.material as THREE.MeshBasicMaterial).color, 30); this.scene.remove(m); this.projMeshes.delete(id); }
    // lights follow first projectiles / beam
    this.lights.forEach((l, i) => { const p = g.projs[i]; if (p) { l.position.set(p.x, p.y, 0.6); l.color.set(p.color); l.intensity = 6; } else l.intensity = 0; });
  }
  update(dt: number, g: GS | null) {
    this.sparks.update(dt); this.blood.update(dt, k => Math.min(1, k * 3), i => { if (Math.random() < 0.12) this.decal(this.blood.pos[i * 3], this.blood.pos[i * 3 + 2], 0.25 + Math.random() * 0.5); });
    this.mist.update(dt, k => k * 0.6); this.magic.update(dt, k => k);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.scale.setScalar(Math.max(0, this.flashT / 0.12) * 0.8 + 0.15); (this.flash.material as THREE.SpriteMaterial).rotation += dt * 4; (this.flash.material as THREE.SpriteMaterial).opacity = Math.max(0, this.flashT / 0.12); } else this.flash.scale.setScalar(0);
    for (const p of this.pillars) { p.t += dt; const k = p.t < 0.2 ? p.t / 0.2 : p.t < 0.5 ? 1 : Math.max(0, 1 - (p.t - 0.5) / 0.3); p.g.position.y = -1.6 + k * 1.6; p.g.scale.setScalar(0.4 + k * 0.6);
      if (k > 0.3) for (let i = 0; i < 4 * this.q; i++) this.magic.emit(p.g.position.x + (Math.random() - 0.5) * 0.5, Math.random() * 2, 0, (Math.random() - 0.5), 2 + Math.random() * 2, 0, 0.5, col(p.color)); }
    this.pillars = this.pillars.filter(p => { if (p.t > 0.85) { this.scene.remove(p.g); return false; } return true; });
    for (const s of this.shards) { s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt); if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.v.multiplyScalar(0.4); s.v.y = Math.abs(s.v.y) * 0.3; } s.m.rotation.x += s.r.x * dt; s.m.rotation.y += s.r.y * dt; }
    // super beam
    this.beam.visible = this.beamCore.visible = false;
    if (g) for (const f of g.f) if (f.st === 'attack' && f.mv === 'super' && f.t >= 22 && f.t <= 68) {
      const c = CHARS[f.ch]; const L = 7; const s = 1 + Math.sin(performance.now() / 30) * 0.15;
      for (const b of [this.beam, this.beamCore]) { b.visible = true; b.position.set(f.x + f.face * 0.5, f.y + 1.35, 0.1); b.scale.set(L * (b === this.beam ? 1 : 1), s, s); b.rotation.y = f.face > 0 ? 0 : Math.PI; }
      (this.beam.material as THREE.MeshBasicMaterial).color.copy(col(c.glow, 2.5));
      for (let i = 0; i < 10 * this.q; i++) this.magic.emit(f.x + f.face * (0.5 + Math.random() * L), f.y + 1.35 + (Math.random() - 0.5) * 0.5, 0.1, f.face * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.4, col(c.glow, 3));
      this.shake = Math.max(this.shake, 0.06);
    }
    this.shake *= Math.pow(0.0005, dt);
  }
}
