import * as THREE from 'three';
import * as SU from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARS, type CharDef } from './chars';
import { MOVES, SUPER_MOVE, SPECIAL_MOVE, type FS } from './sim';
import { glow } from './gfx';

export interface Assets { male: GLTF; female: GLTF; hair: GLTF; clips: Record<string, THREE.AnimationClip> }
const LOWER = /^(root|pelvis|thigh|calf|foot|ball)/;
const filt = (c: THREE.AnimationClip, lower: boolean, name: string) => new THREE.AnimationClip(name, c.duration, c.tracks.filter(t => LOWER.test(t.name) === lower));
const NOISE = `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fb3(vec3 p){ return .55*n3(p)+.3*n3(p*2.1)+.15*n3(p*4.3); }
`;
export interface FxU { veinCol: { value: THREE.Color }; pulse: { value: number }; dissolve: { value: number }; edge: { value: THREE.Color }; frost: { value: number }; flash: { value: number } }
interface Style { tint: THREE.Color; suit?: [THREE.Color, THREE.Color]; veinCol: THREE.Color; veinScale: number; veinAmt: number; sheen: THREE.Color; key: string; veinLo?: number }
function bodyMat(orig: THREE.MeshStandardMaterial, st: Style): [THREE.MeshPhysicalMaterial, FxU] {
  const m = new THREE.MeshPhysicalMaterial({ map: orig.map, normalMap: orig.normalMap, roughnessMap: orig.roughnessMap, roughness: st.suit ? 0.55 : 0.62, metalness: 0,
    color: st.tint, sheen: st.suit ? 0.12 : 0.35, sheenRoughness: 0.6, sheenColor: st.sheen });
  m.normalScale.set(1.2, 1.2);
  const u: FxU = { veinCol: { value: st.veinCol }, pulse: { value: 1 }, dissolve: { value: 0 }, edge: { value: new THREE.Color(4, 1, 0.2) }, frost: { value: 0 }, flash: { value: 0 } };
  m.customProgramCacheKey = () => st.key;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position;');
    sh.fragmentShader = 'varying vec3 vOP; uniform vec3 veinCol, edge; uniform float pulse, dissolve, frost, flash;\n' + NOISE + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dn = fb3(vOP*9.0); if (dissolve > 0.0 && dn < dissolve*1.1 - 0.05) discard;
        ${st.suit ? `{ float l = dot(diffuseColor.rgb, vec3(.3,.59,.11));
          diffuseColor.rgb = mix(vec3(${st.suit[0].toArray().join(',')}), vec3(${st.suit[1].toArray().join(',')}), clamp(l*1.6,0.,1.)); }` : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55,.8,1.), frost*.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float v = abs(fb3(vOP*${st.veinScale.toFixed(2)}) - .5); float line = 1. - smoothstep(0.0, 0.011, v);
          float body = smoothstep(${(st.veinLo ?? 0.85).toFixed(2)}, ${((st.veinLo ?? 0.85) + 0.1).toFixed(2)}, vOP.y) * (1. - smoothstep(1.48, 1.53, vOP.y));
          totalEmissiveRadiance += veinCol * line * body * pulse * ${st.veinAmt.toFixed(2)};
          if (dissolve > 0.0) totalEmissiveRadiance += edge * (1. - smoothstep(0., .08, dn - (dissolve*1.1-0.05))) * 3.;
          totalEmissiveRadiance += vec3(.4,.8,1.)*frost*.3 + vec3(1.)*flash; }`);
  };
  return [m, u];
}
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _inv = new THREE.Quaternion();
function rotWorld(b: THREE.Object3D, axis: THREE.Vector3, ang: number) {
  if (!ang) return; b.parent!.getWorldQuaternion(_pq); _inv.copy(_pq).invert(); _q.setFromAxisAngle(axis, ang);
  b.quaternion.premultiply(_pq).premultiply(_q).premultiply(_inv); b.updateMatrixWorld(true);
}
const std = (c: number, r = 0.5, m = 0, e = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e, emissiveIntensity: ei });
export const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
type Bones = Record<string, THREE.Bone>;
class Kit {
  scene: THREE.Scene; extras: THREE.Object3D[] = [];
  constructor(scene: THREE.Scene) { this.scene = scene; }
  put(bone: THREE.Object3D, mesh: THREE.Object3D, p: THREE.Vector3, rot?: THREE.Euler) {
    mesh.position.copy(p); if (rot) mesh.rotation.copy(rot); this.scene.add(mesh); mesh.updateMatrixWorld(true); bone.attach(mesh); mesh.traverse(o => o.castShadow = true); this.extras.push(mesh); return mesh;
  }
  seg(a: THREE.Object3D, b: THREE.Object3D, mesh: THREE.Mesh, from = 0.15, to = 0.85) {
    const A = wp(a), Bp = wp(b); const d = Bp.clone().sub(A); const len = d.length();
    mesh.position.copy(A).addScaledVector(d, (from + to) / 2); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    mesh.scale.y = len * (to - from); this.scene.add(mesh); mesh.updateMatrixWorld(true); a.attach(mesh); mesh.castShadow = true; this.extras.push(mesh); return mesh;
  }
  horn(parent: THREE.Object3D, p: THREE.Vector3, side: number, mat: THREE.Material, n = 6, curl = 0.32, size = 1) {
    const g = new THREE.Group(); let cur: THREE.Object3D = g;
    for (let k = 0; k < n; k++) { const r0 = (0.026 - k * 0.0038) * size, r1 = (0.03 - k * 0.0038) * size; const c = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.003, r0), Math.max(0.004, r1), 0.055 * size, 8), mat); c.position.y = 0.0275 * size;
      const nn = new THREE.Group(); nn.position.y = 0.0275 * size; nn.rotation.set(-0.22, 0, curl * side); c.add(nn); cur.add(c); cur = nn; }
    return this.put(parent, g, p, new THREE.Euler(-0.5, 0, -1.25 * side));
  }
}
export class FighterView {
  def: CharDef; idx: number; root = new THREE.Group(); model: THREE.Object3D; bones: Bones = {}; mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction> = {};
  sets: Record<string, string[]> = {}; active = new Set<string>(); cur = ''; u!: FxU; eyes!: THREE.MeshStandardMaterial; kit: Kit; chain?: { p: THREE.Vector3[]; o: THREE.Vector3[]; mesh: THREE.InstancedMesh; tip: THREE.Mesh };
  lastSt = ''; lastMv = ''; fade = 0; scene: THREE.Scene; lat = new THREE.Vector3(); hiddenK = 0;
  constructor(scene: THREE.Scene, A: Assets, ci: number, idx: number) {
    this.scene = scene; this.def = CHARS[ci]; this.idx = idx; this.kit = new Kit(scene);
    const src = this.def.base === 'female' ? A.female : A.male;
    this.model = SU.clone(src.scene); scene.add(this.model); this.model.updateMatrixWorld(true);
    const st = STYLES[this.def.id];
    this.model.traverse(o => {
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
      const m = o as THREE.SkinnedMesh; if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name.startsWith('MI_Superhero')) { const [bm, u] = bodyMat(mat, st); m.material = bm; this.u = u; }
      else if (mat.name === 'MI_Eyes') { m.material = this.eyes = mat.clone(); }
      else m.visible = false;
    });
    COSTUME[this.def.id](this, A);
    this.root.add(this.model); scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    const C = A.clips;
    const mk = (n: string, c: THREE.AnimationClip, once = false) => { const a = this.mixer.clipAction(c); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } this.acts[n] = a; };
    mk('guardUp', filt(C.Punch_Jab, false, 'guardUp' + idx)); mk('idleLow', filt(C.Sword_Idle, true, 'idleLow' + idx)); mk('walkLow', filt(C.Walk_Loop, true, 'walkLow' + idx));
    mk('crouchLow', filt(C.Crouch_Idle_Loop, true, 'crouchLow' + idx)); mk('guard', C.Punch_Jab);
    mk('jab', C.Punch_Jab, true); mk('cross', C.Punch_Cross, true); mk('hook', C.Melee_Hook, true); mk('throwA', C.OverhandThrow, true);
    mk('spell', C.Spell_Simple_Shoot, true); mk('super', C.Spell_Simple_Idle_Loop); mk('roll', C.Roll, true);
    mk('hit', C.Hit_Chest, true); mk('hitHead', C.Hit_Head, true); mk('knock', C.Hit_Knockback, true); mk('death', C.Death01, true); mk('getup', C.LayToIdle, true);
    mk('jump', C.NinjaJump_Idle_Loop); mk('dazed', C.Idle_Loop); mk('victory', C.Idle_FoldArms_Loop);
    this.sets = { idle: ['guardUp', 'idleLow'], walk: ['guardUp', 'walkLow'], crouch: ['guardUp', 'crouchLow'], block: ['guardUp', 'idleLow'], cblock: ['guardUp', 'crouchLow'],
      jab: ['jab'], cross: ['cross'], hook: ['hook'], upper: ['hook'], kick: ['guard'], lowk: ['guardUp', 'crouchLow'], airk: ['jump'], airp: ['jab'], throw: ['throwA'],
      spell: ['spell'], super: ['super'], rush: ['cross'], slide: ['guardUp', 'crouchLow'], tele: ['roll'], hit: ['hit'], hitHead: ['hitHead'], air: ['knock'], down: ['death'], getup: ['getup'], ko: ['death'],
      jump: ['jump'], dazed: ['dazed'], victory: ['victory'], thrown: ['knock'], fatal: ['super'], fatalv: ['dazed'] };
  }
  play(set: string, fade = 0.1, scale = 1, restart = false) {
    if (set === this.cur && !restart) return; this.cur = set; const want = this.sets[set] ?? ['guard'];
    const once = ['jab', 'cross', 'hook', 'throwA', 'spell', 'roll', 'hit', 'hitHead', 'knock', 'death', 'getup'];
    for (const n of Object.keys(this.acts)) {
      const a = this.acts[n];
      if (want.includes(n)) {
        if (!this.active.has(n) || once.includes(n) || restart) { a.reset(); a.setEffectiveWeight(1); a.fadeIn(fade).play(); this.active.add(n); }
        if (n === 'guard' || n === 'guardUp') { a.time = a.getClip().duration * 0.06; a.paused = true; }
        a.timeScale = once.includes(n) ? scale : 1;
      } else if (this.active.has(n)) { a.fadeOut(fade); this.active.delete(n); }
    }
  }
  update(f: FS, dt: number, time: number) {
    const mvName = f.mv; let set: string = f.st; let scale = 1; let w = 0;
    const isAtk = f.st === 'attack';
    if (isAtk) {
      const mv = mvName.startsWith('sp') ? SPECIAL_MOVE(this.def.specials[+mvName[2]]) : mvName === 'super' ? SUPER_MOVE : MOVES[mvName];
      set = mv.anim; const clip = this.acts[this.sets[set]?.[0]]?.getClip();
      if (clip) scale = clip.duration / (mv.total / 60) * (set === 'spell' ? 0.9 : 1);
      if (set === 'rush') scale *= 0.5;
      const tt = f.t / mv.total; w = tt < 0.35 ? THREE.MathUtils.smoothstep(tt / 0.35, 0, 1) : tt < 0.65 ? 1 : 1 - THREE.MathUtils.smoothstep((tt - 0.65) / 0.35, 0, 1);
    } else if (f.st === 'hitstun') set = (f.t % 2 === 0 && f.stun > 18) ? 'hitHead' : 'hit';
    else if (f.st === 'blockstun') set = f.mv === 'c' ? 'cblock' : 'block';
    else if (f.st === 'back') set = 'walk';
    else if (f.st === 'getup') scale = 1.6;
    const restart = isAtk && (mvName !== this.lastMv || f.t <= 1 && this.lastSt === 'attack' && this.cur !== set) || (f.st === 'hitstun' && f.t === 0);
    this.play(set, isAtk ? 0.06 : 0.12, scale, restart && f.t <= 2);
    this.lastSt = f.st; this.lastMv = isAtk ? mvName : '';
    if (f.st === 'walk' || f.st === 'back') this.acts.walkLow.timeScale = f.st === 'back' ? -0.9 : 1.1;
    this.mixer.update(dt);
    this.root.position.set(f.x, f.y, 0);
    const yaw = f.face > 0 ? Math.PI / 2 - 0.42 : -Math.PI / 2 + 0.42;
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, yaw, 0.35);
    this.root.updateMatrixWorld(true);
    const Bn = this.bones; const lat = this.lat.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    const breath = Math.sin(time * 2.6 + this.idx * 2) * 0.025;
    if (['idle', 'walk', 'block', 'kick', 'crouch', 'cblock', 'lowk', 'slide'].includes(set)) { rotWorld(Bn.spine_01, lat, -0.12 + breath); rotWorld(Bn.Head, lat, -0.12); }
    if (set === 'block' || set === 'cblock') { rotWorld(Bn.spine_02, lat, 0.28); rotWorld(Bn.Head, lat, 0.2); for (const s of ['l', 'r']) { rotWorld(Bn['upperarm_' + s], lat, -0.35); rotWorld(Bn['lowerarm_' + s], lat, -0.35); } }
    if (set === 'kick') { rotWorld(Bn.spine_01, lat, -0.45 * w); rotWorld(Bn.pelvis, new THREE.Vector3(0, 1, 0), -0.5 * w * f.face); rotWorld(Bn.thigh_r, lat, -1.75 * w); rotWorld(Bn.calf_r, lat, -0.9 * w * w); rotWorld(Bn.foot_r, lat, 0.6 * w); rotWorld(Bn.thigh_l, lat, 0.25 * w); }
    if (set === 'lowk' || set === 'slide') { const k = set === 'slide' ? Math.max(w, 0.0) : w; rotWorld(Bn.spine_01, lat, -0.5 * k); rotWorld(Bn.thigh_r, lat, -1.3 * k); rotWorld(Bn.calf_r, lat, 0.9 * k * (1 - k)); rotWorld(Bn.foot_r, lat, 0.7 * k); }
    if (set === 'airk') { rotWorld(Bn.thigh_r, lat, -1.4 * w); rotWorld(Bn.calf_r, lat, -1.0 * w); rotWorld(Bn.spine_01, lat, -0.3 * w); }
    if (set === 'upper') { rotWorld(Bn.spine_01, lat, -0.35 * w); rotWorld(Bn.upperarm_r, lat, -0.9 * w); }
    if (set === 'rush') { rotWorld(Bn.spine_01, lat, 0.45 * w); }
    if (set === 'dazed') { rotWorld(Bn.spine_01, lat, Math.sin(time * 1.7) * 0.12); rotWorld(Bn.spine_02, new THREE.Vector3(0, 0, 1), Math.sin(time * 1.3) * 0.12); rotWorld(Bn.Head, lat, 0.35); }
    if (set === 'air' || set === 'thrown') { rotWorld(Bn.pelvis, lat, -0.6 * Math.min(1, f.t / 10) * (f.st === 'thrown' ? 2 : 1)); }
    // hidden (teleport)
    this.hiddenK = THREE.MathUtils.lerp(this.hiddenK, f.hidden ? 1 : 0, 0.5); this.model.visible = this.hiddenK < 0.6;
    this.u.pulse.value = 0.75 + Math.sin(time * 4 + this.idx) * 0.35;
    if (this.u.flash.value > 0) this.u.flash.value = Math.max(0, this.u.flash.value - dt * 6);
    if (this.chain) this.updateChain(dt);
  }
  updateChain(dt: number) {
    const c = this.chain!; const h = wp(this.bones.hand_l); c.p[0].copy(h); const g = -20 * dt * dt; const CH = c.p.length;
    for (let i = 1; i < CH; i++) { const p = c.p[i], o = c.o[i]; const vx = (p.x - o.x) * 0.93, vy = (p.y - o.y) * 0.93, vz = (p.z - o.z) * 0.93; o.copy(p); p.x += vx; p.y += vy + g; p.z += vz; if (p.y < 0.03) p.y = 0.03; }
    for (let it = 0; it < 6; it++) for (let i = 1; i < CH; i++) { const a = c.p[i - 1], b = c.p[i]; const d = b.clone().sub(a); const L = d.length() || 1e-5; const diff = (L - 0.04) / L; if (i === 1) b.addScaledVector(d, -diff); else { a.addScaledVector(d, diff * 0.5); b.addScaledVector(d, -diff * 0.5); } }
    const dm = new THREE.Object3D();
    for (let i = 0; i < CH - 1; i++) { dm.position.copy(c.p[i]).lerp(c.p[i + 1], 0.5); dm.lookAt(c.p[i + 1]); dm.rotateZ(i % 2 ? Math.PI / 2 : 0); dm.updateMatrix(); c.mesh.setMatrixAt(i, dm.matrix); }
    c.mesh.instanceMatrix.needsUpdate = true; c.mesh.visible = c.tip.visible = this.model.visible;
    const d = c.p[CH - 1].clone().sub(c.p[CH - 2]).normalize(); c.tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); c.tip.position.copy(c.p[CH - 1]).addScaledVector(d, 0.1);
  }
  setExtrasVisible(v: boolean) { this.kit.extras.forEach(e => e.visible = v); if (this.chain) { this.chain.mesh.visible = v; this.chain.tip.visible = v; } }
  reset() { this.u.dissolve.value = 0; this.u.frost.value = 0; this.setExtrasVisible(true); this.model.visible = true; this.cur = ''; }
  dispose() { this.scene.remove(this.root); this.kit.extras.forEach(e => e.removeFromParent()); if (this.chain) { this.scene.remove(this.chain.mesh); this.scene.remove(this.chain.tip); } }
}
const STYLES: Record<string, Style> = {
  vorath: { key: 'vorath', tint: new THREE.Color(0.2, 0.11, 0.105), veinCol: new THREE.Color(4, 0.5, 0.05), veinScale: 8, veinAmt: 0.8, sheen: new THREE.Color(0.6, 0.1, 0.05) },
  kaijin: { key: 'kaijin', tint: new THREE.Color(1, 1, 1), suit: [new THREE.Color(0.01, 0.015, 0.03), new THREE.Color(0.04, 0.09, 0.18)], veinCol: new THREE.Color(0.3, 1.6, 3), veinScale: 4, veinAmt: 0.35, sheen: new THREE.Color(0.2, 0.45, 0.8) },
  nyxara: { key: 'nyxara', tint: new THREE.Color(1, 1, 1), suit: [new THREE.Color(0.03, 0.0, 0.01), new THREE.Color(0.22, 0.01, 0.05)], veinCol: new THREE.Color(2.2, 0.3, 3.5), veinScale: 6, veinAmt: 0.6, sheen: new THREE.Color(0.6, 0.1, 0.4), veinLo: 0.4 },
  morgrim: { key: 'morgrim', tint: new THREE.Color(0.32, 0.36, 0.3), veinCol: new THREE.Color(0.8, 3.5, 0.3), veinScale: 5, veinAmt: 0.7, sheen: new THREE.Color(0.2, 0.4, 0.1), veinLo: 0.3 },
};
const COSTUME: Record<string, (v: FighterView, A: Assets) => void> = {
  vorath(v) {
    const B = v.bones, k = v.kit; const H = wp(B.Head);
    v.eyes.emissive = new THREE.Color(1, 0.1, 0); v.eyes.emissiveIntensity = 6; v.eyes.color.set(0x330000);
    const boneM = std(0xcfc0a0, 0.45), iron = std(0x2a2422, 0.35, 0.85);
    k.horn(B.Head, H.clone().add(new THREE.Vector3(0.065, 0.17, 0.05)), -1, boneM); k.horn(B.Head, H.clone().add(new THREE.Vector3(-0.065, 0.17, 0.05)), 1, boneM);
    for (const s of ['l', 'r']) {
      const up = B['upperarm_' + s]; const sp = wp(up).add(new THREE.Vector3(0, 0.06, 0));
      for (let i = 0; i < 3; i++) k.put(up, new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16 - i * 0.03, 6), boneM), sp.clone().add(new THREE.Vector3(s === 'l' ? 0.04 : -0.04, 0.05, -0.04 + i * 0.04)), new THREE.Euler(0, 0, s === 'l' ? -0.5 : 0.5));
      k.seg(B['lowerarm_' + s], B['hand_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.04, 1, 14), iron), 0.35, 0.95);
      k.seg(B['calf_' + s], B['foot_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 1, 14), iron), 0.45, 0.95);
    }
  },
  kaijin(v) {
    const B = v.bones, k = v.kit; const H = wp(B.Head);
    const steel = std(0x8898a8, 0.38, 0.85), blueA = new THREE.MeshPhysicalMaterial({ color: 0x1c4d8a, roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.35 });
    const ice = glow(0x5fd8ff, 5), wrap = new THREE.MeshPhysicalMaterial({ color: 0x0c1830, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0.3, 0.6, 1), side: THREE.DoubleSide });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.118, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), blueA); helm.scale.set(1.0, 1.05, 1.1); k.put(B.Head, helm, H.clone().add(new THREE.Vector3(0, 0.085, -0.005)));
    k.put(B.Head, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.11, 24, 1, true, -1.3, 2.6), wrap), H.clone().add(new THREE.Vector3(0, 0.035, 0.015)));
    k.put(B.Head, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.018, 0.02), ice), H.clone().add(new THREE.Vector3(0, 0.118, 0.128)));
    for (const s of [1, -1]) k.put(B.Head, new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 4), ice), H.clone().add(new THREE.Vector3(0.1 * s, 0.2, -0.02)), new THREE.Euler(-0.5, 0, -0.5 * s));
    v.eyes.color.set(0x88ccff); v.eyes.emissive = new THREE.Color(0.3, 0.8, 1); v.eyes.emissiveIntensity = 2;
    for (const s of ['l', 'r']) {
      const up = B['upperarm_' + s]; const sp = wp(up).add(new THREE.Vector3(0, 0.05, 0));
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), blueA); pad.scale.set(1.15, 0.6, 1.15); k.put(up, pad, sp);
      k.seg(B['lowerarm_' + s], B['hand_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 1, 16), steel), 0.3, 0.92);
      k.seg(B['lowerarm_' + s], B['hand_' + s], new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.03), ice), 0.35, 0.85);
      k.seg(B['calf_' + s], B['foot_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.06, 1, 16), blueA), 0.25, 0.92);
      k.seg(B['thigh_' + s], B['calf_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 1, 16), wrap), 0.1, 0.55);
    }
    const CH = 18, p: THREE.Vector3[] = [], o: THREE.Vector3[] = []; for (let i = 0; i < CH; i++) { p.push(new THREE.Vector3(0, 1, 0)); o.push(new THREE.Vector3(0, 1, 0)); }
    const mesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12), std(0xb8c4d0, 0.25, 1), CH); mesh.castShadow = true; mesh.frustumCulled = false; v.scene.add(mesh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), std(0xd8f0ff, 0.15, 1, 0x40c0ff, 1.5)); v.scene.add(tip);
    v.chain = { p, o, mesh, tip };
  },
  nyxara(v, A) {
    const B = v.bones, k = v.kit; const H = wp(B.Head);
    v.eyes.color.set(0x220022); v.eyes.emissive = new THREE.Color(0.8, 0.1, 1); v.eyes.emissiveIntensity = 5;
    // CC0 long hair, re-tinted to black-crimson, attached rigidly to the head bone
    A.hair.scene.updateMatrixWorld(true);
    A.hair.scene.traverse(o => { const m = o as THREE.SkinnedMesh; if (!m.isMesh) return;
      const hm = new THREE.Mesh(m.geometry, new THREE.MeshPhysicalMaterial({ map: (m.material as THREE.MeshStandardMaterial).map, normalMap: (m.material as THREE.MeshStandardMaterial).normalMap, color: 0x3a0610, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0.8, 0.1, 0.2), side: THREE.DoubleSide, alphaTest: 0.4 }));
      k.put(B.Head, hm, new THREE.Vector3()); });
    const boneM = std(0xe8e0d0, 0.35), gold = std(0x6a1020, 0.3, 0.8);
    // bone crown
    for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09 + (i === 3 ? 0.06 : Math.abs(3 - i) < 2 ? 0.03 : 0), 5), boneM); k.put(B.Head, c, H.clone().add(new THREE.Vector3(Math.sin(a) * 0.1, 0.205, Math.cos(a) * 0.09)), new THREE.Euler(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3)); }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 6, 32), gold); k.put(B.Head, band, H.clone().add(new THREE.Vector3(0, 0.17, 0.0)), new THREE.Euler(Math.PI / 2 - 0.15, 0, 0));
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), glow(0xc030ff, 5)); k.put(B.Head, gem, H.clone().add(new THREE.Vector3(0, 0.175, 0.105)));
    for (const s of ['l', 'r']) {
      k.seg(B['lowerarm_' + s], B['hand_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 1, 14), gold), 0.4, 0.95);
      for (let i = 0; i < 3; i++) k.put(B['hand_' + s], new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.07, 4), boneM), wp(B['hand_' + s]).add(new THREE.Vector3((s === 'l' ? 1 : -1) * 0.09, 0, -0.02 + i * 0.02)), new THREE.Euler(0, 0, s === 'l' ? -Math.PI / 2 : Math.PI / 2));
    }
    // floating blood orbs (orbit around hips)
    const orbs = new THREE.Group(); for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), glow(0xd0103a, 3)); o.position.set(Math.cos(i * 2.1) * 0.35, 0, Math.sin(i * 2.1) * 0.35); orbs.add(o); }
    k.put(B.pelvis, orbs, wp(B.pelvis).add(new THREE.Vector3(0, 0.25, 0)));
    const spin = () => { orbs.rotation.y += 0.03; requestAnimationFrame(spin); }; spin();
  },
  morgrim(v) {
    const B = v.bones, k = v.kit; const H = wp(B.Head);
    v.eyes.color.set(0x001100); v.eyes.emissive = new THREE.Color(0.4, 1, 0.1); v.eyes.emissiveIntensity = 6;
    const boneM = std(0xd8cfb0, 0.55), rust = std(0x4a3a2a, 0.55, 0.7), dark = std(0x141812, 0.8);
    // skull mask over face
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.118, 28, 18, -Math.PI / 2 - 1.2 + Math.PI, 2.4, 0.15, Math.PI * 0.62), boneM); skull.scale.set(1, 1.08, 1.12); k.put(B.Head, skull, H.clone().add(new THREE.Vector3(0, 0.09, 0.012)));
    for (const s of [1, -1]) { const sock = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), dark); k.put(B.Head, sock, H.clone().add(new THREE.Vector3(0.033 * s, 0.1, 0.128))); const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), glow(0x70ff30, 8)); k.put(B.Head, e, H.clone().add(new THREE.Vector3(0.033 * s, 0.1, 0.132))); }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04), boneM); k.put(B.Head, jaw, H.clone().add(new THREE.Vector3(0, 0.025, 0.1)));
    for (let i = 0; i < 6; i++) k.put(B.Head, new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.018, 0.01), boneM), H.clone().add(new THREE.Vector3(-0.03 + i * 0.012, 0.045, 0.118)));
    // crown of iron thorns
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.01, 6, 28), rust); k.put(B.Head, ring, H.clone().add(new THREE.Vector3(0, 0.16, 0)), new THREE.Euler(Math.PI / 2 - 0.1, 0, 0));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.put(B.Head, new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.06, 4), rust), H.clone().add(new THREE.Vector3(Math.sin(a) * 0.115, 0.18, Math.cos(a) * 0.115)), new THREE.Euler(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5)); }
    for (const s of ['l', 'r']) {
      const up = B['upperarm_' + s]; const sp = wp(up).add(new THREE.Vector3(0, 0.05, 0));
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), rust); pad.scale.set(1.2, 0.7, 1.2); k.put(up, pad, sp);
      k.put(up, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 18), rust), sp.clone().add(new THREE.Vector3(0, -0.07, 0)), new THREE.Euler(Math.PI / 2, 0, 0));
      k.seg(B['lowerarm_' + s], B['hand_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, 1, 12), rust), 0.3, 0.95);
      k.seg(B['calf_' + s], B['foot_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 12), dark), 0.1, 0.95);
      k.seg(B['thigh_' + s], B['calf_' + s], new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 1, 12), dark), 0.0, 0.7);
    }
    // ribcage plate
    const rib = new THREE.Group(); for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.012, 0.009, 5, 20, Math.PI * 0.9), boneM); r.position.y = -i * 0.05; r.rotation.set(0, 0, 0); rib.add(r); }
    const S3 = wp(B.spine_03); k.put(B.spine_03, rib, S3.clone().add(new THREE.Vector3(0, 0.1, 0.03)), new THREE.Euler(0, 0, 0));
    rib.rotation.set(0, 0, 0); rib.children.forEach(c => { c.rotation.set(-Math.PI / 2 + 0.1, 0, Math.PI * 0.05 + Math.PI); });
  },
};
