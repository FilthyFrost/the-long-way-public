/**
 * The robot traveller down a world of version 7 (docs/V3/plan/finish.md §二 5): three hundred kilometres of its road,
 * place by place as the game lays them (headless, no picture) — the plan fitted to the places (places.ts worldPlan),
 * the places' own boxes by the version's rules and the road ahead (loot.ts ownFound), what lies in plain sight, the
 * sets coming apart as their things are picked up (kits.ts), the pumps and the wrecks' tanks.
 *
 * The traveller stops where `stops` says (every place; or only the big ones) and picks up all there is at a stop: what
 * it finds, when each new thing first turns up, how far from its main thing each set is whole, what there is to eat
 * (ready, and to cook), to drink and to burn against what one uses on the way, how much scrap and how many components
 * the junk would give.
 */
import { CHAPTER_KM, chapterAt, partSalvage, toolSalvage } from '../../src/core/modcar/crafting';
import { hasItem, itemDef, newItem, salvageOf } from '../../src/core/modcar/items';
import { kitBegun, kitHeld, kitOf, kitPicked, KITS, kitsPassed, thingKey, type KitsState, type PlacesAhead } from '../../src/core/modcar/kits';
import { climateAhead, regionsAlong } from '../../src/core/modcar/lookahead';
import { boxesOfFinds, foundKey, foundScheduled, looseFound, looseKept, lootRules, ownFound, planBoxes, PLACES_KEEP, stationFuel, type Found } from '../../src/core/modcar/loot';
import { partDef } from '../../src/core/modcar/parts';
import { rescueFinds, supplyCount, supplyFactors, type RescueState, type Stocks } from '../../src/core/modcar/needs';
import { heldBackUntil, SitePlanner, THEME_WAIT_M, type PlannedFind } from '../../src/core/modcar/schedule';
import { rollWreck } from '../../src/core/modcar/wrecks';
import { pumpFound, pumpFuel } from '../../src/core/v3/nd/fuel';
import type { Site } from '../../src/core/world/sites';
import { planPlaces, worldPlan } from '../../src/game/modcar/places';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { VehicleFinds, wreckSpots } from '../../src/game/modcar/wrecks';

/** the traveller's pace: km of road an hour of play, stops and all (Nomad Drive's budget) */
export const PACE_KMH = 10;
/** what one uses a kilometre at that pace: food and thirst points (100 a full bar), litres of petrol (27 a hundred kilometres) */
export const PER_KM = { food: (60 / PACE_KMH) * (100 / 76), water: (60 / PACE_KMH) * (100 / 58), petrol: 0.27 };
/** a dish is worth at least this many times what went into it eaten raw (docs/V3/plan/finish.md §八 3) */
export const COOKED = 1.6;

/** the same hash of an id the places use for what lies about (places.ts hashId) */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** what one stop gives */
export interface Stop7 {
  s: number;
  kind: string;
  /** food points ready to eat; food points of what is to cook, as cooked; thirst points; litres of petrol to carry off */
  ready: number;
  raw: number;
  water: number;
  petrol: number;
  pump: boolean;
  scrap: number;
  components: number;
  /** stopped at (false: driven past — nothing of it taken) */
  stopped: boolean;
}

export interface KitRun {
  /** where its main thing was picked up (km; NaN: never) */
  main: number;
  /** where each of its steps was picked up (km; NaN: not yet by the end) */
  steps: number[];
}

export interface Journey7 {
  seed: number;
  km: number;
  stops: Stop7[];
  /** where each of the plan's new things was first found at a stop (km), by its entry */
  firsts: Map<string, number>;
  /** every first of a new thing (the plan's, a set's step), in road order: what and where (km) */
  news: { what: string; km: number }[];
  kits: Record<string, KitRun>;
  /** where petrol was to be had (m): a can, a pump, a wreck's tank */
  petrolAt: number[];
  /** the cans put before a long way with no place (lookahead.ts: m) */
  cansBefore: number[];
  /** blueprints found */
  sheets: number;
  /** how the traveller fared living off it (see Life) */
  life: Life;
  /** what was asked for at the next place because one was all but out (needs.ts rescueFinds), by its entry */
  rescues: Record<string, number>;
}

/**
 * How a traveller fared: the least its stomach, its thirst and its tank came to, where it first ran out of each (km;
 * Infinity: never), and the least there was in the pack to eat and to drink after the first ten kilometres
 */
export interface Life {
  food: number;
  water: number;
  petrol: number;
  starved: number;
  parched: number;
  dry: number;
  packFood: number;
  packWater: number;
}

const BIG = new Set(['station', 'shop', 'house', 'camp', 'garage', 'works']);
/** the traveller that stops at every place, and the one that stops only at the big ones */
export const EVERY = (): boolean => true;
export const BIG_ONLY = (site: Site): boolean => BIG.has(site.kind);

/**
 * One world down its first `km` kilometres. The traveller lives off it as it goes: full to begin with, two packs of
 * biscuits and the big bottle of water in the pack, 20 L in the tank (45 L, a 20 L can besides); it eats and drinks
 * when half empty — a meal cooked where it can (the stove, its gas and a pan in the pack: the cooking set come that
 * far), else what is ready — takes all there is at each stop it makes, fills up at every pump. `needs`: the places
 * look at what it is short of as it comes (needs.ts: more or less of their own, the plan's supplies thicker or
 * thinner, what it is all but out of at the next place for certain) — as the game does; false: they do not.
 */
export function travel7(seed: number, km = 300, stopsAt: (site: Site) => boolean = EVERY, needs = true): Journey7 {
  const world = modcarWorld(seed, { worldVersion: 7 }).world;
  const rules = lootRules(7);
  const sites: Site[] = [];
  world.sites.between(0, km * 1000, sites);
  const road = sites.filter((x) => x.s <= km * 1000).sort((a, b) => a.s - b.s);
  const regions = regionsAlong(world.spine.plan, km * 1000 + 30_000);
  const finds = worldPlan(world, seed, 'normal', km + 10);
  const planner = new SitePlanner(finds);
  const held = heldBackUntil(finds, true);
  /** one of the plan's new things whose first is not due yet down to here: not among a place's own (places.ts heldNow) */
  const heldNow = (key: string, s: number): boolean => {
    const until = held.get(key);
    return until !== undefined && s < until + THEME_WAIT_M;
  };
  const kits: KitsState = {};
  const added: PlannedFind[] = [];
  const ahead: PlacesAhead = (from, to) => planPlaces(world, from, to).filter((p) => p.boxes > 0);
  const keep = PLACES_KEEP;
  const has = new Set<string>();
  const life: Life = { food: 100, water: 100, petrol: 20, starved: Infinity, parched: Infinity, dry: Infinity, packFood: Infinity, packWater: Infinity };
  const out: Journey7 = { seed, km, stops: [], firsts: new Map(), news: [], kits: Object.fromEntries(KITS.map((k) => [k.id, { main: NaN, steps: k.steps.map(() => NaN) }])), petrolAt: [], cansBefore: finds.filter((f) => f.entry === 'ahead:fuel').map((f) => f.s), sheets: 0, life, rescues: {} };
  // ---- the traveller's own: stomach, thirst, the pack, the tank and the can
  const me = { food: 100, water: 100, ready: 50, raw: 0, drink: 200, tank: 20, tyres: 0, meds: 0, at: 0 };
  const rescue: RescueState = {};
  const cooks = (): boolean => (kits.cooking?.got ?? 0) >= 3;
  /** on down the road to s (m), eating and drinking as it goes */
  const driveTo = (s: number): void => {
    for (; me.at + 100 <= s; me.at += 100) {
      const at = me.at / 1000;
      me.food -= PER_KM.food * 0.1;
      me.water -= PER_KM.water * 0.1;
      me.tank -= PER_KM.petrol * 0.1;
      if (me.food < 50) {
        if (cooks() && me.raw > 0) {
          const e = Math.min(me.raw, 100 - me.food);
          me.food += e;
          me.raw -= e;
        }
        if (me.food < 50 && me.ready > 0) {
          const e = Math.min(me.ready, 100 - me.food);
          me.food += e;
          me.ready -= e;
        }
      }
      if (me.water < 50 && me.drink > 0) {
        const d = Math.min(me.drink, 100 - me.water);
        me.water += d;
        me.drink -= d;
      }
      if (at > 10) {
        life.packFood = Math.min(life.packFood, me.ready + (cooks() ? me.raw : 0));
        life.packWater = Math.min(life.packWater, me.drink);
      }
      life.food = Math.min(life.food, me.food);
      life.water = Math.min(life.water, me.water);
      life.petrol = Math.min(life.petrol, me.tank);
      if (me.food <= 0 && life.starved === Infinity) life.starved = at;
      if (me.water <= 0 && life.parched === Infinity) life.parched = at;
      if (me.tank <= 0 && life.dry === Infinity) life.dry = at;
      me.food = Math.max(0, me.food);
      me.water = Math.max(0, me.water);
      me.tank = Math.max(0, me.tank);
    }
  };
  /** what it has, as the places see it (needs.ts Stocks): the pack's and the tank's — what is to cook as food once it can cook */
  const stocks = (): Stocks => ({ food: me.ready + (cooks() ? me.raw : 0), water: me.drink, petrol: me.tank, tyres: me.tyres, meds: me.meds });
  // the wrecks' tanks: what petrol is left in them (a hose and a can: the siphon), in road order with the places
  const finder = new VehicleFinds(world);
  const tanks: { s: number; litres: number }[] = [];
  for (const x of wreckSpots(world, 0, km * 1000)) {
    const r = rollWreck(x.seed, x.type, x.stripped, x.s, finder.has(x), rules);
    for (const inst of Object.values(r.build.parts)) {
      const fuel = partDef(inst.part).fuelTank ? (inst.fluids.fuel?.petrol ?? 0) : 0;
      if (fuel > 1) tanks.push({ s: x.s, litres: fuel });
    }
  }
  tanks.sort((a, b) => a.s - b.s);
  let tankAt = 0;
  /** the wrecks' tanks passed down to s: siphoned by the traveller that stops at everything */
  const wrecksTo = (s: number): void => {
    for (; tankAt < tanks.length && tanks[tankAt].s <= s; tankAt++) {
      const w = tanks[tankAt];
      driveTo(w.s);
      out.petrolAt.push(w.s);
      const all = stopsAt === EVERY;
      out.stops.push({ s: w.s, kind: 'wreck', ready: 0, raw: 0, water: 0, petrol: w.litres, pump: false, scrap: 0, components: 0, stopped: all });
      if (all) me.tank = Math.min(45 + 20, me.tank + w.litres);
    }
  };
  const seen = new Set<string>();
  const news = (what: string, s: number): void => {
    if (seen.has(what)) return;
    seen.add(what);
    out.news.push({ what, km: s / 1000 });
  };
  /** the sets' own, as a thing comes into the hands at s */
  const picked = (key: string, s: number): void => {
    has.add(key);
    const at = kitOf(key);
    if (!at) return;
    const before = kits[at.kit.id]?.got ?? 0;
    const more = kitPicked(kits, key, s, seed, ahead);
    const now = kits[at.kit.id]?.got ?? 0;
    if (now > before) {
      const run = out.kits[at.kit.id];
      if (at.index === 0) run.main = s / 1000;
      else run.steps[at.index - 1] = s / 1000;
      news(`kit:${at.kit.id}:${at.index}`, s);
    }
    if (more.length) added.push(...planner.add(more));
    // (a step of things one has other uses for, one of them in the pack already: taken at once)
    for (let guard = 0; guard < 4; guard++) {
      const k = kits[at.kit.id];
      const step = k && k.got >= 1 ? at.kit.steps[k.got - 1] : undefined;
      const have = step?.free ? step.things.map(thingKey).find((x) => has.has(x)) : undefined;
      if (!have) break;
      const got0 = k!.got;
      const next = kitPicked(kits, have, s, seed, ahead);
      if ((kits[at.kit.id]?.got ?? 0) > got0) out.kits[at.kit.id].steps[got0 - 1] = s / 1000;
      if (next.length) added.push(...planner.add(next));
    }
  };

  for (const site of road) {
    wrecksTo(site.s);
    driveTo(site.s);
    // (all but out of something: the next place has it for certain — asked for before the place is laid out)
    if (needs) {
      const sos = rescueFinds(rescue, site.s - 400, { tankFrac: me.tank / 45, cansL: Math.max(0, me.tank - 45), food: me.ready + (cooks() ? me.raw : 0), water: me.drink });
      for (const f of sos) out.rescues[f.entry] = (out.rescues[f.entry] ?? 0) + 1;
      if (sos.length) added.push(...planner.add(sos));
    }
    planner.take([{ id: site.id, s: site.s, kind: site.kind, boxes: planBoxes(site).length, ground: !planBoxes(site).length && site.objects.some((o) => o.kind === 'wreck') }]);
    // (one in a hurry still stops anywhere when all but out of something)
    const desperate = me.drink < 17 || me.ready + (cooks() ? me.raw : 0) < 13 || me.tank < 0.15 * 45;
    const stopped = stopsAt(site) || desperate;
    const factors = needs ? supplyFactors(stocks()) : undefined;
    const stop: Stop7 = { s: site.s, kind: site.kind, ready: 0, raw: 0, water: 0, petrol: 0, pump: false, scrap: 0, components: 0, stopped };
    const climate = climateAhead(regions, site.s);
    // (what a place holds is decided as one comes to it — the game lays it out then: the sets as they stood on arrival)
    const onArrival = JSON.parse(JSON.stringify(kits)) as KitsState;
    const withheld = (key: string): boolean => heldNow(key, site.s) || kitHeld(onArrival, key);
    const begun = (key: string): boolean => kitBegun(onArrival, key) && has.has(key);
    const offer: Found[] = [];
    /** a thing found here: counted, and (stopped at) picked up */
    const take = (f: Found): void => {
      if ('item' in f) {
        if (!hasItem(f.item)) return;
        const d = itemDef(f.item);
        const n = f.n ?? 1;
        if (f.item.startsWith('bp_')) out.sheets++;
        if (f.item.startsWith('ing_')) {
          // (what is to cook: as a dish it is worth what the plan says of it — its portions' food, COOKED times)
          const food = d.eat?.food ?? 0;
          stop.raw += Math.max(food, portionFood(f.item)) * COOKED * n;
        } else if (d.eat && d.eat.food > 0) {
          stop.ready += d.eat.food * n;
          stop.water += (d.eat.water ?? 0) * n;
        }
        if (d.drink && !d.drink.empty && (d.drink.liquid === 'water' || d.drink.liquid === 'coffee')) stop.water += (d.drink.litres / 0.1) * (d.drink.liquid === 'water' ? 10 : 6) * n;
        if (!(d.eat && d.eat.food > 0) && !d.drink) {
          const sv = salvageOf(newItem(f.item, n > 1 ? { n } : {}));
          stop.scrap += sv.scrap ?? 0;
          stop.components += sv.components ?? 0;
        }
      } else if ('tool' in f) {
        if (f.tool.kind === 'jerrycan' && (f.tool.fuel ?? 'petrol') === 'petrol') stop.petrol += f.tool.litres ?? 0;
        const sv = toolSalvage(f.tool);
        stop.scrap += sv.scrap ?? 0;
        stop.components += sv.components ?? 0;
      } else {
        const sv = partSalvage(f.part);
        stop.scrap += sv.scrap ?? 0;
        stop.components += sv.components ?? 0;
      }
      if (stopped) picked(foundKey(f), site.s);
    };
    /** what a taken thing adds to the pack: a tyre kit, a medicine (the rest is the stop's own count) */
    const pack = (f: Found): void => {
      if (!('item' in f) || !hasItem(f.item)) return;
      if (f.item === 'nd_tire_kit') me.tyres += f.n ?? 1;
      else if (itemDef(f.item).cat === 'med') me.meds += f.n ?? 1;
    };
    // the plan's finds here: in the place's own boxes (or on the ground by its wreck)
    const here = planner.findsAt(site.id);
    const boxes = planBoxes(site);
    const into = boxesOfFinds(site, here, rules);
    here.forEach((f, j) => {
      if (stopped && f.novelty && !out.firsts.has(f.entry)) {
        out.firsts.set(f.entry, site.s / 1000);
        news(f.entry, site.s);
      }
      [f.thing, ...(f.with ?? [])].forEach((x, i) => {
        if ('blueprint' in x) {
          out.sheets++;
          return;
        }
        // (the main thing of a set one has begun already: a box of old components in its place — places.ts sheetOf)
        const thing = begun(thingKey(x)) ? { item: 'crate_parts' } : x;
        // (a supply of the plan's: none of it, or two, now and then — by what one is short of: places.ts roll)
        const at = boxes.length ? boxes[into[j]].seed : site.seed;
        const n = factors ? supplyCount(f, factors, at + j * 31) : 1;
        for (let c = 0; c < n; c++) offer.push(foundScheduled(thing, at + j * 31 + i + c * 977, site.s, rules));
      });
    });
    // the place's own boxes, by the version's rules and the road ahead; nothing that is kept back for now
    for (const c of site.containers) offer.push(...ownFound(c, site.s, site.kind, rules, climate, keep, withheld, factors));
    // what lies in plain sight
    for (const l of site.loose) {
      if (heldNow(l.item, site.s)) continue;
      const f = looseFound(l.item, hashId(l.id), site.s, site.kind, rules);
      if (!f || !looseKept(f, hashId(l.id), keep, factors) || withheld(foundKey(f))) continue;
      offer.push('item' in f ? { ...f, n: l.n } : f);
    }
    for (const f of offer) {
      take(f);
      if (stopped) pack(f);
    }
    // the pumps
    const tank = site.fuel.find((f) => f.from === 'tank');
    const ours = site.kind === 'station' && tank ? stationFuel(tank.litres, site.seed).petrol : 0;
    const nd = site.prefab === 'station' && pumpFuel(site.seed, world.seed) === 'petrol' ? pumpFound(site.seed, world.seed) : 0;
    stop.pump = ours + nd > 0;
    if (stop.petrol > 0.5 || stop.pump) out.petrolAt.push(site.s);
    out.stops.push(stop);
    // into the pack and the tank
    if (stop.pump) me.tank = Math.max(me.tank, 45);
    if (stopped) {
      me.ready += stop.ready;
      me.raw += stop.raw;
      me.drink += stop.water;
      me.tank = Math.min(45 + 20, me.tank + stop.petrol);
    }
    // a set's step driven past (three kilometres beyond the place that took it): put out again further on
    const again = kitsPassed(
      kits,
      site.s,
      seed,
      (kit, step) => {
        const entry = `kit:${kit}:${step}`;
        for (let i = added.length - 1; i >= 0; i--) if (added[i].entry === entry) return planner.laidAt(added[i]);
        return undefined;
      },
      ahead,
    );
    if (again.length) added.push(...planner.add(again));
  }
  wrecksTo(km * 1000);
  driveTo(km * 1000);
  out.petrolAt.sort((a, b) => a - b);
  out.stops.sort((a, b) => a.s - b.s);
  return out;
}

/** the food of one portion of an ingredient, as the pantry has it (its item's own `eat` is what it gives raw: less, or none) */
function portionFood(item: string): number {
  return PORTION.get(item) ?? 0;
}
const PORTION = new Map<string, number>();
import { FOODS } from '../../src/core/v3/kitchen/pantry';
for (const f of FOODS) PORTION.set(`ing_${f.id}`, f.food);

/** the chapter a kilometre is of, and each chapter's kilometres (re-exported for the tests' tables) */
export { CHAPTER_KM, chapterAt };

/** how the traveller of a journey fared (travel7 lives off the road as it goes) */
export function live7(j: Journey7): Life {
  return j.life;
}
