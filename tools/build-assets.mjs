// Optimizes CC0 Quaternius assets: prunes unused clips, meshopt-compresses geometry+animation, WebP textures (1024px).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const KEEP = new Set(['Punch_Jab', 'Punch_Cross', 'Melee_Hook', 'Hit_Chest', 'Hit_Head', 'Hit_Knockback', 'Death01', 'Walk_Loop', 'Crouch_Idle_Loop', 'NinjaJump_Idle_Loop', 'Spell_Simple_Shoot', 'Spell_Simple_Idle_Loop', 'Roll', 'LayToIdle', 'Idle_FoldArms_Loop', 'Sword_Idle', 'OverhandThrow', 'Idle_Loop', 'Jog_Fwd_Loop']);
const out = 'public/assets/';
for (const [src, dst] of [['assets-src/Superhero_Male_FullBody.gltf', 'male.glb'], ['assets-src/Superhero_Female_FullBody.gltf', 'female.glb'], ['assets-src/Hair_Long.gltf', 'hair_long.glb']]) {
  const doc = await io.read(src);
  await doc.transform(weld(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out + dst, doc); console.log('wrote', dst);
}
for (const [src, dst] of [['assets-src/UAL1_Standard.glb', 'anim1.glb'], ['assets-src/UAL2_Standard.glb', 'anim2.glb']]) {
  const doc = await io.read(src); const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const m of root.listMaterials()) m.dispose(); for (const t of root.listTextures()) t.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out + dst, doc); console.log('wrote', dst, root.listAnimations().map(a => a.getName()).join(','));
}
