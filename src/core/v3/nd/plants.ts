/**
 * The plant pot's rules (docs/V3/plan/finish.md §八 2; the pot itself Nomad Drive's: docs/ND/PLAN.md): a packet of
 * seeds sown in it, the soil watered (it holds a litre), the plant grows through four stages while the soil has water
 * and the sun is on it — a day or two of the game from sown to ripe (a day is forty minutes, some half of it light: a
 * quick crop a little over twenty minutes of daylight, a slow one forty) on two or three waterings (the soil's litre
 * lasts a quarter of an hour of growing); dry, or in the dark, it waits where it is and goes on after. Then it bears —
 * four tomatoes, three onions, one pumpkin — each picked as a thing of its own, fresh; picked bare, it does not die:
 * it goes back to half grown and bears again. Another packet sown over it takes its place.
 * The growth counts the game's own seconds as it is handed them, by how much sun it has (0 the dark … 1 the open
 * day); a step grows it by the least of its time, what is left to grow and what the water lasts. Its state rides on
 * the pot (ItemState.pot). Pure: no three, no DOM.
 */
import type { ItemInstance } from '../../modcar/items';
import { CROP_INFO, ND_FRUIT, ND_PLANTER, ND_POT, ND_SEEDS, type CropId } from './items';

export const POT = {
  /** what the soil holds (L), and how long a litre of it lasts a growing plant (s) */
  holds: 1,
  lastsS: 900,
  /** picked bare, the plant is this far grown again (of its whole growing) */
  again: 0.5,
} as const;

/** what a growing plant drinks (L/s) */
export const DRINKS = POT.holds / POT.lastsS;

/** seconds of daylight a crop grows through from sown to ripe: a quick one (a day of the game), a middling one, a slow one (two days) */
const QUICK = 1260;
const MIDDLING = 1800;
const SLOW = 2400;

const SPEED: Readonly<Record<CropId, number>> = {
  lettuce: QUICK,
  carrot: QUICK,
  onion: QUICK,
  garlic: QUICK,
  cucumber: QUICK,
  tomato: QUICK,
  potato: QUICK,
  cabbage: MIDDLING,
  corn: MIDDLING,
  pepper: MIDDLING,
  eggplant: MIDDLING,
  broccoli: MIDDLING,
  chili: MIDDLING,
  strawberry: MIDDLING,
  watermelon: SLOW,
  pumpkin: SLOW,
  apple: SLOW,
};

/** what each crop bears when it is ripe, and how long it grows (s of daylight, watered) */
export const CROPS: Readonly<Record<CropId, { n: number; growS: number }>> = Object.fromEntries(
  (Object.keys(CROP_INFO) as CropId[]).map((id) => [id, { n: CROP_INFO[id].bears, growS: SPEED[id] }]),
) as Record<CropId, { n: number; growS: number }>;

export interface PotState {
  /** what is sown in it */
  crop?: CropId;
  /** the seconds it has grown */
  grown?: number;
  /** the water in its soil (L) */
  water?: number;
  /** ripe: which of its fruits are still there (a bit each) */
  left?: number;
  /** how many times it has borne (it bears again after each harvest) */
  borne?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** a plant pot's (docs/ND/PLAN.md); a planter box's first bed */
    pot?: PotState;
    /** a planter box's beds after its first (docs/V3/plan/finish.md §八 2: one box, three plants) */
    beds?: PotState[];
  }
}

const NONE: Readonly<PotState> = {};

/** how many plants a thing grows: a pot one, a planter box three, anything else none */
export function bedsOf(item: string): number {
  return item === ND_POT ? 1 : item === ND_PLANTER ? 3 : 0;
}

/** a bed's state (a pot has the one, 0; a planter box three) */
export function potOf(p: ItemInstance, bed = 0): Readonly<PotState> {
  return (bed ? p.state?.beds?.[bed - 1] : p.state?.pot) ?? NONE;
}

function st(p: ItemInstance, bed = 0): PotState {
  p.state ??= {};
  if (!bed) return (p.state.pot ??= {});
  const b = (p.state.beds ??= []);
  while (b.length < bed) b.push({});
  return b[bed - 1];
}

/** how long a crop grows from sown to ripe (s of daylight, watered) */
export function growSOf(crop: CropId): number {
  return CROPS[crop].growS;
}

/** the crop a packet of seeds sows, null: it is no packet */
export function cropOfSeeds(item: string): CropId | null {
  for (const [k, v] of Object.entries(ND_SEEDS)) if (v === item) return k as CropId;
  return null;
}

/**
 * Sown: true when it took — an empty pot, or (`over`) one with something in it already, which the new crop takes the
 * place of (the same crop over itself: no)
 */
export function sow(p: ItemInstance, crop: CropId, over = false, bed = 0): boolean {
  const s = st(p, bed);
  if (s.crop && (!over || s.crop === crop)) return false;
  s.crop = crop;
  s.grown = 0;
  delete s.left;
  delete s.borne;
  return true;
}

/** water poured on it (L offered): what the soil took */
export function water(p: ItemInstance, litres: number, bed = 0): number {
  const s = st(p, bed);
  const took = Math.max(0, Math.min(litres, POT.holds - (s.water ?? 0)));
  if (took > 0) s.water = (s.water ?? 0) + took;
  return took;
}

/** 0 … 4 the stage it is in, 4 ripe; −1 nothing sown */
export function stageOf(p: ItemInstance, bed = 0): number {
  const s = potOf(p, bed);
  if (!s.crop) return -1;
  const k = (s.grown ?? 0) / growSOf(s.crop);
  return k >= 1 - 1e-9 ? 4 : Math.min(3, Math.floor(k * 4 + 1e-9));
}

/** how far grown it is (0 … 1) */
export function grownOf(p: ItemInstance, bed = 0): number {
  const s = potOf(p, bed);
  return s.crop ? Math.min(1, (s.grown ?? 0) / growSOf(s.crop)) : 0;
}

/** sown, not ripe, the soil wet: it grows while the sun is on it */
export function growing(p: ItemInstance, bed = 0): boolean {
  const s = potOf(p, bed);
  return !!s.crop && (s.grown ?? 0) < growSOf(s.crop) && (s.water ?? 0) > 1e-6;
}

/** why a plant that is not ripe stands still: its soil dry, or (asked with the sun it has) no light on it; null: it grows, or there is nothing to grow */
export function waitsFor(p: ItemInstance, sun = 1, bed = 0): 'water' | 'sun' | null {
  const s = potOf(p, bed);
  if (!s.crop || (s.grown ?? 0) >= growSOf(s.crop)) return null;
  if ((s.water ?? 0) <= 1e-6) return 'water';
  return sun <= 1e-3 ? 'sun' : null;
}

/**
 * A step of the game's time, with how much sun the plant has (0 the dark … 1 the open day): it grows as far as its
 * light and its water let it; true when it has just ripened
 */
export function potStep(p: ItemInstance, dt: number, sun = 1, bed = 0): boolean {
  const s = potOf(p, bed);
  if (!s.crop || dt <= 0 || sun <= 0) return false;
  const total = growSOf(s.crop);
  if ((s.grown ?? 0) >= total) return false;
  const w = s.water ?? 0;
  if (w <= 1e-6) return false;
  const m = st(p, bed);
  const t = Math.min(dt * Math.min(1, sun), total - (m.grown ?? 0), w / DRINKS);
  m.grown = (m.grown ?? 0) + t;
  m.water = Math.max(0, w - t * DRINKS);
  if (m.water <= 1e-6) delete m.water;
  if (m.grown >= total - 1e-6) {
    m.grown = total;
    m.left = (1 << CROPS[m.crop!].n) - 1;
    return true;
  }
  return false;
}

/** the fruits still on it (their numbers 0 … n−1) */
export function fruitsLeft(p: ItemInstance, bed = 0): number[] {
  const s = potOf(p, bed);
  if (!s.crop || s.left === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < CROPS[s.crop].n; i++) if (s.left & (1 << i)) out.push(i);
  return out;
}

/**
 * A fruit picked (its number): the kind of thing it is, null if it is not there. Picked bare, the plant is half grown
 * again and will bear once more
 */
export function pick(p: ItemInstance, i: number, bed = 0): string | null {
  const s = st(p, bed);
  if (!s.crop || s.left === undefined || !(s.left & (1 << i))) return null;
  const kind = ND_FRUIT[s.crop];
  s.left &= ~(1 << i);
  if (!s.left) {
    delete s.left;
    s.grown = growSOf(s.crop) * POT.again;
    s.borne = (s.borne ?? 0) + 1;
  }
  return kind;
}

/** the plant pulled up: the pot empty again (its soil keeps its water) */
export function uproot(p: ItemInstance, bed = 0): boolean {
  const s = st(p, bed);
  if (!s.crop) return false;
  const w = s.water;
  const bare: PotState = w ? { water: w } : {};
  if (bed) p.state!.beds![bed - 1] = bare;
  else p.state!.pot = bare;
  return true;
}
