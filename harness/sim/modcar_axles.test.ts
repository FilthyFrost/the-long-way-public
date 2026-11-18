/**
 * The axles' parts (docs/MODCAR.md §22): each axle's suspension and brakes, the driven axle's differential. A factory
 * build weighs, balances and turns as it did before they were parts; a build saved before them is given its frame's;
 * what each one does, and what is missing without it.
 */
import { describe, expect, it } from 'vitest';
import { AXLE_CATS, fitAxles, fitPart, newInstance, removePart, stockBuild } from '../../src/core/modcar/build';
import { derive, FUEL_KG_PER_L, massProps } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { midHeight } from '../../src/core/modcar/geo';
import { partDef } from '../../src/core/modcar/parts';
import { allProblems, canDrive } from '../../src/core/modcar/rules';
import type { Build } from '../../src/core/modcar/types';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { usesExtensions } from '../../src/core/vehicle/spec';
import { derivedMods } from './modcar/derived_feel';
import { splitLaunch, stepSteer } from './modcar/part_matrix';

const FRAMES = ['sedan', 'pickup', 'rv', 'moto', 'van', 'goat', 'wagon'];

/** the mass, centre and inertia a build had when the frame's own figures held its axles (before §22) */
function asBefore(b: Build): { mass: number; cg: { x: number; y: number; z: number }; inertia: { roll: number; yaw: number; pitch: number } } {
  const f = frameDef(b.frame);
  const pts: { m: number; x: number; y: number; z: number }[] = [{ m: f.mass, ...f.cg }];
  const CG_UP: Record<string, number> = { engine: 0.3, gearbox: 0.12, radiator: 0.25, battery: 0.1, fuelTank: 0.12, seat: 0.28, door: 0, roof: 0.08 };
  for (const m of f.mounts) {
    const inst = b.parts[m.id];
    if (!inst || AXLE_CATS.has(m.cat)) continue;
    const p = partDef(inst.part);
    const fuel = Object.entries(inst.fluids.fuel ?? {}).reduce((a, [k, l]) => a + (l ?? 0) * (FUEL_KG_PER_L[k] ?? 0.75), 0);
    let kg = p.mass + fuel + (inst.fluids.oilL ?? 0) * 0.9 + (inst.fluids.coolantL ?? 0);
    for (const s of Object.values(inst.sub)) kg += partDef(s.part).mass;
    pts.push({ m: kg, x: m.pos.x, y: m.pos.y + (midHeight(p.id) ?? CG_UP[p.cat] ?? 0), z: m.pos.z });
  }
  const seat = f.mounts.find((m) => m.driver) ?? f.mounts.find((m) => m.cat === 'seat');
  if (seat) pts.push({ m: 75, x: seat.pos.x, y: seat.pos.y + 0.38, z: seat.pos.z });
  const M = pts.reduce((a, p) => a + p.m, 0);
  const cg = { x: pts.reduce((a, p) => a + p.m * p.x, 0) / M, y: pts.reduce((a, p) => a + p.m * p.y, 0) / M, z: pts.reduce((a, p) => a + p.m * p.z, 0) / M };
  const I = { ...f.inertia };
  for (const p of pts) {
    const dx = p.x - cg.x;
    const dy = p.y - cg.y;
    const dz = p.z - cg.z;
    I.roll += p.m * (dy * dy + dz * dz);
    I.yaw += p.m * (dx * dx + dz * dz);
    I.pitch += p.m * (dx * dx + dy * dy);
  }
  return { mass: M, cg, inertia: I };
}

const with_ = (frame: string, mount: string, part: string | null): Build => {
  const b = stockBuild(frame, { fuel: 0.5 });
  if (part) fitPart(b, mount, newInstance(part));
  else removePart(b, mount);
  return b;
};

describe('ModCar axles: suspension, brakes, differential', () => {
  it('every car has a suspension and brakes on each axle and a differential on the driven one; a motorcycle its brakes', () => {
    for (const id of ['sedan', 'pickup', 'rv']) {
      const ids = frameDef(id).mounts.filter((m) => AXLE_CATS.has(m.cat)).map((m) => m.id).sort();
      expect(ids, id).toEqual(['brakes_F', 'brakes_R', 'diff_R', 'susp_F', 'susp_R']);
    }
    expect(frameDef('moto').mounts.filter((m) => AXLE_CATS.has(m.cat)).map((m) => m.id).sort()).toEqual(['brakes_F', 'brakes_R']);
    // (the factory's on every one of them)
    for (const id of FRAMES) {
      const b = stockBuild(id);
      for (const m of frameDef(id).mounts) if (AXLE_CATS.has(m.cat)) expect(b.parts[m.id], `${id}.${m.id}`).toBeTruthy();
    }
  });

  it('a factory build weighs, balances and turns as it did before the axles were parts', () => {
    for (const id of FRAMES) {
      const b = stockBuild(id, { fuel: 0.5 });
      const now = massProps(b);
      const was = asBefore(b);
      expect(now.mass, id).toBeCloseTo(was.mass, 6);
      expect(now.cg.x, id).toBeCloseTo(was.cg.x, 6);
      expect(now.cg.y, id).toBeCloseTo(was.cg.y, 6);
      expect(now.cg.z, id).toBeCloseTo(was.cg.z, 6);
      expect(now.inertia.roll, id).toBeCloseTo(was.inertia.roll, 4);
      expect(now.inertia.yaw, id).toBeCloseTo(was.inertia.yaw, 4);
      expect(now.inertia.pitch, id).toBeCloseTo(was.inertia.pitch, 4);
    }
  });

  it("the factory's parts leave the frame's own springs and brakes as they were", () => {
    for (const id of ['sedan', 'pickup', 'rv']) {
      const f = frameDef(id);
      const d = derive(stockBuild(id, { fuel: 0.5 }));
      const s = d.spec as VehicleSpec;
      expect(s.front.brakeShare).toBe(f.brakeFront);
      expect(s.rear.brakeShare).toBe(1 - f.brakeFront);
      expect(s.brakes.maxG).toBeCloseTo(Math.min(1.1, Math.max(0.2, f.brakeN / (d.mass * 9.81))), 6);
      expect(s.rear.diff?.kind).toBe('open');
      expect(usesExtensions(s)).toBe(true);
    }
  });

  it('a build saved before them is given its frame’s, as worn as it is; one with any of them is left alone', () => {
    const b = stockBuild('pickup');
    b.cond = 0.4;
    b.rust = 0.6;
    for (const m of frameDef('pickup').mounts) if (AXLE_CATS.has(m.cat)) removePart(b, m.id);
    expect(fitAxles(b)).toBe(true);
    expect(b.parts.susp_F?.part).toBe('susp_stock');
    expect(b.parts.brakes_R?.part).toBe('brakes_disc');
    expect(b.parts.diff_R?.part).toBe('diff_open');
    expect(b.parts.susp_R.cond).toBe(0.4);
    expect(b.parts.diff_R.rust).toBe(0.6);
    removePart(b, 'brakes_F');
    expect(fitAxles(b)).toBe(false);
    expect(b.parts.brakes_F).toBeUndefined();
  });

  it('without a differential the driven axle is not driven, and it will not drive', () => {
    const b = with_('sedan', 'diff_R', null);
    expect((derive(b).spec as VehicleSpec).rear.driven).toBe(false);
    expect(canDrive(b)).toBe(false);
    expect(allProblems(b).some((p) => p.code === 'no_diff' && p.severity === 'block')).toBe(true);
  });

  it('without brakes it stops on the other axle only, or not at all', () => {
    const stock = derive(stockBuild('sedan', { fuel: 0.5 })).spec as VehicleSpec;
    const noFront = derive(with_('sedan', 'brakes_F', null)).spec as VehicleSpec;
    expect(noFront.front.brakeShare).toBe(0);
    expect(noFront.brakes.maxG).toBeLessThan(stock.brakes.maxG * 0.5);
    const none = stockBuild('sedan', { fuel: 0.5 });
    removePart(none, 'brakes_F');
    removePart(none, 'brakes_R');
    expect((derive(none).spec as VehicleSpec).brakes.maxG).toBe(0);
    expect(allProblems(none).filter((p) => p.code === 'no_brakes')).toHaveLength(1);
  });

  it('without its suspension an axle sits on its bump stops: lower, and far stiffer', () => {
    const stock = derive(stockBuild('sedan', { fuel: 0.5 }));
    const bare = derive(with_('sedan', 'susp_R', null));
    const a = stock.spec as VehicleSpec;
    const b = bare.spec as VehicleSpec;
    expect(b.rear.springHz).toBeGreaterThan(a.rear.springHz * 1.8);
    expect(b.rear.travel).toBeLessThan(a.rear.travel * 0.4);
    expect(b.cgHeight + b.body.bottom).toBeLessThan(a.cgHeight + a.body.bottom - 0.03);
    expect(allProblems(with_('sedan', 'susp_R', null)).some((p) => p.code === 'no_suspension')).toBe(true);
  });

  it('a lift kit raises the body by what it says, sport springs lower it', () => {
    const clear = (b: Build): number => {
      const s = derive(b).spec as VehicleSpec;
      return s.cgHeight + s.body.bottom;
    };
    const base = clear(stockBuild('pickup', { fuel: 0.5 }));
    const lift = stockBuild('pickup', { fuel: 0.5 });
    fitPart(lift, 'susp_F', newInstance('susp_lift'));
    fitPart(lift, 'susp_R', newInstance('susp_lift'));
    expect(clear(lift) - base).toBeCloseTo(0.1, 2);
    const low = stockBuild('pickup', { fuel: 0.5 });
    fitPart(low, 'susp_F', newInstance('susp_sport'));
    fitPart(low, 'susp_R', newInstance('susp_sport'));
    expect(clear(low) - base).toBeCloseTo(-0.045, 2);
  });

  it('with a wheel on ice an open differential barely moves off; a limited-slip one does, a locked one best', { timeout: 60_000 }, () => {
    const t = (diff: string): number => {
      const d = derive(with_('sedan', 'diff_R', diff));
      const s = splitLaunch(d.spec as VehicleSpec, { mods: derivedMods(d) });
      return Number.isFinite(s) ? s : 99;
    };
    const open = t('diff_open');
    const lsd = t('diff_lsd');
    const locked = t('diff_locked');
    expect(open).toBeGreaterThan(12);
    expect(lsd).toBeLessThan(open * 0.5);
    expect(locked).toBeLessThan(lsd);
  });

  it('a locked axle scrubs round a corner: the car turns less for the same wheel', { timeout: 60_000 }, () => {
    const yaw = (diff: string): number => {
      const d = derive(with_('sedan', 'diff_R', diff));
      return stepSteer(d.spec as VehicleSpec, { mods: derivedMods(d) }).yaw;
    };
    expect(yaw('diff_locked')).toBeLessThan(yaw('diff_open') * 0.97);
  });
});
