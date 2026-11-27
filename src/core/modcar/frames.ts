/**
 * The ModCar frames (docs/MODCAR.md §2.2): what each bare vehicle weighs, how its suspension, brakes and
 * steering are set up, and where its mounts are. Positions come from the Blender models
 * (data/mounts/<frame>.json, written by tools/blender/frames/<frame>.py — the geometry owns them); the
 * physical numbers live here.
 */
import type { AxleSuspension, Category, FrameDef, FrameRig, MountDef, Text, V3 } from './types';
import { CATEGORIES } from './types';
import { ladderMountOf } from './ladders';
import sedanMounts from './data/mounts/sedan.json';
import pickupMounts from './data/mounts/pickup.json';
import motoMounts from './data/mounts/moto.json';
import rvMounts from './data/mounts/rv.json';
import vanMounts from './data/mounts/van.json';
import turtleMounts from './data/mounts/turtle.json';
import elephantMounts from './data/mounts/elephant.json';
import camelMounts from './data/mounts/camel.json';
import goatMounts from './data/mounts/goat.json';
import wagonMounts from './data/mounts/wagon.json';
import foxMounts from './data/mounts/fox.json';
import snailMounts from './data/mounts/snail.json';
import buffaloMounts from './data/mounts/buffalo.json';
import rhinoMounts from './data/mounts/rhino.json';
import trailerMounts from './data/mounts/trailer.json';

interface MountJson {
  pos: number[];
  quat: number[];
  cat: string;
  side?: number;
  axle?: string;
  steer?: boolean;
  driven?: boolean;
  handbrake?: boolean;
  driver?: boolean;
  fit?: number[];
  panel?: string;
  hinge?: string;
  open_deg?: number;
  /** seats: the floor under the cushion (a seat part's origin is its floor attachment) */
  floor_z?: number;
  /** the frame object the part moves with (FORK) */
  on?: string;
  /** hubs: how far out from the middle the wheel's mounting face is (m) */
  hub_face?: number;
  space_min?: number[];
  space_max?: number[];
}

interface MountTable {
  frame: string;
  mounts: Record<string, MountJson>;
  panels?: Record<string, { hinge_axis: number[]; open_deg: number; glass?: string | null; mount?: string | null }>;
  needles?: Record<string, { axis: number[]; deg_full: number }>;
  wipers?: Record<string, { axis: number[]; sweep_deg: number }>;
  /** pop-up headlamps: each pod's hinge (game frame) and how far it turns up */
  popups?: Record<string, { hinge_pos: number[]; hinge_axis: number[]; open_deg: number; mount?: string; lift?: number[]; bellows?: string; bellows_pos?: number[]; driver?: string }>;
  /** the axles' parts where the frame wants them other than at the axle's middle: a four-by-four's front differential beside the sump, on its propshaft's side (game z) */
  axles?: { front?: { diff_z?: number }; rear?: { diff_z?: number } };
  rig?: {
    fork?: { pivot: number[]; axis: number[]; lower?: { object: string; axis: number[]; travel: number } };
    shocks?: Record<string, { upper: string; lower: string; upper_eye: number[]; lower_eye: number[] }>;
    swingarm?: { pivot: number[]; axis: number[]; length?: number };
    stand?: { pivot: number[]; axis: number[]; fold_deg: number };
  };
}

const v3 = (a: number[]): [number, number, number] => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];

/** the moving pieces of a modelled frame (a placeholder table has none) */
function readRig(t: MountTable): FrameRig | undefined {
  if (!t.panels && !t.needles && !t.wipers && !t.rig && !t.popups) return undefined;
  const rig: FrameRig = { panels: {}, needles: {}, wipers: {} };
  const r = t.rig;
  if (r?.fork) rig.fork = { pivot: v3(r.fork.pivot), axis: v3(r.fork.axis), lower: r.fork.lower ? { object: r.fork.lower.object, axis: v3(r.fork.lower.axis), travel: r.fork.lower.travel } : undefined };
  if (r?.shocks) rig.shocks = Object.values(r.shocks).map((k) => ({ upper: k.upper, lower: k.lower, upperEye: v3(k.upper_eye), lowerEye: v3(k.lower_eye) }));
  if (r?.swingarm) rig.swingarm = { pivot: v3(r.swingarm.pivot), axis: v3(r.swingarm.axis), length: r.swingarm.length ?? 0.5 };
  if (r?.stand) rig.stand = { pivot: v3(r.stand.pivot), axis: v3(r.stand.axis), foldDeg: r.stand.fold_deg };
  for (const [k, p] of Object.entries(t.panels ?? {})) rig.panels[k] = { axis: v3(p.hinge_axis), openDeg: p.open_deg, glass: p.glass ?? null, mount: p.mount ?? null };
  for (const [k, n] of Object.entries(t.needles ?? {})) rig.needles[k] = { axis: v3(n.axis), fullDeg: n.deg_full };
  for (const [k, w] of Object.entries(t.wipers ?? {})) rig.wipers[k] = { axis: v3(w.axis), sweepDeg: w.sweep_deg };
  if (t.popups)
    rig.popups = Object.fromEntries(
      Object.entries(t.popups).map(([k, p]) => [
        k,
        { pivot: v3(p.hinge_pos), axis: v3(p.hinge_axis), openDeg: p.open_deg, ...(p.lift ? { lift: v3(p.lift) } : {}), ...(p.bellows ? { bellows: p.bellows, bellowsPos: v3(p.bellows_pos ?? p.hinge_pos) } : {}), driver: p.driver === 'roof' ? 'roof' : 'lamps' },
      ]),
    );
  return rig;
}

const SIDE_LABEL: Record<string, Text> = {
  FL: { zh: '左前', en: 'front left' },
  FR: { zh: '右前', en: 'front right' },
  RL: { zh: '左后', en: 'rear left' },
  RR: { zh: '右后', en: 'rear right' },
  F: { zh: '前', en: 'front' },
  R: { zh: '后', en: 'rear' },
  L: { zh: '左', en: 'left' },
};
export const CAT_LABEL: Record<Category, Text> = {
  engine: { zh: '发动机', en: 'engine' },
  gearbox: { zh: '变速箱', en: 'gearbox' },
  radiator: { zh: '散热器', en: 'radiator' },
  battery: { zh: '电瓶', en: 'battery' },
  fuelTank: { zh: '油箱', en: 'fuel tank' },
  exhaust: { zh: '排气', en: 'exhaust' },
  turbo: { zh: '涡轮', en: 'turbo' },
  rim: { zh: '车轮', en: 'wheel' },
  tire: { zh: '轮胎', en: 'tyre' },
  suspension: { zh: '悬挂', en: 'suspension' },
  brakes: { zh: '刹车', en: 'brakes' },
  diff: { zh: '差速器', en: 'differential' },
  steering: { zh: '方向盘', en: 'steering' },
  seat: { zh: '座椅', en: 'seat' },
  door: { zh: '车门', en: 'door' },
  hood: { zh: '引擎盖', en: 'bonnet' },
  trunk: { zh: '尾箱', en: 'boot' },
  bumperFront: { zh: '前杠', en: 'front bumper' },
  bumperRear: { zh: '后杠', en: 'rear bumper' },
  headlight: { zh: '大灯', en: 'headlamp' },
  taillight: { zh: '尾灯', en: 'tail lamp' },
  mirror: { zh: '后视镜', en: 'mirror' },
  roof: { zh: '车顶', en: 'roof' },
  armor: { zh: '侧装甲', en: 'side armour' },
  horn: { zh: '喇叭', en: 'horn' },
  radio: { zh: '收音机', en: 'radio' },
  handbrake: { zh: '手刹', en: 'handbrake' },
  gearLever: { zh: '挡杆', en: 'gear lever' },
  ignition: { zh: '点火开关', en: 'ignition' },
  hitch: { zh: '挂钩', en: 'tow hitch' },
  ladder: { zh: '梯子', en: 'ladder' },
  houseBattery: { zh: '生活电瓶', en: 'house battery' },
};
const SEAT_LABEL: Record<string, Text> = {
  seat_driver: { zh: '驾驶座', en: "driver's seat" },
  seat_pass: { zh: '副驾座', en: 'passenger seat' },
  seat_rear: { zh: '后排座', en: 'rear seat' },
};

/** "左前车轮" / "front left wheel" from the mount id and its category (a mount to one side: its R is the right, not the rear) */
function labelFor(id: string, cat: Category, side = 0): Text {
  if (SEAT_LABEL[id]) return SEAT_LABEL[id];
  const c = CAT_LABEL[cat];
  const tail = id.includes('_') ? id.slice(id.lastIndexOf('_') + 1) : '';
  const s = tail === 'side' ? { zh: '侧', en: 'side' } : tail === 'R' && side !== 0 ? { zh: '右', en: 'right' } : SIDE_LABEL[tail];
  return s ? { zh: s.zh + c.zh, en: `${s.en} ${c.en}` } : c;
}

function readMounts(t: MountTable): MountDef[] {
  const out: MountDef[] = [];
  for (const [id, m] of Object.entries(t.mounts)) {
    if (!(CATEGORIES as readonly string[]).includes(m.cat)) throw new Error(`frame ${t.frame}: mount ${id} has unknown category "${m.cat}"`);
    const cat = m.cat as Category;
    const side = (m.side ?? 0) < 0 ? -1 : (m.side ?? 0) > 0 ? 1 : 0;
    out.push({
      id,
      cat,
      // a seat stands on the floor (its part's origin), whatever height the frame marks its cushion at
      pos: { x: m.pos[0], y: cat === 'seat' && m.floor_z !== undefined ? m.floor_z : m.pos[1], z: m.pos[2] },
      quat: [m.quat[0] ?? 0, m.quat[1] ?? 0, m.quat[2] ?? 0, m.quat[3] ?? 1],
      side,
      label: labelFor(id, cat, side),
      axle: m.axle === 'front' || m.axle === 'rear' ? m.axle : undefined,
      steer: m.steer,
      driven: m.driven,
      handbrake: m.handbrake,
      driver: m.driver,
      fit: m.fit && m.fit.length === 3 ? [m.fit[0], m.fit[1], m.fit[2]] : undefined,
      panel: m.panel,
      hinge: m.hinge === 'y' || m.hinge === 'z' ? m.hinge : undefined,
      openDeg: m.open_deg,
      on: m.on,
      hubFace: m.hub_face,
      // (the files are in Blender's axes: x forward, y left, z up)
      room: m.space_min && m.space_max ? { min: { x: m.space_min[0], y: m.space_min[2], z: -m.space_max[1] }, max: { x: m.space_max[0], y: m.space_max[2], z: -m.space_min[1] } } : undefined,
    });
  }
  return out;
}

/** an axle's strut: its lower eye this far above the hub's centre, this far in from the hub's face (m) */
const STRUT_UP = 0.05;
const STRUT_IN = 0.2;
/** a disc's outer face this far in from the hub's face (m) */
const DISC_IN = 0.012;
/** a motorcycle's discs: this far beside the middle of the wheel (the front's on the left, the rear's on the right) */
const MOTO_DISC = 0.065;

/**
 * The axles' parts (docs/MODCAR.md §22): each axle's suspension and brakes — a strut inside each wheel, a disc behind
 * each hub's face, riding with the wheel — and the driven axle's differential at its middle. The frame models own
 * their hubs; these mounts are placed on them. A motorcycle's fork and shocks are its frame's: it has its brakes only.
 */
function withAxles(mounts: MountDef[], axles?: MountTable['axles']): MountDef[] {
  const out = [...mounts];
  const hubs = mounts.filter((m) => m.cat === 'rim');
  const gearbox = mounts.find((m) => m.cat === 'gearbox');
  for (const axle of ['front', 'rear'] as const) {
    const ends = hubs.filter((h) => h.axle === axle);
    if (!ends.length) continue;
    const k = axle === 'front' ? 'F' : 'R';
    const x = ends.reduce((a, h) => a + h.pos.x, 0) / ends.length;
    const y = ends.reduce((a, h) => a + h.pos.y, 0) / ends.length;
    // (from the wheels' mounting faces: a dual wheel's mount is between its tyres, its face further in)
    const half = ends.reduce((a, h) => a + (h.hubFace ?? Math.abs(h.pos.z)), 0) / ends.length;
    const mk = (cat: Category, id: string, pos: V3, more: Partial<MountDef> = {}): MountDef => ({ id, cat, pos, quat: [0, 0, 0, 1], side: 0, label: labelFor(id, cat), axle, on: ends[0].on, ...more });
    if (ends.length >= 2) {
      out.push(mk('suspension', `susp_${k}`, { x, y: y + STRUT_UP, z: 0 }, { pair: half - STRUT_IN }));
      out.push(mk('brakes', `brakes_${k}`, { x, y, z: 0 }, { pair: half - DISC_IN }));
      // (its pinion towards the gearbox: a four-by-four's front one faces back, to the transfer box)
      if (ends.some((h) => h.driven)) out.push(mk('diff', `diff_${k}`, { x, y, z: axles?.[axle]?.diff_z ?? 0 }, gearbox && gearbox.pos.x < x ? { quat: [0, 1, 0, 0] } : {}));
    } else {
      const side = axle === 'front' ? -1 : 1;
      out.push(mk('brakes', `brakes_${k}`, { x, y, z: side * MOTO_DISC }, { side }));
    }
  }
  return out;
}

const susp = (springHz: number, travel: number, antiRollRatio: number, slipPeakDeg: number, dampingRatio = 0.33): AxleSuspension => ({
  springHz,
  dampingRatio,
  bumpScale: 0.7,
  reboundScale: 1.3,
  travel,
  antiRollRatio,
  slipPeakDeg,
});

export const SEDAN: FrameDef = {
  id: 'sedan',
  kind: 'sedan',
  name: { zh: '方糖', en: 'Sugar Cube' },
  mass: 470,
  cg: { x: 0.05, y: 0.5, z: 0 },
  inertia: { roll: 200, yaw: 820, pitch: 780 },
  hubRadius: 0.285,
  suspension: { front: susp(1.45, 0.2, 0.55, 9.5), rear: susp(1.55, 0.19, 0.3, 8.5) },
  steering: { maxDeg: 36, ackermann: 0.8, rateLow: 1.9, rateHigh: 0.75, smoothTime: 0.09, returnScale: 1.6, gripLimitG: 0.75, slipMarginDeg: 6 },
  brakeN: 7900,
  brakeFront: 0.68,
  cdA: 0.83,
  finalDrive: 4.3,
  // (the body sits 2 cm lower over its wheels than it first did: the frame model's stance)
  body: { front: 2.02, rear: -2.02, halfWidth: 0.8, bottom: 0.16, top: 1.4 },
  enclosed: 1,
  chase: { dist: 5.6, height: 1.9, look: 0.9 },
  // (her eyes where a woman of her height sits, 0.73 m over the cushion, the seats 3 cm lower on their runners: the
  // headliner 0.17 m over them, the windscreen's top 11 deg over the level line — Nomad Drive's driver's view)
  cabView: { back: 0, up: 0.145 },
  mounts: withAxles(readMounts(sedanMounts as MountTable), (sedanMounts as MountTable).axles),
  rig: readRig(sedanMounts as MountTable),
};

export const PICKUP: FrameDef = {
  id: 'pickup',
  kind: 'pickup',
  name: { zh: '骡子', en: 'Mule' },
  mass: 700,
  cg: { x: 0.2, y: 0.58, z: 0 },
  inertia: { roll: 290, yaw: 1450, pitch: 1400 },
  hubRadius: 0.34,
  suspension: { front: susp(1.35, 0.22, 0.5, 10), rear: susp(1.5, 0.24, 0.25, 9) },
  steering: { maxDeg: 34, ackermann: 0.8, rateLow: 1.7, rateHigh: 0.65, smoothTime: 0.1, returnScale: 1.5, gripLimitG: 0.7, slipMarginDeg: 6 },
  brakeN: 10000,
  brakeFront: 0.7,
  cdA: 1.25,
  finalDrive: 4.3,
  body: { front: 2.3, rear: -2.3, halfWidth: 0.84, bottom: 0.2, top: 1.6 },
  enclosed: 1,
  chase: { dist: 6.2, height: 2.1, look: 1.0 },
  // (her eyes 0.73 m over the cushion — a woman's sitting height — the seats 2.5 cm lower on their runners, the view
  // 5 cm further back: the raised instrument hood's dials 30 deg down)
  cabView: { back: 0.3, up: 0.145 },
  mounts: withAxles(readMounts(pickupMounts as MountTable), (pickupMounts as MountTable).axles),
  rig: readRig(pickupMounts as MountTable),
  bare: ['seat_rear'],
};

export const MOTO: FrameDef = {
  id: 'moto',
  kind: 'moto',
  name: { zh: '燕子', en: 'Swallow' },
  mass: 70,
  cg: { x: 0.0, y: 0.5, z: 0 },
  inertia: { roll: 12, yaw: 40, pitch: 42 },
  hubRadius: 0.31,
  suspension: { front: susp(1.6, 0.14, 0, 12, 0.38), rear: susp(1.8, 0.12, 0, 11, 0.38) },
  steering: { maxDeg: 32, ackermann: 0, rateLow: 2.6, rateHigh: 1.1, smoothTime: 0.07, returnScale: 1.8, gripLimitG: 0.85, slipMarginDeg: 5 },
  brakeN: 2100,
  brakeFront: 0.65,
  cdA: 0.6,
  finalDrive: 7,
  body: { front: 1.05, rear: -1.05, halfWidth: 0.3, bottom: 0.25, top: 1.1 },
  enclosed: 0,
  balance: true,
  chase: { dist: 4.2, height: 1.6, look: 0.9 },
  cabView: { back: 0.25, up: 0.13 },
  mounts: withAxles(readMounts(motoMounts as MountTable), (motoMounts as MountTable).axles),
  rig: readRig(motoMounts as MountTable),
};

export const RV: FrameDef = {
  id: 'rv',
  kind: 'rv',
  name: { zh: '鲸鱼', en: 'Whale' },
  // (8.0 m long since docs/V3/plan/finish.md §18 — 0.75 m more between the axles, 0.45 m more behind the rear one —
  // and heavier by as much; its centre of mass back with the longer tail)
  mass: 3050,
  cg: { x: -0.7, y: 1.05, z: 0 },
  inertia: { roll: 3050, yaw: 21000, pitch: 20300 },
  hubRadius: 0.39,
  suspension: { front: susp(1.2, 0.2, 0.6, 11), rear: susp(1.25, 0.2, 0.45, 10) },
  steering: { maxDeg: 38, ackermann: 0.85, rateLow: 1.4, rateHigh: 0.5, smoothTime: 0.12, returnScale: 1.4, gripLimitG: 0.6, slipMarginDeg: 6 },
  brakeN: 21800,
  brakeFront: 0.62,
  cdA: 4.2,
  finalDrive: 4.1,
  body: { front: 2.85, rear: -5.2, halfWidth: 1.12, bottom: 0.3, top: 3.05 },
  enclosed: 1,
  chase: { dist: 11.8, height: 3.2, look: 1.6 },
  // (her eye 0.75 m over the cushion, a normal sitting posture — the player's choice of 2026-11-26: it sat 0.6 over it)
  cabView: { back: 0.25, up: 0.15 },
  mounts: withAxles(readMounts(rvMounts as MountTable), (rvMounts as MountTable).axles),
  rig: readRig(rvMounts as MountTable),
};

export const VAN: FrameDef = {
  id: 'van',
  kind: 'van',
  name: { zh: '面包', en: 'Loaf' },
  mass: 700,
  cg: { x: -0.05, y: 0.85, z: 0 },
  inertia: { roll: 400, yaw: 1500, pitch: 1550 },
  hubRadius: 0.32,
  // (a bus with its engine over the rear axle: soft, rolling, the front held up by its bar)
  suspension: { front: susp(1.2, 0.2, 0.85, 10.5, 0.3), rear: susp(1.3, 0.2, 0.45, 9, 0.3) },
  steering: { maxDeg: 36, ackermann: 0.8, rateLow: 1.6, rateHigh: 0.6, smoothTime: 0.11, returnScale: 1.6, gripLimitG: 0.62, slipMarginDeg: 6 },
  brakeN: 10500,
  brakeFront: 0.6,
  cdA: 1.6,
  finalDrive: 4.86,
  body: { front: 2.0, rear: -2.22, halfWidth: 0.85, bottom: 0.32, top: 1.96 },
  enclosed: 1,
  chase: { dist: 6.8, height: 2.5, look: 1.2 },
  // (her eye 0.75 m over the cushion, a normal sitting posture — the player's choice of 2026-11-26: it sat 0.6 over it)
  cabView: { back: 0.25, up: 0.15 },
  mounts: withAxles(readMounts(vanMounts as MountTable), (vanMounts as MountTable).axles),
  rig: readRig(vanMounts as MountTable),
};

/**
 * The Turtle (海龟): a camper van (docs/V3/plan/rv.md, R1) on the Loaf's way of building, longer and wider, its nose
 * round, its roof an elevating shell (POPUP_roof: up only standing, the engine off; one stands up in the room under it,
 * and it must be down to drive); its room an empty shell since docs/V3/plan/finish.md §十九 step 7, as Nomad Drive's
 * camper van's — the floor, a deck over the rear axle and the engine's behind it; what one lives with the player puts in.
 * The Loaf's engine at the back, its running gear; a little heavier for the furniture it was built with. 5.7 m by 2.2
 * since docs/V3/plan/finish.md §18 (0.9 m longer between the axles, 0.3 m wider: its track too).
 */
export const TURTLE: FrameDef = {
  id: 'turtle',
  kind: 'rv',
  name: { zh: '海龟', en: 'Turtle' },
  // (heavier for its new length and width, its centre back with the room; its yaw inertia that of its ends, the cab and
  // the engine — braked with one side on snow it holds its line as it did, harness/sim/f3_stability.test.ts)
  mass: 1100,
  cg: { x: -0.46, y: 0.9, z: 0 },
  inertia: { roll: 860, yaw: 4400, pitch: 4500 },
  hubRadius: 0.32,
  suspension: { front: susp(1.25, 0.2, 0.85, 10.5, 0.3), rear: susp(1.35, 0.2, 0.45, 9, 0.3) },
  steering: { maxDeg: 36, ackermann: 0.8, rateLow: 1.6, rateHigh: 0.6, smoothTime: 0.11, returnScale: 1.6, gripLimitG: 0.62, slipMarginDeg: 6 },
  brakeN: 15200,
  brakeFront: 0.62,
  cdA: 1.9,
  finalDrive: 4.86,
  body: { front: 2.3, rear: -3.32, halfWidth: 1.07, bottom: 0.32, top: 2.12 },
  enclosed: 1,
  chase: { dist: 8.5, height: 2.6, look: 1.25 },
  // (her eye 0.75 m over the cushion, a normal sitting posture — the player's choice of 2026-11-26: it sat 0.6 over it)
  cabView: { back: 0.22, up: 0.15 },
  mounts: withAxles(readMounts(turtleMounts as MountTable), (turtleMounts as MountTable).axles),
  rig: readRig(turtleMounts as MountTable),
};

/**
 * The Old Elephant (老象): a flat-fronted 1986 motorhome (docs/V3/plan/rv.md, R2) on the Loaf's and the Turtle's way of
 * building, 9.8 m by 2.4 (8.3 m until docs/V3/plan/finish.md §18 added 1.5 m between the dinette and the cab): the driver's seat at the front of the room (turn round from it and one is in the living
 * room), the entry door on the right, its petrol V8 at the back under a deck (a pusher), duals at the back. Its room an
 * empty shell since docs/V3/plan/finish.md §十九 step 7, as Nomad Drive's campers are — found with nothing in it: what one
 * lives with the player puts in. Heavy, slow and thirsty; its long wheelbase turns wide. Its house battery (生活电瓶) on
 * the floor by the left wall.
 */
export const ELEPHANT: FrameDef = {
  id: 'elephant',
  kind: 'rv',
  name: { zh: '老象', en: 'Old Elephant' },
  mass: 5300,
  cg: { x: -1.05, y: 1.25, z: 0 },
  inertia: { roll: 5600, yaw: 54300, pitch: 53300 },
  hubRadius: 0.39,
  // (a coach on soft springs: it leans in the bends and pitches over the bumps, slow to settle)
  suspension: { front: susp(1.15, 0.2, 0.62, 11, 0.34), rear: susp(1.25, 0.2, 0.45, 10, 0.34) },
  steering: { maxDeg: 42, ackermann: 0.85, rateLow: 1.3, rateHigh: 0.45, smoothTime: 0.13, returnScale: 1.3, gripLimitG: 0.56, slipMarginDeg: 6 },
  brakeN: 34000,
  brakeFront: 0.62,
  cdA: 5.9,
  finalDrive: 4.56,
  body: { front: 4.1, rear: -5.62, halfWidth: 1.2, bottom: 0.5, top: 3.12 },
  enclosed: 1,
  chase: { dist: 14.7, height: 3.9, look: 1.9 },
  // (her eye 0.75 m over the cushion, a normal sitting posture — the player's choice of 2026-11-26: it sat 0.6 over it)
  cabView: { back: 0.22, up: 0.15 },
  mounts: withAxles(readMounts(elephantMounts as MountTable), (elephantMounts as MountTable).axles),
  rig: readRig(elephantMounts as MountTable),
};

/**
 * The Camel (骆驼): a school bus made a motorhome (docs/V3/plan/rv.md, R3) — the Elephant's way of building for its long
 * box, its hood a shell of its own in front with the engine and the front wheels under it: 10.6 m by 2.4 (9.5 until its back grew by 1.1 m, docs/V3/plan/finish.md §18), yellow with its
 * roof white, black rub rails, a row of windows down both sides, the entry door behind the cowl on the right, the
 * emergency door in the tail. Found emptied: the floor, the walls, the windows, the driver's seat — the beds, the
 * cupboards, the stove are found by the road and put in. A diesel six; heavy and slow; its roof a deck for a long rack,
 * its ladder up the left side at the back.
 */
export const CAMEL: FrameDef = {
  id: 'camel',
  kind: 'rv',
  name: { zh: '骆驼', en: 'Camel' },
  mass: 5800,
  cg: { x: -0.9, y: 1.15, z: 0 },
  inertia: { roll: 6000, yaw: 65200, pitch: 63800 },
  hubRadius: 0.39,
  // (a bus on leaf springs: it rolls in the bends and pitches over the bumps, slow to settle)
  suspension: { front: susp(1.25, 0.2, 0.6, 11, 0.36), rear: susp(1.35, 0.2, 0.45, 10, 0.36) },
  steering: { maxDeg: 44, ackermann: 0.85, rateLow: 1.25, rateHigh: 0.45, smoothTime: 0.14, returnScale: 1.3, gripLimitG: 0.55, slipMarginDeg: 6 },
  brakeN: 38000,
  brakeFront: 0.6,
  cdA: 6.2,
  finalDrive: 3.9,
  body: { front: 4.46, rear: -6.16, halfWidth: 1.22, bottom: 0.48, top: 3.05 },
  enclosed: 1,
  chase: { dist: 15.6, height: 4.2, look: 2.0 },
  // (her eye 0.75 m over the cushion, a normal sitting posture — the player's choice of 2026-11-26: it sat 0.6 over it)
  cabView: { back: 0.25, up: 0.15 },
  mounts: withAxles(readMounts(camelMounts as MountTable), (camelMounts as MountTable).axles),
  rig: readRig(camelMounts as MountTable),
  // (emptied: the seat behind the entry door gone with the rest)
  bare: ['seat_pass'],
};

export const GOAT: FrameDef = {
  id: 'goat',
  kind: 'offroad',
  name: { zh: '山羊', en: 'Goat' },
  mass: 1250,
  cg: { x: -0.15, y: 0.78, z: 0 },
  inertia: { roll: 620, yaw: 2450, pitch: 2400 },
  hubRadius: 0.37,
  // (four driven wheels on long springs: it climbs, it leans)
  suspension: { front: susp(1.3, 0.26, 0.7, 10.5, 0.36), rear: susp(1.4, 0.27, 0.35, 9.5, 0.36) },
  steering: { maxDeg: 35, ackermann: 0.8, rateLow: 1.8, rateHigh: 0.65, smoothTime: 0.1, returnScale: 1.6, gripLimitG: 0.68, slipMarginDeg: 6 },
  brakeN: 13700,
  brakeFront: 0.66,
  cdA: 1.62,
  finalDrive: 4.1,
  body: { front: 2.21, rear: -2.22, halfWidth: 0.92, bottom: 0.2, top: 1.84 },
  enclosed: 1,
  chase: { dist: 6.4, height: 2.3, look: 1.1 },
  // (her eyes 0.73 m over the cushion — a woman's sitting height — the front seats 2.5 cm lower on their runners, the
  // view about where her eyes are leaning against the seat's back)
  cabView: { back: 0.35, up: 0.145 },
  mounts: withAxles(readMounts(goatMounts as MountTable), (goatMounts as MountTable).axles),
  rig: readRig(goatMounts as MountTable),
};

export const WAGON: FrameDef = {
  id: 'wagon',
  kind: 'wagon',
  name: { zh: '旅人', en: 'Wanderer' },
  mass: 770,
  cg: { x: -0.2, y: 0.55, z: 0 },
  inertia: { roll: 300, yaw: 1500, pitch: 1450 },
  hubRadius: 0.285,
  // (a long, soft family car: it floats over the long waves and sits down at the back when it is loaded)
  suspension: { front: susp(1.3, 0.21, 0.55, 9.5), rear: susp(1.35, 0.21, 0.3, 8.5) },
  steering: { maxDeg: 36, ackermann: 0.8, rateLow: 1.8, rateHigh: 0.7, smoothTime: 0.1, returnScale: 1.6, gripLimitG: 0.72, slipMarginDeg: 6 },
  brakeN: 11600,
  brakeFront: 0.66,
  cdA: 0.9,
  finalDrive: 3.9,
  body: { front: 2.24, rear: -2.6, halfWidth: 0.86, bottom: 0.16, top: 1.44 },
  enclosed: 1,
  chase: { dist: 6.2, height: 2.0, look: 0.9 },
  // (her eyes 0.73 m over the cushion, the seats 3 cm lower on their runners: as the Sugar Cube's, the same cab)
  cabView: { back: 0, up: 0.145 },
  mounts: withAxles(readMounts(wagonMounts as MountTable), (wagonMounts as MountTable).axles),
  rig: readRig(wagonMounts as MountTable),
};

export const FOX: FrameDef = {
  id: 'fox',
  kind: 'sports',
  name: { zh: '狐狸', en: 'Fox' },
  mass: 560,
  cg: { x: -0.05, y: 0.42, z: 0 },
  inertia: { roll: 170, yaw: 820, pitch: 780 },
  hubRadius: 0.265,
  // (low, light and stiff: it turns in at once and tells you what the tyres are doing)
  suspension: { front: susp(1.75, 0.15, 0.6, 8), rear: susp(1.85, 0.15, 0.4, 7.5) },
  steering: { maxDeg: 33, ackermann: 0.8, rateLow: 2.3, rateHigh: 0.95, smoothTime: 0.07, returnScale: 1.8, gripLimitG: 0.9, slipMarginDeg: 5 },
  brakeN: 8800,
  brakeFront: 0.64,
  cdA: 0.62,
  finalDrive: 4.1,
  body: { front: 2.06, rear: -2.06, halfWidth: 0.82, bottom: 0.11, top: 1.235 },
  enclosed: 1,
  chase: { dist: 5.2, height: 1.7, look: 0.8 },
  // (her eyes 0.65 m over the cushion — a sports car's reclined sitting height — the seats 4.5 cm lower in wells in
  // the floor: 0.15 m from her eyes to the low roof's headliner)
  cabView: { back: 0, up: 0.065 },
  mounts: withAxles(readMounts(foxMounts as MountTable), (foxMounts as MountTable).axles),
  rig: readRig(foxMounts as MountTable),
};

export const SNAIL: FrameDef = {
  id: 'snail',
  kind: 'truck',
  name: { zh: '蜗牛', en: 'Snail' },
  mass: 1650,
  cg: { x: 0.25, y: 1.0, z: 0 },
  inertia: { roll: 1300, yaw: 5500, pitch: 5300 },
  hubRadius: 0.343,
  // (a light truck on stiff springs: it rides hard empty and sits down under a load)
  suspension: { front: susp(1.45, 0.18, 0.6, 10, 0.35), rear: susp(1.65, 0.18, 0.35, 9.5, 0.35) },
  steering: { maxDeg: 38, ackermann: 0.85, rateLow: 1.5, rateHigh: 0.55, smoothTime: 0.12, returnScale: 1.5, gripLimitG: 0.6, slipMarginDeg: 6 },
  brakeN: 16500,
  brakeFront: 0.6,
  cdA: 3.2,
  finalDrive: 5.1,
  // (its box 15 cm higher since docs/V3/plan/finish.md §十一 1: 1.9 m clear inside, a room one walks into)
  body: { front: 2.55, rear: -2.52, halfWidth: 0.95, bottom: 0.3, top: 2.9 },
  enclosed: 1,
  chase: { dist: 8.5, height: 3.1, look: 1.5 },
  cabView: { back: 0, up: 0.17 },
  mounts: withAxles(readMounts(snailMounts as MountTable), (snailMounts as MountTable).axles),
  rig: readRig(snailMounts as MountTable),
};

export const BUFFALO: FrameDef = {
  id: 'buffalo',
  kind: 'pickup',
  name: { zh: '水牛', en: 'Buffalo' },
  mass: 1150,
  cg: { x: -0.2, y: 0.62, z: 0 },
  inertia: { roll: 560, yaw: 2700, pitch: 2650 },
  hubRadius: 0.333,
  // (a four-door pick-up on a ladder frame, all four wheels driven: it pulls, it climbs, it takes its time to turn)
  suspension: { front: susp(1.3, 0.24, 0.65, 10.5, 0.35), rear: susp(1.45, 0.25, 0.3, 9.5, 0.35) },
  steering: { maxDeg: 35, ackermann: 0.8, rateLow: 1.7, rateHigh: 0.62, smoothTime: 0.1, returnScale: 1.5, gripLimitG: 0.68, slipMarginDeg: 6 },
  brakeN: 15000,
  brakeFront: 0.66,
  cdA: 1.45,
  finalDrive: 3.73,
  body: { front: 2.45, rear: -2.48, halfWidth: 0.9, bottom: 0.18, top: 1.96 },
  enclosed: 1,
  chase: { dist: 7.0, height: 2.4, look: 1.1 },
  cabView: { back: 0.3, up: 0.11 },
  mounts: withAxles(readMounts(buffaloMounts as MountTable), (buffaloMounts as MountTable).axles),
  rig: readRig(buffaloMounts as MountTable),
};

export const RHINO: FrameDef = {
  id: 'rhino',
  kind: 'truck',
  name: { zh: '犀牛', en: 'Rhino' },
  mass: 3000,
  cg: { x: -0.35, y: 1.0, z: 0 },
  inertia: { roll: 2500, yaw: 11500, pitch: 11200 },
  hubRadius: 0.41,
  // (an expedition truck on leaf springs and two live axles: long travel, slow to settle, it rolls and pitches)
  suspension: { front: susp(1.25, 0.27, 0.6, 11, 0.36), rear: susp(1.35, 0.28, 0.4, 10, 0.36) },
  steering: { maxDeg: 34, ackermann: 0.8, rateLow: 1.4, rateHigh: 0.5, smoothTime: 0.13, returnScale: 1.4, gripLimitG: 0.58, slipMarginDeg: 6 },
  brakeN: 23500,
  brakeFront: 0.6,
  cdA: 3.6,
  finalDrive: 4.1,
  body: { front: 2.84, rear: -3.35, halfWidth: 1.12, bottom: 0.27, top: 2.89 },
  enclosed: 1,
  chase: { dist: 9.5, height: 3.3, look: 1.6 },
  cabView: { back: 0.2, up: 0.17 },
  mounts: withAxles(readMounts(rhinoMounts as MountTable), (rhinoMounts as MountTable).axles),
  rig: readRig(rhinoMounts as MountTable),
  bare: ['seat_rear'],
};

/**
 * The Tadpole (蝌蚪): a single-axle box trailer (docs/V3/plan/growth.md §六 2, J9d) — towed behind a car by the
 * coupling on its drawbar, its jockey wheel under it when it stands; the Sugar Cube's wheels, a rear door, a box one
 * fills with things and furniture. Never driven: posed behind what tows it (game/modcar/tow.ts).
 * A room on wheels (docs/V3/plan/finish.md §十一 1, F8): the box 3.0 × 1.7 m and 1.9 m clear inside, walked into by its
 * rear door (aboard.ts); 420 kg empty (280 before it grew) — well within what a hitch ball tows (parts.ts: 750 kg).
 */
export const TRAILER: FrameDef = {
  id: 'trailer',
  kind: 'trailer',
  name: { zh: '蝌蚪', en: 'Tadpole' },
  mass: 420,
  cg: { x: -0.1, y: 1.25, z: 0 },
  inertia: { roll: 340, yaw: 1060, pitch: 1060 },
  hubRadius: 0.285,
  suspension: { front: susp(2.2, 0.12, 0.5, 9, 0.35), rear: susp(2.2, 0.12, 0.5, 9, 0.35) },
  steering: { maxDeg: 0, ackermann: 0, rateLow: 1, rateHigh: 1, smoothTime: 0.1, returnScale: 1, gripLimitG: 0.6, slipMarginDeg: 6 },
  brakeN: 0,
  brakeFront: 0.5,
  cdA: 2.4,
  finalDrive: 1,
  body: { front: 1.37, rear: -1.72, halfWidth: 0.88, bottom: 0.5, top: 2.62 },
  enclosed: 0,
  chase: { dist: 8.0, height: 3.2, look: 1.3 },
  towed: { coupler: { x: (trailerMounts as unknown as { coupler: number[] }).coupler[0], y: (trailerMounts as unknown as { coupler: number[] }).coupler[1], z: 0 }, standY: 0.445 },
  mounts: withAxles(readMounts(trailerMounts as MountTable), (trailerMounts as MountTable).axles),
  rig: readRig(trailerMounts as MountTable),
};

/** where the hitch goes on a vehicle: under its rear bumper, on the middle; its ball this far behind and above that (frame model space) */
export const HITCH_BALL: V3 = { x: -0.2, y: 0.075, z: 0 };

/** a hitch mount on each frame with a rear bumper but the motorcycle's and the trailer's: under the bumper, on its middle */
function withHitch(f: FrameDef): FrameDef {
  if (f.balance || f.towed || f.mounts.some((m) => m.cat === 'hitch')) return f;
  const br = f.mounts.find((m) => m.cat === 'bumperRear');
  if (!br) return f;
  const pos = { x: br.pos.x + 0.02, y: Math.max(0.33, br.pos.y - 0.1), z: 0 };
  return { ...f, mounts: [...f.mounts, { id: 'hitch', cat: 'hitch', pos, quat: [0, 0, 0, 1], side: 0, label: CAT_LABEL.hitch }] };
}

/**
 * A ladder mount on each frame with a roof (core/modcar/ladders.ts, data/ladders.json: J9e): up the side where its body
 * leaves room — behind the last door, clear of the fuel flap — its foot over the wheel arch where it is above one; none
 * on the motorcycle or the trailer, and none on the Whale, whose own model has its ladder up its back
 */
function withLadder(f: FrameDef): FrameDef {
  const at = ladderMountOf(f.id);
  if (!at || f.mounts.some((m) => m.cat === 'ladder')) return f;
  return { ...f, mounts: [...f.mounts, { id: 'ladder', cat: 'ladder', pos: at.pos, quat: [0, 0, 0, 1], side: at.side, label: CAT_LABEL.ladder }] };
}

export const FRAMES: readonly FrameDef[] = [SEDAN, PICKUP, MOTO, RV, VAN, GOAT, WAGON, FOX, SNAIL, BUFFALO, RHINO, TRAILER, TURTLE, ELEPHANT, CAMEL].map(withHitch).map(withLadder);

const BY_ID = new Map(FRAMES.map((f) => [f.id, f]));

/** each frame's model box (data/mounts/<frame>.json: x along it, z across) */
const BOXES: Record<string, { min: number[]; max: number[] } | undefined> = Object.fromEntries(
  [sedanMounts, pickupMounts, motoMounts, rvMounts, vanMounts, goatMounts, wagonMounts, foxMounts, snailMounts, buffaloMounts, rhinoMounts, trailerMounts, turtleMounts, elephantMounts, camelMounts].map((t) => [(t as MountTable).frame, (t as unknown as { bbox?: { min: number[]; max: number[] } }).bbox]),
);

/** how long and how wide a frame's body is (m; 4.5 × 1.8 for one without its box) */
export function frameSize(id: string): { length: number; width: number } {
  const b = BOXES[id];
  return b ? { length: b.max[0] - b.min[0], width: b.max[2] - b.min[2] } : { length: 4.5, width: 1.8 };
}

export function frameDef(id: string): FrameDef {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`unknown ModCar frame "${id}"`);
  return f;
}

export function mountOf(frame: FrameDef, id: string): MountDef | undefined {
  return frame.mounts.find((m) => m.id === id);
}

/** the hubs in the order the simulation numbers its wheels: front left, front right, rear left, rear right */
export function hubsOf(frame: FrameDef): { fl: MountDef; fr: MountDef; rl: MountDef; rr: MountDef } {
  const hubs = frame.mounts.filter((m) => m.cat === 'rim');
  let front = hubs.filter((m) => m.axle === 'front');
  const rear = hubs.filter((m) => m.axle === 'rear');
  // (a trailer: its simulation's front corners where its coupling is, wheels never fitted there — it is posed, not driven)
  if (!front.length && frame.towed && rear.length) {
    const c = frame.towed.coupler;
    front = [-1, 1].map((side) => ({ ...rear[0], id: side < 0 ? 'hub_FL' : 'hub_FR', axle: 'front' as const, pos: { x: c.x, y: rear[0].pos.y, z: side * 0.1 }, side: side as -1 | 1, steer: false, driven: false }));
  }
  if (!front.length || !rear.length) throw new Error(`frame ${frame.id}: needs front and rear hubs`);
  const left = (list: MountDef[]): MountDef => list.find((m) => m.side < 0) ?? list[0];
  const right = (list: MountDef[]): MountDef => list.find((m) => m.side > 0) ?? list[0];
  return { fl: left(front), fr: right(front), rl: left(rear), rr: right(rear) };
}
