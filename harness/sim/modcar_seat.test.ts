/**
 * ModCar's first-person feel (docs/MODCAR.md §23): the seat's shake on top of the head's sway (seatShake.ts) and
 * the dust the wheels throw up (wheelDust.ts). Still and switched off, nothing moves; the road buzzes more on
 * gravel than on asphalt and more the faster one goes; a knock is a jolt that rings out within a second; a single
 * at idle shakes the cab far more than an eight, and less as it revs; the settings' zero takes it all away. Dust
 * comes off gravel, dirt, sand, grass and snow, never off asphalt or ice, none once the ground is wet, more the
 * faster a wheel rolls and much more where it spins; the puffs die away and never overflow their pool.
 */
import { describe, expect, it } from 'vitest';
import { Surface } from '../../src/core/world/ground';
import { SeatShake, type ShakeEngine, type ShakeSim } from '../../src/game/modcar/seatShake';
import { DUST_MAX, dustRate, WheelDust, type DustWheel } from '../../src/game/modcar/wheelDust';

/** a vehicle the shake reads: its speed, what its four wheels are on, its road feel (all of it to be changed by the test) */
interface FakeSim {
  speed: number;
  wheels: { contact: boolean; surface: number }[];
  feel: { suspRms: number; buzz: number; thumps: number; lastThump: number; bottomOuts: number; lastBottomOut: number; landings: number; lastLanding: number; bodyHits: number; lastBodyHit: number };
  hits: number;
  lastHitSpeed: number;
}

function fakeSim(speed: number, surface: number): FakeSim {
  return {
    speed,
    wheels: [0, 1, 2, 3].map(() => ({ contact: true, surface })),
    feel: { suspRms: 0, buzz: 0, thumps: 0, lastThump: 0, bottomOuts: 0, lastBottomOut: 0, landings: 0, lastLanding: 0, bodyHits: 0, lastBodyHit: 0 },
    hits: 0,
    lastHitSpeed: 0,
  };
}

const DT = 1 / 60;

/** the eye's vertical movement over some seconds: its RMS and its largest */
function run(sh: SeatShake, sim: ShakeSim, engine: ShakeEngine | null, seconds: number): { rms: number; peak: number } {
  let sq = 0;
  let peak = 0;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sh.update(DT, sim, engine);
    sq += sh.y * sh.y;
    peak = Math.max(peak, Math.abs(sh.y));
  }
  return { rms: Math.sqrt(sq / n), peak };
}

const idle = (cylinders: number, rpm = 800): ShakeEngine => ({ running: true, rpm, idle: 800, cylinders, misfire: 0 });

describe('modcar · the seat shakes', () => {
  it('still, with the engine off, nothing moves', () => {
    const sh = new SeatShake();
    const sim = fakeSim(0, Surface.Asphalt);
    run(sh, sim, { running: false, rpm: 0, idle: 800, cylinders: 4, misfire: 0 }, 3);
    for (const k of ['x', 'y', 'z', 'pitch', 'roll', 'yaw'] as const) expect(Math.abs(sh[k]), k).toBeLessThan(1e-12);
  });

  it('the road buzzes: a fine shiver on asphalt at a hundred, much more on gravel, more the faster', () => {
    const asphalt = run(new SeatShake(), fakeSim(27.8, Surface.Asphalt), null, 6);
    expect(asphalt.rms).toBeGreaterThan(0.0001);
    expect(asphalt.rms).toBeLessThan(0.0015);
    const gravelSlow = run(new SeatShake(), fakeSim(8, Surface.Gravel), null, 6);
    const gravel = run(new SeatShake(), fakeSim(16.7, Surface.Gravel), null, 6);
    const asphaltSame = run(new SeatShake(), fakeSim(16.7, Surface.Asphalt), null, 6);
    expect(gravel.rms / asphaltSame.rms).toBeGreaterThan(2.5);
    expect(gravel.rms).toBeGreaterThan(gravelSlow.rms * 1.3);
    // (and never a jolt's size: a buzz stays within a few millimetres)
    expect(gravel.peak).toBeLessThan(0.008);
  });

  it('a sport strut passes more of the road on than a soft one', () => {
    const hard = new SeatShake();
    hard.stiffness = 1.7;
    const soft = new SeatShake();
    soft.stiffness = 0.7;
    expect(run(hard, fakeSim(16.7, Surface.Gravel), null, 4).rms).toBeGreaterThan(run(soft, fakeSim(16.7, Surface.Gravel), null, 4).rms * 1.3);
  });

  it('a knock is a jolt that rings out within a second', () => {
    const sh = new SeatShake();
    const sim = fakeSim(0, Surface.Asphalt);
    run(sh, sim, null, 0.5);
    sim.feel.thumps++;
    sim.feel.lastThump = 6;
    const first = run(sh, sim, null, 0.25);
    expect(first.peak).toBeGreaterThan(0.008);
    run(sh, sim, null, 0.6);
    const after = run(sh, sim, null, 0.2);
    expect(after.peak).toBeLessThan(first.peak * 0.1);
    // a crash into something hard: a bigger one
    sim.hits++;
    sim.lastHitSpeed = 10;
    expect(run(sh, sim, null, 0.25).peak).toBeGreaterThan(first.peak);
  });

  it('a thumper at idle shakes the cab far more than an eight, and less as it revs', () => {
    const single = run(new SeatShake(), fakeSim(0, Surface.Asphalt), idle(1), 4);
    const eight = run(new SeatShake(), fakeSim(0, Surface.Asphalt), idle(8), 4);
    expect(single.rms).toBeGreaterThan(eight.rms * 5);
    const revved = run(new SeatShake(), fakeSim(0, Surface.Asphalt), idle(1, 6000), 4);
    expect(revved.rms).toBeLessThan(single.rms * 0.8);
  });

  it('the engine catching shudders the cab, and stalling jerks it', () => {
    const sh = new SeatShake();
    const sim = fakeSim(0, Surface.Asphalt);
    const off: ShakeEngine = { running: false, rpm: 0, idle: 800, cylinders: 6, misfire: 0 };
    run(sh, sim, off, 1);
    expect(run(sh, sim, idle(6), 0.3).peak).toBeGreaterThan(0.002);
    run(sh, sim, idle(6), 1);
    expect(run(sh, sim, off, 0.3).peak).toBeGreaterThan(0.003);
  });

  it('turned down to nothing, nothing moves however hard the knock', () => {
    const sh = new SeatShake();
    sh.scale = 0;
    const sim = fakeSim(20, Surface.Gravel);
    sim.feel.thumps = 5;
    run(sh, sim, idle(1), 0.1);
    sim.feel.thumps++;
    sim.feel.lastThump = 9;
    run(sh, sim, idle(1), 0.5);
    for (const k of ['x', 'y', 'z', 'pitch', 'roll', 'yaw'] as const) expect(Math.abs(sh[k]), k).toBe(0);
  });
});

/** four wheels rolling on a surface at a speed (world +x), sliding at `slip` */
function wheels(surface: number, speed: number, slip = 0): DustWheel[] {
  return [-0.7, 0.7].flatMap((z) =>
    [1.3, -1.3].map((x) => ({ contact: true, surface, cx: x, cy: 0, cz: z, fx: 1, fz: 0, sx: 0, sz: 1, vLong: speed, vLat: 0, omega: (speed + slip) / 0.3, radius: 0.3 })),
  );
}

describe('modcar · the wheels throw up dust', () => {
  it('off the loose surfaces only, and none once the ground is wet', () => {
    for (const s of [Surface.Asphalt, Surface.Ice]) expect(dustRate(s, 20, 3, 0)).toBe(0);
    for (const s of [Surface.Gravel, Surface.Dirt, Surface.Sand, Surface.Grass, Surface.Snow]) expect(dustRate(s, 15, 0, 0), String(s)).toBeGreaterThan(0);
    expect(dustRate(Surface.Gravel, 15, 0, 1)).toBe(0);
    expect(dustRate(Surface.Dirt, 15, 0, 0.2)).toBeLessThan(dustRate(Surface.Dirt, 15, 0, 0));
    // (sand dries soonest: a little damp still blows)
    expect(dustRate(Surface.Sand, 15, 0, 0.5)).toBeGreaterThan(0);
  });

  it('more the faster a wheel rolls, much more where it spins; none at a crawl', () => {
    expect(dustRate(Surface.Dirt, 1, 0, 0)).toBe(0);
    expect(dustRate(Surface.Dirt, 15, 0, 0)).toBeGreaterThan(dustRate(Surface.Dirt, 5, 0, 0) * 2);
    expect(dustRate(Surface.Dirt, 3, 8, 0)).toBeGreaterThan(dustRate(Surface.Dirt, 3, 0, 0) * 3);
    expect(dustRate(Surface.Gravel, 25, 0, 0)).toBeGreaterThan(dustRate(Surface.Grass, 25, 0, 0) * 2);
  });

  it('a car on a gravel road leaves a cloud that dies away; on asphalt none; the pool never overflows', () => {
    const d = new WheelDust({ x: 0, y: 0, z: 0 });
    const car = {};
    for (let i = 0; i < 120; i++) {
      d.kick(DT, car, wheels(Surface.Asphalt, 20), 0);
      d.update(DT, { x: 2, z: 0 });
    }
    expect(d.live).toBe(0);
    for (let i = 0; i < 120; i++) {
      d.kick(DT, car, wheels(Surface.Gravel, 20), 0);
      d.update(DT, { x: 2, z: 0 });
    }
    expect(d.live).toBeGreaterThan(40);
    // spinning hard on sand for a long time: as many as the pool holds, never more
    for (let i = 0; i < 600; i++) {
      d.kick(DT, car, wheels(Surface.Sand, 25, 10), 0);
      d.update(DT, { x: 2, z: 0 });
      expect(d.live).toBeLessThanOrEqual(DUST_MAX);
    }
    for (let i = 0; i < 300; i++) d.update(DT, { x: 2, z: 0 });
    expect(d.live).toBe(0);
    expect(d.mesh.geometry instanceof Object).toBe(true);
  });
});
