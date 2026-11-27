# Map: the first-person player, what is held, interaction and HUD

Area: `player-interaction`. Mapped at commit `e50503c` (branch `feat/v3`).

Read in full: `src/game/modcar/{player,held,hudItems,cards,itemInfo,ui,cockpit,assists,vitalsHud,pad}.ts`, `src/game/input.ts`, `src/core/onfoot/walker.ts`, `src/core/interact/interact.ts`. Read for the wiring: the parts of `ModGame.ts` that drive them, and `garageStub.ts`, `loose.ts`, `cargo.ts`, `places.ts`, `save.ts`, `ghosts.ts`, `cargoList.ts`, `scrubHud.ts`, `src/core/modcar/{items,tools,vitals}.ts`.

Everything below was verified by reading the code unless it is marked *inferred* or listed under Open questions. Four vitest files were run and pass at this commit: `modcar_items` (10 tests), `modcar_pad` (5), `modcar_vitals` (7), `interact` (11). The browser probes under `harness/shots` need a GPU and were not run.

Line numbers are `file:line` at the commit above.

Two sibling maps and the plan were written while this one was. Where they overlap, section 7 says so: `docs/V3/maps/modgame-lifecycle.md` 7.1 (the kernel: event bus, system registry, interaction and held-behaviour registries, modal stack), `docs/V3/maps/items-economy.md` S1–S2 (the item catalogue, stacks, container items), `docs/V3/PLAN.md` (技术架构, 生态与狩猎, 衣物). The seam numbers S1–S8 below are referenced from `items-economy.md` and should not be renumbered.

---

## 1. Summary

- **One class does everything on foot.** `ModPlayer` (`player.ts`, 1632 lines) owns the hotbar, the look-ray pick, the button dispatch and all the HUD words. `ModGame.step` calls it once per rendered frame, only while the player is on foot (`ModGame.ts:3555-3573`).
- **It is written against three closed unions**: `Held` (part | tool | item, `player.ts:43`), `Target` (12 kinds, `player.ts:56-75`) and `ToolKind` (7 kinds, `core/modcar/tools.ts:16`). Each new kind of held behaviour or target means editing `pick()`, `act()`, `ui()`, `heldKeys()`, `slotViews()` and `keyOf()` by hand. There is no registry.
- **The only open interactable contract is `GarageDevice`** (`garageStub.ts:21-44`): the garage's switches, the workshop's machines, containers, pumps and building doors all implement it. They reach the player through a hand-written getter that concatenates four lists (`ModGame.ts:656-661`).
- **The pure `Interactable / Picker / UseDriver` in `src/core/interact/interact.ts` is not used by ModCar.** Its importers are the classic game, `core/items/*` and tests. ModCar re-implemented picking with different rules (2.6 m reach, ray against boxes and spheres, no occlusion).
- **Hotbar: 2 slots, at most 6 with a backpack worn.** One slot holds exactly one physical thing. There are no stacks, no counts and no inventory grid. Materials are three global counters (`game.stock`).
- **There are no arms.** `HeldThing` (`held.ts`) draws the held model shrunk to at most 0.19 m (0.36 m for a large thing) in world space, following the camera with a lag. Six pose layers are hard-coded: carry, mouth, shake, spray, dock, pin.
- **The HUD is plain DOM** under `.mc-ui`, laid out for 1280 × 720 and scaled with CSS. It is rebuilt as strings every frame and diffed against the last HTML.
- **Vital effects are a closed union of 8**, shown as chips by name, plus three full-screen overlays and two hard-coded camera effects.
- **Things V3 assumes that do not exist today**: crouching (core supports it, ModCar never sets it), wearing clothes (warmth is the constant 9), the head lamp, the hammer / repair kit / flare gun, walking inside a vehicle, a world ray with occlusion, hooks for field of view and look sensitivity, a modal-UI stack, an event bus, a message queue.

Section 7 proposes eight seams (S1–S8). The two decisions that matter most: make `item` the one open kind of held thing (no fourth `Held` variant), and let the thing in the hands claim the mouse while **E always belongs to the world**.

---

## 2. Key files

| Path | Lines | Role | Public API |
| --- | ---: | --- | --- |
| `src/game/modcar/player.ts` | 1632 | The on-foot player: hotbar, pick, dispatch, HUD words | `Held`, `heldName`, `heldOf`, `ScrubHit`, `PaintAim`, `Scrub`, `TankPort`, `PlayerHost` (21 members), `zoneOpen`, `ModPlayer` |
| `src/game/modcar/held.ts` | 481 | The held thing drawn in first person | `Dock`, `HeldThing` (`set`, `setUse`, `update`, `pin`, `aimSpray`, `shake`, `nozzleWorld`, `spoutWorld`, `marker`, `look`, `centre`, `docked`, `pouring`, `root`) |
| `src/game/modcar/hudItems.ts` | 273 | Hotbar, action lines, key list, transfer strip, card placement | `KeyName`, `Action`, `SlotView`, `TransferView`, `keyHtml`, `actionHtml`, `ItemHud` |
| `src/game/modcar/cards.ts` | 242 | Card HTML and diffing | `TONE_COLOUR`, `CARD_CSS`, `iconSvg`, `cardHtml`, `CardView` |
| `src/game/modcar/itemInfo.ts` | 624 | Card contents as plain data | `Tone`, `CardBar`, `CardRow`, `CardCurve`, `CardColumns`, `CardIcon`, `ItemCard`, `partCard`, `toolCard`, `itemCard`, `vehicleCard`, `fitCard`, `deviceCard`, `fuelBar`, `salvageText`, `instanceMass`, `toolMass`, `FUEL_ZH`, `hexCss` |
| `src/game/modcar/ui.ts` | 554 | Root HUD: mark, ring, toast, quest, help, pause, marker, fade (the vehicle's readings are on the cab's own instruments: cluster.ts) | `ModUI` (`root`, `items`, `lang`, `hudScale`, `prompt`, `say`, `showList`, `showAssists`, `showLoading`, `showHelp`, `showPause`, `showMarker`, `setFade`, `update`) |
| `src/game/modcar/cockpit.ts` | 179 | The mark on the cab's controls while seated | `CockpitHost`, `Cockpit` (`aimed`, `pick`, `update`, `press`, `release`) |
| `src/game/modcar/assists.ts` | 53 | Seven switches kept in localStorage | `Assists`, `ASSIST_LABELS`, `DEFAULT_ASSISTS`, `loadAssists`, `saveAssists` |
| `src/game/modcar/vitalsHud.ts` | 283 | Body dial, tiles, effect chips, overlays; death card; material popups | `VitalsHud` (`show`, `hurt`, `update`), `DeathCard`, `MaterialsHud` |
| `src/game/modcar/pad.ts` | 162 | Gamepad buttons to game verbs; rumble | `PadHost` (18 members), `ModPad` (`take`, `drop`, `jump`, `run`, `rx`, `ry`, `name`, `rumble`, `update`) |
| `src/game/input.ts` | 193 | Keyboard, pointer lock, shared gamepad axes | `Action`, `InputManager` (`drive`, `lookYaw`, `lookPitch`, `lookHold`, `freeLook`, `walk`, `locked`, `lockable`, `turn`, `isDown`, `onAction`, `onRelease`, `update`) |
| `src/core/onfoot/walker.ts` | 490 | Pure capsule walker, fixed 1/120 s steps | `FOOT`, `FootInput`, `CarryLoad`, `FootState`, `NO_SOLIDS`, `FootWalker` |
| `src/core/interact/interact.ts` | 330 | Pure look-and-use framework (**unused by ModCar**) | `Actor`, `Interactable`, `LongUse`, `InteractSource`, `InteractSet`, `Picker`, `UseDriver`, `UseEvent`, `applyUse`, `segmentHits`, `holdOf` |

Adjacent files the seams touch:

| Path | Lines | Why it matters here |
| --- | ---: | --- |
| `src/game/modcar/ModGame.ts` | 4633 | Implements `PlayerHost`, `CockpitHost`. Wires input (`2176-2347`), pad (`2360-2427`), the on-foot step (`3555-3582`), camera (`3977-4000`), held view (`4015-4032`), vitals (`1191-1234`), save of the hands (`1483-1501`, `1531-1533`) |
| `src/game/modcar/garageStub.ts` | 234 | `GarageDevice` (`21-44`), `GarageContext` (`47-61`) |
| `src/game/modcar/loose.ts` | 652 | `Loose`, `LooseThings` (`addPart/addTool/addItem`, `pick`, `highlight`, `objectFor`) |
| `src/game/modcar/cargo.ts` | 463 | `carryOf`, `massOf`, `StowAim`, `CargoBay.aim/stow/packSpot/showGhost` |
| `src/game/modcar/places.ts` | 615 | Containers and pumps as `GarageDevice` / `TankPort`; `SavedThing` |
| `src/game/modcar/save.ts` | 159 | `SaveV1.hands`, `SavedLoose`, `check()` |
| `src/core/modcar/items.ts` | 328 | `ItemDef`, `ItemInstance`, 106 item kinds, `Material` |
| `src/core/modcar/tools.ts` | 340 | `Tool`, `ToolKind`, cans and cleaners |
| `src/core/modcar/vitals.ts` | 308 | `Vitals`, `VitalEffect`, `stepVitals` |
| `src/game/modcar/entry.ts` | 782 | `window.__rt`, the hook every browser probe drives the player through |

---

## 3. Lifecycle and data flow

### 3.1 Construction

`ModGame`'s constructor makes `HeldThing` (`ModGame.ts:455`), then `ModPlayer(land, this)` (`:465`), sets `walker.speeds = { walk: 2.5, run: 5.0 }` (`:467`), reads `modcar.ui.cards` from localStorage (`:469`), adds the garage's and the world's solids (`:473-474`, `:907-926`) and binds input (`:476`). Every vehicle adds its body as one upright box solid (`:1674`).

### 3.2 One frame

`entry.ts:763-769` calls `game.frame(dt)` from `requestAnimationFrame` with `dt = min(0.1, elapsed)`. `simulate(0)` steps with `dt = 0` (`ModGame.ts:4535-4540`), so everything must tolerate a zero step. An exception inside a frame is caught, shown once as a toast, and the rest of that `step()` is skipped (`entry.ts:770-778`).

Order inside `ModGame.step` (`3490-3621`):

1. `input.update(dt)` (`3501`), `pad.update(padHost())` (`3502`), `applyAssists()` (`3504`).
2. `stepBody` (`3512`): vitals, `walker.speedScale`, `VitalsHud.update`.
3. Workshops, wrecks, places, doors (`3513-3553`). `places.update` may rebuild the device list.
4. **On foot** (`3555-3573`): `player.update(dt, lookYaw, lookPitch, keys)`, then `input.lookHold`, then the pad's right stick into `scrubMove`, then the cargo list.
   **Seated** (`3574-3582`): `player.update` is not called. `ModGame` hides the cards and shows the driving keys and the hotbar.
5. Vehicles, cones, loose things, sparks, dust (`3584-3614`).
6. `updateViews` (`3618`): camera from the walker's eye (`3977-4000`), the bench view (`4002-4013`), the held thing (`4015-4024`), scrub HUD and spray (`4025-4026`), the liquid stream (`4029-4032`), the cockpit when seated (`4035-4040`), `ui.update(dt)` (`4099`).

Inside `ModPlayer.update` (`player.ts:470-502`):

| Step | Lines | What |
| --- | --- | --- |
| 1 | 474-476 | `still` = liquid flowing, or a button down at an open filler or tank (from last frame's target), or scrubbing |
| 2 | 477-489 | Walk input, `heading = lookYaw`, `pitch = lookPitch`, `walker.load` from how the held thing is carried, `walker.advance(dt)`, eye and look direction |
| 3 | 490-491 | `secondaryWas`, `secondary = keys.take` |
| 4 | 493 | `target = aside ? null : pick()` |
| 5 | 494 | `stepScrub(dt)` if scrubbing |
| 6 | 495-497 | Highlight, part ghosts, the stow ghost |
| 7 | 498 | `act(dt, keys.drop)` |
| 8 | 499-501 | `ghosts.update`, `primaryEdge = false`, `ui()` |

### 3.3 The `Held` union, the hotbar, the backpack

```ts
// player.ts:43
export type Held = { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | { kind: 'item'; item: ItemInstance } | null;
```

- `slots: Held[] = [null, null]` (`:222`), `sel = 0` (`:225`), `pack: ItemInstance | null` (`:224`). `held` is `slots[sel]` (`:296-302`).
- `freeSlot()` returns the selected slot if empty, else the first empty one, else −1 (`:305-308`).
- `wearPack(item)` (`:314-330`) resizes `slots` to `2 + pack.slots`. The three packs add 2, 3 and 4 (`items.ts:183-185`), so the hotbar has 2, 4, 5 or 6 slots. It refuses if the slots that would disappear are not empty, or if the old pack has no free hand to come into.
- The backpack is not a container. `Tab` with no vehicle near lists only the worn pack itself (`ModGame.ts:1337-1340`).
- `select(i)` (`:333-341`) is ignored while liquid flows; it cancels eating and resets progress.
- Digits 1–6 select a slot (`ModGame.ts:2269-2273`). The wheel cycles (`player.ts:462`).
- How the walker is slowed: a `large` part or item gives `walker.load = 'large'` (1.2 m/s, no run, no jump). Tools are always `'none'` (`:484-485`).
- Mirror types that repeat the three-way split: `Loose` (`loose.ts:35-40`, three nullable fields), `SavedLoose` and `SaveV1.hands` (`save.ts:30-33`, `:59`), `SavedThing` (`places.ts:61`), `Found` (`core/modcar/loot.ts:26`), `Makes` (`core/modcar/crafting.ts:161`), `DevItem` (`devPanel.ts:25-29`).
- Behaviour by kind today:

| Held | What the buttons do |
| --- | --- |
| part | Ghosts on every mount that takes it; E/LMB held fits or replaces |
| tool: jerrycan, bottle, oilcan | Docks at an open filler or tank; E/LMB held pours, F/RMB held draws back |
| tool: spray | E/LMB held paints what takes paint; on such a thing nothing else is picked |
| tool: sponge, scraper, brush | LMB held scrubs with the mouse moving the tool; E stays a world button |
| item with `eat` | F/RMB pressed eats (3.9 s) or takes a pill (2.2 s) |
| item with `drink` | F/RMB held drinks |
| item with `pack` | F/RMB held 0.5 s puts it on |
| item with `revive` | Passive: used on death if it is in any slot (`ModGame.ts:1265-1273`) |
| item with `wear`, `lamp`, `gear` | **Nothing.** They have cards only |

### 3.4 How the look ray picks a target (`pick()`, `player.ts:563-735`)

Constants (`:199-205`): `REACH = 2.6` m, `CARD_NEAR = 2.2` m, `GHOST_RANGE = 4.2` m, `GHOST_CONE = 0.2` rad, `DROP_HOLD = 0.45` s.

The ray starts at the walker's eye and runs along heading and pitch (`:565-566`). It is in render space (world minus `host.origin`). Candidates compete through `better()` (`:569-571`): the smallest `dist` wins. Several kinds subtract or add a nudge to `dist` so that small things aimed at on purpose beat coarse boxes; `at` keeps the true distance for the card rule.

| Order | Lines | Condition | Candidate | `dist` used |
| --- | --- | --- | --- | --- |
| A1 | 574-605 | Holding a part | `ghost`: the mount whose aim point is nearest the ray, inside a cone that widens for near ghosts | true distance |
| A2 | 607-611 | Holding a tyre or turbo | `looseSub`: a rim or engine lying about that takes it | sphere hit |
| A3 | 613-621 | Best is a ghost under a shut lid, and the ray meets the lid within `REACH + 0.5` | **returns** `part` (the lid) | box hit |
| A4 | 620, 622 | Best is a ghost or a looseSub | **returns** it | |
| A5 | 624 | Holding a part, nothing above | `panels()`: doors and lids within `REACH` | box hit |
| B1 | 630-640 | Holding a spray can on something paintable, vehicle not moving | **returns** `paint`; sets `lookVehicle` | mesh hit |
| B2 | 642-645 | Holding a cleaner | sets `scrubAim` only (no target) | |
| C | 648-657 | Holding anything | `stow` if the zone is open, else `part` (the nearest panel the zone is reached through) | zone hit + 0.02 |
| D | 659-663 | A free slot exists | `loose` | sphere hit; −1.2 if it rides in a vehicle |
| E | 666 | Holding a can, or a spray can off paintable things | `panels()` | box hit + 0.05 |
| F1 | 672-686 | Empty hands, per near vehicle | `part` for each fitted mount the ray meets within `REACH` | box hit |
| F2 | 688-691 | Holding a can | `filler` for its liquid | hit − 1 |
| F3 | 692-696 | Empty hands, vehicle has a flap | `cap` | hit − 0.3 |
| F4 | 698-706 | Body box within `REACH + 0.4` | `pour` with a can; `enter` with empty hands and no part under the mark | +0.3; +0.25 |
| G | 708 | | sets `lookVehicle` | |
| H | 710-717 | Jerrycan or empty hands | `tank` for each `TankPort` (a pump only for a jerrycan) | hit − 1 with a can, − 0.3 empty |
| I | 719-733 | Always | `device`: `dv.hit(ray, REACH + 0.3)` if it has one, else its point within `REACH + 0.5` and the ray passing within `radius` | true distance |

Facts that follow from this table:

- **Nothing checks occlusion.** A device, a loose thing or a part is picked through a wall if it is within reach.
- **Empty hands are required** to enter a vehicle (`:706`, `:908`, `:924`), to take a part off (`:672`, `:1047`) and to open a filler flap or a tank cap (`:692`, `:945`, `:961`).
- **Doors and lids with something in the hands**: a held part, a can, or a spray can reach them through `panels()` (A5, E). A cleaner or an item reaches only the panels of a cargo zone it aims into (C). The file header's "E still opens doors and lids" (`player.ts:14`) is true only in that sense.
- The early returns A3, A4 skip step G, so `lookVehicle` keeps last frame's value. `act()` uses it for G-hold packing without a distance check (`:886`, `packIn` `:1230-1251`).

### 3.5 How the buttons are dispatched

**Sources.**

| Input | Where | Becomes |
| --- | --- | --- |
| `KeyE` | `input.ts:33` → `ModGame.ts:2311-2315` | list open: take; seated: get out; else `player.press()` (`'key'`) |
| `KeyE` up | `ModGame.ts:2342` | `player.release()` |
| Left button down | `ModGame.ts:2177-2193` | bench crafting: strike; not pointer-locked or dead: nothing; seated: `cockpit.press`; list: take; else `player.press('mouse')` |
| Left button up | `ModGame.ts:2200-2202` | `cockpit.release`, `player.release('mouse')` |
| Right button | `ModGame.ts:2194`, `:2203` | `game.rightButton` |
| `KeyF`, right button, pad LT or B | `ModGame.ts:3567` | `keys.take` (a level) |
| `KeyG`, pad Y, `game.dropButton` | `ModGame.ts:3565` | `keys.drop` (a level) |
| Wheel | `ModGame.ts:2221-2224` | list: move the row; else `player.wheel(deltaY)` |
| Digits 1–6 | `ModGame.ts:2269-2273` | `player.select(n − 1)` |
| `Tab` | `input.ts:41` → `ModGame.ts:2307-2310` | `toggleCargoList()` |
| `KeyI`, `KeyH` | `ModGame.ts:2275-2283` | cards on/off; light up the dirt |
| Shift, Space | `ModGame.ts:3511`, `:3564` | run, jump |

`player.press(from)` (`:358-362`): from the mouse it first tries `startScrub()`; if that takes it, nothing else happens. Otherwise `primaryEdge = primary = true`. `release` clears `primary` (`:364-370`).

So **E and the left button are the same button**, except that the left button scrubs when a cleaner is aimed at something cleanable. **F and the right button are the same level** and cannot be told apart. The middle button is ignored.

**`act()`, in order (`player.ts:873-1147`). The first branch that applies returns.**

| # | Lines | Trigger | Effect |
| --- | --- | --- | --- |
| 0 | 875 | both buttons up | `spent = false` |
| 1 | 880-881 | flow no longer valid | `endFlow()` (says how much moved) |
| 2 | 883-891 | G held with something in the hands | after 0.45 s: `packIn(lookVehicle)` or `putDown()`. Blocks everything below while held |
| 3 | 894-966 | **press** (`primaryEdge` and a target) | `loose`: pick up into the free slot. `enter` with empty hands: get in. `part`: toggle a panel, or get in at a seat or wheel with empty hands. `device`: `take()` then `useWith()`, or `use()` unless it has `holdS`. `tank` empty-handed: cap. `stow`: put in. `cap` empty-handed: flap |
| 4 | 969-972 | target key changed | `progress = 0` |
| 5 | 977-980 | press with an empty spray can | `sprayDry`, toast |
| 6 | 982-985 | `use` in progress | `stepUse(dt)`; blocks everything below |
| 7 | 986-1004 | held drink and secondary held; held food and secondary pressed | start `use` |
| 8 | 1006-1021 | held backpack and secondary held | 0.5 s, then `wearPack` |
| 9 | 1023-1046 | `ghost` or `looseSub`, held part, primary held | fit after `installSeconds` (0.3 / 0.5 / 0.7 s, engines of 100 kg and more 0.8–1.0 s) or `TYRE_SWAP_S` (0.5 s) |
| 10 | 1047-1068 | `part`, empty hands, secondary held | take off after `installSeconds` |
| 11 | 1069-1088 | `loose` with a tyre or turbo, empty hands, secondary held | take the sub-part off |
| 12 | 1089-1099 | `device` with `holdS`, primary held, and `take()` does not claim the held thing | `holding(p)` each frame, `use()` at 1 |
| 13 | 1100-1131 | flowing at a tank or filler | pour (primary) or draw back (secondary) |
| 14 | 1133-1145 | `paint` | the ring shows the coat; primary held sprays |
| 15 | 1146 | no button | `progress = 0` |

Hold rules: `progress` runs 0…1 and resets when the target's key (`keyOf`, `:846-871`) changes. After a hold completes, `spent` blocks further holds until both buttons are released (`:251`, `:875`).

**Wheel** (`:455-463`): if the target is `stow`, it turns the thing by 15° a notch; otherwise it cycles the hotbar.

### 3.6 Prompts

`ui()` (`:1322-1497`) builds every frame:

- `acts: Action[]`, one line per thing a button would do now, from a `switch` on `target.kind` (`:1339-1478`) plus the overrides at `:1481-1488` (a spray can off paintable things, the G hint, both hands full, G being held, liquid flowing). `Action` is `{ keys: KeyName[]; hold?; text; off? }` (`hudItems.ts:14-20`); `text` may carry `<b>`; `off` greys the line and the text says why.
- `aim: ItemCard | null`, the card of what the mark is on, dropped beyond `CARD_NEAR` (`:1484`).
- `xfer: TransferView | null`, the from/to strip while liquid flows; it replaces the action lines (`:1488`).
- the ring: G-hold progress, else `progress`, else none (`:1489`).

It then calls `ui.prompt(!scrub, '', ring)` (`:1490`), `items.showActions`, `showCards(heldCard, aim, cardsOn)`, `showKeys(heldKeys())`, `showTransfer`, `showHotbar(slotViews(), sel)` (`:1491-1496`).

`ui.prompt` is always called with an empty word, so the `.mc-word` element under the mark is never shown (`ui.ts:248-258`; the only callers are `player.ts:1490` and `cockpit.ts:74-75`).

`heldKeys()` (`:1537-1568`) lists the held thing's own buttons down the right. `slotViews()` (`:1571-1583`) gives each slot its icon (`host.iconOf`), name and an optional fill bar (a can's litres, a spray can's paint in its colour, a drink's litres).

Messages: `ui.say(text, seconds)` writes one toast with `textContent`; a new message replaces the old one (`ui.ts:260-265`). `items.showDone(html)` is a second line used after a liquid transfer (`hudItems.ts:215-220`).

### 3.7 In the seat (`cockpit.ts`)

`Cockpit.pick` (`:35-58`) casts the camera's forward ray against the boxes of seven mount categories (`CONTROL_CATS`, `:14`) within 1.3 m. `update` (`:60-80`) shows the action lines and poses the levers. `press(v, right)` (`:83-112`) works the control. It owns `ui.prompt` and `items.showActions` while seated; `ModGame` owns the key list and hotbar (`ModGame.ts:3574-3582`). Nothing in the hotbar can be used from the seat.

### 3.8 How the held thing is posed and animated (`held.ts`)

- `root` is a `THREE.Group` added to the main scene (`:131`), not to the camera. Each frame it is placed in render space from the camera's position and a lagged copy of its rotation.
- `set(held)` (`:135-210`) rebuilds only when a key built from uid, kind, paint and so on changes. Items and tools show a stand-in box at once and swap to the GLB when it loads. Parts load their model and, for a rim, its tyre.
- `fit(obj)` (`:213-242`) centres the model and scales it by `k = min(1, (large ? 0.36 : 0.19) / longest side)`. It records `fitK`, `fitC`, the held height `fitH`, and whether it lies flat. It reads three named markers, `M_edge`, `M_face`, `M_grip`, as positions only (`:224-226`); `M_grip` is collected and never used. It removes the meshes from both shadow layers and sets `frustumCulled = false`.
- `update(dt, cam, show, sway, bob, dock)` (`:248-381`) composes, in this order:

| Layer | Lines | Driven by | Numbers |
| --- | --- | --- | --- |
| Lag | 256-262 | camera | slerp rate `26 / (1 + mass / 40)` per second |
| Carry | 264-268 | `large` | small: offset (0.3 + sway, −0.27 + bob, −0.6), euler (0.15, −0.9, 0.08). Large: (0.6 sway, −0.44 + 0.7 bob, −0.8), euler (0.32, −0.65, 0). Camera space: +x right, +y up, −z ahead |
| Mouth | 271-313 | `setUse({ kind, t })` | eat: up in 0.7 s, a bite every 0.45 s from 1.07 s to 3.63 s, down in 0.27 s. Pill: up 0.7 s, tipped until 1.4 s, down 0.8 s. Drink: up 0.45 s, tilting from 0.4 s |
| Shake | 319-326 | `shake()` | 0.8 s, 44 rad/s, ±2.4 cm, ±0.14 rad |
| Spray | 329-345 | `aimSpray(point)` | comes up to (0.21, −0.2, −0.5); the nozzle (+x) turns to the point. Needs a `NOZZLE` entry (`:38-42`) |
| Dock | 347-364 | `dock` argument | goes to the filler at real size (scale → `1 / fitK`); tips 45°→100°, or 55°→125° for a cap on top. Needs a `SPOUT` entry (`:31-35`) |
| Pin | 366-378 | `pin({ pos, q, at })` | the model's point `at` put on a surface point, real size |

- `ModGame` always passes `bob = 0` (`ModGame.ts:4024`). `sway` is the walker's, at most 1.8 cm.
- The held thing is shown when not seated, not in orbit view, and the bench has not taken the view (`ModGame.ts:4024`).
- Tool-specific view code lives in `ModGame`, not in `held.ts`: the dock (`4018-4020`), the scrub pose (`3183-3223`), the scrub ring (`3226-3249`), the spray's mist, hiss and shake (`3117-3157`), the liquid stream (`4029-4032`).
- The eating schedule is written twice: the logic in `player.ts:1209-1213` (bites) and the picture in `held.ts:277-286`. Nothing ties them together.
- The camera's near plane is 0.06 m and there is one scene and one camera (`render/core.ts:39`, `:129`). The held thing takes the ink and paint passes like everything else and can poke through a wall.

### 3.9 How item cards are built

`itemInfo.ts` returns plain `ItemCard` data (`:73-90`): `key`, `icon`, `cat`, `name`, `stars`, `badges`, `blurb`, optional `curve` and `columns`, `rows`, `bars`, `notes`, `foot { cond, mass, fits }`.

| Builder | Lines | Source |
| --- | --- | --- |
| `partCard(inst, { mount })` | 236-396 | one `if (def.<aspect>)` block per part aspect; an engine gets a 33-point torque curve |
| `toolCard(tool)` | 414-460 | per `ToolKind` |
| `itemCard(inst)` | 475-518 | per `ItemDef` field (`eat`, `drink`, `heal`, `revive`, `wear`, `pack`, `lamp`, `gear`) |
| `vehicleCard(v)` | 524-578 | derived stats, fluids, the rules' problems |
| `fitCard(...)` | 584-603 | before → after rows from `stats.compare` |
| `deviceCard(dv)` | 607-623 | `dv.card` if the device has one, else a plain card |
| `ModPlayer.zoneCard` | `player.ts:1273-1292` | a cargo zone |
| `TankPort.card`, container and pump cards | `places.ts:363-378`, `:591-605` | supplied by their module |

`cards.ts` turns a card into HTML (`cardHtml`, `:160-189`). `CardView.show` (`:211-241`) redraws only when `structureOf(card)`, a `JSON.stringify` of the card without bar values, changes; otherwise it moves the bars in place. `ItemHud.place()` (`hudItems.ts:227-258`) stacks the aim card over a cut-down held card in the right column.

Closed sets a new card hits: `CardIcon` (14 names, `itemInfo.ts:71`) with `ICON_PATH` (`cards.ts:78-93`); `Tone` (9, `itemInfo.ts:28`) with `TONE_COLOUR` (`cards.ts:11-21`); `ITEM_ICON: Record<ItemCat, CardIcon>` (`itemInfo.ts:464`); `KeyName` (22 names, `hudItems.ts:11`).

The content model itself is generic. A rifle, a fish or a recipe can be described with `rows`, `bars`, `columns`, `curve`, `notes` and `badges` without a new field.

### 3.10 How the pad maps buttons

Two readers. `InputManager.update` (`input.ts:140-173`) reads the first connected pad: left stick walks and steers, right stick looks (2.2 and 1.6 rad/s), RT throttle, LT brake, A handbrake, and emits `leverUp`, `leverDown`, `key`, `lights` for the d-pad and `manual` for Y. `ModPad.update` (`pad.ts:92-161`) reads the buttons by mode:

| Mode | Buttons |
| --- | --- |
| Always | Menu → help card |
| Bench open | d-pad → arrow keys; A or RT → `Space`; B → `Escape`; X → `KeyE` |
| Seated | X get out; LB horn (held); RB view; B hazards; View upright; RS press the aimed control |
| List open | Up/Down move; X or RT take; B or View close |
| On foot | RT = left button; X = E; LB/RB hotbar; View = Tab; RS = cards; Down = show dirt; LT or B = take (held); Y = drop (held); A = jump; LS = run |

A trigger counts past 0.55. On foot only d-pad Up, Left and Right are free; the shared reader still emits their seat actions, which `ModGame` ignores on foot. The pad reaches the game through `PadHost` (`pad.ts:21-43`), built in `ModGame.ts:2360-2427`.

### 3.11 How vitals effects are shown

`VitalsHud.update(v, ambientC, dt)` (`vitalsHud.ts:136-173`), called from `ModGame.ts:1223`:

- Dial: health arc (green, red under 20 %), stamina arc, body temperature, a mark for the air's temperature.
- Tiles: food, water, bladder. Food and water turn red under 20; the bladder is marked from 90.
- **Effect chips**: every key of `v.effects` with time left, labelled from `EFFECT_ZH`. Colour by two fixed lists: `GOOD = ['energy', 'warm1', 'warm2']`, `COLD = ['hypo', 'wet']`, anything else bad (`:50-51`). A pseudo-effect is added when the bladder reaches 90 (`:160`). No timer is shown.
- Overlays: a vignette as stamina falls under 35, a red flash for 0.45 s when hurt (pulsing under 20 health), frost under 34 °C.

Elsewhere: drunk sways the camera (`ModGame.ts:3989-3995`); sprinting widens the view by 4° (`:3988`); `speedFactor` changes walking speed (`:1221`). `VitalEffect` is a closed union of 8 with private durations (`vitals.ts:73`, `:87`). Clothes are not counted: `stepVitals` is given `warmth: 9` (`ModGame.ts:1203`).

### 3.12 Coordinate spaces

Mixing these is the easiest mistake to make here.

| Thing | Space |
| --- | --- |
| `player.eye`, `player.dir`, `walker.x/y/z`, `Loose.x/y/z`, `GarageDevice.x/y/z` | world metres |
| `player.ray` inside `pick`, `GarageDevice.hit(ray)`, `TankPort.hit(ray)`, `TankPort.mouth`, `cargo.aim(ray)`, `ScrubHit.point`, `PaintAim.point`, `Dock`, `HeldThing.root` | render space = world − `host.origin` |
| Heading | `h` faces (cos h, sin h) in (x, z); turning right increases `h` (`walker.ts:15-16`) |
| HUD positions | HUD px = window px ÷ `ui.hudScale` (`ui.ts:232-245`) |

### 3.13 Save

`SaveV1.hands` is an array of `{ part? | tool? | item? } | null`, with `sel`, `pack` and `body` (`save.ts:59-64`; written at `ModGame.ts:1531-1534`, read at `:1483-1501`). The live instances are stored by reference and serialised with `JSON.stringify`. `check()` throws on any unknown part or item id, and the whole save is then set aside under `modcar.save.v1.unread` (`save.ts:86-104`, `:133-141`).

---

## 4. Extension points that exist today

| # | Name | Where | How it is used |
| --- | --- | --- | --- |
| E1 | `GarageDevice` | `garageStub.ts:21-44` | Implement `id`, world `x/y/z`, `radius`, `word`, `use()`. Optional: `state`, `card`, `holdS` + `holding(p)`, `take(held)` + `useWith(held)`, `hit(ray, reach)`. It must then be in one of the four lists `ModGame.devices` concatenates (`ModGame.ts:656-661`). Adding a fifth source means editing that getter |
| E2 | `TankPort` | `player.ts:132-148` | A fuel tank a jerrycan pours into; `ModGame.tanks` (`:663-667`) joins the workshop's and the places' |
| E3 | `PlayerHost` | `player.ts:150-186` | Everything `ModPlayer` needs from the game. A second host (a test shell) could implement it |
| E4 | `ItemDef` data fields | `core/modcar/items.ts:48-81` | An entry with `eat`, `drink`, `heal`, `revive` or `pack` gets working behaviour, a model or stand-in, a card, an icon, a dev-panel tile, recycling, and loot by its category and stars (`core/modcar/loot.ts:136`). Entries are added by editing the file; there is no register function |
| E5 | Interfaces, not type aliases | `ItemDef`, `ItemInstance`, `Tool`, `GarageDevice`, `PlayerHost` | TypeScript declaration merging can add optional fields from another module |
| E6 | Sound by name | `ModGame.ts:2671-2733` | `host.sound(name)` plays any name in `FOLEY_SHOTS` (`:2729-2732`); `loopFor` any name in `FOLEY_LOOPS` |
| E7 | HUD widgets | `ui.root` | A class takes the root, adds its own `<style>` behind an id check and its own elements, and uses `.mc-frame` and the CSS variables. Precedents: `VitalsHud`, `MaterialsHud`, `DeathCard`, `CargoList`, `ScrubHud`, `ProvingHud`, `CraftUi` |
| E8 | Cards as data | `ItemCard`, `GarageDevice.card`, `TankPort.card` | Any module can hand over its own card |
| E9 | Model markers | `held.ts:225`, `workshop.ts:181` | Empties named `M_*` in a GLB give working points (`M_edge`, `M_face`, `M_grip`, `M_intake`, `M_craft`, `M_eye`, `M_filler`) |
| E10 | Container list | `CargoList.show(...)`, `PlacesHost.openContainer` | Generic rows; `ModGame.ts:1366-1395` takes a thing out of any `PlaceContainer` |
| E11 | `PadHost` | `pad.ts:21-43` | The pad is decoupled from the game and unit-tested in Node |
| E12 | `Assists` | `assists.ts` | Add a key, a label and a default; the F2 card is generated (digit keys limit it to 9) |
| E13 | Walker knobs | `walker.ts` | `speeds`, `speedScale`, `load`, `bobOn`, the `crouch` input, `jumps`, `toJSON`/`restore`, swappable `land`, `SolidSet.add/remove` |
| E14 | Test hook | `entry.ts:84-734`, `player.telemetry()` | Probes stand, aim, press and read state |
| E15 | Pure interact core | `core/interact/interact.ts` | `InteractSet`, `Picker`, `UseDriver`: complete and tested, not connected to ModCar |

---

## 5. Invariants and the tests that guard them

Guarded by vitest (`npm test`):

| Invariant | Test file |
| --- | --- |
| `src/core` imports no three, no DOM, nothing from `src/game` | `harness/sim/core-purity.test.ts` |
| Walker numbers: 1.9 / 3.6 / 1.0 m/s, carrying 1.2, eye 1.62 / 1.05 m, jump 0.55 m, 38° slopes, 0.3 m steps, no tunnelling, wading and swimming, bob under 2 cm and 8 Hz, save and restore | `harness/sim/onfoot.test.ts` |
| Core picker and E driver: 2.2 m, 9°, occlusion, press / hold / long / channel, replay | `harness/sim/interact.test.ts` (does not cover ModCar's pick) |
| Pad mapping per mode, trigger threshold, stick dead zone | `harness/sim/modcar_pad.test.ts` |
| Vitals rates, effects, death and revival | `harness/sim/modcar_vitals.test.ts` |
| Every part makes a card with no `NaN`; cans show what is in them; liquids conserve | `harness/sim/modcar_items.test.ts` |
| Cargo zones, packing, lying down, mass | `harness/sim/modcar_cargo.test.ts` |

Guarded only by browser probes (`harness/shots/*.mjs`, need `SHOTS_GPU=1`): `modcar_hud` (cards, hotbar, 1/2, I, G), `modcar_fuel` (dock, pour, siphon, standing still), `modcar_paint`, `modcar_grime`, `modcar_stow` (zones, G-pack, backpack, Tab), `modcar_cargo`, `modcar_vitals` (eating, drinking, death), `modcar_pad`, `modcar_places` (containers, pumps), `modcar_garage_devices`, `modcar_journey` (the whole tutorial). `ModPlayer` imports three and reads `window` (`player.ts:376-377`), so none of its pick or dispatch logic runs under vitest.

The probes depend on these members staying as they are: `player.telemetry()` keys (`held`, `slot1`, `slot2`, `sel`, `target`, `progress`, `flow`, `footX`, `footZ`, `heading`), `player.held` (settable), `player.slots`, `player.sel`, `player.pack`, `player.primary` (set directly by `modcar_paint.mjs:41`), `player.press/release`, `player.putDown`, `player.paintAim`, `player.spraying`, `player.use`, `player.lookVehicle`, `player.walker`, `player.ghosts`, `player.slotViews()`, `game.rightButton`, `game.dropButton`, `game.heldThing.docked/pouring`. Target keys have the form `kind:uid:…` (`keyOf`).

Not guarded by any test, but relied on:

1. A physical thing is in exactly one place: a slot, the loose list, a container's contents, a mount, or a machine. Every hand-over takes it out of one and puts it in the other in the same call (`player.ts:900-901`, `:935-937`, `:955-956`, `:1041`, `:1218`, `:1246-1247`, `:1263-1265`).
2. `PartInstance`, `Tool` and `ItemInstance` are plain JSON. The save serialises the live objects.
3. One completed hold per button press (`spent`). Hold progress resets when the target key changes.
4. While liquid flows the player stands still and the view does not turn (`player.ts:476`, `ModGame.ts:3570`).
5. Fitting never takes more than one second (`core/modcar/parts.ts:760-769`).
6. HUD components do not write `innerHTML` when nothing changed.
7. `player.update` is not called while seated.
8. `dt` can be 0 and can be 0.1.
9. World versus render space, as in 3.12.

Doc and code disagree in five places:

- `docs/MODCAR.md` §5.1 lists "C 蹲". `FootInput.crouch` is never set (`player.ts:220`); C toggles the seat's view mode even on foot (`ModGame.ts:2317-2320`).
- §5.1 lists V for the view. `KeyV` is the `wipers` action (`input.ts:30`), which ModCar does not handle.
- The help card says the wheel changes the spray colour (`ui.ts:113`). The wheel cycles the hotbar (`player.ts:461-462`).
- The head lamp's blurb says "L 开关" (`items.ts:186`). Nothing implements it.
- §13 has clothes keep the cold out. The game passes `warmth: 9` (`ModGame.ts:1203`).

---

## 6. Risks for V3

1. **A fourth `Held` kind costs seven mirror types.** `Loose`, `SavedLoose`, `SaveV1.hands`, `SavedThing`, `Found`, `Makes` and `DevItem` each repeat the three-way split, and about ten ModCar files branch on it (`player`, `held`, `cargo`, `loose`, `places`, `workshop`, `garageMachines`, `ModGame`, `entry`, `devPanel`). The `item` branch of every one of them is already generic.
2. **Mouse buttons are aliases of keys.** A rifle needs fire, aim and interact as three separate inputs. Today E ≡ LMB and F ≡ RMB, and the probes set `player.primary` directly.
3. **Basic actions need an empty selected slot.** With a rifle always in the hands the player cannot get into a vehicle, take a part off, or open a filler flap, and can open only cargo-zone doors.
4. **Standing still, holding the view and the field of view are hard-coded.** `still` knows only flow and scrub (`player.ts:476`); `lookHold` likewise (`ModGame.ts:3570`); the camera's fov is overwritten every frame (`ModGame.ts:3988-3999`); look sensitivity is the constant `0.0022` (`input.ts:103`).
5. **`use` blocks everything and is hard-coded to eat / pill / drink** (`player.ts:270`, `:982-985`), with its timing duplicated in `held.ts`.
6. **No occlusion and no world ray.** Fine at 2.6 m. A bullet, a camera or binoculars need terrain, solids, vehicles and animals in one query; nothing provides it.
7. **Flat lists.** `pick()` walks every device and every loose thing each frame. Forage nodes and carcasses in the hundreds would be walked too.
8. **No modal-UI concept.** The bench, the cargo list, death, the dev panel and the help card are each special-cased at the sites listed in S4. Cooking, the workbench tabs, the compendium, skills, furniture placing and a fishing fight would each repeat that.
9. **No events.** `host.changed(v, what)` discards `what` (`ModGame.ts:2510-2518`). Skills and the compendium have nothing to listen to.
10. **One toast.** Two systems speaking in the same second overwrite each other.
11. **Closed HUD sets**: `KeyName`, `CardIcon`, `Tone`, `ItemCat`, `VitalEffect`. Timed buffs from recipes cannot be shown; `GOOD` and `COLD` decide colour by name.
12. **Hints assume two slots.** `this.sel === 0 ? '2' : '1'` at `player.ts:1388`, `:1462`, `:1565` and `ModGame.ts:4347`; `slots[1 - sel]` at `:1540`; `telemetry()` reports two slots.
13. **No walking inside a vehicle.** `ModGame` has two states, seated or on foot. A vehicle is one box solid to the walker (`core/onfoot/vehicle.ts:49-68`). The classic game's `onboard` mode (`core/onboard/walker.ts`, `core/onfoot/modes.ts`) is not connected. Cooking in a caravan and placing furniture inside depend on it.
14. **Save fragility.** An unknown item id sets the whole save aside. Tool uids are never reserved after a load (`newTool`'s counter restarts at 0; there is no `reserveToolUids`), so a new tool can share a uid with a saved one; `toolCard.key` and the spray-shake memory use that uid.
15. **A throwing behaviour stalls the frame silently.** The loop catches it, toasts once per distinct message, and skips the rest of `step()` every frame.
16. **Refactors of `player.ts` are unprotected without a GPU.** Only the browser probes cover it.
17. **Devices mutate the player directly.** `GarageContext.player` is the whole `ModPlayer`; `garageMachines.ts:200-203` assigns `ctx.player.held`.
18. **Two item catalogues with the same names.** `core/items/catalog.ts` (classic; has `registerItems`, stacks, categories `bait`, `fish`, `game`, `ammo`) and `core/modcar/items.ts` (ModCar; none of those). `ItemDef`, `ItemCat`, `ITEMS` and `hasItem` exist in both with different shapes.
19. **Key collisions.** C toggles the view mode on foot; `KeyH` is both "show dirt" and the horn action; digits are also `seatN` actions with `preventDefault`. X, N, T, Y, U, J and the middle button have no binding at all. R, V, Q, Z, M, B, K, O and L are in `KEY_ACTIONS` (`input.ts:25-51`): they emit a seat action and call `preventDefault`, and `ModGame` ignores that action on foot, so they can be read on foot with `isDown`.
20. **The held thing lives in the main scene.** Real-size arms and a rifle will clip into walls at a 0.06 m near plane and stretch when the fov changes.
21. **`as never` on the keys object** (`ModGame.ts:3569`) hides type errors when `update`'s signature changes.
22. **Strings are Chinese and inline.** `ui.lang` exists but most of `player.ts` writes `zh` directly.
23. **Scrubbing and painting know only vehicle parts.** `ScrubHit.inst` and `PaintAim.inst` are `PartInstance` (`player.ts:78-113`); `LooseThings.grimeCast` skips anything that is not a part (`loose.ts:595`); the masks are keyed by part uid. The plan wants guns to get dirty and be cleaned "with the existing scrubbing" (`PLAN.md`, 武器与弹药). An item has no `dirt`, `crust` or `rust` and no mask today.
24. **System randomness in play.** The plan's rule is seeded hashes only. In this area `ModGame.ts:1241` rolls a medicine's side effect with `Math.random()`, and `workshop.ts:664` the generator's rope. (`input.ts` and `vitalsHud.ts` use `performance.now()` for easing and a pulse only.)

---

## 7. Proposed seams

The goal is that after one refactor of this area, a V3 module adds files and one registration line, and never edits `player.ts`, `held.ts`, `hudItems.ts`, `cards.ts`, `itemInfo.ts`, `ui.ts`, `pad.ts` or `input.ts` again.

Two decisions shape everything else:

- **`item` is the open kind.** Every V3 thing a hand can hold (rifle, bow, rod, knife, pan, binoculars, camera, blueprint, a fish, a cut of meat) is an `ItemDef` and is held as `{ kind: 'item' }`. `part` and `tool` stay closed.
- **The thing in the hands may claim the mouse, R and the wheel. E always goes to the world.** This generalises the two precedents: a cleaner takes the left button while E opens doors; a spray can on paintable metal takes both.

### S1. Open the item catalogue (core)

In `src/core/modcar/items.ts`:

- `:25-37` `ItemCat` and `ITEM_CATS`: make the category a string with `registerItemCat(id, name: Text)`.
- `:48-81` `ItemDef`: add `behaviour?: string` (the id of a held behaviour, S2; the name `modgame-lifecycle.md` uses) and `tags?: readonly string[]`. Module-specific data goes in by declaration merging, for example `declare module '.../items' { interface ItemDef { firearm?: FirearmSpec } }`.
- `:84-95` `ItemInstance`: add `state?` for per-instance JSON state (rounds loaded, wear, the line on a reel). `items-economy.md` S2 types it as `Partial<ItemState>` with an `ItemState` interface that systems merge into, and adds `n` (a stack) and `inside` (a container item's contents). This map follows that.
- `:112-121`, `:256-269`: add `registerItems(defs: readonly ItemDef[])` that fills `ALL` and `BY_ID` and throws on a clashing id. `core/items/catalog.ts:221-231` is the same idiom.

Followers: `itemInfo.ts:464` (`ITEM_ICON` lookup with a fallback), `:475-518` (`itemCard` asks a per-item card provider first), `devPanel.ts:110` (`ITEM_ORDER` appended from the registry), `save.ts:98`, `:102-103` (unknown ids: drop the thing and say so, instead of setting the save aside).

Registration must run before `loadSave()`. Module top-level registration, imported from `entry.ts`, guarantees that.

One side effect to plan for: loot filters `ITEMS` by category when a container is rolled (`core/modcar/loot.ts:136`). An item registered into an existing category therefore changes what every unsearched container of that kind holds. Put V3 items in new categories unless that is intended.

Risk: low for the registry itself. `modcar_items.test.ts`, `modcar_loot.test.ts` and `modcar_workshop.test.ts` cover the catalogue's users.

### S2. A registry of held behaviours

New files `src/game/modcar/hands/api.ts` (types) and `hands/registry.ts`.

```ts
/** each source on its own; today E≡LMB and F≡RMB are merged (player.ts:358-370, ModGame.ts:3567) */
export interface Buttons {
  e: boolean; ePressed: boolean;        // KeyE, pad X
  lmb: boolean; lmbPressed: boolean;    // left button, pad RT
  f: boolean; fPressed: boolean;        // KeyF, pad B
  rmb: boolean; rmbPressed: boolean;    // right button, pad LT
  r: boolean; rPressed: boolean;        // KeyR (its `reset` action is ignored on foot today)
  wheel: number;                        // notches this frame
}

export interface HeldCtx {
  readonly player: ModPlayer;
  readonly host: PlayerHost;
  readonly held: NonNullable<Held>;
  readonly btn: Buttons;
  readonly dt: number;                  // may be 0
  readonly ray: THREE.Ray;              // render space
  readonly target: Target | null;       // after the pick
}

export interface HeldMode {
  still?: boolean;        // player.ts:476
  lookHold?: boolean;     // ModGame.ts:3570
  lookScale?: number;     // input.ts:103-108, 167-169
  fov?: number;           // ModGame.ts:3988-3999
  crouch?: boolean;       // FootInput.crouch
  noSwitch?: boolean;     // as `flow` does at player.ts:334
  hide?: { mark?: boolean; hotbar?: boolean; cards?: boolean };
  kick?: { yaw: number; pitch: number; roll: number };   // camera only
}

export interface HeldBehaviour {
  readonly id: string;
  match(h: NonNullable<Held>): boolean;
  /** what it takes from the world while in the hands; E cannot be claimed */
  readonly claims?: readonly ('lmb' | 'rmb' | 'f' | 'r' | 'wheel')[];
  /** a target of its own under the mark; exclusive = nothing else is picked */
  pick?(c: HeldCtx, offer: (t: Target, exclusive?: boolean) => void): void;
  /** every frame in the hands; true = it used its claimed buttons this frame */
  step(c: HeldCtx): boolean;
  mode?(c: HeldCtx): HeldMode | null;
  actions?(c: HeldCtx, out: Action[]): void;     // over the hotbar
  keys?(c: HeldCtx, out: Action[]): void;        // down the right
  slotFill?(h: NonNullable<Held>): SlotView['fill'];
  card?(h: NonNullable<Held>): ItemCard;
  onTake?(c: HeldCtx): void;
  onStow?(c: HeldCtx, why: 'select' | 'drop' | 'seat' | 'modal'): void;
  readonly view?: string;                         // a HeldViewDef id (S7)
}

export function registerHeld(b: HeldBehaviour): void;
```

**Dispatch order per frame, on foot:**

1. Build `Buttons` from the raw sources.
2. If a UI mode captures input (S4): no pick, `onStow('modal')` once, HUD only.
3. `beh = registry.match(held)`. Registered behaviours are tried first; the existing built-ins stay as they are and apply when none matches.
4. **Pick.** The held-part ghost logic (A1–A5) runs unchanged. Then `beh.pick`; an exclusive offer ends the pick there, as B1 does for the spray can. Otherwise the existing candidates B–I and the interactable sources of S3 all compete, and the smallest `dist` wins.
5. **Act**, first match wins:
   1. G held: put down or pack in. If `beh.mode().noSwitch`, G first cancels the action.
   2. An action in progress (the generalised `use`): advance its timeline, deliver its events.
   3. `beh.step(ctx)` for the buttons in `beh.claims`.
   4. World **press**: E always; the left button too unless claimed. The existing chain `:894-966`.
   5. World **holds**: E or the left button, F or the right button, each unless claimed. The existing holds `:1023-1145`.
6. HUD: `beh.actions` then the target's lines; `beh.keys` or `heldKeys()`; `beh.card` or `cardOf`.

**What changes once in `player.ts`:**

| Lines | Function | Change |
| --- | --- | --- |
| 43-53 | `Held`, `heldName`, `heldOf` | unchanged; `heldName` asks the item's behaviour first |
| 56-75 | `Target` | export it (it is module-private today); add one open variant `{ kind: 'ext'; id: string; data?: unknown; dist: number; at?: number }` for a behaviour's own targets |
| 255-256, 358-370 | `primary`, `secondary`, `press`, `release` | keep them as derived values for the probes; add the `Buttons` struct with the source kept |
| 270, 982-1004, 1180-1224 | `use`, `stepUse` | `action: { id, clip, t, dur, slot }`; eat, pill and drink become three clips of a built-in behaviour |
| 333-341 | `select` | call `onStow('select')`; respect `noSwitch` |
| 455-463 | `wheel` | offer the wheel to `beh` if claimed |
| 470-502 | `update` | take `Buttons`; apply `mode()` to `still`, `crouch`; expose `mode` for `ModGame` |
| 563-735 | `pick` | two insertions: `beh.pick` before `:627`; the interactable sources after `:733` |
| 846-871 | `keyOf` | one generic case, `ext:<id>` |
| 873-1147 | `act` | the order above; insertions after `:891` |
| 1295-1297, 1322-1497, 1537-1583 | `cardOf`, `ui`, `heldKeys`, `slotViews` | delegate when the behaviour provides |
| 1597-1612 | `telemetry` | keep the keys; add `slots: string[]` |

In `ModGame.ts`: `2177-2204` and `2221-2224` feed `Buttons`; `2228-2293` gives unhandled keys to the behaviour; `3559-3570` passes `Buttons` and applies `mode.lookHold`; `3982-3999` applies `mode.fov` and `mode.kick`; `3569` loses its `as never`. In `input.ts:103-108` and `:167-169` add `lookScale`. In `pad.ts:146-158` nothing changes if RT stays the left button and LT the right.

**Picking up into a stack or a container.** `items-economy.md` S2 makes a stack one instance and lets a basket, a quiver or an ammunition box hold things. Two places here assume one thing per free slot and must change with it: the gate at `player.ts:659` offers a loose thing only when `freeSlot() >= 0`, and the pick-up at `:895-907` always takes a slot. Both must first ask whether a slot holds a matching stack or a container that accepts the thing. `SlotView` (`hudItems.ts:22-29`) gains a count, and the hotbar's change key at `:160` must include it.

How the seven tools fit:

| Tool | Claims | Notes |
| --- | --- | --- |
| Rifle | lmb, rmb, r, wheel | lmb pressed starts the `fire` clip; rmb held aims (`fov`, `lookScale`, `kick` for sway); r starts `reload`; `slotFill` shows rounds. Needs the world ray (cross-area) |
| Bow | lmb, rmb | lmb held draws (a continuous pose), release looses, rmb lets down |
| Fishing rod | lmb, rmb, wheel | its own exclusive pick on water; lmb held casts, then reels; wheel sets the drag; a HUD widget for tension |
| Knife | none | acts only through an interactable's `with(held)` (S3) |
| Frying pan | none | same, at a stove |
| Binoculars | rmb, wheel | rmb held raises them: `fov`, `lookScale`, `hide.mark`; emits `spotted` events |
| Camera | lmb, rmb, wheel | rmb raises the viewfinder, lmb takes the picture |

Risk: this is the largest change and only the GPU probes cover it. Land it with no behaviour change first, keep the built-ins in place, and run `modcar_hud`, `fuel`, `paint`, `grime`, `stow`, `vitals`, `pad`, `places` and `journey` before and after.

### S3. A registry of world interactables

Keep `GarageDevice` as the contract and extend it with optional members, so every existing device stays valid.

```ts
// garageStub.ts:21-44, extended; re-exported from src/game/modcar/interact/api.ts
export interface Interactable extends GarageDevice {
  /** F or the right button: a second thing to do with it */
  readonly alt?: { readonly word: Text; readonly holdS?: number; readonly off?: boolean; use(): void; holding?(p: number): void };
  /** what E would do with THIS in the hands; the hands keep it unless `consume` */
  with?(held: NonNullable<Held>): { ok: boolean; word: Text; holdS?: number; consume?: boolean } | null;
  useHeld?(held: NonNullable<Held>): void;
  /** goes on while E is held after the hold completes; false = finished */
  channel?(dt: number): boolean;
  /** lit while the mark is on it */
  highlight?(on: boolean): void;
  /** metres taken off its distance when ranking (a small thing aimed at on purpose) */
  readonly rank?: number;
  /** false: not there for the pick now */
  readonly live?: boolean;
}

export interface InteractSource {
  /** append what is within r of (x, z), world metres */
  near(x: number, z: number, r: number, out: Interactable[]): void;
}

export class InteractSet implements InteractSource {
  add(s: InteractSource): void;
  remove(s: InteractSource): void;
  near(x: number, z: number, r: number, out: Interactable[]): void;
  /** by id, among what is near (the tutorial's marker, a replayed event) */
  find(id: string, x: number, z: number, r?: number): Interactable | null;
}
```

Why not `core/interact`'s `Interactable`: its `Actor` is tied to the classic `Hands` and `Inventory`, it offers one word and one button, and it has no card and no way to depend on the held tool. Two of its ideas are worth taking: `channel`, and occlusion with `segmentHits` and `through`.

Changes:

| File:lines | Change |
| --- | --- |
| `ModGame.ts:656-661` | `devices` getter replaced by `readonly interact = new InteractSet()`; the garage, the workshop, places and doors are added as four sources |
| `player.ts:155`, `:719-733` | `PlayerHost.devices` becomes a `near` query into a reused array |
| `player.ts:929-944` | `with()` before `take()`: on `ok`, call `useHeld` and keep the thing unless `consume` |
| `player.ts:1089-1099` | the hold also covers `with().holdS`; continue with `channel(dt)` |
| after `player.ts:1088` | new block: `alt` on F / right button, press or hold |
| `player.ts:784-793` | call `highlight` when the target changes |
| `player.ts:1435-1441` | the `device` case shows the `with` line and the `alt` line |
| `ModGame.ts:4288`, `:4353` | the tutorial's lookups use `interact.find(id, x, z)` |

How the six things fit:

| Thing | Source | Verbs |
| --- | --- | --- |
| Carcass | the hunting module, a spatial hash | E: inspect (its card). `with(knife)`: skin, a hold then a channel. `alt`: lift or drag |
| Forage node | the foraging module, per streamed chunk | E: pick. `live = false` afterwards. `highlight` |
| Stove | a caravan or a camp | E: open the cooking mode (S4). `with(pan)`: put the pan on. `alt`: take the pot off |
| Storage shelf | furniture | E: open the container list (E10). `with(any)`: store it, `consume: true` |
| Blueprint | not an interactable: an item (S1) with a `blueprint` behaviour (S2) | F: learn it, which emits `learned` (S5) |
| Workbench tab | not an interactable: the `bench` device (`workshop.ts:599-625`) opens the bench mode; tabs register with the workbench UI (the crafting area's map) | |

Risk: low. The additions are optional members and one container class.

### S4. A stack of UI modes

One object replaces the special cases for the bench, the list, death and the dev panel. This is the kernel's `ModalStack` (`modgame-lifecycle.md` 7.1); what follows is the shape a mode needs and every site in this area that must consult it.

```ts
export interface UiMode {
  readonly id: string;              // 'bench', 'cargo-list', 'cooking', 'compendium', 'placing'
  readonly freeMouse: boolean;      // pointer lock released, input.lockable = false
  readonly still: boolean;          // walking keys ignored
  readonly aside: boolean;          // no pick, no prompts (player.aside)
  key?(code: string, repeat: boolean): boolean;
  mouse?(button: number, down: boolean): boolean;
  wheel?(delta: number): boolean;
  pad?(button: number, down: boolean): boolean;
  closed?(): void;
}
// game.modes.push(mode), game.modes.pop(id), game.modes.top
```

Sites it replaces: `ModGame.ts:856-868` (`benchMode`), `:2179-2183` (mouse at the bench), `:2222` (wheel in the list), `:2228-2251` (keys for the bench and the list, Escape), `:3557-3558` (`listing`), `:3570` (`lookHold`), `:4261` (the pause card); `pad.ts:119-145` and the `bench`, `benchOpen`, `listing`, `listMove`, `listClose` members of `PadHost`.

Risk: medium. `modcar_pad.test.ts` fixes the pad's behaviour per mode and must keep passing; `modcar_workshop`, `modcar_stow` and `modcar_places` cover the bench and the lists in the browser.

### S5. Game events

The bus itself is the kernel's (`modgame-lifecycle.md` 7.1: `EventBus<GameEvents>`, with `GameEvents` open to declaration merging). This map only lists where this area must emit. Names follow that map where it has one; the last three are additions.

| Event | Where |
| --- | --- |
| `item:taken` | `player.ts:901`; `ModGame.ts:1391`, `:1417` |
| `item:put` (ground, vehicle, device) | `player.ts:955`, `:1246`, `:1263`, `:937` |
| `vehicle:changed` with `what` = `on:<mount>` or `off:<mount>` | `player.ts:1175`, `:1063` already pass it; `ModGame.changed` stops discarding it (`:2516`) |
| `body:ate`, `body:drank` | `ModGame.ts:1237`, `:1247` |
| `vehicle:panel` | `player.ts:916-918`. `cockpit.ts:106-110` and `packIn` (`player.ts:1241`) open panels without telling anyone today |
| `player:entered`, `player:left` | `ModGame.ts:2449`, `:2474` |
| `player:wore` (addition) | `player.ts:1015` |
| `device:used` with its id (addition) | `player.ts:942`, `:1096` |
| `liquid:poured` with litres (addition) | `player.ts:1155` |

Skills, the compendium and the tutorial subscribe; nothing in `player.ts` learns their names.

Risk: low.

### S6. HUD registries

| What | Today | Change |
| --- | --- | --- |
| Key glyphs | `KeyName`, 22 names (`hudItems.ts:11`, `:81-86`) | accept any string; `registerKey(name, html)` for special glyphs (Tab, middle button, pad buttons) |
| Card icons | `CardIcon` (`itemInfo.ts:71`), `ICON_PATH` (`cards.ts:78-93`) | `registerCardIcon(name, svgPath)` |
| Tones | `Tone` (`itemInfo.ts:28`), `TONE_COLOUR` (`cards.ts:11-21`) | `registerTone(name, cssColour)`; `CardBar.colour` already overrides per bar |
| Item icon by category | `ITEM_ICON` (`itemInfo.ts:464`) | from the category registry (S1) |
| Effect chips | `GOOD`, `COLD`, `EFFECT_ZH` (`vitalsHud.ts:50-51`, `:159-167`) | `update` takes `chips: { id; label; tone: 'good' \| 'bad' \| 'cold'; left?: number }[]`; the vitals module builds the list and can add timers |
| Messages | one toast (`ui.ts:260-265`, `:411-414`) | a short queue in `say`, same signature; plus `ui.notify({ icon, text, tone })` for stacked small lines, as `MaterialsHud` already does for materials |
| Widgets | ad hoc | named anchors on `ui.root` (`top-left-below-vitals`, `left-middle`, `bottom-left`, `around-mark`) so ammunition, wind and compass, stance and line tension do not collide with the cards column and the key list |
| Hotbar hints | assume two slots | a helper `otherEmptySlotKey()` used at `player.ts:1388`, `:1462`, `:1565`, `ModGame.ts:4347` |

Risk: low. Keep the existing unions as the registry's initial contents so nothing else changes.

### S7. First-person view: view definitions, timelines, arms

**View definitions.** A registry keyed by the behaviour's `view` id:

```ts
export interface HeldViewDef {
  size?: 'fit' | 'real';                          // 'fit' is today's rule (held.ts:229)
  carry?: { pos: [number, number, number]; euler: [number, number, number] };   // replaces held.ts:264-267
  lag?: number;                                   // replaces held.ts:260
  grips?: { right?: string; left?: string | null };   // marker names; default 'M_grip', 'M_grip_l'
  clips?: Record<string, Clip>;
  /** continuous layers after the built-in ones: aiming, a bow's draw, a rod's bend */
  pose?(s: HeldViewState, out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void;
}
export interface Clip {
  dur: number; loop?: boolean;
  pos?: [t: number, x: number, y: number, z: number][];
  rot?: [t: number, x: number, y: number, z: number][];
  events?: { t: number; id: string }[];           // 'fire', 'eject', 'chambered', 'bite'
}
```

**Timelines.** The player's `action` holds `{ clip, t }`. The same `t` fires the clip's events to the behaviour and is sampled by the view, so logic and picture cannot drift as eating does today. The clip sampler and event stepping are pure numbers and belong in `src/core` with a vitest. This is the plan's "动作时间线加手臂反向运动学，用数据驱动" (`PLAN.md`, 武器与弹药): eight reload mechanisms, the bow, the crossbow and an inspect action become clips, not code.

**Two constraints from the plan.** It sets the grip error at 1 cm or less (`PLAN.md`, 画面升级). That rules out `size: 'fit'` for anything the arms hold: a 1.1 m rifle shrunk to 0.19 m cannot meet it. It also has guns assembled at the bench "with the ghost preview, like fitting a car". `GhostLayer` takes a `GhostSpec` whose `make()` supplies any shape (`ghosts.ts:26-38`, `:78-85`), so it can show gun parts; without `make` it calls `partDef(partId)` and so only knows vehicle parts (`:86-87`).

**What changes once in `held.ts`:**

| Lines | Change |
| --- | --- |
| 123-125 | `setUse` becomes `setAction({ clip, t } \| null)`; eat, pill and drink become three built-in clips with the numbers of `:277-286` |
| 135-210 | `set` looks up the view definition of the held item |
| 213-242 | `fit` honours `size: 'real'`; the marker scan at `:224-226` collects every node named `M_*` with position and rotation |
| 248-381 | the six layers stay; a clip layer and `def.pose` are applied after the carry layer; `carry` and `lag` come from the definition |
| 394-402, 474-480 | generalise `nozzleWorld` and `spoutWorld` into `markWorld(name, outMatrix)`; `SPOUT` and `NOZZLE` (`:31-42`) can stay as fallbacks |
| after 379 | nothing: the arms read `markWorld` |

**Arms.** A new `FirstPersonArms` in its own file, updated right after the held thing:

- Shoulders are fixed points in lagged camera space.
- Hand targets are the world transforms of the held model's grip markers, read through `markWorld` after `HeldThing.update` has finished (`held.ts:379`). A clip may offset a hand (working a bolt, nocking an arrow).
- Each arm is a two-bone solve: with shoulder `S`, target `T`, upper and fore lengths `a` and `b`, clamp `d = |T − S|` to `[|a − b|, a + b]`, get the elbow angle from the cosine rule, and place the elbow on the side of a pole vector pointing down and out.
- With empty hands, or a `size: 'fit'` thing, the arms are hidden; the miniature would not match real hands.
- Sleeves and gloves can take their colours from what is worn (S8).

In `ModGame.ts:4015-4024` replace the fixed calls with a list, `for (const l of this.fpLayers) l.update(dt, cam, this.heldThing, this.player)`, so arms, a muzzle flash, a fishing line or an arrow on the string attach without another edit there. The tool-specific blocks at `:3117-3157`, `:3183-3249` and `:4018-4020` can move into layers later; they do not block V3.

Risk: medium. Real-size things in the main scene will clip into walls and stretch with the field of view. Whether the frame gets a separate view-model pass is the rendering area's decision (Open question 2).

### S8. Stance, worn things and what the player gives off

- **Crouch.** Set `FootInput.crouch` from a key in `player.update` (`:477-480`). C is taken on foot by the view toggle (`ModGame.ts:2317-2320`); either guard that toggle with `this.seated` or use another key. The walker's crouch is already tested.
- **Worn things.** `ModPlayer.worn: Partial<Record<WearSlot, ItemInstance>>`, a behaviour for `wear` items (F held puts it on, as a backpack does), and `warmth()` replacing the constant at `ModGame.ts:1203`. Saved beside `pack`. The plan adds an accessory slot and a "pockets" attribute that adds hotbar slots (`PLAN.md`, 衣物). So the slot count must come from everything worn, not from the pack alone: `wearPack` (`player.ts:314-330`) becomes a general `resizeSlots(n)` with the same two refusals, and `restoreHands` (`ModGame.ts:1492-1496`) uses it.
- **Signals for the ecology.** A read-only struct refreshed in `player.update`: position, velocity, `crouched`, `swimming`, `grounded`, speed, the noise of the last action, the held item id, what is worn. Animals read it with the wind from `env.state`. This keeps the hunting module out of `ModPlayer`'s fields.

Risk: low.

### Fit with the sibling maps

`modgame-lifecycle.md` 7.1 proposes the kernel that hosts these registries, and lists eleven edits to `player.ts` (its B1–B11). The two maps agree on the structure: no fourth `Held` kind; a held-behaviour registry asked before the built-ins; an interaction registry asked at the end of `pick()`; one open `Target` variant with a `keyOf` case; a modal stack; an event bus; crouch as an input; the `as never` removed. Use the kernel's registries and names. Five points differ, and each needs one decision before the contracts are frozen:

| Topic | Kernel (7.1) | This map | Recommendation and why |
| --- | --- | --- | --- |
| Can a behaviour take E? | `button('lmb' \| 'rmb' \| 'e' \| 'f', …)` may consume any of them | `claims` excludes E | Keep E unclaimable. Otherwise every tool must re-implement doors, pick-up and getting in, or the player is stuck with a rifle in the hands (Risk 3) |
| When are buttons dispatched? | At the DOM event, in `bindInput` (its A26, B8) | Per frame, from a `Buttons` snapshot with edges, inside `player.update` | Per frame. The pad (`pad.ts`), the probes (`player.press()`, `game.rightButton`, `player.primary`) and `simulate()` do not pass through DOM events; and only inside `update` is the order against the pick, G and a running action defined. This is what `primaryEdge` already does |
| What a behaviour says about the view | `locksMove`, `locksLook` (fixed flags), plus global `view.fovBias` and `view.mods` | `mode()` each frame: `still`, `lookHold`, `lookScale`, `fov`, `crouch`, `noSwitch`, `hide`, `kick` | Per frame. Aiming, a drawn bow and raised binoculars change these from moment to moment. Look sensitivity has no hook in the kernel; add `lookScale` to `InputManager` |
| Who draws the held thing | `ownView`: the behaviour draws everything, `HeldThing` shows nothing | `HeldThing` stays the one owner; view definitions, clips and arms are data and layers (S7) | S7 as the rule, `ownView` as the escape hatch. One pipeline keeps the lag, the materials, the markers and the dock and pin layers, and matches the plan's "data-driven, not tuned per gun" |
| One interaction, several verbs | `Interaction` has one `press` and one `hold` with a `button` | `Interactable` has E press or hold, `alt` on F, `with(held)` that keeps the tool, `channel` | A carcass needs three at once: E inspect, E held with a knife to skin, F held to drag. Let `hold` be a list, or take S3's members. Also keep `channel` for work longer than a hold, and a ranking nudge for small things |

Two things only this map covers: the HUD hooks a behaviour needs (`actions`, `slotFill`, `card`, `onTake`, `onStow`, and the registries of S6), and the first-person view (S7).

`items-economy.md` S2 answers what a stack is: one instance with a count `n`; container items hold a list `inside`; named materials are counters in the stash. Its S6 defers the use, interaction, mode, event and worn-thing seams to this map and to the kernel.

### Order and ownership

1. One owner lands S1–S6 with no behaviour change, then S7's `held.ts` part and S8. During that work nobody else edits the eight files named at the top of this section, nor the `ModGame.ts` ranges listed in each seam.
2. After that, a V3 module adds files only in its own folders (pure logic under `src/core/<system>/`, its behaviours, interactables and HUD under its game folder) and registers them through the kernel's module manifest (`modgame-lifecycle.md` 7.1).
3. The manifest is the only shared file. Keep it one line per module in alphabetical order, or generate it, so concurrent additions merge cleanly.
4. Game logic (ballistics, reload state, a fishing fight, the clip stepper) goes in `src/core` with vitest; the files under `src/game` stay thin. That is the only way to get this area under tests that run without a GPU.

---

## 8. Performance notes

None of this was profiled; the costs are read from the code. The one measurement: the vitest that builds a card for every part in the catalogue, with assertions, takes 16 ms in total on a cold run, so one card is well under 0.2 ms.

Per frame on foot:

1. **Bounds of every fitted part.** With empty hands near a vehicle, `pick()` calls `boundsEach` for each fitted mount (`player.ts:672-686`). `boundsOf` and `boundsEach` run `Box3.expandByObject` on the part's subtree, which updates world matrices and transforms eight corners per mesh (`carView.ts:1676-1702`). A frame has 19 (motorcycle) to 36 (sedan) mounts in its data file (`core/modcar/data/mounts/*.json`), plus the axle mounts `withAxles` adds (`core/modcar/frames.ts:182`). `panels()` does the same for panels when something is held.
2. **`near()` allocates an array** on each call, up to five calls a frame (`:550`, `:578`, `:649`, `:669`, `:814`).
3. **`cargo.aim()` with anything in the hands**: per near vehicle a new inverse matrix and two vectors; per zone a ray march in 2 cm steps; `placedIn()` allocates matrices per stowed thing (`cargo.ts:221-245`, `:297-344`). The first aim into a zone renders the vehicle to a target and reads the pixels back synchronously (`cargo.ts:137-216`), which is a hitch; `ModGame.changed` invalidates those floors on every fit and removal (`ModGame.ts:2513`).
4. **Ghosts.** `showGhosts()` rebuilds the list of specs with key strings every frame (`:804-842`). Each ghost is a cloned model under its mount, not an instance.
5. **Devices.** `ModGame.devices` and `tanks` build new arrays on each access while places or doors are live (`:656-667`). The workshop's device `x`, `y`, `z` getters each allocate a vector and walk a world matrix (`workshop.ts:504-517` and the three like it). `card` getters build a new card each frame while aimed.
6. **HUD strings.** Each frame builds the action array, the key array, both HTML strings (built, then compared: `hudItems.ts:173-189`), the slot views and a `JSON.stringify` key for the hotbar (`:160`).
7. **Cards.** `cardOf(held)` runs every frame, even with the cards hidden, because the argument is evaluated before `showCards` looks at `on` (`player.ts:1493`). Each visible card is `JSON.stringify`-ed every frame in `structureOf` (`cards.ts:152-154`, `:219`). An engine in the hands means a 33-point curve and a peak-power scan per frame. Only `vehicleCard` (0.25 s) and the fit comparison are cached. The cost is garbage, not time.
8. **Vitals HUD** writes about ten attributes and styles every frame whether or not they changed (`vitalsHud.ts:136-173`).
9. **Loose things** are picked by a linear walk of the whole list once or twice a frame (`loose.ts:633-651`).
10. **`objective()`** allocates closures and vectors every frame in the garage (`ModGame.ts:4266-4368`).
11. **`navigator.getGamepads()`** is called twice a frame (`input.ts:140`, `pad.ts:92`).

Draw calls: the held thing is its model's meshes, unmerged, in the main pass only, with its own `CarMaterials` instance.

For V3: interactables must come through `InteractSource.near` backed by a spatial index, not a flat list; arms add two skinned or rigid draws; each behaviour should own its HUD strings behind a dirty flag.

---

## 9. Open questions

1. **Which interactable contract is canonical?** This map recommends extending `GarageDevice` (S3). If another map recommends adopting `core/interact`, the orchestrator has to choose before anyone builds a carcass or a stove.
2. **Arms and scale.** Do held things stay miniature with real-size arms only for V3 tools, or does everything become real size? Does the frame get a separate view-model pass (own depth range, fixed fov)? The rendering map has to answer; `Frame.render(scene, camera, time)` takes one scene and one camera today.
3. **Countable things: answered elsewhere, with a consequence here.** `PLAN.md` (技术架构) keeps "every thing is a physical thing" and stacks small things in container items; `items-economy.md` S2 specifies a count `n` on the instance, `inside` for containers, and counters for named materials. What stays open in this area: with at most six slots, which containers count as "in the hands" for an automatic pick-up, and what E does when two of them accept the thing.
4. **Keys.** R for reload does nothing on foot today. Crouch on C needs the view toggle guarded. Only d-pad Up, Left and Right are free on the pad on foot. A full V3 key map has not been drawn.
5. **Should E stop equalling the left button everywhere?** The help card teaches "E / 左键" (`ui.ts:105`). S2 keeps them equal unless a held thing claims the mouse.
6. **Walking inside a vehicle.** Who owns the third player mode, and does the pick then run in the vehicle's moving frame? Not designed here.
7. **Using things from the seat.** Eating, drinking, binoculars and the camera do not work while seated because `player.update` is not called. Is that wanted?
8. **Determinism and multiplayer.** `docs/DESIGN_V2.md` §10.3 plans host-authoritative multiplayer and asks for code to be written under that constraint now; `core/interact` reports every use as a replayable `UseEvent` for that reason. `PLAN.md` (技术架构) says no multiplayer this round, but all new state is to be written under those constraints, and play logic uses seeded hashes only. ModCar's interaction logic lives in `src/game`, reports no events and uses `Math.random` (Risk 24). Does the foundation phase have to move the existing pick and dispatch under those rules, or only new behaviours?
9. **The stale `lookVehicle`** after the early returns in `pick()` (3.4): read from the code, not reproduced in the running game.
10. **Tool uids after a load** (Risk 14): read from the code, not reproduced. Save v2 should reserve them.
11. **Per-frame costs** in section 8 are inferred. `harness/shots/modcar_perf.mjs` exists and was not run.
12. **Languages.** Should V3 strings follow `Text { zh, en }` and `ui.lang`, or stay Chinese like `player.ts`?
