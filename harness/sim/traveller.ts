/**
 * The robot traveller (docs/DESIGN_V2.md 11.4, docs/VEHICLE_SYSTEMS.md §9.1): 50 stretches (≈ 550 km)
 * per run on a real world. The autopilot drives the road; at the places the site plan offers it
 * stops by a plain average strategy:
 *   - petrol: when the tank is below half, it takes what a station's tank or an intact wreck holds
 *     (a station tank is pumped straight into the car; a wreck is siphoned into the one 10 L can it
 *     carries and poured in, trip by trip);
 *   - search: it opens the containers of every place that is not just the verge, and of a wreck's
 *     glovebox and boot when it stops there anyway; it keeps parts, tyres, repair kits, plugs, coolant;
 *   - repair: a slot below 40 gets a repair kit at once (+50);
 *   - a flat: the spare goes on (20 s); the flat is plugged if there is a plug; with no good spare it
 *     plugs the wheel itself; with neither it drives on, slowly, and it is counted;
 *   - an upgrade: a found part of a higher tier for a slot is fitted at the next stop.
 * Times come from the systems' and the player base's rates (walking 1.3 m/s). If the tank runs dry
 * the run is rescued (3 L, ten minutes lost) and the event counted: the world must offer enough.
 */
import { AUTOPILOT } from '../../src/core/driver/autopilot';
import { RobotDriver } from '../../src/core/driver/robot';
import { rollLoot } from '../../src/core/items/loot';
import { VehicleSim } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { applyOp, catalogItem, planOp, SimpleInventory, stockState, VehicleSystems, type ItemInstance, type OpRequest, type SlotId } from '../../src/core/vehicle/systems';
import { SpineSample } from '../../src/core/world/spine';
import type { Site } from '../../src/core/world/sites';
import { World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const WALK = 1.3;
const PULL_IN_S = 25;
const STRETCH_M = 11000;
const SLOTS: SlotId[] = ['engine', 'cooling', 'battery', 'suspension', 'brakes', 'body'];
const KEEP = (id: string): boolean => id.startsWith('part.') || id.startsWith('tyre.') || id === 'tool.repairkit' || id === 'tool.tyreplug' || id === 'fluid.coolant' || id === 'tool.jumppack' || id === 'acc.chains';

export interface TravelResult {
  km: number;
  driveH: number;
  stopH: number;
  dry: number;
  minFuelFrac: number;
  burntL: number;
  foundL: number;
  /** petrol the world held along the way (every station tank and wreck passed), taken or not */
  offeredL: number;
  stationL: number;
  wreckL: number;
  punctures: number;
  puncturesNoRemedy: number;
  kitsFound: number;
  kitsUsed: number;
  plugsFound: number;
  partsFound: number;
  upgrades: number;
  minCond: Record<string, number>;
  minTread: number;
  tyresFitted: number;
  accidents: number;
  stops: number;
}

export function travel(spec: VehicleSpec, seed: number, biome: string, stretches = 50, hz = 60): TravelResult {
  const w = new World(seed, { startBiome: biome });
  const sp = w.spine;
  const st = new SpineSample();
  const lane = 1.6;
  const ap = AUTOPILOT[spec.id] ?? AUTOPILOT.t0_truck;
  const v = new VehicleSim(spec, hz);
  const sys = new VehicleSystems(spec, stockState(spec, seed));
  const inv = new SimpleInventory([{ id: 'fuel.jerrycan', litres: 0 }]);
  for (const k of sys.kit.list()) inv.give({ id: k.id });
  const robot = new RobotDriver({ cruise: ap.cruiseKmh / 3.6, lane, latG: ap.latG });
  const env = { ambientC: 18, dark: false, rain: 0 };
  const r: TravelResult = {
    km: 0, driveH: 0, stopH: 0, dry: 0, minFuelFrac: 1, burntL: 0, foundL: 0, offeredL: 0, stationL: 0, wreckL: 0, punctures: 0, puncturesNoRemedy: 0,
    kitsFound: 0, kitsUsed: 0, plugsFound: 0, partsFound: 0, upgrades: 0, minCond: {}, minTread: 100, tyresFitted: 0, accidents: 0, stops: 0,
  };
  for (const sl of SLOTS) r.minCond[sl] = 100;
  const fuelLeft = new Map<string, number>();
  const visited = new Set<string>();
  const ahead: Site[] = [];
  let aheadTo = 0;
  let roofedSeen = 0;

  const placeAt = (s: number): void => {
    sp.at(s, st);
    v.reset(st.x - Math.sin(st.phi) * lane, st.y + 0.05, st.z + Math.cos(st.phi) * lane, -st.phi);
    sys.bind(v);
    robot.s = s;
  };
  const s0 = 40;
  placeAt(s0);
  const tank = sys.tankL;
  let stopS = 0;
  const ctx = { inv, people: 1, handsFree: true };
  const doOp = (req: OpRequest): boolean => {
    const plan = planOp(sys, req, ctx);
    if (!plan.ok) return false;
    applyOp(sys, req, ctx);
    stopS += plan.seconds;
    return true;
  };

  /** take petrol from a source: a station tank is pumped in; a wreck's goes by can */
  const takeFuel = (site: Site): void => {
    for (const f of site.fuel) {
      let left = fuelLeft.get(f.id) ?? f.litres;
      const walk = Math.hypot(f.x - v.px, f.z - v.pz);
      while (left > 0.05 && tank - sys.state.fuelL > 0.5) {
        if (f.from === 'tank') {
          const l = Math.min(left, tank - sys.state.fuelL);
          stopS += (2 * walk) / WALK + l / (10 / 15);
          sys.addFuel(l);
          left -= l;
          r.stationL += l;
          r.foundL += l;
        } else {
          const l = Math.min(left, 10, tank - sys.state.fuelL);
          stopS += (2 * walk) / WALK + l / (2 / 5) + l / (10 / 12);
          sys.addFuel(l);
          left -= l;
          r.wreckL += l;
          r.foundL += l;
        }
      }
      fuelLeft.set(f.id, left);
    }
  };

  const search = (site: Site, within = Infinity): void => {
    let opened = 0;
    for (const c of site.containers) {
      if (visited.has(c.id) || opened >= 4 || Math.hypot(c.x - v.px, c.z - v.pz) > within) continue;
      opened++;
      visited.add(c.id);
      stopS += (2 * Math.hypot(c.x - v.px, c.z - v.pz)) / WALK + 1.5 + 2;
      for (const s of rollLoot(c.kind, c.seed)) {
        if (!KEEP(s.id)) continue;
        for (let n = 0; n < s.n; n++) inv.give({ id: s.id });
        if (s.id === 'tool.repairkit') r.kitsFound += s.n;
        else if (s.id === 'tool.tyreplug') r.plugsFound += s.n;
        else if (s.id.startsWith('part.') || s.id.startsWith('tyre.')) r.partsFound += s.n;
      }
    }
  };

  /** fit what is better than what is in its slot (a higher tier) */
  const upgrade = (): void => {
    for (const it of inv.items.slice()) {
      const c = catalogItem(it.id);
      if (!c || c.kind !== 'part' || !c.slot || c.slot === 'body') continue;
      const cur = sys.state.slots[c.slot];
      const curTier = cur ? (catalogItem(cur.id)?.tier ?? 1) : 0;
      if ((c.tier ?? 1) <= curTier) continue;
      sys.stopEngine();
      if (cur && !doOp({ kind: 'remove', slot: c.slot })) continue;
      if (doOp({ kind: 'install', item: it.id })) r.upgrades++;
    }
  };

  const repairAll = (): void => {
    for (const sl of SLOTS) {
      const p = sys.state.slots[sl];
      if (!p || p.cond >= 40) continue;
      sys.stopEngine();
      if (doOp({ kind: 'repair', slot: sl })) r.kitsUsed++;
    }
  };

  /**
   * Wheels: a flat gets the spare (and the flat is plugged on the carrier), or a plug, or a found tyre;
   * a worn-out tyre (tread < 25) is swapped for a found one. Returns whether a flat is left on the car.
   */
  const fixWheels = (): boolean => {
    sys.setHandbrake(true);
    const tyreAt = (): string | undefined => inv.items.find((it) => it.id.startsWith('tyre.') && !it.flat && (it.cond ?? 65) > 30)?.id;
    for (let i = 0; i < 4; i++) {
      const wh = sys.state.wheels[i];
      if (wh.flat) {
        if (sys.state.spare && !sys.state.spare.flat && doOp({ kind: 'changeWheel', wheel: i })) {
          if (inv.count('tool.tyreplug') > 0) doOp({ kind: 'patchTyre', wheel: 'spare' });
          continue;
        }
        if (inv.count('tool.tyreplug') > 0 && doOp({ kind: 'patchTyre', wheel: i })) continue;
      }
      if (wh.flat || wh.tread < 25) {
        const t = tyreAt();
        if (t) {
          // a found wheel goes on (a different type is fine): the old one is left behind
          doOp({ kind: 'fitTyre', wheel: i, item: t });
          inv.take(wh.tyre);
          r.tyresFitted++;
        }
      }
    }
    if (sys.state.spare?.flat && inv.count('tool.tyreplug') > 0) doOp({ kind: 'patchTyre', wheel: 'spare' });
    sys.setHandbrake(false);
    return sys.state.wheels.some((w) => w.flat);
  };

  const end = s0 + stretches * STRETCH_M;
  let punct0 = 0;
  let lastFuel = sys.state.fuelL;
  let slow = 0;
  const b = new Float64Array(9);
  const h = v.h;
  let substeps = 0;
  while (robot.s < end) {
    // the places coming up
    if (robot.s + 600 > aheadTo) {
      w.sites.between(aheadTo, aheadTo + 1500, ahead);
      aheadTo += 1500;
      ahead.sort((x, y) => x.s - y.s);
    }
    const inp = robot.update(h, v, sp);
    v.substep(inp, w);
    substeps++;
    if (substeps % 2 === 0) sys.update(h * 2, env);
    r.driveH += h / 3600;
    // fuel burnt (refills are counted separately)
    if (sys.state.fuelL < lastFuel) r.burntL += lastFuel - sys.state.fuelL;
    lastFuel = sys.state.fuelL;
    const frac = sys.state.fuelL / tank;
    if (frac < r.minFuelFrac) r.minFuelFrac = frac;
    for (const sl of SLOTS) {
      const c = sys.state.slots[sl]?.cond ?? 0;
      if (c < r.minCond[sl]) r.minCond[sl] = c;
    }
    for (const wh of sys.state.wheels) if (wh.tread < r.minTread) r.minTread = wh.tread;

    let stopHere: Site | null = null;
    while (ahead.length && ahead[0].s < robot.s) {
      const site = ahead.shift()!;
      for (const f of site.fuel) r.offeredL += f.litres;
      const fuelNeed = sys.state.fuelL < 0.5 * tank && site.fuel.some((f) => (fuelLeft.get(f.id) ?? f.litres) > 0.05);
      // a plain average traveller looks round every second place with a roof (station, garage, shop,
      // house), opening up to four of its containers — and searches wherever it stops for petrol anyway
      const roofed = site.kind === 'station' || site.kind === 'garage' || site.kind === 'shop' || site.kind === 'house';
      if (roofed) roofedSeen++;
      const searchable = roofed && roofedSeen % 2 === 1 && site.containers.some((c) => !visited.has(c.id));
      if (fuelNeed || searchable) stopHere = site;
      if (stopHere) {
        // pull in where it matters (the place's anchor; on the verge, beside the wreck with petrol) and stand still
        let sStop = site.s;
        const wreck = site.kind === 'roadside' ? site.fuel.find((f) => (fuelLeft.get(f.id) ?? f.litres) > 0.05) : undefined;
        if (wreck) {
          const pr = { s: 0, d: 0 };
          sp.project(wreck.x, wreck.z, site.s, pr);
          sStop = pr.s;
        }
        placeAt(Math.max(sStop, robot.s - 400));
        stopS = PULL_IN_S;
        if (fuelNeed) takeFuel(site);
        // on the verge only what is by the wreck is looked at
        search(site, site.kind === 'roadside' ? 25 : Infinity);
        upgrade();
        repairAll();
        fixWheels();
        r.stops++;
        r.stopH += stopS / 3600;
        if (process.env.TRAV_DEBUG) console.log('stop', site.kind, Math.round(stopS), 'fuel', fuelNeed);
        sys.startEngine();
        stopHere = null;
        // it stood still: it pulls out from rest
        placeAt(robot.s);
        lastFuel = sys.state.fuelL;
      }
    }
    // things that cannot wait for a place
    if (sys.events.punctures !== punct0) {
      r.punctures += sys.events.punctures - punct0;
      punct0 = sys.events.punctures;
      placeAt(robot.s);
      stopS = 10;
      // a puncture with nothing to mend it: drive on, slowly, to the next place (counted once)
      if (fixWheels()) r.puncturesNoRemedy++;
      r.stopH += stopS / 3600;
      placeAt(robot.s);
      lastFuel = sys.state.fuelL;
      continue;
    }
    if (SLOTS.some((sl) => (sys.state.slots[sl]?.cond ?? 100) < 40) && inv.count('tool.repairkit') > 0) {
      placeAt(robot.s);
      stopS = 10;
      repairAll();
      sys.startEngine();
      r.stopH += stopS / 3600;
      placeAt(robot.s);
      lastFuel = sys.state.fuelL;
      continue;
    }
    if (sys.state.fuelL <= 0) {
      // never stranded (5.6): somebody tows, pushes or brings a can — counted, ten minutes lost
      r.dry++;
      sys.addFuel(3);
      r.foundL += 3;
      r.stopH += 600 / 3600;
      sys.startEngine();
      placeAt(robot.s);
      lastFuel = sys.state.fuelL;
      continue;
    }
    // off the road, over, or stuck: put it back on the road (counted)
    v.basis(b);
    slow = v.speed < 1 && sys.state.running ? slow + h : 0;
    if (b[4] < 0.3 || Math.abs(robot.d - lane) > 6 || slow > 8 || v.exploded) {
      r.accidents++;
      placeAt(robot.s + 5);
      slow = 0;
      lastFuel = sys.state.fuelL;
    }
  }
  r.km = (robot.s - s0) / 1000;
  return r;
}

const BIOME_RUNS: [string, number][] = [
  ['plains', 11],
  ['desert', 23],
  ['alpine', 37],
];

/** per vehicle: one run in each starting biome; the gate's figures */
export function collectEconomyMetrics(spec: VehicleSpec, stretches = 50): Metrics {
  const runs = BIOME_RUNS.map(([biome, seed]) => travel(spec, seed, biome, stretches));
  const sum = (f: (x: TravelResult) => number): number => runs.reduce((a, x) => a + f(x), 0);
  const km = sum((x) => x.km);
  const out: Metrics = {
    econ_km: km,
    econ_dry: sum((x) => x.dry),
    econ_min_fuel_frac: Math.min(...runs.map((x) => x.minFuelFrac)),
    econ_burnt_l_100km: (sum((x) => x.burntL) / km) * 100,
    econ_found_l_100km: (sum((x) => x.foundL) / km) * 100,
    econ_offered_l_100km: (sum((x) => x.offeredL) / km) * 100,
    econ_fuel_closure: sum((x) => x.foundL) / sum((x) => x.burntL),
    econ_kits_margin: sum((x) => x.kitsFound) - sum((x) => x.kitsUsed),
    econ_station_l_100km: (sum((x) => x.stationL) / km) * 100,
    econ_wreck_l_100km: (sum((x) => x.wreckL) / km) * 100,
    econ_punctures_100km: (sum((x) => x.punctures) / km) * 100,
    econ_punctures_no_remedy: sum((x) => x.puncturesNoRemedy),
    econ_kits_found: sum((x) => x.kitsFound),
    econ_kits_used: sum((x) => x.kitsUsed),
    econ_plugs_found: sum((x) => x.plugsFound),
    econ_parts_found: sum((x) => x.partsFound),
    econ_upgrades: sum((x) => x.upgrades),
    econ_min_tread: Math.min(...runs.map((x) => x.minTread)),
    econ_tyres_fitted: sum((x) => x.tyresFitted),
    econ_stop_min_per_hour: (sum((x) => x.stopH) / sum((x) => x.driveH)) * 60,
    econ_accidents: sum((x) => x.accidents),
    econ_stops_100km: (sum((x) => x.stops) / km) * 100,
  };
  for (const sl of SLOTS) out[`econ_min_cond_${sl}`] = Math.min(...runs.map((x) => x.minCond[sl]));
  return out;
}
