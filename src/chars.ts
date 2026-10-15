import type { CharSim } from './sim';
export interface CharDef extends CharSim {
  id: string; name: string; title: string; bio: string; base: 'male' | 'female';
  color: string; glow: number; spark: [number, number, number]; finisher: string; finKind: 'burn' | 'shatter' | 'bleed' | 'rot';
}
export const CHARS: CharDef[] = [
  { id: 'vorath', name: 'VORATH', title: 'The Cinder Tyrant', base: 'male', color: '#ff3b1a', glow: 0xff3000, spark: [4, 1.6, 0.4], speed: 1, power: 1.08,
    bio: 'A warlord of the ninth pit whose veins run with molten brimstone.', finisher: 'Immolation', finKind: 'burn', superName: 'INFERNO BREATH',
    specials: [{ name: 'Hellfire Orb', motion: 'qcf', btn: 'P', kind: 'proj', dmg: 9, color: 0xff4010 }, { name: 'Brimstone Charge', motion: 'bf', btn: 'K', kind: 'rush', dmg: 11, color: 0xff6020 }, { name: 'Magma Pillar', motion: 'dd', btn: 'P', kind: 'pillar', dmg: 10, color: 0xff3000 }] },
  { id: 'kaijin', name: 'KAIJIN', title: 'Frost-Chain Assassin', base: 'male', color: '#4cc8ff', glow: 0x40c8ff, spark: [1.2, 3, 5], speed: 1.12, power: 0.95,
    bio: 'A disgraced clan ninja bound to an ice demon by a chain of black steel.', finisher: 'Glacial Shatter', finKind: 'shatter', superName: 'BLIZZARD BARRAGE',
    specials: [{ name: 'Frost Hook', motion: 'qcf', btn: 'P', kind: 'pull', dmg: 6, color: 0x60d8ff }, { name: 'Glacier Slide', motion: 'bf', btn: 'K', kind: 'slide', dmg: 9, color: 0x80e0ff }, { name: 'Shard Spire', motion: 'dd', btn: 'P', kind: 'pillar', dmg: 9, color: 0x50c0ff }] },
  { id: 'nyxara', name: 'NYXARA', title: 'Blood Witch of Vael', base: 'female', color: '#c02cff', glow: 0xb030ff, spark: [3.5, 0.6, 4], speed: 1.15, power: 0.92,
    bio: 'A coven queen who drinks the screams of the dying to shape blood into blades.', finisher: 'Exsanguinate', finKind: 'bleed', superName: 'HEMORRHAGE STORM',
    specials: [{ name: 'Blood Lance', motion: 'qcf', btn: 'P', kind: 'proj', dmg: 8, color: 0xd02060 }, { name: 'Veil Step', motion: 'bf', btn: 'K', kind: 'teleport', dmg: 8, color: 0xb030ff }, { name: 'Crimson Geyser', motion: 'dd', btn: 'P', kind: 'pillar', dmg: 10, color: 0xe01040 }] },
  { id: 'morgrim', name: 'MORGRIM', title: 'The Grave Revenant', base: 'male', color: '#7dff3a', glow: 0x70ff30, spark: [1.6, 4, 0.8], speed: 0.9, power: 1.15,
    bio: 'A crusader buried alive a thousand years ago. The grave did not keep him.', finisher: 'Rot Embrace', finKind: 'rot', superName: 'PLAGUE TIDE',
    specials: [{ name: 'Soul Skull', motion: 'qcf', btn: 'P', kind: 'proj', dmg: 10, color: 0x70ff30 }, { name: 'Tomb Ram', motion: 'bf', btn: 'K', kind: 'rush', dmg: 12, color: 0x90ff50 }, { name: 'Ossuary Hands', motion: 'dd', btn: 'P', kind: 'pillar', dmg: 11, color: 0x60e030 }] },
];
export const ARENAS = [
  { id: 'temple', name: 'HELL TEMPLE', desc: 'Lava-veined sanctum of the Cinder Tyrant' },
  { id: 'ossuary', name: 'FROZEN OSSUARY', desc: 'An ice-choked crypt of a thousand dead' },
  { id: 'cathedral', name: 'BLOOD CATHEDRAL', desc: 'A drowned nave lit by crimson glass' },
];
export const MOTION_TEXT = { qcf: '↓ ↘ →', bf: '← →', dd: '↓ ↓' };
