import { describe, expect, it } from 'vitest';
import { FootWalker, ND_FOOT, type FootInput } from '../../src/core/onfoot/walker';
import { FunctionLand } from '../../src/core/onfoot/land';
import { Solid } from '../../src/core/world/solids';
import { restAt, roofZoneOf, type CargoZone, type HeightGrid, type Placed, type ThingBox } from '../../src/core/modcar/cargo';
import { frameDef } from '../../src/core/modcar/frames';
import { VehicleWalkSolids, type WalkVehicle } from '../../src/core/modcar/vehicleSolids';
import { CAMERA, ejected } from '../../src/core/v3/nd/camera';
import { itemDef, newItem } from '../../src/core/modcar/items';
import { registerNdItems } from '../../src/core/v3/nd/items';
import { COOKWARE_ITEMS } from '../../src/core/v3/kitchen/items';
import { coffeeStep, pourBag, putCup, startBrew } from '../../src/core/v3/nd/coffee';
import { flowWhy, itemVessel, pour } from '../../src/core/v3/nd/water';

registerNdItems();

const FLAT_LAND = new FunctionLand(() => 0);

describe('Playtest Round 2 · Phase 1 core invariants', () => {
  it('#19 RV jump under low ceiling clamps head cleanly without horizontal ejection', () => {
    // Closed RV room: floor at y=0.86, ceiling slab from y=2.66..2.86, walls at x=±2, z=±1
    const floor = new Solid().set(0, 0, 2.0, 1.0, 0, 0.7, 0.86, true, 'v:rv:floor');
    const roof = new Solid().set(0, 0, 2.1, 1.1, 0, 2.66, 2.86, false, 'v:rv:roof');
    const wallL = new Solid().set(0, -1.05, 2.1, 0.08, 0, 0.86, 2.86, false, 'v:rv:wall');
    const wallR = new Solid().set(0, 1.05, 2.1, 0.08, 0, 0.86, 2.86, false, 'v:rv:wall');
    const wallF = new Solid().set(2.05, 0, 0.08, 1.1, 0, 0.86, 2.86, false, 'v:rv:wall');
    const wallB = new Solid().set(-2.05, 0, 0.08, 1.1, 0, 0.86, 2.86, false, 'v:rv:wall');
    const solids = [floor, roof, wallL, wallR, wallF, wallB];
    const w = new FootWalker(FLAT_LAND, {
      solidsNear: (_x, _z, _r, out) => {
        for (const s of solids) out.push(s);
      },
    }).setProfile(ND_FOOT);

    w.place(0, 0.86, 0, 0);
    // Repeated jumps while moving diagonally toward the side wall must stay strictly inside the RV
    for (let jump = 0; jump < 6; jump++) {
      for (let i = 0; i < 45; i++) {
        const inp: FootInput = { forward: 0.4, right: 0.6, run: false, crouch: false, jump: i === 0 };
        w.advance(1 / 60, inp);
        expect(Math.abs(w.x)).toBeLessThan(2.0);
        expect(Math.abs(w.z)).toBeLessThan(1.0);
        expect(w.y).toBeGreaterThanOrEqual(0.84);
        expect(w.y + w.profile.height).toBeLessThanOrEqual(2.665);
      }
    }
  });

  it('#8 wagon creates a walkable front hood solid below the cab roof', () => {
    const f = frameDef('wagon');
    const fakeVehicle: WalkVehicle = {
      build: { uid: 'test-wagon', frame: 'wagon', parts: {} },
      sys: { derived: { cg: { x: 0, y: 0, z: 0 } } },
      sim: {
        px: 0,
        py: 0,
        pz: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        yaw: 0,
        spec: {
          id: 'wagon',
          body: {
            centerX: (f.body.front + f.body.rear) / 2,
            halfLength: (f.body.front - f.body.rear) / 2,
            halfWidth: f.body.halfWidth,
            bottom: f.body.bottom,
            top: f.body.top,
          },
        },
        basis: (out) => {
          out[0] = 1; out[1] = 0; out[2] = 0;
          out[3] = 0; out[4] = 1; out[5] = 0;
          out[6] = 0; out[7] = 0; out[8] = 1;
        },
      },
      view: {
        frame: f,
        roofT: 0,
        hasPanel: () => true,
        panelOpen: () => 0,
      },
      carriedBy: null,
    };
    const vs = new VehicleWalkSolids(fakeVehicle);
    const out: Solid[] = [];
    vs.solidsNear(0, 0, 10, out);
    const hood = out.find((s) => s.tag.endsWith(':floor'));
    const body = out.find((s) => s.tag.endsWith(':body'));
    expect(hood).toBeDefined();
    expect(body).toBeDefined();
    expect(hood!.floor).toBe(true);
    expect(hood!.y1).toBeLessThan(1.1);
    expect(hood!.y1).toBeGreaterThan(0.75);
    expect(hood!.x).toBeGreaterThan(body!.x);
  });

  it('#8/#9 roof rack allows tall items and up to 50% overhang while preventing overlap', () => {
    const rack = roofZoneOf('wagon');
    expect(rack).not.toBeNull();
    expect(rack!.overhang).toBe(0.5);
    expect(rack!.top).toBeGreaterThan(4.5);

    const nx = Math.ceil((rack!.x[1] - rack!.x[0]) / 0.1) + 1;
    const nz = Math.ceil((rack!.z[1] - rack!.z[0]) / 0.1) + 1;
    const grid: HeightGrid = { x0: rack!.x[0], z0: rack!.z[0], cell: 0.1, nx, nz, h: new Float32Array(nx * nz).fill(rack!.floor) };
    // Tall wooden shelf overhanging slightly over the rack edge fits cleanly
    const shelf: ThingBox = { minX: -0.35, maxX: 0.35, minY: 0, maxY: 1.75, minZ: -0.45, maxZ: 0.45 };
    const cx = (rack!.x[0] + rack!.x[1]) / 2;
    const y1 = restAt(rack as CargoZone, grid, shelf, cx, rack!.z[1] - 0.15, 0, []);
    expect(y1).not.toBeNull();

    // A second item over the first shelf rests strictly ABOVE it (never penetrates into the shelf!)
    const placed: Placed[] = [{ box: shelf, x: cx, y: y1!, z: rack!.z[1] - 0.15, yaw: 0 }];
    const box2: ThingBox = { minX: -0.25, maxX: 0.25, minY: 0, maxY: 0.4, minZ: -0.25, maxZ: 0.25 };
    const yStacked = restAt(rack as CargoZone, grid, box2, cx, rack!.z[1] - 0.25, 0, placed);
    expect(yStacked).not.toBeNull();
    expect(yStacked!).toBeGreaterThanOrEqual(y1! + shelf.maxY - 1e-4);
    // Placing beside it with separation rests directly on the rack deck
    const yBeside = restAt(rack as CargoZone, grid, box2, cx + 0.65, 0.0, 0, placed);
    expect(yBeside).not.toBeNull();
    expect(yBeside!).toBeCloseTo(rack!.floor, 3);
  });

  it('#17 cooler capacity holds 24 slots and 30 kg for stacked ingredients', () => {
    const cooler = COOKWARE_ITEMS.find((r) => r.id === 'kit_cooler');
    expect(cooler?.holds?.slots).toBeGreaterThanOrEqual(24);
    expect(cooler?.holds?.maxKg).toBeGreaterThanOrEqual(30);
  });

  it('#6 camera print eject finishes briskly in 1.25 s', () => {
    expect(CAMERA.ejectS).toBeCloseTo(1.25, 4);
    expect(ejected(0)).toBe(0);
    expect(ejected(1.25)).toBe(1);
  });

  it('#22 coffee brewing fills glass pot and transfers cleanly into mug', () => {
    const machine = newItem('nd_coffee_machine');
    const pot = newItem('coffee_pot');
    const mug = newItem('nd_mug');
    pot.litres = 0;
    mug.litres = 0;

    expect(pourBag(machine)).toBe(true);
    expect(putCup(machine, pot)).toBe(true);
    expect(startBrew(machine)).toBe(true);
    // Advance past brew (7.5 s) + pour (2 s)
    let done = false;
    for (let i = 0; i < 120; i++) {
      const r = coffeeStep(machine, 0.1);
      if (r.done) {
        done = true;
        break;
      }
    }
    expect(done).toBe(true);
    expect(pot.litres).toBeGreaterThan(0.95);

    const pv = itemVessel(pot)!;
    const mv = itemVessel(mug)!;
    expect(flowWhy(pv, mv)).toBe('ok');
    pour(pv, mv, 2.0);
    expect(mv.litres).toBeCloseTo(mv.holds, 3);
    expect(mv.liquid).toBe('coffee');
    expect(flowWhy(pv, mv)).toBe('full');
  });
});
