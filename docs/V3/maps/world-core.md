# Map: deterministic world generation (pure core)

Area: `src/core/world/*`, `src/core/math/*`, `src/core/env/{weather,time}.ts`, and the gates under `harness/sim` + `specs/roadgen`.
Read at source state `e50503c` (HEAD `9042abb` differs only in `docs/`). Every number marked *measured* was taken on this machine in Node v24.22.1 (linux x64, Intel Xeon, 8 cores) with read-only probe scripts; nothing here is a browser or GPU measurement.

---

## 1. Summary

- The world is **one road plus one pure height function hung from it**. `RoadSpine` (2 m stations, x strictly increasing) is generated first; `World.shape(x, z)` then derives everything else from "the road point with the same x" and "the nearest road point". Wheels, walker, meshes, grass, sites and animals all call the same function.
- Everything along the road is laid out lazily in **1,250 m slots** (landform, water, places, quiet stretches, coast runs) by per-slot integer hashes, filled strictly in order, each slot looking only backwards. Biomes come in **chapters** of 10–18 km dealt by `ChapterPlan`.
- Determinism today: integer hashing (`hash2`, `Rng`), own `dsin`/`dcos`, arithmetic noise. **Only the spine and the chapter plan are bit-identical across JS engines by construction**; the height function, water geometry, sea profile and all site layout use `Math.sin/cos/atan2/pow/exp/hypot` and are deterministic per engine only. The browser/Node check compares the first 2,500 stations of the spine, on the legacy page only.
- **Nothing pins exact output.** All five roadgen cards are statistical ranges plus "same seed twice / another query order" checks. "Old seeds stay bit-identical" is a convention kept by code structure (first-four-chapters rule, quiet stretches from chapter index 3, separate dice streams for added things), not by a golden test.
- All gate files in this area pass today (roadgen 20, water 13, sites 18, vista 6, beats 16, sea 8, furniture 4, fauna 5 tests).
- Biggest structural constraints for V3: (1) x-monotone spine, so no true 180° hairpins, loops or side roads without a second near-field mechanism; (2) per-biome tables keyed by id with a silent `plains` fallback and a chapter pool sized by `BIOMES.length`; (3) stateful, sequential, never-freed slot layout that runs synchronously inside `shape()`; (4) a single-layer ground query (`Ground.sample(x, z)` has no height argument), so tunnels and decks need care; (5) developer dials mutate the core tables in place.

---

## 2. Key files

| Path | Lines | Role | Public API |
| --- | --- | --- | --- |
| `src/core/world/spine.ts` | 419 | Chapter plan and the road centre line | `SpineOptions {chapterScale, startBiome, start}`, `BiomeBlend {a,b,t,ia,ib}`, `SpineSample {x,y,z,phi,kappa,grade,bank}`, `ChapterPlan {starts, biomes, transition, scale; blend(s,out), biomeOf(c), chapterAt(s)}`, `RoadSpine {ds=2, seed, plan, count, xs,zs,ys,phi,kap,grd,bnk; ensure(sMax), ensureX(x), length, at(s,out), sAtX(x), project(x,z,hint,out), probe(s,out), biomeAt(s,out), hash(n)}` |
| `src/core/world/terrain.ts` | 625 | The height function and physics query | `ROAD_HALF=3.25`, `ROAD_EDGE=4.5`, `DECK_PROUD`, `PIER_JOINT_*`, `TerrainPoint`, `Plot`, `WorldOptions`, `plotWeight`, `World {spine, seed, sea, water, land, sites, furniture, wetness, snowCover, deadEnd, plots, placeOdds, secondPlace; quiet(k), shape(x,z,o,coarse?), heightAt, sample(x,z,out), surfaceOf(t), plotBare, plotGrass, static deckJoints, static create}` |
| `src/core/world/landform.ts` | 249 | Cross-section of each stretch | `LAND_SLOT=1250`, `LandKind` (5), `LandParams {tilt,wall,drop,canyon,far; farAt, set, lerp}`, `LAND_ODDS`, `LAND_SIZE`, `LandformPlan {kindOf(k), sideOf(k), at(s,out), static offset(p,lat,x,z,seed)}` |
| `src/core/world/biomes.ts` | 263 | Biome data | `BiomeDef` (26 fields), `BIOMES` (6), `FIRST_BIOMES=3`, `BIOME_INDEX`, `minRadius(kmh)`, `MIN_RADIUS_ANY=60` |
| `src/core/world/water.ts` | 596 | Lakes, rivers, bridges | `WATER_SLOT=1250`, `DECK_HALF=5.6`, `KERB_AT=5.25`, `KERB_HEIGHT=0.22`, `BridgeKind`, `Lake`, `River`, `WaterFeature`, `WaterEffect`, `WaterPlan {diceOf(k), feature(k), bridgeAt(s,out), riverLevel(x), carve(x,z,s0,T,out), mayReach, between; static riverCentre, riverHalfWidth, lakeRho}` |
| `src/core/world/sea.ts` | 310 | The sea along a chapter | `COAST_FADE=700`, `SEA_END=2400`, `FAR_COAST=2300`, `SEA_DEPTH=14`, `CoastRun`, `Coast`, `SeaEffect`, `SeaPlan {seaOf(ch), seaAt(s), coastOf(k), near(k), along(k), carve(s0,lat,T,roadY,out), open(s0,lat), between; static seaWeight, weight, shoreAt, beachAt}` |
| `src/core/world/sites.ts` | 1527 | Places, verges, pads, solids, containers | `SITE_SLOT`, `PAD_FROM=4.5`, `PAD_FALL=0.012`, `SITE_KINDS` (11), `SIGN`, `ObjectKind` (51), `BuildingSpec`, `SiteObject`, `SiteContainer`, `SiteLoose`, `SiteFuel`, `Site`, `shelfOf`, `shelfBoards`, `SitePlan {ready, ensure(k), sitesOf(k), placeOf(k), between, padWeight(s,d), padGround, bareAt(x,z), solidsNear, knock}` |
| `src/core/world/landmarks.ts` | 77 | Colossal remains | `LANDMARK_KINDS` (6), `LANDMARK_SPACING=2700`, `Landmark`, `landmarkAt(world,k,out)`, `landmarkRange` |
| `src/core/world/quiet.ts` | 29 | Quiet stretches | `QUIET_BLOCK=9`, `QUIET_FROM_CHAPTER=3`, `quietSlot(spine,seed,k)` |
| `src/core/world/beats.ts` | 118 | Reads a journey back as beats (measurement only; no game code calls it) | `BeatKind`, `Beat`, `beatsBetween(world,sMin,sMax,out?)` |
| `src/core/world/furniture.ts` | 295 | Delineators, rails, chevrons, km stones | `FURNITURE_BLOCK=256`, `RAIL_STEP=4`, `RAIL_AT=4.72`, `POST_AT=4.3`, `POST_TAG`, `RoadPost`, `RailRun`, `Furniture {between, solidsNear, knock, static outer}` |
| `src/core/world/ground.ts` | 93 | Ground query contract | `Surface` (7 ids), `SURFACES`, `GroundSample`, `Ground {sample(x,z,out)}`, `FlatGround` |
| `src/core/world/solids.ts` | 157 | Things that cannot be passed through | `Solid`, `SolidSource`, `SolidSet`, `Push`, `pushOut`, `solidWithin` |
| `src/core/world/fauna.ts` | 383 | Herds at hides and jetties; wired into the legacy game only (`src/game/game.ts:154`), not into ModGame | `SPECIES` (deer, reindeer, duck), `Threat`, `Animal`, `Herd`, `presence(hour)`, `Fauna {herdOf, update, near, awake}` |
| `src/core/math/detmath.ts` | 27 | Engine-independent trig | `dsin`, `dcos` |
| `src/core/math/noise.ts` | 109 | Arithmetic noise | `simplex2`, `fbm2`, `ridged2` (unused), `gnoise1`, `fbm1` |
| `src/core/math/rng.ts` | 69 | Integer hashing and PRNG | `hash32`, `hash2`, `hash3`, `rand2` (unused), `Rng {nextU32,next,range,int,chance,pick,weighted,fork}` (`fork` unused) |
| `src/core/math/util.ts` | 12 | | `clamp`, `saturate`, `lerp`, `smoothstep`, `sign`, `TAU`, `PI`, `HALF_PI`, `DEG` |
| `src/core/env/weather.ts` | 397 | Weather schedule | `WEATHER_KINDS` (10), `WeatherState`, `WeatherEvent`, `EVENT_WINDOW=1500`, `WeatherSystem {force, stage, state, eventInWindow, targets, step; static kindFor}` |
| `src/core/env/time.ts` | 135 | Day clock | `SUNRISE=6`, `SUNSET=19`, `SkyState`, `DayClock {dayLength=2400, maxElevation=58, setHour, advance, setDayLength, hourAt, dayAt, state; static phaseOfHour, hourOfPhase, skyAtHour}` |
| `harness/sim/roadgen.ts` (292), `water.ts` (209), `sites.ts` (166), `vista.ts` (164), `beats.ts` (125) | | Metric collectors behind the five cards in `specs/roadgen/` | `collect*Metrics()` |
| `harness/sim/spinehash.ts` | 6 | Prints `RoadSpine.hash(n)` for the browser comparison | CLI |

Consumers outside the area that define the contract (other maps own them): `src/game/scene/worldBuild.ts`, `worldView.ts`, `waterBuild.ts`, `siteBuild.ts`, `palette.ts`; `src/game/modcar/seamless.ts`, `floorGround.ts`, `devWorld.ts`, `devTune.ts`, `places.ts`, `save.ts`; `src/core/modcar/proving/layout.ts`; `src/core/onfoot/{land,walker}.ts`; `src/core/vehicle/sim.ts`; `src/core/driver/robot.ts`.

---

## 3. Lifecycle and data flow

### 3.1 Construction and lazy growth

`new World(seed, opts)` (`terrain.ts:209-227`) builds, in this order, `RoadSpine` (which builds `ChapterPlan` and generates 203 stations), `SeaPlan`, `WaterPlan`, `LandformPlan`, `SitePlan`, `Furniture`. Nothing else is computed. Every plan then grows on demand and only forwards:

| Plan | Unit | Growth | Depends on |
| --- | --- | --- | --- |
| `ChapterPlan` | chapter | in order (`extend`) | its own `Rng` |
| `RoadSpine` | 2 m station | in order (`gen`) | chapter plan, own `Rng`, `fbm1` |
| `quietSlot` | slot | pure function | hash, chapter plan |
| `SeaPlan` | chapter | memo per chapter (`Map`) | spine heights over the whole chapter |
| `WaterPlan` | slot | in order; looks back 3 slots | spine, `dry(k)` from sea and quiet |
| `LandformPlan` | slot | in order; looks back 1 slot | water dice, coast side, quiet, biome |
| `SitePlan` | slot | in order; carries counters | land, water, sea, quiet, and `World.shape` itself |
| `Furniture` | 256 m block | independent blocks, LRU of 400 | `World.shape`, `bridgeAt` |
| `landmarkAt` | index (2.7 km) | pure function | `World.shape`, quiet |

Only furniture blocks are ever discarded. Spine arrays grow by doubling.

ModCar builds its world through `modcarWorld(seed, o)` (`src/game/modcar/seamless.ts:33-37`): a first world without the proving ground to find its level, then the real one with `start {x:26, z:0, y:0}`, `deadEnd`, two `plots` (yard, proving ground), `placeOdds [0.62, 0.88, 1]`, `secondPlace 0.8`.

State that is not a function of the seed: `World.wetness` / `snowCover` (written every frame by `src/game/env/environment.ts:121-122`, read in `sample`), objects moved by `SitePlan.knock`, posts laid flat by `Furniture.knock`, and the developer dials (section 6, R7).

### 3.2 How `World.shape` composes the height

`shape(x, z, o, coarse = false)` at `terrain.ts:318-485`:

1. `s0 = spine.sAtX(x)`: the road point with the same x. Possible only because x increases along the road.
2. Not coarse: `sites.ensure(floor(s0 / 1250))` first (line 325), before any scratch is held, because laying out a slot calls `shape` again (guarded by `SitePlan.growing`).
3. `p = spine.at(s0)`; `dzl = z − p.z`; `lat = |dzl|`; first guess of the nearest point `s = s0 + dzl·sin φ`, `d = dzl·cos φ`.
4. **Near field** when `|d| < 200` (`NEAR_FIELD`, line 30): up to 7 Newton steps to the exact foot `q`, the step divided by `1 − κd` only while `|κd| < 0.7` (lines 342-353). A leftover along-track distance above 0.5 m is added into `ad`, so such a point is never taken for road.
5. Biome mix by `s0` (by x, so it is continuous everywhere). `g1 = smoothstep(7, 58, ad)` fades the near relief in.
6. `relief()` per biome (two biomes inside a transition), lines 234-278:
   - near: `nearAmp·fbm2(3 oct) + detailAmp·fbm2(2 oct)`, times `g1`, noise seed `world.seed + biomeIndex·7919`;
   - far, from `farStart` to `farEnd` in `lat`: by `farShape` 0 rounded (`fbm2` 4 oct, squared), 1 pyramids (`peakField` cells of 2,300 and 1,100 m), 2 mesas; times `farAmp`, the landform's `farK`, and `1 + 0.5·smoothstep(1500, 5500, lat)`;
   - skyline, `smoothstep(2600, 7500, lat)`: massifs (`peakField` 5,200 and 2,600 m cells, seed `world.seed + 0x3a55`, not per biome) and `giantPeaks` (16 km cells, half of them, 2,400–3,000 m high).
7. `rel += LandformPlan.offset(lp, dzl·cos φ, x, z, seed)`: hillside tilt, valley wall, ridge drop, canyon (line 384).
8. `base = q.y + (y0 − q.y)·smoothstep(18, 55, ad)` (line 401): the land follows the nearest road point close in and the same-x road point from 55 m out. `T = base + rel`.
9. Not coarse: `T = water.carve(x, z, s0, T)` (rivers first, then lake bowls and rims), filling `wl, frozen, wkind, wt, wlat`.
10. Always: `sea.carve(s0, dzl·cos φ, T, y0)`; the sea is in the far ring too.
11. Far field (`|d| ≥ 200`): `h = bed = T`, ice carries (`h = wl` on a frozen lake), plots, return.
12. Near field zones: `ad ≤ 3.25` pavement, `h = q.y + q.bank·d`, zone 1; `ad ≤ 4.5` shoulder with a 6 % fall, zone 2; beyond, `h = ext + (T − ext)·m − ditch`, where `ext` is the road plane carried sideways with a 3 % fall, `m = smoothstep(4.5, 4.5 + vergeBlend, ad)`, and the ditch is a Gaussian 2.4 m beyond the shoulder.
   - **Pads**: `pw = sites.padWeight(s, d)` (only when `ad ≤ 60` and off a bridge) takes the ditch out, eases the fall to 1.2 % and holds `m` at 0, so a place's ground is the road's level carried sideways.
   - **Bridges**: `water.bridgeAt(s)` gives a mask; `h` is the deck out to 5.6 m with a 0.22 m kerb from 5.25 m (zone 3), `bed` is the river's land under it.
13. A frozen lake carries wheels (`h = wl`). **Plots** last (`onPlots`, lines 509-522): the caller's height blended in by `plotWeight`, kept off the road bed.

`TerrainPoint` is the result contract: `h` (what one stands on), `bed` (the land to draw), `s, d, roadY, bank, phi, grade`, `ba, bb, bt` (biome indices and mix), `ca, cb` (chapter indices; the renderer keeps a palette slot per `chapter & 3`), `zone` 0–3, `relief`, `wl, frozen, wkind (1 lake, 2 river, 3 sea), wt, wlat`, `bridge`, `site, siteGround`, `plot`, `behind`.

`coarse` (far ring leaves, far woods, vista) skips site layout, the near relief, the fine term of the pyramid far field and `water.carve`.

`sample(x, z, out)` (`terrain.ts:566-620`) is the physics query: one `shape`; on the road bed an exact normal from grade and bank; off it two more `shape` calls 0.4 m away; plus two `simplex2` of roughness, bridge joints (`deckJoints`), wetness and snow grip, and the hold of open water (0.12–0.65 m deep).

**Cost** (*measured*, µs per call, best of five):

| Call | µs |
| --- | --- |
| `shape` on the pavement | 0.48 |
| `shape` on the verge (9 m), near (40 m) | 0.76, 0.74 |
| `shape` at 150 m | 1.16 |
| `shape` far: 600 m, 3 km, 9 km | 0.98, 1.33, 1.34 |
| `shape` coarse: 3 km, 9 km | 0.98, 1.03 |
| `sample` on the pavement / off road | 0.59 / 2.16 |
| `spine.at` / `spine.sAtX` | 0.024 / 0.085 |
| `water.carve` / `land.at` + `offset` / `sea.carve` with no sea | 0.070 / 0.062 / 0.015 |
| `simplex2` / `fbm2` 2, 3, 4 octaves | 0.027 / 0.053, 0.080, 0.115 |

The card's own figures today: `terrain_height_us` 0.89, `terrain_chunk_ms` 1.95 for 67 × 67 samples (limit 10).

**Who calls it per frame** (ModCar):

| Caller | Where | Volume |
| --- | --- | --- |
| Vehicle physics | `src/core/vehicle/sim.ts:1552-1554` (two `Ground.sample` per wheel per substep, 120 Hz), body points at `:828`, `:1661` | about 16 samples per frame per four-wheeled vehicle; through `FloorGround` → `SeamlessGround` → `ProvingGround` → `World.sample` |
| Walker | `src/core/onfoot/walker.ts:140-150` | a few `shape` per step |
| Streaming builders | `src/game/scene/worldView.ts:646` with a budget of 3.5 ms per frame, 45 ms behind a teleport fade (`ModGame.ts:4056-4063`) | the bulk: a terrain leaf is 35 × 35 = 1,225 calls (1.48 ms *measured*); a LOD0 strip chunk 33 rows × 23 columns plus two more per off-road vertex for the normal, about 1,815 calls; a 40 m grass tile 441; a 128 m scatter tile 257 |
| Biome and light | `ModGame.ts:4082-4083` | `spine.project` + `biomeAt` once |
| Splashes, tyre sound, dust | `ModGame.ts:2501, 4134` | a few `sample` |
| Polling of places | `worldView.plan`, `places.ts:244`, `siteThings.ts:61`, `beacons.ts:90` call `sites.between` | cheap once laid out |

### 3.3 `ChapterPlan` and the rules that keep old seeds identical

`spine.ts:58-131`. Own stream `Rng(hash2(seed, 0xb10e, 77))`.

- Chapter 0 is `startBiome` (default `plains`; an unknown id falls to index 0), length `rng.range(6000, 9000)·scale`.
- `extend()` (lines 77-89), for chapter index `c`: the pool is biome indices `0 … (c < 4 ? FIRST_BIOMES : BIOMES.length) − 1`, without the previous one, and for `c ≥ 4` also without the one before that; `next = pool[rng.int(pool.length)]`; length `rng.range(10000, 18000)·scale`. Exactly two draws per chapter.
- `transition = max(300, 900·min(1, 2·scale))` metres, centred on each border; `blend(s)` gives `a, b, t` with `t` reaching 0.5 at the border.
- *Measured* over 2,000 seeds at scale 1: chapters 0–3 never hold a biome index ≥ 3; later chapters never repeat either of the two before; lengths 10.0–18.0 km, median 13.97 km.

What "old seeds stay identical" rests on:

1. **First four chapters** (indices 0–3) draw only from the first three `BIOMES` entries, "one number, the other two in order". The order of `BIOMES[0..2]` and `FIRST_BIOMES = 3` are therefore frozen.
2. **Quiet stretches** begin at chapter index 3 (`QUIET_FROM_CHAPTER`), so chapters 0–2 have none.
3. **Added things use their own dice or only empty slots**: the waterworks only where the dice left a slot empty (`sites.ts:475`, `makeWorks`), a second place from its own `Rng(hash2(k, 0x51e2, seed))` (`:479`), the sea only in `lakes` chapters, new options defaulting to the old behaviour (`start`, `deadEnd`, `plots`, `placeOdds`, `secondPlace`).
4. `BIOMES.length` is inside the pool for `c ≥ 4` (line 85): **appending a seventh biome changes chapter 5 onward for every seed.**
5. The biome's index is part of the noise seed (`terrain.ts:235` `seed + bi·7919`; `weather.ts:141` `seed + 17 + biome·3`): reordering biomes changes the land.

The repository's history starts at a squashed public snapshot (`65fbcaa`), so identity with releases before it cannot be checked from here; today's output is the only reference.

### 3.4 The 1,250 m slot system

Slot `k` covers arc length `[1250k, 1250(k+1))`. The constant exists twice, `LAND_SLOT` (`landform.ts:25`) and `WATER_SLOT` (`water.ts:27`); `SITE_SLOT = LAND_SLOT` (`sites.ts:38`). Nothing asserts the two are equal, and the code relies on it: the landform of slot `k` asks the water dice of slot `k`.

Order of decisions for a slot, wired in the `World` constructor (`terrain.ts:216-226`):

1. `quiet(k)`: two neighbouring slots in every block of nine, never the first of a block nor across its edge, and only where the pair starts in chapter index ≥ 3.
2. `sea.coastOf(k)`, `near(k)`, `along(k)`.
3. `water.diceOf(k)`: dry when `k < 1`; `dry(k)` is 2 (no lake, no river) beside a coast run or in a quiet slot, 1 (no river) along a sea; otherwise one hash against the biome's `river` and `lake` odds at the slot's middle.
4. `land.kindOf(k)`: `open` for slot 0 and for a river slot; a quiet slot keeps the previous kind and side; otherwise a 45 % chance to run on, else the biome's odds; a lake turns hillside, ridge or canyon into open (70 %) or valley; a coast slot is a hillside climbing away from the sea. Parameters blend over 210 m either side of a border (`BLEND`).
5. `water.feature(k)`: geometry, which may fail to fit and leave the slot dry.
6. `sites`: one place at most (two with `secondPlace`), an optional waterworks, then verge wrecks and crates.

Margins inside a slot: places within `[k·1250 + 150, (k+1)·1250 − 150]`; rivers cross between 0.38 and 0.62 of the slot; lakes take the flattest of five positions; verge things within 30 m of the ends. Slot 0 is special (no water, `open`, no place, a crate heap 260–420 m from the start); slot 1 always tries a camp. Negative slots (behind a dead end) hold nothing.

Not on the slot grid: chapters (borders anywhere), landmarks (2,700 m), furniture (256 m blocks), weather (1,500 s windows).

### 3.5 How the road profile is generated

`RoadSpine.gen()` (`spine.ts:233-278`), one station per 2 m, own stream `Rng(hash2(seed, 0x50ad, 13))`, grade noise seed `hash2(seed, 0x6ade, 5)`. Road style values are the biome's, mixed across a transition (`style()`, lines 199-204).

**Plan.** The first 160 m are straight. `pickSegment` (lines 206-231): after a curve, a straight with probability `straightChance`, length `straightMin…straightMax`; otherwise a curve of radius `rMin·(1 + (radiusSpread − 1)·u·√u)`, turning `turnMin…turnMax` degrees, its direction biased back towards +x (`pRight = 0.5 − 0.5·clamp(φ/40°)`), the turn cut to the room left before ±44°, flipped when under 8° of room is left.

**Curvature.** `rMin = max(MIN_RADIUS_ANY, mix(minRadius(a), minRadius(b), t))` (line 240), `minRadius(V) = V² / (127·(0.06 + 0.2 − 0.00075·V))`. The target is clamped to `±1/rMin` and slews at `1/(rMin·55)` per metre, which gives 55 m clothoid-like transitions. Heading guard (lines 259-262): if the heading after unwinding, `φ + κ|κ| / (2·kRate)`, would pass ±49°, the target becomes a counter-curve of `1.3·rMin`. Position by the midpoint rule with `dcos` / `dsin`. Bank `= −clamp(0.45·V²κ/g, ±0.07)`.

**Grade.** Target `gradeAmp·1.6·fbm1(s / gradeLen, 2 oct)`, less a pull to the biome's base elevation `clamp((y − lift − baseElev)/2500, ±0.035)`, clamped to the biome's `gradeMax`; the grade slews at 0.00065 per metre; then the global clamp **±0.08** (line 275).

*Measured* today:

| Biome | Design km/h | Tightest radius (m) | `gradeMax` |
| --- | --- | --- | --- |
| plains | 70 | 185.9 | 6 % |
| desert | 85 | 289.9 | 4 % |
| alpine | 45 | 70.5 | 8 % |
| forest, maple | 60 | 131.8 | 6.5 %, 7 % |
| lakes | 65 | 157.5 | 4.5 % |

- Over 150 seeds × 30 km: largest heading 51.35° (limit 55), smallest radius 70.48 m, smallest forward cosine 0.6246 (limit 0.5), steepest grade exactly 8 %, bank up to 7 %, 43.7 % of stations straight. Over 200 km the road covers 0.916 of its length in x.
- **The 60 m floor never binds with shipped data**: the tightest biome gives 70.5 m. It binds only when a developer dial drops `designKmh` below about 42 km/h (`devTune.ts`, range 25–140).
- Grade over 12 seeds × 300 km: 98.1 % of the length is at or under 6 %, 1.5 % between 6 and 8 %, 0.4 % at the clamp. Alpine alone: 91 % at or under 6 %. Runs above 7 %: 4.6 per 100 km, median 174 m, longest 504 m. Curves under 120 m radius exist only in alpine (13 % of its length).

**What relies on the minimum radius and the heading guard:**

| Reliance | Where | Why |
| --- | --- | --- |
| `sAtX` and everything indexed by x | `spine.ts:328-352`; biome mix, landform, far field, rivers, sea | needs heading within ±90°, guarded at ±49° |
| Nearest-point solve | `terrain.ts:342-353`, `spine.ts:367-376` | corrected step only inside `|κd| < 0.7`; one foot assumed |
| Lateral bands that use the nearest foot | base blend to 55 m (`:401`), pads and bridge mask to 60 m (`:437`, `:454`), verge to 4.5 + 18…30 m | 60 m keeps the centre of curvature outside them |
| Road strip mesh | `src/game/scene/worldBuild.ts:27-36`: columns out to ±40 m and a skirt at 44 m, laid along the normal | on the inside of a curve a column at offset `d` folds when `d ≥ R` |
| Site fit | `sites.ts:661` | bend ≤ 0.004 (250 m) for a forecourt, ≤ 0.006 (167 m) for a lay-by; grade ≤ 5.5 % |
| River crossing | `water.ts:346` | only where `κ < 0.0035` (286 m) |
| Furniture | `furniture.ts:118, 195, 211` | rail outside bends under 130 m, chevrons under 105 m, posts every 25 m under 400 m |
| Robot driver | `src/core/driver/robot.ts:106-123` | corner speed `√(latG·g·R)`; the gates want zero accidents |
| Poles and wires | `worldBuild.ts` (`POLE_EVERY` 48 m, offset −8.6 m) | a 48 m chord's sagitta is 4.2 m at 70 m radius and 12 m at 30 m |
| Gates | `spine_min_radius_m ≥ 60`, `spine_curvature_violations` (`κ·rMin ≤ 1.25`), `spine_max_heading_deg ≤ 55`, `spine_min_forward_cos ≥ 0.5`, `terrain_projection_errors = 0` | `harness/sim/roadgen.ts:45-47, 110-112` |

### 3.6 How sites, lakes, rivers, bridges, the sea and landmarks are planned

**Lakes** (`water.ts:250-335`). One rotated ellipse beside the road: near lakes `a` 110–365 m and gap 15–41 m; one in four is a far lake, `a` 260–365 m, gap 190–520 m. Placed at the flattest of five positions. Every road point within `2a + 500` m must stay 16 m outside the bowl, or the lake is pushed out (five tries) and then shrunk (×0.68, three sizes). The level hangs 2.6–13 m below the lowest road point near the bowl. It must not touch a lake or river of the three slots before. The shoreline is `lakeRho < 0.894`; bays come from noise that only ever draws the shore in. The basin reshapes land out to 1.72 × the ellipse. Frozen by biome.

**Rivers and bridges** (`water.ts:337-404`). A curve across the world's x axis: square to the road under the bridge (skew ±0.21 rad, slope clamped to ±0.7), meandering further out, ending 2.4–3.4 km to either side. The crossing is the cheapest station (low, straight, level) that clears the lakes. **Water level = road elevation at the same x minus a fixed `clear`** (5–8 m by biome), so the channel always cuts into the land and two rivers meet level. Bridge kind by span: under 50 m arch, under 72 m beam, else truss. `bridgeAt(s)` looks only at the feature of the slot `s` is in.

**Sea** (`sea.ts:78-155`). Only chapters whose biome id is `lakes`, 85 % of them, on one side. One or two coast runs of 2–4 whole slots where the road rises and falls least, never before slot 3, at least two slots apart. One level per sea, 5.5–9.5 m below the first run's lowest road point. Elsewhere the coast lies about 2.3 km off, swinging to the horizon over the last 2.4 km at each end of the chapter. No river along a sea, no lake beside a run. Runs force a hillside away from the water and keep the strip between road and water open (`open()`).

**Places** (`sites.ts:453-707`). Per slot `Rng(hash2(k, 0x51e0, seed))` and running counters `sincePlace`, `sinceStation`, `lastKind`, `stations`.
- A filling station is forced when 18 slots have passed without one, or by slot 5 if there is none yet; a lighthouse in the middle slot of every coast run; slot 1 a camp; a jetty at 42 % of lakes whose shore is within 60 m; otherwise odds `[0.2, 0.45, 0.8]` by slots since the last place, then a weighted pick of seven kinds with rules (no two stations within eight slots, a lookout only on a ridge or hillside, no kind twice running). A quiet slot holds nothing unless a station is due. A canyon holds at most a lay-by.
- `fit()` tries twelve positions: bend and grade limits, no bridge within `L + 45` m, dry ground, cut or fill at the pad's outer edge at most 5 m (7.5 m towards water), water within 75 m (lake) or 170 m (sea) when the kind needs it. The best cost wins, with some chance in it. A smaller pad is tried next, then a plain camp.
- The site is registered in `places[k]` **before** it is furnished, so heights asked while furnishing are pad heights.
- `furnish()` (`:874-1140`) is one switch over the kind; `finish()` (`:1418-1526`) one switch over the object kind that makes the solids.
- Ids are stable and saved by the game: `site{k}p`, `site{k}q` (second place), `site{k}v{n}` (verge), containers `{site}/c{i}` with seed `hash2(site.seed, i, 0xc0a7)`, loose things `/l{i}`, petrol `/f{i}`.

**Landmarks** (`landmarks.ts:47-72`). Pure per index: `s = 1500 + 2700k + 0…900`, 300–680 m to one side, the kind from a five-entry list per biome id, height from `shape`, afloat when it lands in the sea, absent in a quiet slot. No footprint in the land and no solids.

**Furniture** (`furniture.ts:121-218`). Per 256 m block from `shape` and `bridgeAt`: rails where the land drops more than 2.3 m within 13 m, by water, up to bridges, outside tight bends; never on a deck, a pad or a plot.

### 3.7 Determinism rules and the browser/Node check

Rules in force:

- No `Math.random`, `Date` or `performance` anywhere under `src/core/world`, `math`, `env`.
- Dice come from `hash2(x, y, seed)` (inputs truncated with `| 0`) or a private `Rng` (mulberry32) seeded by a hash with a salt constant. Appendix B lists every salt in use.
- Trig that decides the road goes through `dsin` / `dcos`. Noise is arithmetic plus hashing.
- "Whoever asks first" must not matter: plans fill in order and look only backwards; every collector builds a second world queried in another order.

What is actually engine-independent:

| Bit-identical by construction | Deterministic per engine only (`Math.*` in the path) |
| --- | --- |
| chapter plan; spine (all seven arrays); quiet slots; landform kinds, sides, parameters and `offset`; water dice; which chapters have a sea, its side, runs and level; `shoreAt`, `beachAt` | `shape` (cos, sin, exp, pow, atan2); river span and meander (atan, cos, sin); the lake clash test (cos, sin) and boxes (hypot); the sea's beach profile (pow); every site position and fit decision; furniture; landmarks' heights |

The check: `harness/shots/run.mjs:47-53` compares `npx tsx harness/sim/spinehash.ts <seed> <chapter> <biome> 2500` with `window.__rt.spineHash(2500)`, for shots marked `checkHash`. One shot has it (`harness/shots/sets/world.json:84`, `far_from_origin`, the legacy `classic.html`). The hook exists only in the legacy `src/game/main.ts:195`; **`src/game/modcar/entry.ts` has none**, and ModCar's road is offset (`start`), so its hash differs from the classic one. The hash covers `xs, zs, ys, phi` of the first 5 km.

---

## 4. Extension points that exist today

| Extension point | Where | How it is used |
| --- | --- | --- |
| `WorldOptions` | `terrain.ts:103-121`, `spine.ts:23-34` | optional fields that default to the old behaviour: `chapterScale`, `startBiome`, `start`, `deadEnd`, `plots`, `placeOdds`, `secondPlace` |
| `Plot` | `terrain.ts:84-101`, applied in `onPlots` | a caller's levelled ground with `height(x,z)`, optional `bare`, `grass`; ModCar's yard and proving ground |
| `Ground` and `Land` | `ground.ts:50-52`, `src/core/onfoot/land.ts:9-12` | decorators stack on the world: `ProvingGround`, `SeamlessGround`, `FloorGround` |
| `SolidSource` / `SolidSet` | `solids.ts:50-71` | anything offering solids to walker and vehicles |
| `DrivePath` | `src/core/driver/robot.ts:19-23` | anything a robot can follow (`project`, `probe`) |
| Plan callbacks | `WaterPlan(…, dry)` `water.ts:162-166`; `LandformPlan(…, wet, coast, quiet)` `landform.ts:115-123` | one plan vetoing or steering another without geometry |
| Mutable data tables | `BIOMES`, `LAND_ODDS`, `LAND_SIZE` (exported, changed in place by `devTune.ts:289-317`); `WATER`, `ODDS`, `PICKS`, `PADS`, `BY_BIOME` (module-private) | per-biome behaviour |
| `BiomeDef.kin` | `biomes.ts:14` | meant as the fallback family; read in only two places (`weather.ts:153`, `environment.ts:246`) |
| `coarse` flag | `shape` | cheaper land for far consumers |
| `knock` | `sites.ts:1389-1416`, `furniture.ts:242-258` | the only mutation; returns what to redraw; `Site.version` |
| Activity zone, trodden grass | `Site.zoneX/zoneZ/zoneR`, `Site.bare` | where fish or game are; where grass is short |
| `beatsBetween` | `beats.ts:37` | the journey as a list of beats: the measuring eye a director needs |
| `WeatherSystem.force` / `stage`, `kindFor` | `weather.ts:94-99, 126-134` | forced weather for tools; per-biome event kinds |
| `RoadSpine.hash(n)` | `spine.ts:401-418` | identity check |

---

## 5. Invariants and the tests that guard them

All of these pass today.

| Invariant | Guard | Today (limit) |
| --- | --- | --- |
| `src/core` imports no three, DOM or `game/` | `harness/sim/core-purity.test.ts` | pass. Trap: its regex also matches `window.` or `document(` inside comments |
| Curvature within the local minimum | `spine_curvature_violations` | 0 (0) |
| Grade | `spine_max_grade_pct` | 8.000 (8.0001) |
| Heading, forward progress | `spine_max_heading_deg`, `spine_min_forward_cos` | 51.35 (55), 0.6246 (0.5) |
| Minimum radius | `spine_min_radius_m` | 70.48 (60) |
| Same road however it is grown | `spine_determinism_mismatches` | 0 |
| Pavement is the road plane; the solver finds the nearest foot | `terrain_road_surface_errors`, `terrain_projection_errors` | 0, 0 |
| No seam at pavement or shoulder edge | `terrain_road_seam_gap_cm` | 0 (2) |
| Land continuous, no cliff by the road | `terrain_max_kink_m`, `terrain_max_step_near_m` | 0.378 (0.5), 1.031 (1.15) |
| Height function cost | `terrain_chunk_ms` | 1.95 (10) |
| A careful driver arrives, dry, wet, snow | `robot_*` (24 + 10 + 10 seeds, 4 km each, T0 truck, 62 km/h) | 0 accidents; lane rms 0.21, 0.18, 0.09 m |
| Lake and river frequency | `water_lakes_per_10km`, `water_rivers_per_10km` | 1.34 (1.2–5), 1.20 (0.6–3) |
| Road above water; dry verges; shores hold | `water_road_min_clearance_m`, `water_flooded_verge_points`, `water_shore_leaks`, `water_dry_rivers` | 4.30 (≥ 1.2), 0, 0, 0 |
| Deck is one smooth piece, with headroom | `water_deck_max_step_mm`, `water_bridge_min_headroom_m` | 4.1 (20), 7.8 (≥ 4) |
| Water stops a car gently | `water_wade_*` | stops, 1.03 m deep, no blow-up |
| Place rhythm | `sites_places_per_10km`, `sites_wrecks_per_10km`, `sites_heaps_per_10km`, `sites_kinds_seen` | 3.79 (2.8–5), 7.42 (5–10), 3.03 (1.8–4.5), 10 (≥ 8) |
| A station within a tank | `sites_station_max_gap_km`, `sites_first_station_km` | 25.3 (30), 7.7 (12) |
| Pads level, dry, where the plan says | `sites_pad_max_slope`, `_wet_points`, `_missing_points` | 0.059 (0.075), 0, 0 |
| Things on the ground, off the lane | `sites_objects_afloat`, `sites_solids_on_road` | 0, 0 |
| Loot and fuel budget | `sites_containers_per_building`, `_loose_per_building`, `_fuel_l_per_100km`, `_empty_containers`, `_zones_share` | 5.08, 7.69, 206 (100–260), 0, 1 |
| Views open, layers, clean skyline | `vista_open_share`, `_shut_share`, `_layers_mean`, `_far_needles_per_view`, `_far_max_elev_deg`, `_land_kinds_min_per_biome` | 0.50 (≥ 0.25), 0.17 (≤ 0.45), 2.85 (≥ 2), 2.39 (≤ 3), 22.2 (≤ 26), 3 (≥ 3) |
| Rhythm of a journey | 16 metrics of `specs/roadgen/beats.json` | moment gap median 45 s, p90 109 s; quiet stretches 0.95 per 10 km late (0.5–1.8) |
| Sea rules | `harness/sim/sea.test.ts`, 8 tests | pass |
| Furniture rules, bridge joints | `harness/sim/furniture.test.ts`, 4 tests | pass |
| Herd behaviour | `harness/sim/fauna.test.ts`, 5 tests | pass |
| Weather schedule and clock | `specs/weather/default.json` (22), `look.json` (5) | not run for this map |
| Browser equals Node | `run.mjs` `checkHash` | spine only, legacy page only; not run for this map |

The files under `loop/metrics/roadgen_*.json` are stale (recorded when there were three biomes); the values above are from a fresh run.

**Invariants no test guards:**

- Exact output per seed. Appendix A gives a trace and reference values to build that test.
- `WATER_SLOT === LAND_SLOT`.
- The first-four-chapters rule, the order of `BIOMES`, and the special cases of slots 0 and 1.
- `shape` must not be re-entered. Its scratch is per instance (`p0, p1, bl, lp, we, se, br`), and `water.ts`, `sea.ts`, `landform.ts`, `sites.ts`, `landmarks.ts`, `furniture.ts` keep module-level scratch. The one legal nesting is site layout, entered at the top of `shape`.
- Water and landform recipes never ask the terrain for a height (`water.ts:17`).
- `sample` reads `this.br` left by its own `shape` call (`terrain.ts:592-594`).

**Tests that depend on what particular seeds happen to contain**, and would break incidentally if today's generation moved: `sites.test.ts` (seed 20261113 needs a crate heap and a camp in 4 km), `fauna.test.ts` (first hide and jetty among seeds 1–60), `furniture.test.ts` (all three bridge kinds among seeds 1–40), `sea.test.ts` (at least four seas among seeds 1–40 starting in `lakes`), `modcar_buildings.test.ts` and `modcar_siteart.test.ts` (four ModCar seeds), `modcar_proving*.test.ts`, `onfoot.test.ts`, and the collectors `traveller.ts`, `systems.ts`, `weather.ts`.

---

## 6. Risks for V3

- **R1. The spine must stay x-monotone.** True 180° hairpins, loops and side roads cannot be expressed. A serpentine with headings up to about ±65° is possible, with 130° apexes. *Measured*: today's `shape` on a synthetic serpentine written into the spine's arrays in memory (2 km, legs of 100–120 m, 8–10 % grade, alpine land, seed 1234):

  | Road | Solver misses (of 6,000) | Largest step per 0.5 m (gate 1.15) | Largest kink (gate 0.5) | Stations where the 44 m strip column folds |
  | --- | --- | --- | --- | --- |
  | as generated | 0 | 0.48 | 0.11 | 0 |
  | R 60 m, ±49° | 50 | 0.49 | 0.24 | 0 |
  | R 45 m, ±60° | 114 | 0.60 | 0.41 | 0 |
  | R 30 m, ±49° | 46 | 1.10 | 1.16 | 136 |
  | R 30 m, ±65° | 51 | 1.88 | 1.62 | 176 |
  | R 30 m, ±70° | 71 | 2.71 | 4.65 | 216 |

  The pavement itself stayed exact in every case. So 30 m radius needs curvature-aware lateral bands in the near field and a clamp of the strip's inner columns; it is not a constant change.
- **R2. No golden test.** A refactor that shifts one dice draw passes every card. The convention "old seeds identical" is unenforced.
- **R3. `BIOMES.length` in the chapter pool** (`spine.ts:85`): registering one more region silently changes every existing world from chapter 5.
- **R4. Silent `plains` fallback.** A new region id falls back to plains in `LAND_ODDS`, `LAND_SIZE`, `WATER` (to dry), site `ODDS`, landmark `BY_BIOME`, `kindFor`, palettes and styles. It runs, and looks like plains. `kin` does not help: two readers.
- **R5. Sequential, stateful, synchronous layout.** A first query far down the road lays out every slot before it: *measured* 36–41 ms of spine plus 40–46 ms of sites for a fresh world asked at 300 km. Per slot 0.07–0.25 ms median, up to 2–7 ms cold, inside whichever `shape` call touches the slot first. Sites, solids and containers are never freed (ModCar: about 1,170 objects and 1,850 solids per 125 km).
- **R6. Workers.** "The core is pure" holds with caveats: `plots` carry closures; tables are mutable module state; `knock` state and `wetness` live in one instance; a worker's world must catch up from slot 0.
- **R7. Developer dials rewrite the core tables in place** (`devTune.ts:289-317`: every `BIOMES` field listed, `LAND_SIZE`, `LAND_ODDS`), persisted in `localStorage` and applied before the world is made (`entry.ts`). A world is a function of seed, options and dial state. Saves store the seed only.
- **R8. Cross-engine identity is narrower than the plan assumes** (section 3.7). "Bit-identical in browser and Node, extended to new content" is not what exists.
- **R9. Saves hold `world: { seed }` and site ids** (`src/game/modcar/save.ts:75`, `places.ts`). A world of another version under the same seed puts saved vehicles inside hills and orphans searched containers.
- **R10. Single-layer ground.** `Ground.sample(x, z)` has no height. A deck already has the limitation (wheels under a bridge get the deck's height); the walker has a rule for it (`walker.ts:140-150`). Tunnels, overpasses and piers multiply the cases.
- **R11. Scratch reuse.** `TerrainPoint` objects are reused; `FunctionLand` and `GroundLand` (`land.ts:21-43`) reset only `h, bed, wl, bridge, zone, frozen`, so `site`, `plot`, `wkind` can be stale under those. Any new field needs resetting in every `Land`.
- **R12. Cards near their limits today**: `water_lakes_per_10km` 1.34 (≥ 1.2), `vista_far_needles_per_view` 2.39 (≤ 3), `terrain_max_step_near_m` 1.03 (≤ 1.15), `sites_station_max_gap_km` 25.3 (≤ 30). Regions with less water, more quiet or tunnel slots, or steeper land will trip them; v2 needs its own cards.
- **R13. Palette slots.** The renderer keeps four rolling palettes by `chapter & 3`. Regions shorter than about a quarter of the far view (20 km at full view scale) put more than four chapters in sight.
- **R14. Steeper and twistier roads starve the fit rules.** Pads need grade ≤ 5.5 % and radius ≥ 167 m; lakes assume a nearly level road (the basin is cut down towards the level over 1.72 × the lake); rivers assume one crossing, which large heading swings can break.
- **R15. One sea level per chapter**, hung from that chapter's road. Two coastal regions in a row would meet at different levels.
- **R16. `bridgeAt` sees one slot**: a span must lie inside the slot of its river. A 1–3 km bridge needs another index.

---

## 7. Proposed seams

Order matters: S0 first, then S1–S4, then the features. Each keeps the v1 path literally unchanged and puts new behaviour behind `worldVersion ≥ 2`. Costs are rough working days for one engineer on the core side.

| # | Seam | Cost | Risk |
| --- | --- | --- | --- |
| S0 | World golden trace | 0.5 | low |
| S1 | `worldVersion` and a rules object | 1 | low |
| S2 | Region registry (archetypes as data) | 1–2 | low–medium |
| S3 | Chapter dealer (region-level pacing) | 2 | low |
| S4 | Slot director and road programme | 3–5 | medium |
| S5 | Grade classes with a length budget | 2–3 | medium |
| S6 | Hairpins to 30 m as serpentine apexes | 5–8 | high |
| S7 | Landform operators and a feature stack | 3 + 1–2 per operator | medium |
| S8 | Lakes as unions of ellipses with islands | 3–5 | medium |
| S9 | Sea piers and harbours | 2–3 | low–medium |
| S10 | Site and object registries, several pads per slot | 3–4 | medium |
| S11 | Wonders | 4–6 | medium; on-road ones high |
| S12 | Tunnels at region gates | 6–10 (gallery first: 2–3) | high |
| S13 | Ecotope field, flora plan in core | 2 + 3 | low + medium |
| S14 | Spur roads (later) | 10–15 | high |
| S15 | Worker-safe world spec, height tiles | 2–3 | medium |
| S16 | Slot-ready event | 0.5 | low |
| S17 | Cross-engine identity for new content | 1–2 | low–medium |

### S0. World golden trace (do this before anything else)

- New files only: `harness/sim/worldTrace.ts`, `harness/sim/world-golden.json`, `harness/sim/world_golden.test.ts`. The repository already does this for vehicles (`harness/sim/modcar/legacyTrace.ts`, `legacy-golden.json`, `modcar_legacy.test.ts`).
- Appendix A has the trace function and four reference fingerprints taken at `e50503c`.
- The values depend on the engine's `Math` functions; record the Node version beside them, as the vehicle golden does.

### S1. `worldVersion` and a rules object

- `WorldOptions.worldVersion?: 1 | 2`, default 1 (`terrain.ts:103-121`); the constructor (`:209-227`) resolves `rules = rulesFor(version)` and hands it to every plan; `SpineOptions` carries it (`spine.ts:23-34`, `:169-180`).
- New `src/core/world/rules.ts`: `RULES_V1` names today's constants in one place: pool sizes (3, then 6), chapter lengths, heading guard 40/44/49°, radius floor 60, grade cap 0.08, grade rate, 55 m transitions, slot 1,250, quiet 2 in 9 from chapter index 3, place odds, landmark spacing.
- Game side (other owners): `seamless.ts:25-37`, `save.ts:75` (`world: { seed, version? }`, absent means 1), `ModGame.ts:502, 874, 1540`.
- Risk: plumbing only if S0 is green before and after.

### S2. Region registry

- Keep `BIOMES` as **the** registry array, append-only, index is identity. Add `registerRegion(def)`. Give the v1 dealer an explicit pool size of 6 instead of `BIOMES.length` (`spine.ts:85`): the one line that makes appending safe.
- `RegionDef extends BiomeDef` with optional tables, resolved through `kin` when absent: `land {odds, size}`, `water`, `sites`, `landmarks`, `weather`, `sea`, `intensity`, operator recipe, ecotope parameters.
- Lookups to switch from `X[id] ?? X.plains` to the def: `landform.ts:136-138`; `water.ts:172, 204-206, 211-212`; `sites.ts:501, 555`; `landmarks.ts:61`; `sea.ts:84`; `weather.ts:126-134, 141-170`; `fauna.ts:120`.
- Keep `LAND_ODDS` and `LAND_SIZE` exported as views onto the same arrays, so the developer dials keep working without edits.
- Risk: pure data motion, guarded by S0. The registry order is save-relevant because the index seeds the noise. Render-side tables (palette, style, colour script, scatter branches by id) are the other half of "a region is data" and belong to the render owners.

### S3. Chapter dealer

- `ChapterPlan` takes a `ChapterDealer { first(rng, scale), next(plan, rng) → { region, length, gate } }`; `extend()` (`spine.ts:77-89`) and line 74 delegate. The v1 dealer is today's code, draw for draw.
- v2 dealer from the plan: lengths 7–9.5 km (recommend whole slots: 6 or 7, so gates fall on slot borders and each region owns whole slots); weights 60/30/10 by intensity; no two highlights running; a calm region with a camp after a highlight; at most one surreal region in six; only calm and scenic in the first three; neighbours differing in two of palette, landform, vegetation; never two sea regions running (R15); a gate kind per border.
- Expose `plan.meta[c]` and a per-border `transitionAt(c)` (`transition` is one number today, read by `blend` and `sea.ts:86`).
- Risk: new path only. Check R13 against the "minutes per region" dial.

### S4. Slot director and road programme

- New `src/core/world/director.ts`: per region, deal each slot `{ quiet, water, land, side, site, wonder, gradeClass, curveClass, gate }` from region data and hashes only. **It must not read spine geometry**: the spine reads the programme, and everything else reads both.
- Hooks: `World` constructor closures (`terrain.ts:216-226`); `WaterPlan.diceOf` (`water.ts:176-185`); `LandformPlan.grow` (`landform.ts:139-161`); `SitePlan.makePlace` (`sites.ts:496-542`); `World.quiet` (`terrain.ts:230-232`); `RoadSpine.gen` (`spine.ts:239-240, 253-263, 269-276`).
- This is where the plan's rules live: one quiet run of at least 1.5 km per region; lake, camp and forage clustered; no water on steep or serpentine slots (R14); a flat lay-by after a steep run.
- Risk: ordering. Prove it with the "grown in small bites" and "asked in another order" checks on v2 worlds.

### S5. Grade classes with a length budget

- In `gen()` replace lines 269-276 for v2 by a small budget machine: class caps (for example 6, 8, 10, 14, 20 %), metres spent per class against the plan's budget (at least 85 % of length at or under 6 %; 10–14 % at most 4 %; above 14 % at most 1 %, at most 600 m at a time, about once in six regions), a recovery stretch after each steep run, and a lower cap through tight apexes.
- Today is far inside the budget (98.1 % at or under 6 %), so the classes add; they do not have to take away.
- Risks: vehicle capability (snow has grip 0.34; a loaded stock car and a caravan on 14 %), brake heat, fewer pads fitting (station gap gate). Cap by climate; add the plan's gate "stock car climbs and descends the steepest stretch of every seed".

### S6. Hairpins to 30 m

- Stay x-monotone. A `switchback` curve class: heading limits raised to about 58/62/66° (forward cosine at least 0.40), radius floor 30 m, legs 90–160 m, alternating apexes. Parallel legs then lie roughly 80–100 m apart and read as stacked hairpins; the apex turns about 130°, not 180°.
- Core changes: `pickSegment` variant (`spine.ts:206-231`); radius floor from the rules (`:240`); heading limits (`:215, 221, 259`); in `shape`, lateral bands scaled by curvature and by clearance to the neighbouring leg (`terrain.ts:401, 454-462`) and a hardened solver (`:338-363`).
- Render change (other owner): clamp the strip's inside columns to about 0.7 R, the way the bridge clamp already folds columns onto the deck edge (`worldBuild.ts:146`).
- The table under R1 is the evidence that these are mandatory. The clearance-scaled bands are a design, not yet tried.
- True stacked 180° hairpins need the multi-road near field of S14.

### S7. Landform operators and a feature stack

- **Cross-section operators.** `LandParams` gains an amplitude vector that lerps across slot borders like the five numbers do now; `LandformPlan.offset` (`landform.ts:219-248`) loops over a `LandOperator` registry. Today's four terms become the first four operators, same arithmetic, same order. Fits: terraces (a remap of the summed profile, so remap operators run after additive ones), dunes, karst density, basalt bench, salt flat.
- **Anchored features.** New `src/core/world/features.ts`: `LandFeature { xMin, xMax, zMin, zMax; carve(x, z, s0, lat, T, o) }`, kept per slot and filled in order like `WaterPlan.list`, evaluated in `shape` after the sea (`terrain.ts:419-427`). Fits: crater and volcanic cone, glacier tongue, karst tower cluster, wonder plinths, tunnel barriers, pier decks, spur beds. It generalises what `water.carve`, `padWeight` and `plots` each do privately.
- Rules for every operator: zero within 11–13 m of the centre line; slopes no steeper than 2 in 1 (a height field cannot hold a cliff, `landform.ts:239`); continuous first derivative (the kink gate); arithmetic and hashing only; never call `world.shape`.
- Overhangs (arches, stacks, basalt columns, floating rock) are meshes with solids, as the plan says.
- Cost per `shape`: about 53 ns per two-octave `fbm2`. Keep the sum under about +0.3 µs.

### S8. Lakes as unions of ellipses with islands

- `Lake` gains `lobes?` and `islands?`; `cx, cz, ax, az, a, b` stay as the bounding ellipse, because the sheet builder (`waterBuild.ts`), `beats.ts`, `sites.ts` `shoreGap` and the leak test all read them.
- Change: `rhoPlain` (`water.ts:217-223`), `lakeRho` (`:454-463`), `lakesTouch` (`:226-235`), `riverMeetsLake` (`:238-248`), the lake branches of `carve` (`:482-492, 549-569`), a v2 `makeLake` beside the old one, dispatch at `:196`.
- `carve` converts the shore measure to metres with `min(a, b)`; a union needs a per-lobe scale or a metric distance. Keep the v1 ellipse path untouched.
- The road-clearance loop (`:299-320`) must run against every lobe: that is what keeps verges dry.
- Other water kinds in the plan break further assumptions: terraced pools need a level per lobe (`WaterEffect.level` is single); waterfalls need a level that changes along the river (today it is a function of x only); a causeway or salt mirror puts water within 12 m of the road (`water_flooded_verge_points` is a v1 gate).

### S9. Sea piers and harbours

- A pier as a site kind uses machinery that exists: `tryPlace(…, coast)`, the coast branch of `fit` (`sites.ts:634-639`), `strand()` (`:1195-1259`, which already builds a 14–30 m pier). A run of two slots leaves about 330–480 m of usable shore per slot; the lighthouse takes the middle slot (`lightRun`, `:570-580`), a pier can take another.
- A long pier that carries wheels needs a deck in the height function (feature stack: `h` deck, `bed` sea bed, a mask like `bridge`); the walker's deck rule applies as it is.
- Cliffs: a profile variant per run in `SeaPlan.carve` (`sea.ts:254-279`).

### S10. Site and object registries, several pads per slot

- `SiteKindDef { id, pad, constraints, furnish(builder), sign }` and `ObjectKindDef { id, solids(o, sink) }` replace the two switches (`sites.ts:874-1140`, `:1418-1526`) and `PADS` / `ODDS` / `PICKS` (`:273-297`). A public `SiteBuilder` wraps the private helpers (`put`, `putIn`, `building`, `container`, `containerBy`, `lie`, `litter`, `petrol`, `boardAt`, `wreck`).
- `padWeight` (`:384-403`) reads `places[k]` and `seconds[k]`: two pads per slot. Towns of 5–12 buildings need a list.
- Keep v1 ids and draw order exactly (S0 guards); new ids get a new letter.
- Risk: the file is 1,527 lines of order-sensitive dice.

### S11. Wonders

- New `src/core/world/wonders.ts`: `WonderDef` registry and a slot-anchored `WonderPlan`, dealt by the director (one per 2–3 regions; on-road one per 6–8).
- **Beside**: a levelled footprint through the feature stack, solids, a request to the site plan for a viewing lay-by. **Over** and **through**: a station chosen like a river crossing (straight, level, low: `water.ts:341-349`), a clearance envelope over the lane, solids either side, a `cover` flag for light and weather.
- On-road structures need a span index that is not one slot (R16) and decks without a river (broken viaduct, dam crest).
- The "visible for 60 s" acceptance can reuse the ray walk of `harness/sim/vista.ts`.
- `landmarkAt` stays as it is for v1; the 30 landmark kinds are region data (S2).

### S12. Tunnels at region gates

- A tunnel is a barrier ridge across the road (a feature) plus a second layer: `TerrainPoint.cover` (the land above), `tunnel` 0…1, `World.tunnelAt(s)`.
- On the road nothing changes for wheels: zones 1 and 2 are the road plane whatever `T` is.
- The second layer is the cost: an optional height argument on `Ground.sample` and on every implementer (`World`, `FlatGround`, `ProvingGround`, `SeamlessGround`, `FloorGround`, `GroundLand`) and call site (`sim.ts:828, 964, 1069, 1552-1554, 1661`); a mirrored rule in `Walker.landAt`; every mesh builder drawing `cover` over the span; light, weather and sound reading the flag.
- The director keeps water, places, furniture and landmarks out of the span.
- Cheaper first step: a gallery up to about 150 m: a 2-in-1 cutting in the height field with a roof mesh. Flanks steeper than 38° are not walkable (`walker.ts:39`) and not drivable, so the roof is out of reach.

### S13. Ecotope field and flora in core

- New `src/core/world/ecotope.ts`: `at(x, z, out)` giving moisture, canopy, slope, altitude, relief, distance to water and its kind, region, landform kind, distance to the road.
- Ingredients: `shape` (altitude, relief, `wl`), two more `shape` calls for slope, a new `WaterPlan.shoreDistance` (today distance is known only within 14 m of a river and on a lake's beach), and canopy.
- **Canopy lives in the render layer today**: `woodland()` at `src/game/scene/palette.ts:106-140`, pure but in a file that imports three. Move it to core and re-export it from `palette.ts`.
- **Tree positions too**: `buildScatter` (`src/game/scene/worldBuild.ts:371-498`) decides every tree by cell hash with a branch per biome id, and trees have no solids anywhere. Ballistics, line of sight and cover need a core `flora.ts` that both the renderer and a `SolidSource` read.
- Cost per sample about 2.5–4 µs with slope: compute per cell in streaming jobs and cache per tile, never per animal per frame.

### S14. Spur roads (later)

- The plan calls this the largest change on the world side, and the code agrees: `TerrainPoint.s, d, zone` mean the one road everywhere.
- Shape of the change: a spur as a feature with its own centre line (not x-monotone, so its own small spatial index); `TerrainPoint.spur, ss, sd` beside the main-road fields, which must keep their meaning (`sea.open`, `padWeight`, `bridgeAt` and the strip's attributes read `s`); zones 4 and 5; `surfaceOf` (`terrain.ts:531-539`); the normal branch of `sample` (`:572-586`, which treats every non-zero zone as main road); a junction as a pad; a `DrivePath` per spur.
- A spur's profile has to follow land that already exists, so spurs are planned after water and landform and before sites.
- The same multi-road near field is what true stacked hairpins need.

### S15. Worker-safe world spec and height tiles

- `WorldSpec { seed, version, options, plots: [{ type, … }], tableOverrides }` and `World.fromSpec`; a plot registry so `YARD_PLOT` and `provingPlot(level)` can be rebuilt from data; dial overrides travel in the spec (R7).
- A worker's world regenerates from the seed: about 0.2 ms per km of spine and 0.1–0.25 ms per slot (*measured*).
- `HeightField` interface with `World` as the exact implementation and a tile cache for vegetation, animals and ballistics; wheels keep the exact function, as the plan says.

### S16. Slot-ready event

- One callback at the end of `SitePlan.grow` (`sites.ts:482`): `world.onSlot?.(k, sites)`. Today every consumer polls `sites.between`.

### S17. Cross-engine identity

- Decide what "identical" means for v2. Either move the decisions in terrain, water, sea and sites to own functions (`dsin`/`dcos` exist; `atan2`, `exp`, `pow`, `hypot` would be new), in v2 only since it changes bits, or compare quantised values.
- Add a `spineHash` / world trace hook to `src/game/modcar/entry.ts`; the live game has no check at all today.

---

## 8. Performance notes

- **Hot path allocations**: `shape`, `sample`, `spine.at`, `sAtX`, `project`, `carve`, `padWeight`, `bridgeAt` allocate nothing. Layout code allocates freely (`fit`, `Furniture.build`, `beatsBetween`), but only when a slot or block is first built. Outside this area, `FloorGround.floorsAt` builds a string key per sample (`src/game/modcar/floorGround.ts:53`).
- **Where the height function's time goes**: noise. Far field about 1.0–1.35 µs: near relief 5 simplex evaluations, far 2–4 octaves, massif 2 octaves plus two `peakField` (nine cells each) and `giantPeaks` (nine cells); doubled inside a biome transition. Water costs 70 ns, landform 62 ns.
- **Spine**: 0.21 ms per km; 56 bytes per station, 28 kB per km; arrays double (131,072 slots, 7.3 MB, for 200 km).
- **Layout** (*measured*, 100 slots): default world 16–20 ms; ModCar 25–26 ms. Furniture block 0.35 ms median, 0.80 ms worst. Water 200 slots 1.0 ms. `beatsBetween` over 110 km 13.7 ms.
- **Hitch sources**: slot layout inside `shape` (up to 2–7 ms once per slot, unsliced); the first touch of a `lakes` chapter makes `seaOf` walk and generate the whole chapter's road; a far jump on a fresh world (about 80–90 ms at 300 km).
- **Budget for V3**: the streaming budget is 3.5 ms per frame on the main thread, about 3,000 `shape` calls. Every operator octave adds about 5 % to each of them. `terrain_chunk_ms` has room (1.95 of 10), but the frame budget is the real limit until builders move to workers.
- No draw-call or GPU figure was taken for this map.

---

## 9. Open questions

1. Must v1 worlds stay **playable** for old saves (which hold world positions and site ids), or only testable? The save has no world version.
2. Is engine-independent identity required for all v2 content, or is "same engine" enough (workers, single player)?
3. Are 130° serpentine apexes acceptable as "hairpins" for the first pass, with true stacked hairpins waiting for the multi-road near field?
4. Region lengths in whole slots? And the lower end of the "minutes per region" dial against the four palette slots.
5. Should dial state become part of a world's identity in saves?
6. Which reference defines "old seeds"? History before the public snapshot is not in the repository; proposed: the source at `e50503c`, via Appendix A.
7. Is `Fauna` (legacy game only) to be ported into the ecology module or dropped?
8. May the land above a tunnel be reachable (then the height-aware ground query is needed from the start)?
9. Not verified here: anything in a browser (the `checkHash` shot, timings); the `FULL=1` variants of the gates; the weather cards; `traveller.ts`; the clearance-scaled near field proposed in S6.

---

## Appendix A. World trace and reference fingerprints

FNV-1a over float64 bits and strings, per part, over the first 60 km. `num(v)` mixes the two 32-bit halves of the double, low half first, as `RoadSpine.hash` does; `str` mixes UTF-16 code units; start `0x811c9dc5`, multiply `0x01000193`.

Parts, in this order of fields:

- `spine`: per station `xs, zs, ys, phi, kap, grd, bnk` for `km·500` stations. `spineHash`: `spine.hash(km·500)`.
- `chapters`: per chapter up to `chapterAt(len)`: biome id, `starts[c]`.
- `land`: per slot `k < floor(len/1250)`: `kindOf`, `sideOf`, `quiet ? 1 : 0`, then `land.at((k+0.5)·1250)` as `tilt, wall, drop, canyon, far`.
- `water`: per feature of `between(0, len − 1)`: `kind`, then every field in sorted key order (numbers as numbers, others as strings).
- `sea`: per coast of `between(0, len)`: `chapter, s0, s1, side, level, seed`, then per run `k0, k1, s0, s1`.
- `sites`: per site of `between(0, len − 1)`: `id, kind, biome, seed, s, side, x, y, z, phi, halfL, depth, skirt, ground, zoneX, zoneZ, zoneR, reach`; per object `kind, x, y, z, yaw, w, d, h, v, pitch, roll, JSON(b) or '-'`; per container `id, kind, x, y, z, yaw, hx, h, hz, shelf, solid, obj, seed`; per loose `id, item, n, x, y, z, yaw`; per fuel `id, from, x, y, z, litres`; per solid `tag, x, z, hx, hz, yaw, y0, y1, floor, ref`; then `bare`.
- `landmarks`: per index of `landmarkRange(0, len)`: `kind, s, d, x, y, z, yaw, scale, absent`.
- `furniture`: `between(0, len)`: per post `kind, s, side, x, y, z, phi, state, h`; per rail `side, s0, s1`.
- `heights`: `rng = new Rng(0x7ace)`; for `i < 20000`: `s = rng.range(0, len)`, `d = (rng.next()·2 − 1)·[3, 30, 190, 2500, 12000][i % 5]`, the point `d` to the right of the road at `s`, `coarse = (i % 10 === 9)`; mix `h, bed, wl, s, d, zone, relief, site, bridge, wkind, frozen, ba, bb, bt, plot`.

Recorded at `e50503c`, Node v24.22.1, linux x64. Each world was also traced after being queried in another order first (`heightAt(55000, 40)`, then `sites.between(30000, 50000)`): identical.

| Part | `new World(20261113, {})` | `new World(7, {chapterScale: 0.2})` | `new World(1, {startBiome: 'lakes', chapterScale: 2.5})` | `modcarWorld(20261113, {}).world` |
| --- | --- | --- | --- | --- |
| spine | `61ec991b` | `0b57bfe0` | `88ad92e1` | `b219d757` |
| spineHash | `d28a7dfa` | `ce0efec8` | `0d6184e1` | `742cd9b2` |
| chapters | `31a31eeb` | `ea927521` | `017f87d4` | `31a31eeb` |
| land | `3ad8fff2` | `35ef095a` | `d72a4c33` | `3ad8fff2` |
| water | `9f242cc5` | `62a0ebaf` | `cc66ae59` | `df5c259c` |
| sea | `811c9dc5` (none) | `811c9dc5` (none) | `6443b284` | `811c9dc5` (none) |
| sites (count) | `63af9839` (86) | `0b657185` (90) | `b2b6cacc` (80) | `ab82d65c` (111) |
| landmarks | `520555af` | `2296e4f7` | `f27bd7f6` | `eb679dca` |
| furniture (posts/rails) | `5bfbdbf5` (2591/124) | `c75206e6` (2395/121) | `9e6be825` (2325/5) | `c0e7565c` (2593/123) |
| heights | `1328680e` | `581a589d` | `220ed793` | `12732714` |

The third world has a sea in chapter 0: left side, level 27.762, run over slots 6–9. The first and fourth share chapters and landforms (same seed); the road differs by the start offset.

## Appendix B. Hash salts in use

New modules should take their streams from salts not listed here (better: one helper that derives a stream seed from the world seed and a module name).

| Module | Salts |
| --- | --- |
| chapter plan | `hash2(seed, 0xb10e, 77)` |
| spine | `hash2(seed, 0x50ad, 13)`; grade `hash2(seed, 0x6ade, 5)` |
| terrain | relief `seed + biome·7919` + 1…6; massifs `seed + 0x3a55` + 1, 11, 12; giant peaks `seed + 0x9ea7`; roughness `seed + 91, 92` |
| landform | plan `hash2(seed, 0x1a9d, 33)`; slot `hash2(i, 0x51e7, plan)`; canyon `seed + 0x2c1, 0x2c2` |
| water | plan `hash2(seed, 0x7a7e, 91)`; dice `hash2(k, 0x3a7e, plan)`; lake `hash2(k, n, plan + 0x1a4e)`, `0x1a5e`; river `plan + 0x21fe`, `0x21ff` |
| sea | plan `hash2(seed, 0x5ea, 53)`; chapter `0x5ea5`, `0x5ea6`; shore noise coast seed + 0, 3, 5, 7, 13, 29 |
| sites | plan `hash2(seed, 0x517e, 77)`; slot `0x51e0`; verge `0x51e1`; second place and waterworks `0x51e2`; waterworks dice `0x3a7e5`; container `hash2(site.seed, i, 0xc0a7)`; knock `0x60c + version` |
| quiet | `hash2(block, 0x9017e, seed)` |
| landmarks | `hash2(k, 0x1a4d, seed)` |
| furniture | plan `hash2(seed, 0xf0a7, 61)`; `side + 7`, `side + 3`, `99`, `0xc4e` |
| fauna | `hash2(site.seed, 0xfa0a, 31)` |
| weather | `hash2(k, 0x77ea, seed)`; `seed + 0x1234`; mist `0x315`; `fbm1` seeds `seed + 3`, `17 + biome·3`, `29`, `53`, `91` |
| noise | `gnoise1` `0x3c6e`; octaves `+ o·1013` (2-D), `+ o·733` (1-D) |
| render side, for reference | scatter `seed + 0x7ee5`, `0x1eaf`, `0x62f`, `0x63a`; woodland `seed + 501…506, 509, 510`; ground colour `601, 602` |
