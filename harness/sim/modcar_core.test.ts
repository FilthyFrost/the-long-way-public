/**
 * ModCar core (docs/MODCAR.md §10, automatic acceptance 1–5): the catalogue is complete, every part fits
 * every mount of its category on every frame and the result drives without blowing up, the parts change
 * how a vehicle drives, and the rules say what is wrong in a sentence.
 */
import { describe, expect, it } from 'vitest';
import { allInstances, decodeBuild, encodeBuild, fitPart, fitSub, newInstance, removePart, removeSub, stockBuild, stockTireFor } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { FRAMES, frameDef } from '../../src/core/modcar/frames';
import { PARTS, partDef, partsOf } from '../../src/core/modcar/parts';
import { canDrive, crankProblems, driveProblems, runProblems, warnings } from '../../src/core/modcar/rules';
import { applyToSim } from '../../src/core/modcar/simlink';
import { quickPerf } from '../../src/core/modcar/stats';
import { CATEGORIES, type Build, type Category } from '../../src/core/modcar/types';
import { VehicleSim } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

const STATS_KEY: Record<Category, string> = {
  engine: 'engine',
  gearbox: 'gearbox',
  radiator: 'radiator',
  battery: 'battery',
  fuelTank: 'fuelTank',
  exhaust: 'exhaust',
  turbo: 'turbo',
  rim: 'rim',
  tire: 'tire',
  suspension: 'suspension',
  brakes: 'brakes',
  diff: 'diff',
  steering: 'steering',
  seat: 'seat',
  door: 'panel',
  hood: 'panel',
  trunk: 'panel',
  bumperFront: 'bumper',
  bumperRear: 'bumper',
  headlight: 'lamp',
  taillight: 'lamp',
  mirror: 'mirror',
  roof: 'roof',
  armor: 'armor',
  horn: 'horn',
  radio: 'radio',
  handbrake: 'handbrake',
  gearLever: 'gearLever',
  ignition: 'ignition',
};

/** a small deterministic random source for the fuzzing */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** drive a build for a while: full throttle, a turn, a stop; returns the simulation */
function shake(build: Build, seconds = 6, seed = 1): VehicleSim {
  const d = derive(build);
  const sim = new VehicleSim(d.spec as VehicleSpec);
  applyToSim(sim, d, true);
  const ground = new FlatGround({ relief: (x, z) => 0.03 * Math.sin(x * 0.7) * Math.cos(z * 0.9) });
  ground.sample(0, 0, { h: 0 } as never);
  sim.reset(0, 0, 0, 0);
  sim.setParkBrake(false);
  const r = rng(seed);
  const n = Math.round(seconds * 120);
  for (let i = 0; i < n; i++) {
    const phase = i / n;
    const steer = phase > 0.4 && phase < 0.7 ? Math.sin(i * 0.01 + r()) * 0.8 : 0;
    const throttle = phase < 0.75 ? 1 : 0;
    const brake = phase >= 0.75 ? 1 : 0;
    sim.substep({ steer, throttle, brake, handbrake: 0 }, ground);
    if (sim.exploded) break;
  }
  return sim;
}

function finiteSpec(spec: VehicleSpec): boolean {
  const nums: number[] = [spec.mass, spec.wheelbase, spec.weightFront, spec.cgHeight, spec.wheelRadius, spec.inertia.roll, spec.inertia.yaw, spec.inertia.pitch, spec.brakes.maxG, spec.aero.cdA, spec.eye.x, spec.eye.y, spec.eye.z];
  for (const a of [spec.front, spec.rear]) nums.push(a.track, a.springHz, a.muScale, a.slipPeakDeg);
  return nums.every(Number.isFinite);
}

describe('ModCar catalogue', () => {
  it('has at least 60 parts, each complete for its category', () => {
    expect(PARTS.length).toBeGreaterThanOrEqual(60);
    const ids = new Set<string>();
    for (const p of PARTS) {
      expect(ids.has(p.id), `duplicate ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(CATEGORIES).toContain(p.cat);
      expect((p as unknown as Record<string, unknown>)[STATS_KEY[p.cat]], `${p.id} lacks its ${STATS_KEY[p.cat]} stats`).toBeTruthy();
      expect(p.mass).toBeGreaterThan(0);
      expect(p.name.zh.length && p.name.en.length).toBeTruthy();
      if (p.tire) expect(p.tire.grip).toHaveLength(7);
      if (p.rim) expect(p.rim.grip).toHaveLength(7);
      if (p.engine) {
        const c = p.engine.curve;
        for (let i = 1; i < c.length; i++) expect(c[i][0]).toBeGreaterThan(c[i - 1][0]);
        expect(c[c.length - 1][1]).toBe(0);
        expect(p.engine.redline).toBeLessThan(c[c.length - 1][0]);
      }
    }
    // every category has at least one part, and the fun ones are there
    for (const c of CATEGORIES) expect(partsOf(c).length, c).toBeGreaterThan(0);
    for (const id of ['seat_toilet', 'steer_ship', 'rim_cart', 'tire_tractor', 'tank_drum', 'bf_ram', 'roof_spikes', 'door_fridge', 'eng_mower', 'eng_v8']) expect(ids.has(id)).toBe(true);
  });

  it('every frame has hubs front and rear, a driver seat, and only known mounts', () => {
    for (const f of FRAMES) {
      const ids = new Set(f.mounts.map((m) => m.id));
      expect(ids.size).toBe(f.mounts.length);
      expect(f.mounts.some((m) => m.cat === 'rim' && m.axle === 'front')).toBe(true);
      expect(f.mounts.some((m) => m.cat === 'rim' && m.axle === 'rear')).toBe(true);
      expect(f.mounts.filter((m) => m.driver)).toHaveLength(1);
      for (const c of ['engine', 'gearbox', 'battery', 'fuelTank', 'exhaust', 'steering', 'ignition'] as Category[]) expect(f.mounts.some((m) => m.cat === c), `${f.id} ${c}`).toBe(true);
      if (f.kind !== 'moto') for (const c of ['door', 'hood', 'trunk', 'roof', 'armor', 'handbrake'] as Category[]) expect(f.mounts.some((m) => m.cat === c), `${f.id} ${c}`).toBe(true);
    }
  });
});

describe('ModCar factory builds', () => {
  const ranges: Record<string, { mass: [number, number]; cg: [number, number]; t100: [number, number]; vmax: [number, number] }> = {
    sedan: { mass: [950, 1250], cg: [0.42, 0.7], t100: [11, 21], vmax: [125, 160] },
    pickup: { mass: [1150, 1550], cg: [0.5, 0.85], t100: [13, 26], vmax: [115, 150] },
    moto: { mass: [170, 300], cg: [0.45, 0.8], t100: [5, 14], vmax: [100, 145] },
    rv: { mass: [3100, 4400], cg: [0.85, 1.5], t100: [16, 45], vmax: [95, 135] },
    // (an air-cooled flat four in a bus: slow, and it gets there)
    van: { mass: [1050, 1450], cg: [0.65, 1.0], t100: [18, 34], vmax: [100, 125] },
    // (a V6 on four driven wheels: heavy and tall, it gets going all the same)
    goat: { mass: [1650, 2100], cg: [0.6, 0.95], t100: [7, 15], vmax: [140, 185] },
    // (a straight six in a long estate: it cruises)
    wagon: { mass: [1250, 1650], cg: [0.42, 0.7], t100: [6, 12], vmax: [160, 200] },
    // (a light two-seater with a revving four: quick off the mark, quicker round a bend)
    fox: { mass: [900, 1250], cg: [0.33, 0.55], t100: [5, 10], vmax: [165, 205] },
  };
  for (const f of FRAMES) {
    it(`${f.id}: derives a sane spec and drives off`, () => {
      const b = stockBuild(f.id);
      expect(canDrive(b), JSON.stringify([...crankProblems(b), ...runProblems(b), ...driveProblems(b)].map((p) => p.code))).toBe(true);
      const d = derive(b);
      const s = d.spec as VehicleSpec;
      expect(finiteSpec(s)).toBe(true);
      const r = ranges[f.id];
      expect(s.mass).toBeGreaterThan(r.mass[0]);
      expect(s.mass).toBeLessThan(r.mass[1]);
      expect(s.cgHeight).toBeGreaterThan(r.cg[0]);
      expect(s.cgHeight).toBeLessThan(r.cg[1]);
      expect(s.weightFront).toBeGreaterThan(0.35);
      expect(s.weightFront).toBeLessThan(0.66);
      expect(Math.abs(s.wheelRadius - f.hubRadius)).toBeLessThan(0.03);
      const p = quickPerf(d);
      expect(p.t100, `${f.id} 0–100`).not.toBeNull();
      expect(p.t100!).toBeGreaterThan(r.t100[0]);
      expect(p.t100!).toBeLessThan(r.t100[1]);
      expect(p.vmax).toBeGreaterThan(r.vmax[0]);
      expect(p.vmax).toBeLessThan(r.vmax[1]);
      const sim = shake(b, 5);
      expect(sim.exploded).toBe(false);
      expect(sim.odometer).toBeGreaterThan(5);
    });
  }
});

describe('ModCar interchange', () => {
  it('every part goes on every mount of its category on every frame, and the result drives', () => {
    let combos = 0;
    for (const f of FRAMES) {
      for (const m of f.mounts) {
        for (const p of partsOf(m.cat)) {
          const b = stockBuild(f.id);
          const inst = newInstance(p.id, { fuelL: 20, fuelType: 'petrol' });
          if (p.rim?.tire) {
            const t = stockTireFor(f);
            if (t) fitSub(inst, 'tire', newInstance(t));
          }
          fitPart(b, m.id, inst);
          const d = derive(b);
          expect(finiteSpec(d.spec as VehicleSpec), `${f.id}/${m.id}/${p.id}`).toBe(true);
          const sim = shake(b, 2.5, combos);
          expect(sim.exploded, `${f.id}/${m.id}/${p.id} exploded`).toBe(false);
          expect(Number.isFinite(sim.px) && Math.abs(sim.speed) < 120, `${f.id}/${m.id}/${p.id} runaway`).toBe(true);
          combos++;
        }
      }
    }
    expect(combos).toBeGreaterThan(500);
  });

  it('random builds never blow the simulation up', () => {
    const r = rng(20261116);
    for (let k = 0; k < 160; k++) {
      const f = FRAMES[Math.floor(r() * FRAMES.length)];
      const b: Build = { uid: `fz${k}`, frame: f.id, paint: 0, paint2: 0, dirt: 0, rust: 0, cond: 1, parts: {} };
      for (const m of f.mounts) {
        if (r() < 0.15) continue;
        const cands = partsOf(m.cat);
        const p = cands[Math.floor(r() * cands.length)];
        const inst = newInstance(p.id, { fuelL: 30 * r(), fuelType: r() < 0.5 ? 'petrol' : 'diesel', charge: r() });
        if (p.rim?.tire && r() < 0.85) {
          const tyres = partsOf('tire');
          fitSub(inst, 'tire', newInstance(tyres[Math.floor(r() * tyres.length)].id));
        }
        fitPart(b, m.id, inst);
      }
      const d = derive(b);
      expect(finiteSpec(d.spec as VehicleSpec), encodeBuild(b)).toBe(true);
      const sim = shake(b, 3, k);
      expect(sim.exploded, encodeBuild(b)).toBe(false);
      expect(Math.abs(sim.speed) < 120, encodeBuild(b)).toBe(true);
    }
  });
});

describe('ModCar: parts change how it drives', () => {
  const perf = (text: string) => quickPerf(derive(decodeBuild(text)));
  const stock = perf('stock:sedan');

  it('a V8 makes the sedan at least 30% quicker; a lawnmower engine barely moves it', () => {
    const v8 = perf('stock:sedan;engine=eng_v8');
    expect(v8.t100!).toBeLessThan(stock.t100! * 0.7);
    expect(v8.vmax).toBeGreaterThan(stock.vmax);
    expect(v8.fuel).toBeGreaterThan(stock.fuel);
    const mower = perf('stock:sedan;engine=eng_mower');
    expect(mower.t100 === null || mower.t100 > 60).toBe(true);
    expect(mower.vmax).toBeLessThan(75);
  });

  it('slicks grip harder on asphalt, tractor tyres lift it and cost speed', () => {
    const slick = perf('stock:sedan;hub_FL=rim_steel13+tire:tire_slick;hub_FR=rim_steel13+tire:tire_slick;hub_RL=rim_steel13+tire:tire_slick;hub_RR=rim_steel13+tire:tire_slick');
    expect(slick.grip).toBeGreaterThan(stock.grip * 1.12);
    const tractorText = 'stock:sedan;hub_FL=rim_off16+tire:tire_tractor;hub_FR=rim_off16+tire:tire_tractor;hub_RL=rim_off16+tire:tire_tractor;hub_RR=rim_off16+tire:tire_tractor';
    const dT = derive(decodeBuild(tractorText));
    expect(dT.lift).toBeGreaterThan(0.15);
    const tractor = quickPerf(dT);
    expect(tractor.grip).toBeLessThan(stock.grip * 0.85);
    expect(tractor.mass).toBeGreaterThan(stock.mass + 100);
  });

  it('armour and a ram make it heavier, draggier and longer to stop', () => {
    const base = derive(decodeBuild('stock:sedan'));
    const apoc = derive(decodeBuild('stock:sedan;bumperFront=bf_ram;armor_L=arm_plates;armor_R=arm_plates;door_FL=door_armor;door_FR=door_armor;roof=roof_spikes'));
    expect(apoc.spec.brakes.maxG).toBeLessThan(base.spec.brakes.maxG * 0.92);
    expect(apoc.spec.aero.cdA).toBeGreaterThan(base.spec.aero.cdA + 0.1);
    expect(apoc.ram).toBeGreaterThan(0.8);
  });

  it('tyres too big for the arches cannot turn as far: a stock vehicle keeps its full lock', () => {
    for (const f of ['sedan', 'pickup', 'rv']) {
      const d = derive(decodeBuild(`stock:${f}`));
      expect(d.spec.steering.maxDeg).toBe(d.frame.steering.maxDeg);
    }
    const tractor = derive(decodeBuild('stock:sedan;hub_FL=rim_off16+tire:tire_tractor;hub_FR=rim_off16+tire:tire_tractor'));
    expect(tractor.spec.steering.maxDeg).toBeLessThan(tractor.frame.steering.maxDeg * 0.6);
  });

  it('a toilet for a seat puts the driver higher, as far as the roof lets them', () => {
    // under the motorhome's high roof the whole height of the throne shows
    const rv = derive(decodeBuild('stock:rv'));
    const rvLoo = derive(decodeBuild('stock:rv;seat_driver=seat_toilet'));
    expect(rvLoo.spec.eye.y).toBeGreaterThan(rv.spec.eye.y + 0.1);
    // in the low sedan the driver goes up until the head meets the lining, and sits hunched there
    const base = derive(decodeBuild('stock:sedan'));
    const loo = derive(decodeBuild('stock:sedan;seat_driver=seat_toilet'));
    expect(loo.spec.eye.y).toBeGreaterThan(base.spec.eye.y + 0.03);
    const roof = loo.frame.body.top - loo.cg.y;
    expect(loo.spec.eye.y).toBeLessThanOrEqual(roof - 0.18 + 1e-9);
  });

  it('a V8 on the motorcycle is a different animal', () => {
    const moto = perf('stock:moto');
    const v8 = derive(decodeBuild('stock:moto;engine=eng_v8;radiator=rad_std'));
    expect(v8.mass).toBeGreaterThan(400);
    expect(quickPerf(v8).t100 ?? 99).toBeLessThan(moto.t100!);
  });
});

describe('ModCar rules', () => {
  const codes = (b: Build) => [...crankProblems(b), ...runProblems(b), ...driveProblems(b), ...warnings(b)].map((p) => p.code);

  it('a factory sedan has nothing that blocks it', () => {
    const b = stockBuild('sedan');
    expect([...crankProblems(b), ...runProblems(b), ...driveProblems(b)]).toHaveLength(0);
  });

  it('missing and wrong parts say what is wrong', () => {
    const without = (mount: string) => {
      const b = stockBuild('sedan');
      removePart(b, mount);
      return codes(b);
    };
    expect(without('battery')).toContain('no_battery');
    expect(without('ignition')).toContain('no_ignition');
    expect(without('engine')).toContain('no_engine');
    expect(without('fuelTank')).toContain('no_tank');
    expect(without('gearbox')).toContain('no_gearbox');
    expect(without('seat_driver')).toContain('no_driver_seat');
    expect(without('steering')).toContain('no_steering');
    expect(without('radiator')).toContain('no_radiator');
    expect(without('hub_FL')).toContain('no_wheel');
    expect(without('handbrake')).toContain('no_handbrake');

    const flat = stockBuild('sedan');
    flat.parts.battery.fluids.charge = 0.02;
    expect(codes(flat)).toContain('battery_flat');

    const empty = stockBuild('sedan', { fuel: 0 });
    expect(codes(empty)).toContain('no_fuel');

    const diesel = stockBuild('sedan');
    diesel.parts.fuelTank.fluids.fuel = { diesel: 20 };
    expect(codes(diesel)).toContain('wrong_fuel');

    const dieselEngine = decodeBuild('stock:sedan;engine=eng_i4d');
    dieselEngine.parts.fuelTank.fluids.fuel = { petrol: 20 };
    expect(codes(dieselEngine)).toContain('wrong_fuel');

    const twoStroke = decodeBuild('stock:sedan;engine=eng_2t');
    expect(codes(twoStroke)).toContain('two_stroke_oil');

    // an air-cooled engine needs no radiator
    const flat6 = decodeBuild('stock:sedan;engine=eng_flat6;-radiator');
    expect(codes(flat6)).not.toContain('no_radiator');

    const bare = stockBuild('sedan');
    removeSub(bare.parts.hub_RR, 'tire');
    expect(codes(bare)).toContain('no_tire');

    const noDrive = stockBuild('sedan');
    removePart(noDrive, 'hub_RL');
    removePart(noDrive, 'hub_RR');
    expect(codes(noDrive)).toContain('no_driven_wheel');
  });
});

describe('ModCar build text', () => {
  it('round-trips and understands the stock shorthand', () => {
    const b = decodeBuild('stock:sedan;engine=eng_v8+turbo:turbo_small;seat_driver=seat_toilet;-hood');
    expect(b.parts.engine.part).toBe('eng_v8');
    expect(b.parts.engine.sub.turbo.part).toBe('turbo_small');
    expect(b.parts.seat_driver.part).toBe('seat_toilet');
    expect(b.parts.hood).toBeUndefined();
    const again = decodeBuild(encodeBuild(b));
    expect(encodeBuild(again)).toBe(encodeBuild(b));
    expect([...allInstances(b)].length).toBeGreaterThan(30);
    expect(frameDef('sedan').mounts.length).toBeGreaterThan(30);
    expect(partDef('eng_v8').engine!.cylinders).toBe(8);
  });
});
