# N0 — the item model in the hands (lane H)

How the hands, the hotbar and the item card treat things that stack, hold things and go off (the model is
`src/core/modcar/items.ts`; this is its game side in `player.ts`, `hudItems.ts`, `itemInfo.ts`, `cards.ts`).
With no kind that stacks, holds or perishes, the game does what it did. Tests: `harness/sim/v3_items_hands.test.ts`
(the real `ModPlayer` in Node), `harness/shots/v3_items_hands.mjs` (the live game, real keys, `v3test=1`).

**Into the hands: one way.** `ModPlayer.receive(h, not?)` is how a thing enters the hands from anywhere: a
list, a bench, a script, and the player's own E on a thing lying about. An item goes (a) onto the stacks of its
sort in the slots, in slot order, (b) into the things in the slots that hold its sort (at that thing's rate from
then on), (c) into a free slot: the selected one when empty, else the first empty, which then becomes the
selected one, as a thing picked up always was. A part or a tool: only (c). It returns how many did not go in.
`0`: let go of the thing, whatever its count reads. Otherwise it is still the caller's with that count: the
player's pick-up leaves it lying where it was, the same loose thing with fewer in it. `not` names a thing in the
hands the item must not go into: **a list showing what is in a basket in the hands must pass that basket**, or
what is taken out goes straight back in. `roomFor(h, not?)` says how many `receive` would take, in the same
order, changing and allocating nothing; the mark and the prompt ask it every frame. With no slot free, things
lying about get the mark only when a stack or a basket in the hands has room for them. The prompt says where a
thing would go when that is not simply the empty hand: `（叠到快捷栏 1）`, `（装进试验篮）`, `（放进快捷栏 2）`,
with `，只拿得下 3 个` when only part of a stack would go.

**In the hands.** A thing that goes into a slot is started (`stampFresh`) and goes off in the open air from
then on; what does not go in is left as it was. Every frame on foot (and as the hotbar is drawn in a seat) each
slot's thing and what is inside it is started if it was not and passed to `settleItem`; so is the thing lying
about that the mark is on (settled, never started by a look).
A thing that changed kind needs nothing more: the model in the hand, the hotbar picture, the name and the card
are all keyed by the kind; a bite of it under way stops. `takeOne(slot)` takes one off a stack (a new instance
of one), or the thing itself when it is the last: eating and pills use it, and `body:ate` carries that one.
G, a vehicle's zone and a device are handed the thing whole: a stack with its count, a basket with what is in it.

**Shown.** `SlotView.count` is drawn in the slot's corner (nothing for one), written when it changes; the
slot's name is the thing's without its count (`itemLabelPlain`). `heldName` and `itemLabel(inst)` give
"试验莓 ×3" as the core's `itemName` does, built when kind, count or level change; `itemWordsChanged()` has
every kept name and card made again (for a change that is not in the things: the player has learnt what a kind
is). `telemetry()` gains `heldN`, `slot1N`, `slot2N` (0: empty) and `counts` ("3,0,12", every slot).

**The card.** `itemCard(inst, nowS)` adds `×n` to the name and a row `n 个 · 一叠（最多 N 个）` for a kind that
stacks; a bar `新鲜程度` with the word (`FRESH_WORD`: 新鲜 / 还行 / 快坏了 / 坏了) and how long the thing still
keeps where it is; a row `品质` drawn as stars when it has `q`; for a thing that holds things a bar `装着`
(slots and weight), a row for each thing inside (six at the most) and a note on how it keeps them.
`itemCardKept(inst, nowS, t)` is what the words on screen use (`ModPlayer.cardOf`): the same object while kind,
count, level, freshness (in fiftieths) and contents (how many stacks, how many things) are unchanged, for a
quarter of a second at the most; it is marked `kept`, the view does not look into it again, and nobody may
write into it.

**A system's own lines on the card.** `registerItemCardLines({ item: id } | { cat: id }, (inst, card, nowS)
=> void)`, called once as the system's module loads. The function runs each time a card of that kind (or of
any kind of that category) is made, after the lines above, a category's before a kind's, and pushes rows, bars,
notes or badges of its own into `card`. A card on screen is made again at least four times a second, so the
function may read the thing's `state` without telling anyone when it changes; it never runs per frame. Lines
that throw are reported once per message (`setItemCardFault` hands them to the kernel's report) and the card is
shown without them.

**Left to other lanes.** A loose thing may now lose part of its count without moving (places and wrecks that
decide "touched" by position or kind should look at the count), and may change kind in place while the mark is
on it (its model on the ground is stale until `loose.ts` makes it again). `ModGame.stepDeath` empties the whole
slot of a first-aid kit: with a kit that stacks it should call `player.takeOne(slot)`. The key that opens a held
basket's list is not in the hands' key list (`heldKeys`).
