import * as THREE from 'three';
import { canvasTex, std, glow, Pool, rnd } from './gfx';
export interface Arena { group: THREE.Group; update: (t: number, dt: number) => void; fog: THREE.FogExp2; bg: THREE.Color; dispose: () => void; rim: [number, number] }
function lavaMat(hot: THREE.Color, crust: THREE.Color, white: THREE.Color, mats: THREE.ShaderMaterial[]) {
  const m = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, hot: { value: hot }, crust: { value: crust }, white: { value: white } }, toneMapped: false, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float t; uniform vec3 hot, crust, white; varying vec3 vW;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.1+vec2(t*.05,t*.03);a*=.5;}return s;}
    void main(){ vec2 p=vW.xz*.9; float q=fbm(p+fbm(p*1.3+t*.12)); float c=smoothstep(.35,.75,q);
      vec3 col=mix(crust,hot,c); col=mix(col,white,smoothstep(.72,.9,q)); col*=1.0+2.6*c;
      float d=length(vW.xz-cameraPosition.xz); col=mix(col,crust*2.,clamp((d-6.)/30.,0.,.85)); gl_FragColor=vec4(col,1.); }`
  }); mats.push(m); return m;
}
function skyMat(lo: THREE.Color, hi: THREE.Color, band: THREE.Color) {
  return new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, uniforms: { lo: { value: lo }, hi: { value: hi }, band: { value: band } },
    vertexShader: 'varying vec3 p; void main(){p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 lo,hi,band; varying vec3 p; void main(){ float y=p.y; vec3 c=mix(lo,hi,smoothstep(0.,.5,y)); c+=band*pow(max(0.,1.-abs(y)*4.),3.)*.8; gl_FragColor=vec4(c,1.);}' });
}
function floorTex(base: [number, number, number], seedv: number) {
  return canvasTex(1024, (g, s) => {
    g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, s, s); const n = 8, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 0.75 + rnd() * 0.5; g.fillStyle = `rgb(${base[0] * v + 10},${base[1] * v + 8},${base[2] * v + 8})`; g.fillRect(i * t + 4, j * t + 4, t - 8, t - 8);
      for (let k = 0; k < 250; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(i * t + rnd() * t, j * t + rnd() * t, 3 + rnd() * 10, 3 + rnd() * 10); }
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2;
    for (let k = 0; k < 40 + seedv; k++) { g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y); for (let m = 0; m < 6; m++) { x += (rnd() - .5) * 60; y += (rnd() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
  });
}
function crackTex(col: string, glowc: string) {
  return canvasTex(1024, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.strokeStyle = col; g.shadowColor = glowc; g.shadowBlur = 12;
    for (let k = 0; k < 14; k++) { g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y); for (let m = 0; m < 9; m++) { x += (rnd() - .5) * 90; y += (rnd() - .5) * 90; g.lineTo(x, y); } g.stroke(); }
  });
}
function shadowAll(o: THREE.Object3D, cast = true) { o.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); }

export function buildArena(id: string, q: number): Arena {
  const G = new THREE.Group(); const mats: THREE.ShaderMaterial[] = []; const upd: ((t: number, dt: number) => void)[] = [];
  const flames: { p: THREE.Vector3; light?: THREE.PointLight; col: THREE.Color }[] = [];
  const fire = new Pool(G, Math.round(900 * q), 0.32, true, -1.5, 1.5);
  const add = (o: THREE.Object3D) => { G.add(o); return o; };
  let fog: THREE.FogExp2, bg: THREE.Color, rim: [number, number];
  const keyL = new THREE.DirectionalLight(0xfff2e6, 2.3); keyL.position.set(3, 8, 6); keyL.castShadow = q > 0.4;
  keyL.shadow.mapSize.set(q > 0.8 ? 2048 : 1024, q > 0.8 ? 2048 : 1024); Object.assign(keyL.shadow.camera, { left: -9, right: 9, top: 9, bottom: -3 }); keyL.shadow.bias = -0.0005; add(keyL);
  const hemi = new THREE.HemisphereLight(0x8a8aa8, 0x2a0a06, 0.7); add(hemi);
  const rimA = new THREE.DirectionalLight(0xff4010, 3.2); rimA.position.set(-6, 4, -6); add(rimA);
  const rimB = new THREE.DirectionalLight(0x40a0ff, 2.0); rimB.position.set(6, 3, -6); add(rimB);
  const brazier = (x: number, z: number, col: THREE.Color, lightCol: number, standM: THREE.Material) => {
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1.3, 6), standM); stand.position.y = 0.65; g.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.35, 10, 1, true), std(0x4a3420, 0.5, 0.6)); (bowl.material as THREE.Material).side = THREE.DoubleSide; bowl.position.y = 1.45; g.add(bowl);
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), glow(lightCol, 3)); coals.rotation.x = -Math.PI / 2; coals.position.y = 1.55; g.add(coals);
    shadowAll(g); g.position.set(x, 0, z); add(g);
    const light = new THREE.PointLight(lightCol, 12, 9, 1.5); light.position.set(x, 2.1, z); add(light);
    flames.push({ p: new THREE.Vector3(x, 1.6, z), light, col });
  };
  const pillarG = (x: number, z: number, h: number, m: THREE.Material, dm: THREE.Material, runeCol: number) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), dm); base.position.y = 0.2; g.add(base);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, h, 12), m); sh.position.y = h / 2 + 0.4; g.add(sh);
    for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), dm); ring.rotation.x = Math.PI / 2; ring.position.y = 0.8 + i * h / 4; g.add(ring); }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), dm); cap.position.y = h + 0.55; g.add(cap);
    if (runeCol) { const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * 0.5, 0.02), glow(runeCol, 2.5)); rune.position.set(0, h / 2 + 0.4, 0.44); g.add(rune); }
    shadowAll(g); g.position.set(x, 0, z); add(g); return g;
  };
  const floorBox = (tex: THREE.Texture, ctex: THREE.Texture, emi: THREE.Color, ei: number, rough: number) => {
    tex.repeat.set(3, 1.2); ctex.repeat.set(3, 1.2);
    const f = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 5.6), new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0.05, emissiveMap: ctex, emissive: emi, emissiveIntensity: ei }));
    f.position.set(0, -0.2, -1.2); f.receiveShadow = true; add(f); return f;
  };
  if (id === 'temple') {
    fog = new THREE.FogExp2(0x2a0805, 0.05); bg = new THREE.Color(0x200404); rim = [0xff4010, 0x40a0ff];
    floorBox(floorTex([42, 34, 32], 0), crackTex('#ff7a20', '#ff3000'), new THREE.Color(1, 0.35, 0.08), 0.9, 0.82);
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), lavaMat(new THREE.Color(1, .28, .03), new THREE.Color(.08, .02, .01), new THREE.Color(1, .8, .3), mats)); lava.rotation.x = -Math.PI / 2; lava.position.y = -0.9; add(lava);
    const sm = std(0x4a3a34), dm = std(0x2b201d);
    for (const x of [-7.5, -4.5, 4.5, 7.5]) pillarG(x, -3.2, 5.5, sm, dm, 0xff2200);
    for (const x of [-11, -2.2, 2.2, 11]) pillarG(x, -7.5, 7, sm, dm, 0xff2200);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1.5), dm); wall.position.set(0, 6, -13); add(wall);
    const gate = new THREE.Mesh(new THREE.TorusGeometry(4, 0.6, 8, 24, Math.PI), sm); gate.position.set(0, 3, -12); add(gate);
    const gf = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.05), toneMapped: false, fog: false })); gf.position.set(0, 3, -12.3); add(gf);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 64), glow(0xff5010, 1.6)); ring.position.set(0, 4.6, -11.9); add(ring);
    upd.push(t => { ring.rotation.z = t * 0.1; });
    for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(10 - i * 2, 0.35, 1.2), dm); st.position.set(0, 0.17 + i * 0.35, -9.5 - i * 0.8); st.receiveShadow = true; add(st); }
    add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat(new THREE.Color(.55, .09, .03), new THREE.Color(.08, .01, .01), new THREE.Color(.9, .25, .05))));
    for (let i = 0; i < 18; i++) { const h = 6 + rnd() * 14; const sp = new THREE.Mesh(new THREE.ConeGeometry(1 + rnd() * 2, h, 5), new THREE.MeshBasicMaterial({ color: 0x1a0504 })); sp.position.set(-40 + i * 4.7, h / 2 - 1, -30 - rnd() * 10); add(sp); }
    const fc = new THREE.Color(3, 1.1, 0.25);
    brazier(-5.8, -1.8, fc, 0xff7a30, std(0x2a2422)); brazier(5.8, -1.8, fc, 0xff7a30, std(0x2a2422)); brazier(-3, -5.6, fc, 0xff7a30, std(0x2a2422)); brazier(3, -5.6, fc, 0xff7a30, std(0x2a2422));
    const up = new THREE.PointLight(0xff4a10, 14, 10, 1.6); up.position.set(0, -0.3, 3); add(up);
  } else if (id === 'ossuary') {
    fog = new THREE.FogExp2(0x0a1828, 0.055); bg = new THREE.Color(0x050c16); rim = [0x60c0ff, 0xb0e0ff];
    rimA.color.set(0x5ab0ff); rimB.color.set(0xd0f0ff); hemi.color.set(0x8aa8d0); hemi.groundColor.set(0x0a1420); keyL.color.set(0xe8f2ff);
    floorBox(floorTex([52, 62, 74], 10), crackTex('#7fe0ff', '#30a0ff'), new THREE.Color(0.3, 0.8, 1.2), 0.8, 0.35);
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), lavaMat(new THREE.Color(.25, .65, 1), new THREE.Color(.01, .03, .06), new THREE.Color(.8, .95, 1), mats)); ice.rotation.x = -Math.PI / 2; ice.position.y = -0.9; add(ice);
    const iceM = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.15, metalness: 0, transmission: q > 0.8 ? 0.6 : 0, thickness: 0.5, emissive: 0x0a3050, emissiveIntensity: 0.8 });
    const boneM = std(0xd8cfb8, 0.6), dm = std(0x26303c);
    for (const x of [-7.5, -4.5, 4.5, 7.5]) pillarG(x, -3.2, 5.5, iceM, dm, 0x40c0ff);
    for (const x of [-11, -2.2, 2.2, 11]) pillarG(x, -7.5, 7, iceM, dm, 0);
    // skull wall
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1.5), dm); wall.position.set(0, 6, -13); add(wall);
    const skullG = new THREE.SphereGeometry(0.22, 10, 8); const sk = new THREE.InstancedMesh(skullG, boneM, 420); let k = 0; const m4 = new THREE.Matrix4();
    for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) { m4.makeTranslation(-14 + x * 0.95 + (y % 2) * 0.45, 0.4 + y * 0.5, -12.1 + rnd() * 0.15); sk.setMatrixAt(k++, m4); } add(sk);
    const eyeM = glow(0x40c8ff, 3); const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), eyeM, 40);
    for (let i = 0; i < 40; i++) { const x = -14 + Math.floor(rnd() * 30) * 0.95, y = 0.4 + Math.floor(rnd() * 14) * 0.5; m4.makeTranslation(x + 0.07, y + 0.03, -11.9); eyes.setMatrixAt(i, m4); } add(eyes);
    // icicles
    for (let i = 0; i < 60; i++) { const h = 0.6 + rnd() * 2.5; const c = new THREE.Mesh(new THREE.ConeGeometry(0.08 + rnd() * 0.15, h, 6), iceM); c.rotation.x = Math.PI; c.position.set(-14 + rnd() * 28, 8.5 - h / 2, -2 - rnd() * 10); add(c); }
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 16), dm); ceil.position.set(0, 9, -6); add(ceil);
    // bone piles
    for (let i = 0; i < 70; i++) { const b = new THREE.Mesh(i % 3 ? new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5) : skullG, boneM); b.position.set((rnd() < .5 ? -1 : 1) * (4 + rnd() * 4), 0.05 + rnd() * 0.2, -2.5 - rnd() * 1.4); b.rotation.set(rnd() * 3, rnd() * 3, Math.PI / 2); b.castShadow = true; add(b); }
    add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat(new THREE.Color(.05, .15, .25), new THREE.Color(.01, .02, .04), new THREE.Color(.2, .5, .8))));
    const fc = new THREE.Color(0.6, 1.8, 3.5);
    brazier(-5.8, -1.8, fc, 0x60c8ff, boneM); brazier(5.8, -1.8, fc, 0x60c8ff, boneM); brazier(-3, -5.6, fc, 0x60c8ff, boneM); brazier(3, -5.6, fc, 0x60c8ff, boneM);
  } else {
    fog = new THREE.FogExp2(0x1a0208, 0.045); bg = new THREE.Color(0x0c0104); rim = [0xff2040, 0xa040ff];
    rimA.color.set(0xff1830); rimB.color.set(0x9040ff); hemi.color.set(0x907080); hemi.groundColor.set(0x200208);
    floorBox(floorTex([36, 30, 34], 20), crackTex('#ff2040', '#ff0020'), new THREE.Color(1, 0.05, 0.12), 0.6, 0.6);
    const blood = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshPhysicalMaterial({ color: 0x2a0004, roughness: 0.08, metalness: 0.2, clearcoat: 1 })); blood.rotation.x = -Math.PI / 2; blood.position.y = -0.6; add(blood);
    const sm = std(0x3a3236, 0.9), dm = std(0x1e181c, 0.9);
    // gothic arches nave
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const z = -3 - i * 3.2, x = s * 6.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 10), sm); col.position.set(x, 4, z); add(col);
      for (const d of [-1, 1]) { const arc = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 6, 16, Math.PI / 2.4), dm); arc.position.set(x + d * 0, 8, z); arc.rotation.set(0, Math.PI / 2, d > 0 ? Math.PI / 2 - 0.2 : Math.PI / 2 + 0.2 + Math.PI * 0.4); add(arc); }
    }
    for (const x of [-4, 4]) pillarG(x, -2.8, 6, sm, dm, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 1.5), dm); wall.position.set(0, 9, -15); add(wall);
    // stained glass rose + lancets
    const glass = canvasTex(512, (g, s) => {
      g.fillStyle = '#100'; g.fillRect(0, 0, s, s); const cols = ['#ff1030', '#a00010', '#ff6020', '#7010a0', '#ff3050', '#300060'];
      for (let i = 0; i < 260; i++) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; const x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + rnd() * 40, y + rnd() * 30); g.lineTo(x + rnd() * 30, y + 30 + rnd() * 30); g.fill(); }
      g.strokeStyle = '#000'; g.lineWidth = 5; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(i / 16 * 6.28) * s, s / 2 + Math.sin(i / 16 * 6.28) * s); g.stroke(); }
      for (let r = 40; r < s; r += 60) { g.beginPath(); g.arc(s / 2, s / 2, r, 0, 7); g.stroke(); }
    });
    const gm = new THREE.MeshBasicMaterial({ map: glass, color: new THREE.Color(2.2, 1.6, 1.6), toneMapped: false, fog: false });
    const rose = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), gm); rose.position.set(0, 10, -14.2); add(rose);
    for (const x of [-6, -3.4, 3.4, 6]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5.5), gm); l.position.set(x, 6, -14.2); add(l); const tip = new THREE.Mesh(new THREE.CircleGeometry(0.7, 3), gm); tip.position.set(x, 8.9, -14.2); tip.rotation.z = Math.PI / 2; add(tip); }
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.02, 0.04), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    shaft.position.set(0, 4, -8); shaft.rotation.x = -0.5; add(shaft);
    // organ pipes
    for (let i = 0; i < 24; i++) { const h = 3 + Math.abs(12 - i) * 0.35 + 3; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 8), std(0x8a6a30, 0.35, 0.9)); p.position.set(-6 + i * 0.52, 1.4 + h / 2, -12.8); add(p); }
    const alt = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 1.6), sm); alt.position.set(0, 0.6, -9); add(alt);
    // candles
    const candleM = std(0xe8dcc0, 0.7);
    for (let i = 0; i < 40; i++) { const x = (rnd() - .5) * 10, z = -2.6 - rnd() * 7; const h = 0.2 + rnd() * 0.5; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 6), candleM); c.position.set(x, h / 2, z); add(c); flames.push({ p: new THREE.Vector3(x, h + 0.04, z), col: new THREE.Color(2.5, 0.9, 0.3) }); }
    for (const [x, z] of [[-4, -3], [4, -3], [0, -8.5]]) { const l = new THREE.PointLight(0xff6030, 9, 8, 1.5); l.position.set(x, 1.2, z); add(l); flames.push({ p: new THREE.Vector3(x, -10, z), light: l, col: new THREE.Color(0, 0, 0) }); }
    add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat(new THREE.Color(.12, .01, .03), new THREE.Color(.02, 0, .01), new THREE.Color(.3, .02, .06))));
  }
  shadowAll(G, false);
  keyL.castShadow = q > 0.4;
  const ash = new Pool(G, Math.round(400 * q), 0.05, id === 'ossuary', 0, 0); ash.floor = false;
  const ashCol = id === 'temple' ? new THREE.Color(0.35, 0.3, 0.28) : id === 'ossuary' ? new THREE.Color(1.2, 1.4, 1.6) : new THREE.Color(0.4, 0.02, 0.04);
  for (let i = 0; i < ash.n; i++) ash.emit((rnd() - .5) * 24, rnd() * 9, -8 + rnd() * 11, 0.2, -0.25 - rnd() * 0.3, 0, 1e9, ashCol);
  const embers = new Pool(G, Math.round(250 * q), 0.06, true, 0, 0); embers.floor = false;
  const emCol = id === 'ossuary' ? new THREE.Color(0.5, 1.5, 3) : id === 'temple' ? new THREE.Color(3, 0.9, 0.2) : new THREE.Color(3, 0.3, 0.5);
  for (let i = 0; i < embers.n; i++) embers.emit((rnd() - .5) * 24, rnd() * 9, -8 + rnd() * 11, 0.1, 0.4 + rnd() * 0.5, 0, 1e9, emCol);
  const update = (t: number, dt: number) => {
    mats.forEach(m => m.uniforms.t.value = t);
    flames.forEach((b, i) => {
      if (b.light) b.light.intensity = (id === 'cathedral' ? 8 : 11) + Math.sin(t * 17 + i) * 2 + Math.sin(t * 7.3 + i * 2) * 2;
      if (b.p.y < -5) return;
      const small = id === 'cathedral'; const n = small ? (Math.random() < 0.5 * q ? 1 : 0) : Math.ceil(4 * q);
      for (let k = 0; k < n; k++) fire.emit(b.p.x + (Math.random() - .5) * (small ? 0.03 : 0.5), b.p.y, b.p.z + (Math.random() - .5) * (small ? 0.03 : 0.5), (Math.random() - .5) * 0.2, small ? 0.25 : 0.6 + Math.random() * 1.1, 0, small ? 0.3 : 0.4 + Math.random() * 0.6, b.col);
    });
    fire.update(dt, k => k * k * 1.2);
    for (const pl of [ash, embers]) { for (let i = 0; i < pl.n; i++) { const y = pl.pos[i * 3 + 1]; if (y < 0) pl.pos[i * 3 + 1] = 9; if (y > 9) pl.pos[i * 3 + 1] = 0; pl.pos[i * 3] += Math.sin(t + i) * 0.003; } pl.update(dt, (_k, i) => pl === embers ? 0.5 + 0.5 * Math.sin(t * 3 + i) : 1); }
    upd.forEach(f => f(t, dt));
  };
  if (id === 'cathedral') (fire.pts.material as THREE.PointsMaterial).size = 0.12;
  return { group: G, update, fog: fog!, bg: bg!, rim: rim!, dispose: () => G.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); }) };
}
