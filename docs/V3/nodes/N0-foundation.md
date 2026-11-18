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
| Modules | a folder is found and installed by itself | `src/game/modcar/kernel/modules.ts`, `discovery.ts` |
| Context | one object with the kernel and the parts of the game a system may use | `src/game/modcar/kernel/context.ts` |
| Systems | `init`, three hooks in the frame, `dispose`; error isolation; timing against a declared budget | `src/core/kernel/systems.ts` |
| Events | a typed bus over an open list of events | `src/core/kernel/events.ts` |
| Save slices | its own versioned part of the save, read back and written tolerantly | `src/core/kernel/slices.ts` |
| World clock | persistent world time: `worldSeconds`, `day`, `hour` | `src/core/kernel/clock.ts` |
| Interactables | things in the world the mark finds and E works | `src/game/modcar/kernel/interact.ts` |
| Developer tabs | a tab of its own in the developer's panel | `src/game/modcar/kernel/devTabs.ts` |

The game holds these through one object, `Kernel` (`src/game/modcar/kernel/kernel.ts`): the six registries and
what is done with them at the game's fixed moments (section 2). `ModGame` calls it; so does the tests' stand-in
for the game, which is how the glue itself is tested in Node.

The four files under `src/core/kernel/` are pure (no three, no DOM) and are tested in Node. The files under
`src/game/modcar/kernel/` name the game's classes as types only and run in Node too, with two exceptions:
`devPane()` in `devTabs.ts` touches the DOM when the panel calls it, and `discovery.ts` needs the bundler.

## 2. The interfaces in brief

### Modules — `kernel/modules.ts`, `kernel/discovery.ts`

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

`MODULES` (`discovery.ts`) is `collectModules(import.meta.glob('../v3/*/index.ts', { eager: true }))`: every
folder's default export, sorted by id (never by what the file system says); two modules with one id, or a file
whose default export is not a module, throw and name the files. `discovery.ts` is a file of its own because
`import.meta.glob` exists only under the bundler: **only `entry.ts` imports it.** Everything else — the kernel,
the stand-in game, a `tsx` script — imports `modules.ts`, runs in plain Node, and does not evaluate the game's
real modules.

`installModules(modules, ctx, onError)` registers each module's lists and then calls its `setup`; a module that
throws is reported and the next is still installed. It returns what each module brought (`ModuleParts`: the
ids of its systems and slices, those its `setup` registered by hand among them).

### Kernel — `kernel/kernel.ts`

`new Kernel({ now, say?, out? })` makes the six registries (`events`, `systems`, `slices`, `clock`, `interact`,
`devTabs`) and wires every one of their reports into `report`. Then, at the game's moments:

| Call | When | What |
| --- | --- | --- |
| `install(modules, ctx, hour, saved)` | the game is being constructed | the clock begun at `hour` or taken back from `saved.clock`; the modules installed |
| `start(ctx)` | the game has populated itself | `systems.init`; the slices of modules whose system did not come up set aside; `slices.restore(saved.slices)`; `game:restored` or `game:new` |
| `tick(hand, session)` | every frame, after the environment has this frame's hour | the clock brought up to the hour; `clock:day`, `clock:hour` |
| `write(save)` | a save is being written | `slices` (when there is any) and `clock` put into it; before `start` is through, the slices the save was loaded with |
| `newGame(hour)` | a new game was asked for | `slices.clear()`, `clock.begin(hour)`, `game:new` |
| `report(where, error, words?)` | anything set apart | counted, kept as `log.last`, handed to `onError`; written out and said to the player once per kind of fault |
| `telemetry()` | the test hook | `{ modules, systems, slices, clock, interact, devTabs, lastError, errors }` |

**Reports.** A fault is one message, `<where>: <what was thrown>` (`system forage (step): …`,
`save slice forage (restore): …`, `interactable device forage:12 (use): …`, `event clock:day: …`,
`module forage: …`, `save: …`). Every report is counted and becomes `__rt.lastError`; the first time a message
is seen it is written to the console and the player is told in one line. A system that throws in three hooks
every frame is therefore written three times in all, not three times a frame; and after twenty-four different
messages further kinds are only counted (a message with a changing number in it is a new kind every time).

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
  preStep?(dt: number, ctx: C): void;  // dt ≥ 0, and it may be 0
  step?(dt: number, ctx: C): void;
  lateUpdate?(dt: number, ctx: C): void;
  dispose?(): void;
  telemetry?(): Record<string, unknown>;
  harness?: Record<string, (...args) => unknown>;   // for test scripts: game.systems.harness(id, name, ...args)
}
```

`SystemRegistry<C>`: `add` (a duplicate id, a bad id, or adding after `init` throws); `ids()` gives the order —
the order of registration, a system moved after those its `after` names (an unknown id or a circle throws with
a message naming the systems); `registered` the order they were added in; `init(ctx)` sets the systems up one
after the other, each awaited — one whose `init` throws or rejects is reported, marked failed and never run,
and `init` itself only rejects for a mistake in the order; `isLive(id)` says whether a system is up;
`preStep` / `step` / `lateUpdate` do nothing until `init` has finished, wrap every call (a throw is reported as
id, phase, error and the frame goes on), **hand on the frame's seconds or none when they are not more than none
(negative, not a number)**, and time every call with the clock handed to the constructor; `dispose()` runs in
reverse order, once; `telemetry()` gives per system `{ ms, max, budgetMs, over, frames, overFrames, errors,
failed, own }` (`ms` smoothed over about twenty frames, `max` the longest since the start or `resetTimings()`,
each as `{ pre, step, late, total }`; `over` when the smoothed total is above the budget).

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

In the save the slices are `slices: { [id]: { v, d } }`, keys in alphabetical order.

Reading (`SaveSliceRegistry.restore`) is tolerant: a slice the record lacks is cleared; an older version goes
through `migrate`; **a newer version than the code knows, and an id nobody registered, are not read: the record
is carried unchanged into every later snapshot** (a save written with a system that is absent today, or by a
later build, is not destroyed) and reported; **a slice that was set aside (`hold(id)`) is neither read, cleared
nor asked for a snapshot, and its record is carried the same way** — the kernel sets aside the slices of a
module whose system did not come up, so that a model which fails to load once does not cost the player that
system's saved state; a slice whose `restore` or `migrate` throws is reported and cleared and the others are
still read, **and the record that would not read is carried under `<id>.unread`** (the first one kept stays;
a later build can register a slice under that id and take it back; a new game lets go of it).

Writing (`snapshot`) is as careful: **every slice's data is taken through JSON as it is asked for.** A slice
whose `snapshot` throws, or hands out what JSON cannot hold (a circle between live objects, a BigInt, a `toJSON`
that throws), is reported and written as it last was; the save itself, which is one text, is then always
writable. What a snapshot hands out is a copy: a slice may return the very object it works on, and may keep and
change the object `restore` hands it. `clear()` is a new game.

### World clock — `core/kernel/clock.ts`

`WorldTime { worldSeconds, day, hour }` is what a system reads (`ctx.clock`); plain fields. `worldSeconds` is
game time since the journey began, 86,400 to a game day, saved, never backwards. `day` counts midnights since
the calendar day the journey began on; `hour` is the hour of the day. Section 6 says how it is driven.

### Interactables — `kernel/interact.ts`

```ts
interface PlanPoint { readonly x: number; readonly z: number }
interface InteractSource { near(at: PlanPoint, r: number, out: GarageDevice[]): void }
```

`at` is the caller's own object, used again for the next call (the player hands over its eye): a source reads
it during the call and does not keep it. (Until node W3 the place came as two numbers, `near(x, z, r, out)`;
section 8 says what that cost and why it was changed before the first real source was written.)

The contract for one thing is the existing `GarageDevice` (`garageStub.ts`): a point and radius or its own
`hit`, a `word` for the prompt, `use` on a press or `holdS` + `holding(p)` for E held, `take` / `useWith` for
the thing in the hands, a `card`. A source appends the devices within `r` of `at`, where the player stands;
`InteractSources` is the set (`add` returns the remove function). A device's `id` must be unique among
everything near: begin it with the system's id (`forage:1234`).

**Whatever a source's code throws is set apart**: its `near`, and equally anything the player's code asks of
one of its devices — its shape (`hit`, or its `x`, `y`, `z`), its word and card, a press (`take`, `useWith`,
`use`), a hold (`holding`, `use`). The fault is reported (`interactable device <id> (hit | word | use |
hold)`), the device is passed over, a press or a hold is over, and the step goes on to its end. The game's own
devices are not guarded this way: they are as they were.

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
| 104–107 | imports of the kernel |
| 240 | `ModGame implements …, GameContext` |
| 420–426 | `kernel = new Kernel({ now: performance.now, say: the toast, not into a screenshot })` |
| 428–438 | the kernel's six parts under the names the context gives them: `events`, `systems`, `slices`, `clock`, `interact`, `devTabs` |
| 440 | the one payload of `body:drank` |
| 449 | the constructor's fifth parameter: the modules to install |
| 511–512 | `kernel.install(modules, this, env.clock.hourAt(0), save)`; `ready = populate().then(() => kernel.start(this))` |
| 521–523 | `dispose()`: the systems, in reverse |
| 1290 | `consume`: `body:ate` |
| 1296–1301 | `drank`: `body:drank` (only when heard; one payload reused) |
| 1607 | `snapshot`: `kernel.write(save)` — `slices` and `clock` into the save |
| 1618 | `save`: a save the browser would not keep is reported (`save: …`), once |
| 1718 | `newGame`: `kernel.newGame(hour)` — the slices cleared, the clock begun, `game:new` |
| 1726 | `newGame`: `dispose()` before the page is opened again |
| 3572 | `step`: **`systems.preStep(dt, this)`** — after the autosave, before the body |
| 3676 | `step`: **`systems.step(dt, this)`** — after `loose.update`, before sparks, dust and the views |
| 4164–4165 | `updateViews`: **`kernel.tick(env.sky, this)`, `systems.lateUpdate(dt, this)`** — after the garage's exposure, before `ui.update` |
| 4694 | `telemetry()`: the `kernel` key |

`src/game/modcar/entry.ts`: 24 the import of `MODULES` from `kernel/discovery` (so discovery precedes line 43,
`loadSave()`); 63–64 the modules handed to the game (and a test script's own, section 7); 745 `__rt.kernel()`;
750–753 the kernel's reports become `__rt.lastError`.

`src/game/modcar/save.ts`: 88 `slices?: SliceRecord`, 93 `clock?: ClockSave` in `SaveV1`; `loadSave` does not
look at either. 159 `writeSave` now says whether it wrote (`true`), where it said nothing.

`src/game/modcar/player.ts`: 72 a device target may say `own` (one of a system's); 159 `PlayerHost.interact?`;
723 the device loop calls `markDevice`; 725–740 the sources asked (skipped when the set is empty), each of
their devices marked inside a guard; 745–765 `nearDevices` and `markDevice` (the old loop's body); 904–942
`pressDevice`, `holdDevice`, `deviceWords` (the three places the old code worked a device, each moved into a
method unchanged); 1000–1010, 1155–1167, 1503–1513 where they are called — directly for the game's own
devices, inside a guard for a system's.

`src/game/modcar/devPanel.ts`: 61 `DevHost.devTabs`; 159–160 the second row's two CSS rules; 253–256 the
registered tabs added; 275–335 `tabClicked`, `addTab`, `buildOwn`, `tickOwn`; 337–357 `showTab` takes a
registered id; 362–366 the header for a registered tab; 451–452 its `tick`.

`garageStub.ts` is unchanged: `GarageDevice` is used as it is. `restore.ts` is unchanged.

## 4. The order of start-up, and of one frame

Start-up:

1. **Modules.** `entry.ts` imports `kernel/discovery.ts`; the bundler has turned the glob into static imports,
   so every `v3/*/index.ts` and everything it imports is evaluated here, before the entry's own code.
2. **Content.** Whatever a module registers at its top level (N0-B: items into the catalogue) is therefore in.
3. **Save.** `loadSave()` reads and checks the save against the catalogues. `slices` and `clock` are not checked.
4. **Construction.** `new ModGame(…, MODULES)`: the renderer, the environment, the garage, the world, the
   player; then `kernel.install`: the world clock begun at the page's hour or taken back from the save, each
   module's systems, slices, sources and tabs registered, its `setup(ctx)` called. No vehicle exists yet.
5. **`populate()`.** The models, the vehicles and the things lying about, from the save or as a new game.
6. **`kernel.start()`.** `systems.init(ctx)` in order, each awaited: a system can enumerate `ctx.vehicles`.
   Then the slices of every module with a system that is not up are set aside. Then, with a save,
   `slices.restore(save.slices)` and `game:restored`; without, `game:new`. Exactly one of the two is emitted
   per page.
7. **`ready` resolves.** The first frame.

One frame (`ModGame.step`, then `render`); the hooks in bold:

1. place, input, pad, assists, `time += dt`, the autosave
2. **`systems.preStep`**
3. the body, the workshops, grime, wrecks and places, the player (walk, pick, act), the vehicles, cones, `loose.update`
4. **`systems.step`**
5. sparks, dust, the checklist, the garage, then `updateViews`: the vehicles' views, the floating origin, the
   camera, the held thing, world streaming, `env.update`, splashes, the garage's exposure
6. **the world clock (`kernel.tick`), then `systems.lateUpdate`**
7. `ui.update`, the HUD, audio; `loose.follow`, glints

What follows from these places:

- `preStep` and `step` see **last frame's** weather (`env.state`), hour and world time; `lateUpdate` sees this
  frame's. The clock's events are emitted between `step` and `lateUpdate`.
- **Before the first frame's `lateUpdate` the environment is not the game's yet.** `env.update` first runs in
  the first frame (step 5). In `setup`, in `init` and in the first frame's `preStep` and `step`, `env.sky` and
  `env.state` are what the environment was made with — noon and the weather's first state. `ctx.clock` is right
  from `setup` on: until the first `lateUpdate`, read the hour from `ctx.clock.hour`.
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

The world clock is slaved to it. Once a step, right after `env.update` has fixed this frame's hour,
`kernel.tick(env.sky, game)` calls `clock.sync`: the clock moves forward by the way round the dial from its own
hour to the hour shown, times 3,600. So:

- it passes exactly as the hour does: 86,400 world seconds for each 24 hours of the hour hand (2,400 real
  seconds at the default day length), unevenly within the day, not at all while the panel holds time still;
- **the hour set by hand moves it forward by the forward difference**: set from 18:00 to 15:00, 21 hours pass and
  it is the next day. Dragging the panel's hour slider backwards therefore passes a day at every step of the
  slider; a preset button is one jump;
- an hour hand that comes back by less than a millionth of an hour (rounding) is held, not taken for a day;
- a new journey begins the clock at the page's hour (`worldSeconds` 0, day 0); a save holds
  `clock: { day, hour, start }` and the clock goes on from it, the environment's hour being restored from the
  save's `hour` as before; a save without `clock` begins it at the saved hour.

**A step of negative seconds, and what it leaves behind, is waited out.** The live loop in `entry.ts`
(780–786) takes `performance.now()` when it starts and from then on the time stamps of its frames, with no
lower bound on their difference; a frame asked for right after the main thread has been busy carries a time
stamp from before that, so the game's first live frame can be a step of negative seconds (seen on the live
pages of `modcar_kernel`: −0.0003 s, −0.0001 s; it can be as long as the last busy stretch of start-up). The
session's time, and with it the hour, then stands a little behind where it was, without any hand having set
it. Three things follow, and the clock handles each:

1. While the session's time is behind the latest it was followed at, `sync` does nothing, and the clock is
   `waiting` from then on.
2. The hour does not always catch up when the time does. The developer's day-length dial is applied on the first
   frame and keeps the hour *at that frame's time*; anchored at a time before the session began, a longer day
   brings the hour back more slowly than the time comes back. So while it is waiting, the clock goes on waiting
   for as long as the hand still stands a little behind it (less than a quarter of an hour).
3. A save written in such a moment holds an hour a little behind its clock. A clock taken back from a save
   therefore waits the same way for the first hour it is shown.

The wait is over when the hand is found at the clock's hour or past it. A hand found further behind than a
quarter of an hour was set back by hand, wait or no wait, and that is the next day as ever. Before this, cases
2 and 3 each cost a whole day, one `clock:day` and 24 crossed hours with nobody setting the hour (measured: a
dial of 120 minutes with a first frame of −0.01 s; a save written during the wait and reloaded).

The hooks are never handed the negative seconds (section 2); the rest of the game, the environment among it, is
stepped back by them once, as it always was. That is an old defect of the loop and is left as it is here
(section 9, the first of the decisions).

`ModGame.time` (seconds since the page loaded) is unchanged and still drives the weather's schedule and the shaders.

## 7. Adding a system

A folder with an `index.ts`. Nothing else is edited — no shared file, and **no test of the kernel**: its tests
and its browser script hold for any list of modules (they compare the game's modules with the folders on disk,
and the probe is installed after whatever the game has). This was tried: with the example below saved as
`src/game/modcar/v3/forage/index.ts` in a scratch copy, the type check, the whole of `npx vitest run` and
`modcar_kernel.mjs` pass unchanged.

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
  interact: [{ near: (_at, _r, _out) => {} }],                       // push the plants within r of at: each a GarageDevice
  devTabs: [{ id: 'forage', title: '采集', build: (pane) => void pane.note(`摘了 ${picked} 次`) }],
} satisfies GameModule;
```

A complete one, with a migration, a device that wants E held and a tab with buttons, is
`harness/sim/v3/example/index.ts`; `harness/sim/v3_module.test.ts` plays it from a new game to a save, a
reload, a midnight and a new game with `harness/sim/v3/fakeGame.ts`, a stand-in for the game that holds the
real `Kernel` and calls it at the real game's moments. A system's pure logic goes under `src/core/v3/<system>/`
with its own tests; its index and views go in the folder above.

Rules a system must keep (each comes from how the game is built, or was measured here):

- **Import in Node.** Nothing at the top level of a module's `index.ts`, or of anything it imports, may touch
  the page (no DOM, no storage, no renderer): the test that compares the game's modules with the folders on disk
  evaluates every real module in Node, and fails by name when one cannot be. Build meshes and elements in `init`.
- Stand `dt = 0`: the test hook's `simulate(0)` runs two steps of no seconds, and the game's first frame can be
  one (section 6). Never divide by `dt`. A hook is never handed negative seconds.
- Before the first frame's `lateUpdate`, read the hour from `ctx.clock`, not from `ctx.env.sky` (section 4).
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
- **Make nothing that draws a uid in `setup`, `init`, `restore` or `migrate`** (no part, item or tool instance).
  The uid counters are plain module counters, and `loadSave` only reserves the uids it walks itself; every
  system's `init` runs before any slice is read, so an instance made there can take a uid that only a slice
  holds. A slice that holds instances reserves their uids first thing in its `restore` (`reserveUids`,
  `reserveItemUids`) and re-creates only what was saved. A new game's content is made on `game:new`; what a
  restored game lacks, on `game:restored` — by then every slice has reserved its own.
- A slice's `snapshot` returns JSON data and changes nothing. It may be called any number of times, and it is
  not called at all while the system is down. `restore` is only called once `init` has run.
- Give a module its slices in its `slices` list (or register them in `setup`), not from inside an `init`: the
  kernel knows whose a slice is from what the module brought when it was installed, and only those are set
  aside when the module's system does not come up. What else such a module registered stays in the game — its
  sources, its tabs, the listeners of its `setup` — each behind its own guard, working on a system that never
  set itself up: they must stand that.
- A device handed out by `near()` is the system's own code in every member: what it throws is reported and the
  device passed over (section 2), which is a safety net, not a way of working.

Testing a system in the real game before it has a folder, or with a fault injected: a script sets
`window.__rtModules = [module]` before the page's scripts run (`context.addInitScript`), and `entry.ts` installs
those after the game's own. `harness/shots/modcar_kernel.mjs` does this with a probe module. **That script is
the only test of the kernel's wiring in `ModGame.ts`, `entry.ts`, `player.ts` and `devPanel.ts`** (those four
do not run in Node): every node that touches one of them, or the kernel, runs it with its acceptance.

## 8. What was checked

- Node: `harness/sim/v3_kernel.test.ts` (the four pure parts; that the per-frame calls allocate nothing; what
  they cost), `v3_module.test.ts` (discovery against the folders on disk, installing, the sources, the tabs,
  the kernel's glue through the stand-in, the example module played), `v3_save.test.ts` (the save through the
  real `writeSave` / `loadSave` / `pushRestore`, which run in Node with the browser's storage stood in for by a
  map: an old save without slices, a round trip, a carried unknown slice, a newer one, one that throws, one
  whose data cannot be written, a storage that is full, slices and a clock that are rubbish).
- Each of these was also checked the other way round: with the fix taken out again in a scratch copy (the wait
  of the clock, the hold after a failed init, the copy through JSON, the record kept under `.unread`, the
  seconds clamped for the hooks, a fault said once per kind), at least one test fails.
- The cost with no system registered, in Node 24 on the development machine: 12 nanoseconds a frame for the
  three hooks and the world clock, 14 through the `Kernel` the game holds, and no allocation. With systems the
  timer is read once per phase and once more per system in it; with Node's performance clock a reading takes
  about 50 ns and the engine puts some of the numbers on the heap, 16 bytes each: one empty system, 0.3 µs and
  96 bytes a frame; twelve, 2 µs and about 100 bytes (run by itself; the same loop inside the test runner
  measured 6.5 µs and 205 bytes). A clock of whole numbers costs 0.4 µs for twelve systems and no bytes. None of
  this is a measurement of the game on a GPU.
- What taking a slice's data through JSON costs at a save, in Node: 0.08 ms for a slice of 6 KB of save text
  (500 entries), 1.3 ms for 62 KB (5,000), 5.9 ms for 258 KB (20,000) — about twice what the save's own
  `JSON.stringify` of the same data, which follows it, takes. It is paid when a save or a restore point is
  written (every half minute, every five), never in a frame's hooks. Half of it is the copy; were it ever too
  much, the check alone would do, at the price that a `toJSON` which answers differently the second time could
  again keep a save from being written.
- The pick's question to a source, in Node: no allocation of the set's or the source's own, and none on the
  way in. While the place was two numbers (`near(x, z, r, out)`), a coordinate handed in as a fraction cost 16
  bytes wherever the engine did not fold the source's `near` into its caller, which it did with one kind of
  source in the process and did not with two (measured then: 0 bytes a call with the example alone, 32 with a
  second module whose source is an object literal). Node W3 changed the signature to `near(at, r, out)` before
  its own source, the first real one, was written: the place is one object, the caller's, and the test now asks
  two kinds of source with fractions in it and finds nothing allocated.
- Browser, software renderer (functional only): `modcar_journey`, `modcar_save`, `modcar_restart`, `modcar_dev`
  before the first edit to the game's files and after the last — the same steps pass, and the journey, the
  restart and the panel print the same lines to the letter (of the save's lines one differs from run to run of
  the same code: how far a test drive got on a live page); `modcar_kernel` tries every seam in the real game
  with a probe module, the faults among them: a hook that throws, two hooks, a listener, a device that throws
  when asked for its shape, its word, on a press and during a hold, a slice that hands out a circle, a storage
  that refuses the save, a system whose `init` fails on one page and works on the next, a save written while
  the clock waits out a step of negative seconds.

## 9. Left for later nodes, on purpose

Three decisions that are not this package's to take, each small now and dearer after N1 (the second was taken in node W3):

- **Clamp the loop's first step at nothing.** `Math.max(0, …)` at `entry.ts` 785 (or `if (dt < 0) dt = 0` at the
  top of `ModGame.step`) would end the one frame in which the whole game is stepped backwards, and with it the
  cause of the clock's wait. It changes what the old game does in that frame, against this package's rule of no
  change in behaviour, so it was not done. The clock's wait and the hooks' clamp stay right either way.
- **`near(x, z, r, out)` or `near(eye, r, out)`.** Handing a source the eye as an object would end the two
  heap numbers of section 8 for good. It alters the signature the brief gave, and after N1 every system's
  source with it. *Decided and done in node W3, before its source was written: `near(at, r, out)`, section 2.*
- **Timing every frame.** The registry reads the timer once per system and phase, every frame, and the readings
  are not free (section 8). Accepted here: the rule "nothing on a per-frame path may allocate" is kept by the
  kernel's own code, not by the engine's handling of the browser's clock. If that is not acceptable, timing one
  frame in N is a change inside `systems.ts` (`max` and `overFrames` then see only the frames timed);
  `docs/V3/LOOP_V2.md`'s rule should say which it is.

And what belongs to later nodes:

- **Stacks, containers, freshness, the open item catalogue, unknown items dropped instead of the save set
  aside**: N0-B. Until then `loadSave` still sets the whole save aside for one unknown part or item id.
- **Uid reservation for instances kept in slices.** `loadSave` reserves the uids it walks (vehicles, wrecks,
  places, loose, hands, pack; never a tool's), before the game exists; slices are read later. Until N0-B's
  walker over every holder, the rule of section 7 stands in for it. What the rule cannot cover: the uids inside
  a record that is only carried (a system absent today) are reserved by nobody, so things made meanwhile can
  take them; a walker that reserves every `uid` it finds in any slice record, read or not, would.
- **Held-tool behaviours, first-person arms, the buttons told apart** (N3); **UI modes / the modal stack** (N2);
  key bindings and HUD registries; shelters and body modifiers (N4); the hitch (N11).
- **The rest of the events** (section 5), and `GameContext` members beyond the fifteen it has.
- **`alt`, `with`, `channel`, `highlight` on interactables** (player-interaction.md S3): `GarageDevice` as it
  is covers a press, a hold, the held thing given to it, and a card. The garage, the workshop, the places and the
  doors still reach the player through `devices`, not through `interact`; a source's devices are not in
  `game.devices`, so `__rt.useDevice(id)` does not find them (a system's harness functions do that).
- **Draw-call and triangle budgets** per system: `budget` holds `cpuMs` only; the render nodes (N8) add the rest.
- **Save v2** (a head and slices, heavy slices in IndexedDB, restore points by reference): the slices live in
  the one `SaveV1` blob in localStorage, and each restore point is still a whole copy of it — seven copies of
  every slice. A save the browser will not keep is now said (once, `save: …`); a restore point it will not keep
  is still dropped in silence (`restore.ts` keeps fewer of them, as before), and nothing yet makes room for the
  save by letting old points go.
- **A queue for `ui.say`**, a seeded `rng(stream)` on the context, `sound()` on the context: added by the node
  that first needs them (the last two are one line each in `context.ts`). The toast is last-writer-wins, so a
  fault's line can still hide another message for three seconds, once per kind of fault.
- **A save written while the page is still loading.** A kept page that is hidden or closed after its vehicles
  are back but before its first step writes its save then (`visibilitychange`, `pagehide`). The slices are safe
  through that window (the record the save was loaded with is written again), and the clock is restored at
  construction. The wrecks and the places are not: they are made on the first step, so such a save has neither
  `wrecks` nor `places`. That is an old defect, found by reading while closing the window for the slices, and
  left as it is.
- **A rejected `ready`** (the lifecycle map's R18) is as it was: `populate()` rejecting still leaves the page
  waiting. The kernel adds no new way for it to reject: `kernel.start` never does. A system whose `init` returns
  a promise that never settles does hold `ready` back for good, though: an `init` must finish.
