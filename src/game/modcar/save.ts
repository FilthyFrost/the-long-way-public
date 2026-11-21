/**
 * The game in progress kept in the browser (localStorage), so a reload or a closed tab goes on where it
 * stopped: the vehicles as built (every part's wear, paint and fluids, the fuel in the tank), the things
 * lying about in the workshop and the one in the hands, the checklist, where one stands, the hour; on the
 * road, the vehicle and how far along the road it is. Written every half minute and when the page goes
 * out of sight.
 *
 * Reading is strict about what a vehicle is built of and tolerant about what one carries. A frame or a part
 * this build does not know sets the whole save aside (not deleted: a later build may read it again) and a
 * new game begins. A thing of a kind the catalogue does not have (a system that is not in this build, a
 * kind renamed since) is left out, wherever it was held — in a slot of the hotbar, on the floor, riding in a
 * vehicle or a wreck, in a place's container, in a basket — counted, and everything else is read
 * (docs/V3/nodes/N0-items.md). Every thing one carries is made sound as it is read (items.ts cleanItem), its
 * uid and those of what is in it are kept from being given out again, and what goes off without a time to
 * count from starts at the time of the save's own clock.
 *
 * Where a save holds things is known in ONE place, `thingLists`: checking, the uids and the tolerant
 * reading all walk that, and so does writing, which never writes a stack used up.
 *
 * A save says which world it was made in (`SavedWorld`: the seed, and since there are versions of the
 * generator its version, how many regions it knows and its revision). A world this build cannot make again — a
 * version it does not have, more regions than its registry holds — sets the save aside like a vehicle it does
 * not know, and `loadRefusal` says why. What is done with a save of a revision other than this build's is in
 * worldSave.ts.
 */
import { fitAxles, reserveUids } from '../../core/modcar/build';
import { frameDef } from '../../core/modcar/frames';
import { cleanItem, forEachItem, hasItem, newItem, reserveItemUids, stampFresh, type ItemInstance, type LoadLoss } from '../../core/modcar/items';
import type { Vitals } from '../../core/modcar/vitals';
import type { Stock } from '../../core/modcar/crafting';
import type { WorkshopSave } from './workshop';
import type { WrecksSave } from './wrecks';
import type { PlacesSave } from './places';
import { partDef } from '../../core/modcar/parts';
import { TOOL_INFO, newTool, reserveToolUids, type Tool } from '../../core/modcar/tools';
import type { Build, PartInstance, Text } from '../../core/modcar/types';
import { WorldClock, type ClockSave } from '../../core/kernel/clock';
import type { SliceRecord } from '../../core/kernel/slices';
import { handRegions } from '../../core/world/biomes';
import { rulesFor, type WorldVersion } from '../../core/world/rules';
import { itemNow } from './itemTime';

export interface SavedVehicle {
  build: Build;
  x: number;
  z: number;
  yaw: number;
  radioOn?: boolean;
  radioSong?: number;
  /** in a world of version 2: how far along the road its nearest road point is (m), to be stood on the road again there if the generator's revision changes (worldSave.ts) */
  s?: number;
}

/**
 * Which world a save was made in. A save from before there were versions of the generator holds the seed
 * alone and is of version 1, as is every save of a version 1 world still: its shape has not changed.
 */
export interface SavedWorld {
  seed: number;
  /** the generator's version (core/world/rules.ts); absent: 1 */
  version?: WorldVersion;
  /** how many regions of the registry the world knows; absent: the version's own count (version 1: its six) */
  regionCount?: number;
  /** version 2: the generator's revision the save was written under (rules.ts WORLD_REV); absent in version 1, which has none */
  rev?: number;
  /**
   * Version 2: the kind of every place the save remembers something of (a container searched, a pump's litres,
   * a wreck kept or taken, a door), by the place's id. A generator of another revision may stand another place
   * on that stretch under the same id: what was remembered of a place that is no longer of its kind is forgotten.
   */
  sites?: Record<string, string>;
}

export interface SavedLoose {
  part?: PartInstance;
  tool?: Tool;
  item?: ItemInstance;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** riding on a vehicle (its index in `vehicles`): where in its frame, turned how; in which of its zones */
  on?: number;
  pos?: number[];
  rot?: number[];
  zone?: string;
  lie?: 'z' | 'x';
  /** in a world of version 2, lying about beyond the yard: how far along the road its nearest road point is (m) */
  s?: number;
}

export interface SaveV1 {
  v: 1;
  /** when it was written (ms since 1970) */
  at: number;
  place: 'garage' | 'road';
  /** the clock's hour */
  hour: number;
  /** the checklist's steps done */
  done: string[];
  vehicles: SavedVehicle[];
  loose: SavedLoose[];
  /** where one stands (`s`, in a world of version 2: how far along the road that is, m) */
  player: { x: number; z: number; heading: number; s?: number };
  /** the hotbar: what is in each slot, and which is in the hands (absent in older saves: they put it down) */
  hands?: ({ part?: PartInstance; tool?: Tool; item?: ItemInstance } | null)[];
  sel?: number;
  /** the backpack one has on (its slots are the hands' after the first two) */
  pack?: ItemInstance;
  /** the body: health, stamina, food, water, temperature, the bladder, what lasts a while */
  body?: Vitals;
  /** the materials (scrap, organics, chemicals: shared counts, docs/MODCAR.md §14) */
  stock?: Stock;
  /** the workshop's machines: the generator's tank and whether it runs, the recipes unlocked */
  workshop?: WorkshopSave;
  /** on the road: how far along it the vehicle is (m), on which road (the world: its seed, and what `world` says of it) */
  road?: SavedWorld & { s: number };
  /**
   * The workshop a place in the world (docs/MODCAR.md §17): which world (its seed, and the generator that made
   * it). Everything is where it was in it, in the yard or down the road; the vehicle one sat in (an index into
   * `vehicles`), to sit in it again.
   */
  world?: SavedWorld;
  seat?: number;
  /** … and which of its front seats, when not the driver's (docs/V3/nodes/M1-interact.md) */
  seatAt?: 'pass';
  /** walking about inside a vehicle's living space (an index into `vehicles`), where in it and facing which way (docs/V3/nodes/M2-rv.md) */
  aboard?: { v: number; x: number; z: number; yaw: number };
  /** the wrecks by the road (docs/MODCAR.md §19): the ones kept as they were left, by id; the ones taken (vehicles of one's own now) */
  wrecks?: WrecksSave;
  /** the places by the road (§20): the containers searched and what is left in them, the pumps' litres, the things taken */
  places?: PlacesSave;
  /**
   * The V3 systems' parts of the save (core/kernel/slices.ts), by slice id: the version each was written with
   * and its data. Read back slice by slice, tolerantly: one that does not read never sets the save aside, and
   * one this build does not know is kept as it is. Absent in older saves and while no system keeps anything.
   */
  slices?: SliceRecord;
  /**
   * The world's clock (core/kernel/clock.ts): the day and the hour of the journey, and the hour it began at.
   * Absent in older saves: their journey's clock begins at the hour they were saved at.
   */
  clock?: ClockSave;
}

const KEY = 'modcar.save.v1';

// ------------------------------------------------------------------ where a save holds things

/** one place in a save where a thing is held: a part, a tool, or a thing one carries (one of the three) */
export type SavedSlot = { part?: PartInstance; tool?: Tool; item?: ItemInstance };

interface ThingList {
  list: (SavedSlot | null)[];
  /** its places are the hotbar's slots: one that is emptied stays, empty; elsewhere what holds nothing is taken out of the list */
  slots: boolean;
}

/**
 * Every list of a save whose entries hold things: THE one place that knows where a save keeps them. What
 * lies about and what rides in one's own vehicles; the hotbar; what rides in the wrecks kept as they were
 * left; what is left in the places' containers. (The backpack one has on is the one thing held outside a
 * list: `walkThings` and `forEachSavedItem` take it after these.)
 *
 * A holder added to the save's shape is added HERE, and writes the whole thing (an ItemInstance, not its
 * id): then it is checked, cleaned, counted and its uids are kept like the rest. The systems' slices are not
 * walked: each slice reads its own part of the save, and keeps the uids of the things in it itself.
 */
function thingLists(s: SaveV1): ThingList[] {
  const out: ThingList[] = [];
  if (Array.isArray(s.loose)) out.push({ list: s.loose, slots: false });
  if (Array.isArray(s.hands)) out.push({ list: s.hands, slots: true });
  const kept: unknown = s.wrecks?.kept;
  if (kept && typeof kept === 'object') for (const w of Object.values(kept as WrecksSave['kept'])) if (w && Array.isArray(w.loose)) out.push({ list: w.loose, slots: false });
  const left: unknown = s.places?.left;
  if (left && typeof left === 'object') for (const list of Object.values(left as PlacesSave['left'])) if (Array.isArray(list)) out.push({ list, slots: false });
  return out;
}

/**
 * The ONE walk over everything a save holds: `keep` is handed every slot that holds something (the backpack
 * one has on as a slot of its own) and says whether it stays; it may put another thing in the slot's place.
 * What does not stay is taken out of its list — in the hotbar its slot is emptied, so the other slots stay
 * where they are and a selected slot that held it is an empty one — and the backpack is taken off.
 */
function walkThings(s: SaveV1, keep: (slot: SavedSlot) => boolean): void {
  for (const { list, slots } of thingLists(s)) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const slot = list[i];
      const stays = slot !== null && typeof slot === 'object' && keep(slot);
      if (slots) {
        if (!stays) list[i] = null;
      } else if (stays) list[n++] = slot;
    }
    if (!slots) list.length = n;
  }
  if (s.pack !== undefined) {
    const slot: SavedSlot = { item: s.pack };
    if (keep(slot) && slot.item) s.pack = slot.item;
    else delete s.pack;
  }
}

/** every thing one carries that a save holds, wherever it is held, each with what is in it (nothing is changed) */
export function forEachSavedItem(s: SaveV1, fn: (x: ItemInstance, box: ItemInstance | null) => void): void {
  for (const { list } of thingLists(s)) for (const slot of list) if (slot && typeof slot === 'object' && slot.item) forEachItem(slot.item, fn);
  if (s.pack) forEachItem(s.pack, fn);
}

// ------------------------------------------------------------------ reading

/** what the last loadSave left out: how many things (a stack counts its count) of kinds this build does not have, and which kinds */
let lost: LoadLoss & { kinds: string[] } = { unknown: 0, kinds: [] };

/** what the last loadSave could not read back: things of kinds this build does not have (0 after a load that read everything, and when nothing was loaded) */
export function loadLoss(): Readonly<LoadLoss & { kinds: readonly string[] }> {
  return lost;
}

/** why the last loadSave set the save aside, where there are words for it (null: it read, there was none, or it was no save at all) */
let refused: Text | null = null;

/** why the last loadSave set the save aside and a new game began: the line for the player, and for the log (null: nothing to say) */
export function loadRefusal(): Text | null {
  return refused;
}

/** a save that cannot be gone on with, and the line that says why */
class Refusal extends Error {
  constructor(readonly words: Text) {
    super(words.en);
  }
}

/** the world a save names (the one world with the workshop in it, else the road of a save from before it); null: it names none */
export function worldOfSave(s: SaveV1): SavedWorld | null {
  const w: unknown = s.world ?? s.road;
  return w && typeof w === 'object' ? (w as SavedWorld) : null;
}

/**
 * Can this build make the save's world again? It cannot when the save is of a version of the generator it
 * does not have, or of a world that knows more regions than its registry holds (a save from a later build):
 * then this throws, with the line that says so. (The world itself is asked: rulesFor is what would throw as
 * the world was made.)
 */
function checkWorld(s: SaveV1): void {
  const w = worldOfSave(s);
  if (!w) return;
  const version = w.version ?? 1;
  try {
    rulesFor(version, { regionCount: w.regionCount });
  } catch {
    const known = handRegions();
    if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) throw new Refusal({ zh: `这个存档的世界是第 ${String(version)} 版生成的，这个版本的游戏做不出来：存档已另存，开始了新游戏。`, en: `the save is of a world of generator version ${String(version)}, which this build does not have: set aside, a new game begun` });
    throw new Refusal({ zh: `这个存档的世界有 ${String(w.regionCount)} 种区域，这个版本的游戏只有 ${known} 种，做不出来：存档已另存，开始了新游戏。`, en: `the save is of a world of ${String(w.regionCount)} regions and this build's registry holds ${known}: set aside, a new game begun` });
  }
}

/** the line for a load that left things out: for the player, and for the log */
export function lossWords(n: number, kinds: readonly string[] = []): Text {
  return { zh: `有 ${n} 件认不出的东西没能读回来`, en: `${n} thing${n === 1 ? '' : 's'} of kinds this build does not have ${n === 1 ? 'was' : 'were'} not read back${kinds.length ? ` (${kinds.join(', ')})` : ''}` };
}

/** the world's time a save was written at, as the kernel will take its clock back (0: a save from before the clock, or one whose clock does not read) */
function worldSecondsOf(s: SaveV1): number {
  const c = new WorldClock();
  c.begin(s.hour);
  c.restore(s.clock);
  return c.worldSeconds;
}

/** a tool as the game can hold it: one of the kinds there are, with a uid */
function isTool(t: unknown): t is Tool {
  const x = t as Partial<Tool> | null;
  return !!x && typeof x === 'object' && typeof x.uid === 'string' && typeof x.kind === 'string' && Object.prototype.hasOwnProperty.call(TOOL_INFO, x.kind);
}

/** the kinds a thing from a save names that the catalogue does not have (its own, and those of what is in it) */
function unknownKinds(raw: unknown, into: Set<string>): void {
  const r = raw as { item?: unknown; inside?: unknown } | null;
  if (!r || typeof r !== 'object') return;
  if (typeof r.item === 'string' && !hasItem(r.item)) into.add(r.item);
  if (Array.isArray(r.inside)) for (const x of r.inside) if (x && typeof x === 'object' && typeof (x as { item?: unknown }).item === 'string' && !hasItem((x as { item: string }).item)) into.add((x as { item: string }).item);
}

/**
 * A save made ready to be played on, in place. Throws when a vehicle or a part in it is of a kind this build
 * does not have (the save is then set aside). Otherwise: every thing one carries is cleaned and what cannot
 * be read back is left out and counted in `loss`; the uids of every part, tool and thing are kept from being
 * given out again (those of things inside things too), a uid held twice is held once; what goes off without
 * a time starts at the save's own time, and no thing is written as of a later time than that.
 */
function readThings(s: SaveV1, loss: LoadLoss, kinds: Set<string>): void {
  const partIds: string[] = [];
  const part = (i: PartInstance): void => {
    partDef(i.part);
    partIds.push(i.uid);
    for (const sub of Object.values(i.sub ?? {})) part(sub);
  };
  const builds = [...s.vehicles, ...Object.values(s.wrecks?.kept ?? {})];
  for (const v of builds) {
    frameDef(v.build.frame);
    partIds.push(v.build.uid);
    for (const i of Object.values(v.build.parts)) part(i);
  }
  // (lists that are no lists hold nothing: the game that reads them takes them for lists)
  if (s.hands !== undefined && !Array.isArray(s.hands)) delete s.hands;
  for (const w of Object.values(s.wrecks?.kept ?? {})) if (!Array.isArray(w.loose)) w.loose = [];
  const left: Record<string, unknown> | undefined = s.places?.left;
  if (left && typeof left === 'object') for (const id of Object.keys(left)) if (!Array.isArray(left[id])) delete left[id];

  const tools: Tool[] = [];
  const items: ItemInstance[] = [];
  walkThings(s, (slot) => {
    // one thing to a slot: the first there is, as the game takes them (a part, else a tool, else a thing)
    if (slot.part) {
      part(slot.part);
      delete slot.tool;
      delete slot.item;
      return true;
    }
    if (slot.tool) {
      delete slot.item;
      if (!isTool(slot.tool)) {
        // (a tool of a kind there is not: left out and counted like a thing of an unknown kind)
        loss.unknown++;
        kinds.add(`tool:${String((slot.tool as { kind?: unknown }).kind)}`);
        return false;
      }
      tools.push(slot.tool);
      return true;
    }
    if (slot.item === undefined) return false;
    unknownKinds(slot.item, kinds);
    const c = cleanItem(slot.item, loss);
    if (!c) return false;
    slot.item = c;
    items.push(c);
    return true;
  });

  // (parts, tools and things made from now on get ids past the ones read back)
  reserveUids(partIds);
  reserveToolUids(tools.map((t) => t.uid));
  const itemIds: string[] = [];
  for (const c of items) forEachItem(c, (x) => void itemIds.push(x.uid));
  reserveItemUids(itemIds);
  // one uid, one thing: where a save holds one twice (tools' uids were not kept from being given out again
  // before this was written, so older saves do), the second gets a new one
  const seenTools = new Set<string>();
  for (const t of tools) {
    if (seenTools.has(t.uid)) t.uid = newTool(t.kind).uid;
    seenTools.add(t.uid);
  }
  const seenItems = new Set<string>();
  for (const c of items) {
    forEachItem(c, (x) => {
      if (seenItems.has(x.uid)) x.uid = newItem(x.item).uid;
      seenItems.add(x.uid);
    });
  }
  // (one from before the axles had parts of their own: their factory ones fitted, docs/MODCAR.md §22)
  for (const v of builds) fitAxles(v.build);

  // what goes off: none of it written as of a time the clock has not reached (a save whose clock was lost
  // would hold it fresh until the clock caught up), and what has no time starts now
  const now = worldSecondsOf(s);
  for (const c of items) {
    forEachItem(c, (x) => {
      if (x.t0 !== undefined && x.t0 > now) x.t0 = now;
    });
    stampFresh(c, now);
  }
}

export function loadSave(): SaveV1 | null {
  let raw: string | null = null;
  lost = { unknown: 0, kinds: [] };
  refused = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveV1;
    if (s?.v !== 1 || !Array.isArray(s.vehicles) || !s.vehicles.length || !Array.isArray(s.loose)) throw new Error('not a save');
    // (a world this build cannot make again: nothing of the save is read)
    checkWorld(s);
    const loss = { unknown: 0 };
    const kinds = new Set<string>();
    readThings(s, loss, kinds);
    lost = { unknown: loss.unknown, kinds: [...kinds].sort() };
    return s;
  } catch (e) {
    if (e instanceof Refusal) refused = e.words;
    // (put aside: a later build may read it again)
    try {
      if (raw) localStorage.setItem(`${KEY}.unread`, raw);
      localStorage.removeItem(KEY);
    } catch {
      // storage unavailable
    }
    return null;
  }
}

/**
 * A thing handed back to the game from a save, or from a list kept since (a wreck's riders): what goes off
 * and has no time to count from starts at the world's time now. (loadSave has done this for everything it
 * read; this is for what was kept in the session and never started.)
 */
export function backInTheWorld(inst: ItemInstance): ItemInstance {
  stampFresh(inst, itemNow());
  return inst;
}

// ------------------------------------------------------------------ writing

/** a stack used up (its count reads 0): whoever held it should have let go of it; it is never written */
const usedUp = (x: ItemInstance): boolean => (x.n ?? 1) <= 0;

/**
 * The save as it may be written: itself when nothing in it is a stack used up — the usual case, and nothing
 * is copied — otherwise a copy without them. The game's own things are never changed by being saved.
 */
export function writableSave(s: SaveV1): SaveV1 {
  let bad = false;
  forEachSavedItem(s, (x) => {
    if (usedUp(x)) bad = true;
  });
  if (!bad) return s;
  const copy = JSON.parse(JSON.stringify(s)) as SaveV1;
  walkThings(copy, (slot) => {
    const x = slot.item;
    if (!x) return true;
    if (usedUp(x)) return false;
    if (x.inside) {
      x.inside = x.inside.filter((y) => !usedUp(y));
      if (!x.inside.length) delete x.inside;
    }
    return true;
  });
  return copy;
}

/** write the save; false when the browser would not keep it (its storage full or unavailable): the game goes on unsaved */
export function writeSave(s: SaveV1): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(writableSave(s)));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
