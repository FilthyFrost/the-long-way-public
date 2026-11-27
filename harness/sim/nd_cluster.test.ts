/**
 * The cab's instruments as Nomad Drive's (docs/V3/plan/finish.md §五; src/game/modcar/cluster.ts): each frame's cluster
 * laid out with nothing over anything else and everything it shows in its place, the frame's own pod cut out of its
 * model, and what the cluster's display is told by the dashboard's data.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LAMP_IDS, type LampId } from '../../src/core/modcar/instruments';
import { stockBuild } from '../../src/core/modcar/build';
import { FRAMES } from '../../src/core/modcar/frames';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { CLUSTERS, type ClusterStyle, cutGeometry, layoutOf, type Layout, placement } from '../../src/game/modcar/cluster';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

/** the boxes (cm) a layout's wells, lamps and screens take */
function boxes(l: Layout): { what: string; x0: number; x1: number; y0: number; y1: number }[] {
  const out: { what: string; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const w of l.wells) out.push({ what: `well@${w.x.toFixed(1)}`, x0: w.x - w.w / 2, x1: w.x + w.w / 2, y0: w.y - w.h / 2, y1: w.y + w.h / 2 });
  return out;
}

/** a layout with nothing over anything else and everything it shows in its place, of a size a dashboard has room for */
function checkLayout(l: Layout, k: number, speedLeft: boolean): void {
  // the big two: a speedometer and a rev counter, the speedometer on the side asked for
  expect(l.big.map((d) => d.kind).sort()).toEqual(['rpm', 'speed']);
  const sp = l.big.find((d) => d.kind === 'speed')!;
  const rp = l.big.find((d) => d.kind === 'rpm')!;
  expect(sp.x < rp.x).toBe(speedLeft);
  // a speedometer of real size: 7 cm across and more (Nomad Drive's are 7–8)
  expect(2 * sp.r * k).toBeGreaterThanOrEqual(7);
  // the wells apart
  const b = boxes(l);
  for (let i = 0; i < l.wells.length; i++)
    for (let j = i + 1; j < l.wells.length; j++) {
      const p = l.wells[i];
      const q = l.wells[j];
      if (p.round && q.round) expect(Math.hypot(p.x - q.x, p.y - q.y), `${b[i].what} ${b[j].what}`).toBeGreaterThanOrEqual(p.w / 2 + q.w / 2 + 0.4);
      else expect(b[i].x1 <= b[j].x0 + 1e-6 || b[j].x1 <= b[i].x0 + 1e-6 || b[i].y1 <= b[j].y0 + 1e-6 || b[j].y1 <= b[i].y0 + 1e-6, `${b[i].what} ${b[j].what}`).toBe(true);
    }
  // every dial, lamp and screen on the floor of a well; the lamps and the screens clear of each other and of the small dials
  const inWell = (x: number, y: number, r: number): boolean =>
    l.wells.some((w) => (w.round ? Math.hypot(x - w.x, y - w.y) + r <= w.w / 2 + 1e-6 : Math.abs(x - w.x) + r <= w.w / 2 + 1e-6 && Math.abs(y - w.y) + r <= w.h / 2 + 1e-6));
  for (const d of l.big) expect(inWell(d.x, d.y, d.r), d.kind).toBe(true);
  for (const p of l.lamps) expect(inWell(p.x, p.y, p.s / 2), p.id).toBe(true);
  for (const s of l.screens) {
    expect(inWell(s.x - s.w / 2, s.y - s.h / 2, 0) && inWell(s.x + s.w / 2, s.y + s.h / 2, 0), s.kind).toBe(true);
    for (const p of l.lamps) {
      const sepX = Math.abs(p.x - s.x) - s.w / 2 - p.s / 2;
      const sepY = Math.abs(p.y - s.y) - s.h / 2 - p.s / 2;
      if (!l.bike) expect(sepX >= 0 || sepY >= 0, `${p.id} and the ${s.kind}`).toBe(true);
    }
  }
  for (let i = 0; i < l.lamps.length; i++)
    for (let j = i + 1; j < l.lamps.length; j++) {
      const p = l.lamps[i];
      const q = l.lamps[j];
      expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)), `${p.id} and ${q.id}`).toBeGreaterThanOrEqual((p.s + q.s) / 2 - 1e-6);
    }
  for (const d of l.small) {
    // a quarter dial's square (its arc and its letters), a round one's face, clear of the screens and the lamps
    const x0 = d.form === 'quarter' ? d.x - d.r * 1.12 : d.x - d.r;
    const x1 = d.form === 'quarter' ? d.x + d.r * 0.35 : d.x + d.r;
    const y0 = d.form === 'quarter' ? d.y - d.r * 0.35 : d.y - d.r;
    const y1 = d.form === 'quarter' ? d.y + d.r * 1.02 : d.y + d.r;
    expect(d.form === 'quarter' ? inWell(x0, y0, 0) && inWell(x1, y1, 0) : inWell(d.x, d.y, d.r), d.kind).toBe(true);
    for (const s of l.screens) expect(x1 <= s.x - s.w / 2 || x0 >= s.x + s.w / 2 || y1 <= s.y - s.h / 2 || y0 >= s.y + s.h / 2, `${d.kind} and the ${s.kind}`).toBe(true);
    for (const p of l.lamps) expect(x1 <= p.x - p.s / 2 || x0 >= p.x + p.s / 2 || y1 <= p.y - p.s / 2 || y0 >= p.y + p.s / 2, `${d.kind} and ${p.id}`).toBe(true);
  }
  // what it shows: fuel and coolant as dials on four wheels (bars on a motorcycle's screens), all the lamps
  expect(l.small.map((d) => d.kind).sort()).toEqual(l.bike ? [] : ['fuel', 'temp']);
  const lamps = new Set(l.lamps.map((p) => p.id));
  if (!l.bike) expect([...lamps].sort()).toEqual([...LAMP_IDS].sort());
  else for (const must of ['turnL', 'turnR', 'high', 'fuel', 'oil', 'coolant'] as LampId[]) expect(lamps.has(must), must).toBe(true);
  // the parking brake's lamp along the top row, with the indicators (where the rim hides it least)
  if (!l.bike) {
    const park = l.lamps.find((p) => p.id === 'park')!;
    const turn = l.lamps.find((p) => p.id === 'turnL')!;
    expect(park.y).toBeCloseTo(turn.y, 6);
  }
  expect(l.screens.length).toBeGreaterThan(0);
  // the whole of it no wider than a dashboard has room for
  expect(l.w * k).toBeLessThan(l.bike ? 25 : 50);
  expect(l.h * k).toBeLessThan(14);
}

describe('each frame its cluster', () => {
  const ids = FRAMES.map((f) => f.id).filter((id) => id !== 'trailer');

  it('has a cluster for every vehicle one drives', () => {
    expect(Object.keys(CLUSTERS).sort()).toEqual([...ids].sort());
  });

  for (const id of ids) {
    const spec = CLUSTERS[id];
    for (const speedLeft of [true, false]) {
      it(`${id}${speedLeft ? '' : ' (its speedometer on the right)'}: nothing over anything else, everything in its place`, () => {
        checkLayout(layoutOf(spec.style, speedLeft, 14.1, spec.screen, spec.warnTop), spec.style === 'bike' ? 1 : (spec.scale ?? 1), speedLeft);
      });
    }
  }

  // (every arrangement a frame may be given: the display high or low, the twin's warnings along the top or the foot)
  for (const style of ['twin', 'sport', 'quad'] as ClusterStyle[])
    for (const screen of ['high', 'low'] as const)
      for (const warnTop of [false, true])
        it(`${style}, the display ${screen}${warnTop ? ', the warnings along the top' : ''}: nothing over anything else`, () => {
          for (const speedLeft of [true, false]) checkLayout(layoutOf(style, speedLeft, 14.1, screen, warnTop), 1, speedLeft);
        });

  it("the twin's warnings along the top: under the indicators, over the gauges and the display", () => {
    const l = layoutOf('twin', true, 14.1, 'high', true);
    const turn = l.lamps.find((p) => p.id === 'turnL')!;
    const warn = l.lamps.filter((p) => ['brake', 'oil', 'charge', 'coolant', 'fuel', 'engine', 'tyre'].includes(p.id));
    expect(warn).toHaveLength(7);
    for (const p of warn) {
      expect(p.y).toBeLessThan(turn.y);
      for (const d of l.small) expect(p.y - p.s / 2).toBeGreaterThan(d.y + d.r);
      for (const s of l.screens) expect(p.y - p.s / 2).toBeGreaterThanOrEqual(s.y + s.h / 2);
    }
  });

  it('is placed against the frame\'s own dials, moved in their plane and turned towards the driver by its tilt', () => {
    const mid = new THREE.Vector3(1.2, 1.0, -0.4);
    // (the dials' plane leaning back 30°: out towards the driver (−x) and up)
    const out = new THREE.Vector3(-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);
    const right = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3().crossVectors(out, right);
    const p = placement({ style: 'twin', at: [0.01, -0.02, 0.005], tilt: 12 }, mid, right, up, out);
    const want = mid.clone().addScaledVector(right, 0.01).addScaledVector(up, -0.02).addScaledVector(out, 0.005);
    expect(p.position.distanceTo(want)).toBeLessThan(1e-9);
    // the faces' normal 12° lower than the dials' (towards the driver's eye, which is under it), across unchanged
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion);
    expect((Math.acos(n.dot(out)) * 180) / Math.PI).toBeCloseTo(12, 6);
    expect(n.dot(up)).toBeLessThan(0);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion).distanceTo(right)).toBeLessThan(1e-9);
    // no tilt, no turn; no `at`, 1.8 cm behind the dials (where the frame's own pod was)
    const q = placement({ style: 'quad' }, mid, right, up, out);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q.quaternion).distanceTo(out)).toBeLessThan(1e-9);
    expect(q.position.distanceTo(mid.clone().addScaledVector(out, -0.018))).toBeLessThan(1e-9);
  });
});

describe("the frame's own pod", () => {
  it('cuts away the triangles wholly inside a box, and only those', () => {
    // a strip of four quads along x, one of them inside the box
    const g = new THREE.PlaneGeometry(4, 1, 4, 1).translate(2, 0, 0);
    const n0 = g.getIndex()!.count / 3;
    const out = cutGeometry(g, new THREE.Matrix4(), [[1.0, 2.0, -1, 1, -1, 1]]);
    expect(out).not.toBeNull();
    expect(out!.n).toBe(2);
    expect(out!.geo.getIndex()!.count / 3).toBe(n0 - 2);
    // (its points shared with the original: only the index is its own)
    expect(out!.geo.getAttribute('position')).toBe(g.getAttribute('position'));
    // nothing inside: nothing to cut
    expect(cutGeometry(g, new THREE.Matrix4(), [[10, 11, -1, 1, -1, 1]])).toBeNull();
    // the box in the dials' space: the strip moved by the matrix first
    const moved = cutGeometry(g, new THREE.Matrix4().makeTranslation(-1, 0, 0), [[1.0, 2.0, -1, 1, -1, 1]]);
    expect(moved!.n).toBe(2);
  });
});

describe("the display's data", () => {
  it("tells the cluster the vehicle's own distance, the air outside and the time of day", () => {
    const sys = new ModSystems(stockBuild('sedan'));
    const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
    sim.reset(0, 0, 0, 0);
    sys.bind(sim);
    const ground = new FlatGround();
    const env: ModEnv = { ambientC: -7, dark: false, rain: 0, sun: 1, hour: 17.5 };
    const run = (seconds: number, input: Partial<VehicleInput>): void => {
      const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
      for (let i = 0; i < Math.round(seconds * 120); i++) {
        sim.substep(inp, ground);
        if (i % 4 === 3) sys.update(4 / 120, env);
      }
    };
    sys.crank(true);
    run(1.5, {});
    sys.crank(false);
    expect(sys.dash.odoKm).toBeLessThan(0.001);
    expect(sys.build.odo).toBeUndefined();
    expect(sys.dash.outC).toBe(-7);
    expect(sys.dash.hour).toBe(17.5);
    sim.setParkBrake(false);
    run(20, { throttle: 0.6 });
    expect(sim.odometer).toBeGreaterThan(100);
    expect(sys.dash.odoKm).toBeCloseTo(sim.odometer / 1000, 2);
    expect(Number.isInteger(sys.build.odo)).toBe(true);
    const again = new ModSystems(sys.build);
    const sim2 = new VehicleSim(again.derived.spec as VehicleSpec);
    sim2.reset(0, 0, 0, 0);
    again.bind(sim2);
    again.update(1 / 30, env);
    expect(again.dash.odoKm).toBeCloseTo(sim.odometer / 1000, 2);
  });
});
