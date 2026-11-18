# N0 foundation, part B: the item model (stacks, things that hold things, freshness)

What one carries can now be many in one slot, can hold other things, and can go off; and a gameplay system
adds its own kinds without editing a shared file. This is the model for the engineers of the next nodes:
the fields, the helpers, the rules, how to register, what the save does with it, and what is tested where.
The hands' side is `N0-items-hands.md`, the world's and the lists' `N0-items-world.md`.

- Pure core: `src/core/modcar/items.ts` (from `export const ITEMS` on). Contract in brief:
  `harness/sim/v3_items_smoke.test.ts`.
- Game side: `src/game/modcar/itemTime.ts` (the world's time for things), `save.ts` and `restore.ts`.

## 1. The fields

On a kind (`ItemDef`), all optional:

| Field | Meaning |
| --- | --- |
| `tags` | words other systems ask for (`'forage'`, `'meat'`): lower case, digits, `_` |
| `stack` | how many make one stack (absent: 1, it does not stack) |
| `holds` | `{ slots, accepts, maxKg?, decay? }`: it holds things. `accepts` lists category ids (`'food'`), tags (`'#forage'`) or `'*'`; `decay` is how fast things in it go off against the open air (absent 1, a cool box 0.25, 0 never) |
| `perish` | `{ hours, into? }`: game hours in the open air from fresh to turned, and the kind it has become then |
| `icon` | a drawn picture instead of a thumbnail of its model |

On a thing (`ItemInstance`), all optional and all plain JSON:

| Field | Meaning |
| --- | --- |
| `n` | how many in this stack. Absent: 1 (one is never written as a count). 0: used up |
| `inside` | what is in it, a flat list. Absent when empty |
| `fresh`, `t0`, `fk` | freshness 1…0 as it was at world time `t0` (seconds), going off at the rate `fk` (absent: 1) |
| `q` | quality, 1–5 |
| `state` | its system's own state: an object of JSON, at most twelve levels deep |

## 2. The helpers

| Call | What |
| --- | --- |
| `registerItemCat({ id, name, order? })` | a new category; throws for a bad or taken id, a name not in both languages, an order that is no number |
| `registerItems(rows)` | new kinds, all or none: one bad row throws with every problem of every row named |
| `itemCats()`, `itemCat(id)`, `hasItemCat(id)` | the categories in list order: the nine are 0, 10 … 80; one without an order comes after them, in the order registered |
| `itemCatalogueProblems()` | what is wrong with the catalogue as a whole (for a system's own test): a kind that turns into none, or into one that turns again, or into one whose stacks are smaller; a box that accepts what nothing is |
| `newItem(id, o?)` | one thing or a stack (`{ n }`); a thing that goes off comes fresh, and starts counting at `o.t0` or at the first `stampFresh`. It trusts `o`: hand it counts from 1 |
| `countOf(x)`, `stackMax(id)` | how many it is; how many a stack of its kind holds |
| `canStack(a, b, now)` | may the two be one stack (not whether there is room) |
| `mergeStacks(into, from, now)` | moves as many as fit; returns how many are left in `from` (0: used up, let go of it) |
| `splitStack(x, k)` | `k` off a stack as a new thing with a new uid; null when `k` is not 1 … count − 1 |
| `accepts(box, x)` | would the box take a thing of this kind at all |
| `roomInside(box, x, now)` | how many of `x` the box takes now: by kind, weight, the stacks it would join, free slots |
| `putInside(box, x, now)` | puts in exactly what `roomInside` says; returns how many stay outside. 0: `x` is in `box.inside`, or it went onto stacks and reads 0 |
| `takeInside(box, i, now, k?)` | the i-th thing out, or `k` off it as a new stack; null for no such thing or a `k` that is no count |
| `insideMass(box)`, `itemMass(x)`, `salvageOf(x)`, `itemName(x)` | count the stack and what is inside |
| `freshNow(x, now)`, `freshStage(f)`, `turned(x, now)` | how fresh now (1 for a thing that does not go off); the card's four stages; has it gone off |
| `stampFresh(x, now)` | starts what has not started, with what is in it (at the box's rate) |
| `setFreshRate(x, now, k)`, `rebaseFresh(x, now)` | a new rate from now; its freshness brought up to now |
| `settleItem(x, now)` | a turned thing becomes its kind's `perish.into`, in place; true when it changed kind |
| `forEachItem(x, fn)` | the thing and what is in it |
| `itemSig(x)` | the same text for the same thing in the same state, whatever the uid (not its freshness) |
| `cleanItem(raw, loss)` | a thing from a save made sound, or null (section 6) |
| `reserveItemUids(uids)` | new things are numbered past these |
| `itemNow()` (`itemTime.ts`) | the world's time for all of the above, in the game |

## 3. The rules

- **A stack is one instance.** One slot, one thing lying about, one row, one picture with a count. A stack
  used up (its count reads 0 after `mergeStacks` or `putInside`) is dropped by whoever holds it; nothing
  joins it, it is never written to a save and never read back as one thing.
- **What stacks with what**: the same kind, a kind that stacks, nothing inside, no level of its own
  (`litres`, `uses`), the same colour, quality, `opened` and state (compared as JSON, whatever the order of
  the keys), the same rate, and about as fresh (`STACK_FRESH_TOL`, 0.25; a turned one only with turned
  ones). The merged stack is as fresh as the two were, by count.
- **A stack may be over its kind's maximum** (a build lowered it; what it turned into stacks smaller):
  nothing is lost, nothing more joins it, it can be split and put into a box whole.
- **Boxes do not nest**, a box is one of a kind (no count), and a kind that holds things cannot go off.
- **Freshness is read, never stepped.** It is a function of the time alone: asked once or brought up to date
  any number of times, through boxes, merges and splits, the answer is the same (tested to 1e-9). The time is
  the world clock's seconds, which never run backwards. A thing with no `t0` has not started: `stampFresh`
  it when it enters the world. What goes into a box takes the box's rate, what comes out the open air's.
- **A turned thing is settled where the world looks at it** (picked up, listed, on a card, eaten), not on a
  timer and not by a save. What it becomes is counted from the moment the first ran out, whenever that is
  noticed, and goes off in its turn at the rate of where it lies. (Moved to another rate between turning and
  being looked at, the whole of that stretch counts at the new rate: the one place where order shows.)
- **Every frame without garbage**: `accepts`, `roomInside`, `canStack`, `itemMass`, `countOf` make nothing.
  Pass the time on as you got it; section 8 says what the engine itself adds.

## 4. Registering kinds, and a system's own fields

A system registers at the top level of its module (so before the save is read), and adds its typed fields by
declaration merging; `items.ts` is not edited.

```ts
// src/game/modcar/v3/forage/content.ts
import { registerItemCat, registerItems } from '../../../../core/modcar/items';

declare module '../../../../core/modcar/items' {
  interface ItemDef { forage?: { season: 'spring' | 'autumn'; poisonous?: boolean } }
  interface ItemState { pickedAt?: string }          // one thing's own state, JSON only
}

registerItemCat({ id: 'forage', name: { zh: '野菜', en: 'Foraged' } });
registerItems([
  { id: 'forage_morel', cat: 'forage', name: { zh: '羊肚菌', en: 'Morel' }, stars: 3, mass: 0.03, stack: 10,
    tags: ['forage', 'mushroom'], perish: { hours: 36, into: 'forage_rot' }, forage: { season: 'spring' } },
  { id: 'forage_rot', cat: 'forage', name: { zh: '烂掉的野菜', en: 'Rotten greens' }, stars: 0, mass: 0.03, stack: 10 },
  { id: 'forage_basket', cat: 'forage', name: { zh: '采集篮', en: 'Forage basket' }, stars: 2, mass: 0.6,
    holds: { slots: 12, accepts: ['#forage'], maxKg: 4, decay: 0.8 } },
]);
```

Left out, a row gets `carry` by its weight, its id for a `model`, kraft and cream paints, no salvage and no
blurb. The system's test asserts `itemCatalogueProblems()` is empty. Ids are lower-case letters, digits and
`_`, and are for ever: a save names them.

## 5. Today's world is pinned

`BASE_ITEMS` is the catalogue as it was before anything was registered, frozen. The loot tables that existed
(`loot.ts` containers and things in plain sight, `wrecks.ts` boots) pick by category out of it alone, so a
kind registered later, even into `food`, never enters what a seed holds. `v3_items.test.ts` rolls fifty seeds
before and after registering seventy kinds into the nine old categories and compares every roll. New loot
is a system's own table.

## 6. The save

Things are saved whole, where they are held: the hotbar's slots and the backpack one has on, what lies about
and rides in one's vehicles, the riders of wrecks kept as they were left, what is left in the places'
containers. **`save.ts` `thingLists` is the one place that knows these holders**; checking, the uids, the
tolerant reading and the writing all walk it. (A walk by holder was chosen over a deep walk that knows a
thing by its shape: a holder says what to do when its thing goes — the hotbar's slot is emptied, a list is
shortened — and it catches what does not look like a thing at all, `{ item: 5 }`, which a walk by shape
would pass over and the game would then fall over. The price is that a new holder must be added there; the
tests below fail when a thing sits anywhere else.)

Reading (`loadSave`):

- A frame or a part this build does not know sets the save aside, as before.
- **A thing of a kind the catalogue does not have is left out**, at every holder and inside baskets, and
  counted (a stack by its count, a box with all that was in it). A hotbar slot that held it is empty, the
  others stay where they are. A tool of no known kind goes the same way. Everything else is read.
- Every thing goes through `cleanItem`: a count, level, freshness or quality out of range is brought into
  range, fields its kind has no use for are removed, a stack used up is dropped.
- Uids: every part's, tool's and thing's, those inside baskets too, are kept from being given out again; a
  uid held twice (tools' were not reserved before, so older saves have them) is held once.
- What goes off and has no `t0` starts at the save's own world time; nothing is written as of a later time.
  (What the game hands back later from a list kept in the session, a wreck's riders, starts then:
  `save.ts backInTheWorld`.)
- The player is told once, when the game is up: `有 N 件认不出的东西没能读回来`, through `kernel.report`
  (so it is also the test hook's last error, with the kinds named).
- What was in a slot the hotbar no longer has (the backpack was left out, or gives fewer slots now) is put
  down where one stands.

Writing: a snapshot changes nothing in the game and settles nothing. `writeSave` and `pushRestore` never
write a stack used up (a copy without it is written; the usual save is written as it stands). A restore
point is a save and is read the same way when it is gone on from. Two hundred stacks cost about 24 KB lying
about (122 bytes each, with where they lie) and about 14 KB in fifty baskets (72 each).

A system that keeps things in its own slice does this itself, first thing in `restore`: `cleanItem` each,
drop the nulls, `reserveItemUids` with `forEachItem`, `stampFresh(x, itemNow())`.

## 7. What is tested where

- `harness/sim/v3_items.test.ts`: registration and every rule a row is held to; the pin of section 5;
  stacks, boxes and freshness with seeded random sequences (no count lost or made, a box takes exactly what
  `roomInside` said, freshness the same however often it is brought up to date); settling; `cleanItem` on
  six thousand hostile inputs; uids; what a frame's questions leave on the heap.
- `harness/sim/v3_items_save.test.ts`: the real `save.ts` and `restore.ts` in Node: an old save, the round
  trip at every holder, unknown kinds at every holder and depth, uids, freshness at load, stacks used up,
  restore points, broken holders, the size above. It also finds every thing in a save's text by its shape
  and requires the walk to have found the same.
- `harness/shots/v3_items_save.mjs`: the real game with `v3test=1`: a stack, a basket and a stack put down
  through a save and a reload; then the same save without `v3test=1`.

## 8. What is not covered

- **Uids in a slice that is only carried.** A slice of a system absent from this build is kept as it came and
  not read, so the uids of things inside it are reserved by nobody; things made meanwhile can take them, and
  the system finds them twice when it is back. A slice that holds things should expect that in its `restore`.
- **The engine's boxed fractions.** The frame's questions make nothing of their own, but V8 hands back a
  fractional field (`fresh`, `t0`, `fk`, `litres`) as a new 16-byte number wherever the code has seen things
  of more than four shapes, which in this game is everywhere. Measured after things of every shape:
  `freshNow` 32–48 bytes a call, `canStack` of two things that go off about 64, `roomInside` 30–60 for each
  stack that goes off which it compares; nothing for kinds, counts, weights and states (the test prints the
  figures). Removing it means giving every thing the same fields in the same order, or keeping freshness
  out of fractional fields: a change to the model.
- **What a tolerant load left out is gone with the next save.** The text it came from is not kept aside (it
  would be a second copy of the save in the browser's storage); a build that has the kinds again does not
  get the things back.
- A thing moved to another rate after it turned and before it was settled (section 3).
- Parts' uids (`build.ts reserveUids`) have the weakness things' had: a uid with a number past 2^53 stops
  the counter. Not touched here.
- `newItem` does not check what it is handed (`n: 0`, a count on a box).
