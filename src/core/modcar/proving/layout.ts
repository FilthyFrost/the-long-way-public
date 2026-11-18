/**
 * The proving ground (试车场, docs/MODCAR.md §28): a levelled piece of the world behind the workshop, a kilometre
 * back from it, where a vehicle is tried as the handling lab measures it — but driven, in the world, and seen.
 *
 *  - the long straight (直线道): 1.4 km of asphalt along −x, the start line at its near end, boards every 100 m,
 *    the quarter mile and the kilometre; further on the brake line (刹车线) and the stopping zone after it, striped
 *    every 5 m; a turning circle at the far end.
 *  - the dynamics pad (动态广场) beside it: the skid pad (定圆), a 30 m circle between two painted lines with cones
 *    round its inside, and the slalom (绕桩): ten cones 18 m apart, a gate before and after.
 *  - the off-road loop (越野路段) on the other side: a gravel loop whose outward leg is the timed course —
 *    washboard, whoops, an axle twister, a rock garden, a side slope, logs — and whose way back has sand, mud and
 *    potholes; inside the loop the grade hill (坡道), three concrete ramps of 20, 30 and 40 %.
 *
 * Everything is in the world's own frame (x, z; y up) at the ground's level `level`, which the world it is in
 * decides (provingLevel: the land it was cut out of, levelled). The land within PG takes the proving ground's
 * height (a plot of the world: provingPlot), let down a hand under what is drawn over it; the wheels and the feet
 * stand on the drawn surfaces themselves (ProvingGround.sample / shape).
 */
import { hash2 } from '../../math/rng';
import { simplex2 } from '../../math/noise';
import { smoothstep } from '../../math/util';
import { SURFACES, Surface, type Ground, type GroundSample } from '../../world/ground';
import type { Plot, TerrainPoint, World } from '../../world/terrain';

// ------------------------------------------------------------------ the plan

/** the box the land is levelled in (m, world frame); the land blends back over PG_SKIRT beyond it */
export const PG = { x0: -2510, x1: -880, z0: -300, z1: 300 } as const;
export const PG_SKIRT = 150;

/** the long straight: from its near end out along −x to its far end, `half` either side of z = 0 */
export const STRAIGHT = { xNear: -955, xFar: -2385, half: 11 } as const;
/** the start line (x); distances down the straight, u, are measured from it along −x */
export const START_X = -985;
/** the lanes: out along −x on the −z side, back along +x on the +z side (their middles) */
export const LANE_OUT = -5.5;
export const LANE_BACK = 5.5;
/** the quarter mile, the kilometre, the brake line and the end of the stopping zone (u, m) */
export const QUARTER_U = 402.3;
export const KM_U = 1000;
export const BRAKE_U = 1150;
export const STOP_END_U = 1250;
/** the turning circle at the far end */
export const TURN = { x: -2425, z: 0, r: 46 } as const;
/** the apron by the near end, where the tower and the shed stand */
export const APRON = { x0: -955, x1: -905, z0: -60, z1: 22 } as const;

/** the dynamics pad, joined to the straight's −z edge */
export const PAD = { x0: -1470, x1: -955, z0: -262, z1: -11 } as const;
/** the skid pad: its middle, the radius of its lane's middle, and how far the painted lines are either side */
export const SKIDPAD = { x: -1085, z: -150, r: 30, lane: 2 } as const;
/** the slalom: along −x at z; the gate in, the first cone, the gap between cones, how many (the gate out a gap after the last) */
export const SLALOM = { z: -222, gateIn: -1170, first: -1188, gap: 18, cones: 10 } as const;
/** x of the slalom's last cone and of its gate out */
export const SLALOM_LAST = SLALOM.first - SLALOM.gap * (SLALOM.cones - 1);
export const SLALOM_OUT = SLALOM_LAST - SLALOM.gap;

/**
 * The off-road loop: out along −x at z = zOut from xNear to xFar, round the far end, back along +x at z = zBack
 * and round the near end; gravel `half` either side of its middle, a shoulder of `side` beyond (drawn, and what
 * the features fade out over)
 */
export const LOOP = { xNear: -1000, xFar: -1450, zOut: 70, zBack: 230, half: 4, side: 3 } as const;
const LOOP_R = (LOOP.zBack - LOOP.zOut) / 2;
const LOOP_CZ = (LOOP.zBack + LOOP.zOut) / 2;
const LEG = LOOP.xNear - LOOP.xFar;
/** the loop's length (m) */
export const LOOP_LEN = 2 * LEG + 2 * Math.PI * LOOP_R;
/** the drawn corridor's half width */
export const LOOP_CORRIDOR = LOOP.half + LOOP.side;
/** the timed course: its start and finish lines (s along the loop) */
export const OFFROAD_START = 15;
export const OFFROAD_FINISH = 420;

/** a stretch of the loop that is something (s0 … s1 along it) */
export interface Feature {
  kind: 'washboard' | 'whoops' | 'twister' | 'rocks' | 'camber' | 'logs' | 'sand' | 'mud' | 'potholes';
  s0: number;
  s1: number;
  zh: string;
}

export const FEATURES: readonly Feature[] = [
  { kind: 'washboard', s0: 30, s1: 70, zh: '搓板路' },
  { kind: 'whoops', s0: 85, s1: 149, zh: '连续起伏' },
  { kind: 'twister', s0: 165, s1: 205, zh: '交叉坑' },
  { kind: 'rocks', s0: 220, s1: 270, zh: '碎石滩' },
  { kind: 'camber', s0: 285, s1: 335, zh: '侧坡' },
  { kind: 'logs', s0: 350, s1: 392, zh: '原木' },
  // (the way back)
  { kind: 'sand', s0: 730, s1: 790, zh: '沙地' },
  { kind: 'mud', s0: 820, s1: 880, zh: '泥地' },
  { kind: 'potholes', s0: 910, s1: 1010, zh: '坑洼路' },
];

/** the washboard's ripples, the whoops, the twister, the side slope, the logs (m) */
const WASH = { a: 0.022, wave: 0.9 } as const;
const WHOOP = { h: 0.45, wave: 16 } as const;
const TWIST = { a: 0.2, wave: 8, across: 1 } as const;
const CAMBER = { slope: Math.tan((13 * Math.PI) / 180), ramp: 12, wide: 10, fade: 4 } as const;
export const LOGS = { at: [355, 365, 375, 385], h: 0.15, width: 0.6, half: 4.2 } as const;
const MUD = { dip: 0.12, mu: 0.42, rr: 0.08 } as const;

/** a rock of the rock garden, a pothole of the way back: a round bump (h > 0) or dip (h < 0) */
export interface Lump {
  x: number;
  z: number;
  r: number;
  h: number;
}

/**
 * The grade hill: three concrete ramps side by side along −x, each up at its grade to `rise`, a flat top, and down
 * the same grade; a ramp's sides fall away at 1 in `side` (grass). x0 is the foot of every ramp; before it each
 * ramp has a flat concrete apron `apron` long, its lane's width, to come up to it on (and be set down on).
 */
export const HILL = { x0: -1180, rise: 4, top: 10, lane: 6, side: 1.2, apron: 25, ramps: [{ z: 125, grade: 0.2 }, { z: 150, grade: 0.3 }, { z: 175, grade: 0.4 }] } as const;

/** how far under what is drawn the land is let down (m): the drawn surfaces lie over it, nothing to fight with */
export const SINK = 0.25;
/** … taken down over this much inside the drawn edge, so the land meets the drawn surface's edge exactly */
const SINK_IN = 1.5;

// ------------------------------------------------------------------ the sections, and where one is sent

export type SectionId = 'accel' | 'brake' | 'skidpad' | 'slalom' | 'offroad' | 'hill';

export interface Section {
  id: SectionId;
  zh: string;
  /** a line under the name in the panel */
  help: string;
  /** where a vehicle is set down for it: its middle (x, z) and heading (rad about +y; 0 = +x, the sim's yaw) */
  x: number;
  z: number;
  yaw: number;
}

const YAW_W = Math.PI;
const YAW_E = 0;

export const SECTIONS: readonly Section[] = [
  { id: 'accel', zh: '直线加速', help: '停在起跑线后，踩油门开始计时：0–60、0–100、400 米、1 公里。', x: START_X + 3, z: LANE_OUT, yaw: YAW_W },
  { id: 'brake', zh: '刹车', help: '加速冲过红白刹车线再踩死刹车：刹停距离，折算成 100→0。', x: START_X - (BRAKE_U - 600), z: LANE_OUT, yaw: YAW_W },
  { id: 'skidpad', zh: '定圆', help: '半径 30 米的圆，沿着两条白线中间一直左转：每圈的时间和侧向 G。', x: SKIDPAD.x, z: SKIDPAD.z + SKIDPAD.r, yaw: YAW_E },
  { id: 'slalom', zh: '绕桩', help: '十个桩，每个隔 18 米，左右交替绕过去：从进门到出门的时间，碰倒、漏过几个桩。', x: START_X, z: SLALOM.z, yaw: YAW_W },
  { id: 'offroad', zh: '越野路段', help: '碎石路上依次是搓板路、连续起伏、交叉坑、碎石滩、侧坡和原木：过完一段的时间、车身最大倾角。', x: LOOP.xNear - 3, z: LOOP.zOut, yaw: YAW_W },
  { id: 'hill', zh: '坡道', help: '三条水泥坡道，20%、30%、40%，爬上去、在坡上停住再起步、再开下来。', x: HILL.x0 + 20, z: HILL.ramps[1].z, yaw: YAW_W },
];

export function sectionOf(id: SectionId): Section {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`no section ${id}`);
  return s;
}

/** distance down the straight from the start line (m) */
export function straightU(x: number): number {
  return START_X - x;
}

// ------------------------------------------------------------------ the loop as a path

/** where on the loop: s along it (0 at its near end, out along −x), d across (+ right of the way it runs) */
export interface LoopPoint {
  s: number;
  d: number;
}

/** the nearest point of the loop's middle line */
export function loopProject(x: number, z: number, out: LoopPoint): LoopPoint {
  const R = LOOP_R;
  if (x <= LOOP.xNear && x >= LOOP.xFar) {
    // (the nearer leg)
    if (Math.abs(z - LOOP.zOut) <= Math.abs(z - LOOP.zBack)) {
      out.s = LOOP.xNear - x;
      out.d = LOOP.zOut - z;
    } else {
      out.s = LEG + Math.PI * R + (x - LOOP.xFar);
      out.d = z - LOOP.zBack;
    }
    return out;
  }
  if (x < LOOP.xFar) {
    const rx = x - LOOP.xFar;
    const rz = z - LOOP_CZ;
    const r = Math.hypot(rx, rz);
    const th = Math.atan2(-rx, -rz);
    out.s = LEG + R * Math.max(0, Math.min(Math.PI, th));
    out.d = r - R;
    return out;
  }
  const rx = x - LOOP.xNear;
  const rz = z - LOOP_CZ;
  const r = Math.hypot(rx, rz);
  const ph = Math.atan2(rx, rz);
  out.s = 2 * LEG + Math.PI * R + R * Math.max(0, Math.min(Math.PI, ph));
  out.d = r - R;
  return out;
}

/** a point of the loop's middle line at s: position, unit heading (tx, tz) and curvature (1/m, + turning right) */
export function loopAt(s: number, out: { x: number; z: number; tx: number; tz: number; kappa: number }): void {
  const R = LOOP_R;
  let u = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  if (u < LEG) {
    out.x = LOOP.xNear - u;
    out.z = LOOP.zOut;
    out.tx = -1;
    out.tz = 0;
    out.kappa = 0;
    return;
  }
  u -= LEG;
  if (u < Math.PI * R) {
    const th = u / R;
    out.x = LOOP.xFar - R * Math.sin(th);
    out.z = LOOP_CZ - R * Math.cos(th);
    out.tx = -Math.cos(th);
    out.tz = Math.sin(th);
    // (a left turn)
    out.kappa = -1 / R;
    return;
  }
  u -= Math.PI * R;
  if (u < LEG) {
    out.x = LOOP.xFar + u;
    out.z = LOOP.zBack;
    out.tx = 1;
    out.tz = 0;
    out.kappa = 0;
    return;
  }
  u -= LEG;
  const ph = u / R;
  out.x = LOOP.xNear + R * Math.sin(ph);
  out.z = LOOP_CZ + R * Math.cos(ph);
  out.tx = Math.cos(ph);
  out.tz = -Math.sin(ph);
  out.kappa = -1 / R;
}

// ------------------------------------------------------------------ the rocks and the potholes

function lumps(f: Feature, n: number, seed: number, rMin: number, rMax: number, hMin: number, hMax: number): Lump[] {
  const out: Lump[] = [];
  const p = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
  for (let i = 0; i < n; i++) {
    const h = hash2(i, seed, 0x51a7);
    const u = ((h & 0xffff) / 65536) * (f.s1 - f.s0 - 4) + f.s0 + 2;
    const d = ((((h >>> 16) & 0xff) / 255) * 2 - 1) * (LOOP.half - 0.6);
    const k = hash2(i, seed, 0x2b3);
    loopAt(u, p);
    // (right of the way it runs: (−tz, tx))
    out.push({
      x: p.x - p.tz * d,
      z: p.z + p.tx * d,
      r: rMin + (rMax - rMin) * ((k & 0xff) / 255),
      h: hMin + (hMax - hMin) * (((k >>> 8) & 0xff) / 255),
    });
  }
  return out;
}

const featureOf = (k: Feature['kind']): Feature => FEATURES.find((f) => f.kind === k)!;
/** the rock garden's rocks (bumps) and the way back's potholes (dips) */
export const ROCKS: readonly Lump[] = lumps(featureOf('rocks'), 70, 11, 0.35, 0.8, 0.09, 0.27);
export const POTHOLES: readonly Lump[] = lumps(featureOf('potholes'), 46, 23, 0.4, 0.95, -0.14, -0.06);

/** the lumps by 4 m cell, for a quick look-up */
const LUMP_CELL = 4;
const lumpGrid = new Map<string, Lump[]>();
for (const l of [...ROCKS, ...POTHOLES]) {
  const i0 = Math.floor((l.x - l.r) / LUMP_CELL);
  const i1 = Math.floor((l.x + l.r) / LUMP_CELL);
  const j0 = Math.floor((l.z - l.r) / LUMP_CELL);
  const j1 = Math.floor((l.z + l.r) / LUMP_CELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const key = `${i},${j}`;
      let a = lumpGrid.get(key);
      if (!a) lumpGrid.set(key, (a = []));
      a.push(l);
    }
}

function lumpsAt(x: number, z: number): number {
  const a = lumpGrid.get(`${Math.floor(x / LUMP_CELL)},${Math.floor(z / LUMP_CELL)}`);
  if (!a) return 0;
  let up = 0;
  let down = 0;
  for (const l of a) {
    const q = ((x - l.x) ** 2 + (z - l.z) ** 2) / (l.r * l.r);
    if (q >= 1) continue;
    const v = l.h * (1 - q) * (1 - q);
    if (v > up) up = v;
    if (v < down) down = v;
  }
  return up + down;
}

// ------------------------------------------------------------------ the shape

/** what is at a point of the proving ground */
export class ProvingPoint {
  /** height above the ground's level (m) */
  h = 0;
  /** the surface the wheels are on there; −1: the land's own (grass, whatever the country has) */
  surface = -1;
  /** how far inside something drawn over the land (m; ≤ 0 outside) — what the land is let down by under it */
  inside = -1;
  /** a grip and rolling resistance of its own (mud), NaN for the surface's */
  mu = NaN;
  rr = NaN;
}

const env = (s: number, s0: number, s1: number, ramp: number): number => smoothstep(s0, s0 + ramp, s) * (1 - smoothstep(s1 - ramp, s1, s));
const lp: LoopPoint = { s: 0, d: 0 };

/** the hill's height at (x, z) above the level, and whether it is on a ramp's concrete */
function hillAt(x: number, z: number, o: { h: number; lane: boolean; inside: number }): void {
  o.h = 0;
  o.lane = false;
  o.inside = -1e9;
  const u = HILL.x0 - x;
  if (u < -HILL.apron - 3 || u > 60) return;
  for (const rp of HILL.ramps) {
    const up = HILL.rise / rp.grade;
    const len = 2 * up + HILL.top;
    if (u > len + 3) continue;
    // (the profile along: up, the top, down; rounded over a metre at each change of grade)
    const prof = (q: number): number => Math.max(0, Math.min(rp.grade * q, HILL.rise, rp.grade * (len - q)));
    const r = 0.5;
    const p = (prof(u - r) + 2 * prof(u) + prof(u + r)) / 4;
    const dz = Math.abs(z - rp.z);
    const half = HILL.lane / 2;
    const h = dz <= half ? p : Math.max(0, p - (dz - half) / HILL.side);
    if (h > o.h || (h === o.h && dz <= half)) {
      o.h = h;
      o.lane = dz <= half && u >= -HILL.apron && u <= len + 1;
    }
    // (inside the footprint: the ramp's lane and its slopes, from its foot to its far foot; and its apron, the
    // lane's width before its foot)
    const reach = half + HILL.rise * HILL.side;
    const ins = Math.max(Math.min(reach - dz, u + 1.5, len + 1.5 - u), Math.min(half - dz, u + HILL.apron, 1.5 - u));
    if (ins > o.inside) o.inside = ins;
  }
}

const hp = { h: 0, lane: false, inside: -1e9 };

/**
 * What is at (x, z): its height above the level, its surface and how far inside the drawn ground (m). Outside
 * everything the proving ground draws, the land's: level, its own surface.
 */
export function provingAt(x: number, z: number, o: ProvingPoint): ProvingPoint {
  o.h = 0;
  o.surface = -1;
  o.inside = -1e9;
  o.mu = NaN;
  o.rr = NaN;
  if (x < PG.x0 - 10 || x > PG.x1 + 10 || z < PG.z0 - 10 || z > PG.z1 + 10) return o;
  // the asphalt: the straight, its turning circle, the pad and the apron (level)
  const inRect = (b: { x0: number; x1: number; z0: number; z1: number }): number => Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
  let ins = Math.max(
    Math.min(x - STRAIGHT.xFar, STRAIGHT.xNear - x, z + STRAIGHT.half, STRAIGHT.half - z),
    TURN.r - Math.hypot(x - TURN.x, z - TURN.z),
    // (the pad and the straight are one sheet: the pad's edge along the straight is no edge)
    Math.min(x - PAD.x0, PAD.x1 - x, z - PAD.z0, STRAIGHT.half - z),
    inRect(APRON),
  );
  if (ins > 0) {
    o.surface = Surface.Asphalt;
    o.inside = ins;
    return o;
  }
  o.inside = ins;
  // the grade hill
  hillAt(x, z, hp);
  if (hp.inside > 0) {
    o.h = hp.h;
    o.inside = hp.inside;
    if (hp.lane) o.surface = Surface.Asphalt;
    return o;
  }
  if (hp.inside > o.inside) o.inside = hp.inside;
  // the off-road loop
  loopProject(x, z, lp);
  const ad = Math.abs(lp.d);
  // (the side slope's bank reaches further than the corridor: the land beside it leans with it)
  const wide = ad < CAMBER.wide + CAMBER.fade;
  if (ad > LOOP_CORRIDOR && !wide) return o;
  const s = lp.s;
  const d = lp.d;
  const across = 1 - smoothstep(LOOP.half, LOOP_CORRIDOR, ad);
  let h = 0;
  let surf: number = Surface.Gravel;
  for (const f of FEATURES) {
    if (s < f.s0 - 1 || s > f.s1 + 1) continue;
    switch (f.kind) {
      case 'washboard':
        h += WASH.a * Math.sin((2 * Math.PI * (s - f.s0)) / WASH.wave) * env(s, f.s0, f.s1, 2) * across;
        break;
      case 'whoops':
        if (s > f.s0 && s < f.s1) h += WHOOP.h * 0.5 * (1 - Math.cos((2 * Math.PI * (s - f.s0)) / WHOOP.wave)) * (1 - smoothstep(LOOP.half + 1, LOOP_CORRIDOR + 2, ad));
        break;
      case 'twister':
        h += TWIST.a * Math.sin((2 * Math.PI * (s - f.s0)) / TWIST.wave) * Math.max(-1, Math.min(1, d / TWIST.across)) * env(s, f.s0, f.s1, 3) * across;
        break;
      case 'rocks':
      case 'potholes':
        if (ad < LOOP.half) h += lumpsAt(x, z);
        break;
      case 'camber': {
        // (the high side on the right of the way out: the loop's outside)
        const bank = CAMBER.slope * Math.max(-CAMBER.wide, Math.min(CAMBER.wide, d)) * (1 - smoothstep(CAMBER.wide, CAMBER.wide + CAMBER.fade, ad));
        h += bank * env(s, f.s0, f.s1, CAMBER.ramp);
        break;
      }
      case 'logs':
        for (const at of LOGS.at) {
          const q = Math.abs(s - at);
          if (q < LOGS.width / 2) h += LOGS.h * Math.cos((Math.PI * q) / LOGS.width) ** 2 * (1 - smoothstep(LOGS.half - 0.3, LOGS.half, ad));
        }
        break;
      case 'sand':
        if (s >= f.s0 && s <= f.s1 && ad < LOOP.half + 0.5) surf = Surface.Sand;
        break;
      case 'mud':
        if (s >= f.s0 && s <= f.s1 && ad < LOOP.half + 0.5) {
          surf = Surface.Dirt;
          o.mu = MUD.mu;
          o.rr = MUD.rr;
        }
        h -= MUD.dip * env(s, f.s0, f.s1, 5) * (1 - smoothstep(LOOP.half - 1, LOOP.half + 1, ad));
        break;
    }
  }
  o.h = h;
  if (ad <= LOOP_CORRIDOR) {
    o.inside = LOOP_CORRIDOR - ad;
    // (the gravel; the shoulders are the land's grass)
    if (ad <= LOOP.half + 0.4) o.surface = surf;
  }
  return o;
}

/** the land's height under the drawn ground: the proving ground's, let down a hand inside what is drawn */
export function sunkAt(p: ProvingPoint): number {
  return p.h - SINK * smoothstep(0, SINK_IN, p.inside);
}

// ------------------------------------------------------------------ the level, the plot

/**
 * The level of the ground: the middle height of the land it is cut out of (sampled from a world made without it),
 * so the cut and the fill at its edges are as small as they can be.
 */
export function provingLevel(bare: { heightAt(x: number, z: number): number }): number {
  const hs: number[] = [];
  for (let x = PG.x0; x <= PG.x1; x += 60) for (let z = PG.z0; z <= PG.z1; z += 60) hs.push(bare.heightAt(x, z));
  hs.sort((a, b) => a - b);
  return Math.round(hs[hs.length >> 1] * 10) / 10;
}

/** how tall the proving ground's mown grass is, as a share of the meadow's */
export const MOWN = 1 / 3;

/** the proving ground as a plot of the world's land: the land within PG takes its height (let down under what is drawn) */
export function provingPlot(level: number): Plot & { bare(x: number, z: number): boolean; grass(x: number, z: number): number } {
  const p = new ProvingPoint();
  return {
    x0: PG.x0,
    x1: PG.x1,
    z0: PG.z0,
    z1: PG.z1,
    skirt: PG_SKIRT,
    height: (x, z) => level + sunkAt(provingAt(x, z, p)),
    // (no grass growing through what is drawn over the land: a tuft is spread a metre or so from its sample)
    bare: (x, z) => provingAt(x, z, p).inside > -2,
    // (and what grows between is kept mown: a third of the meadow's height, long again out in the skirt)
    grass: () => MOWN,
  };
}

// ------------------------------------------------------------------ the ground

/**
 * What the wheels roll on and the feet stand on at the proving ground: its drawn surfaces (the asphalt, the
 * concrete ramps, the gravel and its features, the sand, the mud) where it has them, the world's land elsewhere
 * (the grass between, levelled: the plot). The weather wets and snows its surfaces as the world's.
 */
export class ProvingGround implements Ground {
  private readonly p = new ProvingPoint();
  private readonly q = new ProvingPoint();

  constructor(
    readonly level: number,
    /** the world it is a plot of (its land round the drawn ground: the view paints its skirts as that land) */
    readonly world: World,
    /** the world's ground as the wheels have it elsewhere (the garage's on its plot, the world's land) */
    private readonly land: Ground = world,
  ) {}

  /** is (x, z) on the proving ground's box (with its skirt's first few metres) */
  near(x: number, z: number): boolean {
    return x >= PG.x0 - 12 && x <= PG.x1 + 12 && z >= PG.z0 - 12 && z <= PG.z1 + 12;
  }

  sample(x: number, z: number, out: GroundSample): void {
    if (!this.near(x, z)) {
      this.land.sample(x, z, out);
      return;
    }
    const p = provingAt(x, z, this.p);
    if (p.inside <= 0) {
      // (the land: the plot's level, the world's grass, its own weather)
      this.world.sample(x, z, out);
      return;
    }
    const e = 0.08;
    const hx = provingAt(x + e, z, this.q).h;
    const hz = provingAt(x, z + e, this.q).h;
    const dhx = (hx - p.h) / e;
    const dhz = (hz - p.h) / e;
    let surf = p.surface;
    if (surf < 0) {
      // (a shoulder or a slope of the hill: the land's surface, our height)
      this.world.sample(x, z, out);
      surf = out.surface;
    }
    const info = SURFACES[surf];
    // (as the world's: a long, gentle unevenness the eye does not see)
    const rough = info.rough * (1.5 * simplex2(x / 6.3, z / 6.3, 91) + 0.6 * simplex2(x / 2.1, z / 2.1, 92));
    const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
    out.h = this.level + p.h + rough;
    out.nx = -dhx * inv;
    out.ny = inv;
    out.nz = -dhz * inv;
    out.surface = surf;
    let mu = Number.isNaN(p.mu) ? info.mu : p.mu;
    let rr = Number.isNaN(p.rr) ? info.rr : p.rr;
    const w = this.world;
    if (w.wetness > 0) {
      const loss = surf === Surface.Asphalt ? 0.28 : surf === Surface.Sand ? -0.06 : surf === Surface.Gravel ? 0.14 : 0.3;
      mu *= 1 - loss * w.wetness;
    }
    if (w.snowCover > 0 && surf !== Surface.Snow && surf !== Surface.Ice) {
      const k = smoothstep(0.15, 0.7, w.snowCover);
      mu += (SURFACES[Surface.Snow].mu + 0.04 - mu) * k;
      rr += (0.055 - rr) * k;
    }
    out.mu = mu;
    out.rr = rr;
  }

  /** the feet's land: the world's (its water, its decks), our drawn surfaces' height where we have them */
  shape(x: number, z: number, o: TerrainPoint): void {
    this.world.shape(x, z, o);
    if (!this.near(x, z)) return;
    const p = provingAt(x, z, this.p);
    if (p.inside <= 0) return;
    o.h = o.bed = this.level + p.h;
  }

  /** the drawn ground's height at (x, z) (no unevenness): what the meshes are made to */
  heightAt(x: number, z: number): number {
    return this.level + provingAt(x, z, this.p).h;
  }
}
