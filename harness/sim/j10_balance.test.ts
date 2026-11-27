/**
 * J10 (docs/V3/plan/growth.md §六 6–7, 七 J10): the whole of it balanced — the robot traveller down a hundred kilometres
 * of real worlds: what there is to eat, drink, burn and top the car up with, against what one uses on the way (the plan's
 * aims: food 2.5 times what one eats, water nearly twice, petrol twice what one burns — §六 6); the longest stretch
 * without petrol; the vehicles to find.
 *   - the traveller: 10 km of road an hour of play, stops and all (Nomad Drive's own budget, whose aims these are); one's
 *     own appetite as the vitals' (a full stomach gone in 76 minutes, a full thirst in 58 — a litre of water a thirst);
 *     the car's as J7 measured it on gravel with the start's worn engine, by the hour of driving at 60 km/h (27 L of
 *     petrol a hundred kilometres, a quarter of a litre of water and 0.08 of coolant an hour, 0.6 L of oil an hour)
 *   - what there is, by where: the places' boxes as rolled and thinned (rollContainer, thinOut: the food, the drink, the
 *     cans mostly gone), the plan's finds in them (foundScheduled), what lies about (looseFound, looseKept), the filling
 *     stations' pumps (stationFuel), the wrecks' tanks (rollWreck) — not the forage, the fish, the kitchen's dishes nor
 *     the taps (more besides)
 * ROBOT_SEEDS=200 for the full count (the default: 6, to keep the suite quick).
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import '../../src/game/modcar/v3/kitchen/index';
import { hasItem, itemDef } from '../../src/core/modcar/items';
import { boxesOfFinds, foundScheduled, looseFound, looseKept, ownRoll, planBoxes, planGround, PLACES_KEEP, stationFuel, thinOut, type Found } from '../../src/core/modcar/loot';
import { partDef } from '../../src/core/modcar/parts';
import { placesPlan, SitePlanner } from '../../src/core/modcar/schedule';
import { rollWreck } from '../../src/core/modcar/wrecks';
import { pumpFound, pumpFuel } from '../../src/core/v3/nd/fuel';
import type { Site } from '../../src/core/world/sites';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { VehicleFinds, wreckSpots } from '../../src/game/modcar/wrecks';

const SEEDS = Number(process.env.ROBOT_SEEDS ?? 6);
const KM = 100;
/** the traveller's pace: km of road an hour of play, stops and all (Nomad Drive's budget: ten 1024 m blocks an hour) */
export const PACE_KMH = 10;
/** hours of play down KM, and of driving (60 km/h on the gravel) */
const HOURS = KM / PACE_KMH;
const DRIVING = KM / 60;
/**
 * What one uses down KM: food and thirst points (100 a full bar: one's own by the hour of play; the radiator's water
 * besides), litres of petrol (27 a hundred kilometres), of what the radiator loses (a quarter of a litre of water and
 * 0.08 of coolant an hour of driving), of oil (0.6 L an hour of driving, the start's worn engine)
 */
const NEED = {
  food: (HOURS * 60 * 100) / 76,
  water: (HOURS * 60 * 100) / 58 + 0.25 * DRIVING * 100,
  petrol: (27 * KM) / 100,
  coolant: 0.33 * DRIVING,
  oil: 0.6 * DRIVING,
};
/**
 * The plan's aims (§六 6): so many times what one uses — water nearly twice (Nomad Drive's 0.91 has its taps and wells;
 * there are none on our road yet). Coolant comes a bottle at a time: far over what the radiator loses, the aim kept
 * as the least.
 */
const AIM = { food: 2.5, water: 1.8, petrol: 2, coolant: 1.5 };

/** the same hash of an id the places use for what lies about (places.ts hashId) */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

type Res = 'food' | 'water' | 'petrol' | 'coolant' | 'oil';
type Src = 'boxes' | 'plan' | 'loose' | 'pumps' | 'wrecks';
const RES: readonly Res[] = ['food', 'water', 'petrol', 'coolant', 'oil'];
const SRC: readonly Src[] = ['boxes', 'plan', 'loose', 'pumps', 'wrecks'];
type Tally = Record<Res, Record<Src, number>>;
const tally = (): Tally => Object.fromEntries(RES.map((r) => [r, Object.fromEntries(SRC.map((s) => [s, 0]))])) as Tally;
const sum = (t: Tally, r: Res): number => SRC.reduce((a, s) => a + t[r][s], 0);

/** what a find gives of what one uses */
function add(t: Tally, src: Src, f: Found): void {
  if ('item' in f) {
    if (!hasItem(f.item)) return;
    const d = itemDef(f.item);
    const n = f.n ?? 1;
    if (d.eat) {
      t.food[src] += d.eat.food * n;
      t.water[src] += (d.eat.water ?? 0) * n;
    }
    if (d.drink && !d.drink.empty && (d.drink.liquid === 'water' || d.drink.liquid === 'coffee')) t.water[src] += (d.drink.litres / 0.1) * (d.drink.liquid === 'water' ? 10 : 6) * n;
  } else if ('tool' in f) {
    const tool = f.tool;
    if (tool.kind === 'jerrycan' && (tool.fuel ?? 'petrol') === 'petrol') t.petrol[src] += tool.litres ?? 0;
    else if (tool.kind === 'bottle' && tool.coolant) t.coolant[src] += tool.litres ?? 0;
    else if (tool.kind === 'oilcan') t.oil[src] += tool.litres ?? 0;
  }
}

/** what one stop gives: where it is, what sort of place, its food and thirst points, litres of petrol to carry off, a pump */
export interface Stop {
  s: number;
  kind: string;
  food: number;
  water: number;
  petrol: number;
  pump: boolean;
}

/**
 * The world this balance is of: version 6's (Nomad Drive's buildings among ours), with the plan of the worlds made
 * before version 7 — a new game's world, of version 7, is balanced by its own traveller (f6_journey.test.ts)
 */
const WORLD = 6;

/** one world of version 6 down KM: what there is by where, the places with petrol to be had, the vehicles to find, each stop's share */
export function travel(seed: number): { t: Tally; petrolAt: number[]; finds: number[]; stops: Stop[] } {
  const w = modcarWorld(seed, { worldVersion: WORLD }).world;
  const sites: Site[] = [];
  w.sites.between(0, KM * 1000, sites);
  sites.sort((a, b) => a.s - b.s);
  // the plan laid over the places as the game lays it
  const planner = new SitePlanner(placesPlan(seed, KM + 10));
  planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: planBoxes(x).length, ground: planGround(x) })));
  const t = tally();
  const petrolAt: number[] = [];
  // (the places' own as the game has them: what is still there of their food, drink, petrol and oil — normal difficulty)
  const keep = PLACES_KEEP;
  const stops: Stop[] = [];
  for (const site of sites) {
    const before = sum(t, 'petrol');
    const was = { food: sum(t, 'food'), water: sum(t, 'water'), petrol: sum(t, 'petrol') - t.petrol.pumps };
    for (const c of site.containers) for (const f of thinOut(ownRoll(c, site.s, site.kind), c.seed, keep)) add(t, 'boxes', f);
    const finds = planner.findsAt(site.id);
    const into = boxesOfFinds(site, finds);
    // (in its own boxes; a wreck's place with none: on the ground by the wreck)
    const boxes = planBoxes(site);
    finds.forEach((f, j) => [f.thing, ...(f.with ?? [])].forEach((x, i) => add(t, 'plan', foundScheduled(x, (boxes.length ? boxes[into[j]].seed : site.seed) + j * 31 + i, site.s))));
    for (const l of site.loose) {
      const f = looseFound(l.item, hashId(l.id), site.s, site.kind);
      if (f && looseKept(f, hashId(l.id), keep)) add(t, 'loose', 'item' in f ? { ...f, n: l.n } : f);
    }
    const tank = site.fuel.find((f) => f.from === 'tank');
    if (site.kind === 'station' && tank) t.petrol.pumps += stationFuel(tank.litres, site.seed).petrol;
    // (a Nomad Drive filling station's one pump, when it gives petrol: core/v3/nd/fuel.ts — nd-fuel's)
    const nd = site.prefab === 'station' && pumpFuel(site.seed, w.seed) === 'petrol' ? pumpFound(site.seed, w.seed) : 0;
    t.petrol.pumps += nd;
    // (somewhere to get petrol: a can with some in it, a pump)
    if (sum(t, 'petrol') - before > 0.5) petrolAt.push(site.s);
    stops.push({ s: site.s, kind: site.kind, food: sum(t, 'food') - was.food, water: sum(t, 'water') - was.water, petrol: sum(t, 'petrol') - t.petrol.pumps - was.petrol, pump: (site.kind === 'station' && !!tank) || nd > 0 });
  }
  // the wrecks' tanks: what petrol is left in them (a hose and a can: the siphon)
  const finder = new VehicleFinds(w);
  for (const x of wreckSpots(w, 0, KM * 1000)) {
    const r = rollWreck(x.seed, x.type, x.stripped, x.s, finder.has(x));
    for (const inst of Object.values(r.build.parts)) {
      const fuel = partDef(inst.part).fuelTank ? (inst.fluids.fuel?.petrol ?? 0) : 0;
      if (fuel > 0) {
        t.petrol.wrecks += fuel;
        if (fuel > 1) petrolAt.push(x.s);
        stops.push({ s: x.s, kind: 'wreck', food: 0, water: 0, petrol: fuel, pump: false });
      }
    }
  }
  petrolAt.sort((a, b) => a - b);
  const finds = [...wreckSpots(w, 0, KM * 1000).filter((x) => finder.has(x)), ...finder.extraSpots(0, KM * 1000)].map((x) => x.s).sort((a, b) => a - b);
  stops.sort((a, b) => a.s - b.s);
  return { t, petrolAt, finds, stops };
}

/** the big places: where one who is in a hurry still stops and searches */
const BIG = new Set(['station', 'shop', 'house', 'camp', 'garage', 'works']);

/**
 * A traveller from the J5 start down KM: full to begin with, two packs of biscuits and the big bottle of water in the
 * pack, the 20 L of the garage's can in the tank (45 L, a 20 L can besides once one is found — the start's own); eats
 * and drinks when half empty, takes all there is to eat and drink and the petrol it can carry at each stop it makes
 * (`stops`: every place, or only the big ones), fills up at every pump. Returns the least each came to and where it
 * first ran out (km; Infinity: never).
 */
function live(stops: readonly Stop[], at: (x: Stop) => boolean): { food: number; water: number; petrol: number; starved: number; parched: number; dry: number; packFood: number; packWater: number } {
  const perKm = { food: (60 / PACE_KMH) * (100 / 76), water: (60 / PACE_KMH) * (100 / 58), petrol: 0.27 };
  let food = 100;
  let water = 100;
  let pack = { food: 50, water: 200 };
  let tank = 20;
  const out = { food: 100, water: 100, petrol: 20, starved: Infinity, parched: Infinity, dry: Infinity, packFood: Infinity, packWater: Infinity };
  let i = 0;
  for (let km = 0; km < KM; km += 0.1) {
    while (i < stops.length && stops[i].s <= km * 1000) {
      const x = stops[i++];
      if (x.pump) tank = 45;
      if (!at(x)) continue;
      pack = { food: pack.food + x.food, water: pack.water + x.water };
      tank = Math.min(45 + 20, tank + x.petrol);
    }
    food -= perKm.food * 0.1;
    water -= perKm.water * 0.1;
    tank -= perKm.petrol * 0.1;
    // (half empty: eat, drink — what there is)
    if (food < 50 && pack.food > 0) {
      const e = Math.min(pack.food, 100 - food);
      food += e;
      pack.food -= e;
    }
    if (water < 50 && pack.water > 0) {
      const d = Math.min(pack.water, 100 - water);
      water += d;
      pack.water -= d;
    }
    // (what is left in the pack: the margin — after the first ten kilometres, the start's own eaten)
    if (km > 10) {
      out.packFood = Math.min(out.packFood, pack.food);
      out.packWater = Math.min(out.packWater, pack.water);
    }
    out.food = Math.min(out.food, food);
    out.water = Math.min(out.water, water);
    out.petrol = Math.min(out.petrol, tank);
    if (food <= 0 && out.starved === Infinity) out.starved = km;
    if (water <= 0 && out.parched === Infinity) out.parched = km;
    if (tank <= 0 && out.dry === Infinity) out.dry = km;
    food = Math.max(0, food);
    water = Math.max(0, water);
    tank = Math.max(0, tank);
  }
  return out;
}

describe('J10: the balance down a hundred kilometres (the robot traveller)', () => {
  it('one who searches every place never runs out; one who stops only at the big places seldom does, and not soon', () => {
    const every: ReturnType<typeof live>[] = [];
    const big: ReturnType<typeof live>[] = [];
    for (let k = 0; k < SEEDS; k++) {
      const { stops } = travel(1000 + k * 7919);
      every.push(live(stops, () => true));
      big.push(live(stops, (x) => BIG.has(x.kind)));
    }
    const share = (list: ReturnType<typeof live>[], key: 'starved' | 'parched' | 'dry'): number => list.filter((x) => x[key] < Infinity).length / list.length;
    const first = (list: ReturnType<typeof live>[], key: 'starved' | 'parched' | 'dry'): number => Math.min(...list.map((x) => x[key]));
    const least = (list: ReturnType<typeof live>[], key: 'food' | 'water' | 'petrol' | 'packFood' | 'packWater', worst = false): number => [...list.map((x) => x[key])].sort((a, b) => a - b)[worst ? 0 : Math.floor(list.length / 2)];
    const say = (name: string, list: ReturnType<typeof live>[]): string =>
      `${name}: ran out of food in ${(share(list, 'starved') * 100).toFixed(0)}% of the worlds (the soonest at ${first(list, 'starved').toFixed(1)} km), of water in ${(share(list, 'parched') * 100).toFixed(0)}% (${first(list, 'parched').toFixed(1)} km), of petrol in ${(share(list, 'dry') * 100).toFixed(0)}% (${first(list, 'dry').toFixed(1)} km); the least on the way, the median world: food ${least(list, 'food').toFixed(0)}, thirst ${least(list, 'water').toFixed(0)}, petrol ${least(list, 'petrol').toFixed(1)} L; the least left in the pack after 10 km, the median world: ${least(list, 'packFood').toFixed(0)} food, ${least(list, 'packWater').toFixed(0)} thirst points (the worst world ${least(list, 'packFood', true).toFixed(0)}, ${least(list, 'packWater', true).toFixed(0)})`;
    console.info([`travellers over ${SEEDS} seeds, ${KM} km at ${PACE_KMH} km/h of play:`, `  ${say('searching every place', every)}`, `  ${say('only at the big places', big)}`].join('\n'));
    expect(share(every, 'starved') + share(every, 'parched') + share(every, 'dry')).toBe(0);
    expect(share(big, 'starved')).toBeLessThan(0.2);
    expect(share(big, 'parched')).toBeLessThan(0.2);
    expect(share(big, 'dry')).toBe(0);
  }, 900_000);

  it('food, water, petrol and coolant as the plan aims at, never long without petrol; a vehicle to find at the plan’s pace', () => {
    const per: Tally[] = [];
    let longestDry = 0;
    let longestDryCans = 0;
    const firstFind: number[] = [];
    const findsPer: number[] = [];
    for (let k = 0; k < SEEDS; k++) {
      const { t, petrolAt, finds } = travel(1000 + k * 7919);
      let prev = 0;
      for (const s of petrolAt) {
        longestDry = Math.max(longestDry, (s - prev) / 1000);
        prev = s;
      }
      per.push(t);
      firstFind.push(finds.length ? finds[0] / 1000 : Infinity);
      findsPer.push(finds.length);
      void longestDryCans;
    }
    const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const low = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.05)];
    const ratio = (r: Res, only?: readonly Src[]): number[] => per.map((t) => (only ? only.reduce((a, s) => a + t[r][s], 0) : sum(t, r)) / NEED[r]);
    const say = (r: Res, unit: string): string =>
      `${r} ${med(per.map((t) => sum(t, r))).toFixed(0)} ${unit} for ${NEED[r].toFixed(1)} needed: ${med(ratio(r)).toFixed(2)}× (the worst in twenty ${low(ratio(r)).toFixed(2)}×)${r in AIM ? `, the aim ${AIM[r as keyof typeof AIM]}×` : ''} — ${SRC.map((s) => `${s} ${med(per.map((t) => t[r][s])).toFixed(0)}`).join(', ')}`;
    console.info(
      [
        `robot traveller over ${SEEDS} seeds, ${KM} km at ${PACE_KMH} km/h of play (${HOURS.toFixed(1)} h):`,
        ...RES.map((r) => `  ${say(r, r === 'food' || r === 'water' ? 'points' : 'L')}`),
        `  petrol to carry (cans and wrecks, not the pumps): ${med(ratio('petrol', ['boxes', 'plan', 'loose', 'wrecks'])).toFixed(2)}×`,
        `  petrol at most ${longestDry.toFixed(1)} km apart`,
        `  vehicles to find: the first at ${med(firstFind).toFixed(1)} km (latest ${Math.max(...firstFind).toFixed(1)}), ${med(findsPer)} in ${KM} km`,
      ].join('\n'),
    );
    // (the aims, with room either side: the places' own boxes roll as they roll)
    expect(med(ratio('food'))).toBeGreaterThan(AIM.food * 0.8);
    expect(med(ratio('food'))).toBeLessThan(AIM.food * 2);
    expect(low(ratio('food'))).toBeGreaterThan(AIM.food * 0.6);
    expect(med(ratio('water'))).toBeGreaterThan(AIM.water * 0.8);
    expect(med(ratio('water'))).toBeLessThan(AIM.water * 2.5);
    // (petrol: what one carries off — the cans, the wrecks' tanks — twice what one burns; the pumps besides)
    expect(med(ratio('petrol', ['boxes', 'plan', 'loose', 'wrecks']))).toBeGreaterThan(AIM.petrol * 0.8);
    expect(med(ratio('petrol', ['boxes', 'plan', 'loose', 'wrecks']))).toBeLessThan(AIM.petrol * 2.5);
    expect(med(ratio('coolant'))).toBeGreaterThan(AIM.coolant * 0.8);
    // (a bottle is a bottle: one in the first kilometres and one every 50–80 km is far more than the half litre the radiator
    // loses in a hundred kilometres of driving — never too little)
    expect(med(ratio('coolant'))).toBeLessThan(AIM.coolant * 8);
    expect(med(ratio('oil'))).toBeGreaterThan(1);
    expect(longestDry).toBeLessThanOrEqual(9);
    // (the plan's 12–20 km; where no big place comes for a while after it, the next one: 25.8 km at worst in 200 worlds)
    // (the latest of 200 worlds: 31.8 km — seed 531573, its Loaf due at 19.5 km just after a workshop, a filling station and a
    // camp at 18–19 km, then only lookouts without the room for it until a camp at 31.8; one world in two hundred)
    expect(Math.max(...firstFind)).toBeLessThan(33);
    expect(med(findsPer)).toBeGreaterThanOrEqual(4);
  }, 900_000);
});
