/**
 * What is found where (docs/DESIGN_V2.md 8.1): every kind of container has its table, every kind of
 * building its containers, so "is that a shop or a workshop ahead?" matters.
 *
 * A roll is a pure function of its seed: the same crate holds the same things for every player.
 * Each pick first settles how rare it is — common 70 %, uncommon 24 %, rare 6 % (well rested: +3
 * points of rare) — and then draws from that band of the table.
 */
import { Rng } from '../math/rng';
import { hasItem, item } from './catalog';
// vehicle systems: the vehicle's parts, tyres and tools are registered in the catalogue by this module
import '../vehicle/systems/partsCatalog';
import type { Stack } from './inventory';

export interface LootEntry {
  id: string;
  /** weight inside its rarity band */
  w: number;
  /** how many come at once */
  n: readonly [number, number];
}

export interface LootTable {
  /** how many picks one container gets */
  picks: readonly [number, number];
  entries: readonly LootEntry[];
}

const e = (id: string, w = 1, lo = 1, hi = lo): LootEntry => ({ id, w, n: [lo, hi] });

export const CONTAINER_KINDS = ['crate', 'toolbox', 'shelf', 'counter', 'cupboard', 'wardrobe', 'desk', 'medicine', 'glovebox', 'boot', 'barrel', 'tacklebox', 'gamebag', 'garage', 'fridge', 'coolbox'] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

export const LOOT: Record<ContainerKind, LootTable> = {
  // a wooden crate by the road: whatever somebody packed and never came back for
  crate: {
    picks: [2, 4],
    entries: [e('mat.plank', 3, 1, 2), e('mat.rope', 2), e('mat.cloth', 2, 1, 2), e('mat.scrap', 3, 1, 2), e('mat.tape', 2), e('food.can.beans', 2, 1, 2), e('food.can.meat', 2), e('drink.water', 2, 1, 2), e('mat.bottle', 1, 1, 2), e('mat.cells', 1), e('mat.electronics', 2), e('drink.coffee', 1), e('mat.seeds', 1), e('keep.tape', 1), e('ammo.bullet', 1, 1, 2), e('tool.binoculars', 2), e('keep.radio', 1)],
  },
  // a workshop's drawers
  toolbox: {
    picks: [2, 4],
    entries: [e('mat.scrap', 3, 1, 3), e('mat.wire', 3, 1, 2), e('mat.tape', 3, 1, 2), e('part.sparkplug', 2), e('part.belt', 2), e('tool.wrench', 1), e('mat.rubber', 2, 1, 2), e('fuel.oil', 2), e('tool.repairkit', 2), e('tool.siphon', 1), e('mat.electronics', 2), e('part.battery.1', 1), e('tool.jack', 1),
      // vehicle systems: small spares a workshop drawer holds (worn parts common, tier 2 uncommon)
      // (the robot traveller found twelve repair kits for every one it used: worn spares are half what they were,
      // and so are the kits in car boots and on garage shelves — but not in a workshop's drawers: with those
      // halved too, and quiet stretches on the road, the first kit came too late for an engine below 40)
      e('part.brakes.1', 1), e('tool.tyreplug', 2), e('fluid.coolant', 2), e('tool.jumpleads', 1), e('part.brakes.2', 1), e('part.lights.fog', 1), e('part.heater.block', 1)],
  },
  // a shop's shelves
  shelf: {
    picks: [3, 5],
    entries: [e('food.can.beans', 3, 1, 3), e('food.can.meat', 3, 1, 2), e('food.rice', 2, 1, 2), e('food.flour', 2), e('spice.salt', 2), e('spice.sugar', 2), e('drink.water', 3, 1, 3), e('food.snack', 2, 1, 2), e('mat.cells', 2, 1, 2), e('spice.chili', 1), e('food.milkpowder', 2), e('food.can.butter', 1), e('drink.coffee', 2), e('drink.tea', 2), e('mat.seeds', 2, 1, 2)],
  },
  // a filling station's counter and till
  counter: {
    picks: [2, 4],
    entries: [e('food.snack', 4, 1, 3), e('drink.water', 3, 1, 2), e('fuel.oil', 3), e('mat.tape', 1), e('mat.cells', 2), e('tool.torch', 1), e('keep.map', 3), e('keep.tape', 3), e('drink.coffee', 1), e('tool.siphon', 1), e('keep.photo', 1),
      // (a card of tyre plugs hangs by every till: the first flat with the spare already on should not be the end of the tyre)
      e('tool.tyreplug', 1), e('fluid.coolant', 1)],
  },
  // a kitchen
  cupboard: {
    picks: [2, 4],
    entries: [e('food.rice', 2), e('food.flour', 2), e('spice.salt', 3), e('spice.sugar', 2), e('mat.bottle', 3, 1, 3), e('food.can.beans', 2), e('mat.cloth', 1), e('drink.tea', 2), e('drink.coffee', 1), e('food.can.butter', 1), e('food.milkpowder', 1), e('mat.seeds', 1)],
  },
  // a bedroom
  wardrobe: {
    picks: [2, 3],
    entries: [e('mat.cloth', 4, 1, 3), e('mat.yarn', 3, 1, 2), e('mat.button', 3, 1, 2), e('mat.rope', 1), e('keep.photo', 3), e('keep.book', 3), e('mat.hide', 1), e('keep.radio', 1)],
  },
  // an office
  desk: {
    picks: [2, 3],
    entries: [e('mat.wire', 3, 1, 2), e('mat.tape', 2), e('mat.cells', 2), e('mat.bottle', 1), e('mat.electronics', 3, 1, 2), e('keep.map', 2), e('keep.book', 2), e('keep.photo', 1), e('tool.binoculars', 1)],
  },
  // a clinic's cabinet
  medicine: {
    picks: [2, 3],
    entries: [e('med.bandage', 4, 1, 2), e('med.herbs', 3, 1, 2), e('mat.cloth', 2), e('mat.bottle', 2, 1, 2), e('med.tablets', 3, 1, 2), e('spice.chamomile', 1, 1, 2)],
  },
  // an abandoned car: under the dash
  glovebox: {
    picks: [1, 2],
    entries: [e('mat.cells', 2), e('food.snack', 2), e('mat.tape', 2), e('drink.water', 2), e('tool.torch', 1), e('keep.map', 3), e('keep.tape', 3), e('keep.photo', 2), e('ammo.bullet', 1)],
  },
  // … and in the boot
  boot: {
    picks: [1, 3],
    entries: [e('mat.rope', 3), e('mat.cloth', 2), e('mat.scrap', 2, 1, 2), e('drink.water', 2), e('food.can.beans', 2), e('mat.rubber', 2), e('fuel.oil', 2), e('tool.repairkit', 1), e('tool.siphon', 2), e('part.belt', 1), e('part.sparkplug', 1), e('tool.jack', 1),
      // vehicle systems: a spare, plugs, coolant, leads, chains
      e('tyre.road', 1), e('tool.tyreplug', 2), e('fluid.coolant', 1), e('tool.jumpleads', 1), e('tool.wrench', 1), e('acc.chains', 1), e('tool.jumppack', 1)],
  },
  // a rain barrel or an oil drum cut open: odds and ends
  barrel: {
    picks: [1, 2],
    entries: [e('mat.firewood', 4, 1, 3), e('mat.scrap', 3, 1, 2), e('mat.plank', 2), e('mat.bottle', 2), e('mat.rubber', 1), e('mat.wire', 1)],
  },
  // on a jetty: somebody's fishing things
  tacklebox: {
    picks: [2, 3],
    entries: [e('bait.worm', 4, 2, 4), e('bait.bread', 3, 1, 2), e('mat.rope', 2), e('bait.snail', 2, 1, 3), e('mat.bamboo', 2), e('mat.bottle', 1), e('bait.spinner', 3, 1, 2), e('mat.wire', 1), e('keep.photo', 1)],
  },
  // in a hide at the edge of a wood
  gamebag: {
    picks: [1, 3],
    entries: [e('mat.rope', 3), e('mat.cloth', 2), e('mat.firewood', 2, 1, 2), e('food.can.meat', 2), e('drink.water', 2), e('mat.hide', 3), e('ammo.bullet', 4, 1, 3), e('tool.binoculars', 1), e('keep.map', 1)],
  },
  // vehicle systems: a garage's shelves and floor — the big parts (worn tier I common, tier II
  // uncommon, tier III rare; their rarity in the catalogue follows the tier)
  garage: {
    picks: [1, 2],
    entries: [
      e('part.engine.1', 1), e('part.cooling.1', 2), e('part.battery.1', 2), e('part.suspension.1', 1), e('part.brakes.1', 3), e('tyre.road', 3), e('tool.repairkit', 1), e('fluid.coolant', 2, 1, 2), e('tool.tyreplug', 2),
      e('part.engine.2', 1), e('part.cooling.2', 2), e('part.battery.2', 1), e('part.suspension.2', 1), e('part.brakes.2', 2), e('tyre.allterrain', 2), e('part.tank.aux', 1), e('part.rack.cans', 1), e('part.lights.spot', 1), e('part.heater.cabin', 1), e('tool.jumppack', 1),
      e('part.engine.3', 1), e('part.cooling.3', 1), e('part.suspension.3', 1), e('tyre.mud', 1), e('tyre.snow', 1), e('part.lights.bar', 1),
    ],
  },
  // (ModCar's worlds of version 7: a place's refrigerator, a camp's cool box — core/modcar/loot.ts has what is in them)
  fridge: { picks: [1, 3], entries: [e('food.can.meat', 2), e('drink.water', 3, 1, 2)] },
  coolbox: { picks: [1, 2], entries: [e('drink.water', 3, 1, 2), e('food.can.meat', 1)] },
};

/** the three bands: common, uncommon, rare */
export const RARITY_ODDS: readonly [number, number, number] = [0.7, 0.24, 0.06];

/**
 * What one container holds. Like things are gathered into one stack.
 * @param rareBonus added to the rare band's share and taken from the common one (0.03 when well rested)
 */
export function rollLoot(kind: ContainerKind, seed: number, rareBonus = 0): Stack[] {
  const t = LOOT[kind];
  const rng = new Rng(seed);
  const picks = t.picks[0] + rng.int(t.picks[1] - t.picks[0] + 1);
  const out: Stack[] = [];
  const pRare = RARITY_ODDS[2] + rareBonus;
  const pUnc = RARITY_ODDS[1];
  for (let p = 0; p < picks; p++) {
    const u = rng.next();
    let band = u < pRare ? 2 : u < pRare + pUnc ? 1 : 0;
    // a table without that band gives the next more common thing instead
    let pool = t.entries.filter((x) => item(x.id).rarity === band);
    while (pool.length === 0 && band > 0) {
      band--;
      pool = t.entries.filter((x) => item(x.id).rarity === band);
    }
    if (pool.length === 0) continue;
    const pick = pool[rng.weighted(pool.map((x) => x.w))];
    const n = pick.n[0] + rng.int(pick.n[1] - pick.n[0] + 1);
    const had = out.find((s) => s.id === pick.id);
    if (had) had.n += n;
    else out.push({ id: pick.id, n });
  }
  return out;
}

/** every id the tables name exists in the catalogue (checked by the tests, and once here in development) */
export function lootTablesValid(): string[] {
  const bad: string[] = [];
  for (const k of CONTAINER_KINDS) for (const x of LOOT[k].entries) if (!hasItem(x.id)) bad.push(`${k}: ${x.id}`);
  return bad;
}

/** litres of petrol left in a filling station's tank, and in a wreck's (11.4) */
export const STATION_FUEL_L: readonly [number, number] = [15, 30];
export const WRECK_FUEL_L: readonly [number, number] = [2, 6];
