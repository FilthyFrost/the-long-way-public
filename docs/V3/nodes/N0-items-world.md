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
  itemNow())`. No table sets the new fields: every existing roll gives what it gave.
- **Freshness.** A thing's clock starts, at the latest, as it comes to lie in the world (`LooseThings.addItem`).
  A searched container with things that go off is kept from then on (`PlacesSave.left`), not rolled again. A
  thing that has turned into another kind is drawn again where it lies (`LooseThings.settle`; the game also looks
  at one loose thing a frame), and the lists settle their things as rows are built and as one is taken. Limit: a
  place's things in plain sight are made anew each time the place comes, until taken or moved.
- **Recycler and wrecks.** What a thing gives is `salvageOf` as it goes in (a stack: each one's; a box: its
  contents' too), counted up over one grinding whatever the count; the prompt says when a box goes in with what
  it holds. A wreck is "touched" by `itemSig` of its riders (some off a stack, a bottle drunk from).
- **Change counters**, so that nothing is rebuilt per frame: `LooseThings.rev` (a thing comes, goes, lands, is
  lifted, changes kind; `touch()` when one changes in itself) and `PlaceContainer.rev` (`Places.kept(pc)`).
  Whoever changes the weight of a thing riding in a vehicle calls `cargo.weigh(v)` and `loose.touch()`.

## The list's sources (`src/game/modcar/listSources.ts`)

```ts
interface ListSource {
  readonly title: string; readonly head: string; readonly empty: string; readonly takeWord: string;
  readonly shutEmpty?: boolean;                        // a take that empties it shuts the list
  readonly cap?: { slots: number; maxKg?: number };    // shown as "2 / 4 格 · 0.9 / 3 kg"
  near(): boolean;                                     // false: the list shuts (asked every frame)
  version(): number | string;                          // changes when rows() would; cheap, no allocation
  rows(): CargoRow[];                                  // built only when version() changed
  load?(): number;                                     // kg; absent: the rows' sum
  takeAt(i: number): boolean;                          // row i into the hands, through ModPlayer.receive
  room?(held): number;                                 // how many of the held thing would go in; changes nothing
  put?(held): number;                                  // puts it in; how many did NOT go (0: the hand is emptied)
}
```

`vehicleSource`, `placeSource` and `selfSource` are the three lists the game had, word for word; `boxSource`
lists a thing that holds things (`ItemDef.holds`). `ModGame` ("what is in a vehicle (Tab)") keeps what the list
is open on in `listV` (a vehicle, `'self'`, a place's container, or a source), builds rows only when the version
moves and hands `CargoList` one reused view, drawn again only when it differs. Keys: Tab opens (a box the line
of sight is on, lying within reach; else a box in the selected slot; else as before) and shuts; W / S or the
wheel choose; E takes; a slot's number key changes the thing in the hands; **G puts it in**, shown in the list's
foot only while it would go. A take of a stack takes what the hands have room for; the rest stays in its row.
Taking out of a box that is itself in the hands, the box steps out of its slot for the hand-over, so that hands
which fill a box they hold (`receive`) do not put the thing straight back. A box's `room` goes back to the core
(`roomInside`) only when the thing, its count or what is in the box has changed. Every source is asked through
`guardedSource`: what its code throws is reported by the kernel as a system's device that throws is (`list
source <title> (<what was asked>)`), the source then says it is out of reach, the list shuts, the frame goes on.

## Adding a source, without editing ModGame.ts

- **A container item** (a creel, a quiver, a box of cartridges): register a kind with `holds`. Nothing else.
- **A system's own box in the world** (a fridge, a stash): keep an `ItemInstance` of a kind with `holds` in the
  system's save slice (walk it with `forEachItem`), and in its device's `use`:
  `const src = boxList(box, { near: () => stillByIt, title: '冰箱' }); if (src) openList(src);`
- **Anything else**: implement `ListSource`, then `openList(it)`. `near` and `version` allocate nothing; `takeAt`
  asks `player.roomFor`, hands over with `player.receive`, keeps what did not go and says why when nothing went.

## Saved data these files write (each item as its whole `ItemInstance`)

`PlacesSave.left[containerId][i].item` (`Places.kept`, and the first search of a container with things that go
off); `WrecksSave.kept[wreckId].loose[i].item` (`Wrecks.keep`, from `ModGame.ridersSaved`). `cargo.ts`,
`loose.ts`, `workshop.ts` and the list save no item themselves.

Checked by `harness/sim/v3_lists.test.ts` (the sources against plain hands and hands that stack, a found stack,
no allocation in what a source is asked every frame, a source that throws in each thing asked of it) and
`harness/shots/v3_items_world.mjs` (the real game with the test content). Not done here: a gamepad button for
putting in (`pad.ts`).
