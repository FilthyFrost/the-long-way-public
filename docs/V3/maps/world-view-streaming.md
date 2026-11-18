# Map: how the world is built into meshes and streamed

Area: `src/game/scene/*`, `src/game/render/triGrid.ts`, the view side of `src/game/modcar/{siteArt,buildingKit,floorGround,places,stream}.ts`, `specs/render/*.json`.
Branch `feat/v3`, commit `e50503c`. Read-only pass; nothing in the repository was changed except this file.

How to read the numbers in this document:

- **measured (recorded)**: values already in `loop/metrics/*.json` from earlier GPU runs of the screenshot harness. Not re-run here.
- **measured (Node)**: timings taken in this pass by running the real builder functions under `tsx` on this machine (no GPU, no upload cost). `harness/sim/buildtime.ts` is the in-repo tool of the same kind.
- **emulated**: the rules of `WorldView.plan()` replayed in Node against the real builders, with three's per-object sphere/frustum test redone by hand for a camera 1.25 m above the road looking along it (vertical fov 64°, 16:9) and an approximation of the far shadow cascade. These are CPU-side counts of what the scene graph would submit. **They are not GPU measurements.**
- **audit**: the 420-510 draw calls and 0.65-1.44 M triangles per frame quoted in the task. Its source is not in the repository.

---

## 1. Summary

- One class, `WorldView` (`src/game/scene/worldView.ts`, 672 lines), streams everything the generated world shows: road strips, a terrain quadtree with a far ring, tree/bush/rock tiles, grass and flower tiles, far-forest cards, lakes, rivers, bridges, sea sheets and one merged mesh per roadside site. It is shared by the live ModCar game (`ModGame.ts:882`), the classic game (`game.ts:135`) and the model viewer (`viewer.ts:300`).
- Everything runs on the main thread. There is no Web Worker, `OffscreenCanvas` or `postMessage` anywhere under `src/` (grep). `specs/render/world.json` and `loop/backlog.md:23` both record "move chunk generation into a Worker" as not done.
- Scheduling: `update(cx, cz, budgetMs)` re-plans when the focus has moved 14 m, sorts a job list nearest-first, and runs jobs until the budget is spent (ModCar: 3.5 ms per frame, `ModGame.ts:4063`). Grass, far woods, sea and site builds are generators advanced at most 2 ms per turn (`SLICE_MS`); strips, terrain leaves, scatter tiles, river lengths, bridges and poles are single unsliced jobs.
- The mesh builders (`worldBuild.ts`, `waterBuild.ts`, `siteBuild.ts`, `paintBuilder.ts`, `vegetation.ts`) are DOM-free and already run in Node. All of them are deterministic functions of `World` (seed + options) plus a few integers, with three exceptions: `buildScatter` reads the sun direction from a render global, `buildPoles` and `siteSlices` read state that gameplay mutates (posts and crates knocked by cars).
- ModCar draws the places itself: `SiteArt` (`src/game/modcar/siteArt.ts`) clones GLB models, the 42-piece building kit included, and merges each place into one mesh per material name. `WorldView.skipObject` removes those objects from the classic one-mesh drawing. Consequence found in this pass: in ModCar a place is drawn only within 420-560 m; beyond that nothing of it shows (lighthouses and the works' long wall excepted), and `WorldView` still adds a zero-triangle mesh for it, which is a wasted draw call.
- Draw calls: emulated, the world view alone submits 174-239 draw calls (152-191 main pass, 22-51 far shadow cascade) and 0.28-1.35 M triangles depending on the biome. Recorded ModCar road frames total 260-388 calls and 0.85-1.33 M triangles; the classic world budget is 300 calls / 1.5 M triangles and **no spec gates the ModCar sets**.
- Streaming CPU: emulated at 90 km/h, 13-14 builds per second and 19-22 ms of builder time per second of driving, 72-78 % of it grass tiles, because every grass tile is built up to three times (far ring, near ring, far ring again).
- Biome looks reach the shaders through four rolling palette slots (`chapter & 3`). Geometry stores slot numbers, not biomes. This silently assumes that no more than four chapters are ever in view.

---

## 2. Key files

Sizes are line counts. "Public API" lists every export.

| Path | Lines | Role | Public API |
|---|---|---|---|
| `src/game/scene/worldView.ts` | 672 | The streamer: plan, job queue, piece maps, drop/dispose, floating-origin re-placement | `class WorldView { constructor(core: RenderCore, world: World, q: QualitySettings); readonly world; skipObject: ((o: SiteObject, site: Site) => boolean) \| null; maxBuildMs; totalBuilds; update(cx, cz, budgetMs); redrawFurniture(s); redrawSite(id); get pending; get counts }` |
| `src/game/scene/worldBuild.ts` | 1100 | Builders for strip, terrain leaf, scatter tile, poles/wires/signs/road furniture, grass tile, far-woods tile; the `Slices` protocol | `STRIP_STATIONS=32`, `STRIP_HALF=40`, `STRIP_LODS`, `stripSink(ad)`, `sinkShare(world, t)`, `groundAttrs(seed, t, x, z, bw, gd, k, lawn?)`, `lawnOf(world, t, x, z)`, `interface Built`, `buildStrip(world, c, lod, span?)`, `TERRAIN_N=32`, `TERRAIN_ROOT=2048`, `TERRAIN_MAX_LEVEL=3`, `buildTerrain(world, level, ix, iz)`, `TILE=128`, `interface ScatterKinds`, `buildScatterKinds()`, `interface ScatterBatch`, `buildScatter(world, tx, tz, far, discs?)`, `interface Pole`, `makePole()`, `polePosition(world, i, out)`, `buildPoles(world, c, span?)`, `ROAD_EDGE`, `GRASS_TILE`, `GRASS_CELL`, `GRASS_NEAR`, `GRASS_KEEP_FAR`, `GRASS_FADE`, `GRASS_RADIUS`, `buildGrassTuft()`, `buildFlower()`, `interface GrassTile`, `type Slices<T>`, `finish(g)`, `buildGrass(...)`, `grassSlices(world, gx, gz, density, near)`, `WOODS_TILE=2048`, `WOODS_FADE`, `interface WoodsTile`, `buildFarWoods(...)`, `woodsSlices(world, tx, tz)`, `buildWoodsCard()` |
| `src/game/scene/vegetation.ts` | 262 | Procedural plant templates (clumps of leaf cards on a dark ball; ragged cone tiers) | `interface PlantKinds`, `buildPlants()` |
| `src/game/scene/waterBuild.ts` | 507 | Lake sheet (stepped), river length, sea sheet (sliced), bridge mesh | `interface WaterSheet`, `class LakeBuild { step(rows=6); result }`, `RIVER_CHUNK=512`, `riverChunks(f)`, `riverPoint(f, zr, out)`, `buildRiverChunk(world, f, c)`, `SEA_CHUNK=1000`, `seaChunks(c)`, `seaSlices(world, c, i)`, `interface BridgeMesh`, `buildBridge(world, f)` |
| `src/game/scene/siteBuild.ts` | 1395 | Classic drawing of a site: one flat-painted merged mesh from a `switch` over ~50 object kinds | `lampHeight(h)`, `siteSlices(site, skip?)`, `siteTriangles(g)` |
| `src/game/scene/paintBuilder.ts` | 304 | Array-writing primitive builder (box, span, cyl, bar, hull, gable, sphere, mound, loft, within) producing non-indexed position/normal/color | `type Paint`, `interface Turn`, `class PaintBuilder` |
| `src/game/scene/palette.ts` | 179 | `woodland()`: the shared "how wooded is this spot" field. The rest (`PAL`, `groundColor`) is the old v1 palette and has no caller | `interface BiomePalette`, `PAL`, `woodland(biome, seed, x, z, ad, relief, withBelt?)`, `groundColor(...)` |
| `src/game/scene/landmarks.ts` | 193 | Six hero landmark models, one mesh each, cached per kind | `class LandmarkView { update(s, px, pz); nearestKind; nearestDist; static SPACING }` |
| `src/game/scene/beacons.ts` | 130 | Lighthouse lamps (2 beam meshes + glow per lighthouse) | `class BeaconView { update(s, time, dark); lit }` |
| `src/game/scene/faunaView.ts` | 251 | Classic game only: up to 18 box-animals rewritten into one dynamic mesh every frame | `class FaunaView { update(camX, camZ); shown }` |
| `src/game/scene/siteThings.ts` | 84 | Classic game only: hands site containers/loose items/fuel to the old player registries | `class SiteThings { update(px, pz); moved(site) }` |
| `src/game/render/triGrid.ts` | 255 | Uniform-grid ray/triangle acceleration for one geometry (used by the grime tools, not by streaming) | `interface TriHit`, `class TriGrid`, `triGrid(g)`, `castMesh(mesh, origin, dir, far)` |
| `src/game/modcar/stream.ts` | 83 | **Not world streaming.** The liquid stream from a can's spout to a filler | `class LiquidStream { update(dt, from, to, colour, dir); dispose() }` |
| `src/game/modcar/siteArt.ts` | 756 | ModCar's drawing of places: GLB models chosen per site object, merged per material; movers (doors, drawers, lids) and pump nozzles kept separate | `PLACE_MODELS` (67 names), `interface PlaceModel`, `placeModelOf(o, site)`, `PLACE_GLOSS`, `class SiteArt { ready; doors; kitModel(name); draws(o, site); loaded; pumpNozzle(to); pumpTelemetry(); open(id); update(dt, world, x, z); telemetry(); openOf(id) }` |
| `src/game/modcar/buildingKit.ts` | 545 | Assembles a building from 42 kit pieces as placement matrices (pure, no GPU) | `type DoorName`, `interface KitPiece/KitLeaf/KitOpening`, `KIT_PIECES`, `COATS`, `coatOf(o)`, `SIGN_INK`, `kitSeed(siteSeed, i)`, `buildingKit(o, seed)`, `leafMatrix(l, a, out)` |
| `src/game/modcar/floorGround.ts` | 77 | Wheels' ground wrapper: a `Solid` flagged `floor` and no more than 0.35 m above the land becomes the ground | `FLOOR_STEP`, `class FloorGround implements Ground` |
| `src/game/modcar/places.ts` | 615 | Gameplay side of places: containers, pumps, loose things; comes within 80 m, goes beyond 190 m | `type SavedThing`, `interface PlacesSave`, `heldOfFound`, `savedOf`, `heldOfSaved`, `class PlaceContainer`, `isContainer`, `interface PlacesHost`, `class Places` |
| `specs/render/*.json` | 12 files | Screenshot gates: 300 draw calls and 1.5 M triangles per frame for every world set; `world.json` adds `stream_max_build_ms <= 10`, `stream_max_pending <= 60` | data |

Files outside the list that this area cannot be understood without:

| Path | Lines | Why it matters here |
|---|---|---|
| `src/game/render/core.ts` | 136 | `RenderCore`: floating origin (`place`, `onRebase`, `maybeRebase`), `QUALITY` tiers, `stats`, the frame's three scene renders |
| `src/game/render/style.ts` | 206 | `paletteUniforms`, `setSlotBiome`, `showChapters`: the four palette slots; `STYLE.grass` numbers |
| `src/game/render/shadow.ts` | 155 | Two nested shadow maps drawn with `scene.overrideMaterial`; `castShadows`, layers 1 and 2 |
| `src/game/render/materials.ts` | 945 | `grassMaterial`, `flowerMaterial`, `foliageMaterial`, `farWoodsMaterial`, `rockMaterial`, `groundShadowMaterial`, `surfaceMaterial` |
| `src/game/render/terrainMaterials.ts` | 521 | `terrainMaterial`, `roadStripMaterial`, `wireMaterial`, `terrainClamp` (a height texture read in the terrain vertex shader) |
| `src/game/render/carMerge.ts` | 408 | `mergeCarParts`: how a place's cloned models become one mesh per material |
| `src/game/modcar/ModGame.ts` | 4633 | Wiring: `makeWorld` 870-904, `buildWorldAround` 1123-1135, per-frame updates 3537-3552 and 4052-4066 |
| `src/game/modcar/seamless.ts` | 65 | `modcarWorld(seed, o)`: the world the live game uses (dead-end road, yard plot, proving-ground plot) |
| `src/core/world/terrain.ts` | 625 | `World.shape()`: the one height/biome/water function every builder samples |
| `harness/sim/buildtime.ts` | 39 | Times the builders in Node: proof that they run without DOM or GPU |

---

## 3. Lifecycle and data flow

### 3.1 Start-up

1. `ModGame` constructor (`ModGame.ts:411-478`) creates `RenderCore` (renderer with `logarithmicDepthBuffer: true`, half-float MSAA frame, two shadow maps on med/high, sky dome).
2. `makeWorld()` (`ModGame.ts:870-904`) builds the world with `modcarWorld(seed, {chapterScale, startBiome})`, then `ProvingView`, `WorldView`, `SiteArt` (which starts fetching all 67 place GLBs and 42 kit GLBs, 8.8 MB on disk), `Doors`, `LandmarkView`, `BeaconView`, and sets `worldView.skipObject`.
3. `WorldView`'s constructor builds 15 `ShaderMaterial`s, the plant templates (`buildScatterKinds()`: 10-20 ms measured in Node), the grass tuft, flower and woods-card templates, and registers one `core.onRebase` listener.
4. `populate()` awaits `siteArt.ready` so that nothing is drawn twice, then `buildWorldAround()` (`ModGame.ts:1123-1135`) loops `wv.update(x, z, 40)` with `setTimeout(0)` between turns until `pending === 0` or 15 s have passed. Emulated total for everything wanted at one spot: 350-750 ms of builder time, cold.

### 3.2 Every frame

Order inside `ModGame`:

- `ModGame.ts:3537-3552`: `wrecks.update`, `places.update`, `siteArt.update`, `doors.update`.
- `updateViews` (`ModGame.ts:3852`): vehicle views, `core.maybeRebase(fx, fy, fz)` (limit 1024 m, snapped to 256 m; every listener re-places its objects), camera, shadow focus.
- `ModGame.ts:4052-4066`: `worldView.update(fx, fz, 3.5)` and `provingView.update(dt, fx, fz, 2)`. After a developer teleport the budgets are 45 and 30 ms for up to 4 s behind a fade.
- `landmarks.update(s, fx, fz)` (`ModGame.ts:4084`), then the environment.
- `core.render(time)` (`core.ts:111-130`): shadow pass = two full scene traversals with an override depth material (near cascade radius 5.5 m on layer 2, far cascade radius 92 m on layer 1, centred 55 m ahead of the camera); then the scene into the HDR target; then 13 full-screen passes on med/high (5 bloom down, 4 bloom up, 1 finish, 3 SMAA). `renderer.info` is reset once per frame, so `core.stats.calls` counts all of these.

`fx, fz` is the seated vehicle's position or the walker's, not the camera's.

### 3.3 `WorldView.update(cx, cz, budgetMs)` (`worldView.ts:646-663`)

1. If the focus moved at least 14 m since the last plan (or `planX` is `NaN`), run `plan()`.
2. While jobs remain: `shift()` one, run it, record `maxBuildMs`; stop once `performance.now() - t0 > budgetMs`. The check comes after the job, so a frame can overrun by one whole job.
3. If anything ran, `pruneTerrain()`.

`plan()` (`worldView.ts:156-403`):

- Projects the focus onto the road (`sCam`) and calls `showChapters()` (palette slots, section 3.9).
- Fills eight "want" maps (strips, terrain, scatter tiles, grass, woods, seas, sites, water).
- Drops at once everything that is no longer wanted, except terrain leaves, which wait until whatever covers them exists (`pruneTerrain`, 406-429).
- Forgets half-finished sliced builds that are no longer wanted (309-314).
- Builds a new job array and sorts it by priority. Priorities are distances with per-kind weights: strips `dist * 0.5`, terrain `dist`, scatter `dist + 150`, grass `dist + 60`, woods `dist * 0.5 + 400`, water `dist * 0.6 + 120`, sea `dist * 0.4 + 150`, sites `dist * 0.5 + 90` (lines 368-398). Speed and heading play no part.

A job re-checks that its piece is still wanted, builds the geometry synchronously, wraps it in a `Mesh` / `InstancedMesh`, and calls `add()` (136-142), which stores the world anchor in `userData.w`, places the object relative to the floating origin and adds it to one `Group` named `world`. When a job replaces a piece of another LOD, the old piece is dropped in the same call, after the new one has been added.

Sliced builds (`slice()`, 500-514): a generator is advanced until 2 ms have passed, then a continuation job is put at the front of the queue. A re-plan throws the queue away; the generator survives in `this.slicing` and resumes when its ordinary job comes round again.

GPU upload is not a step of its own: three uploads an object's buffers the first time that object passes frustum culling. The stream budget does not see that cost and nothing measures it.

### 3.4 The chunk scheme

`vs` is `QualitySettings.viewScale` (1 high, 0.85 med, 0.6 low).

| Layer | Key | Cell | Wanted range | LOD or variants | Geometry of one piece | Build | Casts shadow |
|---|---|---|---|---|---|---|---|
| Road strip | chunk index `c`; far groups `g + 0.5` | 32 stations x 2 m = 64 m of road, +-40 m across, skirt at +-44 m dropped 1.6 m | arc `s` from `sCam - 520` to `sCam + 3400 vs` | by distance of the chunk centre: lod0 under 380 m (33x23 vertices, 1408 tris); lod1 under 1000 m (17x23, 704 tris); lod2 from 1000 m (9x13, 192 tris); "lod3" is four far chunks in one mesh (33x13, 768 tris) when the whole group is beyond 1000 m | position, normal, `aBiomeW`(4), `aGround`(4), `aRoad`(4), Uint16 index | one job | no |
| Poles, wires, signs, delineators, guard rails | rides on strip `c` when `c % 4 == 0` and lod <= 1 | 4 chunks = 256 m | as lod0/lod1 strips | none | one `PaintBuilder` mesh plus one `LineSegments` for wires | same job as the strip | poles yes |
| Terrain | `level/ix/iz` | quadtree leaves of 8192 m (level -2), 4096, 2048, 1024, 512, 256 m (level 3) | roots within 20 km x vs (box distance) | levels below 0 split when within 6000 m x vs; levels 0-2 split when within 6000 m x vs and nearer than 1.2 x their size | 33x33 grid + 4x33 skirt = 1221 vertices, 2304 tris; position, normal, `aBiomeW`, `aGround`; one shared Uint16 index | one job | no |
| Scatter (trees, bushes, rocks, cacti) | `tx,tz` | 128 m tile, 8 m cells (256 per tile) | tile centre within 780 m x vs | near (centre within 230 m): full models; far: `broadleafFar` / `coniferFar` only | one `InstancedMesh` per plant kind present; `instanceColor` = (slot a, slot b, share of b) | one job | yes, far layer |
| Grass and flowers | `gx,gz` | 40 m tile, 0.36 m cells (111 x 111 = 12 321) | box distance under 66 m; only when `density >= 0.6` (not on low) | near (under 30 m): every tuft, plus flowers; far: tufts whose `keep < 0.35` | `InstancedBufferGeometry`: 8-triangle tuft, `aRoot`(4) and `aInfo`(4) per tuft; flowers the same with a 5-triangle template | sliced | no |
| Far woods | `tx,tz` | 2048 m tile, 44 m cells (47 x 47) | box distance under 4000 m x vs | none; the shader fades cards in over 380-520 m and out over 3500-4000 m from the camera | instanced 2-triangle card, `aRoot`, `aInfo` | sliced, one row per step | no |
| Lake | `L<slot>` | the whole lake | shore within 5200 m x vs | none | grid of at most 64 x 44 cells; position, `aWater`(4); index of wet cells only | 6 rows per turn | no |
| River | `R<slot>/<chunk>` | 512 m of river, 65 rows x 7 columns | within 3800 m x vs | none | as lake | one job | no |
| Bridge | `B<slot>` | the whole bridge | within 1500 m x vs of arc | none | `ModelBuilder` merged mesh, vertex colours | one job | yes |
| Sea | `<chapter>/<i>` | 1000 m of road x 18 columns out to 16 km | within 12 km x vs along the road | rows every 20 m when the shore is nearer than 700 m, else every 50 m | as lake | sliced, 5 rows per step | no |
| Site | `site.id` | one site | `s` in `[sCam - 1600, sCam + 2600 vs]` and nearer than 2400 m x vs (roadside litter 1000 m x vs) | none | one `PaintBuilder` mesh | sliced, one object per step | yes |

Notes that follow from the code:

- Terrain under the road is lowered by `stripSink` (2.2 m inside 32 m of the centre line, back to 0 at 44 m) so the strip mesh always lies above it. LOD seams are hidden by skirts, never stitched.
- Terrain leaves with a step of 16 m or more (every level except the finest) raise the surface by 6.5 / 9 / 11 m x woodland so distant forest has a silhouette (`worldBuild.ts:259-275`). That starts where the 512 m leaves start, at least 614 m out.
- Scatter positions come from `hash2(cellX, cellZ, seed + 0x7ee5)` on world cells, so a tile changing LOD never moves a tree. LOD is chosen per tile and the swap is a rebuild: there is no cross-fade.
- Far-woods cards stand only where the road is at least 430 m away (`worldBuild.ts:1055`). They are a belt beside the road, placed by distance from the road and faded by distance from the camera.

### 3.5 What is built per piece, how, and the time it takes

Measured (Node), seed 7. "Avg" and "worst" are over the pieces wanted at one spot or over a 3 km drive.

| Piece | Steps | Avg ms | Worst ms | Sliced? |
|---|---|---|---|---|
| Strip lod0 | 33 x 23 `World.shape()` calls, exact road normals, finite-difference land normals | 1.4-2.0 | 2.7 | no |
| Strip lod1 | 17 x 23 samples | 0.7-1.7 | 12.1 once, cold | no |
| Strip far group | 33 x 13 samples | 0.9-1.0 | 2.6 | no |
| Poles + signs + furniture | `PaintBuilder` bars and boxes; `world.furniture.between()` | 0.5-1.7 | 3.7 | no |
| Terrain leaf | 35 x 35 padded samples, `groundAttrs` (1-2 `woodland` noise lookups per vertex) | 1.2-2.0 | 6.6 (level -2) | no |
| Scatter tile | 256 cells, 2 hashes and 1 `shape()` each | 0.3 | 1.4 | no |
| Grass tile, near | 21 x 21 sample grid (yield every 4 rows), then 12 321 cells (yield every 8 rows) | 3.9-6.7 | 11.4 | yes, 2 ms turns |
| Grass tile, far | same, 35 % of the tufts | 1.6-2.9 | 5.0 | yes |
| Far-woods tile | 2209 cells, 1-4 `shape()` each | 2.0-5.7 | 8.8 | yes |
| Lake | rows of `shape()` | 0.9-2.0 | 2.6 | 6 rows per turn |
| River length | 65 x 7 samples | 0.5 | 0.8 | no |
| Bridge | swept slab, arches or truss via `ModelBuilder` | 3.2 | 3.2 | no |
| Site, classic drawing | one `draw()` per object | 2.1 | 7.0 | yes |
| Site in ModCar | everything skipped | 0.05 | 0.3 | yes |

`World.shape()` itself costs 0.7-1.3 microseconds per call (measured, Node). Grass tiles 25 m off the road, measured in Node:

| Biome | 21 x 21 sample grid alone | Near build | Tufts per near tile | Far build | Tufts per far tile |
|---|---|---|---|---|---|
| plains | 0.48 ms | 4.94 ms | 10 100 (max 11 368) | 1.97 ms | 3 550 |
| forest | 0.53 ms | 4.41 ms | 6 470 | 1.81 ms | 2 270 |
| desert | 0.34 ms | 1.91 ms | 790 | 1.14 ms | 270 |

The per-tuft loop, not the terrain sampling, is the cost: the grid is about a tenth of a near build, and walking 12 321 cells costs 1.5 ms even where almost nothing grows. The comment at `worldBuild.ts:922` ("this grid is the dearer half") no longer holds.

Budgets in force:

- 3.5 ms per frame for `WorldView` (`ModGame.ts:4063`; classic `game.ts:565`; viewer `viewer.ts:470`).
- 2 ms per frame more for `ProvingView` (`ModGame.ts:4064`), which has its own scheduler.
- 2 ms per sliced turn (`SLICE_MS`, `worldView.ts:23`).
- 40 ms per turn while loading (at most 15 s), 45 ms per frame for 4 s after a teleport, `Infinity` in the viewer's shot mode.
- Gate: `stream_max_build_ms <= 10`, `stream_max_pending <= 60` (`specs/render/world.json`), measured only by the classic game's `__rt.drive` (`src/game/main.ts:222-245`). Recorded: 4.6 ms and 14.

### 3.6 What runs on the main thread

All of it:

- every `World.shape()` sample and every builder above;
- `SiteArt.draw(site)`: cloning up to 178 GLB scenes and merging about 52 000 triangles for a house, in one call, not sliced, not budgeted (`siteArt.ts:524-663`);
- GLB parsing (`GLTFLoader`, `assets.ts:25`), wreck spawning (a whole vehicle; docs/MODCAR.md section 19 says about 5 ms a frame while one is near);
- three's scene traversal, three times per frame (two shadow cascades and the main pass), each calling `scene.updateMatrixWorld()`; `WorldView.add()` sets `matrixAutoUpdate = true`, so every world piece recomposes its matrix on each of them although pieces only move on a rebase;
- buffer uploads at first draw; shader compilation at first use (no `compileAsync` for world materials).

### 3.7 How each kind of thing is produced and drawn

**Grass** (`grassSlices`, `worldBuild.ts:878-1005`; `grassMaterial`, `materials.ts:728-813`)

- A 2 m grid of world samples per tile holds height, road distance, growth, lushness, size, flower amount, palette slots, mowing and "bare" (water, bridge, site ground, plot).
- For each 0.36 m cell: a hash gives `keep`, the position in the cell and the dice; far tiles skip cells with `keep >= 0.35`; growth is interpolated from the grid, with special bands on the old road (centre crack, pavement edge, shoulder); surviving tufts push root + size into `roots` and (slot pair + lawn, share, keep, turn) into `info`. The turn comes from a 60 m noise so a meadow is combed one way.
- Drawn as one instanced mesh per tile with a fixed bounding sphere of 36 m. The vertex shader shrinks tufts with `keep >= 0.35` to nothing over 20-28 m and all tufts over 50-64 m, bends them with the wind global `uWind` and a gust noise, and reads the same stroke textures as the ground so grass and ground are one paint.
- 8 single-triangle blades per tuft at every distance. In the plains a near tile holds about 10 000 tufts (80 000 triangles) and a far tile about 3 500. Emulated at the plains spot: 92 000 tufts in the 16 tiles round the camera, 463 000 grass triangles in view.

**Flowers** (same generator; `flowerMaterial`, `materials.ts:816-877`)

- Near tiles only, never on the road or a lawn; a 46 m noise makes drifts; roughly one tuft in 6 (in a drift) to one in 80 gets a flower.
- 5 triangles each: a stalk and two crossed quads cut into an eight-petal shape by `discard`. Colour is one of three per palette slot.

**Trees, bushes, rocks, cacti** (`buildScatter`, `worldBuild.ts:371-496`; `buildPlants`, `vegetation.ts:184-262`)

- Templates are built once: `broadleaf` 454 triangles, `broadleaf2` 368, `broadleaf3` 502, `broadleafFar` 76, `conifer` and `conifer2` 274, `coniferFar` 74, `bush` 116, `bushFar` 34 (never used), `cactus` 434, `rock` 20. Non-indexed, 52 bytes per vertex.
- Placement is an `if / else` chain on the biome id string (plains, forest, lakes, maple, alpine, else desert), using `woodland()` and two grove/hedge noises. Nothing grows within 7.5 m of the road, in water, on site ground or on a plot; a coast keeps its view.
- Far tiles turn every tree into `broadleafFar` / `coniferFar`, turn bushes into a sunk far tree, and drop rocks. Cacti keep their full 434-triangle model in far tiles (emulated in the desert: 101 far tiles, 164 000 triangles).
- Drawn with `foliageMaterial` (two instances: broadleaf and evergreen) or `rockMaterial`. Leaf cards are alpha-tested against a canvas texture; the shadow pass repeats the test with its own material.
- With shadow maps off (low quality) each tree also gets a ground disc pushed away from the sun. The offset is baked from `globals.uSunDir` at build time (`worldBuild.ts:376, 388-392`) and never updated.

**Far forest cards** (`woodsSlices`, `worldBuild.ts:1033-1092`; `farWoodsMaterial`, `materials.ts:884-944`)

- One card per 44 m cell where the wood is thick, the road is at least 430 m away and the relief is below the treeline; sunk at least 8 m so its flat foot never shows on a slope. Where water may be near, the true land is asked before a card is stood.
- Drawn as camera-facing quads 38 m x 27 m x size from a 1024 x 256 canvas texture of four crown-mass variants (red = how lit, green = coverage), coloured with the slot's four wood greens. Emulated: 19 000-35 000 cards in 21-23 tiles.

**Far terrain ring** (`buildTerrain` with `level < 0`)

- 8192 m leaves (256 m grid) out to 20 km, and 4096 m leaves (128 m grid) where a ring leaf comes within 6 km. Sampled with `shape(..., coarse = true)`: no near-field relief and no lakes or rivers, but the sea is included.
- Same material as near terrain. The fragment shader lights far ranges from the side beyond 1.2-4.5 km, the fog closes between 15 and 19.5 km, and alpha drops to 0.5 beyond 0.9-1.4 km so the paint finish leaves far land alone.
- Emulated at one spot: 23 + 10 ring leaves, 33 draw objects, 2.2 MB of vertex data.

### 3.8 The draw calls and triangles of a typical frame

Recorded totals (`loop/metrics`, high quality, earlier GPU runs):

| Set | Draw calls | Triangles |
|---|---|---|
| `render_modcar_road` (16 shots, seed 7, s = 3180) | 260-388 | 0.85-1.33 M |
| `render_modcar_garage` (29 shots) | 238-566 | 1.03-1.54 M |
| `render_modcar_rv` (7 shots) | 395-432 | 1.46-1.57 M |
| `render_world` (classic, 19 shots) | 211-268 | 0.33-1.21 M |

Emulated share of `WorldView` alone, high quality, seed 7:

| Spot | Biome | Pieces held | Triangles held | Main-pass draws | Far-cascade draws | Triangles submitted | Vertex data held |
|---|---|---|---|---|---|---|---|
| s = 3180 | plains | 441 | 1.80 M | 187 | 25 | 0.90 M | 18.8 MB |
| s = 15 000 | desert | 378 | 0.69 M | 152 | 22 | 0.28 M | 13.9 MB |
| s = 30 000 | alpine | 459 | 1.27 M | 182 | 32 | 0.64 M | 17.1 MB |
| s = 64 000 | forest | 475 | 2.16 M | 188 | 51 | 1.35 M | 18.5 MB |
| s = 76 000 | maple | 442 | 2.03 M | 191 | 38 | 1.09 M | 17.9 MB |
| s = 3180, med | plains | 380 | 1.38 M | 163 | 25 | 0.70 M | 16.3 MB |
| s = 3180, low | plains | 283 | 0.62 M | 125 | 0 | 0.23 M | 11.9 MB |

Make-up at the plains spot (held / in the camera frustum / in the far cascade):

| Cause | Held | In frustum | Far cascade | Triangles submitted |
|---|---|---|---|---|
| Terrain leaves (L3 48, L2 36, L1 24, L0 47, L-1 10, L-2 23) | 188 | 70 | 0 | 161 000 |
| Scatter tiles x kinds (far 105, near 32) | 137 | 46 | 22 | 146 000 main + 68 000 shadow |
| Road strips (lod0 12, lod1 12, lod2 3, groups 9) | 36 | 28 | 0 | 24 000 |
| Poles and wires | 12 | 10 | 2 | 3 000 |
| Grass tiles (near 7, far 9) and flowers (7) | 23 | 15 | 0 | 479 000 |
| Far-woods tiles | 22 | 11 | 0 | 16 000 |
| Water (3 lakes, 12 river lengths, 1 bridge) | 16 | 3 | 0 | 7 000 |
| Site meshes, all of them empty | 7 | 4 | 1 | 0 |
| **World view total** | **441** | **187** | **25** | **0.90 M** |

So at that spot roughly 212 of the 360 calls recorded for the cockpit shot are the world view. The rest is outside this area: the vehicle (one merged mesh per material name, each in up to three passes, plus moving parts), 13 post passes, sky, clouds, weather, and within 420 m of a place its models (section 3.11). Grass is a little over half of all triangles in green country.

The audit's 420-510 calls is higher than any recorded road frame and matches the recorded garage frames (the default start, where the workshop, its yard and four vehicles are in view); docs/MODCAR_REPORT.md:107 also says "about 470 draws in the garage". That reading is an inference, see Open questions.

### 3.9 The four rolling palette slots

Source: `src/game/render/style.ts:136-206`, `src/game/render/paint.ts`.

- `SLOTS = 4`. Eleven uniform arrays (`uGroundPal` 3 per slot, `uDryPal`, `uWarmPal`, `uCoolPal`, `uFarLiftPal`, `uForestPal` 4 per slot, `uRockLitPal`, `uRockShadePal`, `uFlowerPal` 3 per slot, `uBiomeMisc`, `uBiomeMisc2`) are spread into every material through `globals`.
- A chapter of the journey owns slot `chapter & 3`. `showChapters(biomeOf, chapter)` loads the chapter behind, the current one and the two ahead. It is called from `WorldView.plan()` (`worldView.ts:164`), so at most every 14 m, and `setSlotBiome` does nothing when the slot already shows that biome.
- Geometry never stores a biome, only slots:
  - terrain and strip vertices: `aBiomeW` = four weights, written by `groundAttrs` (`worldBuild.ts:61-63`) as `1 - bt` on slot `ca & 3` and `bt` on slot `cb & 3`;
  - scatter instances: `instanceColor = (ca & 3, cb & 3, bt)` (`worldBuild.ts:385`);
  - grass: `aInfo.x = (ca & 3) + 4 (cb & 3)` plus a mowing fraction, `aInfo.y = bt` (`worldBuild.ts:916-918, 979`);
  - flowers: one slot in `aInfo.w`; far-woods cards: the pair and the share (`worldBuild.ts:1073-1084`).
- The shader turns that into four weights (`rtSlotW`, `rtSlotPair`) and mixes every palette entry (`rtPal`). A blend between two biomes is always a blend between two different slots because neighbouring chapters differ modulo 4.
- What this assumes: any geometry on screen belongs to one of four consecutive chapters. Chapters are bands in x, 10-18 km long after a first one of 6-9 km (`spine.ts:74, 88`), times `chapterScale`. Terrain reaches 20 km, so land two chapters behind can already be painted with the palette of the chapter two ahead; the fog (complete at 19.5 km) hides it today.
- The look of a biome is data: `specs/art/style.json` `biomes.<id>` (`BiomeStyle` in `style.ts:30-54`) indexed in the order of `BIOMES`.

### 3.10 Memory lifetime and disposal

- A piece's typed arrays are created by its builder and handed to `BufferAttribute`s. Nothing uses `onUpload`, so the JavaScript copy lives as long as the GPU copy. Emulated: 14-19 MB of vertex and instance data held by `WorldView` at high quality, two thirds of it terrain (188 leaves x 1221 vertices x 56 bytes).
- `drop(piece)` (`worldView.ts:144-152`): removes each object from the group; a `Mesh` or `LineSegments` gets `geometry.dispose()`; an `InstancedMesh` gets `mesh.dispose()` (three frees its instance buffers and its vertex-array objects) and its geometry, a shared template, is kept.
- When things are dropped: at the next plan after they leave their range (strips, scatter, grass, woods, seas, sites, water); terrain leaves once covered; a replaced LOD immediately after its replacement is added.
- Shared and never freed: the 15 materials, the 11 plant templates, tuft / flower / card / disc templates, the terrain index, landmark geometries per kind. `WorldView` has no `dispose()`, and its `onRebase` listener can never be removed (`core.ts:86-88` only appends).
- Each `geometry.dispose()` of a terrain leaf also deletes the GL buffer of the shared index attribute (three's `WebGLGeometries.destroyGeometry` removes `geometry.index`); three recreates it at the next terrain draw. Read from three's source, not observed on a GPU.
- `SiteArt.drop` (`siteArt.ts:685-699`) disposes merged geometries, the place's `CarLook`s and pump hose tubes; cloned movers share geometry with the cached GLB and are only detached. The GLB cache (`assets.ts:300`) is kept for the session.
- Every grass tile clones the tuft template's three attributes (`worldView.ts:488`), so a tile owns five small GPU buffers.

### 3.11 How places and buildings are assembled and merged

Classic path, still the default for anything ModCar does not draw:

- `siteSlices(site, skip)` (`siteBuild.ts:1376-1390`) puts each `SiteObject` in its own frame (`Euler(roll, -yaw, pitch, 'YZX')` about the site's anchor) and calls `draw()`, a `switch` on `o.kind` with about 50 cases and a grey-box default. A building is several hundred boards and sheets written straight into arrays by `PaintBuilder`. One generator step per object. Result: one non-indexed mesh per site with `surfaceMaterial({vertexColors, brush})`, or the snow-capped twin when `site.biome === 'alpine'` (`worldView.ts:619`).

ModCar path:

- `SiteArt` loads `places/<name>.glb` for 67 models and `places/kit/<name>.glb` for 42 kit pieces. `draws(o, site)` is true for a building once every kit piece has loaded, and for any object whose `placeModelOf` models have loaded.
- `ModGame.ts:899` sets `skipObject` to: wrecks (they are vehicles), a garage's workbench (it is the working one), and whatever `SiteArt.draws`. Of the classic kinds only `lighthouse` and `wallrun` have no model, so in ModCar the `WorldView` site mesh is usually empty.
- Every 0.6 s `SiteArt.update` draws sites nearer than 420 m (less their `reach`) and drops those beyond 560 m.
- `draw(site)` (`siteArt.ts:524-663`):
  1. For a building, `buildingKit(o, kitSeed(site.seed, i))` returns matrices in the object's frame for walls round their openings, jambs, lintels, sills, windows, shutters, corner posts, plinth, cornice, roof modules sheared to the pitch, ridge, verges, porch or awning, floor, sign and pictogram. Door leaves are left to `doors.ts`.
  2. For other objects, `placeModelOf` picks a model, or a module repeated every 2 m with a variant, a last piece and an end cap (fences, rails, jetties), scaled to the object's exact size.
  3. Each piece is `cloneModel`-ed, given its matrix and pushed as a `MergePart` with two paints and wear values. Brand colours come from the site seed, others from a per-object hash.
  4. `mergeCarParts(parts, root, {skip})` (`carMerge.ts:205-221`) clones every geometry, bakes its matrix, writes per-vertex `aPaint`, `aWear`, `aPartId` and float AO, and merges per conventional material name. The result is one mesh per material name present.
  5. Movers (`userData.move` = hinge / slide) of containers and a pump's `NOZZLE` / `HOSE` are re-attached as separate objects with their own `CarLook`; the place gets one `CarLook` of its own (`matte: 0.22`).
  6. `applyMaterials(merged, look, true)` puts every opaque mesh on both shadow layers.
- Size of a place, computed from the GLB files and the site plans (seed 7, first 80 km: 143 sites, 60 of them real places, one every 1.33 km):

| Kind | Sites | Pieces cloned | of which kit | Merged meshes (draws) | Triangles | Movers |
|---|---|---|---|---|---|---|
| house | 13 | 173 (max 178) | 151 | 11 | 52 000 (max 54 700) | 7 |
| shop | 7 | 92 | 81 | 13 | 48 200 | 3 |
| station | 4 | 66 | 51 | 14 | 41 400 | 11 |
| garage | 6 | 64 | 52 | 12 | 34 500 | 9 |
| works | 1 | 81 | 69 | 11 | 37 600 | 6 |
| camp | 20 | 10 | 0 | 11.5 | 18 900 | 2.5 |
| jetty | 5 | 11 | 0 | 7 | 12 200 | 2 |
| hide | 4 | 6 | 0 | 8 | 10 700 | 1 |
| roadside | 83 | 1 | 0 | 1.3 | 1 100 | 0.4 |

  A place therefore costs 11-14 draw calls in the main pass, the same again in the far cascade when it is within about 92 m, again in the near cascade within 5.5 m, plus its movers and door leaves.

Other rings round a place, each with its own timer:

| Client | File | Comes / goes | Checked |
|---|---|---|---|
| Gameplay (containers, pumps, loose things, roadside workshop) | `places.ts` | 80 m / 190 m | every 0.5 s |
| Wrecks as vehicles | `wrecks.ts` | 230 m / 420 m | every 0.4 s, one spawn at a time |
| Place models | `siteArt.ts` | 420 m / 560 m | every 0.6 s |
| Door leaves | `doors.ts` | with `SiteArt` | - |
| Classic site mesh | `worldView.ts` | 2400 m (roadside 1000 m) | every 14 m moved |

---

## 4. Extension points that exist today

| Name | Where | How it is used |
|---|---|---|
| `WorldView.skipObject` | `worldView.ts:106`, read in `makeSite` 617 | A game takes over the drawing of some site objects. Evaluated once, when the site mesh is built |
| `WorldView.redrawSite(id)` / `redrawFurniture(s)` | `worldView.ts:601-610`, `582-598` | Gameplay changed something drawn (a car shoved a crate or flattened a post): rebuild that piece |
| `Slices<T>` + `finish()` + `WorldView.slice()` | `worldBuild.ts:859-867`, `worldView.ts:500-514` | Any builder written as a generator that yields becomes time-sliced. `ProvingView` reuses the same type |
| `WorldOptions.plots: Plot[]` | `src/core/world/terrain.ts:84-101` | Caller-owned ground: `height(x, z)`, optional `bare(x, z)` and `grass(x, z)`. Honoured by the strip, terrain, scatter, grass and pole builders. Used by the workshop yard and the proving ground |
| `terrainClamp` | `terrainMaterials.ts:211-215` | A height texture, read in the terrain vertex shader, that holds land vertices down under ground a caller draws. The only existing vertex-texture path |
| `QualitySettings` | `core.ts:16-34` | `viewScale`, `density`, `shadowSize` are read by `WorldView` at plan and build time |
| Floating origin | `core.ts:82-109` | `core.place(obj, wx, wy, wz)` and `core.onRebase(fn)`: every view that owns scene objects registers one |
| Shadow casting | `shadow.ts:150-155` | `castShadows(obj, near?)` enables layer 1 (far map) and optionally layer 2 (near map) |
| Palette slots and biome looks | `style.ts:147-200`, `specs/art/style.json` | `showChapters`, `setSlotBiome`; a biome look is a JSON entry |
| Material factories | `materials.ts`, `terrainMaterials.ts` | `surfaceMaterial(SurfaceOptions)`, `foliageMaterial({sway, snowCap, evergreen})`, `grassMaterial(fade, keepFar)`, `farWoodsMaterial(fade)`; all spread the same `globals` |
| `PaintBuilder` | `paintBuilder.ts` | Vocabulary for flat-painted props, shared with the vehicle kit's `ModelBuilder` |
| Site object drawing | `siteBuild.ts:968-1362` | `switch (o.kind)`; an unknown kind draws a grey box instead of failing |
| Place models | `siteArt.ts:30-98, 116-190, 193-274` | `PLACE_MODELS`, `placeModelOf`, `PAINTS`, `PALETTE_OF`; GLB conventions: node `PART` with `userData.size`, `userData.move` = hinge / slide / free with `axis` and `open`, nodes `NOZZLE`, `HOSE`, `M_hose`, `M_nozzle` |
| Building kit | `buildingKit.ts` | `KIT_PIECES`, `buildingKit(o, seed)` returning pieces and door openings, `COATS` |
| Host interfaces | `places.ts:117-138`, `doors.ts` `DoorHost` | What a place needs of the game; devices (`GarageDevice`) and tanks (`TankPort`) are how an interactable thing is offered to the player |
| `FloorGround` | `floorGround.ts` | Any `Solid` with `floor: true` at most 0.35 m above the land is driven onto |
| Landmarks | `landmarks.ts:19-128`, `src/core/world/landmarks.ts` | One cached geometry per `LandmarkKind`, instances by yaw and scale |
| Telemetry | `worldView.ts:665-671`, `siteArt.ts:702-712`, `places.ts:574-581`, `core.ts:132-135` | `pending`, `counts`, `maxBuildMs`, `totalBuilds`; `core.stats`; `window.__rt.worldPending()` (`entry.ts:685`) |
| Gates | `specs/render/*.json`, `harness/shots/sets/*.json`, `harness/shots/run.mjs:60-82` | A shot set plus a spec file with `max_draw_calls`, `max_triangles` |

There is no event bus. Modules are joined by host interfaces and by fields on `ModGame`.

---

## 5. Invariants and the tests that guard them

| Invariant | Where it is stated or enforced | Guarded by |
|---|---|---|
| What is drawn is what is driven on: every mesh samples `World.shape()` | header of `worldBuild.ts`; terrain uses `bed`, strip uses `h` on the road | no unit test; screenshot sets only |
| Placement depends on world cells, never on tile or LOD | `worldBuild.ts:370`, hashes at 401, 942, 1047 | no test |
| No holes: a replacement exists before the old piece goes; terrain is pruned only when covered | `worldView.ts:1-5, 405-429, 447-449, 480-482, 635-637` | no test |
| No single build step holds up a frame | `SLICE_MS = 2`; `specs/render/world.json` `stream_max_build_ms <= 10`, `stream_max_pending <= 60` | browser gate, classic game only |
| Frame budget: 300 draw calls, 1.5 M triangles (high) | `specs/art/STYLE.md` section 10, `specs/art/style.json` `budget`, 11 of the 12 files in `specs/render/` | browser gates for the classic sets; **none for any `modcar_*` set** |
| Grass triangles at most 650 000 (high) | `specs/art/style.json` `budget.high.grassTriangles` | not measured by any harness |
| Two neighbouring chapters never share a palette slot | `style.ts:136-141`, `worldBuild.ts:60-63` | no test |
| `src/core` imports no three, DOM or game code | `harness/sim/core-purity.test.ts` | unit test |
| Builders run without DOM or GPU | `harness/sim/buildtime.ts` (a tool, not a test) | by use |
| Kit buildings: every piece exists, none mirrored, doors fill their openings, nothing passes the eaves | `harness/sim/modcar_buildings.test.ts` | unit test (4 tests, run in this pass: pass) |
| Every model a site asks for exists and the variants are used | `harness/sim/modcar_siteart.test.ts` | unit test |
| A floor is ground only up to a kerb's height; cells are asked again as places come and go | `harness/sim/modcar_floor.test.ts` | unit test |
| Merging keeps per-part paint, wear, ids and shadow layers | `harness/sim/carmerge.test.ts` | unit test |
| `TriGrid` finds the same hits as brute force | `harness/sim/modcar_grime.test.ts` | unit test |
| The classic drawing and the kit building agree on openings and roof heights, so solids fit both | comments in `buildingKit.ts:7-9`; `siteBuild.ts:279-433` | door-fit test above; otherwise none |
| Site layout, water, sea, furniture (what the view consumes) | `harness/sim/{sites,water,sea,furniture,roadgen,vista,places}.test.ts` | unit tests in core |

`worldView.ts`, `worldBuild.ts`, `waterBuild.ts`, `siteBuild.ts`, `vegetation.ts`, `landmarks.ts` have no unit test. A refactor there is protected only by screenshots that need a GPU.

---

## 6. Risks for V3

1. **`WorldView` is closed.** Eight layer kinds are hard-wired in six places each: a map field, a want map, a block in `plan()`, a job loop, a `make*` method, a line in the rebase visitor. Every new streamed thing (forage nodes, flora, tracks, wonders, piers, tunnel linings, spur roads, camp props) would edit the same 672-line file, and so would every parallel engineer.
2. **The live game is already over the draw budget and nothing gates it.** Recorded ModCar frames reach 388 (road), 432 (RV) and 566 (garage) calls against a 300 budget that only the classic sets enforce. V3 adds layers on top.
3. **One draw object per tile per plant kind.** Today 137 scatter objects for 5-6 kinds. Twenty tree kinds with LODs under the same scheme would be several hundred objects, each also tested against two shadow cameras.
4. **Four palette slots.** With 25 region archetypes and a pacing director, regions shorter than about half the view distance put more than four regions on screen. The 4-vector vertex format (`aBiomeW`) and `rtSlotW`'s `vec4(0, 1, 2, 3)` bake the number in.
5. **Biome behaviour is code keyed on id strings**, in the view: `woodland()` (`palette.ts:106-139`), tree rules (`worldBuild.ts:423-488`), canopy lift (`worldBuild.ts:274`), snow roofs (`worldView.ts:619`), wreck overgrowth (`siteBuild.ts:538-564`). "Archetypes as data" has to replace all of them, and `woodland` lives in `src/game` so core systems (animals, forage) cannot ask where the woods are.
6. **Scatter is view-only.** Trees and rocks have no identity, no collision and no core-side position; they exist only as instance matrices inside `buildScatter`. Hunting (cover, line of sight, ballistics) and foraging need those positions in core.
7. **The world is modelled as a corridor seen from the road.** Far-woods cards are placed by distance from the road and faded by distance from the camera; modelled trees deliberately leave out the forest belt (`withBelt = false`, `worldBuild.ts:430`); relief fades in with distance from the road. A hunter 600 m off the road walks into painted forest that thins into sparse trees.
8. **Road indexing by x.** `World.shape()` starts from `spine.sAtX(x)`; sites, water and biomes are bands in x; the spine guards its heading to about +-60 degrees so x always grows. Hairpins and optional spur roads break that assumption, and the strip, pole, site and furniture builders are all keyed by one spine's arc length.
9. **Terrain is a height field with no holes.** Tunnels need a cut in the land and a narrowed strip. The only existing precedent is the bridge mask that folds strip columns onto the deck (`worldBuild.ts:141-146`).
10. **Shadow pass uses one override material** (`shadow.ts:137-143`). Anything whose vertices move in its own shader (instanced grass roots, billboards, wind sway) cannot cast a correct shadow, and the far map reaches only 92 m. Cascaded shadows need a per-object depth path first.
11. **Worker replicas of the world are not automatically identical.** `World` cannot be structured-cloned (closures; verified). Site layout is lazy (`terrain.ts:325`, `sites.ts:347-355`) and `padWeight` / `bareAt` return nothing for a slot not yet laid out, so `shape()` near a slot boundary can depend on what was asked before. Knocked crates and posts mutate plans on the main thread.
12. **Places have no far level of detail in ModCar and pop in at 420 m**, built in one unsliced call. Thirty site kinds and forty wonders make both worse.
13. **`logarithmicDepthBuffer`** makes every fragment shader write `gl_FragDepth` (three's `logdepthbuf_fragment` chunk), which normally disables early depth rejection. Denser multi-layer grass multiplies the overdraw that the full ground and grass shaders (nine shadow taps each) then pay for. Inferred from the shader source; not profiled.
14. **Seven independent streaming rings** (section 3.11 table plus `ProvingView` and `LandmarkView`) with their own radii, timers and budgets, some unbudgeted. Per-system budgets and a priority queue need one scheduler.
15. **Shared class, three callers.** `game.ts` (classic) and `viewer.ts` construct `WorldView` and call `update`, `redrawSite`, `redrawFurniture`, `counts`, `maxBuildMs`. Signature changes must keep them compiling.
16. **Quality is fixed at start-up** (`core.ts:60`, URL parameter). Density is baked into built grass, the shadow-disc choice into built scatter tiles; there is no invalidation call. Quality tiers that change at run time and dynamic resolution need one.
17. **Memory doubles silently**: CPU copies are kept; terrain vertices are 56 bytes each.

Smaller defects found on the way, worth fixing when the code is touched:

- `BeaconView` is constructed in `ModGame.ts:901` but `update` is never called there, so lighthouses have no lamp in ModCar (the classic game calls it at `game.ts:699`).
- `bushFar` is built and never placed; far cacti use the full model.
- Poles and signs are rebuilt whenever their strip changes LOD (emulated: 11.7 builds per km for 3.9 groups per km) although they do not depend on it.
- The comment on `buildGrassTuft` says five blades; `style.json` says 8 and 8 are built.
- `specs/art/STYLE.md` section 5 says a grass tile builds in under 1 ms; measured 3-7 ms near.

---

## 7. Proposed seams

Each seam is the smallest change that lets V3 modules plug in without touching this code again. Lines are in the files as they stand at `e50503c`.

### S1. A layer registry in `WorldView`

```ts
export interface StreamCtx { world: World; cx: number; cz: number; sCam: number; q: QualitySettings; speed: number; heading: number }
export interface Wanted<D> { variant: number; priority: number; data: D }
export interface StreamLayer<D = unknown> {
  readonly id: string;
  plan(ctx: StreamCtx, want: Map<string, Wanted<D>>): void;
  build(key: string, w: Wanted<D>, ctx: StreamCtx): Slices<LayerPiece | null>;
  cull?(piece: LayerPiece, cam: THREE.Camera): void;
  budgetMs?: number;
}
export interface LayerPiece { objects: THREE.Object3D[]; bounds?: THREE.Sphere; bytes?: number; dispose?(): void }
worldView.addLayer(layer): void
```

Additive version (no behaviour change for the eight built-in kinds): a `layers` map beside the existing fields (`worldView.ts:46-76`); one loop at the end of the want section and one in the job section of `plan()` (before the sort at 400); the same loop in the slicer clean-up (310-314), the rebase visitor (119-132) and `counts` (669-671). `drop()` (144-152) calls `piece.dispose?.()`. About 60 added lines. Forage, flora, wonders, piers, tunnel linings and camp props then live in their own files.

### S2. Builders return data, not three objects

```ts
export interface MeshData { attrs: Record<string, { array: Float32Array | Uint16Array | Uint32Array; itemSize: number }>; index?: Uint16Array | Uint32Array; origin: [number, number, number]; sphere: [number, number, number, number] }
export function toGeometry(d: MeshData, sharedIndex?: THREE.BufferAttribute): THREE.BufferGeometry
```

Split points: `buildStrip` (`worldBuild.ts:200-208`), `buildTerrain` (318-325), `buildPoles` (739-746), `LakeBuild.step` (`waterBuild.ts:88-93`), `buildRiverChunk` (167-172), `seaSlices` (250-255), `buildBridge` (505-506), `PaintBuilder.build` (`paintBuilder.ts:271-303`, add `buildData()`), `siteSlices` (`siteBuild.ts:1389`). `ScatterBatch`, `GrassTile` and `WoodsTile` are already typed arrays and need nothing. Every `ArrayBuffer` in a `MeshData` goes in the transfer list.

### S3. A world replica contract for workers

- `WorldSpec = { kind: 'modcar' | 'classic'; seed; chapterScale?; startBiome? }`; the worker calls `modcarWorld()` itself. Measured: 7 ms to construct, 20 ms to grow the spine to 100 km.
- `World.ensureFor(sMax)` (new, `terrain.ts`): grow the spine and lay out site slots up to a bound before sampling, called identically on both sides, so that lazy layout cannot differ (`terrain.ts:325`, `sites.ts:347-355`). Add a test that hashes a terrain leaf and a grass tile built on a fresh world against the same built after a long drive.
- Remove the render global from `buildScatter` (`worldBuild.ts:376, 388-392`): move the disc offset into `groundShadowMaterial`'s vertex shader (`materials.ts:497-513`), which already has `uSunDir`. That also fixes the stale offset.
- Keep `buildPoles` and `siteSlices` on the main thread at first (they read knocked state), or send `{ siteId, version, objects }` and `{ post, state, fall }` deltas from the two `onKnock` call sites (`ModGame.ts:965-975`).

Purity audit:

| Builder | Reads | Blocker | Verdict |
|---|---|---|---|
| `buildStrip` (`worldBuild.ts:114`) | spine, `shape`, `water.bridgeAt`, `plotGrass`, `woodland` | returns `BufferGeometry` | ready after S2 |
| `buildTerrain` (247) | `shape(coarse)`, `woodland` | returns `BufferGeometry` | ready after S2 |
| `buildScatter` (371) | `shape`, `sea.open`, `woodland`, noise; `globals.uSunDir` | the sun read | ready after S3 |
| `grassSlices` (878) | `shape`, `plotBare`, `plotGrass`, `sites.bareAt`, `sea.open`, `BIOME_STYLES` | none | ready as is |
| `woodsSlices` (1033) | `shape` both ways, `water.mayReach`, `woodland` | none | ready as is |
| `LakeBuild`, `buildRiverChunk`, `seaSlices` | `shape`, plan statics | returns `BufferGeometry` | ready after S2 |
| `buildBridge` (`waterBuild.ts:313`) | spine, `shape`; three geometry classes | returns `BufferGeometry` | ready after S2 |
| `buildPoles` (`worldBuild.ts:664`) | `furniture.between` (knocked posts) | mutable state | main thread, or deltas |
| `siteSlices` (`siteBuild.ts:1376`) | a `Site` that knocks move; a `skip` callback | mutable state, a function argument | main thread, or snapshot + mask |
| `SiteArt.draw` (`siteArt.ts:524`) | cached three scenes, materials | scene-graph cloning | not ready; only the merge could move, if GLBs were kept as raw arrays |

### S4. One scheduler

Extract `Job`, the sorted queue, slicing and the budget loop (`worldView.ts:40-43, 83-85, 363-401, 500-514, 646-663`) into a `StreamScheduler` with: a priority function, a budget per layer, cancellation, counters per layer (ms, queue depth, worst step), and a separate reveal stage (S9). `ProvingView.update` (`provingView.ts:339-379`), `SiteArt.update` (`siteArt.ts:513-517`) and the wreck spawner become clients. `ModGame.ts:4052-4066` then makes one call.

The priority queue along the road. Today priority is plain distance from the focus with a fixed weight per kind, the plan is centred on where the vehicle is now, and only strips look ahead (520 m behind, 3400 m in front). What the queue needs:

- the predicted focus a few seconds on (`sCam + speed x T` along the spine, which `StreamCtx` in S1 carries), so that scatter, grass and terrain rings are centred ahead of a fast vehicle instead of on it;
- priority as time until the piece is first visible, with pieces behind the heading ranked after pieces ahead;
- a re-plan trigger in time as well as in distance (today 14 m: at 150 km/h that is three plans a second, walking at 2.5 m/s one every five or six seconds);
- continuation jobs that keep their place across a re-plan (today the queue is rebuilt and a half-built tile falls back to its ordinary rank).

### S5. A plant registry with LOD chains

```ts
export interface PlantDef { id: string; lods: { geometry: THREE.BufferGeometry; until: number }[]; impostor?: ImpostorDef; material: 'broadleaf' | 'evergreen' | 'rock' | string; shadowRadius?: number }
export interface ScatterRule { biome: string; pick(cell: CellDice, eco: Ecotope): { plant: string; size: number; sy: number; lean: number; sink: number } | null }
```

Replaces the fixed `ScatterKinds` interface and `SHADOW_RADIUS` (`worldBuild.ts:333-355`), the per-biome chain (423-488), the material choice by name prefix (`worldView.ts:467`) and `PlantKinds` (`vegetation.ts:168-179`). Extract the per-cell decision as a pure core function `plantAt(world, cellX, cellZ)` so gameplay can ask the same question (risk 6).

Where octahedral impostors fit. Today's chain for a tree is:

| Stage | From | To | Drawn as |
|---|---|---|---|
| Full model | 0 | tile centre 230 m | 270-500 triangles, instanced per tile |
| `*Far` model | 230 m | 780 m | 74-76 triangles, instanced per tile |
| Far-woods card (a grove, not a tree) | 380-520 m from the camera, 430 m from the road | 3.5-4 km | one 38 x 27 m quad per 44 m cell |
| Painted crown masses in the ground shader | 180-420 m | the horizon | `terrainMaterials.ts:112-122` |
| Canopy lift of the terrain surface | 614 m or more | the horizon | `worldBuild.ts:259-275` |

- The impostor replaces the `*Far` stage: the pushes that pick a far kind (`worldBuild.ts:425-482`, every `far ? ... :`) emit an impostor instance instead, drawn from an instance pool (S10) with a billboard material. An impostor instance needs position, size, yaw and palette slots: 8 floats instead of 19.
- The atlas must hold paint inputs, not colours: leaf flag, depth-in-crown tone, clump normal, coverage. Colour comes from the instance's palette slot and the light of the hour (`rtPal`, `rtWoodTone`), exactly as `farWoodsMaterial` already does from a tone-and-coverage texture (`textures.ts:166-211`, `materials.ts:927-941`). A baked-colour atlas would break the rolling palettes and the autumn variation.
- Baking happens once per plant at start-up by rendering `PlantDef.lods[0]` into a render target. Off-screen renders of this kind already exist (`thumbs.ts`, `grime.ts`, the cloud cube map).
- Transitions in the house style: shrink by distance in the vertex shader (as `rtGrassKeep` and the far-woods fade do) so two stages overlap in a band, instead of swapping a whole tile. Choosing the stage per instance also removes the near/far tile rebuilds.
- Write alpha 0.7 like other foliage so the paint finish treats impostors the same.
- No shadow work is needed while the far map ends at 92 m; with longer cascades see S13.

### S6. The ecotope field in core

Move `woodland()` out of `src/game/scene/palette.ts:106-139` into `src/core/world/` and widen it to a record (wood, wetness, openness, rock, shore). Callers to switch: `groundAttrs` (`worldBuild.ts:64-67`), the canopy lift (269-275), `buildScatter` (430), `woodsSlices` (1058-1061). The per-biome thresholds become fields of the biome or region definition.

### S7. Grass

- Minimal: sort a tile's tufts so those with `keep < 0.35` come first, always build the full list, and switch ring by setting `instanceCount` (`worldView.ts:256, 379-383, 624-638`; `worldBuild.ts:938-1004`). Builds per tile drop from about 2.3 to 1 and ring changes stop uploading, but main-thread CPU falls only by about a sixth (estimated from the emulated build counts and the measured build times) and far tiles hold three times the data. Worth it only together with S3.
- Target for "denser, multi-layer": one small float texture per tile holding the existing 21 x 21 sample grid (height, road distance, growth, size, slots and share, mowing, bare), sampled in the vertex shader the way `terrainClamp` already is, with tuft positions from the instance index. `hash2` is integer math (`src/core/math/rng.ts:13-16`) and can be reproduced exactly with `uint` in GLSL ES 3.00. CPU cost per tile becomes the grid alone, 0.3-0.5 ms measured, about a tenth of one near build today and paid once per tile instead of up to three times. Slot in at `makeGrass` (`worldView.ts:624-638`) and `grassVertexHead` (`materials.ts:690-716`); keep `GRASS_FADE` and the `rtGrassKeep` shrink so transitions look the same. Layers (short turf, tall tufts, flowers, reeds) should be instance attributes of one draw, not extra meshes per tile.
- Cheap win available now: far tiles could draw fewer blades per tuft through `geometry.setDrawRange`.

### S8. Piece bounds and a cull pass

Give `Piece` (`worldView.ts:30-32`) a bounding sphere, a top height, a byte and triangle count; fill them in `add()` (136-142). Add `WorldView.cull(camera)` called once per frame before `core.render`, running the layers' `cull` hooks. First users: a horizon table (running maximum elevation angle per azimuth bin, from terrain leaf tops) to hide scatter, grass, site and terrain pieces behind ridges; distance bands for impostors; CPU culling of ranges inside pooled instanced meshes (S10).

### S9. Upload slicing

New pieces are added with `visible = false` into a reveal queue; each frame the scheduler reveals pieces up to a byte budget (`bytes` from S8) and only then drops the piece being replaced. Changes: `add()` (136-142) and the three swap sites (447-449, 480-482, 635-637). Needs a counter of bytes uploaded per frame, which does not exist today.

### S10. Instance pools

`InstancePool(geometry, material, capacity)` owning one `InstancedMesh`, with `alloc(n)` / `free(range)` and optional sector buckets; a tile's piece holds ranges and a `dispose()` (S1's `LayerPiece`). Slot in at `makeTile` (`worldView.ts:459-483`). This is what turns "tiles x kinds" draw objects into "kinds x sectors", and it is the natural home for flora and forage nodes: placement from a pure core function keyed by world cell (so gameplay knows the node's id and state), drawn through a pool, hidden on harvest by rewriting one instance matrix. A `redrawTile(key)` beside `redrawSite` covers bulk changes.

### S11. Far level of detail for places, and `SiteArt` as a sliced client

- Use the classic one-mesh drawing as the far LOD: build it without `skipObject` for what `SiteArt` draws, and hide it while `SiteArt` has the site (`SiteArt.draw` end at `siteArt.ts:660`, `drop` at 698, calling a new `worldView.setSiteHidden(id, hidden)`; `makeSite` at `worldView.ts:613-622`; the rule at `ModGame.ts:899`). The coat colours are the same tables (`siteBuild.ts:53-60`, `buildingKit.ts:97-104`).
- Do not add a mesh when the built geometry is empty (`worldView.ts:619-621`).
- Turn `SiteArt.draw` into a generator (clone and merge a few pieces per step) scheduled by S4.

### S12. Registries for site object kinds and landmarks

One table keyed by `ObjectKind` holding: the classic `draw` function, the `PlaceModel` rule, the palette family, the Chinese name and blurb. It replaces the `switch` at `siteBuild.ts:968-1362`, the `switch` at `siteArt.ts:116-190`, `PLACE_MODELS` (30-98), `PALETTE_OF` (237-274), `PLACE_ZH` and `BLURB` (`places.ts:42-58`). The same for `LandmarkKind` (`landmarks.ts:19-128`): forty wonders cannot be one `if / else`.

### S13. A depth-material hook in the shadow pass

Replace `scene.overrideMaterial` (`shadow.ts:137-143`) by per-object depth materials (`userData.depthMaterial`, falling back to the shared one), and make the cascade list data. Required before instanced grass, swaying trees or impostors can cast shadows.

### S14. Quality at run time

`WorldView.setQuality(q)`: make `q` writable (`worldView.ts:114`), include density and the disc choice in the piece variant (lines 245, 463, 627), force a re-plan. `RenderCore` needs a `setPixelRatio` that does not reallocate the MSAA target every step (today `Frame.fit` resizes on any size change, `frame.ts:298-314`).

### S15. Palette slots that survive shorter regions

Either guarantee in the region planner that at most four regions are within the view distance, or carry `(slot a, slot b, share)` on vertices as instances already do and raise `SLOTS` (`style.ts:142`; `paint.ts:22-31`; uniform array sizes in `shaderlib.ts:129-139`; `groundAttrs` at `worldBuild.ts:58-73`; the `& 3` at 61-63, 385, 916-918, 1073).

### The top five causes of draw calls and how to batch each

Counts are the emulated plains spot (in frustum + far cascade).

| # | Cause | Calls | How to merge |
|---|---|---|---|
| 1 | Terrain leaves, one mesh each, six levels | 70 | Merge the slow-changing outer levels (-2, -1, 0: 80 leaves held, 27 drawn) into one or two geometries rebuilt when the set changes, about once per 2 km. Better: one shared 33 x 33 grid drawn instanced with a per-leaf origin, scale and a height/attribute texture layer (the `terrainClamp` path shows vertex textures work here). Either way about 10 calls |
| 2 | Scatter: one `InstancedMesh` per tile per kind, also in the far shadow map | 46 + 22 | Instance pools per kind with 4-8 sector buckets (S10); far trees as impostor quads in one pool. About 12 + 6 |
| 3 | Road strips, poles, wires | 38 + 2 | Group lod1 strips four to a mesh as lod2 already is (12 to 3); build poles, signs and furniture once per 256 m independent of strip LOD; draw wires as thin quads in the pole mesh. About 18 |
| 4 | Grass and flower tiles | 15 | With S7 all tiles share one instance buffer and differ by a texture, so near tiles can be one multi-tile draw; flowers become a layer of the same draw. About 4-8. Matters most once layers multiply |
| 5 | Far-woods tiles | 11 | Merge into one or two buffers (the set changes every 2 km), or retire them into the impostor chain of #2. About 2 |

Next in line: a place near the camera (11-14 merged meshes, twice or three times with shadows, plus movers). Its material names differ only by uniforms, so a per-vertex material id with a recipe table would make a place two draws (opaque and glass). That is a change inside `carMaterials.ts`, outside this map.

---

## 8. Performance notes

Hot paths, with what was measured or emulated:

- **Streaming CPU while driving** (emulated, 90 km/h, 3 km, seed 7): 1581-1672 builds, 13-14 per second; 19-22 ms of builder time per second of driving, which is 0.32-0.37 ms per 60 Hz frame on average against a 3.5 ms budget. Grass is 72-78 % of it (near 35-40 %, far 37-38 %), terrain about 10 %, strips 6 %, scatter 5 %. The worst single re-plan asked for 36-37 ms of work. Average load is not the problem; single long jobs are.
- **Jobs longer than the frame budget and not sliced**: far terrain leaf up to 6.6 ms, lod0 strip up to 2.7 ms warm and 12 ms once cold, bridge 3.2 ms, poles up to 3.7 ms. A frame's stream time can reach budget + one such job.
- **Grass rebuild churn**: 243 grass builds per km for about 107 tiles per km, because a tile is rebuilt when it changes ring. Same pattern for scatter tiles at the 230 m near/far line (150 builds per km).
- **Cost of one terrain sample**: 0.7-1.3 microseconds. A worker world needs 7 ms to construct.
- **Triangles**: grass 463 000 + flowers 16 000 of 835 000 in view at the plains spot; far trees 131 000; terrain 161 000. The forest spot submits 1.35 M from the world view alone, 0.38 M of that in the far shadow cascade (near trees are drawn twice).
- **Wasted work visible in the code**:
  - zero-triangle site meshes are real draw calls in three r187 (`renderBufferDirect` only returns early for a negative count), 4-7 held per spot in ModCar;
  - far cacti at full detail (164 000 triangles held in the desert);
  - poles rebuilt three times per group;
  - every world piece has `matrixAutoUpdate = true` and is recomposed on each of three `updateMatrixWorld` passes per frame (about 450 pieces);
  - all materials spread `...globals`: 36 shared uniforms plus 11 palette arrays, and three uploads array uniforms without caching on every material switch. A uniform buffer would remove that. Inferred from three's source, not measured.
- **Per-frame allocations in this area**:
  - `plan()` every 14 m: eight maps, one object and one template-string key per wanted piece (about 450), one closure per job, a sort;
  - `SiteArt.update`: `[...this.drawn]` every 0.6 s; `stepPumps` allocates a `TubeGeometry` and two attribute arrays per frame while a nozzle is out;
  - `Places.update`: `loose.list.includes()` for every owned loose thing, every frame;
  - `FaunaView` (classic only): arrays per box per animal per frame and three whole-attribute uploads;
  - `update()` itself allocates nothing when no job is pending.
- **Uploads**: 14-19 MB of buffers are held at a spot and enter the GPU whenever each object is first seen, outside any budget. Turning the camera after a teleport or a fast approach can upload many pieces in one frame.
- **Memory format**: terrain could halve its 56 bytes per vertex (normals as signed bytes, slot weights as bytes, ground attributes as half floats); plant templates are non-indexed at 52 bytes per vertex.
- **Depth**: see risk 13. Three r187 offers `reversedDepthBuffer` (needs `EXT_clip_control`) as an alternative to the logarithmic buffer; whether the look survives the switch is untested.
- **Recorded GPU-side facts worth keeping**: stream max build 4.6 ms, max pending 14 (classic world set); 39-40 shader programs in ModCar road frames, 26 in classic.

---

## 9. Open questions

1. Which scene and camera did the audit's 420-510 calls come from? Recorded road frames are 260-388; only garage-start frames reach that range. No GPU was run in this pass.
2. What does a burst of first-draw uploads cost per frame? Nothing instruments `bufferData`.
3. How long does `SiteArt.draw` take for a house (173 clones, 52 000 triangles merged)? It needs the browser's `GLTFLoader`; not measured here.
4. Does `World.shape()` return identical values on a worker replica that asked its questions in another order? The lazy site layout suggests a risk near slot boundaries; no test exists.
5. Is it intended that ModCar draws nothing of a building between 560 m and 2400 m, and that `BeaconView.update` is never called in `ModGame`?
6. Is the shared terrain index really re-uploaded after each leaf disposal, and does it matter? Read from three's source only.
7. Does writing `gl_FragDepth` in every shader measurably cost fill rate on the target GPUs, and does `reversedDepthBuffer` keep 48 km of depth range without artefacts?
8. How far from the road will V3 play take the player? Beyond about 450 m the forest belt is cards and paint, and the far-field height formula takes over at 200 m.
9. Can three's `BatchedMesh` be used with the hand-written `ShaderMaterial`s (they include only the instancing path in `GLSL_VERTEX_MAIN`)? Untested.
10. Must `classic.html` and `viewer.html` keep working through V3? They share `WorldView` and every builder.
11. Do far trees between 614 m and 780 m stand inside the lifted canopy surface of the 512 m terrain leaves? The geometry says partly yes; no screenshot was checked.
12. Should the ModCar screenshot sets get spec files (draw calls, triangles, stream build time) before V3 work starts, and at what limits, given they already exceed the classic ones?
