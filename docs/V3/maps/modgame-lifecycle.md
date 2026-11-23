# Map: ModGame — the game's top-level object and lifecycle

Area: `src/game/modcar/ModGame.ts` and what boots, steps, saves and probes it (`entry.ts`, `seamless.ts`, `stream.ts`,
`vehicle.ts`, `garage.ts`/`garageStub.ts`, `save.ts`, `restore.ts`, `player.ts`, `src/game/params.ts`; `src/game/main.ts` and
`src/game/game.ts` only for contrast). Read on `feat/v3`; all line numbers are for the source at commit `e50503c` (the
later commit `b15d60b` adds only `docs/V3/PLAN.md` and `CATALOG.md`). Everything below was read in the source; what was
inferred but not observed running is listed under *Open questions*. Section 7 is the lifecycle half of the seams that
docs/V3/PLAN.md (技术架构) calls for; the player and item halves are in `player-interaction.md` and `items-economy.md`.

---

## 1. Summary

- `ModGame` (4,633 lines) is a **god object**: one class, about 175 fields (≈120 `private`), about 150 methods. It
  constructs every subsystem, owns the frame order, is the save/restore authority, the audio mixer's front end, the
  camera, the tutorial, the cargo-list UI, the cleaning/painting orchestration and the developer panel's back end.
- It has **no registry of systems, no event bus, no dispose path** (teardown is always a page reload:
  `location.replace` / `location.reload`). Subsystems are wired by *host interfaces* (dependency inversion): the class
  implements four (`PlayerHost`, `CockpitHost`, `DevHost`, `SessionHost`, line 236) and hand-builds six more as closure
  objects (`PadHost`, `PlacesHost`, `WreckHost`, `WorkshopHost` ×2, `DoorHost`, `GarageContext`).
- One frame is `frame(dt)` → `step(dt)` → `render()` → `hud.update` (4525–4532). **`step()` also runs every view,
  environment, HUD and audio update** (`updateViews` is called from inside `step` at 3618), so the harness's
  `simulate()` exercises everything except the draw.
- The only automated coverage of this file is the **Playwright scripts** `harness/shots/modcar_*.mjs` (35 scripts) and
  the screenshot sets `harness/shots/sets/modcar_*.json` (10 of them open `modcar.html`). No vitest file imports
  `ModGame`, `player.ts`, `save.ts`, `entry.ts`, `loose.ts`, `held.ts` (they need DOM + WebGL). The scripts drive it
  through `window.__rt` (82 members, `entry.ts` 84–733) and **also reach into TS-private fields by name**.
- The save is one JSON blob `SaveV1` in `localStorage['modcar.save.v1']` (plus six whole copies as restore points in
  `modcar.restore.v1`, plus grime masks in IndexedDB `modcar-grime`). `loadSave()` runs **synchronously at module top
  level in `entry.ts` before `ModGame` exists**, and **discards the whole save** (sets it aside as `.unread`, starts a new
  game) if any part or item id in it is unknown.
- For V3 the smallest safe refactor of this area is: `ModGame implements GameContext`, 17 one-line hook/emit
  insertions in `ModGame.ts` (tier 0 in 7.2), one optional field in `SaveV1`, three generic members on `window.__rt`
  and a module list. With an empty registry every hook is a no-op, so it can land with byte-identical behaviour. The
  player-side seams (held behaviours, interactables, UI modes) are a second, riskier change specified in
  `player-interaction.md`; 7.2 lists their `ModGame.ts` half.

---

## 2. Key files

| Path | Lines | Role | Public API that matters |
|---|---:|---|---|
| `src/game/modcar/ModGame.ts` | 4633 | The game object | `class ModGame implements PlayerHost, CockpitHost, DevHost, SessionHost` (236); `interface ModParams extends Params` (112–123: `start`, `build`, `project`, `garage`, `keep`); `readModParams(base, search)` (125); `NEW_SEED_KEY` (142); `TUTORIAL_MISSING` (172); `type ViewMode = 'cockpit'｜'chase'｜'orbit'` (110). Methods: `constructor(canvas, params, restore: SaveV1｜null, tune?)` (411), `ready: Promise<void>` (405), `step(dt, alpha?)` (3490), `render()` (4520), `frame(dt)` (4525), `simulate(seconds)` (4535), `telemetry()` (4604), `grimeTelemetry()` (4553), `wreckTelemetry()` (4574), `snapshot(): SaveV1｜null` (1511), `save()` (1557), `newGame()` (1656), `addVehicle(build,x,z,yaw)` (1670), `removeVehicle(v)` (1681), `enter(v)` (2449), `getOut()` (2474), `changed(v, what)` (2510), `panelOpened(v, mount, open)` (2525), `teleport(s, bring)` (512), `teleportTo(x,z,yaw,bring)` (567), `swapBuild(v, b)` (607), `sound(name, gain?, mount?)` (2671), `loopFor(name, gain?, rate?, cutoff?)` (2736), `genSound(s)` (3266), `consume(item)` (1237), `drank(liquid, litres)` (1247), `bodyAirC()` (1183), `modEnv(v)` (3469), `iconOf(held)` (1817), `toggleCargoList()` (1307), `closeCargoList()` (1331), `takeFromList()` (1377), `cargoChanged(v)` (1169), `tutorialSteps()` (3416), `objective()` (4266), `toggleDev(open?)` (1877), `dev*` (1883–2172), `grimeCast`/`scrubStroke`/`scrubEnd`/`paintCast`/`spray` (2751–3114), getters `origin` (480), `roadS` (485), `devices` (656), `tanks` (663), `camera` (2746), `devPanel` (1872) |
| `src/game/modcar/entry.ts` | 782 | Page entry for `index.html` and `modcar.html` (they differ only in `<title>`) | Reads params (32–33), decides save vs. fresh (35–53), builds `Tune` then `new ModGame(canvas, params, save, tune)` (55–57), defines `window.__rt` (84–734), loading card (737–745), starts the RAF loop after `game.ready` (747–782) |
| `src/game/modcar/seamless.ts` | 65 | The workshop as a plot of the world (§17) | `modcarWorldOptions(o)` (25), `modcarWorld(seed, o): {world, level}` (33 — **builds `World` twice**: once to find the proving ground's level), `SeamlessGround` (40), `SeamlessLand` (53), `MODCAR_PLACE_ODDS`, `MODCAR_SECOND_PLACE` |
| `src/game/modcar/stream.ts` | 83 | The poured liquid's tube (not world streaming) | `LiquidStream.update(dt, from, to, colour, dir)`; rebuilds a `TubeGeometry` only when an end moves (66–75) |
| `src/game/modcar/vehicle.ts` | 125 | One vehicle = build + systems + sim + view + solid | `class ModVehicle implements Carrier`: `sys: ModSystems`, `sim: VehicleSim`, `view: CarView`, `solid: VehicleSolid`, `awake`, `assistHold`, `radioOn`, `radioSong`, `knocksHeard`, `burstsHeard`; `step(dt, ground, env: ModEnv, input｜null)` (112), `changed()` (105), `surfaceAt(x,z,fromY)` (84), `get build`, `get frame`; `visibleUp(obj)` (22) |
| `src/game/modcar/garageStub.ts` | 234 | The garage contract and the stand-in | `interface GarageDevice` (21–44), `interface GarageContext` (47–61), `interface GarageScene` (63–102), `buildGarageStub(core)` |
| `src/game/modcar/garage.ts` | 815 | The real starting garage (`class Garage implements GarageScene`, 136) | `buildGarage(core)` (132); `update(dt, ctx)` (439) runs every frame; `light()` (557–680) writes the single indoor "room" into global uniforms (`uRoomMin/Max`, lamps, openings) |
| `src/game/modcar/player.ts` | 1632 | On-foot player: hotbar, targeting, every interaction | `type Held` (43), `heldName`, `heldOf`, `interface PlayerHost` (150–186), `interface TankPort` (132), `interface ScrubHit`/`PaintAim`/`Scrub`, `class ModPlayer`: `walker`, `solids`, `slots`, `pack`, `sel`, `held` get/set, `target`, `update(dt, yaw, pitch, keys)` (470), `press(from)`/`release(from)` (358/364), `wheel`, `select`, `putDown`, `packIn`, `wearPack`, `freeSlot`, `cardOf`, `slotViews`, `telemetry()` (1597). The `Target` union (56–75) is module-private. |
| `src/game/modcar/save.ts` | 159 | The save format and its storage | `interface SaveV1` (46–81), `SavedVehicle`, `SavedLoose`, `loadSave()` (106), `writeSave(s)` (145), `clearSave()` (153). Key `modcar.save.v1`. |
| `src/game/modcar/restore.ts` | 66 | Restore points (6 whole saves in `modcar.restore.v1`) | `restorePoints()`, `pushRestore(s)`, `useRestore(i)`, `clearRestores()`, `agoText(at)` |
| `src/game/modcar/grimeStore.ts` | 100 | Grime masks in IndexedDB (`modcar-grime` / `masks`) | `keepMask`, `keptMask`, `keepOnly`, `forgetMasks` — the only IndexedDB use today |
| `src/game/modcar/cockpit.ts` | 179 | In-seat controls | `interface CockpitHost` (16), `class Cockpit` (`pick`, `update`, `press`, `release`) |
| `src/game/modcar/devPanel.ts` | 586 | Developer panel | `interface DevHost extends PaneHost, LabHost, ProvingPaneHost` (37–56), `type DevItem`, `devItemOf(key)`, `class DevPanel`. Tabs are a **closed const** `TABS` (85–94) and `TabId` (83). |
| `src/game/modcar/devWorld.ts` | 336 | Dials applied each frame, teleports | `class DevWorld(game: ModGame, tune)` — takes the concrete `ModGame`; `beforeEnv(dt)` (153), `afterEnv()` (193), installs `env.tune` (129) |
| `src/game/params.ts` | 113 | URL parameters shared with the classic game | `interface Params`, `readParams(search)`; a key given twice: the later wins (63) |
| `src/game/render/core.ts` | 136 | Renderer + floating origin | `RenderCore`: `renderer`, `scene`, `camera`, `quality`, `origin`, `frame`, `shadows`, `exposure`, `shadowFocus`, `place(obj,wx,wy,wz)`, `onRebase(fn)`, `maybeRebase(wx,wy,wz,limit=1024)`, `render(time)`, `stats`; `QUALITY` (low/med/high) fixed at construction |
| `src/game/env/environment.ts` | 281 | Clock + weather → light, sky, precipitation, wipers | `Environment.update(dt, time, ba, bb, bt, world, vx, vy, vz)` (101); `clock: DayClock`, `weather: WeatherSystem`, `state: WeatherState`, `sky`, `tune` hook (single slot), `precip`, `wiperMode`, `strike()` |
| `src/game/main.ts`, `src/game/game.ts` | 268 / 882 | Classic game (legacy) | Same shape (`step`/`updateViews`/`render`/`frame`/`simulate`/`telemetry`, `window.__rt`). Two things it has that ModCar lacks: `knockListeners` array (game.ts 64) and a `beacons.update(...)` call (695–699). |

Catalogue sizes at HEAD (counted by importing the modules): 127 parts, 106 items, 11 frames, 64 recipes, 65 foley
shots, 40 foley loops. `public/models/modcar`: 427 GLB files, 124 MB.

---

## 3. Lifecycle and data flow

### 3.1 Boot (`entry.ts`)

1. `readParams()` → `readModParams(base)` (32–33). `readModParams` defaults the garage start to 09:12 and clear weather
   (ModGame.ts 135–136).
2. `?new` clears the save (36). `own` = `?shot` or any of `start/build/project/garage` in the URL (37). A page that is
   `own` never loads or writes the save (`keep: !own`, 53).
3. `loadSave()` (39) — **synchronous, before the game exists**. It validates every part/item/frame id, reserves part
   and item uids, back-fills axle parts (`fitAxles`), and on *any* exception moves the raw text to
   `modcar.save.v1.unread` and returns `null` (save.ts 106–143).
4. New-game seed: `localStorage['modcar.newSeed']` if present (41–49).
5. Params from the save (51–53): `start = save.world ? 'garage' : save.place`, `time = save.hour`,
   `seed = save.world?.seed ?? save.road?.seed`, `keep: true`.
6. `new Tune(); tune.applyAll()` (55–56) — terrain dials are written into the biome tables **before** the world is made.
7. `new ModGame(canvas, params, save, tune)` (57); `window.__rt = rt` (734).
8. After `game.ready`: shot mode → `game.simulate(0.8); game.render(); rt.ready = true` and no loop (755–760);
   otherwise a RAF loop with `dt = min(0.1, …)`, the next frame requested **before** the work, and a `try/catch` round
   `game.frame(dt)` that records `rt.lastError` and toasts once per distinct message (761–781).

### 3.2 Construction order (`ModGame` constructor, 411–478)

Field initialisers run first, in declaration order (`audio` 241, `rig` 242, `shake` 244, `pad` 246, `ui` 249, `mats` 250,
`vehicles` 251, `cockpit = new Cockpit(this)` 257, `body` 265, `stock` 267, `assists = loadAssists()` 337,
`vehicleSolids` 348, …). Then:

| Line | What |
|---|---|
| 418–422 | `tune` (given, or new + `applyAll()`) |
| 423–424 | `core = new RenderCore(canvas, params.quality)`; `core.usePost = params.post` |
| 425 | `viewMode` from `params.view` |
| 427 | `hud = new Hud(?hud=1, '')` |
| 428–429 | `input = new InputManager(canvas)`; `freeLook = true` |
| 430–431 | `env = new Environment(core, seed, {hour, weather, stage})`; `env.shotMode` |
| 432 | `devTools = new DevWorld(this, tune)` (installs `env.tune`) |
| 433–438 | orbit params; `place = params.start`; `seamless = start === 'garage' && garage !== 'stub'` |
| 439–445 | garage start: `garage = buildGarageStub(core)｜buildGarage(core)`; `ground = garage.ground`. Road start: `makeWorld()`; `ground = floored(proving)` |
| 447–450 | seamless: `makeWorld()`; `ground = floored(new SeamlessGround(garage.ground, proving))` |
| 451–453 | `loose = new LooseThings(core, mats, surfaceAt)`; `loose.carriers = () => vehicles` |
| 454–463 | `cargo`, `heldThing`, `stream`, `splashes`, `sparks`, `dust` (+ `scene.add`), `grime`, `flakes`, `mist` |
| 464–467 | `player = new ModPlayer(SeamlessLand｜proving｜garage.land, this)`; walk 2.5 / run 5.0 m/s |
| 468–472 | `player.cardsOn` from `localStorage['modcar.ui.cards']` |
| 473–474 | `player.addSolids(garage.solids)`; `worldSolids()` if there is a world |
| 475 | `ready = populate()` (async) |
| 476–477 | `bindInput(canvas)`; window `resize` listener |

`makeWorld()` (870–904): `modcarWorld(seed, {chapterScale, startBiome})` → `world`; `proving = new ProvingGround(level, world)`;
`provingCones`; `provingProps`; `provingView`; `provingRun = new ProvingSession(this)`; `worldView = new WorldView(core, world, core.quality)`;
`siteArt ??= new SiteArt(...)`; `doors ??= new Doors({...}, restore?.places?.doors)`; `worldView.skipObject = …` (899);
`landmarks`; `beacons`; `worldSolids()` when the player already exists (903). It is called from the constructor *before*
`player` exists, and again from `exitGarage()` (637) on the non-seamless path.

`populate()` (991–1120), all asynchronous:
- `await siteArt.ready`.
- Garage start: `await Promise.all([preload(all 127 part models), garage.ready])` (997); `stock` from the save (998);
  `makeWorkshop()` (999). **Restore path** (1000–1008): `restoreGarage(save)` → wait for views and loose to settle →
  `restoreGrime()` → `buildWorldAround()` → seat pitch → toast → `return`. **New game** (1009–1097): the tutorial
  sedan (`TUTORIAL_MISSING` parts absent, weathered) at `garage.carSpot`, loose parts/tools/junk on the garage's `spots`,
  a donor pickup, and (real workshop only) a motorcycle and an RV; walker at `garage.spawn`.
- Road start (1098–1114): `placeOnRoad(build, params.s)`; restore of the one vehicle, its riders, hands; `startNow()`; seated.
- 1115–1119: settle; `buildWorldAround()` (seamless) — streams the world for up to 15 s with a 40 ms budget per turn (1123–1135).

Created lazily, later: `wrecks` and `places` on the **first `step()` with a world** (3537, 3541); `vitHud` (1193),
`matHud` (851), `cargoList` (1428), `scrubHud` (3227), `glints` (2553), `provingPanel` (4070), `death` (1283), `dev` (1879),
`icons` (1821), `voice`+`foley` (2651–2654, once an `AudioContext` exists), `radio` (3333), `genVoice` (3271).

### 3.3 One frame, in order

`frame(dt)` (4525): `step(dt)` → `render()` → `hud.update(dt, …)`.
`simulate(seconds)` (4535): `n = max(1, round(seconds·60))` steps of `seconds/n` with `alpha = 1`; **`simulate(0)` runs two
`step(0, 1)`** (the loop's one plus line 4539). The harness calls `simulate(0)` after almost every command, so every
piece of `step`/`updateViews` must be safe and idempotent for `dt = 0`.

`step(dt, alpha?)` — 3490–3621:

| # | Lines | Work |
|---:|---|---|
| 1 | 3492–3500 | seamless: `place = onPlot(x, z) ? 'garage' : 'road'` from the seat's vehicle or the walker; "上路了" once |
| 2 | 3501 | `input.update(dt)` (keyboard, gamepad sticks/pedals) |
| 3 | 3502–3503 | `pad.update(padHost())`; `padFeel(dt)` (rumble) |
| 4 | 3504 | `applyAssists()` (writes `autoRelease`, `assistHold`, `assistReverse` into every vehicle) |
| 5 | 3505 | `time += dt` |
| 6 | 3507–3510 | autosave every 30 s (`params.keep`) |
| 7 | 3512 | `stepBody(dt, shift)` — vitals, HUD, death, a restore point every 300 s (1229–1233) |
| 8 | 3513–3533 | workshops: `allWorkshops().update(dt, eye)`, `garage.power`, nearest generator → `genSound` |
| 9 | 3534 | `stepGrime(dt)` — masks bind/grow/dry/measure, flakes, scrub sound |
| 10 | 3536–3553 | if `world`: `wrecks.update`, `places.update`, pump nozzle, `siteArt.update`, `doors.update` |
| 11 | 3555–3582 | on foot: `player.update(dt, yaw, pitch, keys)` (walk, `pick()`, `act()`, HUD), `input.lookHold`, `showCargoList()`; seated: drive-keys HUD |
| 12 | 3584–3609 | for each vehicle: input (dead → brake; `scripted` → that; proving robot; else pedals) → `v.step(dt, ground, modEnv(v), input)`; knock and tyre-burst sounds |
| 13 | 3610–3611 | `stepCones(dt)`; `provingRun.update(dt)` |
| 14 | 3612 | `loose.update(dt)` |
| 15 | 3613–3614 | `throwSparks(dt)`; `kickDust(dt)` |
| 16 | 3615 | `checkTutorial()` |
| 17 | 3616–3617 | `garage.update(dt, garageContext())`; `leaveGarage(dt)` (stub garage only) |
| 18 | 3618 | **`updateViews(dt, alpha)`** (below) |
| 19 | 3619 | `loose.follow()` — things riding on vehicles follow the poses just drawn |
| 20 | 3620 | `stepGlints(dt)` |

`updateViews(dt, alpha?)` — 3852–4102:

| # | Lines | Work |
|---:|---|---|
| a | 3858–3859 | `env.wiperMode` (off when sheltered) |
| b | 3861–3878 | for each vehicle: wiper state, windscreen wipe, filler flap auto-shut, `v.view.update(dt, sim, dash, core, alpha)` |
| c | 3879–3887 | **floating origin**: `core.maybeRebase(fx, fy, fz)`; on a rebase the car views are updated again with `dt = 0` and the garage root re-placed |
| d | 3888–4000 | camera: orbit / chase (allocates a `Vector3`, 3922) / cockpit (rig, motorcycle lean, seat shake, FOV) / on foot (nod, drunk sway, sprint FOV) |
| e | 4001–4013 | bench view blend |
| f | 4014–4024 | held thing: `set`, `setUse`, dock at a filler, `pin` (scrub), `aimSpray`, `update` |
| g | 4025–4027 | `showScrub(cam)`; `stepSpray(dt)`; `workshop.frame()` |
| h | 4028–4033 | liquid `stream.update`; `icons?.pump()` (thumbnail renderer) |
| i | 4035–4040 | `cockpit.update` + control highlight |
| j | 4041 | `updateBeam()` (headlight uniforms) |
| k | 4043–4051 | shadow focus (garage override) |
| l | 4052–4066 | world streaming: `worldView.update(fx, fz, 3.5 ms)` (45 ms while `devLoad > 0`); `provingView.update` |
| m | 4069–4078 | proving panel + start lights |
| n | 4080–4088 | `spine.project` → `pr.s`; `biomeAt`; `landmarks.update` |
| o | 4089–4092 | `env.camX/Z`; `keepRainOut()` |
| p | 4093–4095 | `devTools.beforeEnv(dt)` → **`env.update(dt, time, biome…, world, vel)`** → `devTools.afterEnv()` |
| q | 4096 | `updateSplashes(dt)` |
| r | 4098 | garage exposure factor |
| s | 4099–4100 | `ui.update(dt)`; `updateHudBits()` (dash, checklist, pause card, objective marker) |
| t | 4101 | **`updateAudio()`** |

`updateAudio()` — 4460–4518: `sounds()` (lazy `EngineVoice` + `Foley`) → `worldLoops()` (tyre loops, flat/rim, glint) →
`updateFoley()` (one queued warm-up render, start/stop the loops requested this frame via `loopsNow`, hazard tick, horn) →
`updateEngineVoice()` → `updateRadio()` → `audio.update({…}, env.flash)` (road/wind/rain bed).

`render()` — 4520–4523: `env.prepareShot()` in shot mode; `core.render(time)` (shadow pass(es), then `frame.render`).

Consequences worth remembering:
- The environment of this frame (`env.state`: wind, rain, temp) is computed at step *p*; everything earlier in the
  frame (vitals, dust, sounds, the vehicles' `modEnv`) reads **last frame's** weather.
- The floating origin can move at step *c*. Anything placed with `core.place` earlier in the same frame (steps 8, 10,
  14, 15) is one frame stale unless it re-places itself later (LooseThings does, in `follow()`) or listens to
  `core.onRebase` (WorldView, LandmarkView, BeaconView, ProvingView do).
- `player.update` (step 11) picks against the vehicle poses drawn last frame.

### 3.4 Where state lives

**In `ModGame` fields** (owned here):
- Session: `time` (seconds since page load, 384), `place`, `seamless`, `params`, `restore`, `ready`, `viewMode`, `orbit`,
  `scripted`, `done` (tutorial steps), `saidOnRoad`, `fadeT`, `devLoad`, `saveT`/`saveOff`/`newGameAsked`/`restoreT`.
- The body: `body: Vitals` (reassigned on restore, 1485), `deadT`, `deathWhy`, `autoPee`, `sprintB`, `jumpsSeen`; `stock`.
- Who is where: `vehicles[]` (the player's **and** the live wrecks), `seated`, `focus`.
- Cleaning: `cleaning` map, `lookFlashes`, `grimeShowT`, scrub sound state, `scrubReady`, `gridQueue`.
- Painting: `paintHeld`, `sprayWas`, `heldCanUid`, `shookAt`.
- Cargo-list UI: `listV`, `listSel`.
- Audio front end: `loopsNow`, `loopsOn`, `hornOn`, `lastGear`, `wasBlinking`, `warmQueue`, `genAsked`, `genBank`,
  `roadLeft`, `tyreNow`, `glintGain`.
- Camera: `chasePos`, `chaseInit`, `thunk`, `benchB`, handbrake key state, `shookFrame`, marker state.
- Workshops: `workshop`, `workshopKept`, `roadShops`, `devicesAll` cache. Effects: `sparkDue`, `smokeDue`.
- About 35 preallocated scratch objects (`THREE.Vector3`/`Quaternion`/`Matrix4`/`Box3`, `GroundSample`, …).

**In helper objects** (ModGame holds the reference): `core` (renderer, scene, camera, origin), `env` (clock, weather,
sky, precipitation, clouds), `input`, `pad`, `hud`, `ui` (+`ui.items`), `audio`/`voice`/`genVoice`/`foley`/`radio`,
`world`/`worldView`/`landmarks`/`beacons`, `proving*`, `garage`, `Workshop`s, `places`, `wrecks`, `glints`, `siteArt`,
`doors`, `player` (**the inventory lives here**: `slots`, `pack`, `sel`; also `walker`, `solids`, `target`, `flow`, `use`,
`scrub`, `spraying`), each `ModVehicle` (`sys`, `sim`, `view`, `solid`, radio), `loose`, `cargo`, `heldThing`, `stream`,
`splashes`, `sparks`, `dust`, `grime`, `flakes`, `mist`, `shake`, `rig`, `cockpit`, `mats`, `tune`, `devTools`, `dev`.

**Module-level globals outside any object** (shared, mutated per frame): `globals` uniforms (`render/shaderlib`),
`carEnvUniforms`, `skyUniforms`, `windscreenUniforms`, `waterUniforms`, `beamUniforms`; asset caches and `loadStats`
(`assets.ts`); uid counters in `core/modcar/build.ts`, `items.ts`, `tools.ts`; the biome/landform tables that terrain
dials write into.

### 3.5 Host interfaces and who calls them

| Interface | Defined | Implemented | Called by | Members |
|---|---|---|---|---|
| `PlayerHost` | player.ts 150 | `ModGame` | `ModPlayer` (83 `host.*` sites: `sound`×24, `ui`×14, `loose`×13, `cargo`×7, `origin`×5 …) | `vehicles`, `loose`, `ui`, `origin`, `devices`, `tanks`, `changed`, `enter`, `sound`, `iconOf`, `cargo`, `cargoChanged`, `consume`, `drank`, `camera`, `grimeCast`, `scrubStroke`, `scrubEnd`, `paintCast`, `panelOpened?`, `spray` |
| `CockpitHost` | cockpit.ts 16 | `ModGame` | `Cockpit` | `ui`, `origin`, `sound`, `getOut` |
| `DevHost` (= `PaneHost` + `LabHost` + `ProvingPaneHost` + 9 own) | devPanel.ts 37 | `ModGame` | `DevPanel`, `WorldPanes`, `LabPane`, `ProvingPane` | `tune`, `devTools`, `devLabVehicle`, `provingSession`, `provingHud`, `devPick`, `devSpawn`, `devPreview`, `devClear`, `devRepair`, `devStock`, `devModel`, `devOpened`, `devNewGame` |
| `SessionHost` | provingSession.ts 17 | `ModGame` | `ProvingSession` | `time`, `seated`, `focus`, `proving`, `provingCones`, `teleportTo`, `swapBuild`, `enter` |
| `PadHost` | pad.ts 21 | closure, `padHost()` 2360–2427 | `ModPad.update(host)` each frame | 18 callbacks (`primary`, `use`, `pack`, `hotbar`, `listMove`, `bench`, …) |
| `PlacesHost` | places.ts 117 | closure, `placesHost()` 1700–1734 | `Places` | `world`, `origin`, `loose`, `vehicles`, `play`, `warm`, `loop`, `say`, `openContainer`, `fuelled`, `opened`, `makeWorkshop`, `dropWorkshop` |
| `WreckHost` | wrecks.ts 89 | closure, `wreckHost()` 1737–1751 | `Wrecks` | `world`, `core`, `addVehicle`, `removeVehicle`, `stowLoot`, `ridersOf`, `restoreRiders`, `restoreGrimeOf` |
| `WorkshopHost` | workshop.ts 85 | two inline literals, 676–703 and 799–825 (duplicated) | `Workshop` | `root`, `loose`, `ui`, `stock`, `origin`, `camera`, `groundAt`, `addSolid`, `addSurface`, `sound`, `loop`, `stockChanged`, `benchMode`, `genSound`, `sparks`, `iconOf`, `cardOf`, `crafted` |
| `DoorHost` | doors.ts 51 | inline literal, 887–895 | `Doors` | `core`, `origin`, `model`, `play` |
| `GarageContext` | garageStub.ts 47 | closure, `garageContext()` 3623–3645 | `GarageScene.update` | `vehicles`, `loose`, `player`, `ui`, `seated`, `hour`, `checklist()`, `changed`, `sound` |
| (none) | — | — | `DevWorld` takes the concrete `ModGame` | `env`, `time`, `core.frame`, `audio.weatherGain`, `place`, `seamless`, `world`, `roadS`, `devWorld()`, `teleport`, `params`, `seated`, `focus` |

Only `entry.ts` (value) and `devWorld.ts` (type) import `ModGame`.

### 3.6 Save, snapshot, restore

`snapshot(): SaveV1 | null` (1511–1554) returns `null` in shot mode, during the stub garage's fade, or with no vehicles.
It collects: `place`, `hour` (`env.clock.hourAt(time)`), `done[]`, own vehicles (`vehicles` minus live wrecks: build by
reference, `x`, `z`, `yaw`, radio), loose things (minus wreck riders and things the places still own; a rider records the
**index** of its vehicle in the saved array plus `pos`/`rot`/`zone`/`lie`), the walker, `hands` (hotbar), `sel`, `pack`,
`body`, `stock`, the workshop (`workshop.snapshot()` or `workshopKept`), then either `world: {seed}` + `seat` (index)
when seamless, or `road: {s, seed}` with only the driven vehicle on the stub/road path; `wrecks.snapshot()`;
`places.snapshot()` + `doors.snapshot()`.

`save()` (1557–1564): skipped when `saveOff`, `!params.keep` or dead; `writeSave(snapshot)` then `keepGrime()` (changed
masks to IndexedDB, unreferenced ones dropped). Triggers: every 30 s (3507), `visibilitychange` when hidden, `pagehide`
(2298–2303). Restore points: `pushRestore(snapshot())` every 300 s of play (1229–1233).

Restore is **spread over eight places**: `entry.ts` 51–53 (start, hour, seed), `populate()` 998/1099 (stock),
`makeWorkshop()` 705 (`restore.workshop`), `restoreGarage()` 1461–1480 (vehicles in order, loose, `done`, walker, hands,
seat), `restoreHands()` 1483–1501 (body, pack, slots, sel), `restoreGrime()` 1591–1613, `makeWorld()` 896
(`restore.places.doors`), first `step()` 3537/3541 (`restore.wrecks`, `restore.places`).

New game: `newGame()` (1656–1668) sets `saveOff`, `clearSave()`, `clearRestores()` (before 2026-11-23 only the death card did), `void forgetMasks()`, writes a fresh seed, then
`location.replace(pathname[?quality])`. Reached from F9 twice (`askNewGame` 1641), the death card, and
`devNewGame(resetDials)` (2163). The address's `?new=1` does the same before the game is made (`entry.ts` `beginAgain`: the save, the restore points, the masks; the world the address's seed or the first one) and takes `new` out of the address (`history.replaceState`), so a reload goes on with that game.

Death: `stepDeath` (1261–1302) — a `revive` item in the hotbar is consumed; a non-kept page revives at 50 hp; otherwise
the death card lists restore points (`useRestore(i)` then `location.reload()`), with `saveOff = true`.

### 3.7 Who creates and steps what

| Thing | Created | Stepped | Notes |
|---|---|---|---|
| World (`World`) | `makeWorld()` 874 via `modcarWorld` | pure data; `env.update` writes `world.wetness/snowCover` | `devWorld()` 500 makes a probe world in the stub garage |
| World view | 882 | `worldView.update(fx, fz, budgetMs)` 4063 | `skipObject` hides wrecks, garage workbenches and what `siteArt` draws |
| Time | `env.clock` (`DayClock`, 40-minute day) | derived from `ModGame.time` each `env.update` | only the hour is saved; `time` restarts at 0 on every load |
| Weather | `env.weather = new WeatherSystem(seed)` | fixed 0.25 s steps inside `env.update` (environment.ts 105–113) | schedule is a pure function of `(time, seed)`: it replays from the start after a reload |
| Player | 465 | `player.update` 3559 (on foot only) | walker land = `SeamlessLand`; solids via `player.addSolids` |
| Body | field 265 | `stepBody` 3512 | `warmth: 9` is a constant (1203); needs can be switched off (assists) |
| Vehicles | `addVehicle` 1670 (populate, restore, dev spawn, wrecks) | loop 3584–3609, `v.view.update` 3877 | each sim has its own accumulator, ≤10 substeps a frame; unattended ones sleep (vehicle.ts 119) |
| Loose things | `loose.addPart/addTool/addItem` | `loose.update` 3612, `loose.follow` 3619 | riders via `Carrier` |
| Cargo | 454 | on demand (`weigh`, `aim`, `stow`) | |
| Places | first step 3541 | `places.update` 3542 (rescan every `CHECK_EVERY`), come < 80 m, go > 190 m | contribute `devices`, `ports`, roadside `Workshop`s |
| Site art / doors | `makeWorld` 884–897 | 3551 / 3552 | |
| Wrecks | first step 3537 | `wrecks.update` 3539 (every 0.4 s): spawn < 230 m, despawn > 420 m | live wrecks are ordinary `ModVehicle`s in `vehicles[]` |
| Starting workshop | `makeWorkshop()` 670 in `populate` | 3518 (`update`), 4027 (`frame`) | |
| Roadside workshops | `makeRoadWorkshop(site, save)` 718 via `PlacesHost` | same loops | own root, own `SolidList` |
| Garage | 440 | `garage.update` 3616 | the one indoor room of the renderer |
| Proving ground | `makeWorld` 876–881 | `stepCones` 3610, `provingRun.update` 3611, `provingView.update` 4064 | |

### 3.8 What the harness sees

`window.__rt` (entry.ts 84–733): `ready`, `lastError`, `game`, `params`, `info`, `simulate`, `render`, `telemetry`,
`setView`, `setOrbit`, `look`, `setHour`, `setWeather`, `stand`, `aim`, `aimCap`, `aimFiller`, `filler`, `useDevice`,
`hold`, `pickUp`, `aimAt`, `aimPoint`, `genFiller`, `workshop`, `addStock`, `holdFor`, `craftAll`, `aimLoose`, `select`,
`scrub`, `grime`, `useFor`, `takeFor`, `press`, `drop`, `dropFor`, `aimZone`, `floorOf`, `stowed`, `provingGo`,
`provingRobot`, `provingAB`, `provingState`, `proving`, `fit`, `remove`, `setBuild`, `paint`, `openPanel`, `enter`,
`exit`, `crank`, `drive`, `newPart`, `placeVehicle`, `garageCost`, `lights`, `dash`, `builds`, `part`, `partName`, `dev`,
`devPick`, `devDrop`, `loose`, `devTab`, `devGo`, `devGoKm`, `devWhere`, `devWeather`, `devHour`, `devDial`,
`devExport`, `worldPending`, `placeSites`, `places`, `listOpen`, `take`, `wrecks`, `wreckSpots`, `biomeDef`.

`telemetry()` (4604–4630): `place`, `seated`, `calls`, `triangles`, `programs`, `kmh`, `exploded`, `vehicles[{frame,
parts, running, x, z}]`, `loose`, `wrecks`, `places`, `siteArt`, `shake`, `rumble`, `dust`, `tyres`, `wipers`, `tutorial`,
`steps`, then **spread at top level** `garage.telemetry()` (`garage`, `doorGap`, `doorsOpen`, `lamps`, `lit`, `power`,
machines…) and `player.telemetry()` (`held`, `slot1`, `slot2`, `sel`, `target`, `progress`, `flow`, `footX`, `footZ`,
`heading`). `run.mjs` reads `calls`, `triangles`, `programs`, `kmh`, `exploded` for every shot.

The scripts use `__rt.game` directly about 290 times. Public members they depend on include `vehicles`, `player.*`,
`loose.list`, `seated`, `place`, `step`, `simulate`, `render`, `save`, `snapshot`, `scripted`, `rightButton`, `world.spine`,
`ground.sample`, `worldView.update/pending`, `core.scene/stats/renderer/camera/origin`, `env.state`, `input.lookYaw/Pitch`,
`devTools.*`, `tune.*`, `places.*`, `doors.*`, `siteArt`, `wrecks`, `body`, `assists.needs`, `stock`, `done`, `orbit`.
**TS-private members they read or write by name**: `grimeShowT` (modcar_grime 111), `mist` (modcar_paint 43),
`deadT` (modcar_vitals 146), `restoreT` (written, modcar_vitals 157), `listV` (read modcar_places 228; written
modcar_stow 88; also entry.ts 711), `voice`, `radio`, `loopsOn`, `foley` (modcar_audio_probe 19–82), `fadeT`
(modcar_seamless 54), and `ui.toast`.

### 3.9 Harness scripts that would catch a regression here

All need a headless Chrome (`/usr/bin/google-chrome` is present on this machine; default is SwiftShader).

| Concern in ModGame | Scripts |
|---|---|
| Boot, populate, tutorial, garage devices | `modcar_first`, `modcar_journey` (the end-to-end run), `modcar_garage_devices`, `modcar_probe`, sets `modcar_garage` |
| The frame must never throw | `modcar_stress` (every part off and on, every panel, every tool; then live loop), `modcar_fuel`, `modcar_hud`, `modcar_edges` — all check `__rt.lastError` or page errors |
| Input wiring (`bindInput`, `padHost`) | `modcar_hud` (real keys), `modcar_pad`, `modcar_fuel` |
| Save / restore / new game | `modcar_save`, `modcar_restart`, `modcar_seamless`, `modcar_stow`, `modcar_cargo`, `modcar_paint`, `modcar_grime` (IndexedDB masks), `modcar_vitals` (body, death, restore points), `modcar_workshop`, `modcar_wrecks`, `modcar_places`, `modcar_axles` (old save migrated) |
| World, streaming, teleport, env hooks | `modcar_seamless`, `modcar_devworld`, `modcar_wrecks`, `modcar_places`, `modcar_frames_drive`, `modcar_brakeheat`, `modcar_seat`, `modcar_wipers`, `modcar_proving` |
| Audio front end | `modcar_audio_probe`, `modcar_edges` |
| Developer panel | `modcar_dev`, `modcar_devworld`, `modcar_lab`, `modcar_proving`, `modcar_restart` |
| Draw calls / triangles / frame time | `run.mjs` with sets `modcar_road`, `modcar_garage`, `modcar_mods`, `modcar_night`, `modcar_panels`, `modcar_rust`, `modcar_rv`, `modcar_scoop`, `modcar_stretch`, `modcar_v8`; `modcar_perf` (mean and p95 ms over 90 frames, four cases), `modcar_garage_cost`, `modcar_calls_probe`, `modcar_car_meshes` |

Vitest files that guard pieces this file consumes (not the file itself): `core-purity.test.ts`, `modcar_pad.test.ts`
(the `PadHost` contract — run here: 5 tests pass), `modcar_floor.test.ts` (`FloorGround`), `modcar_seat.test.ts`
(`SeatShake`, `WheelDust`), `modcar_tyresound.test.ts`, `modcar_proving*.test.ts`, `modcar_siteart.test.ts` and
`modcar_buildings.test.ts` (use `modcarWorld`/`modcarWorldOptions`), `modcar_vitals.test.ts`, `modcar_workshop.test.ts`,
`modcar_cargo.test.ts`, `modcar_wrecks.test.ts`.

---

## 4. Extension points that exist today

1. **Host interfaces** (3.5). A new subsystem can be given a narrow closure host exactly as `Places` and `Wrecks` are.
2. **`GarageDevice` + the `devices` getter** (garageStub.ts 21–44; ModGame 656–661; consumed in `ModPlayer.pick()` 719–733,
   `act()` 929–944 and 1089–1099, `ui()` 1435–1441). It is already a generic "thing under the mark that E works":
   point+radius or its own `hit(ray, reach)`, a `word`, optional `state`, `card`, `holdS`/`holding(p)` for a held action,
   `take(held)`/`useWith(held)` for "use the held thing on it". Garage, workshop, places and doors all feed it.
3. **`TankPort` + the `tanks` getter** (player.ts 132; ModGame 663–667): non-vehicle liquid containers.
4. **`Carrier`** (loose.ts 68; `loose.carriers` 453): anything with a `frame: Object3D` and `surfaceAt` can carry loose things.
5. **`SolidSource` / `SolidSet`**: `player.addSolids/removeSolids` (public), `vehicleSolids.add/remove` (private field 348);
   `SolidList` (229) is the local helper for a few boxes.
6. **Ground decorators**: `floored()` (984) wraps any `Ground` in `FloorGround`; `SeamlessGround`/`SeamlessLand` compose two.
7. **Floating origin**: `core.place(obj, wx, wy, wz)`, `core.onRebase(fn)`.
8. **Environment hooks**: `env.tune` (a single slot, taken by `DevWorld`), `devTools.beforeEnv/afterEnv` (4093/4095).
9. **World view hooks**: `worldView.skipObject` (single slot, 899), `redrawSite(id)`, `redrawFurniture(s)`.
10. **Vehicle sim hooks**: `sim.solids`, `sim.onKnock` (a single slot per sim, assigned in `roadSolids` 965).
11. **Sound by name**: `sound(name, gain, mount)` (one-shots and aliases, 2671–2733), `loopFor(name, gain, rate, cutoff)`
    (a loop is kept alive by being asked for each frame, 2736), `warmQueue`. Names must be in `FOLEY_SHOTS`/`FOLEY_LOOPS`.
12. **Input**: `input.onAction/onRelease`, `input.isDown(code)` (polled, e.g. `KeyP` at 1199), plus raw DOM listeners in `bindInput`.
13. **Item facets**: `ItemDef.eat/drink/heal/revive/wear/pack/lamp/gear` — "what an item does" is data. `eat`, `drink`,
    `heal`, `revive`, `pack` are implemented in `player.ts`/`ModGame`; **`wear`, `lamp`, `gear` are shown on cards but
    do nothing** (no equipment slots, no lamp light, no hammer/repair action).
14. **Harness surface**: `window.__rt`, `telemetry()`, `scripted`, `rightButton`, `dropButton`, URL params.
15. **Dials**: `tune.get(id)`, `tune.onChange(fn)`; there is no public way to add a dial or a dial tab.

There is **no**: system list, event bus, interaction registry beyond devices/tanks, held-item behaviour hook, modal/focus
stack, save-slice mechanism, key-binding registry, shelter query, body modifier hook, or `dispose()`.

---

## 5. Invariants and the tests that guard them

| # | Invariant | Where | Guard |
|---:|---|---|---|
| 1 | `src/core` imports no three, no DOM, nothing from `src/game` | whole tree | `harness/sim/core-purity.test.ts` |
| 2 | `step()` never draws; `simulate(s)` is fixed 1/60 steps; `simulate(0)` is two `dt = 0` steps and must be idempotent | 4535–4540 | every script (they call `simulate(0)` after each command); no explicit test |
| 3 | A frame that throws must not stop the loop; the error surfaces as `rt.lastError` | entry.ts 763–780 | `modcar_stress`, `modcar_fuel`, `modcar_hud` |
| 4 | `rt.ready` becomes true only after `game.ready`; in shot mode after `simulate(0.8)` + one render | entry.ts 747–760 | `lib.mjs openGame` waits on it (180 s) |
| 5 | `vehicles[0]` is the tutorial car: `tutorialSteps` (3417), `checkTutorial` (3450), `objective` (4268), `windscreenClean` (4544), checklist HUD (4256) | — | `modcar_journey`, `modcar_grime` |
| 6 | Saved riders and the seat refer to vehicles by **index** into the saved `vehicles` array; wrecks are filtered out first so the order of own vehicles is stable | 1515–1519, 1541, 1158, 1474 | `modcar_seamless`, `modcar_stow`, `modcar_cargo` |
| 7 | Live wrecks are in `vehicles[]` but are not saved as vehicles until claimed (`enter` → `wrecks.claim`, or moved > 15 m) | 1515, 2456, wrecks.ts 172–176 | `modcar_wrecks` |
| 8 | Seamless: `place` is recomputed every step from `onPlot`; nothing is disposed when leaving the yard | 3492–3500 | `modcar_seamless` |
| 9 | A page with `start/build/project/garage/shot` in its URL never reads or writes the save | entry.ts 37–53; `save()` 1558 | `modcar_save` |
| 10 | A save with an unknown part/item/frame id is set aside whole, not partly loaded | save.ts 86–143 | `modcar_axles` covers the migrate-forward case only |
| 11 | Part/build and item uids from a save are reserved before anything new is created | save.ts 115–131 | none (tool uids are **not** reserved — see risks) |
| 12 | `body` is replaced, not mutated, on restore | 1485 | `modcar_vitals` |
| 13 | The hotbar has `2 + pack.slots` entries | player.ts 314–330, ModGame 1492–1496 | `modcar_stow`, `modcar_hud` |
| 14 | Loops requested with `loopFor` live for one frame; `updateFoley` starts/stops by diffing `loopsNow` against `loopsOn` | 3301–3313 | `modcar_audio_probe` |
| 15 | Dust, sparks, splashes and loose things are simulated in world metres and drawn relative to `core.origin` | wheelDust.ts 82, sparks.ts 22, loose.ts 186 | none |
| 16 | Top-level `telemetry()` keys and the private names listed in 3.8 | 4604–4630 | the scripts themselves (a rename yields `undefined`, often silently) |
| 17 | Generation that gameplay depends on is deterministic from the seed (docs/PLAN.md 15) | core/world | `roadgen.test.ts`, `sites.test.ts`, spine hash check in `run.mjs` |

The budgets that exist in writing — docs/MODCAR.md §10 line 299 (60 fps at 1080p in the garage and on the road, one
vehicle ≤ 40 draw calls) and the header of `modcar_garage_cost.mjs` (garage ≤ 150 draw calls, ≤ 400k triangles) —
have **no spec card**: `specs/` contains no modcar render card, so `judge.mjs` does not gate them. The
last metrics committed (`loop/metrics/render_modcar_*.json`, 2026-11-16, software renderer, 1280×720, quality high):
`modcar_road` max 388 calls / 1.33 M triangles; `modcar_garage` max 566 / 1.54 M; `modcar_rv` max 432 / 1.57 M;
`modcar_night` 413 / 1.32 M; `modcar_mods` 430 / 1.33 M. These predate places, wrecks and the proving ground.

---

## 6. Risks for V3

**R1. Every new feature edits the same 4,600-line file.** Without the seams in section 7, parallel work on ecology,
fishing, cooking, crafting, caravans and world-gen would all touch `step()`, `updateViews()`, `snapshot()`, `bindInput()`
and `player.ts`'s `pick()/act()/ui()`.

**R2. The save is all-or-nothing and loaded before modules exist.** `loadSave()` (entry.ts 39) runs before
`new ModGame`. If a V3 module's items are not in the catalogue by then, `check()` throws on the first unknown id and the
player's game is replaced by a new one. The catalogue (`ITEMS`, `PARTS`, `RECIPES`) is built at module-import time from
closed arrays (`items.ts` 112–259); `ItemCat` and `ToolKind` are closed unions.

**R3. Uid reservation covers only the places `loadSave` knows.** It scans `vehicles`, `wrecks.kept`, `places.left`,
`loose`, `hands`, `pack`. Instances stored anywhere else (a slice for a caravan's cupboards, a cooking station, a
trophy wall) would not be reserved, and `newItem()`/`newInstance()` could mint a duplicate uid after a reload. Tool
uids (`t…`, tools.ts 117–123) are not reserved at all today.

**R4. localStorage is the wrong size for V3.** One `SaveV1` plus six copies as restore points live in a ~5 MB origin
quota; `writeSave` swallows a quota error silently (save.ts 145–151) and `pushRestore` degrades to fewer points.
Moving to IndexedDB makes loading asynchronous (entry.ts must await before constructing the game) and makes the
`pagehide`/`visibilitychange` flush (2298–2303) unreliable unless a small synchronous journal remains.

**R5. Harness scripts read private fields by name** (3.8). Moving `listV`, `deadT`, `restoreT`, `fadeT`, `grimeShowT`,
`mist`, `voice`, `radio`, `foley`, `loopsOn` out of `ModGame` (or renaming them) breaks scripts, some of them silently.

**R6. `Held` is a three-way union switched on in 112 places** (ModGame 30, player 47, workshop 11, garageMachines 8,
cargo 7, held 5, loose 2, places 2). A fourth kind (weapon, rod) would touch all of them. `HeldThing` also scales every
model to fit 0.19 m (small) or 0.36 m (large) (held.ts 229): a rifle would be drawn 19 cm long.

**R7. Buttons are not distinguishable by a held thing.** `player.press('mouse')` and `press('key')` both become
`primary` unless a cleaning tool is held (358–362); the right button, F and the pad's LT all become `take` (3567). A
firearm needs LMB = fire, RMB = aim, E = interact, R = reload; R is "set upright" only while seated, and there is no
key registry: bindings are split between `InputManager.KEY_ACTIONS` (shared with the classic game), `bindInput`'s
keydown chain (2228–2293) and `input.onAction` (2304–2339).

**R8. There is no modal stack.** Who owns the keys and the mouse is decided by ad-hoc flags checked in at least seven
places: `benchWs` (2179, 2230, 2372, 3558, 4261), `dev?.open`, `listV`, `deadT >= 0`, `ui.assistsShown`,
`player.aside`, `input.lockable`, `input.lookHold`. Each new full-screen UI (unified workbench, cooking steps,
compendium, skills, furniture placement, a fishing minigame) would add another flag to each.

**R9. The vehicle loop cannot express a hitch.** Each `ModVehicle.step` calls `sim.update(dt, …)` with a private
accumulator and up to 10 substeps (sim.ts 1164–1174); vehicles are stepped one after another (3584–3609); `VehicleSim`
has no external force/impulse entry. A tow constraint needs lockstep substepping of the coupled pair and a force API —
a change to both the loop and the core sim. Unattended vehicles also sleep (vehicle.ts 119), and the camera, sound and
streaming all follow `seated`/`focus` (a single vehicle).

**R10. "Indoors" means the starting garage only.** `indoors()` (1176) asks `garage.indoors`; `bodyAirC()` (1183), the
rain flag for vitals (1203), the wipers (3858), the generator's muffling (3286) and the splashes (4113–4133, which read
the single global `uRoomMin/uRoomMax` box) all derive from it. Roadside buildings, caravans, tunnels and camp shelters
are outdoors to every one of these today.

**R11. Position along the road is taken from world x.** `spine.sAtX(x)` ("x increases monotonically along the road",
spine.ts 327) is used by `snapshot()` (1549), `wrecks.update` (wrecks.ts 180), `places.update` (places.ts 242),
`siteArt` (510) and core world code. Hairpins and spur roads break the premise.

**R12. Time is not persistent.** `ModGame.time` restarts at 0 on every load; only the hour is saved. The weather
schedule and anything keyed on `time` (animal schedules, a pacing director, timed buffs, cooldowns) restart with it.
`uTime` for the shaders is the same number (core.ts 115), so simply restoring a large `time` would cost shader precision.

**R13. `ui.say()` is a single toast** (ui.ts 260–265): the last caller in a frame wins. `ModGame` alone calls it from
36 places.

**R14. Dev-panel tabs and dials are closed.** `TABS`/`TabId` (devPanel.ts 83–94), the `showTab` dispatch (268–273),
`header()` (279–303) and `DialTab` (devTune.ts) are literals.

**R15. Start-up waits for every part model** (`preload(PARTS.map(id))`, 997) and then up to 15 s of world streaming.
Adding asynchronous system `init`s to `ready` lengthens the harness's wait (timeouts 180–240 s under SwiftShader).

**R16. Latent defects found while reading** (not V3 work, but they sit exactly where V3 will plug in):
- `BeaconView` is constructed (901) but `beacons.update()` is never called in ModGame (the classic game calls it at
  game.ts 699): lighthouse lamps are never created in ModCar.
- `PartThumbs` owns a WebGL context of its own (thumbs.ts 117–123) and is instantiated twice (ModGame 1821, DevPanel 186):
  up to three contexts on the page.
- `Workshop` device ids are fixed (`gen_cord`, `gen_switch`, `recycler`, `bench`, `generator`; workshop.ts 508–629). Two
  roadside garages live at once share the hold-progress key `device:<id>` (player.ts 865) and `devices.find(id)`.
- `ModPlayer.packIn` opens a lid (player.ts 1241) and `Cockpit.press` a door (cockpit.ts 106–110) without calling
  `panelOpened`: an event emitted from `panelOpened` would miss both, and a wreck's boot opened by packing a thing
  into it skips the first-look reveal (which `panelOpened` runs for bonnets and boots only, 2530).
- Crouching is implemented in `FootWalker` but unreachable: `ModPlayer.update` never sets `input.crouch` (player.ts
  477–480) and `C` is the camera key.
- `player.update(…, {…} as never)` (3569) silences the type check on the keys object.
- The non-seamless path (`leaveGarage` 3817, `exitGarage` 624, re-running `makeWorld`) is exercised by one screenshot
  (`modcar_garage.json: garage_stub`) and by no behavioural script.

**R17. Randomness is unseeded at the game layer.** Core functions take their roll as an argument (a good pattern), but
the callers pass `Math.random()`: `medicate(…, Math.random())` (ModGame 1241), `pullCord(gen, Math.random())`
(workshop.ts 664). docs/PLAN.md line 15 requires gameplay-relevant generation to be deterministic from the seed; hit
rolls, loot, bites and spawn choices in V3 need a seeded stream from the context, not `Math.random()`.

**R18. A rejected `ready` hangs the page.** `entry.ts` 747 does `void game.ready.then(…)` with no rejection handler:
if `populate()` (or, after the refactor, any system's `init`) rejects, `rt.ready` never becomes true, the loading card
stays, and every harness script waits out its 180–240 s timeout.

---

## 7. Proposed seams

Goal (docs/V3/PLAN.md, 技术架构): after one change to the shared files, a V3 module is a folder that exports one
`install` function; it never edits `ModGame.ts`, `player.ts`, `save.ts`, `entry.ts` or `devPanel.ts` again.

This map owns the **lifecycle side**: the system registry, the context, the event bus, save slices, the frame's hook
positions, the harness surface, and the complete list of edits to `ModGame.ts`. The **player side** (held behaviours,
world interactables, UI modes, first-person view layers, stance and worn things) is specified in
`docs/V3/maps/player-interaction.md` S2–S4, S7, S8, and the item/buff/knowledge contracts in
`docs/V3/maps/items-economy.md` S1–S7. Where they overlap this map adopts their contracts and only says what has to
happen in `ModGame.ts` (7.2 A-rows marked *PI* or *IE*); 7.5 lists the names the three maps still differ on.

### 7.1 The kernel (all new files)

Pure parts — put them with the shared contracts (`src/core/v3/contracts/` in docs/V3/LOOP_V2.md) so they are unit-tested
in Node. They use no DOM (`performance.now()` is not matched by the purity test):

```ts
// events
export class EventBus<M extends object> {
  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): () => void;   // returns the unsubscribe
  emit<K extends keyof M>(type: K, e: M[K]): void;                     // synchronous; a throwing listener is reported, the rest still run
}

// systems
export interface System<C> {
  readonly id: string;                       // also its save-slice key and its telemetry key
  readonly after?: readonly string[];        // ids that must come first
  readonly budget?: { ms?: number; draws?: number; tris?: number };   // declared at registration (PLAN: 性能是架构的一部分)
  init?(ctx: C): void | Promise<void>;
  preStep?(dt: number, ctx: C): void;        // before the body, the player and the vehicles
  step?(dt: number, ctx: C): void;           // after the vehicles and the loose things, before any view
  lateUpdate?(dt: number, ctx: C): void;     // camera, origin and this frame's weather are final
  readonly saveVersion?: number;             // default 1
  save?(): unknown;                          // JSON-safe; must not mutate
  load?(data: unknown, ctx: C, fromVersion: number): void;
  dispose?(): void;
  telemetry?(): Record<string, unknown>;
  readonly harness?: Record<string, (...a: any[]) => unknown>;   // reachable as __rt.sys(id, fn, ...args)
}
export class SystemRegistry<C> {
  add(s: System<C>): void;                   // throws on a duplicate id or after init
  get<T extends System<C>>(id: string): T | undefined;
  init(ctx: C): Promise<void>;               // topological by `after`, ties by id; hooks are no-ops until it resolves
  preStep(dt: number, ctx: C): void;  step(dt: number, ctx: C): void;  lateUpdate(dt: number, ctx: C): void;
  dispose(): void;                           // reverse order
  telemetry(): Record<string, unknown>;      // { [id]: { ...system.telemetry(), ms: { pre, step, late, max }, over: boolean } }
  onError: (id: string, phase: string, e: unknown) => void;
}

// save slices (the contract docs/V3/maps/items-economy.md S7 builds on)
export interface SaveSlice<T = unknown> {
  readonly id: string; readonly version: number;
  readonly heavy?: boolean;                  // kept in IndexedDB on the 30 s timer, not written on pagehide
  snapshot(): T | undefined;                 // undefined: nothing to keep; must not mutate
  restore(data: T, fromVersion: number): void;
  migrate?(data: unknown, fromVersion: number): T;
  uids?(data: T): { parts?: string[]; items?: string[]; tools?: string[] };   // reserved before anything is created
  clear?(): void | Promise<void>;            // a new game
}
export class SaveSliceRegistry {
  add(s: SaveSlice): void;
  snapshot(): Record<string, { v: number; d: unknown }> | undefined;
  restore(all: Record<string, { v: number; d: unknown }> | undefined): void;   // a slice that throws is dropped alone
  uids(all: Record<string, { v: number; d: unknown }> | undefined): { parts: string[]; items: string[]; tools: string[] };
  clear(): void;
}
```

`save`/`load` on a system and the slice registry are one mechanism: a system that implements `save` gets a slice
under its own id (version `saveVersion`), written and restored through `SaveSliceRegistry`. `ctx.saves.add` is for
slices that need `migrate`, `uids` or `heavy`, or that belong to no system (the save's head, knowledge, the stash).

Three rules for the registry, each from something observed in the code:
- It wraps every call in `try/catch` and times it. One system throwing must not abort the frame for the others
  (today any throw aborts the rest of `step`; only the loop survives, entry.ts 768–778), and `onError` must reach
  `rt.lastError` so the scripts still fail loudly.
- `init()` must **always resolve**: a system whose `init` throws or rejects is marked failed and skipped from then on,
  never allowed to reject `game.ready` (R18).
- The `ms` it records per system and phase is the per-system accounting the plan asks for. Draw calls cannot be
  attributed from `renderer.info` (it is global); attribute them by traversing the roots a system owns, as
  `Garage.cost()` already does (garage.ts, `cost()`).

Game-typed parts (they name `ModVehicle`, `RenderCore`, …, so they live under `src/game/modcar/`):

```ts
export interface GameContext {
  // registries with state (per game instance)
  readonly events: EventBus<GameEvents>;
  readonly systems: SystemRegistry<GameContext>;
  readonly saves: SaveSliceRegistry;
  readonly interact: InteractSet;            // player-interaction.md S3
  readonly modes: UiModeStack;               // player-interaction.md S4
  readonly devTabs: DevTab[];
  // engine
  readonly core: RenderCore;  readonly env: Environment;  readonly input: InputManager;
  readonly audio: AudioEngine;  readonly ui: ModUI;  readonly tune: Tune;  readonly params: ModParams;
  // world (null in the stub garage until one drives out)
  readonly world: World | null;  readonly worldView: WorldView | null;  readonly ground: Ground;
  groundAt(x: number, z: number): number;
  // state — read each time, never cache `body`
  readonly time: number;                     // seconds since the page loaded
  readonly place: 'garage' | 'road';  readonly seamless: boolean;
  readonly player: ModPlayer;  readonly body: Vitals;  readonly stock: Stock;
  readonly vehicles: readonly ModVehicle[];  readonly seated: ModVehicle | null;  readonly focus: ModVehicle | null;
  readonly loose: LooseThings;  readonly cargo: CargoBay;
  subject(out: { x: number; y: number; z: number }): void;      // the seat's vehicle, else the walker
  // services
  addVehicle(build: Build, x: number, z: number, yaw: number): ModVehicle;
  removeVehicle(v: ModVehicle): void;
  changed(v: ModVehicle, what: string): void;
  addSolids(src: SolidSource, forVehicles?: boolean): void;  removeSolids(src: SolidSource): void;
  sound(name: string, gain?: number, mount?: string): void;
  loopFor(name: string, gain?: number, rate?: number, cutoff?: number): void;
  hurt(hp: number, why: string): void;                          // items-economy.md S5 `damage`
  say(text: string, seconds?: number): void;                    // one queue instead of last-writer-wins (R13)
  rng(stream: string): () => number;                            // seeded from params.seed + stream (R17)
  iconOf(h: NonNullable<Held>): string | null;
  readonly shelters: ((x: number, y: number, z: number) => { roof: boolean; airC?: number } | null)[];
}

// open for declaration merging, so a module adds its own events without editing this file
export interface GameEvents {
  'game:ready': {};  'game:saved': {};  'game:new': {};
  'world:made': { world: World };
  'vehicle:added': { v: ModVehicle };  'vehicle:removed': { v: ModVehicle };
  'vehicle:changed': { v: ModVehicle; what: string };
  'vehicle:panel': { v: ModVehicle; mount: string; open: boolean };
  'vehicle:knock': { v: ModVehicle; solid: Solid; vx: number; vz: number; speed: number };
  'player:entered': { v: ModVehicle };  'player:left': { v: ModVehicle };
  'player:place': { place: 'garage' | 'road'; was: 'garage' | 'road' };
  'player:teleported': { x: number; z: number };
  'item:taken': { held: NonNullable<Held> };  'item:put': { held: NonNullable<Held>; into: ModVehicle | null };
  'body:ate': { item: ItemInstance };  'body:drank': { liquid: string; litres: number };
  'body:died': { why: string };  'body:revived': {};
  'stock:changed': { delta: Cost };  'craft:made': { recipe: string };
}

export interface DevTab { id: string; label: string; sub?: string; hint?: string; build(el: HTMLElement): void; tick?(): void }
```

Static definitions (items, materials, recipes, buffs, held behaviours, view definitions) register at **module top
level** through the functions the sibling maps define (`registerItems`, `registerHeld`, `registerBuffs`, …). Static
imports are evaluated before `entry.ts`'s body runs, so everything registered that way exists before `loadSave()`
(entry.ts 39) — which is what R2 needs — provided the module list is imported statically.

A module is then (nothing outside its own folders is edited):

```ts
// src/game/modcar/v3/forage/index.ts
import './content';                                         // top level: registerItems(FORAGE_ITEMS) etc.
export function install(ctx: GameContext): void {
  const sys = new ForageSystem();                           // implements System<GameContext>, with save()/load()
  ctx.systems.add(sys);                                     // its slice 'forage' comes with it
  ctx.interact.add(sys);                                    // an InteractSource: near(x, z, r, out)
  ctx.devTabs.push({ id: 'forage', label: '采集', build: (el) => sys.buildDevTab(el) });
  ctx.events.on('player:teleported', () => sys.flush());
}
declare module '../../kernel/events' { interface GameEvents { 'forage:picked': { species: string } } }
```

The list of modules is one file (`src/game/modcar/v3/modules.ts`, one import and one line per module in alphabetical
order, as player-interaction.md proposes). It can instead be generated with
`import.meta.glob('./*/index.ts', { eager: true })` so that not even that file is shared; Vite and Vitest both
support it, and the file then needs `/// <reference types="vite/client" />` because `tsconfig.json` restricts `types`
to `node` (not compiled here).

Rules a system must follow, all of which come from how the frame is built today (3.3):
- tolerate `dt = 0` (never divide by `dt`; `simulate(0)` calls every hook twice);
- place world objects with `core.place` in `lateUpdate`, or subscribe to `core.onRebase` — never only in `step`;
- read `ctx.body`, `ctx.seated`, `ctx.world` each time (they are replaced or may be `null`); `wrecks` and `places` do
  not exist until the first `step`;
- refer to vehicles by `v.build.uid` in anything saved, never by index;
- request sounds every frame they should be heard (`loopFor`), and do no blocking or GPU-heavy work in `init`
  (start-up is already long, R15) or when `ctx.params.shot` is set;
- emit events for things that happen, not per frame; use `ctx.rng`, not `Math.random()`, for anything that matters.

### 7.2 Every place that changes

**A. `src/game/modcar/ModGame.ts`** — tier 0 is the minimum for systems to plug in (17 insertions, no behaviour
change while the registries are empty); tier 1 is needed by particular modules. *PI* = the ModGame half of a seam
specified in player-interaction.md; *IE* = of items-economy.md.

| # | Tier | Line(s) | In | Change |
|---:|:--:|---|---|---|
| A1 | 0 | 9–103 | imports | kernel types, the module list |
| A2 | 0 | 236 | class head | add `GameContext` to `implements` |
| A3 | 0 | after 409 | fields | `events`, `systems`, `saves`, `interact`, `modes`, `devTabs`, `shelters` |
| A4 | 0 | 475 | constructor | before it: `for (const install of MODULES) install(this)`; replace with `this.ready = this.populate().then(() => this.startSystems())` |
| A5 | 0 | new, near 1120 | `startSystems()` | `await systems.init(this)`; `saves.restore(restore?.slices)`; `events.emit('game:ready', {})` |
| A6 | 0, then *PI* S3 | 656–667 | `devices`, `tanks` | tier 0: the two getters also return what `interact` holds (an empty set changes nothing). With *PI* S3 the garage, the workshop, places and doors become four sources of `interact` and the player asks it by `near()`; keep `devices`/`tanks` as read-only views, because the harness and `objective()` use them (`devices.find(id)` at entry.ts 235 and 279, `tanks[0]` at 287; ModGame 4288, 4353). Both getters allocate on every call today: cache on a version counter |
| A7 | 0 | 978 | `groundAt` | `private` → public |
| A8 | 0 | new | `addSolids`, `removeSolids`, `subject`, `hurt`, `say`, `rng`, `dispose` | `addSolids` = what 793–794 does by hand (`player.addSolids` + `vehicleSolids.add`) |
| A9 | 0 | 1551–1553 | `snapshot()` | `const sl = this.saves.snapshot(); if (sl) s.slices = sl;` |
| A10 | 0 | 1657–1659 | `newGame()` | `this.saves.clear(); this.events.emit('game:new', {})` before `location.replace` |
| A11 | 0 | 1677, 1696 | `addVehicle`, `removeVehicle` | emit `vehicle:added`; emit `vehicle:removed` before `v.view.dispose()` |
| A12 | 0 | 2516–2517 | `changed()` | emit `vehicle:changed` (stop discarding `what`) |
| A13 | 0 | 2460, 2488 | `enter()`, `getOut()` | emit `player:entered` / `player:left` |
| A14 | 0 | 3510→3511 | `step()` | `this.systems.preStep(dt, this)` |
| A15 | 0 | 3612→3613 | `step()` | `this.systems.step(dt, this)` |
| A16 | 0 | 4098→4099 | `updateViews()` | `this.systems.lateUpdate(dt, this)` |
| A17 | 0 | 4627 | `telemetry()` | add `systems: this.systems.telemetry()` (namespaced: the garage's and the player's keys are spread at top level) |
| A18 | 1 | 700–702, 824 | workshop hosts' `crafted` | emit `craft:made` |
| A19 | 1 | 850 | `stockChanged` | emit `stock:changed` |
| A20 | 1 | 904 | `makeWorld()` end | emit `world:made` |
| A21 | 1 | 965–975 | `roadSolids` `onKnock` | emit `vehicle:knock` (the sim has one slot; the classic game used a listener array) |
| A22 | 1 (*IE* S5, *PI* S8) | 1176–1188, 1203, 3286, 3858 | `indoors`, `bodyAirC`, vitals' rain flag, generator muffling, wipers | ask `shelters` first; `warmth: 9` → the worn clothes' sum |
| A23 | 1 (*IE* S5) | 1221, 1237–1249, 1252, 1270, 1277 | walker speed, `consume`, `drank`, `onDeath`, the two revives | buff modifiers; emit `body:*`; `onDeath` takes any `why` |
| A24 | 1 | 1391, 1417 | `takeFromList` | emit `item:taken` |
| A25 | 1 (*PI* S2) | 2177–2204, 2221–2224 | `bindInput` mouse and wheel | feed the `Buttons` struct (source kept: E, LMB, F, RMB, R, wheel) instead of merging into `primary` / `rightButton` |
| A26 | 1 (*PI* S2, S4) | 2228–2293 | `bindInput` keydown | top `UiMode.key` first (replaces the `benchWs?.open` test at 2230 and the list keys at 2240–2247); unhandled keys go to the held behaviour |
| A27 | 1 (*PI* S4) | 856–868, 2179–2183, 2304–2306, 2372–2373, 3557–3558, 3570, 4261 | `benchMode`, bench click, `onAction`, pad host, `listing`, `lookHold`, pause card | one `modes` stack beside (then instead of) the flags |
| A28 | 1 | 2525 | `panelOpened` | emit `vehicle:panel` |
| A29 | 1 | 3495–3499, 558, 603 | place change, teleports | emit `player:place`, `player:teleported` |
| A30 | 1 (*PI* S2, S8) | 3559–3570 | `player.update` keys | pass `Buttons`, `crouch`; apply the behaviour's `mode.lookHold`; type the object (drop `as never`) |
| A31 | 1 (*PI* S2) | 3971, 3982–3999 | FOV, on-foot camera | the behaviour's `mode.fov` and `mode.kick` |
| A32 | 1 (*PI* S7) | 4015–4024 | held thing | a list of first-person layers (`fpLayers`) instead of the fixed calls |
| A33 | 1 | 3584–3609 | vehicle loop | only for the hitch: replace per-vehicle `v.step` with a lockstep stepper (needs `VehicleSim` support; a separate proposal, R9) |

**B. `src/game/modcar/player.ts`, `held.ts`, `garageStub.ts`, `pad.ts`, `input.ts`** — the edits are tabulated in
player-interaction.md (S2 table for `player.ts`: twelve regions between lines 43 and 1612; S3 table; S4; S7 table for
`held.ts`). Nothing in this map adds to them except: `PlayerHost` (150–186) gains `interact`/`events`, and the emits
at `player.ts` 901, 955, 1246, 1265 use the names of 7.5.

**C. `src/game/modcar/save.ts`** — `SaveV1.slices?: Record<string, { v: number; d: unknown }>` (after line 80);
`loadSave()` reserves `saves.uids(s.slices)` after line 127, and tool uids as well; slices are *not* run through
`check()`. The move to `SaveV2` (head + slices, IndexedDB for `heavy` slices, tolerant loading) is items-economy.md S7.

**D. `src/game/modcar/entry.ts`** — static import of the module list (so top-level registration precedes line 39);
`game.systems.onError → rt.lastError`; a rejection handler on `game.ready` (R18); three generic members so later
modules need no edit here: `systems: () => game.systems.telemetry()`,
`sys: (id, fn, ...a) => game.systems.get(id)?.harness?.[fn]?.(...a)`, `emit: (type, e) => game.events.emit(type, e)`.

**E. `src/game/modcar/devPanel.ts`** — `DevHost.devTabs` (37–56); `TABS` computed in the constructor from the built-ins
plus `host.devTabs` (85–94, used at 217 and 223); `showTab` falls through to the registered tab's `build(el)` (262,
268–273); `header()` takes `sub`/`hint` from the tab (279–303); `TabId` becomes `string`. Dials: `Tune` needs a public
`add(dial)` and `DialTab` to be a string (devTune.ts) for systems that bring dials.

**F. New tests** — a Node test for the pure kernel (order by `after`, error isolation, no dispatch before `init`
resolves, a failing `init` does not reject, slice versioning and migration, uid collection, budget flagging) and a
browser probe `harness/shots/modcar_kernel.mjs` with a probe module enabled by a URL flag: its
`init/preStep/step/lateUpdate` counts advance once per `step`; `simulate(0)` advances them by exactly two with
`dt = 0`; its slice survives save + reload and a new game clears it; its interactable is found by the mark; its
listener fires on `enter`; `telemetry().systems.probe` is present; a hook that throws is reported in `lastError` while
the game goes on.

### 7.3 Why these hook positions

- **`preStep` at 3511**: before `stepBody`, so clothing and buffs can feed this frame's vitals; after `time += dt`.
- **`step` at 3613**: after the player has acted (a shot fired this frame is integrated this frame) and after the
  vehicles and loose things have moved; before any view work. It runs *before* the floating-origin rebase, so a system
  must not call `core.place` here.
- **`lateUpdate` at 4099**: after the rebase (3884), after the camera is final (4013), after `env.update` (4094 — the
  environment overwrites exposure, fog and light uniforms every frame, so a tunnel or an interior can only adjust them
  afterwards, as the garage does at 4098), before `ui.update` (4099) and before `updateAudio` (4101) so HUD writes and
  `loopFor` requests land in the same frame.
- **Load after `populate()`**: vehicles and loose things exist, so a slice can resolve references by `build.uid`.
- **Install before `populate()`** (475): systems are registered while nothing has been stepped; `init` runs after
  `populate()` and can enumerate `ctx.vehicles`; from then on `vehicle:added` / `vehicle:removed` keep it current.

### 7.4 Order to do it safely

Each step must leave `npm run check`, `npm test` and the listed scripts green. Steps 1–5 are this map's; 6–8 are the
sibling maps' and are placed here only to show where they fit.

0. **Baseline.** Record the results of all 35 `modcar_*.mjs` and the ten `modcar_*` sets at the starting commit (they
   are the only regression net for this file). Optionally add public read-only accessors for the private names in 3.8
   and move the scripts onto them, so later extractions cannot break them silently.
1. **Kernel files + the Node test.** Pure additions.
2. **A1–A3, A7, A8** (types, fields, accessors). No call sites change. Gate: `npm run check`.
3. **A4, A5, A14–A17, D** (lifecycle hooks with an empty registry; `rt.systems/sys/emit`; the `ready` rejection
   handler). Gate: `modcar_journey`, `modcar_stress`, `modcar_perf` (frame time unchanged), all sets (draw calls unchanged).
4. **A9, A10 + C** (slices). With no slice registered the `slices` key is absent and saves are byte-identical. Gate:
   `modcar_save`, `modcar_restart`, `modcar_seamless`, `modcar_stow`, `modcar_vitals`, `modcar_axles`.
5. **A11–A13, A18–A21, A24, A28, A29** (events). No listeners yet. Gate: `modcar_wrecks`, `modcar_places`,
   `modcar_workshop`, `modcar_proving`.
6. **A6 with player-interaction.md S3** (interactables). Gate: `modcar_garage_devices`, `modcar_places`, `modcar_fuel`,
   `modcar_workshop`, `modcar_journey` (the objective marker).
7. **A25–A27, A30–A32 with player-interaction.md S2, S4, S7** (buttons, held behaviours, UI modes, view layers) — the
   riskiest edit, in the densest code. Gate: `modcar_hud`, `modcar_fuel`, `modcar_paint`, `modcar_grime`, `modcar_stow`,
   `modcar_cargo`, `modcar_stress`, `modcar_journey`, `modcar_pad` (+ `modcar_pad.test.ts`), `modcar_dev`, `modcar_vitals`.
8. **A22, A23 with items-economy.md S5** (shelters, buffs, worn warmth). Gate: `modcar_vitals` (+ `modcar_vitals.test.ts`),
   `modcar_wipers`, `modcar_devworld`.
9. **E** (dev tabs, dials). Gate: `modcar_dev`, `modcar_devworld`, `modcar_lab`, `modcar_restart`.
10. **F** (`modcar_kernel.mjs` with the probe module) — from here the fan-out can start.
11. *Later, optional:* move existing subsystems behind the same interface one at a time (wrecks; places + site art +
    doors; proving; grime + paint; body; audio front end). This shrinks `ModGame` but nothing in V3 depends on it.
    A33 (the hitch) and save format v2 are separate, larger changes.

### 7.5 Names to settle across the three maps

| Topic | This map | player-interaction.md | items-economy.md | Suggestion |
|---|---|---|---|---|
| Event names | `domain:verb` (`item:taken`, `vehicle:changed`, `player:entered`) | bare verbs (`picked`, `put`, `fitted`, `removed`, `consumed`, `drank`, `wore`, `panel`, `used`, `poured`, `entered`, `left`) | follows this map (`stock:changed`, `craft:made`, `loot:taken`, `knowledge:learned`, `body:buff`) | `domain:verb`; the S5 emit points map onto `item:taken`/`item:put`, `vehicle:changed` (`what` = `on:…`/`off:…`), `body:ate`/`body:drank`/`body:wore`, `vehicle:panel`, `device:used`, `liquid:poured`, `player:entered`/`player:left` |
| Module entry | `install(ctx: GameContext)` (adopted) | `install(game)` | one import line in a barrel | `install(ctx: GameContext)`: the argument is the interface, not the class |
| UI focus | `ctx.modes` (adopted) | `game.modes` (`UiMode`) | — | as player-interaction.md S4 |
| Interactables | `ctx.interact` (adopted) | `InteractSet` / `Interactable extends GarageDevice` | a stash device | as player-interaction.md S3 |
| Item behaviour field | — | `ItemDef.held?: string` | same | as player-interaction.md S1 |
| Damage | `ctx.hurt(hp, why)` | — | `damage(v, hp, why)` in `vitals.ts` | `ctx.hurt` calls `damage(ctx.body, …)` |


---

## 8. Performance notes

Nothing here was measured on a GPU. `SHOTS_GPU=1` selects `--use-angle=d3d11` (lib.mjs 23–29), which is Windows-only;
on this Linux host only the SwiftShader path runs, so `modcar_perf.mjs` would report software-rendering times.

Per-frame work that scales with content (inferred from the code):
- **`stepGrime`** (2956–2986) walks every vehicle's `grimeParts()` (cached in `CarView`, carView.ts 897) **and every
  loose thing's `loose.grimeParts(l)`, which is not cached**: it traverses the object's meshes and allocates arrays on
  each call (loose.ts 560–585) — every frame, for every part lying about, before checking whether a mask exists.
- **`player.pick()`** (563–735) every frame on foot: for each vehicle within reach, a ray/box test per fitted mount
  (empty-handed: `boundsEach`, 672–685; with a part in the hands: every candidate mount's aim point, 578–605), filler
  tests, the body box; then every device and tank. It reads `host.devices`, which allocates.
- **`devices` / `tanks` getters** (656–667) build new arrays on each call whenever places or doors contribute;
  `allWorkshops()` (645) allocates and is called five times a frame (3518, 4027, and through `benchWs` at 3558, 4002, 4261).
- **`tutorialSteps()`** (3416) allocates ~14 objects and is called three times a frame in the yard (`updateHudBits`
  4257, `objective` 4270, the chalkboard through `ctx.checklist()` at garage.ts 480), plus twice per `telemetry()`.
- **`garage.update` is not gated by distance** (3616). In the seamless world the garage exists for the whole session,
  so its doors, charger, `keepIn(v)` for every vehicle (wrecks included), machines, chalkboard (`tutorialSteps()` again),
  room lighting uniforms and swallows are updated every frame however far down the road one is.
- **`updateSplashes`** (4116–4127) builds an array of objects with a getter per vehicle every frame, rain or not; the
  getter runs `encodeBuild` (a sort and a join) for vehicles within 18 m while it rains (splash.ts 266).
- **`places.update`** does `loose.list.includes(l)` for every place-owned thing every frame (places.ts 231–239).
- **Per-vehicle `.find` over mounts every frame**: `updateEngineVoice` (3374–3375), `updateRadio` (3338), `engineFelt`
  (3691), `cushionOf` (3750), `updateBeam` (4189, 4205), `stiffnessOf` (3739); `worldLoops` filters
  `Object.values(build.parts)` (2610). `modEnv(v)` allocates per vehicle (3474); the chase camera allocates a
  `Vector3` (3922); `stepGlints` copies `wr.live.values()` (2556).
- **World streaming** is on the main thread with a 3.5 ms budget per frame (4063), 45 ms after a teleport, 40 ms per
  turn while loading. There is no Worker anywhere in `src/`.
- **`modcarWorld`** constructs `World` twice (seamless.ts 34–36).
- **Vehicles**: each awake vehicle runs its fixed-step sim (≤ 10 substeps a frame) and `ModSystems.update`; unattended
  ones sleep after settling unless lights or radio are on (vehicle.ts 119). Live wrecks are full `ModVehicle`s.
- **GPU side-work inside `step`**: `grime.measure` (render-to-texture read-backs while scrubbing), cloud strips in
  `env.update`, `Splashes.measure`, `CargoBay.grid` — all run in the harness's `simulate()` too.
- **Three WebGL contexts** can exist: the game's and two `PartThumbs`.
- Quality (`low/med/high`) and the pixel ratio are fixed when `RenderCore` is constructed (core.ts 59–67). Dynamic
  resolution and tier switching need a `RenderCore`/`Frame` API; the place that knows the frame time is `entry.ts`'s
  loop (766) and `frame(dt)` (4525).

The registry's per-system timing (7.1) gives V3 its per-system budget numbers at no extra cost: the `ms` it records
can be shown in a dev tab and asserted by a harness script.

---

## 9. Open questions

1. **One-frame misplacement on a rebase.** `siteArt.update` (3551), `doors.update` (3552), the roadside workshops'
   roots (3517), `sparks.update` (3813) and `dust.update` (3678) place things before `maybeRebase` (3884) and have no
   `onRebase` listener. By the order of calls they should be drawn offset by the rebase delta (a multiple of 256 m) for
   one frame each time the origin moves. Not observed in a browser.
2. **`void forgetMasks()` followed by `location.replace`** (1659–1667): is the IndexedDB clear guaranteed to commit
   before the page goes? Not tested.
3. Is leaving `beacons.update()` out of ModGame deliberate (R16)?
4. Should `packIn` and `Cockpit.press` report the panels they open (R16)? Packing a thing into a wreck's shut boot
   with G opens it without the first-look reveal today.
5. Tool uids are not reserved after a load (R3). Does a duplicate cause anything visible today (`shookAt`, card cache keys)?
6. Is the non-seamless path (`?garage=stub`, `leaveGarage`, `exitGarage`) still wanted? Dropping it removes the only
   case where the world is made after construction, and `world` could become non-null for every system.
7. Do the committed metrics in `loop/metrics/render_modcar_*.json` (2026-11-16) still hold at HEAD? They predate
   places, wrecks and the proving ground; the sets were not re-run for this map.
8. Field-initialiser order relative to constructor parameter properties under Vite 8's transform (`target: ES2022`, so
   `useDefineForClassFields` defaults to true) was not checked; `cockpit = new Cockpit(this)` (257) only stores `this`,
   so nothing depends on it today.
9. Where should persistent world time live (R12): a `worldSeconds` kept in a core slice beside the session-relative
   `time`, with the weather schedule and `uTime` left as they are?
10. Real GPU frame time for the garage and the road at HEAD is unknown to this map.
11. The three maps written so far use different names for some of the same seams (7.5); one set has to be fixed
    before the fan-out. `import.meta.glob` for the module list and declaration merging on `GameEvents` under
    `isolatedModules` are expected to work with TypeScript 7 and Vite 8 but were not compiled here.
12. How draw calls and triangles are attributed to a system for its declared budget: by traversing the roots it owns
    (as `Garage.cost()` does) is the only way visible in the code; `renderer.info` is global.
