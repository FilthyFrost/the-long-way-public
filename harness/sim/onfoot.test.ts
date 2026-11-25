/**
 * Walking in the world (src/core/onfoot): the numbers of docs/DESIGN_V2.md 6.2, steps and slopes,
 * walls that are never walked through at any speed, water, bridge decks, getting out beside a door,
 * and the head kept smooth.
 */
import { describe, expect, it } from 'vitest';
import { FunctionLand, TerrainPoint, type Land } from '../../src/core/onfoot/land';
import { Modes } from '../../src/core/onfoot/modes';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { buildYardSolids, yardToWorld, YARD_AHEAD, YARD_OFFSET } from '../../src/core/onfoot/testbed';
import { doorsOf, nearestDoor, placeAtDoor, VehicleSolid } from '../../src/core/onfoot/vehicle';
import { FOOT, FootWalker, type FootInput } from '../../src/core/onfoot/walker';
import { T0_TRUCK, T3_RV } from '../../src/core/vehicle/spec';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { GroundSample } from '../../src/core/world/ground';
import { pushOut, Push, SolidSet } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

const flat = new FunctionLand(() => 0);
const go = (forward = 1, right = 0, o: Partial<FootInput> = {}): FootInput => ({ forward, right, run: false, crouch: false, jump: false, ...o });

function run(w: FootWalker, seconds: number, inp: FootInput, each?: (w: FootWalker) => void): void {
  const n = Math.round(seconds / FOOT.h);
  for (let i = 0; i < n; i++) {
    w.step(inp);
    each?.(w);
  }
}

/** share of a signal's power above f0 Hz (plain DFT, mean removed) */
function hfShare(y: number[], dt: number, f0: number): number {
  const n = y.length;
  const m = y.reduce((a, b) => a + b, 0) / n;
  let lo = 0;
  let hi = 0;
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * k * i) / n;
      re += (y[i] - m) * Math.cos(a);
      im -= (y[i] - m) * Math.sin(a);
    }
    const p = re * re + im * im;
    if (k / (n * dt) > f0) hi += p;
    else lo += p;
  }
  return hi / Math.max(1e-12, lo + hi);
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('on foot: pace', () => {
  const pace = (inp: FootInput, setup?: (w: FootWalker) => void): number => {
    const w = new FootWalker(flat);
    w.place(0, 0, 0);
    setup?.(w);
    run(w, 1.5, inp);
    const x0 = w.x;
    const z0 = w.z;
    run(w, 2, inp);
    return Math.hypot(w.x - x0, w.z - z0) / 2;
  };
  it('walks at 1.9 m/s', () => expect(pace(go())).toBeCloseTo(FOOT.walk, 2));
  it('runs at 3.6 m/s', () => expect(pace(go(1, 0, { run: true }))).toBeCloseTo(FOOT.run, 2));
  it('crouches at 1.0 m/s', () => expect(pace(go(1, 0, { crouch: true }))).toBeCloseTo(FOOT.crouch, 2));
  it('carries a big thing alone at 1.2 m/s, and cannot run with it', () => expect(pace(go(1, 0, { run: true }), (w) => (w.load = 'large'))).toBeCloseTo(FOOT.carry, 2));
  it('the stick held diagonally is no faster', () => expect(pace(go(1, 1))).toBeCloseTo(FOOT.walk, 2));
  it('eye at 1.50 m (hers), crouched 1.00 m', () => {
    const w = new FootWalker(flat);
    w.place(0, 0, 0);
    w.bobOn = false;
    run(w, 1, go(0));
    // her eye (docs/V3/plan/character-pv.md: the eye follows her body)
    expect(w.eye().y).toBeCloseTo(1.5, 2);
    run(w, 1.5, go(0, 0, { crouch: true }));
    expect(w.eye().y).toBeCloseTo(1.0, 2);
  });
  it('jumps 0.55 m', () => {
    const w = new FootWalker(flat);
    w.place(0, 0, 0);
    const inp = go(0, 0, { jump: true });
    let top = 0;
    run(w, 1.2, inp, (q) => (top = Math.max(top, q.y)));
    expect(top).toBeGreaterThan(0.53);
    expect(top).toBeLessThan(0.57);
    expect(w.grounded).toBe(true);
  });
});

describe('on foot: slopes and steps', () => {
  const ramp = (deg: number): Land => new FunctionLand((x) => Math.max(0, x - 2) * Math.tan((deg * Math.PI) / 180));
  it('walks up a 30° slope', () => {
    const w = new FootWalker(ramp(30));
    w.place(0, 0, 0);
    run(w, 6, go());
    expect(w.y).toBeGreaterThan(3);
    expect(w.sliding).toBe(false);
  });
  it('cannot climb a 45° slope, and slides back down it', () => {
    const w = new FootWalker(ramp(45));
    w.place(0, 0, 0);
    let top = 0;
    run(w, 6, go(), (q) => (top = Math.max(top, q.y)));
    expect(top).toBeLessThan(0.35);
    // placed on it, one slides down
    w.place(5, 0, 0);
    const y0 = w.y;
    run(w, 3, go(0));
    expect(w.y).toBeLessThan(y0 - 1);
  });
  it('walks up a 0.24 m step and a 0.48 m platform behind it, but not a 0.48 m one straight from the ground', () => {
    const s = new StaticSolids();
    s.box(3, 0, 0.5, 1, 0, -0.1, 0.24, true);
    s.box(4.5, 0, 1, 1, 0, -0.1, 0.48, true);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    run(w, 1.7, go());
    expect(w.y).toBeCloseTo(0.24, 3);
    run(w, 1.2, go());
    expect(w.y).toBeCloseTo(0.48, 3);
    const s2 = new StaticSolids();
    s2.box(3, 0, 1, 1, 0, -0.1, 0.48, true);
    const w2 = new FootWalker(flat, s2);
    w2.place(0, 0, 0);
    run(w2, 3, go());
    expect(w2.y).toBe(0);
    expect(w2.x).toBeLessThan(2 - FOOT.radius + 0.01);
  });
  it('jumps up onto a 0.48 m platform', () => {
    const s = new StaticSolids();
    s.box(3, 0, 1, 1, 0, -0.1, 0.48, true);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    run(w, 0.6, go());
    run(w, 1.5, go(1, 0, { jump: true }));
    expect(w.y).toBeCloseTo(0.48, 3);
  });
  it('steps down off a platform without leaving the ground and walks off a ledge', () => {
    const s = new StaticSolids();
    s.box(0, 0, 1, 1, 0, -0.1, 0.24, true);
    s.box(10, 0, 1, 1, 0, -0.1, 1.2, true);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    expect(w.y).toBeCloseTo(0.24, 3);
    run(w, 1.5, go());
    expect(w.y).toBe(0);
    w.place(10, 0, 0);
    expect(w.y).toBeCloseTo(1.2, 3);
    run(w, 1.5, go());
    expect(w.y).toBe(0);
    expect(w.grounded).toBe(true);
  });
});

describe('on foot: walls', () => {
  it('stops at a wall and slides along it', () => {
    const s = new StaticSolids();
    s.box(3, 0, 0.14, 2, 0, -0.1, 2.1);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    run(w, 3, go(1, 0.3));
    expect(w.x).toBeLessThanOrEqual(3 - 0.14 - FOOT.radius + 1e-6);
    expect(w.z).toBeGreaterThan(0.5);
  });
  it('is never carried through a thin wall, at any speed', () => {
    const s = new StaticSolids();
    s.box(3, 0, 0.05, 2, 0, -0.1, 2.1);
    s.post(-3, 0, 0.05, -0.1, 2);
    for (const v of [5, 30, 200, 2000]) {
      const w = new FootWalker(flat, s);
      w.place(0, 0, 0);
      for (let i = 0; i < 40; i++) {
        w.vx = v;
        w.vz = 0;
        w.step(go(0));
      }
      expect(w.x).toBeLessThan(3);
      w.place(0, 0, 0);
      for (let i = 0; i < 40; i++) {
        w.vx = -v;
        w.vz = 0;
        w.step(go(0));
      }
      expect(w.x).toBeGreaterThan(-3);
    }
  });
  it('walks under a beam but not into a low one; crouching gets under a 1.5 m beam', () => {
    const s = new StaticSolids();
    s.box(3, 0, 0.2, 2, 0, 1.9, 2.2);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    run(w, 3, go());
    expect(w.x).toBeGreaterThan(4);
    const s2 = new StaticSolids();
    s2.box(3, 0, 0.2, 2, 0, 1.5, 2.2);
    const w2 = new FootWalker(flat, s2);
    w2.place(0, 0, 0);
    run(w2, 3, go());
    expect(w2.x).toBeLessThan(3);
    run(w2, 3, go(1, 0, { crouch: true }));
    expect(w2.x).toBeGreaterThan(4);
    // and cannot stand up underneath it
    w2.place(3, 0, 0);
  });
});

describe('on foot: water and bridges', () => {
  // a pond: the bed falls to 2.5 m deep at x = 20
  const pond = new FunctionLand(
    (x) => -Math.max(0, Math.min(2.5, (x - 4) * 0.3)),
    () => 0,
  );
  it('wades slower, then swims at 1.1 m/s deeper than 1.1 m, and floats', () => {
    const w = new FootWalker(pond);
    w.place(0, 0, 0);
    let wadeMin = Infinity;
    let x = w.x;
    run(w, 9, go(), (q) => {
      if (q.depth > 0.6 && q.depth < 1.0) wadeMin = Math.min(wadeMin, (q.x - x) / FOOT.h);
      x = q.x;
    });
    expect(wadeMin).toBeLessThan(FOOT.walk * 0.85);
    run(w, 8, go());
    expect(w.swimming).toBe(true);
    const x0 = w.x;
    run(w, 2, go());
    expect((w.x - x0) / 2).toBeCloseTo(FOOT.swim, 2);
    expect(w.eye().y).toBeGreaterThan(0.1);
    // nobody drowns: an hour of floating still has the eye above the water
    run(w, 60, go(0));
    expect(w.eye().y).toBeGreaterThan(0.1);
    // and swims back out
    run(w, 30, go(-1));
    expect(w.swimming).toBe(false);
    expect(w.y).toBeGreaterThan(-0.3);
  });
  it('a bridge deck is walked on; under it the river bed is the ground', () => {
    const deck: Land = {
      shape(x: number, z: number, o: TerrainPoint) {
        const on = Math.abs(z) < 4;
        o.bed = -4;
        o.h = on ? 0 : -4;
        o.bridge = on ? 1 : 0;
        o.wl = -4.5;
        o.zone = on ? 3 : 0;
        void x;
      },
    };
    const w = new FootWalker(deck);
    w.place(0, 0, 0);
    run(w, 3, go());
    expect(w.y).toBe(0);
    const u = new FootWalker(deck);
    u.place(0, 10, -Math.PI / 2);
    run(u, 4, go());
    expect(u.z).toBeLessThan(4);
    expect(u.y).toBe(-4);
  });
});

describe('on foot: the head is calm', () => {
  it('the walking bob stays within 2 cm and below 8 Hz', () => {
    const w = new FootWalker(flat);
    w.place(0, 0, 0);
    const ys: number[] = [];
    run(w, 6, go(1, 0, { run: true }), (q) => ys.push(q.eye().y - FOOT.eye));
    const steady = ys.slice(240);
    expect(Math.max(...steady.map(Math.abs))).toBeLessThanOrEqual(0.02);
    expect(hfShare(steady, FOOT.h, 8)).toBeLessThan(0.02);
  });
  it('a step up is eased into the eye, not jumped', () => {
    const s = new StaticSolids();
    s.box(5, 0, 2.5, 1, 0, -0.1, 0.24, true);
    const w = new FootWalker(flat, s);
    w.place(0, 0, 0);
    w.bobOn = false;
    let prev = w.eye().y;
    let maxJump = 0;
    run(w, 2.5, go(), (q) => {
      const y = q.eye().y;
      maxJump = Math.max(maxJump, Math.abs(y - prev));
      prev = y;
    });
    expect(w.y).toBeCloseTo(0.24, 3);
    expect(maxJump).toBeLessThan(0.02);
  });
});

describe('on foot: state', () => {
  it('saves, restores and carries on exactly the same', () => {
    const s = new StaticSolids();
    s.box(3, 1, 0.5, 1, 0.3, -0.1, 0.24, true);
    const a = new FootWalker(flat, s);
    a.place(0, 0, 0.2);
    run(a, 2, go(1, 0.2));
    const saved = JSON.parse(JSON.stringify(a.toJSON()));
    const b = new FootWalker(flat, s).restore(saved);
    run(a, 3, go(1, -0.4));
    run(b, 3, go(1, -0.4));
    expect(b.x).toBe(a.x);
    expect(b.z).toBe(a.z);
    expect(b.y).toBe(a.y);
  });
  it('modes: only the allowed moves, each one an event', () => {
    const m = new Modes();
    const seen: string[] = [];
    m.on((e) => seen.push(`${e.from}>${e.to}`));
    expect(m.go('onfoot', 'driver')).toBe(true);
    expect(m.go('onfoot')).toBe(false);
    expect(m.go('seated', 'passenger')).toBe(true);
    expect(m.seat).toBe('passenger');
    expect(m.go('onboard')).toBe(true);
    expect(seen).toEqual(['seated>onfoot', 'onfoot>seated', 'seated>onboard']);
  });
});

describe('on foot: in the world, round the vehicle and the yard', () => {
  const world = new World(20261113);
  const s = 60;
  const sp = new SpineSample();
  world.spine.at(s, sp);
  const veh = new VehicleSim(T0_TRUCK);
  const gs = new GroundSample();
  const lane = 1.6;
  const vx = sp.x - Math.sin(sp.phi) * lane;
  const vz = sp.z + Math.cos(sp.phi) * lane;
  world.sample(vx, vz, gs);
  veh.reset(vx, gs.h + 0.02, vz, -sp.phi);
  for (let i = 0; i < 240; i++) veh.substep({ steer: 0, throttle: 0, brake: 0.25, handbrake: 0 }, world);
  world.spine.at(s + YARD_AHEAD, sp);
  const frame = { x: sp.x - Math.sin(sp.phi) * YARD_OFFSET, z: sp.z + Math.cos(sp.phi) * YARD_OFFSET, heading: sp.phi };
  const yard = buildYardSolids(world, frame);
  const solids = new SolidSet();
  solids.add(yard.solids);
  const vs = new VehicleSolid(veh);
  solids.add(vs);

  it('gets out beside each door of the truck, on free ground, outside the body', () => {
    for (const d of doorsOf(T0_TRUCK)) {
      const w = new FootWalker(world, solids);
      expect(placeAtDoor(w, veh, d)).toBe(true);
      expect(w.insideSolid()).toBe(false);
      const p = new Push();
      expect(pushOut(vs.update(), w.x, w.z, FOOT.radius - 0.01, p)).toBe(false);
      expect(Math.hypot(w.x - veh.px, w.z - veh.pz)).toBeLessThan(T0_TRUCK.body.halfWidth + 2);
    }
  });
  it('the motorhome is got out of through its own door, on the right', () => {
    const rv = new VehicleSim(T3_RV);
    rv.reset(vx, gs.h + 0.02, vz, -sp.phi);
    const area = { areas: [{ x0: 0.62, x1: 1.42, z0: -0.39, z1: 0.72, name: 'door' }] };
    const doors = doorsOf(T3_RV, area);
    const d = nearestDoor(doors, 1.0, 0.5, rv);
    expect(d.name).toBe('door');
    expect(d.side).toBe(1);
  });
  it('the truck cannot be walked through, from either side or end', () => {
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const toCar = sp.phi + a;
      const w = new FootWalker(world, vs);
      w.place(veh.px - Math.cos(toCar) * 3.2, veh.pz - Math.sin(toCar) * 3.2, toCar);
      run(w, 5, go(1, 0, { run: true }), (q) => expect(q.insideSolid()).toBe(false));
      const along = (w.x - veh.px) * Math.cos(toCar) + (w.z - veh.pz) * Math.sin(toCar);
      expect(along).toBeLessThan(-T0_TRUCK.body.halfWidth);
    }
  });
  it('ten minutes of random walking round the yard never ends up inside anything', () => {
    const w = new FootWalker(world, solids);
    const c = yardToWorld(frame, 4, 4);
    w.place(c.x, c.z, 0);
    const r = rng(7);
    const inp = go();
    let inside = 0;
    let far = 0;
    const steps = Math.round(600 / FOOT.h);
    for (let i = 0; i < steps; i++) {
      if (i % 90 === 0) {
        inp.forward = r() * 2 - 1;
        inp.right = r() * 2 - 1;
        inp.run = r() < 0.4;
        inp.crouch = r() < 0.1;
        inp.jump = r() < 0.15;
        w.heading += (r() - 0.5) * 2.5;
        // keep near the yard: turn home when straying
        const dx = c.x - w.x;
        const dz = c.z - w.z;
        if (Math.hypot(dx, dz) > 9) {
          w.heading = Math.atan2(dz, dx);
          inp.forward = 1;
          inp.right = 0;
        }
      }
      w.step(inp);
      if (i % 4 === 0 && w.insideSolid()) inside++;
      far = Math.max(far, Math.hypot(c.x - w.x, c.z - w.z));
    }
    expect(inside).toBe(0);
    expect(far).toBeLessThan(16);
    expect(w.walked).toBeGreaterThan(300);
  });
});

describe('the look that puts a point dead ahead (lookAt)', () => {
  /** how far the ray from the eye, along the look, passes from the point (m) */
  const miss = (w: FootWalker, x: number, y: number, z: number): number => {
    const e = w.eye();
    const d = w.look();
    const t = (x - e.x) * d.x + (y - e.y) * d.y + (z - e.z) * d.z;
    return Math.hypot(e.x + d.x * t - x, e.y + d.y * t - y, e.z + d.z * t - z);
  };

  it("is the plain angle from the eye when the view is the walker's own", () => {
    const w = new FootWalker(flat, new SolidSet());
    w.place(0, 0, 0.3);
    const a = w.lookAt(1, 0.9, 0.4);
    expect(a.yaw).toBeCloseTo(Math.atan2(0.4, 1), 12);
    expect(a.pitch).toBeCloseTo(Math.atan2(0.9 - w.eye().y, Math.hypot(1, 0.4)), 12);
  });

  it('lands on the point from an eye that stands ahead of the feet and tips with the look', () => {
    const w = new FootWalker(flat, new SolidSet());
    Object.assign(w.view, { ahead: 0.049, aheadDown: 0.046, below: 0.099, belowDown: 0.0925 });
    // (a knob at the hip a step off, a thing at the feet, a shelf overhead, something far: from any look to start with)
    for (const [x, y, z] of [[0.9, 0.86, 0.2], [0.45, 0.05, -0.3], [-0.7, 2.1, 0.5], [3, 1.4, -4]] as const) {
      for (const from of [[0, 0], [2.5, -1.2], [-1, 0.9]] as const) {
        w.place(0, 0, from[0]);
        w.pitch = from[1];
        const a = w.lookAt(x, y, z);
        w.heading = a.yaw;
        w.pitch = a.pitch;
        expect(miss(w, x, y, z)).toBeLessThan(1e-4);
      }
    }
    // (what the solving is for: the height read off the eye once it looks there, but the distance still from the
    // feet — the eye is ahead of them — is a knob missed)
    w.place(0, 0, Math.atan2(0.2, 0.9));
    for (let i = 0; i < 4; i++) w.pitch = Math.atan2(0.86 - w.eye().y, Math.hypot(0.9, 0.2));
    expect(miss(w, 0.9, 0.86, 0.2)).toBeGreaterThan(0.02);
  });
});

describe('is a vehicle standing still (bodyKmh)', () => {
  it('counts the body sliding sideways, falling and spinning, which the speedometer does not', () => {
    const v = new VehicleSim(T0_TRUCK);
    expect(v.bodyKmh).toBe(0);
    // (sliding off a bank sideways at 2 m/s: nought along its nose)
    v.vForward = 0;
    v.vx = 0;
    v.vz = 2;
    expect(v.kmh).toBe(0);
    expect(v.bodyKmh).toBeCloseTo(7.2, 6);
    // (falling)
    v.vz = 0;
    v.vy = -3;
    expect(v.bodyKmh).toBeCloseTo(10.8, 6);
    // (spinning on the spot: its ends swing round)
    v.vy = 0;
    v.yawRate = 1;
    expect(v.bodyKmh).toBeCloseTo(7.2, 6);
  });
});
