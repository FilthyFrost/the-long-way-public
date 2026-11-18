# Map: Render pipeline — renderer, materials, sky and weather drawing

Area: `src/game/render/*` (13 files, 5,788 lines), `src/game/env/*` (6 files, 1,869 lines),
`specs/art/{STYLE.md,style.json,rubric.md}`. Skimmed: `src/game/render/carMaterials.ts`,
`src/game/modcar/{materials,garageBeams,garageLook}.ts`. Read for context only: `src/game/scene/worldView.ts`, the
render-facing parts of `ModGame.ts`, `entry.ts`, `devWorld.ts`, `garage.ts`, `harness/shots/*`, `harness/judge/*`,
`docs/V3/PLAN.md`.

Read at `feat/v3`. `src/`, `specs/` and `harness/` are identical at `e50503c` and `b15d60b` (the commit between them
added only `docs/V3/PLAN.md` and `CATALOG.md`); all line numbers are for that tree. three.js facts were read in
`node_modules/three` (0.187.0) and are cited as `three:<file>:<line>`.

Evidence tags used below:

- **[code]** read in the source at the cited lines.
- **[three]** read in the three r187 source.
- **[recorded]** a number committed in the repository (`loop/metrics/*.json`, docs). Not re-measured here.
- **[estimate]** arithmetic from formats, sizes and tap counts.
- **Nothing in this map is a GPU measurement.** No browser was run. The one thing executed was
  `npx vitest run harness/sim/carmerge.test.ts` (13 tests passed), to confirm the render modules import in Node.

---

## 1. Summary

- A **forward renderer on three r187 `WebGLRenderer` (WebGL2)** with hand-written `ShaderMaterial`s only. One frame is:
  cloud-cube strip → 2 shadow maps → the scene into a half-float MSAA target in linear light → 9 bloom passes → **one
  "finish" shader** (Kuwahara paint, bloom, ink lines, lit outline, screen-space shafts, vignette, exposure, painter's
  curve, saturation, sRGB, dither) → SMAA (3 passes) → canvas. 13 full-screen draw calls after the scene.
- The glue is two module-level singletons in `shaderlib.ts`: **`globals`** (47 shared uniform holders) and
  **`GLSL_COMMON`** (47 uniform declarations + 33 functions, 373 lines) pasted into every lit material. There is **no
  pass registry, no uniform registry, no material registry and no run-time quality switching**. Pass order is
  hard-coded in `RenderCore.render` (core.ts 111–130) and `Frame.render` (frame.ts 322–374).
- **The alpha channel of the scene target is a control channel, not coverage**: `< 0.6` = "already painted, skip the
  brush", `0.7` = leaves (finest brush), `< 0.23` = ink ids of cel things, `0.25` = sky (also the key the light shafts
  look for). Every transparent material must leave destination alpha alone.
- **Depth is logarithmic** (`logarithmicDepthBuffer: true`, core.ts 61): every fragment shader writes `gl_FragDepth`.
  By GL rules that turns early depth rejection off, so all overdraw is shaded in full. This decides what a depth
  pre-pass can and cannot buy (section 6, risk 1).
- **Shadows**: two nested orthographic maps (5.5 m and 92 m half-extent), both redrawn every frame through
  `scene.overrideMaterial`, sampled with a manual 3×3 nearest-tap filter. Terrain does not cast. Beyond about 150 m
  nothing has a cast shadow on med/high.
- **Light** = 7 keys by sun elevation (`style.json`) × per-biome air × weather, computed by pure functions
  (`lightAt`, `computeLook`) and pushed into `globals` and `skyUniforms` once a frame by `Environment.update`.
- **The look gates run on `classic.html`**, software-rendered at 1280×720: the style-distance set and every
  `specs/render/*.json` budget card. ModCar's draw calls and triangles are recorded but not gated.
- Recorded scale [recorded, 2026-11-16, SwiftShader, 1280×720, quality high]: ModCar road 260–388 draw calls,
  0.85–1.33 M triangles, 33–40 programs; garage 238–566 calls, 1.1–1.54 M triangles, 46 programs. `docs/V3/PLAN.md`
  reports 420–510 calls from its own 12 shots this round.
- For V3 the pipeline needs **13 small seams** (section 7.1), all of which can land with identical pixels, and **one
  early decision**: keep log depth, or move to reversed-Z where `EXT_clip_control` exists.

---

## 2. Key files

| Path | Lines | Role | Public API |
|---|---:|---|---|
| `src/game/render/core.ts` | 136 | Renderer set-up, frame order, floating origin | `type Quality = 'low'｜'med'｜'high'` (14); `interface QualitySettings` (16–28); `QUALITY` (30–34); `class RenderCore` (36): `renderer`, `scene`, `camera` (fov 64, near 0.06, far 48000; line 39), `quality`, `origin`, `sky`, `frame`, `exposure`, `shafts`, `shaftColor`, `usePost`, `shadows`, `shadowFocus`, `resize(cssW, cssH)`, `place(obj, wx, wy, wz)`, `onRebase(fn)`, `maybeRebase(wx, wy, wz, limit = 1024)`, `render(time)`, `get stats` |
| `src/game/render/frame.ts` | 375 | Scene target, bloom chain, the finish shader, SMAA | `interface FrameOptions { samples; paint; smaa? }`; `class Frame`: `rtScene`, `bloom`, `grade { vignette, knee, shoulder, saturation, ink, threshold }` (34–41), `exposure`, `shafts`, `shaftColor`, `smaa`, `paint`, `render(scene, camera, time)`. The depth texture is `private` (52) |
| `src/game/render/shaderlib.ts` | 493 | Shared uniforms and GLSL | `ROOM_OPENINGS = 10`, `ROOM_LAMPS = 10`; `globals` (24–85); `type GlobalUniforms`; `NOISE_PERIOD = 4096`; `GLSL_COMMON` (94–466); `GLSL_VERTEX_PARS` (469), `GLSL_VERTEX_MAIN` (476), `GLSL_FRAGMENT_PARS` (488) |
| `src/game/render/shadow.ts` | 155 | The two shadow maps | `LAYER_SHADOW_FAR = 1`, `LAYER_SHADOW_NEAR = 2`; `class ShadowPass`: `near`, `far`, `enabled`, `fixFar(focus｜null, reach = 92)`, `render(renderer, scene, nearFocus, farFocus)`; `castShadows(obj, near = false)` |
| `src/game/render/style.ts` | 206 | `style.json` as typed data; light keys; palette slots | `LightKey`, `BiomeStyle`, `StyleSpec`, `STYLE`, `BIOME_STYLES`, `class LightState`, `lightAt(elevDeg, morning, out)`, `SLOTS = 4`, `paletteUniforms`, `setSlotBiome(slot, biome)`, `slotOfChapter(c)`, `showChapters(biomeOf, chapter)`, `BIOME_COUNT` |
| `src/game/render/paint.ts` | 83 | **Palette GLSL, not the paint pass** | `GLSL_SLOTS` (`rtSlotW`, `rtSlotPair`), `GLSL_PAINT` (`struct RtPal`, `rtPal`, `rtPaintTone`, `rtWoodTone`, `rtSnowTone`) |
| `src/game/render/textures.ts` | 223 | Procedural textures | `noiseTexture`, `strokesTexture`, `leafTexture`, `woodsTexture`, `sharedTextures()` → `{ noise 256² RGBA8, strokes 512², leaf 256², woods 1024×256 }` |
| `src/game/render/materials.ts` | 945 | Material factories | `GLSL_LEAF_COVER`, `SurfaceOptions`, `maskPreservingBlend(mat)`, `surfaceMaterial(o)`, `foliageMaterial({ sway, snowCap, evergreen })`, `rockMaterial()`, `glassMaterial()`, `provingGroundMaterial()`, `groundShadowMaterial()`, `windscreenUniforms`, `windscreenMaterial()`, `mirrorMaterial()`, `GrassFade`, `grassMaterial(fade, keepFar)`, `flowerMaterial(fade, keepFar)`, `farWoodsMaterial(fade)` |
| `src/game/render/terrainMaterials.ts` | 521 | Ground shaders | `GROUND_PAINT` (`rtContour`, `rtFlowers`, `rtPaintedGround`), `GROUND_VARYINGS`, `terrainClamp`, `terrainMaterial()`, `roadStripMaterial()`, `wireMaterial()` |
| `src/game/render/water.ts` | 177 | Painted water | `waterPaints()`, `waterUniforms { uWaterRain }`, `waterMaterial()` |
| `src/game/render/carMaterials.ts` | 1811 | Car look: 7 shading families, wear, ghosts | `CAR_MATERIAL_NAMES` (22 names), `carMaterialName`, `carEnvUniforms`, `CarLookOptions`, `CarLights`, `Variant`, `class CarLook`, `WiperArc`, `meshCarMaterialName`, `measureCarShape`, `applyCarMaterials`, `carShadows`, `GhostKind`, `ghostMaterial`, `applyGhost` |
| `src/game/render/carMerge.ts` | 408 | One mesh per material per car | `MergePart`, `MergeOptions`, `PartLook`, `MOVES`, `mergeCarParts`, `MergeEntry`, `class MergedCar` (`group`, `calls`, `ids`, `updatePart`, `boxOf`, `partAt`, `pick`, `dispose`), `mergedMaterialName` |
| `src/game/render/triGrid.ts` | 255 | Ray against a mesh (grime aiming); no drawing | `TriHit`, `class TriGrid`, `triGrid(g)`, `castMesh(...)` |
| `src/game/env/sky.ts` | 295 | Sky dome; the sky as a mirror | `skyUniforms` (22 holders), `skyMirrorUniforms()`, `GLSL_SKY_MIRROR` (`rtSkyMirror`), `skyDomeMaterial()` |
| `src/game/env/clouds.ts` | 490 | Ray-marched cumulus into a cube map | `MAX_CLOUDS = 20`, `PER_CLOUD = 16`, `CloudLight`, `class Clouds`: `texture`, `centre`, `setLight(l)`, `drawAll(x, z, cover, driftX, driftZ)`, `update(x, z, cover, recentre, driftX, driftZ)` |
| `src/game/env/environment.ts` | 281 | Clock + weather → uniforms, precipitation, wipers | `class Environment`: `clock`, `weather`, `sky`, `look`, `state`, `tune`, `precip`, `clouds`, `cloudsNow`, `camX`, `camZ`, `shotMode`, `dark`, `flash`, `prepareShot()`, `update(dt, time, ba, bb, bt, world, vx, vy, vz)`, `strike()`, `wiperAngle` |
| `src/game/env/colorScript.ts` | 147 | The light of the hour, pure maths | `class Look extends LightState` (`dir`, `stars`, `sunVis`, `moon`), `computeLook(sky, w, biomeA, biomeB, bt, out)` |
| `src/game/env/precip.ts` | 233 | Rain, snow, hail, dust, leaves, gust lines | `type PrecipKind` (6 kinds), `PRECIP_DEFS`, `class Precipitation`: `count`, `length`, `update(dt, amounts, wind, camVel)`, `setLeafColor(c)`, `setCabin(m, min, max)` |
| `src/game/env/splash.ts` | 423 | Rain bursts on ground and vehicle tops | `GROUND_RATE`, `CAR_RATE`, `SIZE`, `SplashVehicle`, `class Splashes`: `groundRate`, `carRate`, `size`, `update(...)`, `dispose()` |
| `src/game/modcar/materials.ts` | 220 | One `CarLook` per owner of a vehicle | `LookOf`, `class CarMaterials` (`look`, `set`, `drop`, `setLights`, `setShape`, `setCarFrame`, `highlight`, `counts`), `applyMaterials(root, look, merged)`, `matNames` |
| `src/game/modcar/garageBeams.ts` | 267 | Sun beams and dust in the workshop | `beamUniforms`, `beamMaterial()`, `buildBeams()`, `dustMaterial()`, `buildDust()` |
| `src/game/modcar/garageLook.ts` | 356 | Garage materials. **Samples the shadow maps directly** (76–84) | `garageCelMaterial`, `garageFloorMaterial`, … |
| `specs/art/STYLE.md` | 124 | The art spec: three ways of colouring, finish chain, budgets, acceptance | — |
| `specs/art/style.json` | 396 | Numbers read by code: `pipeline`, `lightKeys` (7), `morning`, `biomes` (6), `road`, `clouds.cubeSize/steps`, `grass` | — |
| `specs/art/rubric.md` | 33 | Ten judged items, two themes | — |

`style.json` fields that **no code reads** [code, grep of `STYLE.`]: `clouds.base/count/puffsPerCloud/redrawStripsPerFrame/recenterMeters`,
`pipeline.hdr/dither`, `budget.*`. `water` is read (water.ts 21) but absent from the file, so the fallbacks apply.

---

## 3. Lifecycle and data flow

### 3.1 Construction

1. Module load: `shaderlib.ts` 18 calls `sharedTextures()` (builds the noise, stroke, leaf and woods textures; blank
   1×1 stand-ins outside a browser, textures.ts 216–222). `style.ts` 203 puts biome 0 in all four palette slots.
   Shader strings that interpolate `GLSL_COMMON` at module scope are frozen here (`GLSL_CAR_FRAGMENT`, carMaterials.ts
   229; `GLSL_GARAGE_SUN`, garageLook.ts 72).
2. `new RenderCore(canvas, quality)` (ModGame.ts 423): `WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true,
   powerPreference: 'high-performance', alpha: false })`; pixel ratio `min(devicePixelRatio, cap)` set **once**
   (core.ts 62); `info.autoReset = false`; clear colour (0,0,0,0); `outputColorSpace = LinearSRGBColorSpace`;
   `new Frame(...)`; `new ShadowPass(size)` when `shadowSize > 0`; the sky dome (`IcosahedronGeometry(1, 4)`,
   `renderOrder = -1000`, not frustum culled).
3. `new Environment(core, seed, opts)` (ModGame.ts 430): `Precipitation` (6 instanced layers) and `Clouds`. The cloud
   tier is derived from the MSAA sample count (environment.ts 82).
4. World and garage builders create their materials (one instance each, e.g. worldView.ts 51–95).
5. Other consumers of the same pipeline: `src/game/modcar/viewer.ts` 286 (`viewer.html`) and `src/game/game.ts` 120
   (`classic.html`).

### 3.2 One frame: pass order

`ModGame.frame(dt)` → `step(dt)` → `render()` → HUD (ModGame.ts 4525–4532).

| # | When | Pass | Code | Target | Draws |
|---:|---|---|---|---|---:|
| 0a | in `step`, `Environment.update` | Cloud cube: one strip of one face | clouds.ts 475–489, 450–461 | cube face, scissored | 1 |
| 0b | in `step`, on demand | Vehicle-top height map for rain bursts, then a **synchronous `readRenderTargetPixels`** | splash.ts 292–382 | 64×32 RGBA8 | vehicle meshes |
| 0c | in `step`, on demand | Grime masks and measure, cargo floor maps (other areas) | grime.ts, cargo.ts | small RGBA8 targets | — |
| 1 | `core.render` | `uOriginOffset`, `uTime`; `renderer.info.reset()` | core.ts 112–116 | — | — |
| 2 | | Shadow, near cascade (camera layer 2) | shadow.ts 132–143 | depth, size² | casters |
| 3 | | Shadow, far cascade (camera layer 1), centred 55 m ahead of the camera | core.ts 119–123 | depth, size² | casters |
| 4 | `frame.render` | Clear to (0,0,0,0); scene: opaque list (sky first), then transparent list; MSAA resolve of colour and depth | frame.ts 326–329 | `rtScene` | all |
| 5 | | Bloom down ×5 (`bloomFirst`, then `bloomDown` ×4) | 332–339 | `rtDown[0..4]` | 5 |
| 6 | | Bloom up ×4 (`bloomUp`) | 340–347 | `rtUp[3..0]` | 4 |
| 7 | | Finish (`finalMat`) | 349–373 | `rtFinal`, or the canvas when SMAA is off | 1 |
| 8 | | SMAA: edges, weights, blend | 372 | two internal targets, then the canvas | 3 |

Notes:

- Opaque order [three: `webgl/WebGLRenderLists.js` 1–29]: group order, `renderOrder`, `material.id`, material variant,
  front-to-back z. Transparent: group order, `renderOrder`, back-to-front z.
- `renderOrder` values in use [code, grep]: −1000 sky; 1 ground shadow discs; 2 proving-ground lamp pools; 3 water;
  4 garage front glow; 5 garage beams, wreck glints, beacon beams; 6 garage dust; 7 smoke, spray mist; 8 wheel dust;
  9 car glass and lenses; 10 liquid stream; 15 sparks; 19 splashes; 20 precipitation and ghost depth twins; 21 ghosts;
  22 ghost x-ray. `ModGame.ts` 1954 treats `renderOrder >= 20` as "not a pickable surface".
- Layers in use: 0 main view, 1 shadow far, 2 shadow near, 7 cargo floor measure (cargo.ts 26), 30 splash measure
  (splash.ts 324).
- `core.stats` (core.ts 132–135) counts passes 2–8 only; pass 0 draws happen before `info.reset()`.
  `info.programs.length` is cumulative for the session.
- The UI is DOM (`hud.ts`, `modcar/ui.ts`): it is never in the WebGL frame.

### 3.3 Render targets

W×H = drawing buffer = CSS size × `min(devicePixelRatio, pixelRatioCap)`.

| Target | Created | Colour | Depth | Size | Samples |
|---|---|---|---|---|---:|
| `rtScene` | frame.ts 76 | RGBA16F, linear filter, no mips | `DepthTexture` `UnsignedIntType` → `DEPTH_COMPONENT24`, nearest | W×H | 4 high, 2 med, 0 low |
| `rtDown[0..4]`, `rtUp[0..4]` | frame.ts 77–80 | RGBA16F | none | W/2 … W/32 | 0 |
| `rtFinal` | frame.ts 294 | RGBA8, already sRGB-encoded | none | W×H | 0 (exists only with SMAA) |
| SMAA edges, weights | three `SMAAPass.js` 36–46 | RGBA16F (`HalfFloatType`) | none | W×H | 0 |
| Shadow near, far | shadow.ts 25–29 | default RGBA8, **allocated but never written** (`colorWrite: false`) | `DepthTexture` → `DEPTH_COMPONENT24`, nearest | 2048² high, 1024² med, none low | 0 |
| Cloud cube | clouds.ts 380 | RGBA16F cube, linear, no mips | none | 1024 / 512 / 384 per face | 0 |
| Splash height map | splash.ts 314 | RGBA8, nearest | renderbuffer | 64×32 | 0 |
| Grime mask (per part) | grime.ts 96 | RGBA8, nearest | none | `mask_px`² | 0 |
| Grime measure | grime.ts 359 | RGBA8 | renderbuffer | 112² | 0 |

`rtUp[4]` is allocated and resized but never rendered: the up loop starts at `length - 2` (frame.ts 341) [code].

### 3.4 How `globals` and the GLSL chunks become ShaderMaterials

- `globals` (shaderlib.ts 24–85) is one object of `{ value }` holders: 36 of its own plus the 11 palette arrays spread
  in from `style.ts` 147–161. Every factory writes `uniforms: { ...globals, ...own }` (a shallow spread), so **all
  materials point at the same holder objects**. Writing `globals.uSunDir.value.copy(...)` or
  `globals.uFogDensity.value = x` updates every material at once.
- Satellite holder sets, shared the same way: `skyUniforms` (sky.ts 10–37), `waterUniforms` (water.ts 32),
  `windscreenUniforms` (materials.ts 542), `carEnvUniforms` (carMaterials.ts 131), `terrainClamp`
  (terrainMaterials.ts 211), `beamUniforms` (garageBeams.ts 28), and per car `CarLook.shared` (carMaterials.ts 1232).
- `GLSL_COMMON` declares every global and defines: hashes and tiling noise (`rtHash`, `rtNoise`, `rtNoiseAt`,
  `rtStrokeAt`, `rtFbm`), stable world coordinates (`rtWorldXZ`, `rtWorldY`, `rtUV`), shadows (`rtShadowTap`,
  `rtCloudShade`, `rtShadowMap`, `rtShadow`), the light models (`rtSlopeRel`, `rtSlopeSun`, `rtGroundLight`, `rtCel`,
  `rtCabin`, `rtCelAt`, `rtCabinAt`, `rtLight`), the room (`rtInRoom`, `rtEdgeFF`, `rtOpeningLight`, `rtRoomSky`,
  `rtSkyLight`, `rtRoomLamps`, `rtRoomMirror`), `rtHeadlight`, `rtFog`, `rtGroundPaint`, `rtForestPaint`, `rtEncode`.
  It goes into the fragment shader of every lit material, and into some **vertex** shaders too (grass, flowers,
  garage beams and dust: the dust motes call `rtShadowMap` per vertex, garageBeams.ts 222).
- Other chunks: `GLSL_VERTEX_PARS/MAIN`, `GLSL_FRAGMENT_PARS` (three's `<common>` and `<logdepthbuf_*>` includes,
  `vPos`, `vNormal`, instancing; they expect locals named `transformed` and `objNormal`); `GLSL_SLOTS`, `GLSL_PAINT`;
  `GROUND_PAINT` (shared by terrain, road strip and `provingPaint.ts`); `GLSL_SKY_MIRROR`; `GLSL_LEAF_COVER` (shared by
  foliage and the shadow depth material); `GLSL_SWAY` (private to materials.ts).
- Composition is **template-literal interpolation at factory call time** (or at module load for the two strings named
  in 3.1). Variants are `defines` chosen from options: `RT_FLAT`, `RT_MAP`, `RT_DOUBLE`, `RT_NOFOG`, `RT_SWAY`,
  `RT_SNOW`, `RT_INK`, `RT_INK_BASE`, `RT_CABIN`, `RT_BRUSH` (materials.ts 84–94); `RT_EVERGREEN`; the car families
  `RT_PAINT/METAL/MATTE/GLASS/LENS/GAUGE/EMIT` with `RT_WEAR`, `RT_MASK`, `RT_MEASURE`, `RT_CRUSTCUT`, `RT_VPAINT`,
  `RT_VWEAR`, `RT_VPART` (carMaterials.ts 1293–1304).
- Several vertex shaders declare a subset of the globals by hand instead of including `GLSL_COMMON` (materials.ts
  114–116 and 274–275, precip.ts 98–113).
- The shaders are GLSL-1 style (`attribute`, `varying`, `texture2D`, `gl_FragColor`), converted by three's GLSL3
  prefix. A few use GLSL3 directly (`texelFetch`, `texture`, `flat varying`, `inverse`).
- Colour pipeline: materials write **linear radiance**; nothing is encoded before the finish shader (`rtEncode` is the
  identity, shaderlib.ts 463).

### 3.5 Alpha conventions and who writes them

Readers are all in the finish shader: `painted()` skips the brush below `skipAlphaBelow = 0.6` (frame.ts 197) and uses
the finest brush below 0.8 (204); `inkPair()` draws a line where a pixel and a neighbour differ and at least one is
below 0.23 (167); `litBand()` is 0.004…0.036 (159); the shaft walk counts a sample as open sky when
`abs(a - 0.25) <= 0.05` (247).

| Alpha | Meaning | Writer |
|---|---|---|
| 0 | nothing drawn | the clear, frame.ts 327 |
| 0.006 … 0.032 | the part being looked at: outline drawn in light | carMaterials.ts 1184 |
| 0.04 … 0.19 | ink id of an opaque car part | `rtCarInk`, carMaterials.ts 519–521 |
| 0.04 … 0.21 | ink id of an inked prop | `surfaceMaterial` `RT_INK`, materials.ts 238; `garageCelMaterial`, garageLook.ts 240 |
| 0.206 … 0.228 | a cabin seen from outside (weak lines among themselves) | carMaterials.ts 1181 |
| 0.25 | sky | sky.ts 292 |
| 0.5 | flat-painted already: land beyond 900–1400 m, far woods, ghosts | terrainMaterials.ts 253; `farA` in provingPaint.ts 546; materials.ts 941; carMaterials.ts 1748 with a MIN blend (1762) |
| 0.7 | leaves | materials.ts 371 |
| 1.0 | everything else opaque | — |
| destination kept | every transparent thing | `maskPreservingBlend` (materials.ts 72–80): colour `SrcAlpha, OneMinusSrcAlpha`, alpha `Zero, One`. Car glass and lenses: premultiplied `One, OneMinusSrcAlpha`, alpha `Zero, One` (carMaterials.ts 1341–1351). Additive effects: `One, One`, alpha `Zero, One` (garageBeams.ts 17–26, sparks.ts, garageFront.ts) |

Facts that matter for V3:

- MSAA resolve **averages alpha** along edges. The ink code is written for that (frame.ts 152–176).
- The convention is hand-maintained. Three materials in the live import closure use three's stock blending and so
  **do write alpha** [code + three: `webgl/WebGLState.js` `setBlending`]: `modcar/stream.ts` 38–44 (normal
  blending), the wreck glint sprite `modcar/wrecks.ts` 348 and `scene/beacons.ts` 65 (additive: adds source alpha).
- The sky key 0.20…0.30 **overlaps** the ink bands 0.20…0.21 and 0.206…0.228: a cabin seen from outside counts as open
  sky for the shafts.
- Alpha-to-coverage cannot be switched on for a material that writes a class value in alpha (0.7 for leaves): coverage
  would be read from that value.

### 3.6 Shadow maps and their GLSL

Set-up [code, shadow.ts]:

| | Near | Far |
|---|---|---|
| Constructor (48–49) | `Cascade(size, 5.5, 60, LAYER_SHADOW_NEAR)` | `Cascade(size, 92, 320, LAYER_SHADOW_FAR)` |
| Ortho half-extent | 5.5 m | 92 m; 22 m while the eye is within 60 m of the workshop (`fixFar`, garage.ts 120, 569) |
| Light position | focus + sunDir × 60 m | focus + sunDir × 320 m |
| Near / far planes | 0.5 / 120 m | 0.5 / 640 m |
| Texel at 2048² | 5.4 mm | 9.0 cm (2.1 cm in the workshop) |
| Focus | `core.shadowFocus`: the vehicle or walker (ModGame.ts 4043); in the workshop 3 m ahead of the eye (garage.ts 708–716) | camera + horizontal forward × 55 m (core.ts 119–123) |

- `place()` (83–104) builds the light camera with a fixed up vector, then snaps the focus to whole texels in light
  space, so shadows do not shimmer under translation. The basis follows the sun every frame.
- `render()` (123–146): if `min(1, r+g+b of uSunColor) < 0.02` or `enabled` is false, `uShadowParams.x = 0` and nothing
  is drawn. Otherwise both cascades are cleared and drawn every frame with `scene.overrideMaterial = depthMat`.
- `depthMat` (50–78): double-sided, `colorWrite: false`, no log depth. Leaf cards (`aCard > 0.5`) are cut out with
  `rtLeafCover(...) < 0.5 → discard`. It handles `instanceMatrix` only: **no wind sway, no skinning, no custom vertex
  displacement**, so swaying trees cast still shadows.
- Uniforms: `uShadowMap0/1` (depth textures, set once at 79–80), `uShadowMat0/1` (bias × projection × view, render
  space → uvz), `uShadowParams = (on, near texel m, far texel m, 1 / map size)` (136).
- Who casts: `castShadows(obj, near)` (150–155) enables layer 1, plus layer 2 when `near`. Callers: worldView.ts 442
  (poles), 475 (trees, rocks), 561 (bridges), 620 (sites); provingStands, provingView, garageOutdoors, faunaView. Car
  parts: all opaque meshes in the near map, only those with a bounding radius above 0.22 m in the far map
  (modcar/materials.ts 199–213); merged car meshes in both (carMerge.ts 292–296). The garage has a dedicated
  low-poly caster mesh `S_shadow` that lives only on the shadow layers (garage.ts 238–244). **Terrain and road strips
  do not cast.**
- With real shadows on, the soft ground discs are not built at all (worldView.ts 463), so on med/high a tree beyond
  the far map has no shadow on the ground.

Sampling (shaderlib.ts 189–223, verbatim):

```glsl
float rtShadowTap(sampler2D map, vec3 uvz, float bias) {
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      float d = texture2D(map, uvz.xy + vec2(float(i), float(j)) * uShadowParams.w).r;
      s += step(uvz.z - bias, d);
    }
  }
  return s / 9.0;
}
// Broad cloud shadows sliding over the land: field-sized, crossing at the wind's pace.
float rtCloudShade(vec3 pos) {
  if (uCloudShadow.w < 0.01) return 1.0;
  vec2 w = rtWorldXZ(pos) - uSunDir.xz / max(uSunDir.y, 0.2) * 400.0 + uCloudShadow.xy;
  float c = rtNoiseAt(w, 2048.0).b * 0.7 + rtNoiseAt(w + 300.0, 512.0).a * 0.3;
  float edge = mix(0.66, 0.4, uCloudShadow.z);
  return 1.0 - uCloudShadow.w * smoothstep(edge, edge + 0.08, c);
}
// 1 = lit by the key light, 0 = in cast shadow
float rtShadowMap(vec3 pos, vec3 n) {
  if (uShadowParams.x < 0.5) return 1.0;
  if (dot(n, uSunDir) <= 0.0) return 1.0;
  vec4 c0 = uShadowMat0 * vec4(pos + n * uShadowParams.y * 2.0, 1.0);
  if (all(greaterThan(c0.xyz, vec3(0.03))) && all(lessThan(c0.xyz, vec3(0.97)))) return rtShadowTap(uShadowMap0, c0.xyz, 0.0012);
  vec4 c1 = uShadowMat1 * vec4(pos + n * uShadowParams.z * 1.6, 1.0);
  if (all(greaterThan(c1.xyz, vec3(0.0))) && all(lessThan(c1.xyz, vec3(1.0)))) {
    float s = rtShadowTap(uShadowMap1, c1.xyz, 0.0009);
    vec2 e = abs(c1.xy - 0.5) * 2.0;
    return mix(s, 1.0, smoothstep(0.8, 1.0, max(e.x, e.y)));
  }
  return 1.0;
}
float rtShadow(vec3 pos, vec3 n) {
  return rtShadowMap(pos, n) * rtCloudShade(pos);
}
```

- One cascade per fragment, 9 nearest taps, normal offset of 2 near texels or 1.6 far texels, constant bias, the far
  map fading to lit over the last 20 % of its box. Surfaces facing away from the key light return 1.
- **The cloud shadows that exist today are a drifting noise field**, unrelated to the cumulus in the sky.
- Everything outside `shaderlib.ts` that depends on the shadow layout [code, grep]:
  - `garageLook.ts` 76–84 `garageShadow1` samples `uShadowMap0/1` with `uShadowMat0/1` itself; `garageSun` (88–119)
    takes up to 4 filtered (9-tap) looks, 12 single looks and 4 more filtered looks per fragment.
  - `carMaterials.ts` 686 uses `uShadowParams.y` for a slope-scaled offset; 691 and `materials.ts` 216 use `.x` to let
    a third of the sun into a cabin when there are no maps; `materials.ts` 530 fades the ground discs with `.x`.
  - `garageBeams.ts` 144 calls `rtShadowMap` in a 14-step march per fragment; 222 per dust-mote vertex.
  - `vehicle/view.ts` 180 (classic) reads `.x` on the CPU.

### 3.7 Light: time-of-day keys, biome air, weather

1. `DayClock.state(time, sky)` (core) gives the sun and moon directions, `sunElev`, `daylight`, `night`, `afternoon`.
2. `lightAt(elevDeg, morning, out)` (style.ts 104–134) interpolates linearly between the **7 keys of
   `style.json.lightKeys`** at elevations −18°, −8°, −2.5°, 2°, 11°, 27°, 50°. Each key holds 13 colours (`sun`, `amb`,
   `bounce`, `zenith`, `mid`, `horizon`, `glow`, `fog`, `fogSun`, `cloudLit`, `cloudMid`, `cloudShade`, `cloudUnder`),
   `haze` and `exposure` (2.6 at −18°, 1.0 from 11° up). Before noon, `horizon`, `glow` and `fog` are multiplied by
   `style.json.morning`.
3. `computeLook` (colorScript.ts 47–147):
   - Key light: the sun while `smoothstep(elev, −5, −1) > 0`, scaled by it; otherwise the moon, scaled by
     `smoothstep(moonElev, −2, 8) × (1 − smoothstep(elev, −9, −5))`. **Both factors are 0 at −5°, so the key light is
     black at the moment its direction jumps from sun to moon.** `dir.y` is clamped to at least 0.02 (sun) or 0.08
     (moon).
   - Biome air `AIR` (18–26): a **hard-coded table keyed by biome id** (plains, desert, alpine, forest, lakes, maple;
     unknown ids fall back to plains) multiplying horizon and fog, zenith and mid, and haze, blended by `bt`.
   - Weather: haze × `(1 + 8·rain)(1 + 22·snow² + 5·snow)(1 + 80·dust² + 10·dust)` using the larger of what is falling
     and what is coming (`murk*`); `sunVis = (1 − 0.92·overcast)(1 − 0.85·dust)(1 − 0.7·fog)`; overcast pulls the sun
     down by up to 85 % and the sky towards grey; rain towards a dark lid; fog multiplies haze by
     `1 + 45·fog² + 6·fog`; snow whitens horizon and fog; dust turns the sky ochre.
4. `Environment.update` (environment.ts 150–236) copies the result into `globals` (`uSunDir`, `uSunColor`,
   `uSkyColor`, `uBounceColor`, `uFogColor`, `uFogSunColor`, `uFogDensity`, `uHereGround`, `uHereForest`, `uFogBase`,
   `uWeather = (wetness, snowCover, max(rain, snow, dust), night)`, `uWind`, `uCloudShadow`) and into `skyUniforms`;
   sets `core.exposure`, `core.shafts` (low sun × air content × `sunVis`, 169–175) and `core.shaftColor`; adds the
   lightning flash to `uSkyColor` (176–180).
5. After that, `DevWorld.afterEnv` multiplies exposure, shafts, fog, sun, sky and bounce by the dev dials (devWorld.ts
   193–202) and the garage multiplies `core.exposure` indoors (ModGame.ts 4098).
6. Palettes are separate from light: `showChapters` (style.ts 198–200, called from worldView.ts 164) loads the biome
   styles of the chapter behind, the current one and the two ahead into **4 slots (chapter index & 3)**. Vertices and
   instances carry slot weights baked at build time. `BIOME_STYLES` (style.ts 80) falls back to the plains style for
   any biome id missing from `style.json`, without a warning.

### 3.8 The cloud cube and its amortised update

- `layout()` (clouds.ts 129–185): clouds stand on a 5,200 m world grid, seeded, within 26 km and not within 4,000 m of
  the centre (`STYLE.md` §7 says 2.8 km). At most 20 clouds of at most 16 spheres; bases at 1,150–1,500 m.
- The fragment shader (195–346) sphere-traces the smooth union of the spheres, displaced by a 32³ tiling 3D texture of
  lumps, for up to `uSteps` steps (140 / 100 / 80), bisects 9 times on a hit, then paints with about 11 more distance
  evaluations (two tetrahedral normals, two shadow probes, one openness probe). The sphere list is a 16×20 RGBA32F
  texture "so the shader stays well inside the 224 uniform vectors" (200–202).
- Target: an RGBA16F cube. Only 5 faces are drawn (`FACES = [0, 1, 2, 4, 5]`, 369); each face in 8 horizontal strips
  by scissor (370, 450–461).
- `update()` (475–489) draws **one strip per frame, always**: a full refresh takes 40 frames. The clouds are laid out
  again only when the camera has moved more than 600 m from the last centre or the cover changed by more than 0.06,
  and only between cycles. The wind drift is applied at a re-layout, so **clouds stand still while the player stands
  still**. `drawAll()` (464–469) draws all 5 faces at once: at start, when weather is forced (`cloudsNow`), and in shot
  mode (`prepareShot`, environment.ts 87–94).
- Consumers of the cube: the sky dome (sky.ts 201), `rtSkyMirror` for water and puddles (sky.ts 70), car reflections
  (carMaterials.ts 369).
- Light changes reach the cube strip by strip, so a strip can be up to 40 frames stale.

### 3.9 The finish: paint (Kuwahara), ink, shafts — taps

All in `finalMat` (frame.ts 127–287), one fragment shader, at drawing-buffer resolution.

- `painted(uv)` (195–230): centre tap; if alpha `< 0.6` return it. One depth tap, decoded as
  `away = exp2(d * log2(far + 1)) − 1` (198–199). Radius `r = min(uPaint, 2)`; `r = 1` when `away` is outside
  16…140 m or alpha `< 0.8`. A fixed 5×5 loop skipping taps outside `r`: **25 taps at r = 2, 9 at r = 1**. Four
  overlapping quadrants; mean and variance of the Reinhard-compressed colour; each quadrant weighted by
  `1 / (1e−7 + v⁴·1e12)`; inverse Reinhard.
- `inkAt(uv)` (177–191): 9 alpha taps (centre, ±1, ±2 on both axes), spaced
  `uPaintTexel × max(1, H / 1080)`: one pixel up to 1080 lines, then a constant share of the height.
- Bloom: 1 tap. Shafts (242–251): 12 taps towards the sun's screen position, only when `uShaft.z > 0.002`.

| Pixel | Taps |
|---|---:|
| Mid-distance ground, 16–140 m, alpha ≥ 0.8 | 37 |
| Near (< 16 m), far (> 140 m), leaves | 21 |
| Sky, far land, inked cel surfaces; or paint off | 11 |
| With shafts on | +12 |

- **The brush is 2 pixels whatever the resolution.** The look gates judge it at 1280×720; at 1620 lines the same
  2 pixels is less than half that share of the picture.
- Bloom chain: 4.40 taps per full-resolution pixel in total [estimate: 1.415 down + 2.988 up].
- Grade order (252–261): vignette → exposure → curve (linear below the knee 0.62, soft shoulder 0.38) → saturation
  1.06 → sRGB → ±0.5/255 dither. `Frame.grade` and `Frame.bloom` are read every frame; **`DevWorld.beforeEnv`
  overwrites all of them every frame** (devWorld.ts 176–183).

### 3.10 Quality tiers

`QUALITY` (core.ts 30–34), chosen by `?quality=` (params.ts 75, default high), **fixed at construction**.

| | low | med | high | Consumed at |
|---|---|---|---|---|
| `pixelRatioCap` | 1 | 1.25 | 1.5 | core.ts 62, once |
| `msaa` | 0 | 2 | 4 | `Frame` constructor; also selects the cloud tier (environment.ts 82) |
| `paintRadius` | 0 (**paint off**) | 2 | 2 | every frame (core.ts 128) |
| `shadowSize` | 0 (ground discs) | 1024 | 2048 | core.ts 67; worldView.ts 463; garage beams and dust only with shadows (garage.ts 193) |
| `viewScale` | 0.6 | 0.85 | 1 | every radius in `WorldView.plan` |
| `density` | 0.4 | 0.7 | 1 | grass only when ≥ 0.6 (worldView.ts 245); precipitation counts |
| `smaa` | off | on | on | `Frame` |
| Cloud cube / steps | 384 / 80 | 512 / 100 | 1024 / 140 | `style.json.clouds` |

Adjustable at run time today: `frame.paint`, `frame.smaa`, `frame.grade`, `frame.bloom`, `shadows.enabled`,
`core.usePost` (`?post=0`). Not adjustable: MSAA samples, shadow size, pixel ratio, view scale, density.

Differences from the tiers in `docs/V3/PLAN.md`: the plan's low tier keeps the paint finish (radius 1), SMAA and two
cascades; today's low tier has none of the three. There is no "ultra". `STYLE.md` §10 says the low cloud cube is
512 and static; the code uses 384 and redraws it like the others.

### 3.11 Per-frame uniform uploads and program switches

Writers of the shared holders, once per frame [code]:

| Writer | Holders |
|---|---|
| `RenderCore.render` (core.ts 114–115) | `uOriginOffset` (origin mod 4096), `uTime` |
| `ShadowPass.render` (shadow.ts 124–136) | `uShadowMat0/1`, `uShadowParams` |
| `Environment.update` | 13 of `globals`, all 22 of `skyUniforms`, `uWaterRain`, `windscreenUniforms` |
| `Garage.light` (garage.ts 557 on) | `uRoomMin/Max/Amb`, `uRoomOpenA/U/V/L[10]`, `uRoomLampP/C[10]`, `beamUniforms`; cleared in `dispose` (791–795) |
| `ModGame` (4182–4230) | `uHeadPos`, `uHeadDir`, `uHeadColor`; `carEnvUniforms.uCarGround`, `uGrimeShow` |
| `DevWorld.afterEnv` | multiplies `uFogDensity`, `uSunColor`, `uSkyColor`, `uBounceColor` |
| `setSlotBiome` (on a new plan) | the 11 palette arrays |
| `CarLook` setters | per-car `shared` holders |

`uCabinAmb` and `uCabinLamp` are never written by ModCar (only by `viewer.ts` and the classic vehicle view).

What three does with them [three: `WebGLRenderer.js` 2590–2823, `webgl/WebGLUniforms.js`]:

- Uniforms reach the GPU **when the material changes** (`material.id !== _currentMaterialId`), when the program
  changes, or when the camera changes. Then every active uniform of the program is walked.
- Scalars, vectors and matrices are compared with a per-program cache and skipped when equal.
- **Uniform arrays are flattened and uploaded every time, with no cache** (`setValueV3fArray`, 734). The globals hold
  17 arrays: 6 for the room (60 vectors) and 11 palettes (72 vectors). A program uploads those it actually uses.
- Opaque draws are sorted by material id, so switches per pass ≈ the number of distinct materials in view. A vehicle
  has **one `CarLook` per owner** (body, each fitted part, each hinged panel; modcar/materials.ts 6–9), each with its
  own material objects, so cars are the main source of switches. Each car-material switch re-uploads the 6 room
  arrays. [Not measured.]
- Program switches follow the same order: one per distinct program among the materials in view.
- **A transparent double-sided material is drawn twice** (back faces, then front faces), and
  `material.needsUpdate = true` is set before each of the two draws [three: `WebGLRenderer.js` 2178–2190], which bumps
  the material version and sends each draw through `getProgram()` again (parameter object and cache-key string).
  It also compiles a back-side and a front-side program variant. No material in `src` sets `forceSinglePass`.
  Affected: car glass and lenses (carMaterials.ts 1311), `glassMaterial` and `windscreenMaterial`, the splash bursts
  (splash.ts 29), garage beams (garageBeams.ts 40), ghosts (carMaterials.ts 1750).
- Each `renderer.render()` call updates every world matrix first [three: `WebGLRenderer.js` 1667; `core/Object3D.js`
  `updateMatrixWorld`]. That is **3 full scene-graph walks per frame** (2 shadow passes + the scene), each recomposing
  the local matrix of every object whose `matrixAutoUpdate` is true. `WorldView.add` sets it to true on every world
  piece (worldView.ts 139).

### 3.12 How many shader programs

- Source level [code, import closure of `modcar/entry.ts`: 180 files]: **45 `new THREE.ShaderMaterial(` call sites in
  24 files**, plus three's 3 SMAA materials and a few stock materials (`MeshBasicMaterial` for the garage caster,
  ghost depth twins and beacons; one `SpriteMaterial`).
- A program is identified by vertex source, fragment source, defines and about 60 parameters (instancing, instance
  colour, vertex colours, double or flip sided, …) [three: `webgl/WebGLPrograms.js` 411–449]. Materials with the same
  source and state share one: the 6 precipitation layers are one program.
- Run time [recorded, `loop/metrics/render_*.json`, cumulative `renderer.info.programs.length`]: ModCar road 33–40;
  garage 46; classic world sets 15–28.
- The car look is roughly half of it [estimate from carMaterials.ts 1291–1304]: 7 families × (cabin, wear, mask,
  merged-vertex variants) × vertex-colour on or off, plus two side variants for each transparent family.
- Nothing is precompiled: a program compiles synchronously the first time something using it is drawn. The one
  exception is `Grime.prewarm` (grime.ts 673–691), which uses `renderer.compileAsync` on a scratch scene.

---

## 4. Extension points that exist today

| # | Extension point | Where | How it is used |
|---:|---|---|---|
| 1 | Shared uniform holders | `globals`, `skyUniforms`, `waterUniforms`, `carEnvUniforms`, `terrainClamp`, `beamUniforms` | Import and write `.value`; every material sees it. New materials spread `...globals` and paste `GLSL_COMMON` |
| 2 | Material factories with options | `surfaceMaterial(SurfaceOptions)` and the others in materials.ts | `ink`, `cabin`, `brush`, `snowCap`, `sway`, `map`, `flat`, `vertexColors`, `opacity` cover most props. `CarLookOptions.matte` makes a non-car painted thing |
| 3 | Shadow casting | `castShadows(obj, near)`; layers 1 and 2 | Opt an object in. A mesh placed only on the shadow layers is a pure caster (the garage's `S_shadow`) |
| 4 | Depth or caster proxies with their own shader | three's `material.allowOverride = false` [three: `WebGLRenderer.js` 2152] | A material so marked is **not** replaced by `scene.overrideMaterial`, so a proxy mesh can carry a depth-only shader with wind or skinning into the shadow pass. Not used yet |
| 5 | Auxiliary scene renders | `scene.overrideMaterial` + a private layer | splash.ts 324–349, cargo.ts |
| 6 | Floating origin | `core.place`, `core.onRebase(fn)`, `core.origin` | Anything positioned in world metres |
| 7 | Finish dials | `frame.grade`, `frame.bloom`, `frame.smaa`, `frame.paint`, `core.usePost`, `core.exposure`, `core.shafts` | Read every frame |
| 8 | Shadow control | `core.shadowFocus`, `shadows.fixFar(focus, reach)`, `shadows.enabled` | The garage pins the wide map over itself |
| 9 | Weather hooks | `env.tune(w)`, `env.precip.count/length`, mutable `PRECIP_DEFS`, `env.cloudsNow`, `env.strike()`, `env.shotMode` | Dev panel, screenshots |
| 10 | Sky as a mirror | `skyMirrorUniforms()` + `GLSL_SKY_MIRROR` | Water, puddles |
| 11 | Terrain height clamp | `terrainClamp` (`uClampBox`, `uClampBase`, `tClamp`) | The proving ground holds the coarse terrain under its own ground |
| 12 | Palette data | `style.json.biomes[id]`; `setSlotBiome`, `showChapters` | A new biome id needs a JSON entry; without one it silently gets the plains palette |
| 13 | Async compile | `renderer.compileAsync(scene, camera)` | Precedent in grime.ts 673–691 |
| 14 | Frame statistics | `core.stats`; `renderer.info.autoReset = false` | Reading `info.render` before and after a pass gives per-pass calls and triangles for free |
| 15 | Dev dials | `devTune.ts` `look.*` | Exposure, fog, sun, sky, bounce, bloom, vignette, curve, saturation, ink, shafts |

---

## 5. Invariants and the tests that guard them

| # | Invariant | Where | Guard |
|---:|---|---|---|
| 1 | `src/core` imports no three, DOM or game code | — | `harness/sim/core-purity.test.ts` |
| 2 | Render modules import in Node; canvas textures are blank stand-ins there | textures.ts 216–222 | `harness/sim/carmerge.test.ts` (ran: 13 passed), `modcar_grime.test.ts` |
| 3 | The light never jumps: light ≤ 0.09 /s, horizon ≤ 0.06 /s, log fog ≤ 0.12 /s; night ambient ≥ 0.03; storm light ≤ 0.4 of clear | `computeLook`, `lightAt` | `harness/sim/look.ts` + `specs/weather/look.json`; recorded 0.0175, 0.0305, 0.0892, 0.1439, 0.1827 |
| 4 | Style distance: mean ≤ 0.35, max ≤ 0.6 against R1–R4; judge mean ≥ 3.5, each item ≥ 2.5 | `STYLE.md` §11 | `harness/judge/style_compare.py`, `specs/art/style_distance.json`, `visual_judge.json`. **Set `style.json` opens `classic.html`**, 1280×720 |
| 5 | Draw-call and triangle ceilings per shot set (300 calls and 1.5 M triangles in the `sky`, `onfoot` and `driving` cards; 110 and 150 k in `vehicles`); 0 failed shots; 0 console errors | `STYLE.md` §10 | `specs/render/*.json`: **classic sets only**. No `specs/render/modcar_*.json` exists |
| 6 | Car materials: one shared material per name per car, glass out of the shadow maps, merged attributes | carMaterials.ts, carMerge.ts | `carmerge.test.ts` |
| 7 | Alpha classes and mask-preserving blending (3.5) | — | **none** |
| 8 | Materials write linear radiance; sRGB only in the finish; `outputColorSpace = LinearSRGBColorSpace` (also keeps one program variant for screen and targets) | core.ts 65, frame.ts 231–233 | none |
| 9 | Depth is `log2(1 + w) / log2(far + 1)`; frame.ts 199 decodes it; four shaders scale or rewrite it: terrainMaterials.ts 294, materials.ts 512, provingStands.ts 678, provingPaint.ts 255–262 | — | none |
| 10 | World patterns are stable under a rebase: origin snaps to 256 m, `uOriginOffset` wraps at 4096 m, texture repeats divide 4096 (`rtUV`) | core.ts 97–100, 113–114; shaderlib.ts 174–176 | none |
| 11 | The same seed gives the same sky | clouds.ts 129–141 | none |
| 12 | Shadow focus snaps to whole texels | shadow.ts 93–100 | none |
| 13 | The key light is black when it switches between sun and moon | colorScript.ts 52–63 | indirectly by 3 |
| 14 | At most 4 palettes at once; neighbouring chapters never share a slot | style.ts 136–141 | none |
| 15 | The shared holders stay shared: a cloned `ShaderMaterial` gets deep-copied uniforms and must be re-pointed | carMaterials.ts 1541–1542 does it by hand | none |
| 16 | `core.stats` covers exactly one frame | core.ts 63, 116 | the shot runner records it |

---

## 6. Risks for V3

1. **Log depth means no early-Z** [three: `ShaderChunk/logdepthbuf_fragment.glsl.js` 6; inferred from GL semantics,
   not measured]. Every fragment of every layer is shaded in full: the sky under the whole frame, terrain under
   grass, the cabin behind body panels. Denser grass and 20 tree kinds multiply this. A depth pre-pass adds vertex and
   raster work and saves **no** shading while `gl_FragDepth` is written. The plan's "depth pre-pass 0.8 ms" line only
   pays off with conventional depth.
2. **Alpha is full.** It carries the paint mask, the ink ids, the sky key and the highlight band. There is no room for
   coverage, a material class for AO, or anything else, and MRT would mean editing every fragment shader. Any new
   transparent effect made with stock blending corrupts the mask. Three already do (3.5).
3. **No registries, string-built shaders.** V3 teams all need `shaderlib.ts`, `frame.ts`, `core.ts` and `shadow.ts`.
   Two shader strings are built at module load, so run-time registration of GLSL is unsafe. A change to `GLSL_COMMON`
   reaches about 45 material sites and three pages.
4. **The look gates sit on the frozen classic game.** The plan freezes `classic.html`, yet `style.json` (7 shots) and
   all `specs/render/*.json` cards open it. Pipeline work can pass every gate while ModCar regresses, or break the
   classic page and fail gates for the wrong reason.
5. **The shadow layout is known in three files** besides `shaderlib.ts` (3.6). An atlas or more cascades breaks
   `garageLook.ts` 76–84 silently (it would sample the wrong texture) unless it is moved onto a library function
   first.
6. **Shadows through one override material** cannot follow vertex animation: skinned animals and first-person arms
   would cast in their bind pose; swaying trees already cast still shadows. `GLSL_VERTEX_MAIN` and `depthMat` have no
   skinning, morph or batching support at all.
7. **One global room, one global cabin.** `uRoom*` describes a single box with 10 openings and 10 lamps, owned by the
   garage, which clears it on dispose. Caravan interiors, tunnels and enterable buildings all want it.
   `uCabinAmb/uCabinLamp` are global too: a lamp in one cabin would light every cabin.
8. **Palettes: 4 slots, 6 styles, silent fallback.** 25 region archetypes need 25 styles (or a mapping) and 25 `AIR`
   entries. Slot reuse assumes geometry of chapter c − 2 is gone before chapter c + 2 takes its slot; with a 20 km far
   ring, shorter regions (the plan says 7–9.5 km), spur roads and tunnels this needs checking.
9. **Quality is frozen at construction** and the cloud tier is tied to MSAA. Dynamic resolution, a governor and an
   "ultra" tier need a different shape. Today's low tier drops the paint finish, which the plan forbids.
10. **The brush and the ink are defined in pixels.** Any change of internal resolution changes the look unless the
    brush is defined in output pixels (7.2 F7). The gates only see 720p.
11. **Extending shadows to 400 m is a look change**, not only a quality gain: today nothing between about 150 m and
    400 m has a cast shadow, and far ranges are deliberately lit from the side regardless of the sun
    (terrainMaterials.ts 62–72). A physically right terrain shadow can contradict that.
12. **Software-rendered gates get slower** with every cascade and full-screen pass; the runner already allows a minute
    per heavy frame (run.mjs). Extensions the plan relies on (`EXT_disjoint_timer_query_webgl2`,
    `KHR_parallel_shader_compile`, `EXT_clip_control`) may be absent there, so every feature needs a fallback path
    that the gates exercise.
13. **Uniform budget.** WebGL2 guarantees only 224 fragment uniform vectors. A program using the palettes (72), the
    room (60) and 4 cascade matrices (16) plus its own is near that on the weakest devices.
14. **Synchronous read-backs inside `step`**: `Splashes.measure` runs for each vehicle within 18 m in rain whenever
    its build key changes or every 6 s (splash.ts 266, 345). More vehicles (caravans) mean more stalls.
15. **Far cascades and caches assume a steady light.** The light basis follows the sun every frame (shadow.ts 86–92),
    and the dev clock can run fast. A cached static cascade needs a quantised light direction and must be dropped
    when the key light switches.
16. **World-space textures cannot use `rtWorldXZ`**: it is world position modulo 4096 m. A terrain or cloud shadow map
    covering kilometres needs a render-space matrix updated in `onRebase`.

---

## 7. Proposed seams

### 7.1 Foundation seams: the minimal edits

Each can land with identical pixels; the check is `harness/shots/pixdiff.py` on a ModCar shot set captured before.

**A. Pass runner.** New `src/game/render/pipeline.ts`.

```ts
export type Stage = 'update' | 'shadow' | 'scene' | 'post' | 'present';
export interface FrameCtx { core: RenderCore; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  time: number; dt: number; out: { w: number; h: number }; render: { w: number; h: number; scale: number };
  targets: { scene: THREE.WebGLRenderTarget; depth: THREE.DepthTexture }; quality: QualityProfile; prof: Profiler }
export interface RenderPass { id: string; stage: Stage; order: number; budget?: { gpuMs?: number; draws?: number; tris?: number };
  enabled(ctx: FrameCtx): boolean; resize?(ctx: FrameCtx): void; run(ctx: FrameCtx): void; dispose?(): void }
export class Pipeline { add(p: RenderPass): void; remove(id: string): void; run(ctx: FrameCtx): void }
```

Edits: core.ts 111–130 (`render` builds the context and calls `pipeline.run`; the shadow call at 117–124 becomes a
built-in pass); frame.ts 322–374 split into `drawScene()` (326–329), `drawBloom()` (331–347), `drawFinish()`
(349–373), registered as built-in passes in today's order; frame.ts 52 `depth` becomes public. The cloud strip
(environment.ts 219–224) and V3's amortised updates register in stage `update`.

**B. Finish slots.** frame.ts 127–287: build the fragment text from named parts (`GLSL_INK` = 158–191,
`GLSL_KUWAHARA` = 195–230, the grade) with four insertion points — after paint (after 235), before ink, after ink
(after 239), in the grade (before 256) — and `frame.addFinishStep({ id, at, uniforms, glsl })`, to be called before
the first frame. With no steps the text, and so the program, is the one of today.

**C. Globals: declarations apart from functions, and one V3 block.** shaderlib.ts.

- Split `GLSL_COMMON` into `GLSL_GLOBALS` (95–141, declarations) and `GLSL_LIB` (143–465); keep
  `GLSL_COMMON = GLSL_GLOBALS + GLSL_LIB`. Vertex shaders that declare globals by hand (materials.ts 114–116,
  274–275; precip.ts 98–113) include `GLSL_GLOBALS` instead. This is also the precondition for moving the globals into
  a uniform block later.
- Add, once, a block of reserved V3 holders with neutral defaults (strength 0 or identity), in a file owned by the
  main session (`render/globalsV3.ts`, imported by shaderlib.ts). It must be a static list, because of the
  module-load strings. Proposed names: `uShadowAtlas`, `uShadowFarMap`, `uShadowMat[4]`, `uShadowRect[4]`,
  `uShadowCasc[4]`; `tTerrainShadow`, `uTerrainShadowBox`, `uTerrainShadow`; `tCloudShadowMap`, `uCloudShadowBox`;
  `tWindField`, `uWindFieldBox`; `tInteract`, `uInteractBox` (trampled grass); `uWeather2`; `uViewport`.
  Unused samplers and uniforms are stripped by the compiler; three binds only active ones.
- `rtShadow()` (221–223) becomes `rtShadowMap(pos, n) * rtSkyOcclusion(pos)`, with
  `rtSkyOcclusion = rtCloudShade * rtTerrainShade`, both returning 1 at default strength. garageLook.ts 118 and
  garageBeams.ts 155 call `rtSkyOcclusion` instead of `rtCloudShade`.

**D. Shadow API.** shadow.ts; shaderlib.ts 189–220; garageLook.ts 76–84.

- `rtShadowTap` has no caller outside shaderlib.ts (grep), so it can change freely. Keep the signature of
  `rtShadowMap(pos, n)`. Add `rtShadowRaw(pos, n)` (one unfiltered look) and `rtShadowTexel(pos)` (metres per texel
  at a point) and make `garageShadow1` and carMaterials.ts 686 use them. After that no file but shaderlib.ts knows the
  layout.
- `castShadows(obj, near)` stays. Add `shadowCaster(obj, { near?, far?, static? })` and a third layer
  `LAYER_SHADOW_STATIC = 3`. The places that set layers by hand move to it: modcar/materials.ts 199–213, carMerge.ts
  292–296, carMaterials.ts 1675–1681, garage.ts 241–242, 307–308, 318–319, held.ts 237–238, workshop.ts 780–781 and
  1099–1100, stream.ts 50–51. World builders pass `static: true` (worldView.ts 442, 475, 561, 620).
- `ShadowPass` takes a cascade list from the quality profile; `fixFar` keeps its meaning.

**E. Alpha classes and blend helpers.** New `render/alpha.ts`: the bands of 3.5 as constants, exported both as TS
numbers and as a GLSL chunk with `rtInkId(vec3 base, float seed)`; `BLEND.over(mat)`, `BLEND.add(mat)`,
`BLEND.premult(mat)`, `BLEND.min(mat)`. Replaces the literals at materials.ts 72–80, 238, 371, 941;
terrainMaterials.ts 253; garageLook.ts 240; carMaterials.ts 519–521, 1181, 1184, 1341–1351, 1754–1764; garageBeams.ts
17–26; sky.ts 292; frame.ts 159, 167, 197, 204, 247; and the private copies in wheelDust.ts 161–167, sprayMist.ts
91–97, garageSmoke.ts 112–118, sparks.ts 57–61, garageFront.ts 370–379. Plus `assertMaskSafe(scene)` — every
transparent material has alpha factors `Zero, One` or a MIN equation — run by a harness probe. Fix the three
offenders. Reserve one new band: **0.90…0.95 = painted, no screen-space AO** (still above 0.8, so the same brush).

**F. Vertex kit and depth helpers.** shaderlib.ts 469–493; shadow.ts 54–67.

- Add three's skinning, morph and batching chunks to `GLSL_VERTEX_PARS/MAIN` and to `depthMat`, behind three's own
  defines (`USE_SKINNING`, `USE_BATCHING`, …). The chunk files exist in r187. Note the naming: three's
  `skinnormal_vertex` expects `objectNormal`; this code calls it `objNormal`. [Sketch; not compiled here.]
- `rtDepthPull(k)` replaces the four `vFragDepth` edits (terrainMaterials.ts 294, materials.ts 512, provingStands.ts
  678, provingPaint.ts 255–262). `rtViewDepth(d)` replaces the decode at frame.ts 198–199. Then one file knows how
  depth is stored.

**G. Quality profile.** core.ts 14–34, 59–73, 128; environment.ts 81–83; frame.ts 65–80, 298–314. `QualitySettings`
becomes an open, namespaced record (`shadow.cascades`, `ao.mode`, `grass.density`, `scale.min`, …) with a named tier
as the preset; `core.setQuality(patch)`, `core.onQualityChange(fn)`; a separate `core.renderScale`. The cloud tier
gets its own key. `Frame.fit(w, h)` becomes `fit(outW, outH, scale)`.

**H. Grade stack; region air and palette registries.** frame.ts 34–41, 349–358; devWorld.ts 176–183; colorScript.ts
18–26, 67–75; style.ts 80; environment.ts 152, 162–166. `Frame.grade` becomes the product of layers (style base ×
region × dev). DevWorld writes the dev layer as ratios to the style values. `AIR` and `BIOME_STYLES` become
registries filled from region data; a missing id is a load-time error, not a silent plains.

**I. Weather drawing registries.** precip.ts 11, 30–45, 168–186; environment.ts 55, 238–252.
`Precipitation.register(kind, def, headroom)`; the amounts become a map filled by registered sources. New sky layers
(cirrus, anvils) plug into the sky shader through the same slot mechanism as B.

**J. Room and cabin ownership.** shaderlib.ts 64–81; garage.ts 557 on, 791–795. `RoomLight.claim(owner, priority)`
returns the writer of `uRoom*`; the claimant nearest the camera wins; release restores "no room". Cabin lamp and
ambient move into `CarLook.shared` (carMaterials.ts 1232–1260).

**K. Profiler and counters.** New `render/profiler.ts`; hooks in the pass runner (A), `core.stats` (core.ts 132–135),
`ModGame.telemetry` (4604–4613), the HUD line (4528–4531). CPU ms per pass always; GPU ms per pass through
`EXT_disjoint_timer_query_webgl2` when present; draw calls and triangles per pass from `renderer.info.render` deltas.

**L. Shader warm-up.** New `render/warmup.ts`: `core.warm.add(material, kinds)` and `await core.warm.compile()`
behind the loading card (entry.ts 737–748), built on `renderer.compileAsync` [three: `WebGLRenderer.js` 1519], the
pattern of grime.ts 673–691.

**M. Order and layer tables.** New `render/order.ts`: named `renderOrder` constants (3.2) and layer numbers.
ModGame.ts 1954 reads the constant.

### 7.2 Where each V3 rendering feature goes

All ten are designed to be invisible at their default settings.

**F1. Three to four stable cascades to 400 m, amortised far updates, cached static casters.**
- Layout at high (the plan: 4 cascades to 400 m): C0 5.5 m (today's near), C1 about 28 m centred 18 m ahead, C2 92 m
  centred 55 m ahead (today's far; `fixFar` pins this one), C3 400 m. At 2048² the texels are 5.4 mm, 2.7 cm, 9 cm,
  39 cm.
- Storage: C0–C2 as tiles of one depth atlas (one sampler, one target, a viewport per cascade); C3 as a pair of
  targets swapped by re-pointing the uniform. Two samplers, as today. Give the targets a one-channel colour texture:
  today each 2048² map carries an unused RGBA8.
- Updates: C0 and C1 every frame; C2 every second frame; **C3 static casters only**, its centre snapped to a coarse
  grid (64 m) with a guard band, redrawn into the back target over several frames when the centre steps or the
  quantised light direction moves, then swapped. At 39 cm a texel, moving things do not register, so C3 needs no
  per-frame copy.
- Stability: keep the texel snap; quantise the light direction for C2 and C3 (about 0.1°–0.25°); drop the caches when
  the key light switches.
- Sampling: hardware comparison (`texture.compareFunction`, supported for depth textures in r187 [three:
  `webgl/WebGLTextures.js` 747–750]), 4 filtered looks in the first cascade that contains the point, blending into
  the next over the last 10 %. Replaces shaderlib.ts 189–220 only.
- Vertex animation: caster proxies with `allowOverride = false` (section 4, point 4).
- CPU: set `scene.matrixWorldAutoUpdate = false` around the cascade renders and update matrices once per frame.
- Look risk: risk 11. Start with a low strength for C3 and let the judges decide.

**F2. Heightfield terrain shadow.** New `render/terrainShadow.ts`, stage `update`.
- Capture: a top-down orthographic render of the terrain leaves on their own layer, with an override material that
  writes world height into a one-channel float target (512² over about 12.8 km, 25 m a texel), re-centred in 400 m
  steps. One line in worldView.ts 455–456 enables the layer.
- Sweep: one full-screen pass marches each texel towards the sun (about 48 steps, growing stride) and stores the
  height of the shadow surface. Sliced into 8 strips like the cloud cube; rerun when the sun has moved about 0.25° or
  after a re-centre; cross-fade old and new.
- Sample: `rtTerrainShade(pos)` = one filtered look and a `smoothstep` on `pos.y − shadowHeight`, addressed by a
  render-space box kept current in `onRebase`. Everything that calls `rtShadow` gets it.
- Fade it out where the painter's side light takes over (beyond 1.2–4.5 km).

**F3. Cloud shadows from the real cumulus.** clouds.ts.
- `Clouds.relayout` (418–439) already holds the spheres. Add a small top-down map (256², one channel) whose pass sums
  the chord of each sun ray through the spheres. Redraw it when the layout changes; keep the previous one for a
  cross-fade.
- Replace only the **body** of `rtCloudShade` (200–206). `uCloudShadow.z/.w` keep their meaning
  (environment.ts 227–231).
- Needed first: the layout must follow the wind continuously. Today it moves only at a re-layout (3.8), so ground
  shadows would jump. Re-laying out at the start of every 40-frame cycle costs a 11×11 hash-grid walk and shifts
  clouds 4–26 km away by a fraction of a pixel per cycle.

**F4. Half-resolution ambient occlusion tinted with sky light.**
- Inputs: a half-resolution linear-depth target built from `Frame.depth` (4 fetches a pixel). No normal buffer
  exists; reconstruct normals from depth.
- AO: about 8 depth looks in a metre-sized radius with a fixed rotation from `tNoise` (no temporal jitter: there is no
  history buffer), into one channel; two 5-tap depth-aware blurs.
- Apply through a finish step "after paint": a 4-look depth-aware upsample, then
  `c *= mix(vec3(1.0), mix(uAoTint, vec3(1.0), ao), uAo * cls)`, with `uAoTint` the hue of `uSkyColor` set by
  `Environment`, and `cls` from the alpha class: only alpha ≥ 0.6, not the 0.90–0.95 band. Sky, far land and inked cel
  things are skipped by class (cars and the garage carry baked AO).
- Applying it after the brush leaves the Kuwahara input untouched: with `uAo = 0` the frame is bit-identical. If
  half-resolution blotches show on fine detail, the alternative is a composite target before the brush (one more
  full-resolution pass and 8 bytes a pixel).

**F5. Depth pre-pass for alpha-tested foliage with alpha-to-coverage.**
- No separate pass is needed: a **depth twin** of each foliage batch in the same scene render — same geometry and
  instance buffers, `colorWrite: false`, `alphaToCoverage: true`, coverage in alpha, `renderOrder` just before the
  colour mesh — then the colour mesh with `depthFunc: EqualDepth`, `depthWrite: false`, no `discard`, alpha 0.7. The
  ghosts already use a depth twin (carMaterials.ts 1792–1798). This is the only way to reconcile coverage with the
  alpha classes.
- Edits: a `depthOnly` variant of `foliageMaterial` (materials.ts 263–374); worldView.ts 465–479 creates the twin.
- Under log depth both programs write `gl_FragDepth`; they must compute it identically. Use `invariant gl_Position`
  and the same sway code, with `LessEqualDepth` plus a small pull as fallback. [Driver behaviour not verified.]
- What it buys: under log depth, cleaner leaf edges at 4× and 2× MSAA and nothing else; with conventional depth, also
  the shading of hidden leaf layers. On the low tier (no MSAA) keep the alpha test.

**F6. Half-resolution buffers for fog, shafts and particles.**
- A half-resolution "air" target (RGBA16F, premultiplied): soft particles registered with `core.air.add(mesh)`, drawn
  by the main camera and faded against the half-resolution depth; the screen-space shafts moved out of the finish
  shader (frame.ts 242–251); the plan's ground fog and beams marched here against C2/C3.
- Composite as a finish step after paint and AO, before ink: `c = c * (1.0 − air.a) + air.rgb`, with a nearest-depth
  upsample.
- Candidates to move, each on its own: the dust precipitation layer (up to 7,200 quads of 0.75 m × 6 m), wheel dust,
  garage smoke, spray mist. Rain, snow, hail, leaves, gust lines and splashes stay in the scene: they are thin and are
  meant to go under the brush.
- Look note: what moves stops being brushed. For soft blobs that is small; check with pixdiff on the weather and
  garage sets.

**F7. Dynamic resolution with a spatial upscale before the ink and the UI.**
- Keep the canvas at native size. Render `rtScene`, bloom, depth, AO and air at `scale × output`. Use a few fixed
  rungs (1, 0.85, 0.72, 0.6, 0.5) with hysteresis and `rtScene.setSize` on a rung change (the path `fit()` uses
  today). Do not drive it with `setPixelRatio`. Pin scale 1 in shot mode.
- At scale 1: one finish pass, as today. Below 1: the brush at render resolution into an HDR target, then an output
  pass at native resolution: upscale (5-tap Catmull-Rom or bilinear plus an adaptive sharpen), AO, air, bloom, ink,
  lit outline, grade, sRGB, dither; then SMAA. The UI is DOM and always native.
- **Keep the brush constant on screen**: space the Kuwahara taps one *output* pixel apart (`uPaintTexel` stays
  `1 / output size`) and sample the smaller target bilinearly. The 5×5 footprint stays 5×5 output pixels and the cost
  falls with scale². The same for the ink spacing: `max(output texel, render texel)`.
- The ink ids come from a smaller target below scale 1, so lines are up to `1 / scale` pixels wide. A floor of about
  0.7 on med keeps them under 1.5 px; SMAA softens the steps. Bound the change with a pixdiff gate of its own.
- The governor reads GPU time from K when there is a timer, otherwise the frame interval.
- The plan's "med: radius 2, half resolution" changes the brush on screen unless it is expressed as above.

**F8. GPU timer queries per pass.** In K: `TIME_ELAPSED_EXT` queries around each pass run by the pass runner — each
cascade, the cloud strip, the scene, bloom, finish, SMAA. Read results one to three frames later; discard on
`GPU_DISJOINT_EXT`. One query at a time: passes do not nest. Where the extension is missing (the software-rendered
gates included), report CPU submit time and the calls and triangles per pass, and write "not measured" for GPU time.

**F9. Shader pre-compilation.** In L: a hidden scene with one tiny proxy per (material × object kind: mesh,
instanced, instanced with colour, skinned, points), compiled with `compileAsync`, which uses
`KHR_parallel_shader_compile` when present. It must also cover the shadow depth material's variants, and the back and
front variants of transparent double-sided materials — or remove those with `forceSinglePass = true`. Streaming
systems ask for warm-up before first showing a new material.

**F10. Per-region colour grade.** In H: region data → `GradeStack` layer `region`, blended with the same `(ba, bb, bt)`
that `Environment.update` already receives (environment.ts 101). Two neutral-by-default uniforms `uGradeLift` and
`uGradeGain` in the grade slot, after exposure and before the curve (frame.ts 254–257). Region air goes through the
`AIR` registry.

### 7.3 Order to do it safely

1. Move the gates: add ModCar style and budget shot sets (`page: modcar.html`) and spec cards; capture baseline
   pictures. Until then nothing guards ModCar's look.
2. Land E, M, K, C (split only), D (helpers only), A, B, G (types only): pixdiff must show no change.
3. Decide depth (open question 1) with a flagged experiment on real hardware.
4. F1 with today's two-cascade numbers through the new code path (near-zero diff), then add C1 and C3.
5. F3, F2, F4, F6, F10 each behind a strength that defaults to 0.
6. F7 last: it touches every post target.

---

## 8. Performance notes

### 8.1 What the code implies today

- **Overdraw is paid in full** (risk 1). The sky dome is drawn first over the whole frame with depth test off
  (core.ts 70, sky.ts 86–88). Drawing it last among the opaque things with the depth test on would shade only visible
  sky, and since its shader does not write `gl_FragDepth` it can be rejected early. [Idea; not tested.]
- **Shadow looks per lit fragment: 9**, plus 2 noise looks for cloud shade. Grass takes them per fragment
  (materials.ts 786) under its own overdraw; one look per tuft root in the vertex shader would look almost the same.
  The garage floor takes up to 84 (garageLook.ts 85–119); each beam fragment 14 × 9 = 126 (garageBeams.ts 128–145).
- **Rough texture looks per fragment** [estimate, counted in the source]: terrain 22–29; paved road about 45–55; leaf
  13; grass 12 in the fragment and 6 in the vertex shader; a site wall 14.
- **Finish: 11–37 looks a pixel** (3.9); bloom 4.4; SMAA three more full-resolution passes with two RGBA16F targets.
- **Three scene-graph walks a frame** with matrices recomposed (3.11).
- **Double draws** of transparent double-sided materials, each through `getProgram()` (3.11). Single-layer glass and
  the beams would look the same with `forceSinglePass`.
- **Uniform arrays re-uploaded on every material switch**; cars switch materials most (3.11).
- **Draw calls**: one `InstancedMesh` per plant kind per 128 m scatter tile inside a 780 m radius (worldView.ts
  228–241, 465–479), up to 11 kinds (worldBuild.ts 333–345); one mesh per terrain leaf, road strip, grass tile.
  Nothing is merged across tiles.
- **The cloud strip is the dearest shader per pixel** (up to 140 steps, each a loop over 20 clouds), spent on 1/40 of
  the cube per frame, whether or not anything changed.
- **Per-frame allocations** [code]: frame.ts 324 (`new Vector2`), 365 (`clone`); shadow.ts 139 (array); core.ts 113
  (closure); style.ts 129–131 (three `Color`s every frame before noon); colorScript.ts 106–107, 131, 136, 141, 145
  (arrays, in rain and dust); precip.ts 194 (`Object.keys`); splash.ts 228 (array), 248 (closure per burst);
  ModGame.ts 3922 (`Vector3`), 4116–4139 (array, objects and closures for the splashes).
- **Recorded** [loop/metrics, 2026-11-15/16, SwiftShader, 1280×720, quality high]: ModCar road 260–388 calls,
  849,538–1,325,665 triangles; garage 238–566 calls, 1,105,087–1,539,514 triangles; classic world, style, weather,
  sky, land and water sets 155–289 calls, 0.27–1.23 M triangles. Counts include both shadow passes and the 13 post
  draws. `docs/V3/PLAN.md` reports 420–510 calls from this round's shots. `docs/MODCAR_REPORT.md` 107 states "about
  470 draws in the garage, about 5 ms a frame on the GPU" (hardware not named).

### 8.2 Per-pass cost model, today

P = W × H drawing-buffer pixels; S = MSAA samples; N = cube face size.

| Pass | Pixels or texels per frame | Work per pixel | Draws |
|---|---|---|---:|
| Cloud strip | N²/8: 131 k high, 33 k med, 18 k low | ≤ 140 / 100 / 80 march steps × (≤ 20 sphere rejects; per overlapped cloud ≤ 16 fetches and 1–3 3D looks); on a hit +9 bisections and about 11 more evaluations | 1 |
| Shadow near | size²: 4.2 M high | depth only; a leaf look on cards | casters within an 11 m box |
| Shadow far | size² | same | casters within a 184 m box |
| Scene | P × S samples of RGBA16F + D24 | every covered fragment in full (no early-Z): 9 shadow + 2 cloud looks + the material's | everything on layer 0 |
| Resolve | P × S read, P written, colour and depth | blit | — |
| Bloom | 0.33 P written | 4.4 looks per P in total | 9 |
| Finish | P | 11 / 21 / 37 looks (+12 with shafts) | 1 |
| SMAA | 3 × P | edges about 5–7 looks; weights only on edge pixels; blend about 5 | 3 |

At 1920×1080, high [estimate]: scene 8.3 M samples; bloom 9.1 M looks; finish 23–77 M looks; shadows 8.4 M texels
cleared and filled.

### 8.3 Per-pass cost model, with the V3 additions

s = render scale; P = s² × output pixels P₀. Design estimates to be replaced by measurements.

| Pass | Size | How often | Work | Draws |
|---|---|---|---|---:|
| Cloud strip | as today | every frame | as today | 1 |
| Cloud shadow map | 256², 8 strips | per cloud cycle | 8.2 k texels a strip × ≤ 320 sphere tests | 1 |
| Terrain height capture | 512², one float channel | per 400 m step | terrain leaves | ≤ about 100 |
| Terrain shadow sweep | 512², 8 strips | per 0.25° of sun or re-centre | 32.8 k texels a strip × 48 looks | 1 |
| Shadow C0, C1 | 2048² each | every frame | as near and far today | casters |
| Shadow C2 | 2048² | every 2nd frame | as far today | casters / 2 |
| Shadow C3 | 2048², double | per 64 m step, sliced | static casters within 800 m | sliced |
| Foliage depth twins | in the scene | every frame | leaf vertices twice; 1 look a fragment | +1 per foliage batch |
| Scene | P × S | every frame | per lit fragment 4 filtered shadow looks + 1 terrain + 1–2 cloud + material | as today plus content |
| Depth, half | P/4 | every frame | 4 fetches | 1 |
| AO | P/4 | every frame | 9 + 5 + 5 looks | 3 |
| Air | P/4 | every frame | particle overdraw at a quarter of the pixels; 12 shaft looks; fog march | n |
| Bloom | 0.33 P | every frame | 4.4 looks per P | 9 |
| Brush (only when s < 1) | P | every frame | 11–27 looks + 1 | 1 |
| Output | P₀ | every frame | s = 1: today's 11–37 + 4 (AO) + 4 (air). s < 1: 5 (upscale) + 9 (ink) + 1 + 8 | 1 |
| SMAA | 3 × P₀ | every frame | as today | 3 |

At 1080p, s = 1 [estimate]: AO adds about 9.9 M looks at quarter size plus 8.3 M in the output pass; the terrain
shadow costs 1.6 M looks a frame during the 8 frames of an update. At s = 0.7 the scene falls to 4.1 M samples and
the brush to 1.02 M pixels.

Against the plan's budget table: the counts above are consistent with its split, but **no millisecond figure in the
plan can be confirmed from this analysis**; and its depth pre-pass line presumes early-Z (risk 1).

### 8.4 Memory

[estimate, 1920×1080, high, pixel ratio 1] `rtScene` about 124 MB (RGBA16F ×4 samples 66 MB, depth ×4 33 MB, resolve
colour 17 MB, depth texture 8 MB); bloom 11 MB; `rtFinal` 8 MB; SMAA 33 MB; two shadow maps 34 MB, of which 17 MB is
the unused colour; cloud cube 50 MB. About 260 MB before any geometry or texture. At 2880×1620 (pixel ratio 1.5) the
screen-sized targets alone come to about 400 MB.

---

## 9. Open questions

1. **Depth.** Keep log depth, or request `reversedDepthBuffer` together with `logarithmicDepthBuffer`? r187 then uses
   reversed-Z where `EXT_clip_control` exists and log depth elsewhere [three: `webgl/WebGLCapabilities.js` 95–106].
   Touch points: 32-bit float depth textures, the four depth edits and the decode (seam F), the shadow comparison
   direction and bias matrix (shadow.ts 35; shaderlib.ts 194), two shader paths to keep alive. Availability on the
   target browsers and in SwiftShader is not verified. Nobody has measured how much early-Z is worth here.
2. Are `EXT_disjoint_timer_query_webgl2` and `KHR_parallel_shader_compile` present on the target browsers and in the
   gate environment? Not checked.
3. Does `EqualDepth` hold between a depth twin and its colour mesh under `gl_FragDepth` on real drivers (F5)?
4. Can a three r187 render target have no colour attachment, or a depth array attachment, in the WebGL backend? Not
   checked; the proposals avoid both.
5. Is `classic.html` to stay runnable through the shared pipeline for the life of V3? The gates depend on it today.
6. What is the reference for the brush: 2 pixels at 720p (what the judges see), or 2 pixels at native resolution (what
   players see)?
7. Should anything between 150 m and 400 m cast a shadow, in the art director's view (risk 11)?
8. Region lengths and visibility against the 4 palette slots (risk 8): how long is the shortest V3 region, and can a
   spur road or a tunnel show a chapter whose slot was reused?
9. Which is authoritative where the spec and the code disagree: no clouds within 2.8 km (`STYLE.md` §7) or 4,000 m
   (clouds.ts 145); low cloud cube 512 and static (`STYLE.md` §10) or 384 and animated; the unread `style.json` fields
   listed in section 2?
10. Is the overlap of the sky key with the ink bands (3.5), and the three stock-blended materials that write alpha,
    known and accepted, or bugs?
11. How many material switches does a vehicle with one `CarLook` per owner cost per frame? Not measured.
12. Are the committed metrics (2026-11-15/16) still right at HEAD? They predate places, wrecks and the proving ground;
    the plan's 420–510 calls suggests not.
13. Maximum MSAA samples for RGBA16F on low-end GPUs; three clamps to the context maximum, not per format. Not
    checked.
14. Geometry uploads have no public "initialise now" call in three; a budgeted warm-up draw is the likely route for
    worker-built meshes. Not tried.
