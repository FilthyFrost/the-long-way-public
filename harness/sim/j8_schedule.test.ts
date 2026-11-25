/**
 * J8 (docs/V3/plan/growth.md §六 3–7): when the new things turn up, as rules — and the robot traveller: the plan laid
 * over the places of real worlds (headless, no picture), what each new thing's first kilometre is across the seeds, how
 * far one goes without fuel at most, how many new things in a stretch.
 *   - the plan: each entry first in its band, a novelty at least NOVELTY_GAP_KM after the one before (the first three
 *     together at the start), what comes after one within its kilometres, the supplies' spacing by the difficulty
 *   - laid over a world's places: each at the first place of its sorts within 600 m of where it is due, else the first
 *     place after; never at a place of the wrong sort when a right one came in time
 *   - over the seeds: the first stove between 5 and 25 km (its band and the pace's pushing), the first coffee machine
 *     by 40 km, fuel never more than 9 km apart (cans, filling stations, wrecks with petrol) on the normal difficulty
 * ROBOT_SEEDS=200 runs the traveller over more seeds (the default: 6, to keep the suite quick).
 */
import { describe, expect, it } from 'vitest';
import { NOVELTY_GAP_KM, plan, placeFinds, SCHEDULE, THEME_WAIT_M, vehicleExtras, type PlanPlace, type ScheduledThing } from '../../src/core/modcar/schedule';
import { itemDef } from '../../src/core/modcar/items';
import { partDef } from '../../src/core/modcar/parts';
import { modcarWorld } from '../../src/game/modcar/seamless';
import '../../src/core/v3/nd/cards';
// (the modules' own things — the kitchen's, the blueprints' — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { boxesOfFinds, planBoxes, planGround } from '../../src/core/modcar/loot';
import { pumpFuel } from '../../src/core/v3/nd/fuel';
import { NEWEST_WORLD } from '../../src/core/world/rules';
import type { Site } from '../../src/core/world/sites';

const SEEDS = Number(process.env.ROBOT_SEEDS ?? 6);
const TO_KM = 150;

/** the places of a new game's world down its road (its version the newest: Nomad Drive's buildings among ours), as the plan sees them */
function placesOf(seed: number, toKm: number): { places: PlanPlace[]; stations: number[] } {
  const w = modcarWorld(seed, { worldVersion: NEWEST_WORLD }).world;
  const out: Site[] = [];
  w.sites.between(0, toKm * 1000, out);
  out.sort((a, b) => a.s - b.s);
  return {
    places: out.map((s) => ({ s: s.s, kind: s.kind, boxes: planBoxes(s).length, ground: planGround(s) })),
    // (fuel to be had: a filling station's pumps — a Nomad Drive one's when it gives petrol: core/v3/nd/fuel.ts — a wreck's tank by the road)
    stations: out.filter((s) => s.fuel.some((f) => f.litres > 2) || (s.prefab === 'station' && pumpFuel(s.seed, w.seed) === 'petrol')).map((s) => s.s),
  };
}

describe('J8: the plan of what turns up', () => {
  it('every thing the plan names is one the game has (what comes with it and after it too, the vehicles’ extras)', () => {
    const named: ScheduledThing[] = [];
    for (const e of SCHEDULE) {
      named.push(e.thing);
      for (const w of e.with ?? []) named.push(w.thing);
      for (const a of e.after ?? []) named.push(a.thing);
    }
    for (const seed of [7, 1000]) for (const x of vehicleExtras(seed, 200)) named.push(x.thing);
    for (const th of named) {
      if ('item' in th) expect(() => itemDef(th.item), th.item).not.toThrow();
      if ('part' in th) expect(() => partDef(th.part), th.part).not.toThrow();
    }
  });

  it('each new thing first in its band (or pushed on by the pace), the supplies on their spacing, the same for a seed every time', () => {
    const p = plan(7, TO_KM);
    expect(plan(7, TO_KM)).toEqual(p);
    for (const e of SCHEDULE) {
      // (what first comes beyond the plan's end — the later chapters' blueprint places — is not in it yet)
      if (e.firstKm[1] > TO_KM) continue;
      const first = p.find((f) => f.entry === e.id);
      expect(first, e.id).toBeTruthy();
      expect(first!.s / 1000, e.id).toBeGreaterThanOrEqual(e.firstKm[0] - 1e-6);
    }
    // the novelties: at most one in any NOVELTY_GAP_KM (the first three of the first kilometres apart)
    const novel = p.filter((f) => f.novelty && !f.entry.includes('+'));
    const firsts = new Map<string, number>();
    for (const f of novel) if (!firsts.has(f.entry)) firsts.set(f.entry, f.s / 1000);
    const late = [...firsts.entries()].filter(([id]) => (SCHEDULE.find((e) => e.id === id)!.firstKm[1] ?? 0) > 3).map(([, km]) => km).sort((a, b) => a - b);
    for (let i = 1; i < late.length; i++) expect(late[i] - late[i - 1]).toBeGreaterThanOrEqual(NOVELTY_GAP_KM - 1e-6);
    // what comes after the stove (its gas) within 2–6 km of it
    const stove = firsts.get('stove')!;
    const gas = p.find((f) => f.entry === 'stove+' && 'item' in f.thing && f.thing.item === 'kit_gas')!;
    expect(gas.s / 1000 - stove).toBeGreaterThanOrEqual(2);
    expect(gas.s / 1000 - stove).toBeLessThanOrEqual(6);
  });

  it('more on the comfortable difficulty, less on the hard one', () => {
    const count = (d: 'easy' | 'normal' | 'hard', id: string): number => plan(7, TO_KM, d).filter((f) => f.entry === id).length;
    for (const id of ['fuel', 'tyre_kit', 'food', 'water']) {
      expect(count('easy', id), id).toBeGreaterThan(count('normal', id));
      expect(count('hard', id), id).toBeLessThan(count('normal', id));
    }
  });

  it('laid over the places of real worlds: each at a place of its own sort when one comes in time; the stove, the coffee and the fuel as the plan says (the robot traveller)', () => {
    const firstStove: number[] = [];
    const firstCoffee: number[] = [];
    let wrongSort = 0;
    let themed = 0;
    let fuelGap = 0;
    for (let k = 0; k < SEEDS; k++) {
      const seed = 1000 + k * 7919;
      const { places, stations } = placesOf(seed, TO_KM);
      const finds = plan(seed, TO_KM);
      const at = placeFinds(finds, places);
      const where = new Map<object, PlanPlace>();
      for (const [i, list] of at) for (const f of list) where.set(f, places[i]);
      for (const f of finds) {
        const p = where.get(f);
        if (!p || !f.themes) continue;
        if (f.themes.includes(p.kind)) themed++;
        else {
          // (a place of the wrong sort only when none of the right sort came within the wait)
          const right = places.some((q) => (q.boxes > 0 || !!q.ground) && q.s >= f.s - 1 && q.s <= f.s + THEME_WAIT_M && f.themes!.includes(q.kind));
          if (right) wrongSort++;
        }
      }
      const km = (id: string): number => {
        const f = finds.find((x) => x.entry === id);
        const p = f ? where.get(f) : undefined;
        return p ? p.s / 1000 : Infinity;
      };
      firstStove.push(km('stove'));
      firstCoffee.push(km('coffee'));
      // fuel: the cans where they were laid, the filling stations and the wrecks with petrol left in them
      const fuel = [...finds.filter((f) => f.entry === 'fuel').map((f) => where.get(f)?.s ?? Infinity), ...stations].filter((s) => s < Infinity).sort((a, b) => a - b);
      let prev = 0;
      for (const s of fuel) {
        fuelGap = Math.max(fuelGap, (s - prev) / 1000);
        prev = s;
      }
    }
    const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.info(`robot traveller over ${SEEDS} seeds, ${TO_KM} km: the first stove at ${med(firstStove).toFixed(1)} km (latest ${Math.max(...firstStove).toFixed(1)}), the first coffee machine at ${med(firstCoffee).toFixed(1)} km (latest ${Math.max(...firstCoffee).toFixed(1)}), fuel at most ${fuelGap.toFixed(1)} km apart, ${themed} finds at a place of their sort, ${wrongSort} at another while one of theirs came in time`);
    expect(wrongSort).toBe(0);
    expect(Math.max(...firstStove)).toBeLessThan(25);
    expect(Math.min(...firstStove)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...firstCoffee)).toBeLessThan(40);
    // (the plan's 8 km; a world's longest stretch without a place with a box in it — nowhere for a can to be — is a
    // little more: 8.9 km over two hundred seeds)
    expect(fuelGap).toBeLessThanOrEqual(9);
  }, 600_000);

  it("a place's finds go in its own boxes (never a wreck's glovebox or boot), each in the emptiest so far", () => {
    const site = {
      s: 9000,
      kind: 'roadside',
      containers: [
        { kind: 'glovebox' as const, seed: 1 },
        { kind: 'boot' as const, seed: 2 },
        { kind: 'crate' as const, seed: 3 },
        { kind: 'barrel' as const, seed: 4 },
      ],
    };
    expect(planBoxes(site).map((c) => c.kind)).toEqual(['crate', 'barrel']);
    const six = Array.from({ length: 6 }, () => ({ thing: { item: 'nd_baked_beans' } }));
    const into = boxesOfFinds(site, six);
    expect(into.every((i) => i === 0 || i === 1)).toBe(true);
    // (spread: neither of the two holds all six — the crate, the bigger, more of them)
    expect(into.filter((i) => i === 0).length).toBeGreaterThan(into.filter((i) => i === 1).length);
    expect(into.filter((i) => i === 1).length).toBeGreaterThan(0);
    expect(boxesOfFinds(site, six)).toEqual(into);
    expect(boxesOfFinds({ s: 1, kind: 'roadside', containers: [{ kind: 'glovebox', seed: 1 }] }, six)).toEqual([]);
    // (what is bigger than a hand never in the toolbox while the crate is there)
    const shop = { s: 9000, kind: 'station', containers: [{ kind: 'toolbox' as const, seed: 5 }, { kind: 'crate' as const, seed: 6 }] };
    expect(boxesOfFinds(shop, [{ thing: { part: 'radio_old' } }, { thing: { item: 'nd_coffee_machine' } }])).toEqual([1, 1]);
  });
});
