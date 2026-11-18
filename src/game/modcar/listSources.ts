/**
 * What the list shows (cargoList.ts): its sources (docs/V3/nodes/N0-items-world.md).
 *
 * The list was three things wired into the game: what rides in a vehicle, what is in a place's cupboard, what
 * one has on. Each is a `ListSource` now, and so is anything else that holds things: a container ITEM (a kind
 * with ItemDef.holds: a basket, a creel, a quiver, a box of cartridges) is listed by what is in it, things are
 * taken out of it into the hands and the thing in the hands is put into it; a system's own box in the world (a
 * fridge, a stash) is one more, opened by the system itself.
 *
 * A source says what it is called, gives its rows, takes a row out into the hands, may take the thing in the
 * hands in, and says whether it is still within reach. The game (ModGame, "what is in a vehicle (Tab)") shows
 * whichever is open, with the keys the list has always had, and G for putting in.
 *
 * Opening one:
 *  - a container item needs nothing: Tab opens the one the mark is on (lying within reach), else the one in the
 *    hands (boxOnMark, boxInHand; the game asks them before a vehicle or what one has on);
 *  - a system's own: `openList(source)`, from its device's `use`. Its box is an ItemInstance of a kind that
 *    holds things, kept and saved by the system: `boxList(box, { near })` is its source. A source of another
 *    make implements ListSource itself.
 *
 * Nothing here knows the game but through ListHost, so a module that imports this file imports no class of the
 * game as a value.
 */
import { zoneOf } from '../../core/modcar/cargo';
import { accepts, countOf, itemDef, itemMass, itemName, putInside, roomInside, setFreshRate, settleItem, takeInside, type ItemInstance } from '../../core/modcar/items';
import { massOf, type CargoBay } from './cargo';
import type { CargoRow } from './cargoList';
import { itemNow } from './itemTime';
import type { Loose, LooseThings } from './loose';
import type { PlaceContainer, Places } from './places';
import { heldName, heldOf, type Held, type ModPlayer } from './player';
import type { ModVehicle } from './vehicle';

/** something whose contents the list shows */
export interface ListSource {
  /** the name over the rows ("轿车", "橱柜", "试验篮") */
  readonly title: string;
  /** the small line over the name ("车里的东西") */
  readonly head: string;
  /** what the list says when there is nothing in it */
  readonly empty: string;
  /** what E does to the row picked, in a word ("拿出来") */
  readonly takeWord: string;
  /** a take that leaves it empty shuts the list (a vehicle's, a cupboard's); absent: it stays open, empty (a basket being filled) */
  readonly shutEmpty?: boolean;
  /** what it holds at most (so many stacks, so much weight): shown with the count and the weight; absent: nothing to show */
  readonly cap?: { readonly slots: number; readonly maxKg?: number };
  /** still there and within reach? false: the list shuts. Asked every frame the list is open. */
  near(): boolean;
  /**
   * A value that changes whenever rows() would give something else (a change counter, a number made of what is
   * in it). Asked every frame the list is open, so it is cheap and allocates nothing: the rows are built again
   * only when it has changed.
   */
  version(): number | string;
  /** the rows, in the order shown: takeAt(i) takes the i-th of the rows last given */
  rows(): CargoRow[];
  /** what it all weighs (kg); absent: the rows' weights added up */
  load?(): number;
  /**
   * The i-th row into the hands, through ModPlayer.receive. Only some of a stack going is normal: the rest
   * stays where it was. True when anything went; when nothing did, the source has said why.
   */
  takeAt(i: number): boolean;
  /** how many of the thing in the hands would go in now (0: none); changes nothing and allocates nothing. Absent with `put`: all of it. */
  room?(held: NonNullable<Held>): number;
  /**
   * The thing in the hands goes in: how many of it did NOT (0: all of it, and the game empties the hand: the
   * thing is in here now, or was used up onto a stack). Absent: nothing is put into this source from its list.
   */
  put?(held: NonNullable<Held>): number;
}

/** what the sources need of the game (ModGame is one) */
export interface ListHost {
  readonly player: ModPlayer;
  readonly loose: LooseThings;
  readonly cargo: CargoBay;
  readonly vehicles: readonly ModVehicle[];
  readonly seated: ModVehicle | null;
  readonly places: Places | null;
  readonly ui: { say(text: string, seconds?: number): void };
  /** the picture of a thing (null while it is drawn) */
  iconOf(h: NonNullable<Held>): string | null;
  /** a sound by name; `gain` is a weight (kg) for a thing picked up or put down */
  sound(name: string, gain?: number, mount?: string): void;
}

// ------------------------------------------------------------------ the desk: how a system opens a list of its own

/** the game as the lists' desk: what the sources work with, and what shows them */
export interface ListDesk extends ListHost {
  openList(src: ListSource): void;
  closeCargoList(): void;
}

let desk: ListDesk | null = null;

/** the game says that it shows the lists (ModGame, once, as it is made); null: nobody does */
export function setListDesk(d: ListDesk | null): void {
  desk = d;
}

/** open the list on a source (a system's own: from its device's `use`); false: there is no game to show it */
export function openList(src: ListSource): boolean {
  if (!desk) return false;
  desk.openList(src);
  return true;
}

/** shut the list, whatever it shows */
export function closeList(): void {
  desk?.closeCargoList();
}

/**
 * The source of a system's own box in the world (a fridge, a stash): `box` is an ItemInstance of a kind that
 * holds things, which the system keeps and saves; `near` says while one stands by it. null: there is no game.
 */
export function boxList(box: ItemInstance, opts: BoxOpts & { near(): boolean }): ListSource | null {
  return desk ? boxSource(desk, box, opts) : null;
}

// ------------------------------------------------------------------ into the hands

/** how far a box lying about may be for Tab to open it along the line of sight, and how far off its list stays open (m) */
const MARK_REACH = 2.6;
const BOX_REACH = 2.8;

const FULL = '两只手都占着：先放下一件（长按 G）。';

/** how many a thing in the hands is (a stack counts its count; a part or a tool is one) */
export function countOfHeld(h: NonNullable<Held>): number {
  return h.kind === 'item' ? countOf(h.item) : 1;
}

/** the slot a thing is in (−1: none): the thing itself, whatever wraps it */
function slotOf(p: ModPlayer, h: NonNullable<Held>): number {
  const s = p.slots;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (!x) continue;
    if (x === h) return i;
    if (x.kind === 'item' ? h.kind === 'item' && x.item === h.item : x.kind === 'part' ? h.kind === 'part' && x.inst === h.inst : h.kind === 'tool' && x.tool === h.tool) return i;
  }
  return -1;
}

/** the slot an item is in (−1: none) */
function slotOfItem(p: ModPlayer, item: ItemInstance): number {
  const s = p.slots;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (x && x.kind === 'item' && x.item === item) return i;
  }
  return -1;
}

/**
 * A thing taken out of a list is in the hands: the slot it went into is the one selected, as it always was.
 * (One that went onto a stack or into a box in a slot is in no slot of its own: the hands stay as they are.)
 */
function bringUp(p: ModPlayer, h: NonNullable<Held>): void {
  const at = slotOf(p, h);
  if (at >= 0) p.sel = at;
}

/**
 * A thing into the hands (ModPlayer.receive): how many of its `n` did NOT go. None going is said. Some of a
 * stack going is normal: the same instance stays where it was, fewer.
 */
function intoHands(host: ListHost, h: NonNullable<Held>, n: number): number {
  const p = host.player;
  const left = p.roomFor(h) > 0 ? p.receive(h) : n;
  if (left >= n) host.ui.say(FULL, 2.2);
  return left;
}

// ------------------------------------------------------------------ what rides in a vehicle

class VehicleList implements ListSource {
  readonly head = '车里的东西';
  readonly empty = '车里什么也没有。拿着东西看着车按 E 放进去，或者长按 G 收进车里。';
  readonly takeWord = '拿出来';
  readonly shutEmpty = true;
  /** the things behind the rows, in the rows' order */
  private things: Loose[] = [];

  constructor(
    private readonly host: ListHost,
    private readonly v: ModVehicle,
  ) {}

  get title(): string {
    return this.v.view.frame.name.zh;
  }

  /** standing by it, and it is not driving off */
  near(): boolean {
    const host = this.host;
    const v = this.v;
    const w = host.player.walker;
    return !host.seated && host.vehicles.includes(v) && Math.hypot(v.sim.px - w.x, v.sim.pz - w.z) - v.sim.spec.body.halfLength <= 4 && Math.abs(v.sim.kmh) <= 3;
  }

  version(): number {
    return this.host.loose.rev;
  }

  /** the things in it, by zone (in the zones' order), then by name */
  rows(): CargoRow[] {
    const host = this.host;
    const frame = this.v.view.frame.id;
    const now = itemNow();
    const list = host.cargo
      .ridersOf(this.v)
      .map((l) => {
        // (a thing that has gone off is what it has become before it is named)
        host.loose.settle(l, now);
        const h = heldOf(l);
        const zone = l.stow ? zoneOf(frame, l.stow) : null;
        return { order: zone?.order ?? 99, row: { zone: zone?.label.zh ?? '车上', name: heldName(h), mass: massOf(h), icon: host.iconOf(h) }, loose: l };
      })
      .sort((a, b) => a.order - b.order || a.row.name.localeCompare(b.row.name));
    this.things = list.map((x) => x.loose);
    return list.map((x) => x.row);
  }

  /** the load as the vehicle carries it */
  load(): number {
    return this.host.cargo.loadOf(this.v);
  }

  takeAt(i: number): boolean {
    const host = this.host;
    const l = this.things[i];
    if (!l || l.riding?.on !== this.v || !host.loose.list.includes(l)) return false;
    host.loose.settle(l, itemNow());
    const h = heldOf(l);
    const n = countOfHeld(h);
    const kg = massOf(h);
    const left = intoHands(host, h, n);
    if (left >= n) return false;
    // (all of it: nothing of it lies in the vehicle any more; some: the rest rides on, fewer)
    if (left <= 0) host.loose.remove(l);
    else host.loose.touch();
    bringUp(host.player, h);
    host.cargo.weigh(this.v);
    host.sound('pickup', (kg * (n - left)) / n);
    return true;
  }
}

/** what rides in a vehicle: every thing in it, by where it is (the boot, the bed, a seat) */
export function vehicleSource(host: ListHost, v: ModVehicle): ListSource {
  return new VehicleList(host, v);
}

// ------------------------------------------------------------------ a place's container

class PlaceList implements ListSource {
  readonly title: string;
  readonly head: string;
  readonly empty: string;
  readonly takeWord = '拿出来';
  readonly shutEmpty = true;

  constructor(
    private readonly host: ListHost,
    private readonly pc: PlaceContainer,
  ) {
    this.title = pc.name;
    this.head = `${pc.name}里的东西`;
    this.empty = `${pc.name}里什么也没有了。`;
  }

  /** (walked off from it: the list shuts) */
  near(): boolean {
    const c = this.pc.c;
    const w = this.host.player.walker;
    return !this.host.seated && Math.hypot(c.x - w.x, c.z - w.z) - Math.max(c.hx, c.hz) <= 2.6;
  }

  version(): number {
    return this.pc.rev;
  }

  rows(): CargoRow[] {
    const host = this.host;
    const pc = this.pc;
    const now = itemNow();
    return (pc.contents ?? []).map((h) => {
      if (h.kind === 'item') settleItem(h.item, now);
      return { zone: pc.name, name: heldName(h), mass: massOf(h), icon: host.iconOf(h) };
    });
  }

  takeAt(i: number): boolean {
    const host = this.host;
    const pc = this.pc;
    const list = pc.contents;
    const h = list?.[i];
    if (!list || !h) return false;
    if (h.kind === 'item') settleItem(h.item, itemNow());
    const n = countOfHeld(h);
    const kg = massOf(h);
    const left = intoHands(host, h, n);
    if (left >= n) return false;
    if (left <= 0) list.splice(i, 1);
    // (what is left in it is kept as it stands from now on: places.ts, the save)
    if (host.places) host.places.kept(pc);
    else pc.rev++;
    bringUp(host.player, h);
    host.sound('pickup', (kg * (n - left)) / n);
    return true;
  }
}

/** what is in a place's container (a cupboard, a crate, shelves), once it has been searched */
export function placeSource(host: ListHost, pc: PlaceContainer): ListSource {
  return new PlaceList(host, pc);
}

// ------------------------------------------------------------------ what one has on

class SelfList implements ListSource {
  readonly title = '我身上';
  readonly head = '身上的东西';
  readonly empty = '身上没背东西。拿着背包长按 F 背上。';
  readonly takeWord = '取下来';
  readonly shutEmpty = true;

  constructor(private readonly host: ListHost) {}

  near(): boolean {
    return !this.host.seated;
  }

  version(): string {
    return this.host.player.pack?.uid ?? '';
  }

  rows(): CargoRow[] {
    const p = this.host.player.pack;
    return p ? [{ zone: '背着', name: `${itemDef(p.item).name.zh}（快捷栏 +${itemDef(p.item).pack?.slots ?? 0} 格）`, mass: itemMass(p), icon: this.host.iconOf({ kind: 'item', item: p }) }] : [];
  }

  /** the backpack off, into the hands */
  takeAt(): boolean {
    const host = this.host;
    if (!host.player.pack) return false;
    if (host.player.wearPack(null)) {
      host.sound('cloth');
      return true;
    }
    host.ui.say('先把背包那几格里的东西拿出来，手上也要空一只。', 2.4);
    return false;
  }
}

/** what one has on: the backpack */
export function selfSource(host: ListHost): ListSource {
  return new SelfList(host);
}

// ------------------------------------------------------------------ a thing that holds things

export interface BoxOpts {
  /** still within reach? (a system's own box in the world says so; absent: the box is an item, in the hands or lying within reach) */
  near?(): boolean;
  /** the name over the rows (absent: the box's kind's) */
  title?: string;
}

/** a number that is another whenever what is in a box is (which things, of what kind now, how many of each); nothing allocated: asked every frame */
function insideKey(box: ItemInstance): number {
  const list = box.inside;
  if (!list) return 0;
  let h = list.length;
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    h = Math.imul(h, 31) + strKey(x.uid);
    h = Math.imul(h, 31) + strKey(x.item);
    h = Math.imul(h, 31) + (x.n ?? 1);
  }
  // (kept small: a number the engine holds without putting it on the heap)
  return h & 0x3fffffff;
}

function strKey(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i);
  return h | 0;
}

class BoxList implements ListSource {
  readonly title: string;
  readonly head: string;
  readonly empty: string;
  readonly takeWord = '拿出来';
  readonly cap: { readonly slots: number; readonly maxKg?: number };
  /** where it lies, when it lies about (looked for again only when the things lying about have changed) */
  private lying: Loose | null = null;
  private lyingRev = -1;

  constructor(
    private readonly host: ListHost,
    readonly box: ItemInstance,
    private readonly opts: BoxOpts = {},
  ) {
    const d = itemDef(box.item);
    this.title = opts.title ?? d.name.zh;
    this.head = `${this.title}里的东西`;
    this.empty = `${this.title}是空的。把能装的东西拿在手里，按 G 放进来。`;
    this.cap = d.holds ?? { slots: 0 };
  }

  /** the loose thing the box is, while it lies about */
  private loose(): Loose | null {
    const L = this.host.loose;
    if (this.lyingRev !== L.rev) {
      this.lyingRev = L.rev;
      this.lying = null;
      const list = L.list;
      for (let i = 0; i < list.length; i++) {
        if (list[i].item === this.box) {
          this.lying = list[i];
          break;
        }
      }
    }
    return this.lying;
  }

  /** in the hands (any slot), or lying within reach: put down and walked away from, stowed far off or ground up, the list shuts */
  near(): boolean {
    const host = this.host;
    if (host.seated) return false;
    if (this.opts.near) return this.opts.near();
    if (slotOfItem(host.player, this.box) >= 0) return true;
    const l = this.loose();
    if (!l) return false;
    const w = host.player.walker;
    return Math.hypot(l.x - w.x, l.z - w.z) - l.radius <= BOX_REACH;
  }

  version(): number {
    return insideKey(this.box);
  }

  rows(): CargoRow[] {
    const list = this.box.inside;
    if (!list) return [];
    const now = itemNow();
    const out: CargoRow[] = [];
    for (const x of list) {
      // (a thing that has gone off is what it has become before it is named)
      settleItem(x, now);
      out.push({ zone: this.title, name: itemName(x), mass: itemMass(x), icon: this.host.iconOf({ kind: 'item', item: x }) });
    }
    return out;
  }

  /** what is in it changed: a vehicle it rides in is weighed again, and lists of the things lying about are built again */
  private changed(): void {
    const l = this.loose();
    if (!l) return;
    this.host.loose.touch();
    const on = l.riding?.on;
    if (on) for (const v of this.host.vehicles) if (v === on) this.host.cargo.weigh(v);
  }

  /**
   * A row out into the hands. The hands put a thing into a box they hold when it takes it (ModPlayer.receive),
   * and this box may be in them: it steps out of its slot while its own thing is handed over, so that what
   * comes out of it does not go straight back in, and is in its slot again after. What the hands found no room
   * for is back in the box, where it was.
   */
  takeAt(i: number): boolean {
    const host = this.host;
    const box = this.box;
    const p = host.player;
    const s = box.inside?.[i];
    if (!s) return false;
    const now = itemNow();
    settleItem(s, now);
    const all = countOf(s);
    const each = itemMass(s) / all;
    const at = slotOfItem(p, box);
    const mine = at >= 0 ? p.slots[at] : null;
    if (at >= 0) p.slots[at] = null;
    // as many as the hands say they have room for: the rest never leaves the box
    const k = Math.min(all, p.roomFor({ kind: 'item', item: s }));
    const out = k > 0 ? takeInside(box, i, now, k) : null;
    const held: Held = out ? { kind: 'item', item: out } : null;
    // how many of the k are not in the hands after all
    let back = held ? p.receive(held) : k;
    if (at >= 0) {
      const here = p.slots[at];
      p.slots[at] = mine;
      if (here) {
        // (with the box out of it its slot read as free: what was put there moves to a slot that is, or did not go)
        const free = p.slots.findIndex((x) => !x);
        if (free >= 0) p.slots[free] = here;
        else if (out) back = countOf(out);
      }
    }
    if (out && held) {
      if (back <= 0) bringUp(p, held);
      else if (out === s) {
        // the whole stack had come out: what is left of it is back where it was, going off as the box has it
        const list = (box.inside ??= []);
        list.splice(Math.min(i, list.length), 0, out);
        setFreshRate(out, now, itemDef(box.item).holds?.decay ?? 1);
      } else if (putInside(box, out, now) > 0) {
        // (it came off a stack that is still there, so it goes back onto it; if ever it did not, it is put down at one's feet: nothing is lost)
        host.loose.addItem(out, p.eye.x + p.dir.x * 0.5, p.eye.y - 0.3, p.eye.z + p.dir.z * 0.5);
      }
    }
    const took = k - back;
    if (took <= 0) {
      host.ui.say(FULL, 2.2);
      return false;
    }
    this.changed();
    host.sound('pickup', each * took);
    return true;
  }

  room(h: NonNullable<Held>): number {
    return h.kind === 'item' && h.item !== this.box ? roomInside(this.box, h.item, itemNow()) : 0;
  }

  /** the thing in the hands into the box, as much of it as goes (the box itself never goes into itself) */
  put(h: NonNullable<Held>): number {
    const host = this.host;
    const all = countOfHeld(h);
    if (h.kind !== 'item') {
      host.ui.say(`${this.title}不装这种东西。`, 2.2);
      return all;
    }
    if (h.item === this.box) {
      host.ui.say(`要放进${this.title}的东西，先按它那一格的数字键拿到手里。`, 2.6);
      return all;
    }
    const kg = itemMass(h.item);
    const left = putInside(this.box, h.item, itemNow());
    if (left >= all) {
      host.ui.say(accepts(this.box, h.item) ? `${this.title}装不下了。` : `${this.title}不装这种东西。`, 2.2);
      return left;
    }
    this.changed();
    host.sound('putdown', (kg * (all - left)) / all);
    return left;
  }
}

/** what is in a thing that holds things (ItemDef.holds): taken out into the hands, the thing in the hands put in */
export function boxSource(host: ListHost, box: ItemInstance, opts?: BoxOpts): ListSource {
  return new BoxList(host, box, opts);
}

/** does this loose thing hold things? */
function isBox(l: Loose): boolean {
  return !!l.item && !!itemDef(l.item.item).holds;
}

/** the thing that holds things along the line of sight, lying within reach (null: none) */
export function boxOnMark(host: ListHost): ItemInstance | null {
  const p = host.player;
  return host.loose.pick(p.eye, p.dir, MARK_REACH, isBox)?.loose.item ?? null;
}

/** the thing that holds things in the hands: in the slot selected (null: that is something else) */
export function boxInHand(host: ListHost): ItemInstance | null {
  const h = host.player.held;
  return h && h.kind === 'item' && itemDef(h.item.item).holds ? h.item : null;
}
