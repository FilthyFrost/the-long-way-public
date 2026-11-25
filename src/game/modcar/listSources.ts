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
 *    make implements ListSource itself, and hands a row over with `intoHands` (which says HANDS_FULL when
 *    nothing went and selects the slot when all did), as the sources here do.
 *
 * Also here, so that it runs without the game or a page: the guard every source is asked through (Guarded: a
 * source that throws is reported and its list shuts), and what the list keeps from frame to frame while it is
 * open and what its keys do (Listing). ModGame holds the one Listing and what the list is open on.
 *
 * Nothing here knows the game but through ListHost, and ModGame is never imported: a system's module may import
 * this file (docs/V3/nodes/N0-foundation.md §7). What it takes as values from player.ts and cargo.ts are three
 * small functions; those two files come with them, and load without a page as this one does
 * (harness/sim/v3_lists.test.ts and v3_world.test.ts run all of it in Node).
 */
import { zoneOf } from '../../core/modcar/cargo';
import { accepts, boxDecay, countOf, hasItem, itemDef, itemMass, itemName, putInside, roomInside, setFreshRate, settleItem, takeInside, type ItemInstance, type WearSlot } from '../../core/modcar/items';
import { massOf, type CargoBay } from './cargo';
import type { CargoRow, CargoView } from './cargoList';
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
   * in it; with rows that go off: also once one of them has turned into another kind since the rows were
   * built). Asked every frame the list is open, so it is cheap and allocates nothing: the rows are built again
   * only when it has changed.
   */
  version(): number | string;
  /** the rows, in the order shown: takeAt(i) takes the i-th of the rows last given */
  rows(): CargoRow[];
  /** what it all weighs (kg); absent: the rows' weights added up */
  load?(): number;
  /**
   * The i-th row into the hands, through ModPlayer.receive (intoHands does it as the sources here do). Only
   * some of a stack going is normal: the rest stays where it was. True when anything went; when nothing did,
   * the source has said why and nothing has changed, the slot selected included.
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
  /** how one is dressed for the air outside: what one wears keeps out, the air out there (°C), and what it would do to one */
  bodyAir?(): { warmth: number; outC: number; feel: '' | 'cold' | 'hot' };
}

// ------------------------------------------------------------------ a source that throws

/** told once when a source threw: its name (what its title last read as; '?' when it never did), what was asked of it, what it threw */
export type ListFault = (title: string, asked: string, error: unknown) => void;

const NO_ROWS: CargoRow[] = [];

/**
 * A source as the game asks it. Whatever its code throws (in near, version, rows, load, takeAt, room, put, or
 * in reading what it is called) is caught here: told once to `fault`, after which the source is gone as far as
 * the list is concerned: near() says false, so the list shuts, and everything else answers harmlessly (no rows,
 * nothing taken, nothing put in). The frame goes on. A safety net, as the kernel's is for a system's devices,
 * not a way of working. A source that throws nothing costs a call more for each thing asked of it, and
 * nothing is allocated on the way.
 */
class Guarded implements ListSource {
  private dead = false;
  private name = '';
  private headWas = '';
  private emptyWas = '';
  private takeWas = '';
  load?: () => number;
  room?: (held: NonNullable<Held>) => number;
  put?: (held: NonNullable<Held>) => number;

  constructor(
    readonly src: ListSource,
    private readonly fault: ListFault,
  ) {
    // (its name first, for the telling)
    void this.title;
    // (what the source may leave out is left out here too: the list asks whether each is there)
    try {
      if (src.load) this.load = (): number => this.askLoad();
      if (src.room) this.room = (held): number => this.askRoom(held);
      if (src.put) this.put = (held): number => this.askPut(held);
    } catch (e) {
      this.fail('load, room, put', e);
    }
  }

  private fail(asked: string, e: unknown): void {
    if (this.dead) return;
    this.dead = true;
    try {
      this.fault(this.name || '?', asked, e);
    } catch {
      // (whoever was to be told threw as well: nothing more can be done about it here)
    }
  }

  get title(): string {
    if (!this.dead) {
      try {
        this.name = this.src.title;
      } catch (e) {
        this.fail('title', e);
      }
    }
    return this.name;
  }

  get head(): string {
    if (!this.dead) {
      try {
        this.headWas = this.src.head;
      } catch (e) {
        this.fail('head', e);
      }
    }
    return this.headWas;
  }

  get empty(): string {
    if (!this.dead) {
      try {
        this.emptyWas = this.src.empty;
      } catch (e) {
        this.fail('empty', e);
      }
    }
    return this.emptyWas;
  }

  get takeWord(): string {
    if (!this.dead) {
      try {
        this.takeWas = this.src.takeWord;
      } catch (e) {
        this.fail('takeWord', e);
      }
    }
    return this.takeWas;
  }

  get shutEmpty(): boolean | undefined {
    if (this.dead) return true;
    try {
      return this.src.shutEmpty;
    } catch (e) {
      this.fail('shutEmpty', e);
      return true;
    }
  }

  get cap(): { readonly slots: number; readonly maxKg?: number } | undefined {
    if (this.dead) return undefined;
    try {
      return this.src.cap;
    } catch (e) {
      this.fail('cap', e);
      return undefined;
    }
  }

  near(): boolean {
    if (this.dead) return false;
    try {
      return this.src.near();
    } catch (e) {
      this.fail('near', e);
      return false;
    }
  }

  version(): number | string {
    if (this.dead) return 0;
    try {
      return this.src.version();
    } catch (e) {
      this.fail('version', e);
      return 0;
    }
  }

  rows(): CargoRow[] {
    if (this.dead) return NO_ROWS;
    try {
      return this.src.rows();
    } catch (e) {
      this.fail('rows', e);
      return NO_ROWS;
    }
  }

  takeAt(i: number): boolean {
    if (this.dead) return false;
    try {
      return this.src.takeAt(i);
    } catch (e) {
      this.fail('takeAt', e);
      return false;
    }
  }

  private askLoad(): number {
    if (this.dead) return 0;
    try {
      return this.src.load!();
    } catch (e) {
      this.fail('load', e);
      return 0;
    }
  }

  private askRoom(held: NonNullable<Held>): number {
    if (this.dead) return 0;
    try {
      return this.src.room!(held);
    } catch (e) {
      this.fail('room', e);
      return 0;
    }
  }

  /** (a source gone, or one that threw half way: as far as the hands are told, none of it went in) */
  private askPut(held: NonNullable<Held>): number {
    if (this.dead) return countOfHeld(held);
    try {
      return this.src.put!(held);
    } catch (e) {
      this.fail('put', e);
      return countOfHeld(held);
    }
  }
}

/** a source as the game asks it: what it throws is told to `fault`, once, and the list shuts (see Guarded) */
export function guardedSource(src: ListSource, fault: ListFault): ListSource {
  return new Guarded(src, fault);
}

// ------------------------------------------------------------------ the desk: how a system opens a list of its own

/** the game as the lists' desk: what the sources work with, and what shows them */
export interface ListDesk extends ListHost {
  /** false: no list opens now (one is at the wheel) */
  openList(src: ListSource): boolean;
  closeCargoList(): void;
}

let desk: ListDesk | null = null;

/** the game says that it shows the lists (ModGame, once, as it is made); null: nobody does */
export function setListDesk(d: ListDesk | null): void {
  desk = d;
}

/** open the list on a source (a system's own: from its device's `use`); false: it did not open (there is no game to show it, or one is at the wheel) */
export function openList(src: ListSource): boolean {
  return !!desk && desk.openList(src);
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

/** what is said when the hands take none of a thing handed to them */
export const HANDS_FULL = '手满了';

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
export function bringUp(p: ModPlayer, h: NonNullable<Held>): void {
  const at = slotOf(p, h);
  if (at >= 0) p.sel = at;
}

/**
 * A thing out of a source into the hands (ModPlayer.receive): how many of it did NOT go. None going is said
 * (HANDS_FULL), and nothing has changed then. Some of a stack going is normal: the same instance stays the
 * source's, fewer. All of it going (0): the source lets go of it, and the slot it sits in, if it has one of
 * its own, is the one selected. For any source's takeAt, a system's own too (`host`: the game, or a system's
 * context: whatever has the player and the words on screen).
 */
export function intoHands(host: Pick<ListHost, 'player' | 'ui'>, h: NonNullable<Held>): number {
  const p = host.player;
  const n = countOfHeld(h);
  const left = p.receive(h);
  if (left >= n) host.ui.say(HANDS_FULL, 2.2);
  else if (left <= 0) bringUp(p, h);
  return left;
}

// ------------------------------------------------------------------ rows that go off

/** a thing that should have turned by this file's sum, and that the core does not turn yet, is looked at again this much later (s of the world's time) */
const TURN_AGAIN = 0.05;

/**
 * The world time at which a thing that goes off will have turned into another kind, its name with it
 * (Infinity: it does not turn into anything, has not started, or keeps for ever where it is). By the instance's
 * own fields as items.ts gives them: `fresh` as of `t0`, running out over its kind's `perish.hours` at the
 * rate `fk`. Asked as rows are built (after they were settled), never per frame: a source keeps the soonest of
 * its rows, and its version() only compares the clock with that.
 */
function turnsAt(x: ItemInstance, now: number): number {
  const f0 = x.fresh;
  const t0 = x.t0;
  if (f0 === undefined || t0 === undefined) return Infinity;
  const p = itemDef(x.item).perish;
  if (!p || p.into === undefined || !hasItem(p.into)) return Infinity;
  const k = x.fk ?? 1;
  if (!(k > 0)) return Infinity;
  const f = f0 < 1 ? f0 : 1;
  const t = f > 0 ? t0 + (f * p.hours * 3600) / k : t0;
  // (due by this sum already, and the core has not turned it: asked again a moment on)
  return t > now ? t : now + TURN_AGAIN;
}

/** the bit of a source's version that says "a row has turned since the rows were built" (the rest is the source's own count or key, kept under it) */
const TURNED = 0x20000000;

// ------------------------------------------------------------------ what rides in a vehicle

class VehicleList implements ListSource {
  readonly head = '车里的东西';
  readonly empty = '车里什么也没有';
  readonly takeWord = '拿出来';
  readonly shutEmpty = true;
  /** the things behind the rows, in the rows' order */
  private things: Loose[] = [];
  /** when the first of the rows that go off will have turned (the world's time; Infinity: none does) */
  private turnAt = Infinity;

  constructor(
    private readonly host: ListHost,
    private readonly v: ModVehicle,
  ) {}

  get title(): string {
    return this.v.view.frame.name.zh;
  }

  /**
   * Standing by it, and it is not driving off. (The distance by a square root written out here, as in the
   * other sources: Math.hypot is a call the engine does not fold in, and the fractions handed to it and back
   * are put on the heap, three of them every frame the list is open.)
   */
  near(): boolean {
    const host = this.host;
    const v = this.v;
    const w = host.player.walker;
    const dx = v.sim.px - w.x;
    const dz = v.sim.pz - w.z;
    return !host.seated && host.vehicles.includes(v) && Math.sqrt(dx * dx + dz * dz) - v.sim.spec.body.halfLength <= 4 && Math.abs(v.sim.kmh) <= 3;
  }

  /** the things lying about as last counted, and whether a row has turned since the rows were built (the clock is not even read while no row goes off) */
  version(): number {
    const rev = this.host.loose.rev & (TURNED - 1);
    return this.turnAt !== Infinity && itemNow() >= this.turnAt ? rev | TURNED : rev;
  }

  /** the things in it, by zone (in the zones' order), then by name */
  rows(): CargoRow[] {
    const host = this.host;
    const frame = this.v.view.frame.id;
    const now = itemNow();
    let turn = Infinity;
    const list = host.cargo
      .ridersOf(this.v)
      .map((l) => {
        // (a thing that has gone off is what it has become before it is named)
        host.loose.settle(l, now);
        if (l.item) turn = Math.min(turn, turnsAt(l.item, now));
        const h = heldOf(l);
        const zone = l.stow ? zoneOf(frame, l.stow) : null;
        return { order: zone?.order ?? 99, row: { zone: zone?.label.zh ?? '车上', name: heldName(h), mass: massOf(h), icon: host.iconOf(h) }, loose: l };
      })
      .sort((a, b) => a.order - b.order || a.row.name.localeCompare(b.row.name));
    this.turnAt = turn;
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
    const left = intoHands(host, h);
    if (left >= n) return false;
    // (all of it: nothing of it lies in the vehicle any more; some: the rest rides on, fewer)
    if (left <= 0) host.loose.remove(l);
    else host.loose.touch(l);
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
  /** when the first of the rows that go off will have turned (the world's time; Infinity: none does) */
  private turnAt = Infinity;

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
    const dx = c.x - w.x;
    const dz = c.z - w.z;
    return !this.host.seated && Math.sqrt(dx * dx + dz * dz) - Math.max(c.hx, c.hz) <= 2.6;
  }

  /** how often what is in it has changed, and whether a row has turned since the rows were built */
  version(): number {
    const rev = this.pc.rev & (TURNED - 1);
    return this.turnAt !== Infinity && itemNow() >= this.turnAt ? rev | TURNED : rev;
  }

  rows(): CargoRow[] {
    const host = this.host;
    const pc = this.pc;
    const now = itemNow();
    let turn = Infinity;
    const rows = (pc.contents ?? []).map((h) => {
      if (h.kind === 'item') {
        // (a thing that has gone off is what it has become before it is named)
        settleItem(h.item, now);
        turn = Math.min(turn, turnsAt(h.item, now));
      }
      return { zone: pc.name, name: heldName(h), mass: massOf(h), icon: host.iconOf(h) };
    });
    this.turnAt = turn;
    return rows;
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
    const left = intoHands(host, h);
    if (left >= n) return false;
    if (left <= 0) list.splice(i, 1);
    // (what is left in it is kept as it stands from now on: places.ts, the save)
    if (host.places) host.places.kept(pc);
    else pc.rev++;
    host.sound('pickup', (kg * (n - left)) / n);
    return true;
  }
}

/** what is in a place's container (a cupboard, a crate, shelves), once it has been searched */
export function placeSource(host: ListHost, pc: PlaceContainer): ListSource {
  return new PlaceList(host, pc);
}

// ------------------------------------------------------------------ what one has on

/** where clothes go, in the order the list shows them, and what the list calls each place */
const WEAR_ORDER: readonly WearSlot[] = ['hat', 'jacket', 'gloves', 'pants', 'shoes'];
const WEAR_ZONE: Record<WearSlot, string> = { hat: '头上', jacket: '身上', gloves: '手上', pants: '腿上', shoes: '脚上' };

/**
 * What one has on (docs/V3/plan/growth.md 定案 5, Arctic Drive's way): the backpack, and the clothes by where they go,
 * each with the warmth it gives (the nightdress under them: 睡裙, its own); a row taken is taken off into the hands
 */
class SelfList implements ListSource {
  readonly title = '我身上';
  readonly empty = '只穿着睡裙';
  readonly takeWord = '脱下来';
  readonly shutEmpty = false;
  /** what each row last given stands for: the backpack, or a place clothes go */
  private readonly rowOf: ('pack' | WearSlot)[] = [];

  constructor(private readonly host: ListHost) {}

  /** the line over the name: how one is dressed for outside — 保暖 10 · 外面 −4 ℃ · 会冷 (docs/V3/plan/finish.md §三.2) */
  get head(): string {
    const a = this.host.bodyAir?.();
    if (!a) return '穿着和背着';
    const c = Math.round(a.outC);
    return `保暖 ${a.warmth} · 外面 ${c < 0 ? '−' : ''}${Math.abs(c)} ℃${a.feel === 'cold' ? ' · 会冷' : a.feel === 'hot' ? ' · 会热' : ''}`;
  }

  near(): boolean {
    return !this.host.seated;
  }

  version(): string {
    const w = this.host.player.worn;
    return `${this.host.player.pack?.uid ?? ''}|${WEAR_ORDER.map((k) => w[k]?.uid ?? '').join(',')}|${this.head}`;
  }

  rows(): CargoRow[] {
    const host = this.host;
    const out: CargoRow[] = [];
    this.rowOf.length = 0;
    const p = host.player.pack;
    if (p) {
      out.push({ zone: '背着', name: `${itemDef(p.item).name.zh}（快捷栏 +${itemDef(p.item).pack?.slots ?? 0} 格）`, mass: itemMass(p), icon: host.iconOf({ kind: 'item', item: p }) });
      this.rowOf.push('pack');
    }
    for (const k of WEAR_ORDER) {
      const it = host.player.worn[k];
      if (!it) continue;
      const d = itemDef(it.item);
      out.push({ zone: WEAR_ZONE[k], name: `${d.name.zh}（保暖 +${d.wear?.warmth ?? 0}）`, mass: itemMass(it), icon: host.iconOf({ kind: 'item', item: it }) });
      this.rowOf.push(k);
    }
    return out;
  }

  /** the row's backpack off, or its piece of clothing, into the hands */
  takeAt(i: number): boolean {
    const host = this.host;
    const what = this.rowOf[i];
    if (what && what !== 'pack') {
      if (host.player.takeOff(what)) {
        host.sound('cloth');
        return true;
      }
      host.ui.say('手上空一只才脱得下来。', 2);
      return false;
    }
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

// ------------------------------------------------------------------ what is in one's hands, beside a vehicle's list

/**
 * The hotbar's things as a list beside a vehicle's (docs/V3/nodes/M1-interact.md): what is in the hands and the
 * slots, so that a thing goes into the vehicle from the lists as well as by putting it in where one looks. Its
 * take is the game's own: the row picked is put into the vehicle (ModGame), the hands being where it already is;
 * `slotOf` says which slot each of the rows last given stands for.
 */
export class HandsList implements ListSource {
  readonly title = '我身上';
  readonly head = '手上和快捷栏';
  readonly empty = '手上和快捷栏里都是空的。';
  readonly takeWord = '放进车里';
  readonly slotOf: number[] = [];

  constructor(private readonly host: ListHost) {}

  near(): boolean {
    return !this.host.seated;
  }

  /** a number that is another whenever what is in the slots is (which things, how many of each); nothing allocated */
  version(): number {
    const s = this.host.player.slots;
    let h = s.length;
    for (let i = 0; i < s.length; i++) {
      const x = s[i];
      if (!x) h = Math.imul(h, 31) + 1;
      else if (x.kind === 'item') h = Math.imul(Math.imul(h, 31) + strKey(x.item.uid), 31) + (x.item.n ?? 1);
      else if (x.kind === 'tool') h = Math.imul(h, 31) + strKey(x.tool.kind) + 3;
      else h = Math.imul(h, 31) + strKey(x.inst.part) + 7;
    }
    return h & (TURNED - 1);
  }

  rows(): CargoRow[] {
    const out: CargoRow[] = [];
    this.slotOf.length = 0;
    const s = this.host.player.slots;
    for (let i = 0; i < s.length; i++) {
      const h = s[i];
      if (!h) continue;
      out.push({ zone: i < 2 ? '快捷栏' : '背包格', name: heldName(h), mass: massOf(h), icon: this.host.iconOf(h) });
      this.slotOf.push(i);
    }
    return out;
  }

  /** (the game puts the picked thing into the vehicle: see the class's note) */
  takeAt(): boolean {
    return false;
  }
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
  // (kept small: a number the engine holds without putting it on the heap, with a bit over it to spare: TURNED)
  return h & (TURNED - 1);
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
  /** what room() last worked out, and what it was asked of: the thing, its kind then, how many of it, what was in the box */
  private roomOf: ItemInstance | null = null;
  private roomKind = '';
  private roomN = -1;
  private roomKey = -1;
  private roomWas = 0;
  /** when the first of the rows that go off will have turned (the world's time; Infinity: none does) */
  private turnAt = Infinity;

  constructor(
    private readonly host: ListHost,
    readonly box: ItemInstance,
    private readonly opts: BoxOpts = {},
  ) {
    const d = itemDef(box.item);
    this.title = opts.title ?? d.name.zh;
    this.head = `${this.title}里的东西`;
    this.empty = `${this.title}是空的`;
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
    const dx = l.x - w.x;
    const dz = l.z - w.z;
    return Math.sqrt(dx * dx + dz * dz) - l.radius <= BOX_REACH;
  }

  /** what is in it (which things, of what kind, how many of each), and whether a row has turned since the rows were built (the clock is not even read while no row goes off) */
  version(): number {
    const key = insideKey(this.box);
    return this.turnAt !== Infinity && itemNow() >= this.turnAt ? key | TURNED : key;
  }

  rows(): CargoRow[] {
    const now = itemNow();
    // a thing that has gone off is what it has become before it is named (a box lying about: through the things
    // lying about, which draw it again and have what it rides in weighed again)
    const l = this.loose();
    if (l) this.host.loose.settle(l, now);
    const list = this.box.inside;
    const out: CargoRow[] = [];
    let turn = Infinity;
    if (list) {
      for (const x of list) {
        if (!l) settleItem(x, now);
        turn = Math.min(turn, turnsAt(x, now));
        out.push({ zone: this.title, name: itemName(x), mass: itemMass(x), icon: this.host.iconOf({ kind: 'item', item: x }) });
      }
    }
    this.turnAt = turn;
    return out;
  }

  /**
   * What is in it changed. Lying about: the things lying about are told which thing it was (lists of them are
   * built again, and a place it belonged to lets it go, so that it is saved with what is in it: places.ts), and
   * a vehicle it rides in is weighed again.
   */
  private changed(): void {
    const l = this.loose();
    if (!l) return;
    this.host.loose.touch(l);
    const on = l.riding?.on;
    if (on) for (const v of this.host.vehicles) if (v === on) this.host.cargo.weigh(v);
  }

  /** what came out of row i and did not go into the hands after all is back in the box, in the row it came out of, going off as the box has it */
  private backIn(i: number, out: ItemInstance, now: number): void {
    const box = this.box;
    const list = (box.inside ??= []);
    list.splice(Math.min(i, list.length), 0, out);
    setFreshRate(out, now, boxDecay(box));
  }

  /**
   * A row out into the hands. The stack leaves the box (so that it is asked about as it is in the open air,
   * which is how it stacks with what the hands hold), the hands take what they have room for, and what they
   * did not take is back in its row, the box as it was. The hands put a thing into a box they hold when it
   * takes such things (ModPlayer.receive), and this box may be in them: they are told to leave it out (`not`),
   * so that what comes out of it does not go straight back in. If the hands throw with the thing out of the
   * box, it is put back before the fault goes on up: a thing is never left nowhere. The slot selected changes
   * only when all of the row went and sits in a slot of its own.
   */
  takeAt(i: number): boolean {
    const host = this.host;
    const p = host.player;
    const now = itemNow();
    const out = takeInside(this.box, i, now);
    if (!out) return false;
    // (a thing that has gone off is what it has become before it is handed over)
    settleItem(out, now);
    const all = countOf(out);
    const each = itemMass(out) / all;
    const held: NonNullable<Held> = { kind: 'item', item: out };
    // how many of it are not in the hands after all
    let back: number;
    try {
      back = p.receive(held, this.box);
    } catch (e) {
      if (countOf(out) > 0 && !inHands(p, out)) this.backIn(i, out, now);
      throw e;
    }
    if (back > 0) this.backIn(i, out, now);
    else bringUp(p, held);
    const took = all - back;
    if (took <= 0) {
      host.ui.say(HANDS_FULL, 2.2);
      return false;
    }
    this.changed();
    host.sound('pickup', each * took);
    return true;
  }

  /**
   * How many of the thing in the hands would go in. The core is asked (roomInside) only when the thing, its
   * kind, its count or what is in the box has changed since the last time: asked again and again in between
   * (the list may, every frame), the answer is the one it has, and nothing is worked out or allocated. (How
   * fresh the things are moves with time, and with it whether two stacks still join: put() asks at the moment
   * it puts, whatever was said here.)
   */
  room(h: NonNullable<Held>): number {
    if (h.kind !== 'item' || h.item === this.box) return 0;
    const it = h.item;
    const n = countOf(it);
    const key = insideKey(this.box);
    if (it !== this.roomOf || it.item !== this.roomKind || n !== this.roomN || key !== this.roomKey) {
      this.roomOf = it;
      this.roomKind = it.item;
      this.roomN = n;
      this.roomKey = key;
      this.roomWas = roomInside(this.box, it, itemNow());
    }
    return this.roomWas;
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

/** is this thing in the hands: in a slot, or in a thing in a slot that holds things? */
function inHands(p: ModPlayer, item: ItemInstance): boolean {
  const s = p.slots;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (!x || x.kind !== 'item') continue;
    if (x.item === item || x.item.inside?.includes(item)) return true;
  }
  return false;
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

// ------------------------------------------------------------------ the list while it is open

/** the hands as the open list needs them (ModPlayer is one) */
export interface ListHands {
  /** what is in the hands: the selected slot (set to null: the hand is empty) */
  held: Held;
  /** something being eaten or drunk from (set to null: that stops) */
  use: object | null;
}

/**
 * What the list keeps from frame to frame while it is open, and what its keys do, apart from the game and the
 * page (ModGame has one; harness/sim/v3_lists.test.ts plays one without either): the rows of the source as last
 * built, built again only when the source says that what is in it has changed; which row is picked after a
 * move or a take; putting the held thing in; and what the list draws (`view`: one object, filled in every
 * frame, drawn again by CargoList only when it differs).
 */
export class Listing {
  /** what the list draws: filled in by frame() */
  readonly view: CargoView = { title: '', head: '', empty: '', take: '', rows: [], rev: 0, sel: 0, load: 0, cap: null, put: '' };
  /** the rows as last built, for which source and at which of its versions */
  private rowsNow: readonly CargoRow[] = [];
  private rowsOf: ListSource | null = null;
  private ver: number | string = '';
  /** frames until a picture still being drawn is asked for again (0: none is) */
  private iconT = 0;
  /** what G would put in: worked out again only when the thing in the hands, its kind, how many of it or the rows have changed */
  private putOf: Held = null;
  private putKind = '';
  private putN = -1;
  private putRev = -1;

  /** the list was shut: nothing is kept of the source it showed */
  reset(): void {
    this.rowsNow = [];
    this.rowsOf = null;
    this.iconT = 0;
    this.putOf = null;
    this.putN = -1;
  }

  /**
   * The rows of a source: built when the source says that what is in it has changed (version), not every
   * frame, and now and then while a picture of one of them is still being drawn. `view.rev` goes up when the
   * rows to draw differ from the last (built again only for a picture: only if one has come). What it all
   * weighs is asked with them, not every frame: a weight changes only when what is in the source does, and a
   * fraction asked for or written down every frame is put on the heap every frame.
   */
  rows(src: ListSource): readonly CargoRow[] {
    const again = this.iconT > 0 && --this.iconT === 0;
    const same = src === this.rowsOf && src.version() === this.ver;
    if (same && !again) return this.rowsNow;
    const was = this.rowsNow;
    const rows = src.rows();
    this.rowsOf = src;
    this.rowsNow = rows;
    // (asked after: building them may itself have settled a thing that had gone off)
    this.ver = src.version();
    let kg = 0;
    let due = false;
    let differs = !same || rows.length !== was.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      kg += r.mass;
      if (r.icon === null) due = true;
      else if (!differs && r.icon !== was[i].icon) differs = true;
    }
    if (differs) this.view.rev++;
    this.view.load = src.load ? src.load() : kg;
    this.iconT = due ? 3 : 0;
    return rows;
  }

  /** the row picked, moved by d round the ends (−1: there are no rows, nothing moves) */
  move(src: ListSource, sel: number, d: number): number {
    const n = this.rows(src).length;
    return n ? (sel + d + n) % n : -1;
  }

  /**
   * The row picked out of the source, into the hands (as much of it as they take). Returns the row picked
   * afterwards: the same one when nothing went or rows are left under it, the last one when it was the last;
   * −1 when the take emptied a source that shuts when it is empty (the list shuts).
   */
  take(src: ListSource, sel: number): number {
    const n = this.rows(src).length;
    if (!n || !src.takeAt(Math.min(sel, n - 1))) return sel;
    const left = this.rows(src).length;
    if (!left && src.shutEmpty) return -1;
    return Math.max(0, Math.min(sel, left - 1));
  }

  /**
   * G: the thing in the hands into the source, as much of it as goes (a source that takes things in; any
   * other: nothing happens). True when all of it went: the hand is empty now (the thing is in there, or was
   * used up onto a stack there).
   */
  put(src: ListSource, hands: ListHands): boolean {
    const h = hands.held;
    if (!src.put || !h) return false;
    // (being eaten or drunk from: that stops)
    hands.use = null;
    if (src.put(h) > 0) return false;
    hands.held = null;
    return true;
  }

  /**
   * Every frame the list is open: is the source still within reach (−1: it is not, the list shuts); its rows;
   * the row picked, kept within them (returned); what G would put in, said only while it would go in; and all
   * of it into `view`. Nothing is allocated while nothing changes.
   */
  frame(src: ListSource, sel: number, held: Held): number {
    if (!src.near()) return -1;
    const rows = this.rows(src);
    sel = Math.max(0, Math.min(sel, rows.length - 1));
    const view = this.view;
    const h = src.put ? held : null;
    const n = h ? countOfHeld(h) : 0;
    // (a thing that turns in the hands is another kind under the same instance: its name is another)
    const kind = h && h.kind === 'item' ? h.item.item : '';
    if (h !== this.putOf || kind !== this.putKind || n !== this.putN || view.rev !== this.putRev) {
      this.putOf = h;
      this.putKind = kind;
      this.putN = n;
      this.putRev = view.rev;
      const room = h ? Math.min(n, src.room ? src.room(h) : n) : 0;
      view.put = h && room > 0 ? (room < n ? `${heldName(h)}（放得下 ${room} 个）` : heldName(h)) : '';
    }
    view.title = src.title;
    view.head = src.head;
    view.empty = src.empty;
    view.take = src.takeWord;
    view.rows = rows;
    view.sel = sel;
    view.cap = src.cap ?? null;
    return sel;
  }
}
