/**
 * The ModCar frames (docs/MODCAR.md §2.2): what each bare vehicle weighs, how its suspension, brakes and
 * steering are set up, and where its mounts are. Positions come from the Blender models
 * (data/mounts/<frame>.json, written by tools/blender/frames/<frame>.py — the geometry owns them); the
 * physical numbers live here.
 */
import type { AxleSuspension, Category, FrameDef, FrameRig, MountDef, Text } from './types';
import { CATEGORIES } from './types';
import sedanMounts from './data/mounts/sedan.json';
import pickupMounts from './data/mounts/pickup.json';
import motoMounts from './data/mounts/moto.json';
import rvMounts from './data/mounts/rv.json';

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
}

interface MountTable {
  frame: string;
  mounts: Record<string, MountJson>;
  panels?: Record<string, { hinge_axis: number[]; open_deg: number; glass?: string | null; mount?: string | null }>;
  needles?: Record<string, { axis: number[]; deg_full: number }>;
  wipers?: Record<string, { axis: number[]; sweep_deg: number }>;
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
  if (!t.panels && !t.needles && !t.wipers && !t.rig) return undefined;
  const rig: FrameRig = { panels: {}, needles: {}, wipers: {} };
  const r = t.rig;
  if (r?.fork) rig.fork = { pivot: v3(r.fork.pivot), axis: v3(r.fork.axis), lower: r.fork.lower ? { object: r.fork.lower.object, axis: v3(r.fork.lower.axis), travel: r.fork.lower.travel } : undefined };
  if (r?.shocks) rig.shocks = Object.values(r.shocks).map((k) => ({ upper: k.upper, lower: k.lower, upperEye: v3(k.upper_eye), lowerEye: v3(k.lower_eye) }));
  if (r?.swingarm) rig.swingarm = { pivot: v3(r.swingarm.pivot), axis: v3(r.swingarm.axis), length: r.swingarm.length ?? 0.5 };
  if (r?.stand) rig.stand = { pivot: v3(r.stand.pivot), axis: v3(r.stand.axis), foldDeg: r.stand.fold_deg };
  for (const [k, p] of Object.entries(t.panels ?? {})) rig.panels[k] = { axis: v3(p.hinge_axis), openDeg: p.open_deg, glass: p.glass ?? null, mount: p.mount ?? null };
  for (const [k, n] of Object.entries(t.needles ?? {})) rig.needles[k] = { axis: v3(n.axis), fullDeg: n.deg_full };
  for (const [k, w] of Object.entries(t.wipers ?? {})) rig.wipers[k] = { axis: v3(w.axis), sweepDeg: w.sweep_deg };
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
const CAT_LABEL: Record<Category, Text> = {
  engine: { zh: '发动机', en: 'engine' },
  gearbox: { zh: '变速箱', en: 'gearbox' },
  radiator: { zh: '散热器', en: 'radiator' },
  battery: { zh: '电瓶', en: 'battery' },
  fuelTank: { zh: '油箱', en: 'fuel tank' },
  exhaust: { zh: '排气', en: 'exhaust' },
  turbo: { zh: '涡轮', en: 'turbo' },
  rim: { zh: '车轮', en: 'wheel' },
  tire: { zh: '轮胎', en: 'tyre' },
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
};
const SEAT_LABEL: Record<string, Text> = {
  seat_driver: { zh: '驾驶座', en: "driver's seat" },
  seat_pass: { zh: '副驾座', en: 'passenger seat' },
  seat_rear: { zh: '后排座', en: 'rear seat' },
  seat_dinette: { zh: '餐桌卡座', en: 'dinette seat' },
};

/** "左前车轮" / "front left wheel" from the mount id and its category */
function labelFor(id: string, cat: Category): Text {
  if (SEAT_LABEL[id]) return SEAT_LABEL[id];
  const c = CAT_LABEL[cat];
  const tail = id.includes('_') ? id.slice(id.lastIndexOf('_') + 1) : '';
  const s = tail === 'side' ? { zh: '侧', en: 'side' } : SIDE_LABEL[tail];
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
      label: labelFor(id, cat),
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
    });
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
  cg: { x: 0.05, y: 0.52, z: 0 },
  inertia: { roll: 200, yaw: 820, pitch: 780 },
  hubRadius: 0.285,
  suspension: { front: susp(1.45, 0.2, 0.55, 9.5), rear: susp(1.55, 0.19, 0.3, 8.5) },
  steering: { maxDeg: 36, ackermann: 0.8, rateLow: 1.9, rateHigh: 0.75, smoothTime: 0.09, returnScale: 1.6, gripLimitG: 0.75, slipMarginDeg: 6 },
  brakeN: 7900,
  brakeFront: 0.68,
  cdA: 0.83,
  finalDrive: 4.3,
  body: { front: 2.02, rear: -2.02, halfWidth: 0.8, bottom: 0.18, top: 1.42 },
  enclosed: 1,
  chase: { dist: 5.6, height: 1.9, look: 0.9 },
  mounts: readMounts(sedanMounts as MountTable),
  rig: readRig(sedanMounts as MountTable),
};

export const PICKUP: FrameDef = {
  id: 'pickup',
  kind: 'pickup',
  name: { zh: '骡子', en: 'Mule' },
  mass: 700,
  cg: { x: 0.2, y: 0.6, z: 0 },
  inertia: { roll: 290, yaw: 1450, pitch: 1400 },
  hubRadius: 0.34,
  suspension: { front: susp(1.35, 0.22, 0.5, 10), rear: susp(1.5, 0.24, 0.25, 9) },
  steering: { maxDeg: 34, ackermann: 0.8, rateLow: 1.7, rateHigh: 0.65, smoothTime: 0.1, returnScale: 1.5, gripLimitG: 0.7, slipMarginDeg: 6 },
  brakeN: 10000,
  brakeFront: 0.7,
  cdA: 1.25,
  finalDrive: 4.3,
  body: { front: 2.3, rear: -2.3, halfWidth: 0.84, bottom: 0.22, top: 1.62 },
  enclosed: 1,
  chase: { dist: 6.2, height: 2.1, look: 1.0 },
  mounts: readMounts(pickupMounts as MountTable),
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
  mounts: readMounts(motoMounts as MountTable),
  rig: readRig(motoMounts as MountTable),
};

export const RV: FrameDef = {
  id: 'rv',
  kind: 'rv',
  name: { zh: '鲸鱼', en: 'Whale' },
  mass: 2600,
  cg: { x: -0.1, y: 1.05, z: 0 },
  inertia: { roll: 2600, yaw: 13000, pitch: 12500 },
  hubRadius: 0.39,
  suspension: { front: susp(1.2, 0.2, 0.6, 11), rear: susp(1.25, 0.2, 0.45, 10) },
  steering: { maxDeg: 38, ackermann: 0.85, rateLow: 1.4, rateHigh: 0.5, smoothTime: 0.12, returnScale: 1.4, gripLimitG: 0.6, slipMarginDeg: 6 },
  brakeN: 21800,
  brakeFront: 0.62,
  cdA: 4.2,
  finalDrive: 4.1,
  body: { front: 3.4, rear: -3.4, halfWidth: 1.12, bottom: 0.3, top: 3.05 },
  enclosed: 1,
  chase: { dist: 10, height: 3.2, look: 1.6 },
  mounts: readMounts(rvMounts as MountTable),
  rig: readRig(rvMounts as MountTable),
};

export const FRAMES: readonly FrameDef[] = [SEDAN, PICKUP, MOTO, RV];

const BY_ID = new Map(FRAMES.map((f) => [f.id, f]));

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
  const front = hubs.filter((m) => m.axle === 'front');
  const rear = hubs.filter((m) => m.axle === 'rear');
  if (!front.length || !rear.length) throw new Error(`frame ${frame.id}: needs front and rear hubs`);
  const left = (list: MountDef[]): MountDef => list.find((m) => m.side < 0) ?? list[0];
  const right = (list: MountDef[]): MountDef => list.find((m) => m.side > 0) ?? list[0];
  return { fl: left(front), fr: right(front), rl: left(rear), rr: right(rear) };
}
