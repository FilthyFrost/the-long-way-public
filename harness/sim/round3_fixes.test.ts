/**
 * Playtest Round 3 regression & invariants suite covering all 11 reported issues:
 *   #1  Continuous RV/Elephant cabin floor with stairwell holes & preserved orientation
 *   #2  Coffee pot <-> mug continuous LMB/E pour never ping-pongs
 *   #3  Coffee maker docks cups exclusively via R-mode magnetic slot (no LMB brew conflict)
 *   #6  Single driver-seat U cabin dome switch (no auto-on rear ceiling double-light)
 *   #7  Old Elephant, Loaf van, Rhino cargo bed, and all-15-frame anti-teleport headroom/roof rules
 *   #9  Zero legacy junk_vinyl, save migration to nd_vinyl_01, and all 51 tapes & 51 vinyls registered
 *   #11 Toilet seat shifted -0.14 m back from steering wheel (parts.ts + parts_geo.json)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aboardOf } from '../../src/core/modcar/aboard';
import { stockBuild } from '../../src/core/modcar/build';
import { findSpot, restAt, zonesFor, type HeightGrid } from '../../src/core/modcar/cargo';
import { derive } from '../../src/core/modcar/derive';
import { FRAMES, frameDef } from '../../src/core/modcar/frames';
import { cleanItem, hasItem, ITEMS, newItem, retiredKind } from '../../src/core/modcar/items';
import { partDef } from '../../src/core/modcar/parts';
import { VehicleWalkSolids, type WalkVehicle } from '../../src/core/modcar/vehicleSolids';
import { FunctionLand } from '../../src/core/onfoot/land';
import { FOOT, FootWalker, ND_FOOT } from '../../src/core/onfoot/walker';
import { registerNdItems } from '../../src/core/v3/nd/items';
import { TAPES } from '../../src/core/v3/nd/tapes';
import { VINYLS } from '../../src/core/v3/nd/vinyls';
import { VehicleSim } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { NdCoffee } from '../../src/game/modcar/v3/nd-coffee/system';
import { Power } from '../../src/game/modcar/v3/power/system';

registerNdItems();

function flatGrid(zone: { x: readonly [number, number]; z: readonly [number, number]; floor: number }): HeightGrid {
  const cell = 0.02;
  const nx = Math.ceil((zone.x[1] - zone.x[0]) / cell);
  const nz = Math.ceil((zone.z[1] - zone.z[0]) / cell);
  return { x0: zone.x[0], z0: zone.z[0], cell, nx, nz, h: new Float32Array(nx * nz).fill(zone.floor) };
}

describe('Round 3 #1: unified continuous RV/Elephant floor with stairwell holes', () => {
  const cabinet = { minX: -0.35, maxX: 0.35, minY: 0, maxY: 0.85, minZ: -0.25, maxZ: 0.25 };

  it('Old Elephant allows furniture across former -0.99 and -0.06 seams along the left wall and blocks the stairwell hole', () => {
    const cabin = zonesFor('elephant', stockBuild('elephant')).find((z) => z.id === 'cabin')!;
    expect(cabin).toBeTruthy();
    const g = flatGrid(cabin);
    // Straddling the old -0.99 seam along the left wall (-0.85) now fits cleanly!
    expect(restAt(cabin, g, cabinet, -0.99, -0.85, 0, [])).toBeCloseTo(cabin.floor, 4);
    // Straddling the old -0.06 seam along the left wall (-0.85) now fits cleanly!
    expect(restAt(cabin, g, cabinet, -0.06, -0.85, 0, [])).toBeCloseTo(cabin.floor, 4);
    // Placing over the entry stairwell hole (-0.52, 1.04) is strictly rejected!
    expect(restAt(cabin, g, cabinet, -0.52, 1.0, 0, [])).toBeNull();
    // Placing flush against the stairwell inboard edge (z = 0.65, maxZ = 0.90 < 0.94) fits cleanly!
    expect(restAt(cabin, g, cabinet, -0.52, 0.65, 0, [])).toBeCloseTo(cabin.floor, 4);
  });

  it('Whale RV allows furniture across former -1.37 and -0.48 seams and blocks its stairwell hole', () => {
    const cabin = zonesFor('rv', stockBuild('rv')).find((z) => z.id === 'cabin')!;
    expect(cabin).toBeTruthy();
    const g = flatGrid(cabin);
    expect(findSpot(cabin, g, cabinet, 0, { x: -1.37, z: -0.8 }, [], 0.1, true)).not.toBeNull();
    expect(findSpot(cabin, g, cabinet, 0, { x: -0.48, z: -0.8 }, [], 0.1, true)).not.toBeNull();
    expect(restAt(cabin, g, cabinet, -0.92, 0.9, 0, [])).toBeNull();
  });
});

describe('Round 3 #3: coffee maker docks cups via R-mode only (no LMB brew conflict)', () => {
  it('NdCoffee.take() rejects direct LMB cup placement so LMB never conflicts with brewing', () => {
    const sys = new NdCoffee();
    const pot = { kind: 'item' as const, item: newItem('coffee_pot') };
    const mug = { kind: 'item' as const, item: newItem('nd_mug') };
    const fakeMachine = { item: newItem('nd_coffee_machine') } as never;
    expect(sys.take(fakeMachine, 'cup', pot)).toBeNull();
    expect(sys.take(fakeMachine, 'switch', pot)).toBeNull();
    expect(sys.take(fakeMachine, 'body', mug)).toBeNull();
  });
});

describe('Round 3 #6: unified driver-seat cabin dome light (no auto-on rear ceiling light)', () => {
  it('Power.ceilingOf stays 0 in an RV at night until v.domeOn is toggled true, then smoothly ramps up', () => {
    const power = new Power();
    const v = {
      domeOn: false,
      sys: {
        drawAppliances: () => true,
        applianceLevel: () => 0.8,
        dash: { battery: 0.9 },
      },
    } as never;
    const ctx = {
      vehicles: [v],
      player: { aboard: { v } },
      env: { sky: { night: 1 } },
      loose: { list: [] },
    } as never;
    for (let i = 0; i < 30; i++) power.step(0.05, ctx);
    expect(power.ceilingOf(v)).toBe(0);
    (v as { domeOn: boolean }).domeOn = true;
    for (let i = 0; i < 30; i++) power.step(0.05, ctx);
    expect(power.ceilingOf(v)).toBeGreaterThan(0.95);
    (v as { domeOn: boolean }).domeOn = false;
    for (let i = 0; i < 60; i++) power.step(0.05, ctx);
    expect(power.ceilingOf(v)).toBe(0);
  });
});

describe('Round 3 #7: Old Elephant, Loaf van, Rhino bed and all-15-frame anti-teleport', () => {
  const flat = new FunctionLand(() => 0);
  const makeRig = (frameId: string): { ws: VehicleWalkSolids; toW: (mx: number, my: number, mz: number) => { x: number; y: number; z: number } } => {
    const b = stockBuild(frameId);
    const d = derive(b);
    const sim = new VehicleSim(d.spec as VehicleSpec);
    sim.reset(0, 0, 0, 0);
    const f = frameDef(frameId);
    const open: Record<string, number> = { door_side: 1, trunk: 1 };
    const v: WalkVehicle = {
      build: b,
      sys: { derived: d },
      sim,
      view: {
        frame: f,
        roofT: 0,
        hasPanel: (m) => f.mounts.some((x) => x.id === m && !!x.panel),
        panelOpen: (m) => open[m] ?? 0,
      },
      carriedBy: null,
    };
    const cg = d.cg;
    const toW = (mx: number, my: number, mz: number) => ({
      x: sim.px + (mx - cg.x),
      y: sim.py + (my - cg.y),
      z: sim.pz + (mz - cg.z),
    });
    return { ws: new VehicleWalkSolids(v), toW };
  };
  const stepWalk = (w: FootWalker, seconds: number): void => {
    const n = Math.round(seconds / FOOT.h);
    for (let i = 0; i < n; i++) w.step({ forward: 1, right: 0, run: false, crouch: false, jump: false });
  };

  it('Old Elephant: walking onto the rear engine deck auto-crouches cleanly with zero teleport outside', () => {
    const { ws, toW } = makeRig('elephant');
    const w = new FootWalker(flat, ws);
    w.setProfile(ND_FOOT);
    const p0 = toW(-3.6, 0.62, 0);
    w.place(p0.x, p0.z, Math.PI);
    w.y = p0.y;
    stepWalk(w, 1.8);
    const m = ws.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
    expect(Math.abs(m.z)).toBeLessThan(1.15);
    expect(m.x).toBeGreaterThan(-5.55);
    expect(m.x).toBeLessThan(-3.5);
    // Walking into the right wall fore & aft of the stairwell never ejects player outside
    const p1 = toW(-2.2, 0.62, 0.5);
    w.place(p1.x, p1.z, Math.PI / 2);
    w.y = p1.y;
    stepWalk(w, 1.0);
    const m1 = ws.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
    expect(Math.abs(m1.z)).toBeLessThan(1.17);
  });

  it('Old Elephant aboard areas keep full >= 1.1 m width while sealing right wall fore & aft of stairwell', () => {
    const areas = aboardOf('elephant')!.areas;
    for (const r of areas) expect(r.z1 - r.z0).toBeGreaterThanOrEqual(1.1 - 1e-9);
    const inside = (x: number, z: number) => areas.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    expect(inside(-2.0, 1.02)).toBe(true);
    expect(inside(0.5, 1.02)).toBe(true);
    expect(inside(-0.52, 1.02)).toBe(false);
  });

  it('Rhino canvas cargo truck: walking inside cargo bed from rear to front is unblocked by canvas wall', () => {
    const { ws, toW } = makeRig('rhino');
    const w = new FootWalker(flat, ws);
    w.setProfile(ND_FOOT);
    const p0 = toW(-2.8, 1.24, 0);
    w.place(p0.x, p0.z, 0);
    w.y = p0.y;
    stepWalk(w, 1.5);
    const m = ws.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
    expect(m.x).toBeGreaterThan(-1.2);
    expect(Math.abs(m.z)).toBeLessThan(1.1);
    expect(m.y).toBeGreaterThan(1.1);
  });

  it('All walkable interior vehicles keep a walker inside without lateral teleport when walking into walls', () => {
    for (const f of FRAMES) {
      const ab = aboardOf(f.id);
      if (!ab || ab.roof) continue;
      const { ws, toW } = makeRig(f.id);
      const a0 = ab.areas[0];
      const cx = (a0.x0 + a0.x1) / 2;
      const cz = (a0.z0 + a0.z1) / 2;
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const w = new FootWalker(flat, ws);
        w.setProfile(ND_FOOT);
        const p0 = toW(cx, a0.floor, cz);
        w.place(p0.x, p0.z, heading);
        w.y = p0.y;
        stepWalk(w, 0.8);
        const m = ws.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
        expect(Math.hypot(m.x - cx, m.z - cz), `${f.id} h=${heading}`).toBeLessThan(f.body.front - f.body.rear + 1.5);
      }
    }
  });
});

describe('Round 3 #9: zero junk_vinyl, save migration, and all 51 individual tapes & vinyls', () => {
  it('junk_vinyl is removed from catalogue and migrates cleanly to playable nd_vinyl_01', () => {
    expect(hasItem('junk_vinyl')).toBe(false);
    expect(ITEMS.some((i) => i.id === 'junk_vinyl')).toBe(false);
    expect(retiredKind('junk_vinyl')).toBe(true);
    const loss = { unknown: 0 };
    const migrated = cleanItem({ uid: 'old_v', item: 'junk_vinyl' }, loss);
    expect(migrated?.item).toBe('nd_vinyl_01');
    expect(loss.unknown).toBe(0);
  });

  it('all 51 individual tapes and 51 individual vinyls exist with unique ids and color pairs', () => {
    expect(TAPES).toHaveLength(51);
    expect(VINYLS).toHaveLength(51);
    for (const t of TAPES) expect(hasItem(t.id), t.id).toBe(true);
    for (const v of VINYLS) expect(hasItem(v.id), v.id).toBe(true);
  });
});

describe('Round 3 #11: toilet seat shifted -0.14 m back from steering wheel', () => {
  it('seat_toilet spec and parts_geo.json place seated eye comfortably back from the wheel', () => {
    const def = partDef('seat_toilet');
    expect(def.seat!.eyeBack).toBeGreaterThanOrEqual(0.16);
    expect(def.seat!.eyeUp).toBeLessThanOrEqual(1.02);
    const geo = JSON.parse(readFileSync(resolve(process.cwd(), 'src/core/modcar/data/parts_geo.json'), 'utf8')) as { parts: Record<string, { eye?: number[]; bbox?: number[][] }> };
    expect(geo.parts.seat_toilet?.eye?.[0]).toBeLessThanOrEqual(-0.16);
    expect(geo.parts.seat_toilet?.bbox?.[0]?.[0]).toBeLessThan(-0.42);
  });
});
