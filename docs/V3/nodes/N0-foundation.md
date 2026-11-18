# N0 foundation, part A: the kernel (module seams)

What this is: the smallest set of seams the first V3 system (foraging, N1) needs, shaped so that later systems
reuse them. After this package a gameplay system is a folder, `src/game/modcar/v3/<system>/index.ts`, that the
game finds by itself and that plugs in without editing `ModGame.ts`, `save.ts`, `entry.ts` or `devPanel.ts`.
No such folder exists yet: with none, the game behaves exactly as before (section 8 says how that was checked).

Part B of N0 (stacks, containers, the open item catalogue) is a separate package and is not described here.

Line numbers are for the source as this package leaves it.

## 1. What was opened

| Seam | What a system gets | Where |
| --- | --- | --- |
| Modules | a folder is found and installed by itself | `src/game/modcar/kernel/modules.ts` |
| Context | one object with the kernel and the parts of the game a system may use | `src/game/modcar/kernel/context.ts` |
| Systems | `init`, three hooks in the frame, `dispose`; error isolation; timing against a declared budget | `src/core/kernel/systems.ts` |
| Events | a typed bus over an open list of events | `src/core/kernel/events.ts` |
| Save slices | its own versioned part of the save, read back tolerantly | `src/core/kernel/slices.ts` |
| World clock | persistent world time: `worldSeconds`, `day`, `hour` | `src/core/kernel/clock.ts` |
| Interactables | things in the world the mark finds and E works | `src/game/modcar/kernel/interact.ts` |
| Developer tabs | a tab of its own in the developer's panel | `src/game/modcar/kernel/devTabs.ts` |

The four files under `src/core/kernel/` are pure (no three, no DOM) and are tested in Node. The four under
`src/game/modcar/kernel/` name the game's classes; only `devPane()` in `devTabs.ts` touches the DOM.

## 2. The interfaces in brief

### Modules — `kernel/modules.ts`

```ts
interface GameModule {
  id: string;                          // lower-case letters, digits, _ and -; by convention the folder's name
  systems?: System<GameContext>[];
  slices?: SaveSlice[];
  interact?: InteractSource[];
  devTabs?: DevTab[];
  setup?(ctx: GameContext): void;      // after the lists above are registered; the vehicles are not there yet
}
```

`MODULES` is `collectModules(import.meta.glob('../v3/*/index.ts', { eager: true }))`: every folder's default
export, sorted by id (never by what the file system says); two modules with one id, or a file whose default
export is not a module, throw and name the files. `installModules(modules, ctx, onError)` registers each
module's lists and then calls its `setup`; a module that throws is reported and the next is still installed.

### Context — `kernel/context.ts`

`GameContext` is the game itself (`ModGame implements GameContext`), narrowed: `events`, `systems`, `slices`,
`clock`, `interact`, `devTabs`, and of the game `params`, `core`, `env`, `world`, `player`, `vehicles`,
`seated`, `loose`, `ui`. It is small on purpose. **A later node that needs more of the game adds a member to
the interface; when `ModGame` already has a public member of that name and type (`ground`, `input`, `cargo`,
`body`, `stock`, `sound()`, `place`, …) nothing else changes.** The file also declares the events the game
emits (section 5).

### Systems — `core/kernel/systems.ts`

```ts
interface System<C> {
  id: string;
  after?: string[];                    // ids that must be set up, and run in every phase, before this one
  budget?: { cpuMs: number };          // processor time a frame, the three phases together
  init?(ctx: C): void | Promise<void>;
  preStep?(dt: number, ctx: C): void;
  step?(dt: number, ctx: C): void;
  lateUpdate?(dt: number, ctx: C): void;
  dispose?(): void;
  telemetry?(): Record<string, unknown>;
  harness?: Record<string, (...args) => unknown>;   // for test scripts: game.systems.harness(id, name, ...args)
}
```

`SystemRegistry<C>`: `add` (a duplicate id, a bad id, or adding after `init` throws); `ids()` gives the order —
the order of registration, a system moved after those its `after` names (an unknown id or a circle throws with
a message naming the systems); `init(ctx)` sets the systems up one after the other, each awaited — one whose
`init` throws or rejects is reported, marked failed and never run, and `init` itself only rejects for a mistake
in the order; `preStep` / `step` / `lateUpdate` do nothing until `init` has finished, wrap every call (a throw
is reported as id, phase, error and the frame goes on) and time it with the clock handed to the constructor;
`dispose()` runs in reverse order, once; `telemetry()` gives per system `{ ms, max, budgetMs, over, frames,
overFrames, errors, failed, own }` (`ms` smoothed over about twenty frames, `max` the longest since the start
or `resetTimings()`, each as `{ pre, step, late, total }`; `over` when the smoothed total is above the budget).

In the browser the timer (`performance.now()`) ticks in tenths of a millisecond. One frame's reading of a
system is therefore 0 or 0.1 ms; the smoothed value is still a fair estimate of the real time (it is right on
average), but `max` and `overFrames` are only good to a tenth of a millisecond. Judge a budget of a few tenths
by `ms.total` over some hundred frames, or by the system's own measurement in Node.

### Events — `core/kernel/events.ts`

`EventBus<GameEvents>`: `on(type, fn)` returns the unsubscribe function; `emit(type, payload)` calls the
listeners in the order they subscribed, before it returns; a listener that throws is reported to `onError`
and the others are still called; a listener added during an emit is first called for the next one, one removed
is not called again. `has(type)` lets an emitter on a hot path skip building a payload. `GameEvents` is an open
interface: a folder adds its events by declaration merging next to the code that emits them.

### Save slices — `core/kernel/slices.ts`

```ts
interface SaveSlice<T> {
  id: string; version: number;         // a whole number from 1
  snapshot(): T | undefined;           // JSON only; undefined: nothing to keep; must not change anything
  restore(data: T, fromVersion: number): void;
  migrate?(data: unknown, fromVersion: number): T;
  clear?(): void;                      // back to how a new game starts
}
```

In the save the slices are `slices: { [id]: { v, d } }`, keys in alphabetical order. `SaveSliceRegistry.restore`
is tolerant: a slice the record lacks is cleared; an older version goes through `migrate`; **a newer version
than the code knows, and an id nobody registered, are not read: the record is carried unchanged into every
later snapshot** (a save written with a system that is absent today, or by a later build, is not destroyed)
and reported; a slice whose `restore` or `migrate` throws is reported and cleared and the others are still
read; a slice whose `snapshot` throws is reported and written as it last was. `clear()` is a new game.

### World clock — `core/kernel/clock.ts`

`WorldTime { worldSeconds, day, hour }` is what a system reads (`ctx.clock`); plain fields. `worldSeconds` is
game time since the journey began, 86,400 to a game day, saved, never backwards. `day` counts midnights since
the calendar day the journey began on; `hour` is the hour of the day. Section 6 says how it is driven.

### Interactables — `kernel/interact.ts`

```ts
interface InteractSource { near(x: number, z: number, r: number, out: GarageDevice[]): void }
```

The contract for one thing is the existing `GarageDevice` (`garageStub.ts`): a point and radius or its own
`hit`, a `word` for the prompt, `use` on a press or `holdS` + `holding(p)` for E held, `take` / `useWith` for
the thing in the hands, a `card`. A source appends the devices within `r` of where the player stands;
`InteractSources` is the set (`add` returns the remove function; a source that throws is reported and left
out). A device's `id` must be unique among everything near: begin it with the system's id (`forage:1234`).

### Developer tabs — `kernel/devTabs.ts`

```ts
interface DevTab {
  id: string; title: string; order?: number; sub?: string; hint?: string;
  build(pane: DevPane): void;          // the first time the tab is shown
  tick?(): void;                       // a few times a second while it shows
}
```

`DevPane` gives the tab's element, a scrolling `body`, and `heading`, `note`, `buttons`, `box`, `message`: the
pieces the built-in tabs are made of (the classes of `devPanes.ts`), so a new tab looks like the others; a
`data-tip` attribute gets the panel's help bubble. The panel shows its eight tabs exactly as before and the
registered ones in a second row under them, which is only there when there is one.

## 3. Every hook in the existing files

`src/game/modcar/ModGame.ts`

| Line | What |
| --- | --- |
| 104–111 | imports of the kernel |
| 244 | `ModGame implements …, GameContext` |
| 423–433 | the kernel's objects: `events`, `systems` (timed with `performance.now()`), `slices`, `clock`, `interact`, `devTabs` |
| 437–441 | `slicesRead` (the slices have taken their parts of the save back), `kernelLog` (the last report and how many), `onKernelError` (told of each) |
| 452 | the constructor's fifth parameter: the modules to install |
| 513–514 | `startKernel(modules)`; `ready = populate().then(() => startSystems())` |
| 520–534 | `startKernel`: the reports wired, `clock.begin(hour)` or the save's clock, `installModules` |
| 541–551 | `startSystems`: `await systems.init(this)`; with a save `slices.restore(save.slices)` and `game:restored`, without `game:new` |
| 554–564 | `kernelReport`: counted, said once per message on the console and as a toast, handed to `onKernelError` |
| 567–572 | `tickClock`: `clock.sync(env.sky, this)`; `clock:day`, `clock:hour` |
| 578–580 | `dispose()`: the systems, in reverse |
| 583–595 | `kernelTelemetry()` |
| 1362 | `consume`: `body:ate` |
| 1368–1373 | `drank`: `body:drank` (only when heard; one payload reused) |
| 1678–1682 | `snapshot`: `slices` (when there is any; until `startSystems` is through, the record the save was loaded with) and `clock` into the save |
| 1791–1793 | `newGame`: `slices.clear()`, `clock.begin(hour)`, `game:new` |
| 1801 | `newGame`: `dispose()` before the page is opened again |
| 3647 | `step`: **`systems.preStep(dt, this)`** — after the autosave, before the body |
| 3751 | `step`: **`systems.step(dt, this)`** — after `loose.update`, before sparks, dust and the views |
| 4239–4240 | `updateViews`: **`tickClock()`, `systems.lateUpdate(dt, this)`** — after the garage's exposure, before `ui.update` |
| 4769 | `telemetry()`: the `kernel` key |

`src/game/modcar/entry.ts`: 24 the import of `MODULES` (so discovery precedes line 42, `loadSave()`); 62–63 the
modules handed to the game (and a test script's own, section 7); 744 `__rt.kernel()`; 749–752 the kernel's
reports become `__rt.lastError`.

`src/game/modcar/save.ts`: 88 `slices?: SliceRecord`, 93 `clock?: ClockSave` in `SaveV1`. `loadSave` does not
look at either.

`src/game/modcar/player.ts`: 158 `PlayerHost.interact?`; 722 the device loop now calls `markDevice`; 723–732
the sources asked (skipped when the set is empty); 737–754 `nearDevices` and `markDevice` (the old loop's body,
unchanged).

`src/game/modcar/devPanel.ts`: 61 `DevHost.devTabs`; 159–160 the second row's two CSS rules; 253–256 the
registered tabs added; 275–335 `tabClicked`, `addTab`, `buildOwn`, `tickOwn`; 337–357 `showTab` takes a
registered id; 362–366 the header for a registered tab; 451–452 its `tick`.

`garageStub.ts` is unchanged: `GarageDevice` is used as it is.

## 4. The order of start-up, and of one frame

Start-up:

1. **Modules.** `entry.ts` imports `kernel/modules.ts`; the bundler has turned the glob into static imports, so
   every `v3/*/index.ts` and everything it imports is evaluated here, before the entry's own code.
2. **Content.** Whatever a module registers at its top level (N0-B: items into the catalogue) is therefore in.
3. **Save.** `loadSave()` reads and checks the save against the catalogues. `slices` and `clock` are not checked.
4. **Construction.** `new ModGame(…, MODULES)`: the renderer, the environment, the garage, the world, the
   player; then `startKernel`: the world clock begun at the page's hour or restored from the save, each module's
   systems, slices, sources and tabs registered, its `setup(ctx)` called. No vehicle exists yet.
5. **`populate()`.** The models, the vehicles and the things lying about, from the save or as a new game.
6. **`startSystems()`.** `systems.init(ctx)` in order, each awaited: a system can enumerate `ctx.vehicles`.
   Then, with a save, `slices.restore(save.slices)` and `game:restored`; without, `game:new`. Exactly one of
   the two is emitted per page.
7. **`ready` resolves.** The first frame.

One frame (`ModGame.step`, then `render`); the hooks in bold:

1. place, input, pad, assists, `time += dt`, the autosave
2. **`systems.preStep`**
3. the body, the workshops, grime, wrecks and places, the player (walk, pick, act), the vehicles, cones, `loose.update`
4. **`systems.step`**
5. sparks, dust, the checklist, the garage, then `updateViews`: the vehicles' views, the floating origin, the
   camera, the held thing, world streaming, `env.update`, splashes, the garage's exposure
6. **the world clock, then `systems.lateUpdate`**
7. `ui.update`, the HUD, audio; `loose.follow`, glints

What follows from these places:

- `preStep` and `step` see **last frame's** weather (`env.state`), hour and world time; `lateUpdate` sees this
  frame's. The clock's events are emitted between `step` and `lateUpdate`.
- `step` runs before the floating origin may move: place what is drawn (`core.place`) in `lateUpdate`.
- `lateUpdate` runs before `ui.update` and the audio: what it writes to the HUD or asks of the sound is in the
  same frame.

## 5. The events the game emits now

| Event | Payload | When |
| --- | --- | --- |
| `game:new` | — | after the systems' `init` on a page that read no save (a test page too); and from `newGame()` once the slices and the clock are cleared, just before the page is opened again |
| `game:restored` | — | after the systems' `init`, once every slice has been restored from the save |
| `clock:hour` | `{ day, hour, crossed }` | the world clock passed a whole hour; several at once (the hour set by hand) are one event |
| `clock:day` | `{ day, crossed }` | midnight passed; emitted before that frame's `clock:hour` |
| `body:ate` | `{ item }` | `ModGame.consume`: something eaten or taken |
| `body:drank` | `{ liquid, litres }` | `ModGame.drank`: **every frame** while a drink flows, with that frame's litres; the payload object is reused |

The other events the maps list (`vehicle:*`, `item:*`, `player:*`, …) are not emitted yet: the node that first
needs one adds the emit and its declaration.

## 6. How world time is tied to the hour

The environment's `DayClock` stays the master of the hour of the day, unchanged: the hour is a function of the
session's seconds, the clock's offset and its uneven day (dawn and dusk slow, night quick), and the developer's
panel acts on it as before (time speed by `advance`, the day's length, the hour set by hand).

The world clock is slaved to it. Once a step, right after `env.update` has fixed this frame's hour, `tickClock`
calls `clock.sync(env.sky, game)`: the clock moves forward by the way round the dial from its own hour to the
hour shown, times 3,600. So:

- it passes exactly as the hour does: 86,400 world seconds for each 24 hours of the hour hand (2,400 real
  seconds at the default day length), unevenly within the day, not at all while the panel holds time still;
- **the hour set by hand moves it forward by the forward difference**: set from 18:00 to 15:00, 21 hours pass and
  it is the next day. Dragging the panel's hour slider backwards therefore passes a day at every step of the
  slider; a preset button is one jump;
- an hour hand that comes back by less than a millionth of an hour (rounding) is held, not taken for a day;
- **a step of negative seconds is waited out.** The live loop in `entry.ts` (779–785) takes `performance.now()`
  when it starts and from then on the time stamps of its frames, with no lower bound on their difference; a
  frame asked for right after the main thread has been busy carries a time stamp from before that (in this
  browser: 39 of 40 trials, by as much as the busy stretch lasted), so the game's first live frame can be a step
  of negative seconds. The session's time, and with it the hour, then stands a little behind where it was. The
  clock is told the session's time too and does nothing until that has caught up; before it was, one live page
  of `modcar_kernel` began its journey a whole day on. (The negative step itself is an old defect of the loop
  and is left as it is: for one frame the whole game is stepped backwards by up to the length of the last task
  of start-up.)
- a new journey begins the clock at the page's hour (`worldSeconds` 0, day 0); a save holds
  `clock: { day, hour, start }` and the clock goes on from it, the environment's hour being restored from the
  save's `hour` as before; a save without `clock` begins it at the saved hour.

`ModGame.time` (seconds since the page loaded) is unchanged and still drives the weather's schedule and the shaders.

## 7. Adding a system

A folder with an `index.ts`. Nothing else is edited.

```ts
// src/game/modcar/v3/forage/index.ts
import type { System } from '../../../../core/kernel/systems';
import type { GameContext } from '../../kernel/context';
import type { GameModule } from '../../kernel/modules';

declare module '../../../../core/kernel/events' {
  interface GameEvents { 'forage:picked': { kind: string } }
}

let picked = 0;
const forage: System<GameContext> = {
  id: 'forage',
  budget: { cpuMs: 0.2 },
  init: (ctx) => void ctx.events.on('clock:day', (e) => console.log(`day ${e.day}: the plants bear again`)),
  step: (_dt, ctx) => void (ctx.seated ? 0 : ctx.player.walker.x),   // grow or hide what is near the player
  lateUpdate: (_dt, ctx) => void ctx.core.origin,                    // place what is drawn: ctx.core.place(mesh, x, y, z)
  telemetry: () => ({ picked }),
  harness: { pick: () => ++picked },
};

export default {
  id: 'forage',
  systems: [forage],
  slices: [{ id: 'forage', version: 1, snapshot: () => (picked ? { picked } : undefined), restore: (d: { picked: number }) => void (picked = d.picked), clear: () => void (picked = 0) }],
  interact: [{ near: (_x, _z, _r, _out) => {} }],                    // push the plants within r: each a GarageDevice
  devTabs: [{ id: 'forage', title: '采集', build: (pane) => void pane.note(`摘了 ${picked} 次`) }],
} satisfies GameModule;
```

A complete one, with a migration, a device that wants E held and a tab with buttons, is
`harness/sim/v3/example/index.ts`; `harness/sim/v3_module.test.ts` plays it from a new game to a save, a
reload, a midnight and a new game with `harness/sim/v3/fakeGame.ts`, a stand-in that drives the kernel in the
real game's order. A system's pure logic goes under `src/core/v3/<system>/` with its own tests; its index and
views go in the folder above.

Rules a system must keep (each comes from how the frame is built, or was measured here):

- Stand `dt = 0`: the test hook's `simulate(0)` runs two steps of no seconds. Never divide by `dt`.
- Read `ctx.world`, `ctx.seated` each time; do not keep them.
- Refer to a vehicle in anything saved by `build.uid`, never by its index.
- Import the game's classes as types only. A module that imports `ModGame` as a value closes a circle of imports.
- Events are for things that happen. One emitted every frame says so, reuses its payload and asks `has()` first.
- Randomness that matters comes from a seed hash (`core/math/rng.ts`), never `Math.random()`.
- No allocation in the three hooks or in `near()`. Two things that allocate without looking like it, both measured
  in `harness/sim/v3_kernel.test.ts` and `v3_module.test.ts` with `harness/sim/v3/heap.ts`:
  a list emptied with `list.length = 0` lets go of its store, and the next `push` allocates a new one — empty a
  reused list by popping; and a fraction handed to, or returned from, a function the engine has not folded in is
  put on the heap — in a hook, pass the object that holds the number, not the number.
- A slice that holds part, item or tool instances must reserve their uids itself in `restore` (`reserveUids`,
  `reserveItemUids`): `loadSave` only reserves what it walks (section 9).

Testing a system in the real game before it has a folder, or with a fault injected: a script sets
`window.__rtModules = [module]` before the page's scripts run (`context.addInitScript`), and `entry.ts` installs
those after the game's own. `harness/shots/modcar_kernel.mjs` does this with a probe module.

## 8. What was checked

- Node: `harness/sim/v3_kernel.test.ts` (the four pure parts; that the per-frame calls allocate nothing; what
  they cost), `v3_module.test.ts` (discovery, installing, the sources, the tabs, the example module played),
  `v3_save.test.ts` (the save through the real `writeSave` / `loadSave`, which run in Node with the browser's
  storage stood in for by a map: an old save without slices, a round trip, a carried unknown slice, a newer
  one, one that throws, slices and a clock that are rubbish).
- The cost with no system registered, in Node 24 on the development machine: about ten nanoseconds a frame for
  the three hooks and the world clock, and no allocation. With twelve systems that do nothing, three phases
  each: about seven microseconds a frame, nearly all of it the 39 readings of the timer, whose numbers the
  engine partly puts on the heap (about 200 bytes a frame). None of this is a measurement of the game on a GPU.
- Browser, software renderer (functional only): `modcar_journey`, `modcar_save`, `modcar_restart`, `modcar_dev`
  before the first edit to the game's files and after the last — the same steps pass and the journey prints the
  same lines; `modcar_kernel` tries every seam in the real game with a probe module.

## 9. Left for later nodes, on purpose

- **Stacks, containers, freshness, the open item catalogue, unknown items dropped instead of the save set
  aside**: N0-B. Until then `loadSave` still sets the whole save aside for one unknown part or item id.
- **Uid reservation for instances kept in slices.** `loadSave` reserves the uids it walks (vehicles, wrecks,
  places, loose, hands, pack), before the game exists; slices are restored later. A slice that stores instances
  reserves their uids in its own `restore` (rule above); a hook on the slice (`uids(data)`, as the lifecycle map
  proposes) belongs with N0-B's walker over every holder.
- **Held-tool behaviours, first-person arms, the buttons told apart** (N3); **UI modes / the modal stack** (N2);
  key bindings and HUD registries; shelters and body modifiers (N4); the hitch (N11).
- **The rest of the events** (section 5), and `GameContext` members beyond the fifteen it has.
- **`alt`, `with`, `channel`, `highlight` on interactables** (player-interaction.md S3): `GarageDevice` as it
  is covers a press, a hold, the held thing given to it, and a card. The garage, the workshop, the places and the
  doors still reach the player through `devices`, not through `interact`; a source's devices are not in
  `game.devices`, so `__rt.useDevice(id)` does not find them (a system's harness functions do that).
- **Draw-call and triangle budgets** per system: `budget` holds `cpuMs` only; the render nodes (N8) add the rest.
- **Save v2** (a head and slices, heavy slices in IndexedDB, restore points by reference): the slices live in
  the one `SaveV1` blob in localStorage, and each restore point is still a whole copy of it. A slice that fails
  to restore is cleared and its record is not set aside anywhere (the restore points still hold it for a while).
- **A queue for `ui.say`**, a seeded `rng(stream)` on the context, `sound()` on the context: added by the node
  that first needs them (the last two are one line each in `context.ts`).
- **Timing every frame.** The registry reads the timer once per system and phase, every frame. If the readings
  ever matter on the target hardware, sampling one frame in a few is a change inside `systems.ts`.
- **A save written while the page is still loading.** A kept page that is hidden or closed after its vehicles
  are back but before its first step writes its save then (`visibilitychange`, `pagehide`). The slices are safe
  through that window (the record the save was loaded with is written again), and the clock is restored at
  construction. The wrecks and the places are not: they are made on the first step, so such a save has neither
  `wrecks` nor `places`. That is an old defect, found by reading while closing the window for the slices, and
  left as it is.
- **A rejected `ready`** (the lifecycle map's R18) is as it was: `populate()` rejecting still leaves the page
  waiting. The kernel adds no new way for it to reject: `startSystems` never does. A system whose `init` returns
  a promise that never settles does hold `ready` back for good, though: an `init` must finish.
