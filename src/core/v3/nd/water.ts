/**
 * Water (docs/ND/PLAN.md, ND2), as Nomad Drive's liquid transfer system has it (liquid transfer rules, liquid transfer
 * processor, rain catcher, water pump body and its reservoir, pump handle animator; the values its assets give):
 *
 *  - A vessel holds so many litres of one liquid. Liquid runs from one to another at the pouring one's own speed (a
 *    water can's, a bucket's, the pump's litre a second; a mug's fifth of one) for as long as one holds the button,
 *    and only where it may: out of what gives (a pot only takes, a pump only gives), into what takes that liquid (a
 *    water can water only, a bucket anything), and never onto another liquid. Which way it runs when one holds one
 *    vessel to another is the way it can: out of the hands if it can go that way, else into them.
 *  - A bucket left out in the rain fills (from empty to full in four minutes at the heaviest rain, a mug in a
 *    minute and a half, lighter rain as much slower), the rain followed over eight seconds, looked at every two;
 *    only where it is left out: not in the hands, not put away, not under a roof (anything within 60 m straight over
 *    its mouth), not holding another liquid.
 *  - A hand pump holds twenty litres, found a tenth to three fifths full (the same every time for the same pump of
 *    the same world), and is never filled again; its handle rocks thirty degrees and back every 0.9 s while it gives,
 *    falling back to rest over 0.35 s when it stops.
 *  - A water can or a bucket found lying about is a quarter to wholly full (a bucket now and then of beer or an
 *    energy drink rather than water).
 *
 * Its vessels are the catalogue's drinks (their litres, ItemInstance.litres; a vessel of any liquid has its own in
 * ItemState.liquid), the radiator's water bottle (a tool), and what the rules here are told of (a pump's
 * reservoir). Pure: no three, no DOM.
 */
import { hash2, Rng } from '../../math/rng';
import { itemDef, type DrinkLiquid, type ItemInstance } from '../../modcar/items';
import { TOOL_INFO, type Tool } from '../../modcar/tools';

/** which ways liquid goes: in and out, only in (a pot), only out (a pump) */
export type Way = 'both' | 'in' | 'out';

/** what the catalogue does not say of a vessel: its pouring speed, what goes in, which ways, how it is found, rain */
export interface VesselKind {
  /** litres a second it pours (Nomad Drive's filling speed: a transfer runs at its source's) */
  flow: number;
  /** what may go in */
  takes: 'water' | 'any';
  way: Way;
  /** found lying about: filled between these shares of it (absent: as the catalogue makes it) */
  found?: readonly [number, number];
  /** found now and then holding something other than its own (a bucket: beer, an energy drink) */
  rare?: boolean;
  /** left out in the rain: minutes to fill from empty at the heaviest rain (absent: it catches none) */
  rainMin?: number;
}

export const ND_WATER_CAN = 'nd_water_can';
export const ND_BUCKET = 'nd_bucket';
export const ND_PUMP = 'nd_hand_pump';

/** the vessels among the catalogue's kinds (their litres are their drinks') */
export const VESSELS: Readonly<Record<string, VesselKind>> = {
  [ND_WATER_CAN]: { flow: 1, takes: 'water', way: 'both', found: [0.25, 1] },
  [ND_BUCKET]: { flow: 1, takes: 'any', way: 'both', found: [0.25, 1], rare: true, rainMin: 4 },
  nd_mug: { flow: 0.2, takes: 'any', way: 'both', rainMin: 1.5 },
  // (the coffee machine's pot: poured into a mug — docs/V3/plan/growth.md §一 4)
  coffee_pot: { flow: 0.25, takes: 'any', way: 'both' },
  // (the game's own bottle of water: "drunk, the bottle is kept for water")
  drink_water: { flow: 1, takes: 'water', way: 'both' },
  // (Nomad Drive's carton of milk, the kitchen's milk: it pours out, nothing goes in)
  ing_milk: { flow: 1, takes: 'any', way: 'out', found: [0.25, 1] },
};

/** Nomad Drive's hand pump (water pump reservoir, pump handle animator) */
export const PUMP = {
  holds: 20,
  flow: 1,
  found: [0.1, 0.6] as const,
  strokeDeg: 30,
  strokeS: 0.9,
  settleS: 0.35,
};

/** Nomad Drive's rain catching (rain catcher) */
export const RAIN = {
  /** the rain followed this slowly (s) */
  easeS: 8,
  /** looked at every so often (s) */
  tickS: 2,
  /** nothing within this straight over its mouth (m) */
  skyM: 60,
  /** below this the rain counts as none */
  min: 0.001,
};

/** a bucket found with something other than water (Nomad Drive's 15 %: coolant, beer or an energy drink — coolant is water here) */
const RARE = 0.15;
const RARE_LIQUIDS: readonly DrinkLiquid[] = ['water', 'alcohol', 'energy'];

/** a vessel as the rules see it: how much it holds and has, of what, how it pours, which ways */
export interface Vessel {
  readonly holds: number;
  readonly flow: number;
  readonly takes: 'water' | 'any';
  readonly way: Way;
  /** what is in it (L) */
  litres: number;
  /** of what (null: empty) */
  liquid: DrinkLiquid | null;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** the liquid in a vessel that takes any (docs/ND/PLAN.md: a bucket of rain, a mug of coffee); absent: its drink's own */
    liquid?: DrinkLiquid;
    /** a vessel's fill as found was settled (water.ts foundFill): not again */
    found?: true;
  }
}

const EMPTY = 1e-4;

/** the vessel an item is (a drink the rules know as one), as a view of it: setting its litres and liquid sets the item's; null: none */
export function itemVessel(inst: ItemInstance): Vessel | null {
  const k = VESSELS[inst.item];
  const d = itemDef(inst.item).drink;
  if (!k || !d) return null;
  return {
    holds: d.litres,
    flow: k.flow,
    takes: k.takes,
    way: k.way,
    get litres() {
      return inst.litres ?? 0;
    },
    set litres(l: number) {
      inst.litres = l <= EMPTY ? 0 : Math.round(l * 10000) / 10000;
      if (inst.litres === 0 && inst.state?.liquid) delete inst.state.liquid;
    },
    get liquid() {
      return (inst.litres ?? 0) > EMPTY ? (inst.state?.liquid ?? d.liquid) : null;
    },
    set liquid(q: DrinkLiquid | null) {
      if (q === null || q === d.liquid) {
        if (inst.state?.liquid) delete inst.state.liquid;
        return;
      }
      inst.state ??= {};
      inst.state.liquid = q;
    },
  };
}

/** the vessel a tool is (the radiator's water bottle), null: none */
export function toolVessel(t: Tool): Vessel | null {
  if (t.kind !== 'bottle') return null;
  const info = TOOL_INFO.bottle;
  return {
    holds: info.capacity,
    flow: info.rate,
    takes: 'water',
    way: 'both',
    get litres() {
      return t.litres ?? 0;
    },
    set litres(l: number) {
      t.litres = l <= EMPTY ? 0 : Math.round(l * 10000) / 10000;
    },
    get liquid() {
      return (t.litres ?? 0) > EMPTY ? 'water' : null;
    },
    set liquid(_q: DrinkLiquid | null) {},
  };
}

/** a pump's reservoir as a vessel (its litres kept by whoever keeps the pump) */
export function pumpVessel(get: () => number, set: (l: number) => void): Vessel {
  return {
    holds: PUMP.holds,
    flow: PUMP.flow,
    takes: 'water',
    way: 'out',
    get litres() {
      return get();
    },
    set litres(l: number) {
      set(l <= EMPTY ? 0 : l);
    },
    get liquid() {
      return get() > EMPTY ? 'water' : null;
    },
    set liquid(_q: DrinkLiquid | null) {},
  };
}

/** why liquid cannot run from one to the other (Nomad Drive's transfer request result), 'ok': it can */
export type FlowWhy = 'ok' | 'noOut' | 'noIn' | 'other' | 'empty' | 'full';

/** whether liquid may run that way at all, as things are (not asking whether there is any, or room) */
export function canFlow(src: Vessel, dst: Vessel): boolean {
  return flowWhy(src, dst, false) === 'ok';
}

/** whether liquid runs from src into dst now, and if not why */
export function flowWhy(src: Vessel, dst: Vessel, levels = true): FlowWhy {
  if (src.way === 'in') return 'noOut';
  if (dst.way === 'out') return 'noIn';
  const q = src.liquid;
  if (q !== null && dst.takes === 'water' && q !== 'water') return 'other';
  const q2 = dst.liquid;
  if (q !== null && q2 !== null && q !== q2) return 'other';
  if (!levels) return 'ok';
  if (src.litres <= EMPTY) return 'empty';
  if (dst.holds - dst.litres <= EMPTY) return 'full';
  return 'ok';
}

/**
 * Held to another vessel, which way it runs (Nomad Drive's choose reversed): out of the hands when it may now, else
 * into them when it may now; failing both, the way it could go at all (out first). True: into the hands.
 */
export function intoHands(held: Vessel, other: Vessel): boolean {
  if (flowWhy(held, other) === 'ok') return false;
  if (flowWhy(other, held) === 'ok') return true;
  if (!canFlow(held, other)) return canFlow(other, held);
  return false;
}

/** liquid run from src into dst for dt at src's speed; the litres that went */
export function pour(src: Vessel, dst: Vessel, dt: number): number {
  if (dt <= 0 || flowWhy(src, dst) !== 'ok') return 0;
  const l = Math.min(src.flow * dt, src.litres, dst.holds - dst.litres);
  if (l <= 0) return 0;
  const q = src.liquid;
  if (dst.liquid === null) dst.liquid = q;
  src.litres -= l;
  dst.litres += l;
  return l;
}

/** the seconds a pour from src into dst would take to run its course (empty or full), at src's speed */
export function pourS(src: Vessel, dst: Vessel): number {
  if (flowWhy(src, dst) !== 'ok') return 0;
  return Math.min(src.litres, dst.holds - dst.litres) / src.flow;
}

// ------------------------------------------------------------------ found

/**
 * A vessel as it is found lying about (once: ItemState.found): a quarter to wholly full, a bucket now and then of
 * something else — by `seed` (a thing a place lays out is found the same every visit: its place's seed for it).
 * True when it was settled now.
 */
export function foundFill(inst: ItemInstance, seed: number): boolean {
  const k = VESSELS[inst.item];
  if (!k?.found || inst.state?.found) return false;
  const v = itemVessel(inst);
  if (!v) return false;
  const r = new Rng(hash2(seed | 0, 0xf111, 0x7a7e));
  const [lo, hi] = k.found;
  const share = lo + r.next() * (hi - lo);
  let q: DrinkLiquid = itemDef(inst.item).drink?.liquid ?? 'water';
  if (k.rare) {
    const roll = r.next();
    if (roll < RARE) q = RARE_LIQUIDS[Math.min(RARE_LIQUIDS.length - 1, Math.floor((roll / RARE) * RARE_LIQUIDS.length))];
  }
  v.litres = Math.round(v.holds * share * 100) / 100;
  v.liquid = q;
  inst.state ??= {};
  inst.state.found = true;
  return true;
}

/** a pump's water as found (its world's seed and the pump's own key): the same every time */
export function pumpFound(seed: number, key: number): number {
  const r = new Rng(hash2(seed | 0, key | 0, 0x9a3b));
  const [lo, hi] = PUMP.found;
  return Math.round(PUMP.holds * (lo + r.next() * (hi - lo)) * 100) / 100;
}

// ------------------------------------------------------------------ rain

/** why a catcher fills or does not (Nomad Drive's CatchStatus, less what only matters to another player's world) */
export type CatchStatus = 'idle' | 'noRain' | 'other' | 'full' | 'notOut' | 'sheltered' | 'filling';

/** a catcher's own: the rain as it follows it, when it was looked at, how it is */
export interface Catcher {
  rain: number;
  /** till its next look (s) */
  next: number;
  status: CatchStatus;
}

/** a catcher begun: its first look within its first two seconds, spread by `seed` so that not all look at once */
export function newCatcher(seed: number): Catcher {
  return { rain: 0, next: (((seed >>> 0) % 997) / 997) * RAIN.tickS, status: 'idle' };
}

/**
 * A catcher's time going on by dt, the rain falling on it now `rain` (0 … 1); at each look the rain it follows, its
 * status, what fell into it (litres, already in it). `out`: left out (not in the hands, not put away);
 * `sheltered`: asked only when it would fill — whether anything is over its mouth.
 */
export function catchRain(c: Catcher, v: Vessel, rainMin: number, rain: number, dt: number, out: boolean, sheltered: () => boolean): number {
  c.next -= dt;
  if (c.next > 0) return 0;
  // (a look every two seconds; the time since the last, never more than four of them)
  const step = Math.min(RAIN.tickS - c.next, RAIN.tickS * 4);
  c.next += RAIN.tickS;
  if (c.next <= 0) c.next = RAIN.tickS;
  const want = Math.max(0, Math.min(1, rain));
  c.rain += (want - c.rain) * (1 - Math.exp(-step / RAIN.easeS));
  if (c.rain < RAIN.min) c.rain = 0;
  c.status = rainStatus(c, v, out, sheltered);
  if (c.status !== 'filling') return 0;
  const l = Math.min((v.holds / (rainMin * 60)) * c.rain * step, v.holds - v.litres);
  if (l <= 0) return 0;
  if (v.liquid === null) v.liquid = 'water';
  v.litres += l;
  return l;
}

function rainStatus(c: Catcher, v: Vessel, out: boolean, sheltered: () => boolean): CatchStatus {
  if (c.rain <= 0) return 'noRain';
  if (v.holds - v.litres <= EMPTY) return 'full';
  if (v.liquid !== null && v.liquid !== 'water') return 'other';
  if (!out) return 'notOut';
  if (sheltered()) return 'sheltered';
  return 'filling';
}

// ------------------------------------------------------------------ the pump's handle

/** a pump's handle (Nomad Drive's pump handle animator): its angle from rest (degrees), where its stroke is */
export interface Handle {
  angle: number;
  phase: number;
  pumping: boolean;
}

export function newHandle(): Handle {
  return { angle: 0, phase: 0, pumping: false };
}

/** the handle's dt: rocking while the pump gives (`pumping`), falling back to rest when it does not; its angle */
export function handleStep(h: Handle, pumping: boolean, dt: number): number {
  const A = PUMP.strokeDeg;
  if (pumping !== h.pumping) {
    h.pumping = pumping;
    // (a stroke begins from where the handle is)
    if (pumping) h.phase = Math.acos(1 - 2 * Math.max(0, Math.min(1, h.angle / A))) / (Math.PI * 2);
  }
  let target = 0;
  let maxD: number;
  if (h.pumping) {
    h.phase = (h.phase + dt / PUMP.strokeS) % 1;
    target = A * 0.5 * (1 - Math.cos(h.phase * Math.PI * 2));
    maxD = ((4 * A) / PUMP.strokeS) * dt;
  } else maxD = (A / PUMP.settleS) * dt;
  const d = target - h.angle;
  h.angle = Math.abs(d) <= maxD ? target : h.angle + Math.sign(d) * maxD;
  if (!h.pumping && Math.abs(h.angle) < 1e-4) {
    h.angle = 0;
    h.phase = 0;
  }
  return h.angle;
}
