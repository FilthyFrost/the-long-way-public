# Map: items, materials, crafting, loot, vitals, saving

Branch `feat/v3`, commit `e50503c`. Read in full: `src/core/modcar/{items,crafting,workshop,loot,wrecks,cargo,vitals,tools,types,blurbs,paint,palette}.ts`, `src/game/modcar/{loose,cargo,cargoList,places,wrecks,workshop,craftUi,save,restore,thumbs,assets}.ts`, the five tests named in the brief; read in part (the item paths only): `player.ts`, `ModGame.ts`, `itemInfo.ts`, `devPanel.ts`, `held.ts`, `vitalsHud.ts`, `materials.ts`, `garageStub.ts`, `grimeStore.ts`, `entry.ts`, `src/core/items/loot.ts`, `src/core/world/sites.ts` (types). Baseline: the five test files pass (38 tests, run one file at a time with `npx vitest run`). Numbers marked *measured* were printed by a read-only `tsx -e` script over the core modules; nothing here was measured in a browser or on a GPU.

## 1. Summary

- Everything one can carry is one of three things: a **part** (`PartInstance`, the vehicle's), a **tool** (`Tool`, 7 kinds, works on a vehicle) or an **item** (`ItemInstance`, everything else). The union is `Held` (`src/game/modcar/player.ts:43`). Every thing is a *unique instance with a uid*; there are **no stacks and no container items** anywhere in ModCar.
- Items are pure data in one file: `src/core/modcar/items.ts`, 106 kinds in 9 categories on 82 models (*measured*: food 10, drink 6, med 9, wear 18, pack 3, lamp 2, gear 7, junk 44, crate 7; all 82 GLBs exist under `public/models/modcar/items/`). What an item *does* is a closed set of optional fields on `ItemDef` (`eat`, `drink`, `heal`, `revive`, `wear`, `pack`, `lamp`, `gear`). Only `eat`, `drink`, `heal`, `revive` and `pack` have gameplay; **`wear`, `lamp` and `gear` are card text only** (no equip, no hammer, no repair kit, no flare; `warmth: 9` is a constant at `ModGame.ts:1203`).
- Materials are three global counters (`scrap`, `organics`, `chemicals`) in one shared `Stock` object (`ModGame.stock`, `ModGame.ts:267`), not things one carries. The recycler turns any thing into them over 2.4 s; the bench turns them back into a thing after 1 to 3 hammer blows. 64 recipes (*measured*: tools 10, paint 27, vehicle 13, clothing 8, supplies 6), **one open** (`scraper_1`); nothing in the game ever unlocks another (`Workshop.unlocked` is only read and saved).
- Loot is a pure function of a seed: 14 container kinds with weighted tables (`loot.ts`), wrecks as whole rolled vehicles with a few things in the boot (`wrecks.ts`). Quality is graded by distance down the road through one function, `findOdds(s)`, which saturates at 100 km.
- The body is `Vitals` (6 gauges, 8 hard-coded timed effects, a list of "gains" paid out over 5 s). Effects are a closed union with their behaviour written inline in `stepVitals`; the function that adds one is private.
- The save is one JSON blob `SaveV1` in `localStorage['modcar.save.v1']`, written every 30 s and on page hide, plus up to 6 full copies as restore points. Validation only checks that part, frame and item ids still exist; one unknown id sets the whole save aside. IndexedDB is already used for one thing: grime masks (`grimeStore.ts`).
- Thumbnails are drawn on a second small WebGL canvas (176 x 132, toon materials by material name), one per frame, cached as PNG data URLs for the session. A model that is missing is replaced by a stand-in: a two-tone box sized by carry class for items, a primitive per kind for tools, a rough shape per category for parts.

## 2. Key files

| Path | Lines | Role | Public API |
|---|---|---|---|
| `src/core/modcar/items.ts` | 328 | Item catalogue and instance helpers | `Material` :15, `MATERIALS` :17, `MATERIAL_IDS` :23, `ItemCat` :25, `ITEM_CATS` :27, `DrinkLiquid` :40, `EffectId` :43, `WearSlot` :46, `ItemDef` :48, `ItemInstance` :84, `ITEMS` :257, `itemDef` :261, `hasItem` :267, `itemsOf` :271 (unused), `reserveItemUids` :278, `newItem` :286, `salvageOf` :299, `itemMass` :308, `itemName` :313, `itemPaint` :320, `itemModels` :326 (unused) |
| `src/core/modcar/crafting.ts` | 237 | Stock arithmetic, salvage tables, recipes | `Stock` :19, `Cost` :21, `newStock` :23, `costTotal` :27, `shortOf` :32, `canAfford` :40, `spend` :45, `addTo` :51, `hits` :56, `partStars` :111, `partSalvage` :116, `toolSalvage` :137, `itemSalvage` :144, `RecipeCat` :150, `RECIPE_CATS` :152, `Makes` :161, `Recipe` :166, `RECIPES` :180, `recipeDef` :228, `recipeOpen` :235 |
| `src/core/modcar/workshop.ts` | 200 | Generator, recycler and hammer rules | `GeneratorSpec/State`, `GARAGE_GENERATOR` :31, `ROADSIDE_GENERATOR` :33, `newGenerator` :44, `generatorFuel` :49, `pullCord` :60, `stopGenerator` :77, `stepGenerator` :83, `generatorLeft` :105, `RECYCLE` :112, `Ingest` :127, `newIngest` :135, `stepIngests` :140, `flushIngests` :163, `ingestPose` :176, `CRAFT` :190, `BLOW_S` :200 |
| `src/core/modcar/loot.ts` | 322 | Container tables, things in plain sight, pump fuel | `Found` :26, `LOOT_TABLES` :57, `foundPart` :165, `foundTool` :194, `rollContainer` :221, `looseFound` :257, `stationFuel` :283, `CONTAINER_NAMES` :289, `CONTAINER_MATERIAL` :307 |
| `src/core/modcar/wrecks.ts` | 428 | Wreck rolls and the distance grading | `findOdds` :84, `foundWeight` :113, `tyreWeight` :131, `WreckRoll` :185, `wreckFrame` :204, `rollWreck` :253, `gradesOn` :415, `isRare` :426 |
| `src/core/modcar/cargo.ts` | 313 | Cargo zones per frame, box packing on a height grid | `ZoneId` :13, `Carry` :14, `CargoZone` :16, `CARGO_ZONES` :38, `zonesOf` :91, `zoneOf` :95, `zoneTakes` :102, `ThingBox` :107, `Placed` :117, `Lie` :126, `lieBox` :129, `HeightGrid` :139, `Spot` :149, `footprint` :161, `gridAt` :207, `restAt` :219, `findSpot` :254, `CargoMass` :308 |
| `src/core/modcar/vitals.ts` | 308 | The body | `VitalsRules` :17, `VITALS` :45, `VitalEffect` :73, `EFFECT_ZH` :75, `Vitals` :89, `newVitals` :110, `VitalsInput` :115, `VitalsEvents` :132, `has` :145, `stepVitals` :150, `eat` :257, `medicate` :263, `drink` :275, `revive` :286, `speedFactor` :297, `canSprint` :306 |
| `src/core/modcar/tools.ts` | 340 | The 7 tools, liquids, cleaners, tanks | `ToolKind` :16, `LiquidKind` :19, `liquidOf` :22, `Tool` :26, `SCRAPERS` :46, `toolModelId` :53, `TOOL_INFO` :58, `Cleaner` :76, `CLEANERS` :87, `cleanerOf` :96, `wearCleaner` :104, `newTool` :118, `toolName` :126, `FuelTank` :138, `tankLitres` :143, `pourTank` :148, `siphonTank` :159, `tankUse` :175, `toolUse` :197, `pour` :231, `tankRoomOf` :271, `pumpInto` :278, `siphonUse` :292, `siphon` :313 |
| `src/core/modcar/types.ts` | 547 | Vocabulary | `Category` :12 (29 members), `CATEGORIES` :43, `SUB_CATEGORIES` :76, `PANEL_CATEGORIES` :79, `FuelType` :81, `FrameKind` :82, `Text` :90, `PartDef` :319, `MountDef` :364, `FrameDef` :410, `Fluids` :479, `PaintMix` :491, `PartInstance` :497, `Build` :523 (`cargo?` :546) |
| `src/core/modcar/blurbs.ts` | 199 | Grades and card lines | `PART_BLURB` :15, `TOOL_BLURB` :151, `SPRAY_BLURB` :162, `SCRAPER_BLURB` :169, `FRAME_BLURB` :175, `DEVICE_BLURB` :190 |
| `src/core/modcar/paint.ts` | 187 | Spray cans and coats | `SPRAY_TIERS` :38, `PAINTED_CATS` :48, `takesPaint` :54, `sprayColours` :60, `sprayTier` :65, `sprayLeft` :70, `sprayFound` :75, `spraySalvage` :81, `mixHex` :89, `paintNow` :106, `coatOf` :113, `sprayStep` :137, `keepPartColours` :168, `paintTargets` :180 |
| `src/core/modcar/palette.ts` | 68 | 27 paints | `PALETTE` :14, `BASIC_PAINTS` :48, `PAINT_YELLOW` :49, `FACTORY_PAINT` :52, `paintHex` :66 |
| `src/game/modcar/loose.ts` | 652 | Things lying about or riding in a vehicle; stand-ins; the merge | `Loose` :35, `Carrier` :68, `Riding` :76, `toolModel` :96, `itemStandIn` :124, `toolLook` :138, `paintBaseOf` :161, `partLook` :168, `LooseThings` :185 (`addPart` :223, `addItem` :274, `addTool` :294, `objectFor` :319, `remove` :430, `drop` :440, `ride` :463, `ridersOf` :480, `follow` :488, `update` :512, `pick` :633, `settled` :270, `carriers` :210) |
| `src/game/modcar/cargo.ts` | 463 | Zone floors (GPU height read-back), aiming, stowing, load mass | `carryOf` :50, `massOf` :57, `StowAim` :78, `CargoBay` :86 (`grid` :123, `placedIn` :221, `ridersOf` :248, `weigh` :253, `loadOf` :270, `boxOf` :277, `aim` :297, `packSpot` :347, `stow` :361, `showGhost` :386, `invalidate` :114) |
| `src/game/modcar/cargoList.ts` | 83 | The Tab list (vehicle, container or self) | `CargoRow` :26, `CargoList.show` :53 |
| `src/game/modcar/places.ts` | 615 | Containers, pumps, things in plain sight, roadside workshops | `SavedThing` :61, `PlacesSave` :63, `heldOfFound` :78, `savedOf` :84, `heldOfSaved` :88, `PlaceContainer` :93, `PlacesHost` :117, `Places` :175 (`update` :225, `open` :404, `take` :423, `putBack` :432 (unused), `snapshot` :568, `owns` :220) |
| `src/game/modcar/wrecks.ts` | 416 | Wrecks as live vehicles, kept or claimed; glints | `WRECK_NEAR` 230, `WRECK_FAR` 420, `SavedWreck` :34, `WrecksSave` :43, `wreckSpots` :61, `WithoutWrecks` :76, `WreckHost` :89, `Wrecks` :129, `glintsOf` :317, `WreckGlints` :333 |
| `src/game/modcar/workshop.ts` | 1327 | Generator, recycler and bench in the scene | `WorkshopPlan` :42, `WORKSHOP_PLAN` :52, `WorkshopHost` :85, `WorkshopSave` :118, `heldOfMakes` :298, `salvageOfHeld` :307, `Workshop` :324 (`unlocked` :328, `recycle` :756, `openBench` :934, `key` :1034, `update` :1173, `snapshot` :1265, `devices` :325, `tanks` :326) |
| `src/game/modcar/craftUi.ts` | 250 | The bench's recipe list | `CraftRow` :12, `CraftHost` :21, `materialIcon` :73, `CraftUi` :87 |
| `src/game/modcar/save.ts` | 159 | `SaveV1`, validation, localStorage | `SavedVehicle` :21, `SavedLoose` :30, `SaveV1` :46, `loadSave` :106, `writeSave` :145, `clearSave` :153 |
| `src/game/modcar/restore.ts` | 66 | Six restore points | `RestorePoint` :11, `restorePoints` :19, `pushRestore` :30, `useRestore` :44, `clearRestores` :51, `agoText` :60 |
| `src/game/modcar/thumbs.ts` | 198 | Thumbnail renderer | `PartThumbs.request` :84, `.pump` :99 |
| `src/game/modcar/assets.ts` | 668 | GLB loading, rigid merge, stand-ins | `Model` :16, `loadStats` :29, `frameModel` :196, `partModel` :210, `seatTyres` :235, `cloneModel` :261, `addonModel` :275, `itemGlb` :290, `placeGlb` :303, `machineGlb` :312, `toolGlb` :327, `stretchFit` :344, `panelPaint` :428, `preload` :522, `standInPart` :555, `standInFrame` :652 |

Outside the brief's list but on every item path: `src/game/modcar/player.ts` (1632 lines: `Held`, hotbar, use of items, `heldKeys`, `slotViews`), `src/game/modcar/ModGame.ts` (4633 lines: `stock`, `body`, `consume`, `snapshot`, `iconOf`, dev spawn), `src/game/modcar/itemInfo.ts` (624: `itemCard`, `toolCard`, `salvageText`), `src/game/modcar/held.ts` (481: the first-person held model), `src/game/modcar/devPanel.ts` (586: the item bin), `src/game/modcar/vitalsHud.ts` (283), `src/core/items/loot.ts` (163, **legacy**, but it owns `ContainerKind`).

## 3. The item model

### 3.1 `ItemDef` (`items.ts:48-81`)

`id`, `cat: ItemCat`, `name: Text` (`{zh, en}`), `stars` 0-5, `blurb` (Chinese only), `mass` kg, `carry: 'small' | 'medium' | 'large'`, `salvage: Partial<Record<Material, number>>`, `model` (file stem, default the id), `paint`, `paint2` (sRGB hex), then the optional use fields:

| Field | Shape | Gameplay today |
|---|---|---|
| `eat` | `{food, hp, sec, effect?}`, `effect` one of `warm1`, `warm2`, `sick1`, `sick2` (`EffectId`) | yes: press F/RMB, `sec` seconds (3.9 food, 2.2 pill), then `ModGame.consume` :1237 |
| `drink` | `{litres, liquid, rate}`, `liquid` one of `water`, `alcohol`, `energy` | yes: hold F/RMB, `rate` L/s after 0.5 s, `ModGame.drank` :1247 |
| `heal` | `{hp, warm?, side?}` | yes, via `consume` -> `medicate` |
| `revive` | `{hp}` | yes: used automatically from a hotbar slot on death (`ModGame.stepDeath` :1265) |
| `pack` | `{slots}` | yes: hold F, `ModPlayer.wearPack` :314, hotbar grows to 2 + slots (max 6, keys Digit1-6 at `ModGame.ts:2269`) |
| `wear` | `{slot: WearSlot, warmth}` | **none** (card row only, `itemInfo.ts:510`) |
| `lamp` | `{range}` | **none** (card row only) |
| `gear` | `{kind, uses?, points?, rate?}`, `kind` one of `hammer`, `repair`, `flare` | **none** (card bar only) |

Catalogue entries are made by the private `I(id, cat, zh, en, stars, mass, salvage, blurb, opts)` at :114, pushed into `ALL`; `BY_ID` is built once at :259. Default carry: `mass >= 12` large, `>= 3` medium, else small (:115; nine items override it: the three hammers, `junk_sunchair`, `junk_hanger`, `junk_mop`, `junk_rod`, `junk_trolley`, `crate_parts_heavy`). Default paints `0xd8c29a` / `0xf4efe2`.

### 3.2 `ItemInstance` (`items.ts:84-95`)

`{ uid, item, litres?, uses?, tint?, opened? }`. `newItem(id, o)` :286 fills `litres` from `drink.litres` and `uses` from `gear.uses ?? gear.points`. There is no count, no contents, no freshness, no quality, no free state bag. An instance is saved verbatim (plain JSON) wherever it is held, so **any new optional JSON field on `ItemInstance` persists without touching the save code**.

Where instances live: `ModPlayer.slots` (:222) and `.pack` (:224); `LooseThings.list[].item`; `Wrecks.kept[id].loose[]`; `Places.left[id][]` and `PlaceContainer.contents`.

### 3.3 Uids

| Thing | Format | Counter | Reserved after load |
|---|---|---|---|
| item | `i<base36>` | `items.ts:275` | yes, `reserveItemUids` (`save.ts:131`: loose, kept wrecks' riders, `places.left`, hands, pack) |
| part, build | `p<base36>`, `b<base36>` | one shared counter, `build.ts:16` | yes, `reserveUids` (`save.ts:128`) |
| tool | `t<base36>` | `tools.ts:117` | **no** (a reload restarts at `t1`; today tool uids only key cards, so it is cosmetic) |
| loose | `l<base36>` | `loose.ts:156` | session only, never saved |

Part uids are also the IndexedDB keys of grime masks. Item uids key cards (`itemInfo.ts:478`) and the held model (`held.ts:136`).

### 3.4 Carry classes

`'small' | 'medium' | 'large'` on `ItemDef.carry` and `PartDef.carry`; tools are hard-coded (`jerrycan` medium, the rest small: game `cargo.ts:53`). Effects: walker load (`player.ts:484-485` sets `FootWalker.load`; only `'large'` changes walking: carry speed, no running, no jumping, `src/core/onfoot/walker.ts:184, 278, 371`; `'medium'` is passed but not read there), the held model's pose (`held.ts:155, 189`: large = both arms), cargo zone limit (`CargoZone.max`, `zoneTakes` core `cargo.ts:102`), the stand-in box size, and loot (`carry === 'large'` is never rolled into a container or a wreck: `loot.ts:136`, core `wrecks.ts:400`).

### 3.5 Model and paint conventions

- Files: `public/models/modcar/items/<model>.glb` (`itemGlb`, `assets.ts:290`), tools `tools/<id>.glb` (`toolModelId`, `tools.ts:53`), parts `parts/<id>.glb`, machines `machines/<id>.glb`, places `places/<name>.glb`. Written by Blender scripts (`tools/blender/items/{consumables,wear,junk}.py`): root mesh `PART`, origin at the bottom centre, x forward, lying the way it rests on a shelf, AO baked in vertex colours, no textures, no text.
- Materials are **by name only**. The 22 conventional names are `CAR_MATERIAL_NAMES` (`src/game/render/carMaterials.ts:41`): `paint`, `paint_b`, `trim`, `chrome`, `steel`, `alu`, `rubber`, `glass`, `glass_dark`, `lens_head`, `lens_tail`, `lens_amber`, `fabric`, `leather`, `wood`, `plastic_int`, `gauge`, `ceramic`, `rust`, `emit`, `cap_oil`, `cap_water`. An unknown name is shaded as `plastic_int` (`materials.ts:181`).
- `paint` takes the item's `paint`, `paint_b` its `paint2`; one model serves every colour variant (`med_pain_1..3` share `med_pain`). `itemPaint(inst)` :320 lets `inst.tint` override `paint`.
- On load every GLB goes through `rgbColours`, `maskUvs`, `mergeRigid` (`assets.ts:57-157`): meshes are merged per material name inside each rigid group; nodes named by the `RIGID` regex (:102) or with `userData.move` stay separate.
- Every loose thing gets its own `CarLook` (`mats.look('l:<uid>', ...)`), i.e. its own shader material instances.

## 4. Lifecycle and data flow

**Boot** (`entry.ts:31-57`): `loadSave()` runs synchronously before the game exists (`check`, uid reservation, `fitAxles`), the save's seed, place and hour become launch params, then `new ModGame(canvas, params, save, tune)`. `ModGame.populate` (:991): `Object.assign(this.stock, restore.stock)` (:998), `makeWorkshop()` with `restore.workshop` (:670), `restoreGarage` (:1461: vehicles, `restoreLoose` :1155, checklist, walker, `restoreHands` :1483 which also restores `body` as `{...newVitals(), ...s.body}` and the pack), wait for models, `restoreGrime`. `Wrecks` and `Places` are created lazily in `step` with `restore.wrecks` / `restore.places` (:3537, :3541).

**Frame** (`ModGame.step`, :3490): autosave timer (30 s) -> `stepBody` (:1191: `stepVitals`, HUD, restore point every 300 s) -> every workshop's `update` -> `wrecks.update` and `places.update` (:3539, :3542) -> `player.update` (`player.ts:470`: pick the target, then `act`, `player.ts:873`: pick up, stow, device, eat/drink, fit, pour, spray) -> vehicles -> `loose.update` (:3612) -> garage -> `updateViews` (held model, `icons.pump()` :4033) -> `loose.follow` (:3619). `simulate(seconds)` (:4535) is the same step at 60 Hz without drawing.

**A thing's journey**: world data (`Site.containers`, `Site.loose`, a wreck's seed) -> `rollContainer` / `looseFound` / `rollWreck` -> `Found` (`{item: id} | {tool} | {part}`) -> `heldOfFound` (`places.ts:78`, the item instance is created here) -> the hands (`Held`) -> put down (`LooseThings.addItem`, falls to `surfaceAt` or onto a `Carrier`) or stowed in a zone (`CargoBay.stow`, rides with the vehicle, weighs on `Build.cargo`) -> eaten / drunk / worn as a pack, or recycled (`Workshop.recycle` -> `Ingest` -> `Stock`). The bench goes the other way: `Recipe.cost` out of `Stock`, `heldOfMakes` -> a loose thing on the bench plate.

**Recycler** (`game/workshop.ts:756-900`, rules `core/workshop.ts:112-170`): any `Held` whose salvage text is not empty; needs power; each thing takes `RECYCLE.ingestS` 2.4 s (30 % glide, then ground), several at once; materials are credited as it is ground (`floor(yield * k)`), `host.stock[m] += n` at :832. Things put down into the hopper go in by themselves (:855-866).

**Salvage**: item = `ItemDef.salvage` + 1 organics per 0.5 L of `litres` (`salvageOf`, `items.ts:299`); part = `PART_SCRAP[cat][stars-1]` (`crafting.ts:78-108`) + its sub-parts + 1 organics per 0.5 L of fuel, oil and coolant (:116); tool = `TOOL_SALVAGE[kind]` (:126), scrapers 3/7/10, spray 1 or 5, + liquid (:137). A thing whose salvage is empty is refused by the recycler (`take`, :584-590).

**Bench** (`game/workshop.ts:921-1169`): `rows()` lists all `RECIPES`; `craft(id)` (:957) checks `recipeOpen(r, this.unlocked)` and `shortOf`, `spend`s the whole cost at once, shows `hits(cost)` bubbles (1 per 25 material, 1 to 3), each blow 0.62 s (`BLOW_S`), the thing appears `CRAFT.completion` 1.0 s after the last (`giveMade` :1158). A job under way is saved as a recipe id and simply given on load (:401).

**Unlocks**: `Recipe.open?: boolean` (data) or membership in `Workshop.unlocked: Set<string>` (:328). The set is **per workshop instance** (the starting garage and every roadside garage have their own, saved as `WorkshopSave.recipes` in `SaveV1.workshop` and `SaveV1.places.shops[siteId]`), and **nothing adds to it**. `Recipe.tier` is data only (no code reads it).

**Loot grading** (`findOdds`, core `wrecks.ts:84-88`): `k = clamp(s / 100000, 0, 1)`; `mean = lerp(0.2, 1.1, k)`; `grades = [lerp(0.7, 0.42), lerp(0.26, 0.5), lerp(0.04, 0.08)]` for stars 3, 4, 5. *Measured*: `s=0` -> mean 0.2, [0.70, 0.26, 0.04]; 50 km -> 0.65, [0.56, 0.38, 0.06]; 100 km and beyond -> 1.1, [0.42, 0.50, 0.08] (**flat after 100 km**).
- Wreck parts: `countOf(mean)` finds (Poisson, capped at 6), +2 on a "special" wreck (8 %); each find's grade is `3 + weighted(grades)` (:304-359).
- Container picks (`gradeRoll`, `loot.ts:128`): with probability `min(0.6, mean / 3)` the pick is a find of grade `3 + weighted(grades)`, else a plain grade `weighted([0.25, 0.45, 0.30])` (stars 0, 1, 2). So 6.7 % finds at the workshop, 36.7 % at 100 km.
- An item pick of a category (`itemOf`, :135) is **uniform among the category's items with `stars <= max(grade, lowest grade of the category)` and `carry !== 'large'`**: the grade is a cap, not a target. A `{one: [...]}` pick filters its list the same way. A part pick takes the exact grade, else the nearest (`foundPart` :165). Spray and scraper tiers come from the grade (`foundTool` :194).
- Wreck boot (core `wrecks.ts:390-410`): 0 to 3 things, category by a fixed weight list, grade cap `3 + weighted(grades)` with probability `mean / 3`, else 1 to 3.
- Seeds: container `Rng(hash2(seed, 0x10c7, 0x5a))`, loose `hash2(seed, 0x1005e, 0x77)`, wreck `hash2(seed, 0x5eed, 0x3c)`, pump `hash2(seed, 0xf0e1, 0x3)`.

**Places** (`places.ts`): a place comes when one is within 80 m of its reach and goes beyond 190 m, checked every 0.5 s. A container is searched by holding E 0.8 s; contents are rolled then (`open` :404), listed in the `CargoList`, taken one at a time (`take` :423 writes what is left into `left`). A searched container nothing was taken from is **rolled again** every time the place comes (:285). Things in plain sight are created every time the place comes and are "owned" by the place until moved 0.25 m or picked up (then their id goes into `taken`).

**Wrecks** (`game/wrecks.ts`): spawn within 230 m (one per 0.4 s check), despawn beyond 420 m; "touched" is decided by comparing a signature (`sigOf` :124: the build as JSON to two decimals + the riders' kinds) with the one taken on arrival; touched wrecks are kept whole in `kept`, claimed ones (entered, or moved 15 m) go to `gone`.

**Vitals** (`vitals.ts`): `Vitals` :89 = `{hp, stamina, food, water, temp, bladder, rest, effects: Partial<Record<VitalEffect, seconds>>, gains: {food, hp, water, temp, left}[], ticks: {starve, thirst, cold, sick, warm}, coldHold, dead}`. `stepVitals(v, input, rules)` :150 in order: stamina, drains, gains (each gain pays `dt / left` of what remains, so it is spent exactly when `left` reaches 0), bladder, `wet` from rain, temperature against `tempComfort - warmth` (skipped while `drunk`), `warm1/2` tick (+5 C every 60 s), `hypo` below 32 C with a 30 s linger, hurt ticks (starve 2 hp / 10 s, thirst 3 / 3 s, cold 1 / 5 s), `sick1/2` water loss, effects run down (all but `hypo`), death at `hp <= 0`. Timed effects are added only by the private `add(v, e, s = EFFECT_S[e])` :141 (`effects[e] = max(current, s)`: refresh, never stack), reached through `eat`, `medicate`, `drink` and the rain flag. Durations: drunk 30, energy 30, sick1 30, sick2 30, warm1 180, warm2 300, wet 60 (`EFFECT_S` :87). Readers of effects: `speedFactor` :297 (energy x1.5, hypo x0.75), the temperature step (`drunk`, `wet`), `ModGame.ts:3989` (drunk camera sway), the HUD.

**Save** (`ModGame.snapshot` :1511, `save.ts`): see section 5.

**Thumbnails**: `ModGame.iconOf(h)` :1817 makes a key (`part:<id>:<tyre>`, `item:<id>:<tint>`, `tool:<kind>:<fuel>:<colour>:<tier>`), converts the thing to a `DevItem`, and asks `PartThumbs.request(key, () => devModel(item), cb, paint, paint2)`. `pump()` draws at most one waiting picture per call (sequential on the model's promise); `draw` :148 clones the object, replaces every material by a `MeshToonMaterial` chosen by material name (`COLOURS` :9; `paint` / `paint_b` take the two colours passed in), adds a back-face outline, frames it from (0.78, 0.46, 0.62) with a 26 degree camera, renders and returns `toDataURL('image/png')`. Results are cached in `PartThumbs.urls` and `ModGame.iconUrl` for the session, never evicted. The developer panel owns a second `PartThumbs` (`devPanel.ts:186`), requested as tiles scroll into view.

**Stand-ins**: items `itemStandIn` (`loose.ts:124`): a `paint` box with a `paint_b` band, 0.14 x 0.12 x 0.10 m (small), 0.32 x 0.28 x 0.26 (medium), 0.5 x 0.6 x 0.5 (large); shown at once, swapped for the GLB when it arrives (`addItem` :274, `held.ts:149-166`, `objectFor` :348). Tools `toolModel` (:96, a primitive per kind). Parts `standInPart` (`assets.ts:555`, by category). Frames `standInFrame` (:652). Machines `standIn` (`game/workshop.ts:195`, a box with named markers). A missing GLB resolves to `null` and is cached, so each missing model costs one request.

## 5. The save format and its validation

`SaveV1` (`save.ts:46-81`), key `modcar.save.v1`:

| Field | Type | Written from |
|---|---|---|
| `v` | `1` | |
| `at` | ms | `Date.now()` |
| `place` | `'garage'` or `'road'` | |
| `hour` | hour of day only | `env.clock.hourAt(time)`; **no absolute game time or day count is saved**, and `ModGame.time` starts at 0 on every load (:384) |
| `done` | `string[]` | the checklist |
| `vehicles` | `{build, x, z, yaw, radioOn?, radioSong?}[]` | one's own vehicles (wrecks excluded) |
| `loose` | `SavedLoose[]`: one of `part?`, `tool?`, `item?`, then `x, y, z, yaw`, and for a rider `on?` (index into `vehicles`), `pos?`, `rot?`, `zone?`, `lie?` | every loose thing except wreck riders and place-owned things |
| `player` | `{x, z, heading}` | |
| `hands?` | an array of `{part}`, `{tool}`, `{item}` or `null` | the hotbar |
| `sel?`, `pack?` | number, `ItemInstance` | |
| `body?` | `Vitals` (whole object) | |
| `stock?` | `Stock` | restored with `Object.assign` (extra keys survive) |
| `workshop?` | `{gen, cap?, recipes?, job?}` | the starting workshop |
| `road?`, `world?`, `seat?` | `{s, seed}`, `{seed}`, index | |
| `wrecks?` | `{kept: Record<id, {build, x, z, yaw, loose}>, gone: string[]}` | |
| `places?` | `{searched[], left: Record<id, SavedThing[]>, pumps, taken[], shops?: Record<siteId, WorkshopSave>, doors?}` | |

Write: `writeSave` = `localStorage.setItem(KEY, JSON.stringify(s))`, failure swallowed ("the game goes on unsaved"). Called every 30 s (`ModGame.ts:3507`), on `visibilitychange` hidden and `pagehide` (:2299-2302); not while dead, in shot mode, or during a fade. Restore points: `pushRestore` every 300 s of play, the last 6 **complete** `SaveV1` copies under `modcar.restore.v1`; on quota failure it retries with fewer.

Validation (`loadSave` :106): `v === 1`, `vehicles` a non-empty array, `loose` an array; then `check` (:86) calls `frameDef` / `partDef` (recursing into `sub`) / `itemDef` and lets them throw. Any throw moves the raw text to `modcar.save.v1.unread`, removes the save and starts a new game.

Gaps in `check` (verified by reading, not by a failing run):
- items riding in **kept wrecks** are not checked (:95 looks at `l.part` only), so an unknown item id there passes load and throws later in `LooseThings.addItem` when the wreck spawns;
- **tools are never checked** (an unknown `kind` reaches `TOOL_INFO[kind]`);
- `workshop.job` and `places.shops[*].job` are not checked (`recipeDef` throws inside a promise at `game/workshop.ts:401`);
- no numeric validation at all (`stock`, `body`, positions);
- `body` is merged shallowly (`{...newVitals(), ...s.body}`): a new top-level field gets its default, but a new key inside `ticks` would be missing in an old save and turn into `NaN` on the first `+= dt`.

Side effect to know: `Workshop.snapshot()` (:1265) **finishes whatever is in the recycler at once** (`flushIngests` straight into the stock, no HUD line) and removes the models, on every autosave and restore point.

## 6. Exhaustive enumerations (what breaks when a member is added)

"C" = the compiler reports it (a `Record<Union, ...>` literal). "S" = silent: it compiles and does the wrong thing or leaves the new member out.

### 6.1 `ItemCat`

| Where | What | |
|---|---|---|
| `src/core/modcar/items.ts:25` | the union | |
| `items.ts:27-37` | `ITEM_CATS: Record<ItemCat, Text>` | C |
| `src/game/modcar/itemInfo.ts:464` | `ITEM_ICON: Record<ItemCat, CardIcon>` (and `CardIcon` :71 + `ICON_PATH: Record<CardIcon, string>` at `cards.ts:78` for a new picture) | C |
| `src/game/modcar/devPanel.ts:110` | `ITEM_ORDER: ItemCat[]`, the only list the item bin draws (:447) | S (a new category is not shown) |
| `src/core/modcar/wrecks.ts:394-395` | `cats` and the parallel weight array `w` for a wreck's boot | S |
| `src/core/modcar/loot.ts:59-82` | `{cat: ...}` picks in the tables | S (data) |
| `src/game/modcar/workshop.ts:315-316` | `grindOf`: food/drink/med -> organic, wear/pack -> cloth, else by model name or `salvage.scrap` | S |
| `player.ts:998`, `:1560`; `ModGame.ts:1244` | `cat === 'med'` -> pill animation and wording | S |
| `ModGame.ts:4302` | `cat === 'crate'` in the tutorial marker | S |
| `devPanel.ts:70-81` | `itemMeta` walks the use fields, falls back to salvage | S |
| tests | `modcar_loot.test.ts:45-50` category shares per container; `modcar_workshop.test.ts:54` | |

### 6.2 Held kinds (`'part' | 'tool' | 'item'`)

The union is `player.ts:43`. Its twins: `Loose {part, tool, item}` (`loose.ts:37-40`), `SavedLoose` (`save.ts:31-33`), `SavedThing` (`places.ts:61`), `SaveV1.hands` (`save.ts:59`), `Found` (`loot.ts:26`), `Makes` (`crafting.ts:161-164`), `DevItem` (`devPanel.ts:25-29`, plus `'vehicle'`). **Almost every dispatch is a two-step ternary whose last arm is the default, so a fourth kind would compile and fall into the tool arm (or the item arm) silently.** All S:

- `player.ts`: :47 `heldName`, :52 `heldOf`, :484-485 walker load, :1263 `putDown`, :1296 `cardOf`, :1543-1562 `heldKeys`, :1565 other slot's name, :1575-1580 `slotViews`, :1599 telemetry, :1625-1629 `partMass`; plus about 30 guards of the form `held?.kind === 'tool'` / `'part'` / `'item'` (:318, :385-411, :475, :574, :627-643, :806, :880, :977, :986, :1006, :1023, :1100, :1117, :1133, :1185, :1332, :1353-1449, :1481).
- game `cargo.ts`: :50-54 `carryOf`, :57-68 `massOf`, :71-75 `boxKey`, :374 `stow`.
- `loose.ts`: :223 / :274 / :294 three `add*` methods, :319-350 `objectFor`, :392 the merge's look, :411-413 `make`.
- `places.ts`: :78-82 `heldOfFound`, :84-86 `savedOf`, :88-90 `heldOfSaved`, :310 `come`.
- game `workshop.ts`: :298-304 `heldOfMakes`, :307-309 `salvageOfHeld`, :312-322 `grindOf`, :768 the ingest's look (uses `ItemDef.paint`, ignoring `tint`), :860 loose -> held, :928-932 `nameOf`, :1141 hammer sound, :1162-1164 `giveMade`.
- `held.ts`: :136 key, :149-209 `set`.
- `ModGame.ts`: :1157 `restoreLoose`, :1498 `restoreHands`, :1516-1519 and :1531 `snapshot`, :1755 `stowLoot`, :1770-1773 `ridersSaved`, :1788 `restoreRiders`, :1818 and :1825-1836 `iconOf`, :1843 `liquidColour`, :1904-1923 `devModel` (the last arm is **a vehicle frame**), :2013-2042 `devSpawn`, :2099 `devPreview`, :2537, :2690-2700 `sound`, :4273.
- `devPanel.ts`: :59-67 `devItemOf`; `entry.ts`: :27-29 `looseIs`, :256-258 `give`; `garageMachines.ts`: :177-229; game `wrecks.ts`: :126 `sigOf`.
- `save.ts`: :86-104 `check` and :115-131 uid reservation walk each holder by hand.

`ToolKind` (7 members, `tools.ts:16`) is as costly: `TOOL_INFO` :58 (C), `TOOL_BLURB` `blurbs.ts:151` (C), `TOOL_SALVAGE` `crafting.ts:126` (C), then S: `liquidOf` :22, `toolModelId` :53, `cleanerOf` :96, `newTool` :118, `toolName` :126, `toolUse` :197, `toolSalvage` `crafting.ts:138`, `foundTool` `loot.ts:194`, `toolModel` `loose.ts:96`, `toolLook` `loose.ts:138`, `toolMass` `itemInfo.ts:136`, `toolCard` `itemInfo.ts:414`, game `cargo.ts:53` and `:67`, the hand-written tool tiles `devPanel.ts:423-446`, `SPOUT` / `NOZZLE` `held.ts:31-42`.

### 6.3 `Material`

| Where | What | |
|---|---|---|
| `items.ts:15`, `:17-21`, `:23` | the union, `MATERIALS: Record<Material, ...>` (C), `MATERIAL_IDS` (S) | |
| `crafting.ts:24` | `newStock()` literal `{scrap: 0, organics: 0, chemicals: 0}` | C |
| `crafting.ts:28, 33, 47, 52, 62` | every `Stock` / `Cost` loop iterates `MATERIAL_IDS` | S (a key not in the list is ignored by `spend`, `shortOf`, `addTo`, `costTotal`) |
| core `workshop.ts:148, 166` | `stepIngests`, `flushIngests` iterate `MATERIAL_IDS` | S |
| `crafting.ts:69`, `items.ts:303` | liquid -> `organics` | S |
| `crafting.ts:78-108, 118, 126-134, 138`; `tools.ts:46-50` | part and tool salvage in `scrap` / `organics` | data |
| `craftUi.ts:73-78` | `materialIcon`: `scrap` cog, `organics` leaf, **anything else the flask** | S |
| `craftUi.ts:179, 196, 242` | cost rows and the header list every material | S (40 would overflow the header) |
| game `workshop.ts:254, 727, 746, 811, 969` | tally type, the two machine cards (one row per material), recycler credit, craft delta | S |
| `vitalsHud.ts:256-281` | `MaterialsHud.show` | S |
| `itemInfo.ts:469-473` | `salvageText` | S |
| `devPanel.ts:79` | `scrap` -> 废料, `organics` -> 有机, **else 化学** | S |
| `ModGame.ts:2004-2007`, `entry.ts:298-301` | dev stock and the test hook, by literal name | S |
| `ModGame.ts:3429`, `:4294-4301`; game `workshop.ts:318` | tutorial `stock.scrap >= 70`, its marker, grind sound by `salvage.scrap` | S |
| tests | `modcar_workshop.test.ts:67` `expect(s).toEqual({scrap: 10, organics: 5, chemicals: 0})` (breaks if `newStock` gains keys) | |

### 6.4 `RecipeCat`

| Where | What | |
|---|---|---|
| `crafting.ts:150`, `:152-158` | the union, `RECIPE_CATS: Record<RecipeCat, Text>` | C |
| `craftUi.ts:82-83` | `TABS` built from `Object.entries(RECIPE_CATS)` **at module load** | follows the data, but a category registered after import is missed |
| `craftUi.ts:159` | filter by tab | follows |
| game `workshop.ts:1141` | `clothing` / `supplies` -> the wooden hammer sound | S |
| tests | `modcar_paint.test.ts:139` (`cat === 'paint'`), `modcar_workshop.test.ts:48` (only `scraper_1` open) | |

### 6.5 `ContainerKind`

The type is owned by the **legacy** file `src/core/items/loot.ts:31-32` (`CONTAINER_KINDS`, 14 members).

| Where | What | |
|---|---|---|
| `src/core/items/loot.ts:34` | legacy `LOOT: Record<ContainerKind, LootTable>` (ids of the legacy catalogue) | C: a new kind needs a legacy table |
| `src/core/modcar/loot.ts:57`, `:289`, `:307` | `LOOT_TABLES`, `CONTAINER_NAMES`, `CONTAINER_MATERIAL` | C x3 |
| `src/game/modcar/places.ts:45` | `BLURB: Partial<Record<ContainerKind, string>>` | S |
| `places.ts:275` | `glovebox` and `boot` skipped (a wreck's own) | S |
| `src/core/world/sites.ts:775, 786` and about 50 call sites :860-1365 | which site lays out which kind, by literal | data |
| `src/core/items/containers.ts:13, 24` | legacy | |
| `foley.ts:227` | `ContainerMaterial` (5 sounds) | closed |
| tests | `modcar_loot.test.ts:19` iterates `Object.keys(LOOT_TABLES)` and requires a name for each | |

Also exhaustive and near this area: `VitalEffect` (`vitals.ts:73`; `EFFECT_ZH` :75 and `EFFECT_S` :87 are C; `GOOD` / `COLD` at `vitalsHud.ts:50-51` and the notes at `itemInfo.ts:494-495` are S); `VitalsEvents.why` (:135) and `ModGame.onDeath` :1252; `Category` (`PART_SCRAP` `crafting.ts:78` and `CAT_LABEL` `frames.ts:90` are C: a new part category such as a hitch needs a row in each); `ZoneId` (core `cargo.ts:13`); `WearSlot` (`items.ts:46`, `SLOT_ZH` `itemInfo.ts:465` C).

## 7. Extension points that exist today

| Name | Where | How |
|---|---|---|
| Add an item to an existing category | `items.ts:128-254` | one `I(...)` line; it is then lootable (by category), spawnable from the dev bin, recyclable, stowable, saved, has a card and a thumbnail. No model needed (stand-in box). |
| Colour variants | `ItemDef.model`, `paint`, `paint2`, `ItemInstance.tint` | share a GLB, change two colours |
| Extra instance state | `ItemInstance` | any optional JSON field is saved and restored as is |
| Add a recipe | `crafting.ts:180-224` | one `R(...)` line; `Makes` covers tools, parts (with a tyre) and items; tabs follow `RECIPE_CATS` |
| Unlock a recipe at runtime | `Workshop.unlocked` (`game/workshop.ts:328`, public) | `ws.unlocked.add(id)` works and is saved, but per workshop |
| The shared stash | `ModGame.stock` (public), `WorkshopHost.stock`, `stockChanged(delta)` | any module holding the object can `addTo` / `spend`; the popup is `ModGame.stockChanged` (private, reached through `WorkshopHost`) |
| Interactable devices | `GarageDevice` (`garageStub.ts:21`) | `use`, hold with `holdS` / `holding`, `take(held)` / `useWith(held)` (the recycler's pattern), own `card`, own `hit` box. But the list is assembled by hand in `ModGame.devices` :656 |
| Things to ride on | `Carrier` (`loose.ts:68`) + `LooseThings.carriers` (:210) | anything with `surfaceAt` and a `frame`; the save assumes a carrier is a vehicle (`as ModVehicle`, `ModGame.ts:1516-1518`) |
| Cargo zones for a frame | `CARGO_ZONES` (core `cargo.ts:38`) | a row per frame id; floors are measured from the model |
| Packing | `restAt`, `findSpot` (core `cargo.ts:219, 254`) | pure geometry on a `HeightGrid` + `Placed[]`; things stack on the flat top of what is there |
| The list UI | `CargoList.show(title, rows, sel, load, head, empty, take)` | generic rows; but its three sources (vehicle, container, self) are hard-wired in `ModGame.ts:1307-1458` |
| Cards | `ItemCard` (`itemInfo.ts:73`) | plain data (rows, bars, notes, a curve, columns); any system can build one |
| Vitals rules | `stepVitals(v, input, R)`, `eat`, `medicate`, `drink`, `revive` take a `VitalsRules` | the numbers can be swapped per call; the effects cannot |
| Loot hooks already laid | `tacklebox` and `gamebag` tables (`loot.ts:80-82`), site kinds `jetty` and `hide`, `looseFound` returning `null` for `bait.*`, `ammo.*`, `spice.*` (:278) | placeholders waiting for fishing and hunting content |
| Thumbnail of anything | `PartThumbs.request(key, load, done, paint?, paint2?)` | any `Object3D` loader |
| Legacy precedent | `registerItems` (`src/core/items/catalog.ts:221`), `Stack {id, n}` and `Inventory` (`src/core/items/inventory.ts`) | the classic game registers items from another module and models stacks; ModCar does neither |

## 8. Invariants and the tests that guard them

Guarded:
- Recycler amounts: an old engine 20 scrap, a V8 180, a wheel = rim + tyre, 4.5 L of oil = 9 organics; jerrycan 3, scrapers 3/7/10, `crate_parts` 20, a full 2 L water bottle 9 organics (`modcar_workshop.test.ts:15, 30`).
- Every recipe makes a thing that exists and costs more than 0; **only `scraper_1` is open**; `hits` 1 to 3 (`:39`). All 27 spray recipes are `paint`, 20 organics + 10 scrap, locked (`modcar_paint.test.ts:139`).
- `spend` is all or nothing; `shortOf` names the first short material; the stock after spending **equals exactly** `{scrap: 10, organics: 5, chemicals: 0}` (`:57`).
- Generator burn, rope (never more than three pulls), wrong fuel, jerrycan in and out (`:70, 85, 114`); recycler timing, incremental credit, nothing without power, `flushIngests` conserves the yield (`:126`).
- Loot is the same for the same `(kind, seed, s, siteKind)` (uids aside); no `large` item in a container; category shares: cupboard > 0.85 food/drink/junk, wardrobe > 0.6 wear, garage > 0.9 parts, toolbox > 0.85 tools/parts/crate/gear, counter > 0.6 food/drink, **medicine exactly 1.0 med**, glovebox always empty (`modcar_loot.test.ts:18, 33`); mean part grade at 100 km exceeds the one at 0 by more than 0.25, found parts have `cond >= 0.35`, rims carry a tyre (`:55`); `looseFound` mapping and `bait.*` -> null (`:73`); pump litres (`:88`).
- Vitals: sprint 6/s, back at 7.5/s after 2 s, jump 12 (`modcar_vitals.test.ts:24`); drains and hurt ticks (`:42`); cooling by warmth 0 against 37, hypothermia, linger, drunk feels no cold (`:55`); meal over 5 s, water +10 per 0.1 L and the bladder (`:83`); medicine and side effect by roll (`:99`); energy x1.5, peeing x0.2 floored at 0.35, bladder (`:111`); death and `revive` (`:123`).
- Cargo: **every frame in `FRAMES` has at least one zone** (`modcar_cargo.test.ts:36`); fit, edges, lid height, holes, stacking, packing 16 boxes in the saloon's boot, lying down, wheel arch, mass and CG (`:50-130`).
- Every part has a blurb with 1 to 5 stars and a card; **every frame has a `FRAME_BLURB`**; every tool a `TOOL_BLURB` (`modcar_items.test.ts:20-59`). Despite its name this file tests parts, tools and liquids, **not `items.ts`**.
- Wreck boot: nothing on a motorcycle, better things further on (`modcar_wrecks.test.ts:162`).
- `src/core/**` imports no `three`, no `/game/`, no DOM globals (`core-purity.test.ts`).
- Browser journeys exist and were **not run** for this map: `harness/shots/modcar_{save,vitals,workshop,places,wrecks,stow,cargo}.mjs`.

Not guarded by any test (found by search):
- the item catalogue itself: unique ids, `stars` in 0-5, `mass > 0`, salvage keys valid, every `model` has a GLB (true today, *measured*), every `{one: [...]}` and `JUNK` id exists (an unknown id in `JUNK` would only throw when rolled);
- every recipe's cost keys being real materials;
- `SaveV1` round trip and `check` (browser journey only);
- uid uniqueness after a reload;
- `itemOf` never returning `null` for a category used in a table.

Behavioural invariants to keep when extending:
- A roll consumes a fixed number of random draws per pick only while its candidate list is non-empty (`wrecks.ts:401` draws only `if (list.length)`); a new category that can be empty at low grades shifts the stream for the spray can and jerrycan rolled after it.
- Adding an item to an existing category changes which item existing seeds give (uniform pick over the filtered list), and therefore the contents of containers a saved game searched but took nothing from.
- `stepVitals` must stay a pure function of `(v, input, rules)`; `Vitals` must stay plain JSON.
- `Build.cargo` is derived from riders by `CargoBay.weigh`, never authored.

## 9. Risks for V3

1. **A fourth `Held` kind or an eighth `ToolKind` fails silently in about 60 places** (6.2). Weapons, rods, cookware, furniture, blueprints must be *items*.
2. **The use of an item is a closed set of fields read by hand in `player.act` (:981-1021), `heldKeys` (:1555-1562), `slotViews`, `held.ts` and `itemInfo.itemCard`.** Without a handler seam every system edits `player.ts` (1632 lines) and `ModGame.ts` (4633 lines): guaranteed merge conflicts between parallel engineers.
3. **No stacks, no contents.** Ammunition, bait, berries or 12 fillets as one `Loose` + one `CarLook` each will not scale (section 10), and the hotbar has at most 6 slots.
4. **Unlocks are per workshop** (`Workshop.unlocked`), so a blueprint learned at home is unknown at a roadside garage unless the set is shared; cooking stations in a caravan would be a third place.
5. **Materials**: `Stock` loops ignore keys outside `MATERIAL_IDS`, so a named material in a cost is silently free; putting 40 ids into `MATERIAL_IDS` instead breaks `modcar_workshop.test.ts:67` if `newStock` grows, and makes the bench header, both machine cards and the dev tile text list 43 entries. Recipes can only cost materials, never carried items (ingredients).
6. **Vitals**: effects are closed and inline; `add` is private; there is no exported way to hurt the body from outside (`hp` is only lowered inside `stepVitals`; an outside write works but reports `why: ''`); the HUD draws `hp / 100` and `stamina / 100` and `stepVitals` clamps food and water to a literal 100 (:171, :173), so a buff that raises a maximum has nowhere to show; `revive` wipes `effects` and `gains`; clothes are not wearable, so "clothing with warmth and camouflage" starts from zero (no equip state, no save field but `pack`).
7. **No absolute game time in the save** (`hour` only). Freshness, animal schedules, drying racks, respawns and cooldowns need one.
8. **Save size and blocking**: one synchronous `JSON.stringify` of everything every 30 s; a restore point re-parses and re-writes up to six full copies every 5 minutes. *Measured*: a stock build is 4.2 to 4.7 KB of JSON (2.2 KB for the motorcycle), a rolled wreck 4.2 KB on average plus riders; `Vitals` 190 B, an item 44 B. A hundred touched wrecks is about 0.45 MB per copy and about 3 MB with six restore points, close to a typical 5 MB localStorage quota (quota not measured), and `writeSave` fails silently when it is exceeded. V3 adds animals, harvested spots, furniture layouts, compendium and skills.
9. **Save fragility**: one unknown id anywhere sets the whole save aside; three holders are not checked at all (section 5). With content growing weekly, saves will be lost or will crash on a later spawn.
10. **`loadSave` is synchronous and precedes the game** (`entry.ts:39`); IndexedDB is asynchronous, and a write started in `pagehide` may not finish (browser behaviour, not tested here).
11. **`Workshop.snapshot` mutates** (finishes the recycler). A step-based cooking station written in the same style would lose its progress on every autosave.
12. **Loot grading is tied to raw road distance and is flat after 100 km**; world generation 2.0 with regions and a pacing director needs another input. Registering new entries into existing tables changes every existing roll and can break the share assertions in `modcar_loot.test.ts:45-50` (medicine must stay 100 % med).
13. **`ContainerKind` lives in the legacy core** and has four exhaustive records; a new kind for new site kinds forces an edit of `src/core/items/loot.ts`.
14. **A new frame (a caravan) must have** `CARGO_ZONES[frame]` (`modcar_cargo.test.ts:36`) and `FRAME_BLURB[frame]` (`modcar_items.test.ts:34`); a new part category must have `PART_SCRAP` and `CAT_LABEL` rows and every part a `PART_BLURB`.
15. **Riders are assumed to be on vehicles** in the save (`on` = index into `vehicles`); a non-vehicle carrier (a camp table, a drying rack) loses its riders' placement on reload.
16. **A wreck's "touched" signature ignores instance state** (`sigOf` lists kinds only): taking 3 arrows out of a stack of 10 in a wreck's boot would not mark it, and the full stack would come back.
17. **Chinese-only strings** in `ItemDef.blurb`, `CONTAINER_NAMES`, `EFFECT_ZH`, card texts; `Text {zh, en}` exists for names only.
18. **`RECIPES`, `ITEMS`, `BY_ID`, `RECIPE_BY_ID` and `TABS` are frozen at module load**; a content file that registers later is half visible unless the registries are made incremental.

## 10. Performance notes

All inferred from the code unless marked measured; none profiled in a browser.

- **`LooseThings.update` is O(N) per frame with an O(N x M) inner cost**: for every loose thing it calls `CarMaterials.setFrameOf(owner, ...)` (`loose.ts:547`, and :508 for riders), which loops over **all** owned looks comparing string prefixes (`materials.ts:138-140`). 40 things: 1600 comparisons a frame; 500 things: 250 000. Parts also allocate a `LookOf` each frame (`partLook`, :536).
- **One `CarLook` per loose thing** (its own shader material instances), so identical items never batch.
- **The merge is all or nothing**: any pick-up, put-down, tool repaint or cleaning start calls `unmerge()`, and the next `tryMerge` rebuilds one merged mesh from every resting thing (`loose.ts:370-406`), once all models are loaded and nothing is falling.
- **Things riding in a vehicle are never merged** (`loose.ts:390`): each is its own meshes in every pass (two shadow layers + main). A caravan with 60 stowed things is 60+ extra objects.
- **`LooseThings.pick`** is a linear sphere test over all things every frame (`player.ts:609, 660`); `Places.update` does `loose.list.includes(l)` for every owned thing every frame (`places.ts:231-239`); a powered workshop copies `loose.list` every frame (`game/workshop.ts:858`).
- **The bench list**: `CraftUi.update` re-evaluates the list every 0.25 s while open (the DOM is rewritten only when its key changes); each time `Workshop.rows()` (:921) builds, for **all 64 recipes**, a fresh instance and name (`heldOfMakes` + `nameOf`: 59 `newTool` (31 previews and 28 more for the names of the cans), 20 `newItem`, 14 `newInstance` per call, counted from the recipe list) and a fresh `ItemCard` (an engine's includes a sampled torque curve). The three uid counters advance by those amounts four times a second while the bench is open. With 150 dishes and the crafting tabs this becomes several hundred objects and cards per refresh. Any change of selection, stock or icon rebuilds the whole list's `innerHTML` and re-attaches listeners (`craftUi.ts:184-239`).
- **Workshop devices allocate on property access**: `x`, `y`, `z` are getters that each create a `Vector3` and read a marker's world position (`game/workshop.ts:504-625`); the player reads them for every device every frame (`player.ts:719-732`); `ModGame.devices` (:656) builds new arrays per access when a place is near.
- **Zone floors**: `CargoBay.drawFloor` (:137) renders the scene with an override material on a private layer and calls `readRenderTargetPixels` synchronously, once per (vehicle, zone) and again after `invalidate`. While aiming, `aim` samples the ray every 2 cm and `findSpot` tries up to 16 rings x 2 yaws x 3 poses of `restAt` (each sampling the footprint at 2 cm); the worst case is a full zone, every frame the thing is held to it.
- **Saving**: section 9.8. Also `Wrecks.snapshot` -> `touched` -> `JSON.stringify(build)` for every live wreck on every autosave.
- **Thumbnails**: two extra WebGL contexts (game + dev panel), one PNG `toDataURL` per frame at most, data URLs kept for the session (close to 300 distinct keys possible today: 127 parts, 106 items, about 50 tool variants; V3 content adds several hundred).
- **HUD**: `slotViews()` and a `JSON.stringify` key every frame (`hudItems.ts:160`); `stepVitals` allocates an events object, a closure and a filtered `gains` array per step.

## 11. Proposed seams

The aim: one integration change to the existing files, done **before** the fan-out, after which each V3 system only adds its own files (content, rules, UI) and one import line in a barrel. Line numbers are those of commit `e50503c`.

### S1. Open ids and incremental registries (core)

Turn the five closed unions into string ids backed by registries that keep registration order (the order is part of determinism).

- `items.ts:15-23`: `export type Material = string`; `MATERIALS` becomes the object `registerMaterials(defs: MaterialDef[], owner?)` adds to; **`MATERIAL_IDS` stays the three abstract ones** (the recycler's tallies, `newStock`, the test at `modcar_workshop.test.ts:67`); new `materialIds(): readonly string[]` for all. `MaterialDef = { id, name: Text, hex, group: 'abstract' | 'metal' | 'wood' | 'fibre' | 'hide' | 'bone' | 'mineral' | 'chem' | 'food', icon?: string, stars?: number }`.
- `items.ts:25-37`: `export type ItemCat = string`; `ITEM_CATS` filled by `registerItemCat(def: ItemCatDef)` (the name `player-interaction.md` S1 uses; `{ id, name }` is enough), `ItemCatDef = { id, name: Text, icon?: string, order?: number, grind?: 'organic' | 'cloth' | 'metal' | 'plastic' | 'wood', wreckWeight?: number }`; helpers `itemCat(id)`, `itemCats()` (by `order`, then registration). The nine existing categories are registered first with today's values. The wreck's boot must keep its own list order, `food, drink, med, junk, crate, wear, gear, pack, lamp` with weights 3, 3, 1.4, 1.6, 2.2, 1.2, 0.45, 0.25, 0.3 (core `wrecks.ts:394-395`): the weighted pick depends on the order, which differs from the order of `ITEM_CATS`, and no test would notice a reorder (it would silently change every wreck's boot). New categories are appended after the nine.
- `items.ts:112-116, 257-259`: `registerItems(defs, owner?)` appends to `ALL` and to `BY_ID`, throws on an id already taken by another definition (the legacy `registerItems`, `src/core/items/catalog.ts:221`, is the model); `I()` stays as the base file's helper. Registration must have run before `loadSave()` (`entry.ts:39`), which the barrel below guarantees.
- `crafting.ts:150-158`: `RecipeCat = string`, `registerRecipeCat(def)`; `:180-226`: `registerRecipes(list, owner?)` appending to `RECIPES` and `RECIPE_BY_ID`.
- `loot.ts:13`: stop importing `ContainerKind` from the legacy file; `ContainerKind = string`; one `ContainerDef = { id, name, material, blurb?, picks, empty, entries }` registry replaces `LOOT_TABLES` :57, `CONTAINER_NAMES` :289, `CONTAINER_MATERIAL` :307 and `places.ts:45`; `registerLoot(kind, entries)` appends entries; `registerJunk(siteKind, ids)` for :111-121; `registerLooseKind(head, fn)` consulted by `looseFound` before :278.
- Consumers that become lookups: `itemInfo.ts:464` -> `itemCat(d.cat).icon`; `devPanel.ts:110, 447` -> `itemCats()`; `devPanel.ts:79` -> `MATERIALS[k].name.zh`; game `workshop.ts:315-316` -> `itemCat(d.cat).grind`; core `wrecks.ts:394-395` -> a list kept in that file's order, extended by the categories registered with a `wreckWeight`; `craftUi.ts:83` -> build `TABS` in `show()`, not at import; `craftUi.ts:73-78` -> `MATERIALS[m].icon ?? flask`.
- One barrel, `src/core/modcar/content.ts`, imports the base catalogue then every system's content file in a fixed order. `entry.ts` and V3 tests import the barrel; **the five existing tests import the base modules directly and keep seeing exactly today's content** (vitest isolates module state per file), so their assertions stay valid.

Files: `src/core/modcar/{items,crafting,loot,wrecks}.ts`, `src/game/modcar/{itemInfo,devPanel,workshop,craftUi,places}.ts`, new `src/core/modcar/content.ts`. Risk: registration order becomes part of every roll; a category given a non-zero `wreckWeight` or an entry appended to an existing table changes existing seeds (acceptable once, with world generation 2.0, but it must be a decision).

### S2. `ItemDef` and `ItemInstance` contracts: stacks, containers, freshness, module data

```ts
// items.ts — the fields every system shares. A system's own typed data is added by declaration merging,
// e.g. `declare module '../modcar/items' { interface ItemDef { firearm?: FirearmSpec } interface ItemState { rounds?: number } }`,
// so this file is not edited again. (Same names as docs/V3/maps/player-interaction.md S1: `tags`, `state`.)
export interface ItemState {}                // per-instance state, merged into by systems

export interface ItemDef {
  /* ...existing... */
  readonly tags?: readonly string[];        // 'meat', 'fish', 'herb', 'pelt', 'arrow' ... recipes and containers ask for tags
  readonly stack?: number;                  // most per stack (absent: 1)
  readonly holds?: { slots: number; accepts: readonly string[]; maxKg?: number; keepsFresh?: number };
  readonly perish?: { hours: number; into?: string };
  readonly buffs?: readonly { id: string; secs?: number }[];   // granted when eaten or drunk (S5)
  readonly icon?: string;                   // a drawn picture instead of a 3D thumbnail (blueprints)
  readonly shape?: 'box' | 'bottle' | 'bag' | 'long' | 'flat' | 'sheet'; readonly size?: readonly [number, number, number];
}
export interface ItemInstance {
  /* ...existing... */
  n?: number;                // how many in this stack (absent: 1)
  inside?: ItemInstance[];   // a container item's contents
  fresh?: number; t0?: number;   // freshness 1...0 as of absolute game hour t0 (decays lazily, never stepped per frame)
  q?: number;                // quality 0...1 (a trophy's score, a dish's)
  state?: Partial<ItemState>;    // system-owned JSON state (rounds loaded, attachments, a blueprint's fragment index)
}
```

New categories are plain registrations (S1): `weapon`, `ammo`, `tackle`, `bait`, `cookware`, `ingredient`, `dish`, `material`, `hide`, `trophy`, `blueprint`, `furniture`, `container`.

Rules that keep the rest of the code simple:
- **A stack is one instance** (`n > 1`): one `Held`, one `Loose`, one cargo box, one list row, one thumbnail with a count. This answers the "countable things" question left open in `player-interaction.md` (its open question 3): a count on `ItemInstance` for things one carries, counters in the stash for materials, and not the classic `Inventory`. `canStack(a, b)`: same `item`, neither has `inside`, equal `tint` and `state`, no `litres` / `uses` (things with a fill level do not stack), freshness within a tolerance (the merged stack takes the lower).
- **A container item holds a flat list** (`inside`), filtered by `holds.accepts` (a category id, or `#tag`); containers do not nest. Its mass and salvage include the contents. Its contents are shown through the same list UI as a vehicle's (S6 `ListSource`). Examples of the contract:

| Item | `holds` | Contents stack to |
|---|---|---|
| ammo box | `{ slots: 4, accepts: ['ammo'] }` | `stack` of the round (e.g. 20 to 50) |
| quiver | `{ slots: 1, accepts: ['#arrow'] }` | 12 to 24 |
| forage basket | `{ slots: 12, accepts: ['#forage'], keepsFresh: 0.8 }` | 5 to 10 |
| creel | `{ slots: 6, accepts: ['#fish'], keepsFresh: 0.5 }` | 1 |

- **Named materials are counters in the one shared stash**: `ModGame.stock` (`ModGame.ts:267`), the same object every `Workshop` receives as `WorkshopHost.stock`, saved as `SaveV1.stock` and restored with `Object.assign` (so extra keys already survive a round trip). A named material one *carries* is an item of category `material` (or `hide`) whose `salvage` is `{ <materialId>: n }`; a stash device credits it with `addTo(stock, salvageOf(inst))` without the recycler's grinding or power (the `GarageDevice.take` / `useWith` pattern, `game/workshop.ts:584-591`).
- **Freshness is lazy**: `fresh` is the value at absolute game hour `t0`; `freshNow` reads it, `rebaseFresh` rewrites both when the decay rate changes (put into or taken out of a cooler, a creel, a fridge). Nothing is stepped per frame. It needs the absolute clock of S7.

Edits, all in `items.ts`: `newItem` :286 (accept `n`, `state`), `salvageOf` :299 and `itemMass` :308 (times `n`, plus `inside`), `itemName` :313 (append the count); new pure helpers `canStack(a, b)`, `mergeStacks(a, b)`, `splitStack(inst, k)`, `putInside(box, inst)`, `takeInside(box, i)`, `freshNow(inst, nowH, k)`, `rebaseFresh(inst, nowH, k)`, `forEachItem(inst, fn)` (recursion for the save walkers), `itemSig(inst)`.
Game edits, once: eating takes one off a stack (`player.ts:1218`); picking up merges into a matching stack (`player.ts:895-906`); `SlotView` gains `count?` (`hudItems.ts:22-29`, key at :160); `Found` item gains `n?`, `state?`, `fresh?` (`loot.ts:26`, `places.ts:79`); `sigOf` uses `itemSig` (game `wrecks.ts:126`); the recycler's look uses `itemPaint` (game `workshop.ts:768`); `itemStandIn` reads `shape` / `size` (`loose.ts:124-135`).

Risk: every place that assumed "one instance = one object" must be audited once; `mass` and `salvage` flow through the two core helpers, so cargo weight and the recycler follow automatically.

### S3. Costs that name any material, and recipes that take carried items

- `crafting.ts:28, 33, 47, 52, 62` and core `workshop.ts:148, 166`: iterate the keys of the cost / yield instead of `MATERIAL_IDS`; `Stock = Record<string, number>` (sparse), `newStock()` unchanged.
- `Recipe` (`crafting.ts:166-175`) gains: `needs?: { item?: string; tag?: string; n: number; keep?: boolean }[]` (carried things, `keep` for cookware and tools), `station?: string` (default `'bench'`), `steps?: RecipeStep[]` (default: the hammer's `hits(cost)`), `unlock?: { blueprint?: string; skill?: { id: string; level: number }; research?: number }`, `out?: { n?: number }`; `Makes` gains `n?` on items and `{ kind: 'material'; mat: string; n: number }`. `recipesFor(station)`.
- UI: `craftUi.ts:178-182, 196, 241-245`, game `workshop.ts:727, 746, 811, 969`, `vitalsHud.ts:257`, `itemInfo.ts:470` iterate the keys present; the header shows the three abstract counts and a count of named materials.

Files: `src/core/modcar/{crafting,workshop}.ts`, `src/game/modcar/{craftUi,workshop,vitalsHud,itemInfo}.ts`. Risk: low; `shortOf` keeps returning the first short key (order of the cost's keys).

### S4. Knowledge: blueprints, fragments, research, skills, compendium

New pure file `src/core/modcar/knowledge.ts`:

```ts
export interface Knowledge {
  recipes: string[];                 // unlocked recipe ids
  frags: Record<string, number>;     // blueprint id -> bit mask of fragments held
  research: number;                  // points from duplicates
  seen: Record<string, number>;      // compendium: id -> count or best
  skills: Record<string, number>;    // skill id -> xp
}
export function newKnowledge(): Knowledge;
export function recipeKnown(r: Recipe, k: Knowledge): boolean;      // r.open || k.recipes.includes(r.id)
export function learnBlueprint(k: Knowledge, d: ItemDef, inst: ItemInstance): { unlocked: string[]; have?: number; of?: number; duplicate: boolean; research: number };
export function buyRecipe(k: Knowledge, r: Recipe): boolean;        // spends r.unlock.research
```

A blueprint is an item of category `blueprint` with `ItemDef.blueprint = { recipes: string[]; fragments?: number }` (declaration merging, S2) and `state.frag` (0, 1, 2) on the instance of a three-fragment one. Reading a whole blueprint unlocks its recipes at once; reading a fragment sets its bit in `frags[id]` and unlocks when all bits are set; a duplicate (every recipe already known, or the fragment's bit already set) gives research points by the item's `stars` instead. The item is used up either way. Lootable through S1 tables, graded like everything else.

Edits: `Workshop.unlocked` (`game/workshop.ts:328`) reads a set given by the host (`WorkshopHost.known`) instead of owning one; :381 keeps reading `WorkshopSave.recipes` from old saves into the shared set; :924 and :960 call `recipeKnown`; :1279 stops writing `recipes`; `craftUi.ts:202, 214` say what unlocks a locked row and offer the research price; `SaveV1` gains `knowledge?` (`save.ts:46-81`, `ModGame.ts:1521-1537`, `:1483-1501`). Risk: low; `recipeOpen(r, set)` stays for the existing test.

### S5. A generic timed-buff API on the body

```ts
// vitals.ts
export interface BuffDef {
  id: string; name: Text; tone: 'good' | 'bad' | 'cold' | 'plain'; icon?: string;
  secs: number; stack: 'refresh' | 'extend' | 'count'; max?: number; group?: string;   // one buff per group (e.g. 'meal')
  mods?: Readonly<Record<string, number>>;   // multipliers end in 'K' (staminaBackK, foodDrainK, speedK ...), the rest add (warmth, hpMax, carry ...)
  tick?: { every: number; hp?: number; food?: number; water?: number; temp?: number; stamina?: number };
}
export interface Buff { id: string; left: number; n: number; t: number; src?: string }
export function registerBuffs(defs: BuffDef[], owner?: string): void;
export function addBuff(v: Vitals, id: string, o?: { secs?: number; n?: number; src?: string }): void;
export function removeBuff(v: Vitals, id: string): void;
export function hasBuff(v: Vitals, id: string): boolean;
export function modOf(v: Vitals, key: string): number;     // product for '...K' keys, sum otherwise; other systems read it (aim sway, noise, scent, carry)
export function damage(v: Vitals, hp: number, why: string): void;   // reported by the next stepVitals as hurt / why
```

Edits in `vitals.ts`: `Vitals` :89 gains `buffs: Buff[]` and `pending?: { hp: number; why: string }`, `newVitals` :110 gives `buffs: []` (old saves get it through the spread at `ModGame.ts:1485`); `add` :141 exported as `addEffect`; `stepVitals` :150 multiplies or adds the mods at the existing lines (sprint cost :156, stamina back :164, drains :166-167, warmth :188, temperature gain :191, the three hurt intervals :214-234), applies `tick`s, runs buffs down next to :244-248, and drains `pending` through the existing `hurt` closure; the literal 100s at :171 and :173 become rule fields; `VitalsEvents.why` :135 becomes `string`; `revive` :286 clears buffs; `speedFactor` :297 multiplies `modOf(v, 'speedK')`. The eight built-in effects stay as they are (their tests keep passing).
Game: `ModGame.ts:1203` passes `warmth` = sum of worn clothes (S6) + `modOf(v, 'warmth')` instead of 9; `ModGame.consume` :1237 grants `ItemDef.buffs`; `onDeath` :1252 takes any `why`; `vitalsHud.ts:50-51, 159-166` draws buffs from the registry (name, tone, time left) and the maxima from the rules; `itemInfo.ts:494-495` lists an item's buffs. The lifecycle map's `GameContext.hurt(hp, why)` is `damage(body, hp, why)`, and its `bodyMods.warmth` / `bodyMods.speed` hooks can read `modOf`; the buff registry is the data-driven form of the same thing and the one a dish or a medicine names in its definition.

Files: `src/core/modcar/vitals.ts`, `src/game/modcar/{ModGame,vitalsHud,itemInfo}.ts`. Risk: medium (the most tested file of the area: 7 tests pin today's numbers; with no buff registered every number must be unchanged).

### S6. What this area needs from the interaction seams, and three helpers of its own (game)

The seams for *using* a held thing, for world interactables, for UI modes, for events and for worn things are specified in the sibling maps (`docs/V3/maps/player-interaction.md` S2, S3, S4, S5, S8; `docs/V3/maps/modgame-lifecycle.md` 7.1). This area does not define competing ones. What it needs from them:

- **A held behaviour sees the item's data and can consume one of a stack.** Today eating ends with `this.slots[u.slot] = null` (`player.ts:1218`) and `host.consume(u.item)` (:1221); with S2 it takes one off the stack. Eat, drink and pack (`player.ts:981-1021`, `:1555-1562`, `:1571-1583`) are the first three behaviours to move behind the registry.
- **A card extender per item** (`itemInfo.itemCard`, :475-518) so freshness, quality, contents, buffs granted and blueprint progress are drawn by the system that owns them.
- **Worn things** (`ModPlayer.worn` beside `pack`, `player.ts:224`): `ItemDef.wear` (`items.ts:74`) is where camouflage, noise, wetness and scent fields belong; core gets `warmthOf(worn)` to replace the constant 9 (S5).
- **Events this area should emit** (names after the lifecycle map's `GameEvents`): `stock:changed` (`ModGame.stockChanged` :850), `craft:made` (`game/workshop.ts:1168`), plus `recycle:done` (`game/workshop.ts:842`), `loot:searched` (`places.ts:404-411`), `loot:taken` (`places.ts:423`, `ModGame.ts:1388`), `knowledge:learned` (S4), `body:buff` (S5). Skills and the compendium subscribe; nothing here learns their names.

Helpers this area owns:

- **`ListSource`** = `{ title, head, empty, take, rows(): CargoRow[], takeAt(i): Held | null, put?(h): boolean, near(): boolean }`: the data side of the list UI. It replaces the three hard-wired modes in `ModGame.ts:1307-1458` (vehicle, place container, self); a basket, a creel, a quiver, an ammo box, a fridge and the stash are then sources, shown by the same `CargoList`.
- **A stash device**: a `GarageDevice` with `take` / `useWith` that credits `salvageOf(inst)` of a `material` or `hide` item to `ModGame.stock` (no power, no grinding).
- **`things.ts`** (new): `thingOf(held)`, `heldOfThing(t)`, `addLoose(loose, held, x, y, z, yaw)`, `forEachThing(save, visit)`. It replaces the copies of the part / tool / item ternary that only convert or add a thing (6.2: `player.ts:52, 1263`; game `cargo.ts:374`; `places.ts:78-90, 310`; game `workshop.ts:860, 1162-1164`; `ModGame.ts:1157, 1498, 1531, 1770-1773, 1788`) and gives validation and uid reservation one walker that covers every holder: kept wrecks' riders, `places.left`, tools, and `inside`.

Files: `src/game/modcar/{player,ModGame,itemInfo,hudItems,cargoList,save,places}.ts`, new `things.ts`. Risk: medium; `player.ts` and `ModGame.ts` are the files every system would otherwise edit, so this lands with the kernel, before the fan-out.

### S7. Save v2: slices, IndexedDB, tolerant loading

- Use the `SaveSlice` contract of `docs/V3/maps/modgame-lifecycle.md` 7.1 (`{ id, version, snapshot, restore, migrate?, uids?, clear? }`). This area needs two things of it: a flag `heavy?: boolean` (kept in IndexedDB, not written on `pagehide`), and tolerant loading inside each slice's `migrate` / `restore` through `forEachThing` (S6). `SaveV2 = { v: 2, at, head: { seed, place, hour, clock, s?, seat?, player }, slices: Record<string, { v: number, d: unknown }> }`. `fromV1(s)` is a pure mapping of today's fields onto the slices this area owns: `vehicles`, `loose`, `hands` (slots, sel, pack, worn), `body`, `stock`, `knowledge`, `workshop`, `wrecks`, `places`, `tutorial` (`done`).
- Storage: the small `head` and the light slices stay in localStorage, written synchronously on `pagehide` as today; `heavy` slices (`wrecks`, `places`, `vehicles`, `loose`, and V3's ecology and furniture) go to IndexedDB on the 30 s timer, the way `grimeStore.ts` already does it; restore points reference slice revisions instead of copying everything. `entry.ts:39-57` keeps reading the head synchronously for the launch params and awaits the heavy slices before `populate()`.
- An absolute game clock (`head.clock`, seconds of game time since the new game) for freshness and schedules.
- Tolerant loading: an unknown item id becomes a placeholder item, an unknown recipe id is dropped, instead of setting the whole save aside; `check` runs over `forEachThing` (S6).
- Snapshots must not mutate: move the `flushIngests` in `Workshop.snapshot` (:1265) into the save data.

Files: `src/game/modcar/{save,restore,entry,ModGame,workshop}.ts`. Risk: high (data loss if wrong); needs a round-trip test in Node (the slice mappings are pure) and the existing browser journey `harness/shots/modcar_save.mjs`.

### S8. Grading input for loot

`findOdds(s)` (core `wrecks.ts:84`) gains an optional second argument or a sibling `gradeAt({ s, richness? })`; callers `loot.ts:129` (`gradeRoll`) and `wrecks.ts:304, 399`. `rollContainer` and `rollWreck` accept it through an options object so world generation 2.0 can pass a region's richness and the pacing director's bias; with no argument today's numbers stand (the tests at `modcar_loot.test.ts:55` and `modcar_wrecks.test.ts:37` pin them).

### S9. Rendering and UI scale for many things

- `loose.ts`: an instanced path for resting small items of one model (per-instance colour), individual objects only while held or falling; riders merged per vehicle; `CarMaterials.setFrameOf` (`materials.ts:138`) indexed by owner instead of scanning.
- `Workshop.rows()` (`game/workshop.ts:921`): cache one preview instance and card per recipe, invalidated on unlock; `CraftUi` (`craftUi.ts:184`) keeps its list and updates rows instead of rewriting `innerHTML`; tabs wrap.
- Thumbnails: one shared `PartThumbs`; honour `ItemDef.icon`; persist PNGs by key and model version (IndexedDB) so several hundred V3 pictures are not redrawn every session.

Files: `src/game/modcar/{loose,materials,workshop,craftUi,thumbs,ModGame,devPanel}.ts`. Risk: medium, visual regressions; belongs with the performance layer's budgets.

## 12. Open questions

1. Real save sizes and the main-thread cost of the 30 s `JSON.stringify` on a long trip (not measured in a browser); the actual localStorage quota in the target browsers.
2. Draw calls and frame time per loose thing, merged and riding (inferred from the code; `harness/shots/modcar_perf.mjs` and `modcar_calls_probe.mjs` exist but were not run).
3. Whether an IndexedDB write started on `pagehide` completes in the target browsers; whether top-level `await` in `entry.ts` is acceptable for the loading card.
4. Does world generation 2.0 keep `Site.s` (arc length along one road) meaningful with spur roads and regions? `findOdds`, `rollContainer` and `wreckSpots` all take it.
5. Should recipes unlocked be global (proposed) or stay per workshop as coded? Should research points buy any locked recipe or only some?
6. Where does the shared stash live in the fiction: everywhere (as today: one counter usable at any bench), or a place one must return to?
7. How are clothes put on (hotbar hold like the pack, or a wardrobe screen)? Nothing exists to build on but `wearPack`.
8. Is `Recipe.tier` meant to gate anything? No code reads it.
9. Is it acceptable that V3 content changes what existing seeds give (containers, wreck boots), including containers a saved game already searched but did not empty? If not, `Places.open` must store the rolled contents at once.
10. Declaration merging on `ItemDef` / `ItemState` from other modules under `isolatedModules` with TypeScript 7 and Vite 8: expected to work, not compiled here.
11. Should Chinese-only strings (`blurb`, container names, effect names, card texts) become `Text` before 300+ new entries are written?
12. What a missing GLB costs on the dev server and in a production build (one failed request per model is assumed from the loader's error path; not observed).
13. Three maps (this one, `player-interaction.md`, `modgame-lifecycle.md`) each propose registries; the orchestrator should fix one set of names (`registerItems`, `registerItemCat`, `SaveSlice`, the held-behaviour registry) before the fan-out. This map follows the other two where they overlap and only adds the economy contracts (stacks, contents, freshness, materials, recipes, knowledge, buffs, loot registration).
