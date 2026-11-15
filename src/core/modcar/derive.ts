/**
 * From parts to physics (docs/MODCAR.md §4): a frame and whatever is fitted to it become one VehicleSpec
 * for the existing simulation (src/core/vehicle/sim.ts), plus the per-wheel facts the systems hand the
 * simulation through SimMods (grip per surface, rolling resistance, radius differences, steering play).
 *
 * Called again after every fit or removal; VehicleSim.applySpec puts the result in force in place.
 */
import type { AxleSpec, VehicleSpec } from '../vehicle/spec';
import { stockBuild } from './build';
import { frameDef, hubsOf } from './frames';
import { partDef } from './parts';
import type { Build, FrameDef, MountDef, PartDef, PartInstance, V3 } from './types';

const G = 9.81;
export const DRIVER_KG = 75;
export const SURFACE_N = 7;
const FUEL_KG_PER_L: Record<string, number> = { petrol: 0.74, diesel: 0.84, mix2t: 0.75 };
/** a hub with nothing on it: the brake disc and hub carrier drag on the ground */
const BARE_HUB = { radius: 0.09, grip: 0.25, rr: 8 };
/** a flat tyre keeps this share of its sidewall */
const FLAT_SIDEWALL = 0.45;
/** extra drag area for each panel missing on an enclosed body (m²) */
const OPEN_PANEL_DRAG = 0.04;

/** spec fields the physics line adds (docs/MODCAR.md §4, 物理实现说明); ignored by an older simulation */
export type ModAxleSpec = AxleSpec & { wheelRadius?: number };
export type ModVehicleSpec = Omit<VehicleSpec, 'front' | 'rear'> & {
  front: ModAxleSpec;
  rear: ModAxleSpec;
  balance?: { assist: number };
};

export interface DerivedWheel {
  hub: string;
  /** something on the hub */
  present: boolean;
  rim: string | null;
  tire: string | null;
  radius: number;
  width: number;
  /** grip multiplier per surface (tyre × tread × puncture), for SimMods.mu */
  grip: number[];
  /** rolling resistance multiplier, for SimMods.rr */
  rr: number;
  dual: boolean;
  flat: boolean;
}

export interface Derived {
  spec: ModVehicleSpec;
  frame: FrameDef;
  /** in the simulation's wheel order: front left, front right, rear left, rear right (a motorcycle repeats each) */
  wheels: DerivedWheel[];
  mass: number;
  /** centre of gravity in frame model space (at the modelled hub height) */
  cg: V3;
  /** how much higher than modelled the body rides on these wheels (m) */
  lift: number;
  /** each wheel's radius below its axle's mean (m, + = smaller): SimMods.radiusDrop */
  radiusDrop: number[];
  steerPlayRad: number;
  engine: PartDef | null;
  gearbox: PartDef | null;
  fuelTankL: number;
  peakKw: number;
  peakRpm: number;
  peakNm: number;
  drag: number;
  /** how well the sides and the front take a hit (0…1) */
  armor: number;
  ram: number;
  /** 0 open … 1 closed (frame's cabin with its doors fitted) */
  enclosed: number;
}

interface Mass {
  m: number;
  p: V3;
}

/** how high above its mount point a part's own mass sits (m), by category */
const CG_UP: Partial<Record<PartDef['cat'], number>> = {
  engine: 0.3,
  gearbox: 0.12,
  radiator: 0.25,
  battery: 0.1,
  fuelTank: 0.12,
  seat: 0.28,
  door: 0,
  roof: 0.08,
};

function fuelLitres(inst: PartInstance): number {
  const f = inst.fluids.fuel;
  if (!f) return 0;
  return (f.petrol ?? 0) + (f.diesel ?? 0) + (f.mix2t ?? 0);
}

function fuelKg(inst: PartInstance): number {
  const f = inst.fluids.fuel;
  if (!f) return 0;
  let kg = 0;
  for (const [k, l] of Object.entries(f)) kg += (l ?? 0) * (FUEL_KG_PER_L[k] ?? 0.75);
  return kg;
}

/** every mass in the vehicle with where it sits (frame model space): frame, parts, fluids and the driver */
function masses(build: Build, frame: FrameDef, withDriver: boolean): Mass[] {
  const out: Mass[] = [{ m: frame.mass, p: frame.cg }];
  for (const m of frame.mounts) {
    const inst = build.parts[m.id];
    if (!inst) continue;
    const p = partDef(inst.part);
    let kg = p.mass + fuelKg(inst) + (inst.fluids.oilL ?? 0) * 0.9 + (inst.fluids.coolantL ?? 0);
    for (const si of Object.values(inst.sub)) kg += partDef(si.part).mass;
    out.push({ m: kg, p: { x: m.pos.x, y: m.pos.y + (CG_UP[p.cat] ?? 0), z: m.pos.z } });
  }
  if (withDriver) {
    const seat = frame.mounts.find((m) => m.driver) ?? frame.mounts.find((m) => m.cat === 'seat');
    if (seat) out.push({ m: DRIVER_KG, p: { x: seat.pos.x, y: seat.pos.y + 0.38, z: seat.pos.z } });
  }
  return out;
}

export interface MassProps {
  mass: number;
  cg: V3;
  inertia: { roll: number; yaw: number; pitch: number };
}

/** total mass, centre of gravity and principal inertias (point masses + the frame's own inertia) */
export function massProps(build: Build, withDriver = true): MassProps {
  const frame = frameDef(build.frame);
  const list = masses(build, frame, withDriver);
  let M = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const it of list) {
    M += it.m;
    x += it.m * it.p.x;
    y += it.m * it.p.y;
    z += it.m * it.p.z;
  }
  const cg = { x: x / M, y: y / M, z: z / M };
  const I = { roll: frame.inertia.roll, yaw: frame.inertia.yaw, pitch: frame.inertia.pitch };
  for (const it of list) {
    const dx = it.p.x - cg.x;
    const dy = it.p.y - cg.y;
    const dz = it.p.z - cg.z;
    I.roll += it.m * (dy * dy + dz * dz);
    I.yaw += it.m * (dx * dx + dz * dz);
    I.pitch += it.m * (dx * dx + dy * dy);
  }
  // the bare frame's inertia was given about its own centre; the point-mass sum above already moved it
  return { mass: M, cg, inertia: I };
}

/** a wheel on a hub: radius, width and how it grips (with what is on it, or not) */
export function wheelOn(build: Build, hub: MountDef): DerivedWheel {
  const inst = build.parts[hub.id];
  if (!inst) {
    return { hub: hub.id, present: false, rim: null, tire: null, radius: BARE_HUB.radius, width: 0.05, grip: new Array(SURFACE_N).fill(BARE_HUB.grip), rr: BARE_HUB.rr, dual: false, flat: false };
  }
  const rim = partDef(inst.part).rim;
  if (!rim) throw new Error(`${inst.part} is on hub ${hub.id} but is not a rim`);
  const tInst = inst.sub.tire;
  const tire = tInst ? partDef(tInst.part).tire : undefined;
  const dual = rim.dual === true;
  if (!tire) {
    return { hub: hub.id, present: true, rim: inst.part, tire: null, radius: rim.radius, width: rim.width, grip: [...rim.grip], rr: rim.rr, dual, flat: false };
  }
  const flat = tInst?.flat === true;
  const tread = tInst?.tread ?? 1;
  // a bald tyre keeps three quarters of its grip; a flat one rides on its sidewall
  const k = (0.75 + 0.25 * tread) * (flat ? 0.6 : 1);
  return {
    hub: hub.id,
    present: true,
    rim: inst.part,
    tire: tInst?.part ?? null,
    radius: rim.radius + tire.sidewall * (flat ? FLAT_SIDEWALL : 1),
    width: tire.width * (dual ? 1.7 : 1),
    grip: tire.grip.map((g) => g * k),
    rr: tire.rr * (flat ? 3 : 1),
    dual,
    flat,
  };
}

/** the factory build's axle loads of a frame (N): the load its springs were tuned for */
const stockLoadCache = new Map<string, { front: number; rear: number }>();
function stockLoads(frame: FrameDef): { front: number; rear: number } {
  let l = stockLoadCache.get(frame.id);
  if (!l) {
    const mp = massProps(stockBuild(frame.id), true);
    const hubs = hubsOf(frame);
    const xF = (hubs.fl.pos.x + hubs.fr.pos.x) / 2;
    const xR = (hubs.rl.pos.x + hubs.rr.pos.x) / 2;
    const wf = Math.min(0.92, Math.max(0.08, (mp.cg.x - xR) / (xF - xR)));
    l = { front: mp.mass * G * wf, rear: mp.mass * G * (1 - wf) };
    stockLoadCache.set(frame.id, l);
  }
  return l;
}

function lerpCurve(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) {
      const [r0, t0] = curve[i - 1];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the engine's full-load torque with the exhaust's and a spooled turbo's help */
export function boostedCurve(engine: PartDef, exhaust: PartDef | null, turbo: PartDef | null): [number, number][] {
  const e = engine.engine!;
  const ex = exhaust?.exhaust?.torque ?? 1;
  const tb = turbo?.turbo;
  const pts: [number, number][] = [];
  // resample so a turbo's ramp is described by enough points
  const r0 = e.curve[0][0];
  const r1 = e.curve[e.curve.length - 1][0];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const rpm = r0 + ((r1 - r0) * i) / n;
    let t = lerpCurve(e.curve, rpm) * ex;
    if (tb) t *= 1 + (tb.boost - 1) * smooth(tb.spoolRpm, tb.spoolRpm + 1200, rpm);
    pts.push([Math.round(rpm), Math.round(t * 10) / 10]);
  }
  pts[pts.length - 1][1] = 0;
  return pts;
}

/** a placeholder engine curve for a build without an engine (the systems keep it from running) */
const NO_ENGINE_CURVE: [number, number][] = [
  [800, 0],
  [1000, 0],
];

export function derive(build: Build): Derived {
  const frame = frameDef(build.frame);
  const mp = massProps(build, true);
  const M = mp.mass;
  const cg = mp.cg;
  const hubs = hubsOf(frame);
  const order = [hubs.fl, hubs.fr, hubs.rl, hubs.rr];
  const wheels = order.map((h) => wheelOn(build, h));
  const single = frame.balance === true;

  const rF = (wheels[0].radius + wheels[1].radius) / 2;
  const rR = (wheels[2].radius + wheels[3].radius) / 2;
  const radiusDrop = [rF - wheels[0].radius, rF - wheels[1].radius, rR - wheels[2].radius, rR - wheels[3].radius];
  const lift = (rF + rR) / 2 - frame.hubRadius;

  const xF = (hubs.fl.pos.x + hubs.fr.pos.x) / 2;
  const xR = (hubs.rl.pos.x + hubs.rr.pos.x) / 2;
  const wheelbase = xF - xR;
  const wf = Math.min(0.92, Math.max(0.08, (cg.x - xR) / wheelbase));
  const trackF = Math.abs(hubs.fr.pos.z - hubs.fl.pos.z);
  const trackR = Math.abs(hubs.rr.pos.z - hubs.rl.pos.z);

  const at = (id: string): PartDef | null => {
    const i = build.parts[id];
    return i ? partDef(i.part) : null;
  };
  const firstOf = (cat: PartDef['cat']): { def: PartDef; inst: PartInstance } | null => {
    for (const m of frame.mounts) {
      if (m.cat !== cat) continue;
      const inst = build.parts[m.id];
      if (inst) return { def: partDef(inst.part), inst };
    }
    return null;
  };
  const engine = firstOf('engine');
  const gearbox = firstOf('gearbox');
  const exhaust = firstOf('exhaust');
  const steering = firstOf('steering');
  const tank = firstOf('fuelTank');
  const lever = firstOf('gearLever');
  const handbrake = firstOf('handbrake');
  const turbo = engine?.inst.sub.turbo ? partDef(engine.inst.sub.turbo.part) : null;

  // springs: the frame's are tuned for its factory load; a heavier build sinks into the same springs
  const stock = stockLoads(frame);
  const loadF = M * G * wf;
  const loadR = M * G * (1 - wf);
  const hz = (base: number, ref: number, now: number): number => Math.min(3, Math.max(0.7, base * Math.sqrt(ref / Math.max(1, now))));
  const sideF = (wheels[0].width + wheels[1].width) / 2;
  const sideR = (wheels[2].width + wheels[3].width) / 2;
  const wallF = (wheelSidewall(wheels[0]) + wheelSidewall(wheels[1])) / 2;
  const wallR = (wheelSidewall(wheels[2]) + wheelSidewall(wheels[3])) / 2;
  const muScale = (w: number): number => Math.min(1.25, Math.max(0.7, Math.pow(w / 0.175, 0.18)));
  const steerable = steering !== null;
  const axle = (s: FrameDef['suspension']['front'], front: boolean): ModAxleSpec => {
    const hubL = front ? hubs.fl : hubs.rl;
    const hubR = front ? hubs.fr : hubs.rr;
    const wall = front ? wallF : wallR;
    return {
      track: single ? 0 : front ? trackF : trackR,
      springHz: hz(s.springHz, front ? stock.front : stock.rear, front ? loadF : loadR),
      dampingRatio: s.dampingRatio,
      bumpScale: s.bumpScale,
      reboundScale: s.reboundScale,
      travel: s.travel,
      antiRollRatio: s.antiRollRatio,
      muScale: muScale(front ? sideF : sideR),
      slipPeakDeg: s.slipPeakDeg * (0.85 + 1.2 * wall),
      brakeShare: front ? frame.brakeFront : 1 - frame.brakeFront,
      steerable: steerable && (hubL.steer === true || hubR.steer === true),
      driven: hubL.driven === true || hubR.driven === true,
      handbrake: handbrake !== null && (hubL.handbrake === true || hubR.handbrake === true),
      wheelRadius: front ? rF : rR,
    };
  };

  // engine and gearbox (the systems keep a build without either from moving: rules.ts)
  const e = engine?.def.engine;
  const curve = engine ? boostedCurve(engine.def, exhaust?.def ?? null, turbo) : NO_ENGINE_CURVE;
  let peakKw = 0;
  let peakRpm = 0;
  let peakNm = 0;
  for (const [rpm, nm] of curve) {
    const kw = (nm * rpm * 2 * Math.PI) / 60 / 1000;
    if (kw > peakKw) {
      peakKw = kw;
      peakRpm = rpm;
    }
    if (nm > peakNm) peakNm = nm;
  }
  const redline = e?.redline ?? 1000;
  const idle = e?.idle ?? 800;
  const gb = gearbox?.def.gearbox;

  // drag: the frame, every part that sticks out, and open panels of a closed body
  let drag = frame.cdA;
  let armor = 0;
  let ram = 0;
  let openPanels = 0;
  let panelCount = 0;
  for (const m of frame.mounts) {
    const p = at(m.id);
    if (m.cat === 'door' || m.cat === 'hood' || m.cat === 'trunk') {
      panelCount++;
      if (!p) openPanels++;
    }
    if (!p) continue;
    drag += p.panel?.drag ?? p.bumper?.drag ?? p.roof?.drag ?? p.armor?.drag ?? 0;
    armor = Math.max(armor, p.panel?.armor ?? 0, p.armor?.armor ?? 0);
    ram = Math.max(ram, p.bumper?.ram ?? 0, p.roof?.ram ?? 0);
  }
  if (frame.enclosed > 0) drag += openPanels * OPEN_PANEL_DRAG;
  const doors = frame.mounts.filter((m) => m.cat === 'door');
  const doorsOn = doors.filter((m) => build.parts[m.id]).length;
  const enclosed = frame.enclosed * (doors.length ? doorsOn / doors.length : 1);

  // body box (in the CG frame) grows with a ram or a plough
  const bf = at('bumperFront');
  const br = at('bumperRear');
  const frontX = frame.body.front + (bf ? (bf.bumper?.plow ? 0.3 : (bf.bumper?.ram ?? 0) > 0.5 ? 0.22 : 0.05) : 0);
  const rearX = frame.body.rear - (br ? 0.05 : 0);

  // the driver's eye: on the driver's seat, or where it would be
  const seatMount = frame.mounts.find((m) => m.driver) ?? frame.mounts.find((m) => m.cat === 'seat');
  const seat = seatMount ? at(seatMount.id) : null;
  const eyeUp = seat?.seat?.eyeUp ?? 0.7;
  const eyeBack = seat?.seat?.eyeBack ?? 0;
  const eyeModel = seatMount ? { x: seatMount.pos.x - eyeBack, y: seatMount.pos.y + eyeUp, z: seatMount.pos.z } : { x: 0, y: 1.2, z: 0 };

  const st = steering?.def.steering;

  const spec: ModVehicleSpec = {
    id: `modcar:${frame.id}`,
    label: frame.name.zh,
    mass: M,
    wheelbase,
    weightFront: wf,
    cgHeight: cg.y + lift,
    wheelRadius: (rF + rR) / 2,
    inertia: mp.inertia,
    front: axle(frame.suspension.front, true),
    rear: axle(frame.suspension.rear, false),
    tire: { muLat: 0.9, muLong: 0.95, slideRatio: 0.85, loadSens: 0.12, relaxLen: 0.4 + 1.2 * ((wallF + wallR) / 2), minLatUnderLong: 0.3 },
    engine: { curve, idle, stall: Math.max(idle + 700, 0.4 * redline), redline, brakeNm: e?.brakeNm ?? 0 },
    gearbox: {
      ratios: gb ? [...gb.ratios] : [1],
      reverse: gb ? gb.reverse : 0,
      final: frame.finalDrive,
      efficiency: gb?.efficiency ?? 0.9,
      upRpm: [0.5 * redline, 0.93 * redline],
      downRpm: [0.28 * redline, 0.5 * redline],
      shiftTime: (gb?.shiftTime ?? 0.3) * (lever?.def.gearLever?.shift ?? 1),
    },
    brakes: { maxG: Math.min(1.1, Math.max(0.2, frame.brakeN / (M * G))) },
    aero: { cdA: drag },
    steering: {
      maxDeg: frame.steering.maxDeg,
      ratio: st?.ratio ?? 16,
      rateLow: frame.steering.rateLow * (st?.rate ?? 1),
      rateHigh: frame.steering.rateHigh * (st?.rate ?? 1),
      smoothTime: frame.steering.smoothTime,
      returnScale: frame.steering.returnScale,
      ackermann: frame.steering.ackermann,
      gripLimitG: frame.steering.gripLimitG,
      slipMarginDeg: frame.steering.slipMarginDeg,
    },
    body: {
      halfLength: (frontX - rearX) / 2,
      halfWidth: frame.body.halfWidth,
      bottom: frame.body.bottom - cg.y,
      top: frame.body.top - cg.y,
      centerX: (frontX + rearX) / 2 - cg.x,
    },
    eye: { x: eyeModel.x - cg.x, y: eyeModel.y - cg.y, z: eyeModel.z - cg.z },
    fuel: { tankL: tank?.def.fuelTank?.litres ?? 0, lPerKWh: e?.lPerKWh ?? 1.5, idleLph: e?.idleLph ?? 0 },
  };
  if (single) spec.balance = { assist: 1 };

  return {
    spec,
    frame,
    wheels,
    mass: M,
    cg,
    lift,
    radiusDrop,
    steerPlayRad: ((st?.playDeg ?? 0) * Math.PI) / 180,
    engine: engine?.def ?? null,
    gearbox: gearbox?.def ?? null,
    fuelTankL: tank?.def.fuelTank?.litres ?? 0,
    peakKw,
    peakRpm,
    peakNm,
    drag,
    armor,
    ram,
    enclosed,
  };
}

function wheelSidewall(w: DerivedWheel): number {
  if (!w.tire) return 0.02;
  const t = partDef(w.tire).tire;
  return (t?.sidewall ?? 0.12) * (w.flat ? FLAT_SIDEWALL : 1);
}

/** litres of fuel in a build's tank, by type */
export function tankFuel(build: Build): { total: number; petrol: number; diesel: number; mix2t: number } {
  const frame = frameDef(build.frame);
  const m = frame.mounts.find((mm) => mm.cat === 'fuelTank');
  const inst = m ? build.parts[m.id] : undefined;
  const f = inst?.fluids.fuel ?? {};
  const petrol = f.petrol ?? 0;
  const diesel = f.diesel ?? 0;
  const mix2t = f.mix2t ?? 0;
  return { total: petrol + diesel + mix2t, petrol, diesel, mix2t };
}

export { fuelLitres };
