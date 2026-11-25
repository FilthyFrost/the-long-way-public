/**
 * What a thing in the hands does by itself (docs/V3/plan/fishing.md): a system's kind of thing that works the
 * buttons wherever one looks, with no device in the world for it — a fishing rod casts, strikes and reels; a bait
 * goes onto the rod in the other slot. The player's code (player.ts) knows no such kind: every frame on foot it asks
 * this registry about the thing in the hands and lets it have the buttons it takes.
 *
 * A use is registered for an item kind or for a category ({ item } | { cat }), once, as its module loads; a kind's
 * use stands before its category's. Every frame on foot with such a thing in the hands, in this order:
 *
 *   busy()     the hands are at it whatever the mark is on (a line out in the water): nothing is aimed at, no card
 *              is shown, nothing is picked up; and while still() says so the walk stands still (a fish on the line)
 *   buttons()  the use button (the left one) and the take button (the right one) as they are this frame,
 *              and whether the mark is on something the use button works there (a thing lying about, a door, a
 *              device); it answers which of the two it took (1 the use button, 2 the take button): the player's own
 *              code does not see those this frame
 *   acts()     what the buttons do now, for the line over the hotbar: asked when the mark is on nothing, or busy
 *   keys()     its own lines down the right (before G and the other slot)
 *   ring()     the ring round the mark (0 … 1, and its colour)
 *   gauges()   two gauges beside the mark, left and right (a fish's stamina, the line's strain), each with a few
 *              words under it (what is on the line; what to do now); an arrow out on the side to pull to, and a
 *              note between them (how far off the fish is)
 *   hidesMark() the mark is put away while it says so (a fish on the line: the eye is on the water)
 *   quiet()    the HUD steps aside while it says so: no hotbar, and down the right only the thing's own keys
 *   look()     the view is the thing's while it says so (a fish on the line): where it looks and how quickly it
 *              eases there, and how narrow it is (a fish fought closer to the eye). The mouse then does not turn the view: its sideways movement goes to buttons() as
 *              pointerX (the rod pulled over), as the walk's sideways keys go as side while still() holds the walk
 *
 * draws() says the system draws the thing in the hands itself (the rod bending, its line): the game's own model in
 * the hands (held.ts) is not shown then. takesF says the right button is what the thing is for wherever one looks (as
 * with food). drop() is the thing's own way with Q, the put-down key (docs/V3/plan/finish.md §十三: a fish held to
 * the water goes back into it): answered true, the hands' own put-down is not done.
 *
 * Whatever a use's code does wrong is set apart: a call that throws is reported (once per message) and answers as
 * if the use had nothing to say, and the frame goes on.
 */
import { itemDef, type ItemInstance } from '../../../core/modcar/items';
import type { Action } from '../hudItems';

export interface HeldButtons {
  /** the left button: down now, and whether it went down this frame */
  readonly use: boolean;
  readonly useEdge: boolean;
  /** the right button: down now, and whether it went down this frame */
  readonly take: boolean;
  readonly takeEdge: boolean;
  /** the mark is on something the use button works there (a thing lying about, a door, a device) */
  readonly aimed: boolean;
  /** the walk's sideways keys as they are (A/D, the pad's stick): −1 left … 1 right */
  readonly side: number;
  /** the pad's put-down button down now (the keyboard's Q is a press: drop()): a use that takes it answers 4 too, and the hands do not put the thing down */
  readonly drop: boolean;
  /** while look() holds the view: the mouse's sideways movement since the last frame (px; the pad's right stick as if it were one); 0 otherwise */
  readonly pointerX: number;
}

/**
 * a gauge beside the mark: how full (0 … 1), its colour, the marks along it (shares), blinking; bands of its track
 * tinted (from, to: shares; a colour), and its icon's colour (absent: the HUD's cream)
 */
export interface Gauge {
  readonly value: number;
  readonly colour: string;
  readonly ticks?: readonly number[];
  readonly blink?: boolean;
  readonly zones?: readonly { readonly from: number; readonly to: number; readonly colour: string }[];
  readonly icon?: string;
  /** a few words under it (HTML: <b> and coloured spans) */
  readonly label?: string;
  /** how full shown by a needle over its bands (a dial: where the strain is), not by a fill */
  readonly needle?: boolean;
}

/**
 * the gauges beside the mark: the left and the right one; the way to pull now, an arrow out on that side (−1 the left,
 * 1 the right) and how the hands are doing at it (pulling that way and working, idle, the wrong way); a short note
 * between them (how far off the fish is)
 */
export interface Gauges {
  readonly left: Gauge | null;
  readonly right: Gauge | null;
  readonly pull?: { readonly side: -1 | 1; readonly state: 'good' | 'idle' | 'bad'; readonly key: string } | null;
  readonly note?: string;
}

/**
 * where the thing in the hands has the view look: a heading and a pitch (rad, as the walk's), how quickly it eases there
 * (1/s), and the view's height in degrees it narrows to meanwhile (eased; absent: the player's own)
 */
export interface HeldLook {
  readonly yaw: number;
  readonly pitch: number;
  readonly k: number;
  readonly fov?: number;
}

export interface HeldUse {
  /** the hands are at it, whatever the mark is on */
  busy?(item: ItemInstance, slot: number): boolean;
  /** the walk stands still */
  still?(item: ItemInstance, slot: number): boolean;
  /** the buttons this frame: which it took (1 the use button, 2 the take button, 4 the pad's put-down; or'ed together, 0 none) */
  buttons(item: ItemInstance, slot: number, b: HeldButtons, dt: number): number;
  /** what the buttons do now (the line over the hotbar) */
  acts?(item: ItemInstance, slot: number, aimed: boolean, out: Action[]): void;
  /** its own lines down the right */
  keys?(item: ItemInstance, slot: number, out: Action[]): void;
  /** the ring round the mark now; null: none of its own */
  ring?(item: ItemInstance, slot: number): { value: number; colour?: string } | null;
  /** the HUD steps aside now (a fish on the line, a catch held up): no hotbar, only its own keys down the right */
  quiet?(item: ItemInstance, slot: number): boolean;
  /** the mark is put away now (a fish on the line, a catch held up) */
  hidesMark?(item: ItemInstance, slot: number): boolean;
  /** two gauges beside the mark now (either may be null), the way to pull, a note; null: none */
  gauges?(item: ItemInstance, slot: number): Gauges | null;
  /** the view is the thing's now: where it looks; null: the view is the player's */
  look?(item: ItemInstance, slot: number): HeldLook | null;
  /** the card shown for the thing in the hands is another thing's now (a fish held up); null: its own */
  shows?(item: ItemInstance, slot: number): ItemInstance | null;
  /** Q is the thing's now (a fish in the hands goes back into the water with it): the hands' own 放下 is not said */
  takesQ?(item: ItemInstance, slot: number): boolean;
  /** Q pressed: the thing's own way with it; true: done (the hands' own put-down is not), false: not its own now */
  drop?(item: ItemInstance, slot: number): boolean;
  /** it draws the thing in the hands itself */
  draws?(item: ItemInstance): boolean;
  /** the right button is what it is for, wherever one looks */
  readonly takesF?: boolean;
}

const BY_ITEM = new Map<string, HeldUse>();
const BY_CAT = new Map<string, HeldUse>();

/** what a kind of thing (or every kind of a category) does in the hands by itself; once, as its module loads */
export function registerHeldUse(on: { readonly item: string } | { readonly cat: string }, use: HeldUse): void {
  if ('item' in on) {
    if (BY_ITEM.has(on.item)) throw new Error(`a use in the hands is registered for ${on.item} already`);
    BY_ITEM.set(on.item, use);
  } else {
    if (BY_CAT.has(on.cat)) throw new Error(`a use in the hands is registered for the category ${on.cat} already`);
    BY_CAT.set(on.cat, use);
  }
}

/** the use of a thing in the hands, or null when it has none (asked every frame: a lookup, nothing allocated) */
export function heldUseOf(item: ItemInstance): HeldUse | null {
  if (BY_ITEM.size === 0 && BY_CAT.size === 0) return null;
  return BY_ITEM.get(item.item) ?? BY_CAT.get(itemDef(item.item).cat) ?? null;
}

const said = new Set<string>();

/** a use's call, set apart: what it answers, or `none` when it threw (reported once per message) */
export function heldCall<T>(none: T, f: () => T): T {
  try {
    return f();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!said.has(m)) {
      said.add(m);
      console.error('a use in the hands threw:', e);
    }
    return none;
  }
}
