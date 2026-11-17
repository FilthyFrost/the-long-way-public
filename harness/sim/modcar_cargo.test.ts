/**
 * Things stowed in a vehicle (src/core/modcar/cargo.ts, docs/MODCAR.md §5.6): where a thing fits in a zone
 * among the things already there, on the floor the model has (a wheel arch, a seat), and what the load does
 * to the vehicle's mass and centre of gravity.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { findSpot, footprint, lieBox, restAt, zoneOf, zonesOf, zoneTakes, type CargoZone, type HeightGrid, type Placed, type ThingBox } from '../../src/core/modcar/cargo';
import { derive } from '../../src/core/modcar/derive';
import { FRAMES } from '../../src/core/modcar/frames';

/** a zone's floor at one height, with a raised block (a wheel arch) where asked */
function grid(zone: CargoZone, floor: number, bump?: { x: [number, number]; z: [number, number]; h: number }): HeightGrid {
  const cell = 0.02;
  const x0 = zone.x[0] - 0.05;
  const z0 = zone.z[0] - 0.05;
  const nx = Math.ceil((zone.x[1] - zone.x[0] + 0.1) / cell);
  const nz = Math.ceil((zone.z[1] - zone.z[0] + 0.1) / cell);
  const h = new Float32Array(nx * nz).fill(floor);
  if (bump) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        if (x >= bump.x[0] && x <= bump.x[1] && z >= bump.z[0] && z <= bump.z[1]) h[j * nx + i] = bump.h;
      }
    }
  }
  return { x0, z0, cell, nx, nz, h };
}

/** a box standing on its origin, w × d × h (x, z, y) */
const box = (w: number, d: number, h: number): ThingBox => ({ minX: -w / 2, maxX: w / 2, minY: 0, maxY: h, minZ: -d / 2, maxZ: d / 2 });

describe('ModCar cargo zones', () => {
  it('every frame has somewhere to put things, and its zones lie inside the frame', () => {
    for (const f of FRAMES) {
      const zones = zonesOf(f.id);
      expect(zones.length, f.id).toBeGreaterThan(0);
      for (const z of zones) {
        expect(z.x[0]).toBeLessThan(z.x[1]);
        expect(z.z[0]).toBeLessThan(z.z[1]);
        expect(z.top).toBeGreaterThan(z.floor + 0.2);
      }
    }
    expect(zoneTakes(zoneOf('moto', 'pillion')!, 'large')).toBe(false);
    expect(zoneTakes(zoneOf('pickup', 'bed')!, 'large')).toBe(true);
  });

  it('a box fits where there is room and floor, not over the edge or under a lid it is taller than', () => {
    const trunk = zoneOf('sedan', 'trunk')!;
    const g = grid(trunk, 0.36);
    const b = box(0.3, 0.3, 0.3);
    expect(restAt(trunk, g, b, -1.7, 0, 0, [])).toBeCloseTo(0.36, 5);
    // a corner out of the boot
    expect(restAt(trunk, g, b, -1.7, 0.55, 0, [])).toBeNull();
    // taller than the room under the lid (0.8 − 0.36)
    expect(restAt(trunk, g, box(0.3, 0.3, 0.5), -1.7, 0, 0, [])).toBeNull();
    // a hole under it
    const holed = grid(trunk, 0.36);
    holed.h.fill(NaN, 0, holed.nx * 40);
    expect(restAt(trunk, holed, b, -1.7, -0.45, 0, [])).toBeNull();
  });

  it('a long thing turned a quarter round takes the other way across (the footprint turns with yaw)', () => {
    const q = footprint(box(1, 0.2, 0.1), 0, 0, Math.PI / 2);
    const xs = q.map((p) => p[0]);
    const zs = q.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(1, 5);
  });

  it('aimed at a full spot it goes on top of what is there, or the nearest free spot round it', () => {
    const bed = zoneOf('pickup', 'bed')!;
    const g = grid(bed, 0.69);
    const crate = box(0.4, 0.3, 0.25);
    const there: Placed[] = [{ box: crate, x: -1.4, y: 0.69, z: 0, yaw: 0 }];
    const s = findSpot(bed, g, crate, 0, { x: -1.4, z: 0 }, there)!;
    // (the bed is open above: on top of the crate)
    expect(s.y).toBeCloseTo(0.69 + 0.25, 5);
    // under a boot lid a second one does not stack: it goes beside the first
    const trunk = zoneOf('sedan', 'trunk')!;
    const tg = grid(trunk, 0.36);
    const big = box(0.3, 0.3, 0.3);
    const first = findSpot(trunk, tg, big, 0, { x: -1.7, z: 0 }, [])!;
    const second = findSpot(trunk, tg, big, 0, { x: -1.7, z: 0 }, [{ box: big, ...first }])!;
    expect(second.y).toBeCloseTo(0.36, 5);
    expect(Math.hypot(second.x - first.x, second.z - first.z)).toBeGreaterThan(0.3);
  });

  it('packed in without aiming, things fill the zone from its back corner, never overlapping, until it is full', () => {
    const trunk = zoneOf('sedan', 'trunk')!;
    const g = grid(trunk, 0.36);
    const b = box(0.25, 0.25, 0.2);
    const placed: Placed[] = [];
    for (let k = 0; k < 40; k++) {
      const s = findSpot(trunk, g, b, 0, null, placed);
      if (!s) break;
      placed.push({ box: b, ...s });
    }
    // 0.55 × 1.2 floor, two layers of 0.2 under 0.44 of room: 2 × 4 a layer, twice
    expect(placed.length).toBe(16);
    expect(placed[0].x).toBeLessThan(-1.7);
    expect(placed[0].z).toBeLessThan(-0.3);
    expect(findSpot(trunk, g, b, 0, null, placed)).toBeNull();
  });

  it('a thing too tall to stand under the boot lid goes in lying on its side', () => {
    const trunk = zoneOf('sedan', 'trunk')!;
    const g = grid(trunk, 0.36);
    // a 20 L jerrycan, 0.6 m tall here (taller than the 0.49 under the lid), thin across
    const can: ThingBox = { minX: -0.09, maxX: 0.09, minY: 0, maxY: 0.6, minZ: -0.17, maxZ: 0.17 };
    const s = findSpot(trunk, g, can, 0, { x: -1.7, z: 0 }, [])!;
    expect(s.lie).toBe('z');
    const laid = lieBox(can, s.lie);
    expect(laid.maxY - laid.minY).toBeCloseTo(0.18, 5);
    expect(s.y + laid.minY).toBeCloseTo(0.36, 5);
    expect(findSpot(trunk, g, box(0.3, 0.3, 0.3), 0, { x: -1.7, z: 0 }, [])!.lie).toBeUndefined();
  });

  it('a wheel arch in a bed lifts what stands on it; packing keeps to the flat floor first', () => {
    const bed = zoneOf('pickup', 'bed')!;
    const g = grid(bed, 0.69, { x: [-1.8, -1.0], z: [0.45, 0.72], h: 0.96 });
    const b = box(0.3, 0.3, 0.3);
    expect(restAt(bed, g, b, -1.4, 0.5, 0, [])).toBeCloseTo(0.96, 5);
    const s = findSpot(bed, g, b, 0, null, [])!;
    expect(s.y).toBeCloseTo(0.69, 5);
  });

  it('what rides in a vehicle adds its mass and moves the centre of gravity towards it', () => {
    const b = stockBuild('pickup');
    const d0 = derive(b);
    b.cargo = [{ m: 200, x: -1.6, y: 0.9, z: 0 }];
    const d1 = derive(b);
    expect(d1.mass).toBeCloseTo(d0.mass + 200, 5);
    expect(d1.cg.x).toBeLessThan(d0.cg.x - 0.1);
    expect(d1.cg.y).toBeGreaterThan(d0.cg.y);
  });
});
