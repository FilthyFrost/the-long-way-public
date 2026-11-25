/**
 * What one is short of, and what the next places do about it (docs/V3/plan/finish.md §二 4: 看需要 — 不让缺的人更缺，
 * 也不让富的人更富). When a place is laid out the game looks at what one has of each of the things one lives on —
 * food, water, petrol, tyre kits, medicine — against what one uses: with less than twenty minutes' worth, more of
 * the place's own of it is still there and the plan's supply of it comes a little thicker; with more than two hours'
 * worth, less and thinner. Never by more than a factor of 0.7 to 1.4: not to be noticed.
 *
 * And when one is all but out — the tank under fifteen in a hundred with no can aboard, nothing to eat, nothing to
 * drink — the next place has it for certain (rescue): the road never strands one.
 *
 * Pure data and maths.
 */
import { hash2 } from '../math/rng';
import { hasItem, itemDef } from './items';
import type { Found } from './loot';
import type { PlannedFind } from './schedule';

export type Need = 'food' | 'water' | 'petrol' | 'tyres' | 'meds';
export const NEEDS: readonly Need[] = ['food', 'water', 'petrol', 'tyres', 'meds'];

/** what one has: food and thirst points (100 a full bar), litres of petrol (the tank's and the cans'), tyre kits, medicines */
export type Stocks = Record<Need, number>;

/**
 * Twenty minutes' worth and two hours' worth of each: of play for what one eats and drinks (a full stomach gone in 76
 * minutes, a full thirst in 58: vitals.ts), of driving for petrol (60 km/h on the gravel, 27 L a hundred kilometres);
 * a tyre kit and a medicine by the piece — none is short, four is plenty
 */
export const NEED_LOW: Stocks = { food: 26, water: 34, petrol: 5.4, tyres: 0.5, meds: 0.5 };
export const NEED_HIGH: Stocks = { food: 158, water: 207, petrol: 32, tyres: 4, meds: 4 };

/** the most and the least the supply is scaled by */
export const SUPPLY_MOST = 1.4;
export const SUPPLY_LEAST = 0.7;

/** how the supply of a thing is scaled by how much of it one has: SUPPLY_MOST at twenty minutes' worth and under, 1 about the middle (their geometric mean), SUPPLY_LEAST at two hours' worth and over */
export function supplyFactor(need: Need, stock: number): number {
  const low = NEED_LOW[need];
  const high = NEED_HIGH[need];
  if (!(stock > low)) return SUPPLY_MOST;
  if (stock >= high) return SUPPLY_LEAST;
  const mid = Math.sqrt(Math.max(low, 1e-6) * high);
  return stock <= mid ? SUPPLY_MOST + ((1 - SUPPLY_MOST) * (stock - low)) / (mid - low) : 1 + ((SUPPLY_LEAST - 1) * (stock - mid)) / (high - mid);
}

/** every need's factor for what one has */
export function supplyFactors(stocks: Stocks): Stocks {
  return { food: supplyFactor('food', stocks.food), water: supplyFactor('water', stocks.water), petrol: supplyFactor('petrol', stocks.petrol), tyres: supplyFactor('tyres', stocks.tyres), meds: supplyFactor('meds', stocks.meds) };
}

/** no need looked at: every factor 1 (a world made before version 7, the tests' stand-ins) */
export const EVEN: Stocks = { food: 1, water: 1, petrol: 1, tyres: 1, meds: 1 };

/** the tyre kit */
const TYRE_KIT = 'nd_tire_kit';

/** which need a found thing answers (null: none — a part, junk, a tool) */
export function needOf(f: Found): Need | null {
  if ('tool' in f) return f.tool.kind === 'jerrycan' && (f.tool.fuel ?? 'petrol') === 'petrol' ? 'petrol' : null;
  if (!('item' in f) || !hasItem(f.item)) return null;
  if (f.item === TYRE_KIT) return 'tyres';
  const d = itemDef(f.item);
  if (d.cat === 'med') return 'meds';
  if ((d.eat && d.eat.food > 0) || d.tags?.includes('ingredient')) return 'food';
  if (d.drink && !d.drink.empty && (d.drink.liquid === 'water' || d.drink.liquid === 'coffee')) return 'water';
  return null;
}

/** what a found thing adds to one's stocks (the same measures as Stocks; an ingredient as it is worth cooked: `cooked` times its portion) */
export function stockOf(f: Found, portion: (item: string) => number = () => 0, cooked = 1.6): Partial<Stocks> {
  if ('tool' in f) return f.tool.kind === 'jerrycan' && (f.tool.fuel ?? 'petrol') === 'petrol' ? { petrol: f.tool.litres ?? 0 } : {};
  if (!('item' in f) || !hasItem(f.item)) return {};
  const d = itemDef(f.item);
  const n = f.n ?? 1;
  if (f.item === TYRE_KIT) return { tyres: n };
  if (d.cat === 'med') return { meds: n };
  const out: Partial<Stocks> = {};
  if (d.tags?.includes('ingredient')) out.food = Math.max(d.eat?.food ?? 0, portion(f.item)) * cooked * n;
  else if (d.eat && d.eat.food > 0) out.food = d.eat.food * n;
  const wet = (d.eat?.water ?? 0) * n + (d.drink && !d.drink.empty && (d.drink.liquid === 'water' || d.drink.liquid === 'coffee') ? (d.drink.litres / 0.1) * (d.drink.liquid === 'water' ? 10 : 6) * n : 0);
  if (wet > 0) out.water = wet;
  return out;
}

/** which need a supply of the plan answers, by its entry (schedule.ts: the supplies' ids) */
const ENTRY_NEED: Readonly<Record<string, Need>> = { food: 'food', water: 'water', fuel: 'petrol', tyre_kit: 'tyres', painkillers: 'meds', bandage: 'meds', stomach: 'meds' };
export function needOfEntry(entry: string): Need | null {
  return ENTRY_NEED[entry] ?? null;
}

/**
 * How many of a planned supply a place has, by how much of what it answers one has (its factor): one as the plan has
 * it; none in so many cases in a hundred as the factor is under 1 (three in ten at most), two in so many as it is
 * over (four in ten at most). The same for the same place and find (`seed`).
 */
export function supplyCount(f: Pick<PlannedFind, 'entry'>, factors: Stocks, seed: number): 0 | 1 | 2 {
  const need = needOfEntry(f.entry);
  if (!need) return 1;
  const k = factors[need];
  const u = (hash2(seed | 0, 0x5eed7, need.length * 31 + need.charCodeAt(0)) >>> 0) / 4294967296;
  if (k < 1) return u < 1 - k ? 0 : 1;
  return u < k - 1 ? 2 : 1;
}

/** the tank's share under which, with no can of petrol aboard, the next place has one for certain; and what re-arms it */
export const RESCUE_TANK = 0.15;
export const RESCUE_TANK_OVER = 0.3;
/** food and thirst points in the pack under which the next place has something for certain (ten minutes' worth), and what re-arms it */
export const RESCUE_FOOD = 13;
export const RESCUE_WATER = 17;
export const RESCUE_OVER = 3;

/** what one is all but out of: each need's own switch, on while it is asked for (so that it is asked for once) */
export interface RescueState {
  petrol?: true;
  food?: true;
  water?: true;
}

/**
 * The rescue (docs/V3/plan/finish.md §五: 永远不困死, §二 4): what the next place is to have for certain, as one stands
 * now — a can of petrol when the tank is under RESCUE_TANK of what it holds and no can with petrol in it is aboard,
 * a tin when there is next to nothing to eat in the pack, a big bottle of water when next to nothing to drink. Each
 * asked for once, and again only after one has been well clear of the want (`st` keeps which are out). The finds are
 * due at once: the first place from `s` (m) that takes them.
 */
export function rescueFinds(st: RescueState, s: number, now: { tankFrac: number; cansL: number; food: number; water: number }): PlannedFind[] {
  const out: PlannedFind[] = [];
  if (now.tankFrac < RESCUE_TANK && now.cansL < 1) {
    if (!st.petrol) {
      st.petrol = true;
      out.push({ entry: 'need:fuel', thing: { tool: 'jerrycan', litres: 12 }, s: s + 30, novelty: false });
    }
  } else if (now.tankFrac >= RESCUE_TANK_OVER || now.cansL >= 5) delete st.petrol;
  if (now.food < RESCUE_FOOD) {
    if (!st.food) {
      st.food = true;
      out.push({ entry: 'need:food', thing: { item: 'nd_baked_beans' }, s: s + 30, novelty: false }, { entry: 'need:food', thing: { item: 'nd_baked_beans' }, s: s + 30, novelty: false });
    }
  } else if (now.food >= RESCUE_FOOD * RESCUE_OVER) delete st.food;
  if (now.water < RESCUE_WATER) {
    if (!st.water) {
      st.water = true;
      out.push({ entry: 'need:water', thing: { item: 'drink_water' }, s: s + 30, novelty: false });
    }
  } else if (now.water >= RESCUE_WATER * RESCUE_OVER) delete st.water;
  return out;
}
