# Assets, sources & licenses

All third-party art is **CC0 1.0** (public domain). Licenses were checked on the source pages on 2026-10-15; copies are in `public/assets/LICENSE_*.txt`.

| Asset | Source | License |
|---|---|---|
| Male + female base bodies, eye textures, long-hair mesh (`male.glb`, `female.glb`, `hair_long.glb`) | Quaternius, *Universal Base Characters* (Standard), https://quaternius.itch.io/universal-base-characters | CC0 1.0 |
| Animation clips (Punch_Jab, Punch_Cross, Hit_*, Death01, Walk_Loop, Crouch_Idle_Loop, Spell_Simple_*, Roll, Sword_Idle, OverhandThrow, …) (`anim1.glb`) | Quaternius, *Universal Animation Library*, https://quaternius.itch.io/universal-animation-library | CC0 1.0 |
| Animation clips (Melee_Hook, Hit_Knockback, NinjaJump_Idle_Loop, LayToIdle, …) (`anim2.glb`) | Quaternius, *Universal Animation Library 2*, https://quaternius.itch.io/universal-animation-library-2 | CC0 1.0 |
| Fonts Pirata One, Cinzel | Google Fonts via Fontsource | SIL Open Font License 1.1 |

The meshes were re-encoded by `tools/build-assets.mjs` (glTF-Transform: unused clips pruned, meshopt compression, WebP textures at 1024 px).

## Made in code (MIT, part of this repo)
- Costumes and props: horns, armor, chain, skull mask, ribcage, crowns, orbs. Also the arenas, shaders (lava, ice, veins, dissolve, frost), particles, blood decals and the logo.
- Kick, sweep and block poses, done as procedural bone overlays.
- **All audio** is generated live with WebAudio: hits, whooshes, stingers and the generative music. The announcer uses the browser's `speechSynthesis` voice.

## Libraries
three.js (MIT), PeerJS (MIT) plus the public PeerJS signaling broker (0.peerjs.com), Vite (MIT), TypeScript (Apache-2.0), glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0), playwright-core (Apache-2.0, tests only).
