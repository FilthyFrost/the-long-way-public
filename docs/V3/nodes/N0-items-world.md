# N0 foundation, part B, the world's side: stacks lying about and the list's sources

The item model (`src/core/modcar/items.ts`: a stack is ONE instance with a count, a thing may hold things,
freshness is read lazily) as the world outside the hands keeps to it, and the list (Tab) opened to anything that
holds things. With no kind that stacks, holds or goes off, the game is as it was.

## Stacks in the world

- **One object, one count.** A stack lying about, riding in a vehicle, found in a cupboard or a wreck is one
  `Loose` / one row holding one `ItemInstance`. Its name is `heldName` (`itemName`: "试验莓 ×5"), its weight
  `massOf` (`itemMass`: all of the stack, a box with what is in it): the vehicle's load (`CargoBay.weigh`), the
  list's rows and the sounds go through these two. Its model is one of its kind; nothing joins up on the ground.
- **Found things.** The core's `Found` item is `{ item, n?, q?, state? }`; `places.ts heldOfFound` makes the
  instance (at most one stack, its own copy of the state) and starts its freshness with `stampFresh(inst,
  itemNow())`. No table sets the new fields: every existing roll gives what it gave. A wreck's loot is NOT a
  `Found`: `WreckRoll.items` are ids and `ModGame.stowLoot` calls `newItem(id)`, so a wreck cannot yet be rolled
  with a count, a quality or a state, and an untouched wreck's loot starts fresh at each spawn.
- **Freshness.** A thing's clock starts, at the latest, as it comes to lie in the world (`LooseThings.addItem`).
  A searched container with things that go off is kept from then on (`PlacesSave.left`), not rolled again. A
  thing that has turned into another kind, or holds things that have, is settled where it lies
  (`LooseThings.settle`: drawn again; the game looks at one loose thing a frame, the lists as rows are built and
  as one is taken); riding in a vehicle, the vehicle is weighed again (`weightChanged`, set by `CargoBay`).
- **A place's own things in plain sight** are made anew each time the place comes, until one is taken, moved or
  **changed where it lies** (some picked off its stack, a thing put into or taken out of it: `loose.touch(l)`
  marks it): `Places` lets it go at once (`owns`, `snapshot`), and it is saved with the things lying about.
- **Recycler and wrecks.** What a thing gives is `salvageOf` as it goes in (a stack: each one's; a box: its
  contents' too), over one grinding whatever the count. A wreck is "touched" by `itemSig` of its riders.
- **Change counters**, so that nothing is rebuilt per frame: `LooseThings.rev` and `PlaceContainer.rev`
  (`Places.kept(pc)`). Whoever changes a thing lying about in itself calls `loose.touch(l)`, and
  `cargo.weigh(v)` when it rides in a vehicle.

## The list's sources (`src/game/modcar/listSources.ts`)

```ts
interface ListSource {
  readonly title: string; readonly head: string; readonly empty: string; readonly takeWord: string;
  readonly shutEmpty?: boolean;                        // a take that empties it shuts the list
  readonly cap?: { slots: number; maxKg?: number };    // shown as "2 / 4 格 · 0.9 / 3 kg"
  near(): boolean;                                     // false: the list shuts (asked every frame)
  version(): number | string;                          // changes when rows() would; cheap, no allocation
  rows(): CargoRow[];                                  // built only when version() changed
  load?(): number;                                     // kg, asked with the rows; absent: the rows' sum
  takeAt(i: number): boolean;                          // row i into the hands, through ModPlayer.receive
  room?(held): number;                                 // how many of the held thing would go in; changes nothing
  put?(held): number;                                  // puts it in; how many did NOT go (0: the hand is emptied)
}
```

`vehicleSource`, `placeSource` and `selfSource` are the three lists the game had, word for word; `boxSource`
lists a thing that holds things (`ItemDef.holds`). `ModGame` ("what is in a vehicle (Tab)") keeps what the list
is open on (`listV`: a vehicle, `'self'`, a place's container, or a source) and the row picked; the rest is
`Listing` here (rows built only when the version moves, the take, the put, the one view `CargoList` draws again
only when it differs), where Node tests it. Keys: Tab opens (a box the line of sight is on, lying within reach;
else a box in the selected slot; else as before) and shuts; W / S or the wheel choose; E takes; a slot's number
key changes the thing in the hands; **G puts it in**, shown in the list's foot only while it would go.

- A take hands over what the hands have room for; the rest stays in its row, and a take of nothing changes
  nothing. Out of a box that is itself in the hands, `receive` is told to leave that box out (`not`).
- An open list notices the time: a source keeps when its first row turns and folds "it has" into `version()`
  (the clock is read only while a row goes off); the row is the new kind before E hands it over.
- A frame of an open list allocates nothing: a box's `room` goes back to the core only when the thing, its kind,
  its count or the box changed; weights are asked with the rows; distances are written out (no `Math.hypot`).
- Every source is asked through `guardedSource`: what its code throws is reported by the kernel as a system's
  device that throws is (`list source <title> (<what was asked>)`), the source is then out of reach, the list
  shuts, the frame goes on.

## Adding a source, without editing ModGame.ts

- **A container item** (a creel, a quiver, a box of cartridges): register a kind with `holds`. Nothing else.
- **A system's own box in the world** (a fridge, a stash): keep an `ItemInstance` of a kind with `holds` in the
  system's save slice (walk it with `forEachItem`), and in its device's `use`:
  `const src = boxList(box, { near: () => stillByIt, title: '冰箱' }); if (src) openList(src);`
- **Anything else**: implement `ListSource`, then `openList(it)`. `near` and `version` allocate nothing; `takeAt`
  hands a row over with `intoHands(ctx, held)` (it says `HANDS_FULL` when nothing went and selects the slot
  when all did) and keeps what did not go.

## Saved data these files write (each item as its whole `ItemInstance`)

`PlacesSave.left[containerId][i].item` (`Places.kept`, and the first search of a container with things that go
off); `PlacesSave.taken` (the ids of a place's things let go); `WrecksSave.kept[wreckId].loose[i].item`
(`Wrecks.keep`, from `ModGame.ridersSaved`). `cargo.ts`, `loose.ts`, `workshop.ts` and the list save no item.

Checked by `harness/sim/v3_lists.test.ts` (the sources with the real hands and the plainest stand-in, `Listing`,
the guard, no allocation in a frame, a found stack), `harness/sim/v3_world.test.ts` (the real things lying
about, places, weighing and hands together) and `harness/shots/v3_items_world.mjs` (the real game with the test
content). Not done here: a gamepad button for putting in (`pad.ts`).
