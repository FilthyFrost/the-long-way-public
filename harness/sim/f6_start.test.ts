/**
 * F6 (docs/V3/plan/finish.md §二 2): a rougher start. In a world of version 7 the workshop keeps what the car needs to
 * start and to drive and one headlamp; the sixteen parts that make it "a car" are down the first twelve kilometres of
 * the road, the driver's door first — and each of them is of use once it is on: a boot without its lid holds nothing,
 * an engine without its bonnet takes twice the blow.
 */
import { describe, expect, it } from 'vitest';
import { decodeBuild, missingMounts, removePart, stockBuild } from '../../src/core/modcar/build';
import { CARGO_ZONES, LIDLESS_WHY, zoneLidless, zonesFor } from '../../src/core/modcar/cargo';
import { frameDef } from '../../src/core/modcar/frames';
import { partDef } from '../../src/core/modcar/parts';
import { DOOR_BY_KM, fitToPlaces, placesPlan, SCHEDULE, SCHEDULE_V7, SitePlanner, startExtras } from '../../src/core/modcar/schedule';
import { bareShell, KEPT_LAMP, KIT_STEPS, kitStepsOf, roadParts, ROAD_MOUNTS, startParts } from '../../src/core/modcar/startKit';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import type { Build } from '../../src/core/modcar/types';
import { VehicleSim } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { carLines } from '../../src/game/modcar/carPage';
import { planPlaces } from '../../src/game/modcar/places';
import { modcarWorld } from '../../src/game/modcar/seamless';
import '../../src/core/v3/nd/cards';
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

describe('F6: a rougher start', () => {
  it('the workshop of a world of version 7 has what starts the car and drives it, and one headlamp', () => {
    expect(ROAD_MOUNTS.length).toBe(16);
    expect([...ROAD_MOUNTS].sort()).toEqual(['bumperFront', 'bumperRear', 'door_FL', 'door_FR', 'door_RL', 'door_RR', 'headlight_R', 'hood', 'horn', 'mirror_L', 'mirror_R', 'seat_pass', 'seat_rear', 'taillight_L', 'taillight_R', 'trunk'].sort());
    const all = startParts();
    const rough = startParts(true);
    expect(all.length - rough.length).toBe(16);
    expect(rough.some((p) => ROAD_MOUNTS.includes(p.mount))).toBe(false);
    expect(rough.map((p) => p.mount)).toContain(KEPT_LAMP);
    // (what is there is as it always was: the same parts, as worn)
    for (const p of rough) expect(p.inst.cond).toBe(all.find((x) => x.mount === p.mount)!.inst.cond);
  });

  it('its board: to start and to drive — the one headlamp among those to drive — and no more', () => {
    const steps = kitStepsOf(true);
    expect(steps.some((s) => s.group === 'car')).toBe(false);
    expect(steps.filter((s) => s.group === 'drive').map((s) => s.id)).toEqual(['wheels', 'steering', 'driverSeat', 'gearLever', 'handbrake', 'lamp']);
    expect(steps.find((s) => s.id === 'lamp')!.mounts).toEqual([KEPT_LAMP]);
    // every part the board asks for is in the workshop, and every part in the workshop is asked for
    expect(steps.flatMap((s) => s.mounts ?? []).sort()).toEqual(startParts(true).map((p) => p.mount).sort());
    // (a world made before: the board as it was)
    expect(kitStepsOf(false)).toBe(KIT_STEPS);
  });

  it('the sixteen down the road: the works\' own parts, a panel shaped for the car', () => {
    const parts = roadParts();
    expect(parts.map((p) => p.mount).sort()).toEqual([...ROAD_MOUNTS].sort());
    const f = frameDef('sedan');
    for (const p of parts) {
      const m = f.mounts.find((x) => x.id === p.mount)!;
      expect(partDef(p.part).cat, p.mount).toBe(m.cat);
      expect(p.shapeOf, p.mount).toBe(m.cat === 'door' || m.cat === 'hood' || m.cat === 'trunk' ? 'sedan' : undefined);
    }
  });

  it('the plan: the driver\'s door first, between the first kilometre and the third; the rest one after another to the tenth and a half', () => {
    for (const seed of [7, 1000, 8919]) {
      const x = startExtras(seed);
      expect(x.length).toBe(16);
      expect(startExtras(seed)).toEqual(x);
      const door = x.find((f) => f.entry === 'start:door_FL')!;
      expect(door.s).toBeGreaterThanOrEqual(1000);
      expect(door.s).toBeLessThanOrEqual(2500);
      expect(door.themes).toEqual(['garage', 'works', 'station']);
      expect(door.within).toEqual([0, DOOR_BY_KM * 1000]);
      for (const f of x) {
        expect(f.novelty).toBe(false);
        if (f === door) continue;
        expect(f.within).toEqual([0, 12_000]);
        expect(f.s, f.entry).toBeGreaterThanOrEqual(1500);
        expect(f.s, f.entry).toBeLessThanOrEqual(10_500);
        expect(f.themes).toContain('roadside');
      }
      // (spread: never three of them due within half a kilometre)
      const due = x.filter((f) => f !== door).map((f) => f.s).sort((a, b) => a - b);
      for (let i = 2; i < due.length; i++) expect(due[i] - due[i - 2]).toBeGreaterThan(500);
    }
    // another world: another order
    expect(startExtras(7).map((f) => f.entry)).not.toEqual(startExtras(8919).map((f) => f.entry));
    // in version 7's plan, not in the one before it
    expect(placesPlan(7, 40, 'normal', SCHEDULE_V7).filter((f) => f.entry.startsWith('start:')).length).toBe(16);
    expect(placesPlan(7, 40, 'normal', SCHEDULE).some((f) => f.entry.startsWith('start:'))).toBe(false);
  });

  it('over real worlds: every one of them at a place within the first twelve kilometres, the driver\'s door early', () => {
    const seeds = [7, ...Array.from({ length: Number(process.env.ROBOT_SEEDS ?? 6) }, (_, k) => 1000 + k * 7919)];
    const doorAt: number[] = [];
    const lastAt: number[] = [];
    const placesWith: number[] = [];
    for (const seed of seeds) {
      const world = modcarWorld(seed, { worldVersion: 7 }).world;
      const places = planPlaces(world, 0, 150_000);
      const finds = fitToPlaces(placesPlan(seed, 160, 'normal', SCHEDULE_V7), places);
      const planner = new SitePlanner(finds);
      planner.take(places);
      const at = finds.filter((f) => f.entry.startsWith('start:')).map((f) => ({ f, s: planner.laidAt(f) }));
      expect(at.length).toBe(16);
      for (const x of at) {
        expect(x.s, `seed ${seed}: ${x.f.entry}`).toBeDefined();
        expect(x.s!, `seed ${seed}: ${x.f.entry}`).toBeLessThanOrEqual(12_000);
      }
      doorAt.push(at.find((x) => x.f.entry === 'start:door_FL')!.s! / 1000);
      lastAt.push(Math.max(...at.map((x) => x.s!)) / 1000);
      placesWith.push(new Set(at.map((x) => x.s)).size);
    }
    const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.info(`the car's sixteen over ${seeds.length} worlds: the driver's door at ${med(doorAt).toFixed(1)} km (latest ${Math.max(...doorAt).toFixed(1)}), the last of them at ${med(lastAt).toFixed(1)} km (latest ${Math.max(...lastAt).toFixed(1)}), at ${med(placesWith)} places (fewest ${Math.min(...placesWith)})`);
    // (a workshop or a filling station where the first three kilometres have one; else the last place with a box in them)
    expect(Math.max(...doorAt)).toBeLessThanOrEqual(DOOR_BY_KM);
    expect(Math.min(...placesWith)).toBeGreaterThanOrEqual(4);
  }, 600_000);
});

describe('F6: each part of the car is of use', () => {
  const sedan = (without: string[] = []): Build => stockBuild('sedan', { without });

  it('a boot without its lid holds nothing; with it on, as ever', () => {
    const zones = CARGO_ZONES.sedan;
    const boot = zones.find((z) => z.id === 'trunk')!;
    expect(zoneLidless('sedan', boot, sedan())).toBe(false);
    expect(zoneLidless('sedan', boot, sedan(['trunk']))).toBe(true);
    expect(zoneLidless('sedan', boot, bareShell())).toBe(true);
    // (the other places of the car are as they were: the seats, the shelf)
    for (const z of zones) if (z.id !== 'trunk') expect(zoneLidless('sedan', z, bareShell()), z.id).toBe(false);
    // (the zone is still the car's: what lay in it rides on)
    expect(zonesFor('sedan', bareShell()).some((z) => z.id === 'trunk')).toBe(true);
    // a pickup's bed has no lid to lack; a wagon's load space has
    for (const z of CARGO_ZONES.pickup) expect(zoneLidless('pickup', z, stockBuild('pickup', { without: ['trunk'] }))).toBe(false);
    expect(zoneLidless('wagon', CARGO_ZONES.wagon.find((z) => z.id === 'trunk')!, stockBuild('wagon', { without: ['trunk'] }))).toBe(true);
    expect(LIDLESS_WHY).toContain('没有盖');
  });

  it('an engine without its bonnet takes twice the blow from the front, the radiator half as much again', () => {
    const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };
    const knock = (b: Build, front = true): { engine: number; radiator: number } => {
      const sys = new ModSystems(b);
      const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
      sim.reset(0, 0, 0, 0);
      sys.bind(sim);
      sim.hits++;
      sim.lastHitSpeed = 12;
      sim.lastHitFront = front;
      sys.update(1 / 30, ENV);
      return { engine: 1 - b.parts.engine.cond, radiator: 1 - b.parts.radiator.cond };
    };
    const whole = knock(decodeBuild('stock:sedan'));
    const bare = (): Build => {
      const b = decodeBuild('stock:sedan');
      removePart(b, 'hood');
      return b;
    };
    const open = knock(bare());
    expect(whole.engine).toBeGreaterThan(0);
    expect(open.engine).toBeCloseTo(whole.engine * 2, 6);
    expect(open.radiator).toBeCloseTo(whole.radiator * 1.5, 6);
    // (a blow from behind is none of the bonnet's)
    expect(knock(bare(), false)).toEqual(knock(decodeBuild('stock:sedan'), false));
  });

  it('what a vehicle lacks, for the page of the Tab screen', () => {
    expect(missingMounts(sedan())).toEqual([]);
    expect(carLines(sedan())).toEqual({ missing: 0, away: 0, rows: [], extras: [] });
    const b = sedan(['door_FL', 'door_RR', 'hood', 'headlight_R']);
    expect(missingMounts(b).map((m) => m.id)).toEqual(expect.arrayContaining(['door_FL', 'door_RR', 'hood', 'headlight_R']));
    const lines = carLines(b);
    expect(lines.missing).toBe(4);
    expect(lines.away).toBe(4);
    expect(lines.rows).toEqual(expect.arrayContaining([{ label: '车门', text: '左前车门、右后车门', near: false }, { label: '引擎盖', text: '没装', near: false }, { label: '大灯', text: '右大灯', near: false }]));
    // (a door lying by the car: its sort is near — two of the four are nowhere near)
    const by = carLines(b, new Set(['door' as const]));
    expect(by.away).toBe(2);
    expect(by.rows.find((r) => r.label === '车门')!.near).toBe(true);
    // (a radio is not the car's to lack: it could have one)
    const noRadio = sedan(['radio', 'hood']);
    expect(carLines(noRadio)).toMatchObject({ missing: 1, extras: ['收音机'] });
    // the start of a world of version 7, its workshop's parts all on: the sixteen of the road, and the radio (found, never the workshop's)
    const start = bareShell();
    for (const p of startParts(true)) start.parts[p.mount] = p.inst;
    expect(missingMounts(start).map((m) => m.id).sort()).toEqual([...ROAD_MOUNTS, 'radio'].sort());
  });
});
