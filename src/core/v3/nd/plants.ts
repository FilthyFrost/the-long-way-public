/**
 * The plant pot's rules (docs/ND/PLAN.md, Nomad Drive's plant pot as the research measured it): a packet of seeds
 * sown in it, the soil watered (it holds a litre), the plant grows through four stages of 15 s while the soil has
 * water — a sixtieth of a litre a second, so 0.25 L carries it some 15 s; dry, it waits where it is and goes on when
 * watered again — and then bears: four apples, four potatoes, four tomatoes or one watermelon, each picked as a
 * thing of its own, fresh. Picked bare, the pot is empty again: sow it anew. The growth counts the game's own
 * seconds, and a step grows it by the least of its time, what is left to grow and what the water lasts. Its state
 * rides on the pot (ItemState.pot). Pure: no three, no DOM.
 */
import type { ItemInstance } from '../../modcar/items';
import { ND_FRUIT, ND_SEEDS, type CropId } from './items';

export const POT = {
  /** each stage's seconds (the fifth, ripe, is shown, not timed) */
  stages: [15, 15, 15, 15] as const,
  /** what the soil holds (L), and what growing drinks (L/s) */
  holds: 1,
  drinks: 1 / 60,
} as const;

export const GROW_S = POT.stages.reduce((a, b) => a + b, 0);

/** what each crop bears when it is ripe */
export const CROPS: Readonly<Record<CropId, { n: number }>> = {
  apple: { n: 4 },
  potato: { n: 4 },
  tomato: { n: 4 },
  watermelon: { n: 1 },
};

export interface PotState {
  /** what is sown in it */
  crop?: CropId;
  /** the seconds it has grown */
  grown?: number;
  /** the water in its soil (L) */
  water?: number;
  /** ripe: which of its fruits are still there (a bit each) */
  left?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** a plant pot's (docs/ND/PLAN.md) */
    pot?: PotState;
  }
}

const NONE: Readonly<PotState> = {};

export function potOf(p: ItemInstance): Readonly<PotState> {
  return p.state?.pot ?? NONE;
}

function st(p: ItemInstance): PotState {
  p.state ??= {};
  return (p.state.pot ??= {});
}

/** the crop a packet of seeds sows, null: it is no packet */
export function cropOfSeeds(item: string): CropId | null {
  for (const [k, v] of Object.entries(ND_SEEDS)) if (v === item) return k as CropId;
  return null;
}

/** sown (an empty pot): true when it took */
export function sow(p: ItemInstance, crop: CropId): boolean {
  const s = st(p);
  if (s.crop) return false;
  s.crop = crop;
  s.grown = 0;
  delete s.left;
  return true;
}

/** water poured on it (L offered): what the soil took */
export function water(p: ItemInstance, litres: number): number {
  const s = st(p);
  const took = Math.max(0, Math.min(litres, POT.holds - (s.water ?? 0)));
  if (took > 0) s.water = (s.water ?? 0) + took;
  return took;
}

/** 0 … 4 the stage it is in, 4 ripe; −1 nothing sown */
export function stageOf(p: ItemInstance): number {
  const s = potOf(p);
  if (!s.crop) return -1;
  let g = s.grown ?? 0;
  for (let i = 0; i < POT.stages.length; i++) {
    if (g < POT.stages[i] - 1e-6) return i;
    g -= POT.stages[i];
  }
  return 4;
}

/** how far grown it is (0 … 1) */
export function grownOf(p: ItemInstance): number {
  return Math.min(1, (potOf(p).grown ?? 0) / GROW_S);
}

/** growing now: sown, not ripe, the soil wet */
export function growing(p: ItemInstance): boolean {
  const s = potOf(p);
  return !!s.crop && (s.grown ?? 0) < GROW_S && (s.water ?? 0) > 1e-6;
}

/** a step of the game's time: it grows as far as its water lets it; true when it has just ripened */
export function potStep(p: ItemInstance, dt: number): boolean {
  const s = potOf(p);
  if (!s.crop || (s.grown ?? 0) >= GROW_S || dt <= 0) return false;
  const w = s.water ?? 0;
  if (w <= 1e-6) return false;
  const m = st(p);
  const t = Math.min(dt, GROW_S - (m.grown ?? 0), w / POT.drinks);
  m.grown = (m.grown ?? 0) + t;
  m.water = Math.max(0, w - t * POT.drinks);
  if (m.water <= 1e-6) delete m.water;
  if (m.grown >= GROW_S - 1e-6) {
    m.grown = GROW_S;
    m.left = (1 << CROPS[m.crop!].n) - 1;
    return true;
  }
  return false;
}

/** the fruits still on it (their numbers 0 … n−1) */
export function fruitsLeft(p: ItemInstance): number[] {
  const s = potOf(p);
  if (!s.crop || s.left === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < CROPS[s.crop].n; i++) if (s.left & (1 << i)) out.push(i);
  return out;
}

/** a fruit picked (its number): the kind of thing it is, null if it is not there; picked bare, the pot is empty */
export function pick(p: ItemInstance, i: number): string | null {
  const s = st(p);
  if (!s.crop || s.left === undefined || !(s.left & (1 << i))) return null;
  const kind = ND_FRUIT[s.crop];
  s.left &= ~(1 << i);
  if (!s.left) {
    const w = s.water;
    p.state!.pot = w ? { water: w } : {};
  }
  return kind;
}
