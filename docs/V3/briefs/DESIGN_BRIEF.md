# Design brief: V3 shared architecture and data contracts

> Status (2026-11-18): the one large up-front design this brief asked for is cancelled. The owner changed the way of working to one system at a time (docs/V3/LOOP_V2.md, docs/V3/STATUS.md): each node designs only the interfaces and tables it needs, in docs/V3/nodes/. This brief stays as the statement of intent those small designs follow: the goals in section 1, the layout in section 2, the kernel ideas in section 3 and the contract lists in section 4 are still what the nodes aim at, opened step by step instead of all at once. Sections 7 and 8 (one architecture document, one work-package document) no longer apply.

Written by the integrator (main session). This is the binding intent for `docs/V3/ARCHITECTURE.md`, for the type files under `src/core/v3/contracts/`, and for `docs/V3/WORKPACKAGES.md`. Where a code map (`docs/V3/maps/*.md`) shows that something here cannot work as written, the map wins: say so explicitly in the architecture document and choose the nearest design that does work.

Read first: `docs/V3/PLAN.md` (the plan, Chinese), `docs/V3/CATALOG.md` (content lists), `docs/V3/LOOP_V2.md` (how parallel work is run), every file in `docs/V3/maps/`.

## 1. Goals

1. After the foundation phase (P0), a new gameplay system is a folder that registers itself. It never edits `ModGame.ts`, `player.ts`, `save.ts`, `entry.ts`, `devPanel.ts`, `items.ts` or `crafting.ts` again.
2. Many workers build systems in parallel without touching each other's files. Every shared type is defined once, up front, in one place.
3. Nothing existing changes behaviour in P0: 1,342 tests and the browser journey scripts stay green.
4. Performance is part of the contract: each system declares a CPU budget and a draw budget and is measured against them.
5. Everything gameplay-relevant stays deterministic (seed hashes only; no `Math.random`, no wall clock), pure logic stays in `src/core` (no three, no DOM).

## 2. Layout

```
src/core/kernel/              pure: EventBus, SystemRegistry, SaveSliceRegistry, Profiler (unit-tested in Node)
src/core/v3/contracts/        types only, shared by all systems (frozen after P0; only the integrator changes them)
src/core/v3/content/          data tables, one file per owning system (items of that system, defs, recipes ...)
src/core/v3/<system>/         pure logic: ecology, hunting, fishing, forage, cooking, crafting, blueprints,
                              progress (skills, compendium, notices), caravan, director (world pacing), services
src/game/modcar/kernel/       browser-side kernel: GameContext, interactions, held behaviours, modal stack, keys, dev tabs
src/game/modcar/v3/<system>/  browser module of a system: index.ts exports a GameModule; views, HUD, input, dev tab
harness/sim/v3_*.test.ts      tests (vitest, Node)
specs/v3/*.json, specs/perf/*.json   spec cards
tools/blender/v3/<family>/    model generators; output public/models/v3/<family>/*.glb
docs/V3/briefs/<package>.md   task briefs
```

Modules are discovered with `import.meta.glob('./v3/*/index.ts', { eager: true })` so adding a system adds no line to a shared file.

## 3. Kernel (follow `docs/V3/maps/modgame-lifecycle.md` section 7 and `player-interaction.md`)

- `EventBus<GameEvents>` with declaration merging so a system adds its own events from its own folder.
- `SystemRegistry`: `init / preStep / step / lateUpdate / save / load / dispose / telemetry / harness`, ordered by `after`, each call wrapped (one system throwing must not stop the frame; the error reaches `__rt.lastError`), each call timed per system. A system declares `budget: { cpuMs: number; drawCalls?: number; triangles?: number }`.
- `SaveSliceRegistry`: versioned slices with `migrate`, uid collection so instances stored in slices are reserved on load, `clear` for a new game. Slices refer to vehicles by `build.uid`, never by index.
- `GameContext`: what a system may use (engine objects, world, player, vehicles, loose things, services, registries). Read-only where possible.
- `InteractionRegistry`: providers return what the mark is on (`Interaction` with key, card, actions, press, hold). Zero-cost path through the existing `GarageDevice` list where that is enough.
- `HeldBehaviourRegistry`: an item with `behaviour: '<id>'` gets its own buttons (LMB, RMB, E, F, R, wheel), per-frame update, HUD keys, and may draw itself (`ownView`) with first-person arms. **No fourth `Held` kind**: every V3 hand-held is `kind: 'item'` with `ItemDef.behaviour` and per-instance `ItemInstance.state`.
- `ModalStack` (who owns keys and mouse: bench, cooking, compendium, placement mode, fishing fight) replacing the scattered flags over time; `KeyRegistry` for bindings; `devTabs` registry.
- `bodyMods` (warmth, speed, steadiness ...), `shelters` (roof + air temperature queries, so caravans, buildings and tunnels count as indoors), `view.mods` (camera FOV/offset hooks).
- Persistent world time: a `worldSeconds` kept in a core slice (the session-relative `time` restarts on load today). Everything scheduled (animal timetables, freshness, fermentation, regrowth, buffs) uses `worldSeconds`.

## 4. Data contracts (types in `src/core/v3/contracts/`, one file per group)

Design them so content can scale to the numbers in the catalogue by adding rows, not code.

- **Items** — extend the existing `ItemDef`/`ItemInstance` (do not fork a second catalogue; the classic `src/core/items` is legacy and is not extended). New categories: weapon, ammo, tackle, bait, cookware, ingredient, dish, material (as carried item), hide, trophy, blueprint, furniture, gear. New optional facets: `behaviour`, `stack` (max count per stack), `holds` (container item: what categories, how many), `fresh` (hours before it turns, how cold slows it), `quality` (instance carries 1-5 stars), `tags` (e.g. `meat`, `fish`, `mushroom`, `spice`, `caliber:308`), and a typed per-system data pointer. Instance additions: `n` (count), `q` (stars), `born` (world seconds), `state`, `inside` (contents of a container item). A `registerItems(defs)` entry point so each system's content file adds its own rows before the save is read.
- **Materials** — the three abstract counters stay. About 40 named materials live in a shared stash (`Stash = Record<MaterialId, number>`), deposited automatically near a bench or storage. Salvage tables may yield named materials.
- **Recipes and blueprints** — extend the existing recipe model: bench tab (10 tabs), inputs by abstract cost, named material, item id or tag (with minimum quality), bench add-on required (sewing, reloading, vise, fly-tying, crucible), the short crafting action, output quality rule, skill xp. `BlueprintDef`: recipes it unlocks, category, stars, fragments (0 or 3), source affinities (site kinds, wonders, wreck gloveboxes, notice boards, compendium milestones, skill levels), milestone flag (pity rule). Research points for duplicates.
- **Regions** — `RegionDef`: id, names, intensity class (calm / scenic / highlight), `kin`, terrain recipe (road style + landform operators + grade class), palette, flora table, fauna table (species, density, hunting-ground flag), water kinds, forage table, weather tendencies, site table, wonder table, first distance band it may appear in. The pacing director consumes these.
- **Wonders and sites** — placement relation to the road (beside / over / through), footprint, levelled pad, look-out and photo spot, blueprint cache, region affinity; site kinds with loot tables and blueprint category affinity.
- **Ecotope and wind** (services) — `EcoSample { moisture, canopy, slope, altitude, waterDist, region, biome weights }` from a pure function of the world; `WindSample { x, z, gust }` from a pure field of position and world time. Flora, forage, fauna need zones and scent all read these two.
- **Species** — id, names, skeleton family (10 families), size class 1-9, mass range, herd size, habitat affinity over `EcoSample`, need schedule (feed / drink / rest hour spans), senses (sight, hearing, smell coefficients), wariness range, gaits and speeds, flee style, danger behaviour, yields (meat cuts, hide, extras), trophy (kind and maximum), fur variants with rarities, calls, model and animation set, `photoOnly`. `HitModelDef` per family: organs and bones as capsules/spheres in a normalised body space.
- **Weapons and ammunition** — `WeaponDef` (class, action kind (8 mechanisms + bow + crossbow), calibre, magazine, mass, barrel, sway, recoil, part mounts for the modular build, reload timeline id, sounds, model) and `AmmoDef` (calibre, bullet kind, mass, muzzle velocity, drag, expansion, penetration, pellets, size-class range, the item it is carried as). Attachments. `BallisticsTable` output type.
- **Fish and tackle** — `FishDef` (water kinds, depth layer, structure affinity, hours, weather, bait and lure weights, fight profile, mass and length ranges, rarity, legendary flag, cooking tags), `TackleDef` for rod / reel / line / hook / float / lure / bait with the numbers the fight model needs.
- **Forage** — `ForageDef` (category, regions, niche over `EcoSample`, conditions (rain, hour, tide), rarity, yield item and count, regrowth days, tool bonus, toxic, look-alike, model).
- **Cooking** — `DishDef` (family, steps from a small step vocabulary: cut, add, heat, season, wait, plate; ingredient needs by item or tag; cookware; flavour target; effects), `BuffDef` (what it changes on the body and for how long), free-cooking rules.
- **Furniture and placement** — `FurnitureDef` (cell size on a 10 cm grid, surfaces it may sit on, what it provides: storage slots, a station, comfort kind, warmth, a display for weapons / rods / trophies / photos; mass; the item it is carried as; model). `PlacedThing` (def, cell, rotation, surface, vehicle uid, contents).
- **Progress** — six skills (xp curve, 20 levels, perks at 5/10/15/20), seven compendia, notice-board requests (need, reward, drop box).
- **Performance** — `QualityTier` (low / medium / high / ultra) with the fields in the plan's tier table, `Budget`, profiler scope names, the JSON format of a benchmark result (`loop/perf/*.json`) with a mandatory `hardware` block and a `measured: 'gpu' | 'software'` flag so a software-rendered run can never be mistaken for a GPU measurement.

## 5. Services every system may call (interfaces in contracts, implemented in P0 or by the owning system)

`ecotope`, `wind`, `regions` (which region and distance band at a road position), `clock` (world seconds, hour, day), `heightTiles` (cached height for non-physics users), `inventory` (count / take / give across hands, containers, nearby storage, stash), `stash`, `buffs`, `skills`, `compendium`, `blueprints`, `notices`, `spawnLoose` (put an item in the world), `say`/toast queue, `sound`, `profiler`.

## 6. Rules the work packages must satisfy

- File ownership: every package lists the files it may modify; shared files are modified only by the P0 kernel package (once) and by the integrator.
- Each system ships: pure core + tests, browser module, content table, dev tab, spec card, perf test, a short doc.
- Budgets (plan, "性能工程"): ecology 1.0 ms, streaming upload 1.5 ms, and so on; per-package draw-call and triangle budgets are stated in its brief.
- Software-rendered screenshots are functional regression only. Nobody reports a GPU frame rate from this machine.

## 7. What the architecture document must contain

1. The layout and the dependency rules (who may import whom).
2. Every kernel interface in full TypeScript, with the exact hook positions in `ModGame.ts` / `player.ts` (line numbers from the maps) and the safe order of the refactor with the harness script that gates each step.
3. Every data contract in full TypeScript (these are then written as real files under `src/core/v3/contracts/` and must pass `npm run check`).
4. The event list.
5. The save design: slices now on localStorage, the IndexedDB move as its own step, migration of `SaveV1`.
6. The world-generation versioning (`worldVersion`) and how regions, the director, operators, tunnels, lakes, wonders and (later) spurs plug into `World` without changing today's output for version 1.
7. The render and performance architecture: pass list after the upgrade, where cascades / AO / depth pre-pass / half-res buffers / dynamic resolution + upscale / GPU timers / shader warm-up go, the instanced grass and flora design, LOD and impostors, culling, worker streaming, quality tiers.
8. Risks and the decisions taken for each.

## 8. What the work-package document must contain

A table of packages for P0 and M1 (and a coarser list for M2-M6): id, title, depends on, files owned, deliverables, gates, budget; ordered into waves that can run in parallel; plus the merge order.
