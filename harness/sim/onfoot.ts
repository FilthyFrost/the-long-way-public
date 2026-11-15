/**
 * Headless measurements of the player base (docs/DESIGN_V2.md 6, 8.1, 5.6) for specs/onfoot/default.json.
 */
import { Picker, UseDriver, type Actor, type Interactable } from '../../src/core/interact/interact';
import { Hands, newPack, take } from '../../src/core/items/carry';
import { Containers } from '../../src/core/items/containers';
import { FuelSources } from '../../src/core/items/fuel';
import { LooseItems } from '../../src/core/items/loose';
import { FunctionLand } from '../../src/core/onfoot/land';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { buildYard, yardToWorld, YARD_AHEAD, YARD_OFFSET } from '../../src/core/onfoot/testbed';
import { doorsOf, placeAtDoor, VehicleSolid } from '../../src/core/onfoot/vehicle';
import { FOOT, FootWalker, type FootInput } from '../../src/core/onfoot/walker';
import { VEHICLES } from '../../src/core/vehicle/spec';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { GroundSample } from '../../src/core/world/ground';
import { SolidSet } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

const flat = new FunctionLand(() => 0);
const go = (o: Partial<FootInput> = {}): FootInput => ({ forward: 1, right: 0, run: false, crouch: false, jump: false, ...o });
const steps = (w: FootWalker, s: number, inp: FootInput, each?: () => void): void => {
  for (let i = 0, n = Math.round(s / FOOT.h); i < n; i++) {
    w.step(inp);
    each?.();
  }
};

function pace(inp: FootInput, land = flat, setup?: (w: FootWalker) => void, x0 = 0): number {
  const w = new FootWalker(land);
  w.place(x0, 0, 0);
  setup?.(w);
  steps(w, 2, inp);
  const a = w.x;
  steps(w, 2, inp);
  return (w.x - a) / 2;
}

function climbs(deg: number): boolean {
  const land = new FunctionLand((x) => Math.max(0, x - 1) * Math.tan((deg * Math.PI) / 180));
  const w = new FootWalker(land);
  w.place(0, 0, 0);
  steps(w, 5, go());
  return w.y > 1.5;
}

function stepsUp(h: number): boolean {
  const s = new StaticSolids();
  s.box(5, 0, 3, 1, 0, -0.1, h, true);
  const w = new FootWalker(flat, s);
  w.place(0, 0, 0);
  steps(w, 2.5, go());
  return Math.abs(w.y - h) < 1e-6;
}

function hfShare(y: number[], f0: number): number {
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
    if (k / (n * FOOT.h) > f0) hi += re * re + im * im;
    else lo += re * re + im * im;
  }
  return hi / Math.max(1e-12, lo + hi);
}

function actor(): Actor & { eye: { x: number; y: number; z: number } } {
  return { id: 'm', hands: new Hands(), pack: newPack(), eye: { x: 0, y: 1.62, z: 0 }, heading: 0 };
}

class Point implements Interactable {
  readonly hold = 0;
  constructor(
    readonly id: string,
    readonly x: number,
    readonly z: number,
    readonly radius = 0.0001,
  ) {}
  aim(o: { x: number; y: number; z: number }): void {
    o.x = this.x;
    o.y = 1.62;
    o.z = this.z;
  }
  prompt(): string {
    return '拿';
  }
  act(): boolean {
    return true;
  }
}

export function collectOnfootMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  m.walk_speed = pace(go());
  m.run_speed = pace(go({ run: true }));
  m.crouch_speed = pace(go({ crouch: true }));
  m.carry_speed = pace(go({ run: true }), flat, (w) => (w.load = 'large'));
  const pond = new FunctionLand((x) => -Math.min(3, Math.max(0, x - 2)), () => 0);
  m.swim_speed = pace(go(), pond, undefined, 8);

  const w = new FootWalker(flat);
  w.place(0, 0, 0);
  w.bobOn = false;
  steps(w, 1, go({ forward: 0 }));
  m.eye_height = w.eye().y;
  steps(w, 1.5, go({ forward: 0, crouch: true }));
  m.eye_crouch = w.eye().y;
  const j = new FootWalker(flat);
  j.place(0, 0, 0);
  let top = 0;
  steps(j, 1.2, go({ forward: 0, jump: true }), () => (top = Math.max(top, j.y)));
  m.jump_height = top;

  let slope = 0;
  for (let d = 30; d <= 50; d += 0.5) if (climbs(d)) slope = d;
  m.slope_climb_max_deg = slope;
  let st = 0;
  for (let h = 0.2; h <= 0.45; h += 0.005) if (stepsUp(h)) st = h;
  m.step_up_max = st;

  // the head while running: largest bob, and the share of its motion above 8 Hz
  const b = new FootWalker(flat);
  b.place(0, 0, 0);
  const ys: number[] = [];
  steps(b, 6, go({ run: true }), () => ys.push(b.eye().y - FOOT.eye));
  const steady = ys.slice(240);
  m.bob_max_cm = Math.max(...steady.map(Math.abs)) * 100;
  m.bob_hf_share = hfShare(steady, 8);

  // walls at speed: how many of 8 dashes ended on the far side of a 0.1 m wall
  const wall = new StaticSolids();
  wall.box(3, 0, 0.05, 2, 0, -0.1, 2.1);
  let through = 0;
  for (const v of [5, 10, 30, 60, 120, 300, 1000, 5000]) {
    const t = new FootWalker(flat, wall);
    t.place(0, 0, 0);
    for (let i = 0; i < 60; i++) {
      t.vx = v;
      t.step(go({ forward: 0 }));
    }
    if (t.x > 3) through++;
  }
  m.wall_tunnel_count = through;

  // ten minutes of random walking round the yard and the truck in the world
  const world = new World(20261113);
  const sp = new SpineSample();
  world.spine.at(60, sp);
  const veh = new VehicleSim(VEHICLES.t0_truck);
  const gs = new GroundSample();
  const vx = sp.x - Math.sin(sp.phi) * 1.6;
  const vz = sp.z + Math.cos(sp.phi) * 1.6;
  world.sample(vx, vz, gs);
  veh.reset(vx, gs.h + 0.02, vz, -sp.phi);
  for (let i = 0; i < 240; i++) veh.substep({ steer: 0, throttle: 0, brake: 0.25, handbrake: 0 }, world);
  world.spine.at(60 + YARD_AHEAD, sp);
  const frame = { x: sp.x - Math.sin(sp.phi) * YARD_OFFSET, z: sp.z + Math.cos(sp.phi) * YARD_OFFSET, heading: sp.phi };
  const reg = { containers: new Containers(), loose: new LooseItems(), fuel: new FuelSources() };
  const yard = buildYard(world, frame, reg);
  const solids = new SolidSet();
  solids.add(yard.solids);
  solids.add(reg.containers);
  solids.add(new VehicleSolid(veh));
  const r = new FootWalker(world, solids);
  const c = yardToWorld(frame, 3, 3);
  r.place(c.x, c.z, 0);
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const inp = go();
  let inside = 0;
  for (let i = 0, n = Math.round(600 / FOOT.h); i < n; i++) {
    if (i % 90 === 0) {
      inp.forward = rnd() * 2 - 1;
      inp.right = rnd() * 2 - 1;
      inp.run = rnd() < 0.4;
      inp.crouch = rnd() < 0.1;
      inp.jump = rnd() < 0.15;
      r.heading += (rnd() - 0.5) * 2.5;
      if (Math.hypot(c.x - r.x, c.z - r.z) > 9) {
        r.heading = Math.atan2(c.z - r.z, c.x - r.x);
        inp.forward = 1;
        inp.right = 0;
      }
    }
    r.step(inp);
    if (i % 4 === 0 && r.insideSolid()) inside++;
  }
  m.random_walk_inside = inside;
  m.random_walk_m = r.walked;

  // getting out of every vehicle beside its doors: on free ground, outside the body
  let badExit = 0;
  for (const spec of Object.values(VEHICLES)) {
    const v = new VehicleSim(spec);
    v.reset(vx, gs.h + 0.02, vz, veh.yaw);
    const vs = new VehicleSolid(v);
    const set = new SolidSet();
    set.add(vs);
    set.add(yard.solids);
    for (const d of doorsOf(spec)) {
      const fw = new FootWalker(world, set);
      if (!placeAtDoor(fw, v, d) || fw.insideSolid()) badExit++;
    }
  }
  m.exit_failures = badExit;

  // the pick: how far and how wide
  const a = actor();
  const pk = new Picker();
  let range = 0;
  for (let d = 1.5; d <= 3; d += 0.01) if (pk.pick({ interactablesNear: (_x, _z, _r, out) => out.push(new Point('p', d, 0)) }, null, a, a.eye, { x: 1, y: 0, z: 0 })) range = d;
  m.pick_range_m = range;
  let cone = 0;
  for (let deg = 0; deg <= 20; deg += 0.1) {
    const dir = { x: Math.cos((deg * Math.PI) / 180), y: 0, z: Math.sin((deg * Math.PI) / 180) };
    if (pk.pick({ interactablesNear: (_x, _z, _r, out) => out.push(new Point('p', 1.5, 0)) }, null, a, a.eye, dir)) cone = deg;
  }
  m.pick_cone_deg = cone;

  // holds and rates
  const dt = 1 / 120;
  const crate = reg.containers.get('yard:crate')!;
  const lidOut: Interactable[] = [];
  reg.containers.interactablesNear(crate.def.x, crate.def.z, 1, lidOut);
  const lid = lidOut.find((i) => i.id === 'yard:crate')!;
  const drv = new UseDriver();
  let t = 0;
  while (!crate.opened && t < 5) {
    drv.update(dt, lid, true, a);
    t += dt;
  }
  m.open_hold_s = t;
  const first = JSON.stringify(crate.store.list());
  const again = new Containers();
  again.add(crate.def).open();
  m.container_reroll_diff = first === JSON.stringify(again.get('yard:crate')!.store.list()) ? 0 : 1;
  // taken things stay taken
  crate.takeAllInto(a);
  const saved = JSON.stringify(reg.containers.toJSON());
  const re = new Containers();
  re.add(crate.def);
  re.load(JSON.parse(saved));
  re.get('yard:crate')!.open();
  m.save_load_diff = JSON.stringify(re.toJSON()[0]) === JSON.stringify(reg.containers.toJSON()[0]) ? 0 : 1;

  const fuel = new FuelSources();
  fuel.add('t', 'tank', 0, 1, 0, 30);
  fuel.add('w', 'wreck', 0, 1, 0, 6);
  for (const [id, key] of [
    ['t', 'siphon_tank_l_per_s'],
    ['w', 'siphon_wreck_l_per_s'],
  ] as const) {
    const p = actor();
    take(p, 'fuel.jerrycan', 1, 0);
    const out: Interactable[] = [];
    fuel.interactablesNear(0, 0, 1, out);
    const tap = out.find((i) => i.id === id)!;
    const d = new UseDriver();
    for (let i = 0; i < 240; i++) d.update(dt, tap, true, p);
    m[key] = p.hands.fill / 2;
  }
  return m;
}
