/**
 * How the kitchen's things work (docs/V3/plan/cooking.md §4, §5): a cassette stove that burns a canister of gas, the
 * vessel standing on it and what is in the vessel, a board one cuts on, a pinch of seasoning, and a plate the pot is
 * dished up onto. Everything here is the things' own state (items.ts ItemState.kit), read and changed in place: the
 * game's module only says when (a key was pressed, a frame went by) and draws what it finds.
 *
 * A pot's doneness goes from 0 (raw) through 1 (just right) on: a vessel has its seconds on a high flame from raw to
 * right (COOK_S); a low flame takes twice as long and burns half the gas; what was cut cooks a quarter faster. A pan, a
 * pot and a grill ask to be stirred or turned half way: done then, the band of "just right" is wider (the steamer, the
 * oven and the kettle sit under their lids and are as forgiving without). A bowl has no heat: it is tossed.
 *
 * Pure: no clock but the dt it is handed, no randomness.
 */
import { newItem, type ItemInstance } from '../../modcar/items';
import { cook, DONE_BURNT, DONE_RIGHT, DONE_UNDER, POT_MAX, type ClassOf, type Outcome } from './cook';
import { WAYS, type Way } from './dishes';
import { BOARD, BOWL, dishItem, GAS, GAS_FULL, PLATE, SPICE, STOVE, VESSEL, WAY_OF, type KitState, type Portion, type PotState } from './items';
import { FOOD_LOOK } from './looks';
import { FOOD, SEASONINGS } from './pantry';

// ------------------------------------------------------------------ numbers

/** strokes of the knife that cut what lies on the board */
export const CHOPS = 3;
/** tosses that mix a bowl */
export const TOSSES = 3;
/** seconds on a high flame from raw to just right, for one thing put in whole (cut, cracked or poured: a quarter faster) */
export const COOK_S: Readonly<Record<Way, number>> = { fry: 14, grill: 16, boil: 22, steam: 20, bake: 26, brew: 10, mix: 0 };
/** the ways one stirs or turns half way (the rest are under a lid) */
export const STIRRED: Readonly<Record<Way, boolean>> = { fry: true, grill: true, boil: true, steam: false, bake: false, brew: false, mix: false };
/** when a pot asks to be stirred: while its doneness is between these */
export const STIR_AT: readonly [number, number] = [0.38, 0.72];
/** stirred, or under a lid: how much of a step in doneness counts (the band of "just right" is that much wider) */
const WIDE = 0.72;
/** what was cut cooks this much faster; each portion more slows the pot this much */
const CUT_BOOST = 0.25;
const CROWD = 0.05;
/** gas burnt a second: a high flame 1, a low one half */
const BURN: readonly number[] = [0, 0.5, 1];
/** under this many seconds of gas the flame gutters */
export const GAS_LOW = 45;

// ------------------------------------------------------------------ what a thing is

export type KitKind = 'stove' | 'vessel' | 'board' | 'gas' | 'ware' | 'spice';

/** what kind of kitchen thing an item is (null: none) */
export function kitKind(item: string): KitKind | null {
  if (item === STOVE) return 'stove';
  if (item === BOARD) return 'board';
  if (item === GAS) return 'gas';
  if (item === PLATE || item === BOWL) return 'ware';
  if (item === SPICE) return 'spice';
  return WAY_OF[item] ? 'vessel' : null;
}

const NONE: Readonly<KitState> = {};

/** a thing's kitchen state, to read (nothing is written into it) */
export function kitOf(inst: ItemInstance): Readonly<KitState> {
  return inst.state?.kit ?? NONE;
}

/** a thing's kitchen state, to change: made when it has none */
export function kitState(inst: ItemInstance): KitState {
  inst.state ??= {};
  return (inst.state.kit ??= {});
}

/** a state with nothing in it is no state (two empty pans are the same pan) */
function tidy(inst: ItemInstance): void {
  const s = inst.state;
  if (!s?.kit) return;
  const k = s.kit;
  if (k.fire === 0) delete k.fire;
  if (k.pot && k.pot.items.length === 0) delete k.pot;
  if (Object.keys(k).length === 0) delete s.kit;
  if (Object.keys(s).length === 0) delete inst.state;
}

// ------------------------------------------------------------------ gas

/** seconds of a high flame in a canister (new: full), or in the canister a stove has in it (none: −1) */
export function gasOf(inst: ItemInstance): number {
  const g = kitOf(inst).gas;
  if (inst.item === GAS) return g ?? GAS_FULL;
  return g ?? -1;
}

/** has the stove a canister in it */
export function hasCanister(stove: ItemInstance): boolean {
  return kitOf(stove).gas !== undefined;
}

/** a canister with so many seconds in it */
export function canister(seconds = GAS_FULL): ItemInstance {
  const s = Math.max(0, Math.min(GAS_FULL, seconds));
  return s >= GAS_FULL ? newItem(GAS) : newItem(GAS, { state: { kit: { gas: Math.round(s * 10) / 10 } } });
}

/** a canister into the stove: the flame goes out, and the one that was in it (null: none) comes out as it is */
export function loadCanister(stove: ItemInstance, can: ItemInstance): ItemInstance | null {
  const s = kitState(stove);
  const old = s.gas !== undefined ? canister(s.gas) : null;
  s.gas = gasOf(can);
  delete s.fire;
  return old;
}

/** the canister out of the stove (null: there was none) */
export function takeCanister(stove: ItemInstance): ItemInstance | null {
  const s = kitState(stove);
  if (s.gas === undefined) return null;
  const can = canister(s.gas);
  delete s.gas;
  delete s.fire;
  tidy(stove);
  return can;
}

// ------------------------------------------------------------------ the flame

export type FireLack = 'nocan' | 'empty';

/** the knob turned: 0 off, 1 low, 2 high. What stops it lighting, or null: it is as asked */
export function setFire(stove: ItemInstance, level: 0 | 1 | 2): FireLack | null {
  if (level === 0) {
    const k = stove.state?.kit;
    if (k) delete k.fire;
    tidy(stove);
    return null;
  }
  const gas = kitOf(stove).gas;
  if (gas === undefined) return 'nocan';
  if (gas <= 0) return 'empty';
  kitState(stove).fire = level;
  return null;
}

export function fireOf(stove: ItemInstance): 0 | 1 | 2 {
  return kitOf(stove).fire ?? 0;
}

// ------------------------------------------------------------------ the vessel and what is in it

/** the vessel a thing is, or has standing on it (a stove): its kind, or null */
export function vesselOf(inst: ItemInstance): string | null {
  if (WAY_OF[inst.item]) return inst.item;
  return inst.item === STOVE ? (kitOf(inst).on ?? null) : null;
}

/** the way of cooking of that vessel */
export function wayOf(inst: ItemInstance): Way | null {
  const v = vesselOf(inst);
  return v ? WAY_OF[v] : null;
}

/** what is in the vessel (undefined: nothing) */
export function potOf(inst: ItemInstance): Readonly<PotState> | undefined {
  return kitOf(inst).pot;
}

/** why the steamer cannot go on a stove: nothing on its burner, a pot with food in it, another vessel there (null: an empty pot of water is) */
export type SteamLack = 'nopot' | 'potfull' | 'taken';

export function steamLack(stove: ItemInstance): SteamLack | null {
  const s = kitOf(stove);
  if (stove.item !== STOVE || !s.on) return 'nopot';
  if (s.on !== VESSEL.boil || s.under) return 'taken';
  if (s.pot && s.pot.items.length) return 'potfull';
  return null;
}

/** the pot the steamer on a stove stands on (null: no steamer, or no stove) */
export function underOf(stove: ItemInstance): string | null {
  return kitOf(stove).under ?? null;
}

/**
 * A vessel set on the stove, with what is in it: false when the stove has one already, or the thing is no vessel for
 * a flame. The steamer is set on an empty pot of water standing on the burner instead (steamLack), and only there.
 */
export function putVessel(stove: ItemInstance, vessel: ItemInstance): boolean {
  const way = WAY_OF[vessel.item];
  if (stove.item !== STOVE || !way || !WAYS[way].heats) return false;
  if (way === 'steam' ? steamLack(stove) : kitOf(stove).on) return false;
  const s = kitState(stove);
  if (way === 'steam') {
    s.under = s.on;
    delete s.pot;
  }
  s.on = vessel.item;
  const pot = kitOf(vessel).pot;
  if (pot && pot.items.length) s.pot = pot;
  return true;
}

/** the vessel off the stove, with what is in it (null: none on it); the steamer comes off its pot, which stays on the burner */
export function takeVessel(stove: ItemInstance): ItemInstance | null {
  const s = kitState(stove);
  if (!s.on) return null;
  const v = s.pot && s.pot.items.length ? newItem(s.on, { state: { kit: { pot: s.pot } } }) : newItem(s.on);
  delete s.on;
  delete s.pot;
  if (s.under) {
    s.on = s.under;
    delete s.under;
  }
  tidy(stove);
  return v;
}

export type AddLack = 'novessel' | 'full' | 'served' | 'burnt';

/** can a portion go in: what stops it, or null */
export function addLack(inst: ItemInstance): AddLack | null {
  const way = wayOf(inst);
  if (!way) return 'novessel';
  const pot = potOf(inst);
  if (!pot) return null;
  if (pot.out) return 'served';
  if (pot.items.length >= POT_MAX) return 'full';
  if (WAYS[way].heats && phaseOf(inst) === 'burnt') return 'burnt';
  return null;
}

/**
 * A portion into the vessel. What goes into a pot already cooking cools it: its doneness is shared out over one
 * portion more. False: it would not go (addLack).
 */
export function addPortion(inst: ItemInstance, p: Portion): boolean {
  if (addLack(inst)) return false;
  const s = kitState(inst);
  const pot = (s.pot ??= { items: [] });
  const n = pot.items.length;
  pot.items.push(p.cut ? { id: p.id, cut: 1 } : { id: p.id });
  if (pot.done) pot.done = (pot.done * n) / (n + 1);
  if (pot.toss) pot.toss = (pot.toss * n) / (n + 1);
  return true;
}

/** the last portion out again, while the pot is still raw and nothing was dished up (null: not now) */
export function removePortion(inst: ItemInstance): Portion | null {
  const s = kitState(inst);
  const pot = s.pot;
  if (!pot || !pot.items.length || pot.out || (pot.done ?? 0) > 0.2) {
    tidy(inst);
    return null;
  }
  const p = pot.items.pop()!;
  tidy(inst);
  return p;
}

/** everything in the vessel thrown out */
export function emptyPot(inst: ItemInstance): void {
  const s = kitState(inst);
  delete s.pot;
  tidy(inst);
}

/** how much of what could be cut was (1 when nothing in the pot is cut at all) */
export function cutShare(pot: Readonly<PotState>): number {
  let can = 0;
  let cut = 0;
  for (const p of pot.items) {
    if (!FOOD[p.id] || !FOOD_LOOK[p.id]?.chop) continue;
    can++;
    if (p.cut) cut++;
  }
  return can ? cut / can : 1;
}

/** a pinch of a seasoning over the pot: false when there is nothing to season, it is no seasoning, or it went in already */
export function seasonPot(inst: ItemInstance, id: string): boolean {
  const pot = kitState(inst).pot;
  if (!pot || !pot.items.length || pot.out || !SEASONINGS.some((s) => s.id === id)) {
    tidy(inst);
    return false;
  }
  if (pot.season?.includes(id)) return false;
  (pot.season ??= []).push(id);
  return true;
}

// ------------------------------------------------------------------ doneness

export type Phase = 'raw' | 'cooking' | 'right' | 'over' | 'burnt';

/** is the band wide: stirred when it asked, or a way that sits under a lid */
function wide(way: Way, pot: Readonly<PotState>): boolean {
  return !STIRRED[way] || (pot.stirs ?? 0) > 0;
}

/** where each phase begins, in doneness: cooking, right, over, burnt */
export function bandsOf(inst: ItemInstance): readonly [number, number, number, number] {
  const way = wayOf(inst);
  const pot = potOf(inst);
  const k = way && pot && wide(way, pot) ? WIDE : 1;
  return [1 - (1 - DONE_UNDER) / k, 1 - (1 - DONE_RIGHT[0]) / k, 1 + (DONE_RIGHT[1] - 1) / k, 1 + (DONE_BURNT - 1) / k];
}

/** the doneness the pot's outcome is read at: a step from "just right" counts for less in a wide band */
function effective(way: Way, pot: Readonly<PotState>): number {
  const d = pot.done ?? 0;
  return wide(way, pot) ? 1 + (d - 1) * WIDE : d;
}

/** how far along a heated pot is (a bowl, or an empty vessel: raw) */
export function phaseOf(inst: ItemInstance): Phase {
  const pot = potOf(inst);
  const way = wayOf(inst);
  if (!pot || !way || !WAYS[way].heats) return 'raw';
  const d = pot.done ?? 0;
  const b = bandsOf(inst);
  return d > b[3] ? 'burnt' : d > b[2] ? 'over' : d >= b[1] ? 'right' : d >= b[0] ? 'cooking' : 'raw';
}

/** is the pot asking to be stirred or turned now */
export function asksStir(inst: ItemInstance): boolean {
  const pot = potOf(inst);
  const way = wayOf(inst);
  if (!pot || !way || !STIRRED[way] || pot.out || (pot.stirs ?? 0) > 0) return false;
  const d = pot.done ?? 0;
  return d >= STIR_AT[0] && d <= STIR_AT[1];
}

/** stirred or turned: true when it was asking (the band of "just right" is wider from now on) */
export function stir(inst: ItemInstance): boolean {
  if (!asksStir(inst)) return false;
  const pot = kitState(inst).pot!;
  pot.stirs = (pot.stirs ?? 0) + 1;
  return true;
}

/** a bowl tossed once: how mixed it is now, 0 … 1 (−1: nothing in it, or no bowl) */
export function toss(inst: ItemInstance): number {
  const way = wayOf(inst);
  const pot = kitState(inst).pot;
  if (!way || WAYS[way].heats || !pot || !pot.items.length || pot.out) {
    tidy(inst);
    return -1;
  }
  pot.toss = Math.min(1, (pot.toss ?? 0) + 1 / TOSSES);
  if (pot.toss > 0.999) pot.toss = 1;
  return pot.toss;
}

/** can it be dished up: a heated pot whenever there is something in it (what comes out is its own affair), a bowl once it is tossed */
export function ready(inst: ItemInstance): boolean {
  const way = wayOf(inst);
  const pot = potOf(inst);
  if (!way || !pot || !pot.items.length) return false;
  return WAYS[way].heats ? true : (pot.toss ?? 0) >= 1;
}

/** what the pot would come to, taken off now */
export function outcomeOf(inst: ItemInstance, classOf?: ClassOf): Outcome {
  const way = wayOf(inst);
  const pot = potOf(inst);
  if (!way || !pot) return cook({ way: way ?? 'fry', items: [] });
  return cook({ way, items: pot.items.map((p) => p.id), done: effective(way, pot), cut: cutShare(pot), seasoned: !!pot.season?.length }, classOf);
}

/** servings still in the pot */
export function servingsLeft(inst: ItemInstance, classOf?: ClassOf): number {
  const pot = potOf(inst);
  if (!pot || !pot.items.length) return 0;
  return Math.max(0, outcomeOf(inst, classOf).servings - (pot.out ?? 0));
}

export interface Served {
  /** the serving, as a thing */
  readonly item: ItemInstance;
  readonly outcome: Outcome;
  /** it was the pot's last: the vessel is empty */
  readonly last: boolean;
  /** what went into the pot (the recipe book notes a failure by it) */
  readonly items: readonly string[];
  readonly way: Way;
  /**
   * A dish that came out but not perfect: what kept it from it — 'cut' (less than half of what could be cut was),
   * 'season' (no pinch over it), 'under' or 'over' (taken off before or after the band of just right). Empty for a
   * perfect dish and for a failure.
   */
  readonly missed: readonly Missed[];
}

export type Missed = 'cut' | 'season' | 'under' | 'over';

/**
 * A serving out of the vessel onto a plate or into a bowl (`ware`: its kind, which the serving gives back when it is
 * eaten). Null: there is nothing to dish up, or a bowl not yet tossed.
 */
export function dishUp(inst: ItemInstance, ware: string, classOf?: ClassOf): Served | null {
  if (!ready(inst)) return null;
  const way = wayOf(inst)!;
  const s = kitState(inst);
  const pot = s.pot!;
  const outcome = outcomeOf(inst, classOf);
  if (outcome.fail === 'empty') return null;
  const missed: Missed[] = [];
  if (outcome.dish && !outcome.perfect) {
    if (cutShare(pot) < 0.5) missed.push('cut');
    if (!pot.season?.length) missed.push('season');
    const ph = WAYS[way].heats ? phaseOf(inst) : 'right';
    if (ph === 'raw' || ph === 'cooking') missed.push('under');
    else if (ph === 'over') missed.push('over');
  }
  const id = outcome.dish ? dishItem(outcome.dish.id) : dishItem(outcome.fail as 'mess' | 'burnt' | 'raw');
  const item = newItem(id, { state: { meal: { food: outcome.food, ...(outcome.perfect ? { perfect: 1 as const } : {}), ware } } });
  const items = pot.items.map((p) => p.id);
  pot.out = (pot.out ?? 0) + 1;
  const last = pot.out >= outcome.servings;
  if (last) delete s.pot;
  tidy(inst);
  return { item, outcome, last, items, way, missed };
}

// ------------------------------------------------------------------ a frame goes by

export interface StoveTick {
  /** the flame was alight this frame */
  burning: boolean;
  /** the canister ran out this frame: the flame is out */
  ranOut: boolean;
  /** the pot's phase before and after (null: nothing cooking) */
  before: Phase | null;
  after: Phase | null;
  /** it began to ask to be stirred this frame */
  asked: boolean;
}

/** a stove's frame: gas burnt, the pot on it cooked. `out` is written and returned (the caller's own, used again). */
export function stoveStep(stove: ItemInstance, dt: number, out: StoveTick): StoveTick {
  out.burning = false;
  out.ranOut = false;
  out.before = null;
  out.after = null;
  out.asked = false;
  const k = stove.state?.kit;
  const fire = k?.fire ?? 0;
  if (!k || !fire || dt <= 0) return out;
  const gas = k.gas ?? 0;
  if (gas <= 0) {
    delete k.fire;
    out.ranOut = true;
    return out;
  }
  out.burning = true;
  // (the last of the gas heats for as long as it lasts)
  const lit = Math.min(dt, gas / BURN[fire]);
  k.gas = Math.max(0, gas - BURN[fire] * dt);
  if (k.gas <= 0) {
    delete k.fire;
    out.ranOut = true;
  }
  const way = k.on ? WAY_OF[k.on] : null;
  const pot = k.pot;
  if (!way || !pot || !pot.items.length || !WAYS[way].heats) return out;
  out.before = phaseOf(stove);
  const asking = asksStir(stove);
  const rate = (BURN[fire] * (1 + CUT_BOOST * cutShare(pot)) * Math.max(0.5, 1 - CROWD * (pot.items.length - 1))) / COOK_S[way];
  pot.done = (pot.done ?? 0) + rate * lit;
  out.after = phaseOf(stove);
  out.asked = !asking && asksStir(stove);
  return out;
}

// ------------------------------------------------------------------ the board

export type BoardLack = 'busy' | 'nocut' | 'cutalready';

/** can this portion go on the board: what stops it, or null */
export function boardLack(board: ItemInstance, p: Portion): BoardLack | null {
  if (kitOf(board).food) return 'busy';
  if (!FOOD[p.id] || !FOOD_LOOK[p.id]?.chop) return 'nocut';
  if (p.cut) return 'cutalready';
  return null;
}

export function boardPut(board: ItemInstance, p: Portion): boolean {
  if (board.item !== BOARD || boardLack(board, p)) return false;
  kitState(board).food = { id: p.id };
  return true;
}

/** a stroke of the knife: how many it has had (0: nothing on the board to cut); at CHOPS it is cut */
export function chop(board: ItemInstance): number {
  const f = kitState(board).food;
  if (!f || f.cut) {
    tidy(board);
    return 0;
  }
  f.chops = (f.chops ?? 0) + 1;
  if (f.chops >= CHOPS) {
    f.cut = 1;
    delete f.chops;
    return CHOPS;
  }
  return f.chops;
}

/** what lies on the board taken off it (null: nothing) */
export function boardTake(board: ItemInstance): Portion | null {
  const s = kitState(board);
  const f = s.food;
  if (!f) {
    tidy(board);
    return null;
  }
  delete s.food;
  tidy(board);
  return f.cut ? { id: f.id, cut: 1 } : { id: f.id };
}

// ------------------------------------------------------------------ the seasonings

/** the seasoning that goes over the pot next: the first of the six not in it yet (null: nothing to season, or all six are in) */
export function nextSeasoning(inst: ItemInstance): { id: string; zh: string; en: string } | null {
  const pot = potOf(inst);
  if (!pot || !pot.items.length || pot.out) return null;
  for (const s of SEASONINGS) if (!pot.season?.includes(s.id)) return s;
  return null;
}
