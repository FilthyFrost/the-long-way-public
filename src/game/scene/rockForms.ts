/**
 * Rock carved (G5, docs/V3/nodes/G-ghibli.md): the shapes of the rock that stands by itself — a coast's stacks and its
 * arch, a pillar mountain's pillars, a karst's towers — as rock breaks: along its beds and its joints, into blocks.
 *
 * A spire is a pile of beds. Each bed is a course of blocks round a plan that is a polygon, not a circle (its corners
 * are the rock's great joints; a tower's is rounded off): a hard bed stands out a hand over the one under it, a soft
 * one is cut back under the one above, so its side is ledges and overhangs with their own shadows; round each bed the
 * joints cut it into blocks, each standing a little in or out of its neighbours, one in ten fallen out and its niche
 * left dark; one or two clefts run up it for half its height. A sea's stack is cut in at the waterline and stands on
 * a skirt of its own rock just under the water. Its top is level (a tower's a dome), turf on it.
 * An arch is a wall of the same beds and blocks with a door through it, its ends stepping down into the sea.
 * Fallen blocks lie round a foot.
 *
 * Every vertex carries what the paint needs (render/rockMaterial.ts aRock): its block's own number, its height over
 * the sea or the land, how deep in a cleft it lies, how green it is and whether the top's turf lies on it. Faces are
 * the blocks' own planes; the paint lays the rock's finer planes, its beds and its weather on them.
 */
export interface RockOut {
  pos: number[];
  idx: number[];
  /** aRock, four numbers a vertex */
  rock: number[];
}

/** where a tree's card may stand on carved rock: its top, a ledge */
export interface RockPerch {
  x: number;
  y: number;
  z: number;
  /** how much room there is (m): a ledge's width, a top's radius */
  room: number;
  top: boolean;
}

export type SpireForm = 'pillar' | 'tower' | 'stack';

export interface SpireSpec {
  form: SpireForm;
  x: number;
  z: number;
  /** the sea's level or the land's at its middle, its foot under that, how far it stands over its level (m) */
  level: number;
  foot: number;
  h: number;
  /** its half width at its waist (m), how much deeper than wide its section is, its turn (rad) */
  r: number;
  depth: number;
  yaw: number;
  green: number;
  seed: number;
}

interface Habit {
  corners: readonly [number, number];
  /** how far its plan is rounded off toward a circle, 0 … 1 */
  round: number;
  bed: readonly [number, number];
  /** how far a hard bed stands out and a soft one is cut back (share of its radius) */
  hard: number;
  joints: readonly [number, number];
  block: number;
  fall: number;
  clefts: readonly [number, number];
  /** the share of its height that is its top's dome (0: a level top) */
  dome: number;
  taper: number;
  flare: number;
  lean: number;
  /** how many of its upper beds overhang the one under */
  overhang: number;
  /** how often a block is its neighbour under it carried up: a rock that stands in columns between its joints (a sandstone pillar) */
  carry: number;
}

const HABITS: Readonly<Record<SpireForm, Habit>> = {
  stack: { corners: [5, 7], round: 0.16, bed: [3.2, 7.2], hard: 0.075, joints: [10, 14], block: 0.055, fall: 0.1, clefts: [1, 2], dome: 0, taper: 0.13, flare: 0.14, lean: 0.06, overhang: 0.22, carry: 0.3 },
  // (a sandstone pillar: thick beds, the rock standing in columns between joints that run the whole way up, deep clefts)
  pillar: { corners: [4, 6], round: 0.1, bed: [9, 22], hard: 0.045, joints: [7, 10], block: 0.075, fall: 0.06, clefts: [2, 3], dome: 0, taper: 0.09, flare: 0.2, lean: 0.1, overhang: 0.12, carry: 0.72 },
  tower: { corners: [7, 10], round: 0.5, bed: [11, 24], hard: 0.04, joints: [10, 15], block: 0.035, fall: 0.05, clefts: [0, 2], dome: 0.36, taper: 0.07, flare: 0.5, lean: 0.05, overhang: 0.06, carry: 0.5 },
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

/** a bed of a pile: from y0 to y1, standing out by `off` (share of the radius), its blocks' own offsets */
interface Bed {
  y0: number;
  y1: number;
  off: number;
  cav: number;
}

/**
 * One spire carved into the arrays (vertices about (ax, ay, az)); the places trees may stand on it into `perches`.
 * Returns how many triangles it took.
 */
export function carveSpire(sp: SpireSpec, out: RockOut, ax: number, ay: number, az: number, perches: RockPerch[]): number {
  const hb = HABITS[sp.form];
  const startIdx = out.idx.length;
  const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x51f3);
  const between = (a: readonly [number, number]): number => a[0] + (a[1] - a[0]) * rnd();
  const top = sp.level + sp.h;
  const sea = sp.form === 'stack';

  // ---- its plan: a polygon, its corners the rock's great joints
  const K = Math.round(between(hb.corners));
  const cornerA: number[] = [];
  const cornerR: number[] = [];
  const a0 = rnd() * TAU;
  for (let i = 0; i < K; i++) {
    cornerA.push(a0 + ((i + 0.6 * (rnd() - 0.5)) / K) * TAU);
    cornerR.push(0.86 + 0.26 * rnd());
  }
  const meanR = cornerR.reduce((s, v) => s + v, 0) / K;
  /** the plan's radius at an angle (a share of the spire's) */
  const plan = (a: number): number => {
    let t = (((a - cornerA[0]) % TAU) + TAU) % TAU;
    let i = 0;
    for (; i < K; i++) {
      const next = i + 1 < K ? cornerA[i + 1] - cornerA[0] : TAU;
      if (t <= next) break;
    }
    if (i >= K) i = K - 1;
    const aI = cornerA[i] - cornerA[0];
    const aJ = i + 1 < K ? cornerA[i + 1] - cornerA[0] : TAU;
    t = Math.min(Math.max(t, aI), aJ);
    // the ray at t against the side from corner i to corner i + 1
    const x1 = Math.cos(aI) * cornerR[i];
    const z1 = Math.sin(aI) * cornerR[i];
    const x2 = Math.cos(aJ) * cornerR[(i + 1) % K];
    const z2 = Math.sin(aJ) * cornerR[(i + 1) % K];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const cx = Math.cos(t);
    const cz = Math.sin(t);
    const den = cx * dz - cz * dx;
    const rp = Math.abs(den) < 1e-6 ? cornerR[i] : (x1 * dz - z1 * dx) / den;
    return rp + (meanR - rp) * hb.round;
  };

  // ---- its joints: the corners, and more between them; its clefts
  const J = Math.max(K, Math.round(between(hb.joints) * (0.8 + 0.4 * Math.min(1.6, sp.r / 14))));
  const joints: number[] = cornerA.map((a) => (((a - a0) % TAU) + TAU) % TAU);
  while (joints.length < J) {
    // (in the widest gap, a little off its middle)
    joints.sort((p, q) => p - q);
    let wide = 0;
    let at = 0;
    for (let i = 0; i < joints.length; i++) {
      const gap = (i + 1 < joints.length ? joints[i + 1] : joints[0] + TAU) - joints[i];
      if (gap > wide) {
        wide = gap;
        at = i;
      }
    }
    joints.push((joints[at] + wide * (0.38 + 0.24 * rnd())) % TAU);
  }
  joints.sort((p, q) => p - q);
  const S = joints.length;
  /** each column of blocks a little in or out the whole way up: the rock stands in columns between its joints */
  const column: number[] = [];
  for (let s = 0; s < S; s++) column.push((rnd() - 0.5) * hb.block * 1.1);
  const clefts: { s: number; t0: number; t1: number; d: number }[] = [];
  const nCleft = Math.round(between(hb.clefts));
  for (let i = 0; i < nCleft; i++) {
    const t0 = rnd() < 0.5 ? -1 : 0.15 + 0.3 * rnd();
    clefts.push({ s: Math.floor(rnd() * S), t0, t1: Math.max(t0, 0) + 0.35 + 0.55 * rnd(), d: 0.2 + 0.16 * rnd() });
  }

  // ---- its beds, from its foot to its top
  const beds: Bed[] = [];
  let y = sp.foot;
  if (sea) {
    // (the skirt it stands on, just under the water; the waves' notch at the waterline)
    beds.push({ y0: sp.foot, y1: sp.level - 0.7, off: 0.2 + 0.1 * rnd(), cav: 0 });
    beds.push({ y0: sp.level - 0.7, y1: sp.level + 1.6 + 1.4 * rnd(), off: -0.15 - 0.07 * rnd(), cav: 0.45 });
    y = beds[1].y1;
  } else {
    // (its foot in the scree: one broad bed)
    beds.push({ y0: sp.foot, y1: sp.level + 1.5 + 2.5 * rnd(), off: 0.1 + 0.08 * rnd(), cav: 0 });
    y = beds[0].y1;
  }
  let hardNext = rnd() < 0.5;
  while (y < top - 0.8) {
    let th = between(hb.bed) * (0.75 + 0.5 * Math.min(1.5, sp.h / 90));
    if (top - (y + th) < hb.bed[0] * 0.7) th = top - y;
    const t = (y + th * 0.5 - sp.level) / sp.h;
    let off = hardNext ? hb.hard * (0.35 + 0.65 * rnd()) : -hb.hard * (0.25 + 0.6 * rnd());
    // (now and then a bed high up stands well out over the one under: a cornice)
    if (t > 0.45 && rnd() < hb.overhang) off = hb.hard * (1.1 + 0.9 * rnd());
    beds.push({ y0: y, y1: y + th, off, cav: 0 });
    hardNext = rnd() < 0.25 ? hardNext : !hardNext;
    y += th;
  }
  const B = beds.length;

  // ---- its profile: spread at its foot, narrower upward, a tower's top a dome
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const profile = (yy: number): number => {
    const t = (yy - sp.level) / sp.h;
    let p = 1 + hb.flare * Math.pow(1 - smooth(-0.08, 0.3, t), 1.6);
    p *= 1 - hb.taper * Math.max(0, t);
    p *= 1 + 0.04 * Math.sin(t * 7.3 + ph[0]);
    if (hb.dome > 0 && t > 1 - hb.dome) {
      const u = Math.min(1, (t - (1 - hb.dome)) / hb.dome);
      p *= Math.sqrt(Math.max(0.02, 1 - u * u * 0.94));
    }
    return p;
  };
  const mid = (t: number): [number, number] => [sp.r * hb.lean * (Math.sin(t * 3.1 + ph[1]) - Math.sin(ph[1])), sp.r * hb.lean * 0.8 * (Math.sin(t * 2.3 + ph[2]) - Math.sin(ph[2]))];
  const cy = Math.cos(sp.yaw);
  const sy = Math.sin(sp.yaw);
  const toWorld = (lx: number, lz: number): [number, number] => [sp.x + lx * cy + lz * sy, sp.z - lx * sy + lz * cy];

  // ---- the points round a ring: each stretch between two joints its own run, both its ends counted (a joint is two
  // points at one angle, the two blocks' own)
  const circ = TAU * sp.r * 1.08;
  const spacing = Math.max(2.2, circ / 72);
  const runs: { s: number; f: number; a: number }[] = [];
  for (let s = 0; s < S; s++) {
    const from = joints[s];
    const to = s + 1 < S ? joints[s + 1] : joints[0] + TAU;
    const n = Math.max(2, Math.ceil(((to - from) * sp.r) / spacing));
    for (let i = 0; i <= n; i++) runs.push({ s, f: i / n, a: a0 + from + ((to - from) * i) / n });
  }
  const M = runs.length;
  // its beds dip a few degrees one way (level at the water), and each bedding plane wanders a hand up and down round it
  const dipA = rnd() * TAU;
  const dip = (0.03 + 0.09 * rnd()) * (sp.form === 'tower' ? 0.5 : 1);
  const dipX = Math.cos(dipA) * dip;
  const dipZ = Math.sin(dipA) * dip;
  const wavy = (plane: number, a: number): number => 0.3 * Math.sin(a * 3 + plane * 2.1 + ph[0]) + 0.22 * Math.sin(a * 7 + plane * 5.3);

  // ---- the blocks of each bed
  const first = out.pos.length / 3;
  let rings = 0;
  const ringTop: number[] = [];
  const ringBottom: number[] = [];
  const widthAt: number[][] = [];
  let prevBlock: number[] = [];
  for (let b = 0; b < B; b++) {
    const bed = beds[b];
    const tMid = ((bed.y0 + bed.y1) * 0.5 - sp.level) / sp.h;
    const dry = !sea || bed.y0 > sp.level + 1;
    const block: number[] = [];
    const cav: number[] = [];
    const own: number[] = [];
    // (its joints step a little from bed to bed, as a wall's do from course to course)
    const shift: number[] = [];
    for (let s = 0; s < S; s++) {
      const gap = Math.min((s + 1 < S ? joints[s + 1] : joints[0] + TAU) - joints[s], joints[s] - (s > 0 ? joints[s - 1] : joints[S - 1] - TAU));
      shift.push((rnd() - 0.5) * 0.5 * gap);
    }
    for (let s = 0; s < S; s++) {
      // (a block now and then two beds tall: its neighbour under it carried up)
      let o = b > 0 && prevBlock.length && rnd() < hb.carry ? prevBlock[s] : (rnd() - 0.5) * 2 * hb.block;
      // (a stack's skirt: a ragged shelf, broad here and gone there)
      if (sea && b === 0) o = (rnd() - 0.4) * 0.34;
      let c = bed.cav;
      if (dry && b > 0 && b < B - 1 && rnd() < hb.fall) {
        o -= 0.1 + 0.11 * rnd();
        c = Math.max(c, 0.55);
      }
      for (const cl of clefts) {
        if (cl.s === s && tMid > cl.t0 && tMid < cl.t1) {
          o -= cl.d;
          c = Math.max(c, 0.8);
        } else if ((cl.s + 1) % S === s && tMid > cl.t0 + 0.08 && tMid < cl.t1 - 0.1) {
          o -= cl.d * 0.45;
          c = Math.max(c, 0.4);
        }
      }
      block.push(o);
      cav.push(c);
      own.push(rnd());
    }
    // (a block carried up keeps its own depth: the niches and the clefts are not carried)
    prevBlock = block.map((o, s) => (cav[s] > 0.3 ? column[s] * 0 + (rnd() - 0.5) * 2 * hb.block : o));
    const levels = bed.y1 - bed.y0 > 9 ? [bed.y0, (bed.y0 + bed.y1) * 0.5 + (rnd() - 0.5) * (bed.y1 - bed.y0) * 0.2, bed.y1] : [bed.y0, bed.y1];
    const isTop = b === B - 1;
    const widths: number[] = [];
    for (let li = 0; li < levels.length; li++) {
      const yy = levels[li];
      const t = (yy - sp.level) / sp.h;
      const prof = profile(yy);
      const [mx, mz] = mid(Math.max(0, t));
      const ringAt = first + rings * M;
      if (li === 0) ringBottom.push(ringAt);
      if (li === levels.length - 1) ringTop.push(ringAt);
      // (which bedding plane this level lies on: the bed's lower, its upper, or neither)
      const plane = li === 0 ? b : li === levels.length - 1 ? b + 1 : -1;
      const afloat = smooth(sp.level + 0.5, sp.level + 5, yy);
      for (let k = 0; k < M; k++) {
        const { s, f } = runs[k];
        const from = joints[s] + shift[s];
        const to = (s + 1 < S ? joints[s + 1] + shift[s + 1] : joints[0] + shift[0] + TAU);
        const a = a0 + from + (to - from) * f;
        let rr = sp.r * prof * plan(a) * (1 + bed.off + column[s] + block[s]);
        // a hand's roughness, in metres of the world: no face quite flat
        rr *= 1 + 0.022 * Math.sin(a * (3 + (b % 3)) + yy * 0.21 + ph[3]) + 0.014 * Math.sin(a * 9.1 + yy * 0.37 + ph[3]) + 0.01 * Math.sin(a * 23 + yy * 0.9);
        const lx = Math.cos(a) * rr + mx;
        const lz = Math.sin(a) * rr * sp.depth + mz;
        const [wx, wz] = toWorld(lx, lz);
        const yv = yy + afloat * ((plane >= 0 && b < B - 1 || plane === b ? wavy(plane, a) : 0) + dipX * lx + dipZ * lz);
        out.pos.push(wx - ax, yv - ay, wz - az);
        // (the top bed's rim carries the turf a little way down its wall)
        const g = isTop && li === levels.length - 1 ? 1.6 : isTop && li === levels.length - 2 ? Math.min(1, sp.green + 0.25) : sp.green;
        out.rock.push(own[s], yy - sp.level, cav[s], g);
        if (li === levels.length - 1) widths.push(rr);
      }
      rings++;
      // the sides of its blocks between this level and the one under it in the same bed
      if (li > 0) {
        const lo = ringAt - M;
        for (let k = 0; k < M; k++) {
          const a = lo + k;
          const bb = lo + ((k + 1) % M);
          out.idx.push(a, a + M, bb, bb, a + M, bb + M);
        }
      }
    }
    widthAt.push(widths);
    // the ledge (or the overhang) between the bed under and this one
    if (b > 0) {
      const lo = ringTop[b - 1];
      const hi = ringBottom[b];
      for (let k = 0; k < M; k++) {
        const kn = (k + 1) % M;
        out.idx.push(lo + k, hi + k, lo + kn, lo + kn, hi + k, hi + kn);
      }
    }
  }
  // ---- its top: level (a little crowned), turf on it
  const last = ringTop[B - 1];
  const [tx0, tz0] = mid(1);
  const [apx, apz] = toWorld(tx0, tz0);
  const apex = out.pos.length / 3;
  out.pos.push(apx - ax, top - ay + Math.min(1.6, sp.r * 0.06), apz - az);
  out.rock.push(0.5, sp.h, 0, 2);
  for (let k = 0; k < M; k++) out.idx.push(last + k, apex, last + ((k + 1) % M));

  // ---- where trees may stand: its top, and the ledges wide enough for one
  const rTop = sp.r * profile(top - 0.1) * meanR;
  perches.push({ x: apx, y: top, z: apz, room: rTop, top: true });
  for (let b = 1; b < B; b++) {
    const bed = beds[b];
    if (bed.y0 < sp.level + 4) continue;
    for (let k = 2; k < M; k += 5) {
      // (the bed under stands out past this one here: a ledge)
      const below = widthAt[b - 1][k];
      const t = (bed.y0 - sp.level) / sp.h;
      const here = sp.r * profile(bed.y0) * plan(runs[k].a) * (1 + bed.off + column[runs[k].s]);
      const room = below - here;
      if (room < 1.1 || rnd() > 0.55) continue;
      const [mx, mz] = mid(Math.max(0, t));
      const rr = below - room * 0.45;
      const [wx, wz] = toWorld(Math.cos(runs[k].a) * rr + mx, Math.sin(runs[k].a) * rr * sp.depth + mz);
      perches.push({ x: wx, y: bed.y0, z: wz, room, top: false });
    }
  }
  return (out.idx.length - startIdx) / 3;
}

/** an arch: where it stands as a spire does, its span from leg to leg */
export interface ArchSpec extends Omit<SpireSpec, 'form'> {
  span: number;
}

/**
 * An arch carved: a wall of beds and blocks along its turn, a door through it from the sea up to under its lintel,
 * its ends stepping down into the water; each block a box of its own depth.
 */
export function carveArch(sp: ArchSpec, out: RockOut, ax: number, ay: number, az: number, perches: RockPerch[]): void {
  const rnd = mulberry(Math.floor(sp.seed * 4294967295) ^ 0x2a7c);
  const crown = sp.level + sp.h;
  const cx = Math.cos(sp.yaw);
  const cz = Math.sin(sp.yaw);
  // (across the wall, level)
  const nx = -cz;
  const nz = cx;
  const half = sp.span * 0.5;
  const uMax = half + sp.r * 1.9;
  const doorHalf = Math.max(sp.r * 0.9, half - sp.r * 0.55);
  const doorH = sp.h * (0.6 + 0.1 * rnd());
  // its columns along the wall, its beds up it
  const us: number[] = [-uMax];
  while (us[us.length - 1] < uMax) us.push(Math.min(uMax, us[us.length - 1] + 1.7 + 1.3 * rnd()));
  const ys: number[] = [sp.foot, sp.level - 0.7, sp.level + 1.6 + 1.2 * rnd()];
  while (ys[ys.length - 1] < crown + sp.r * 0.3) ys.push(ys[ys.length - 1] + 2.2 + 2.6 * rnd());
  const NU = us.length - 1;
  const NY = ys.length - 1;
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  /** how high the wall stands along it: level over its door, stepping down at its ends */
  const topAt = (u: number): number => {
    const e = Math.abs(u) / uMax;
    const body = 1 - 0.1 * e * e + 0.05 * Math.sin(u * 0.19 + ph[0]) + 0.03 * Math.sin(u * 0.53 + ph[1]);
    const end = 1 - smooth(half + sp.r * 0.5, uMax + sp.r * 0.3, Math.abs(u)) * 0.82;
    return sp.level + sp.h * body * end;
  };
  const inDoor = (u: number, y: number): boolean => {
    if (y > sp.level + doorH || Math.abs(u) > doorHalf) return false;
    const v = Math.max(0, (y - sp.level) / doorH);
    // (a door wide at the water and rounded at its head)
    return Math.abs(u) / doorHalf < Math.pow(Math.max(0, 1 - Math.pow(v, 2.6)), 1 / 2.6);
  };
  const solid: boolean[] = [];
  const halfW: number[] = [];
  const own: number[] = [];
  const cav: number[] = [];
  const bedOff: number[] = [];
  let hard = rnd() < 0.5;
  for (let j = 0; j < NY; j++) {
    bedOff.push(j === 0 ? 0.22 : j === 1 ? -0.16 : hard ? 0.03 + 0.06 * rnd() : -0.02 - 0.05 * rnd());
    if (j > 1) hard = rnd() < 0.25 ? hard : !hard;
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NU; i++) {
      const uc = (us[i] + us[i + 1]) * 0.5;
      const yc = (ys[j] + ys[j + 1]) * 0.5;
      const is = yc < topAt(uc) && !inDoor(uc, yc);
      solid.push(is);
      // thicker at its legs' feet and toward its ends' middles, thinner in its lintel's top
      const t = (yc - sp.level) / sp.h;
      const leg = smooth(doorHalf * 0.7, doorHalf + sp.r, Math.abs(uc));
      let w = sp.r * sp.depth * (0.78 + 0.3 * leg + 0.14 * Math.pow(1 - smooth(-0.1, 0.3, t), 1.5) - 0.2 * Math.max(0, t - 0.6)) * (1 + bedOff[j]);
      let c = j === 1 ? 0.45 : 0;
      w *= 1 + 0.07 * Math.sin(uc * 0.23 + ph[0]) + (rnd() - 0.5) * 0.11;
      if (j > 1 && rnd() < 0.07) {
        w *= 0.84;
        c = 0.5;
      }
      halfW.push(w);
      own.push(rnd());
      cav.push(c);
    }
  }
  const at = (i: number, j: number): number => (i < 0 || i >= NU || j < 0 || j >= NY ? -1 : j * NU + i);
  // (its beds dip along it a few degrees, level at the water; its joints and its bedding planes wander a hand or two)
  const dip = (rnd() - 0.5) * 0.16;
  const P = (u: number, y: number, w: number): [number, number, number] => {
    const afloat = smooth(sp.level + 0.5, sp.level + 5, y);
    const du = afloat * 0.45 * Math.sin(y * 0.83 + u * 0.31 + ph[2]);
    const dy = afloat * (dip * u + 0.4 * Math.sin(u * 0.47 + y * 0.29 + ph[1]));
    return [sp.x + cx * (u + du) + nx * w - ax, y + dy - ay, sp.z + cz * (u + du) + nz * w - az];
  };
  /** a face of four corners (wound to face out), its block's number, its hollow, how green */
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], y0: number, y1: number, o: number, cv: number, g0: number, g1: number): void => {
    const v = out.pos.length / 3;
    out.pos.push(...a, ...b, ...c, ...d);
    out.rock.push(o, y0 - sp.level, cv, g0, o, y0 - sp.level, cv, g0, o, y1 - sp.level, cv, g1, o, y1 - sp.level, cv, g1);
    out.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NU; i++) {
      const k = at(i, j);
      if (!solid[k]) continue;
      const u0 = us[i];
      const u1 = us[i + 1];
      const y0 = ys[j];
      const y1 = Math.min(ys[j + 1], Math.max(topAt((u0 + u1) * 0.5), y0 + 0.6));
      const w = halfW[k];
      const o = own[k];
      const up = at(i, j + 1);
      const roofed = up >= 0 && solid[up];
      // (its top's turf a little way down its two faces)
      const g1 = roofed ? sp.green : Math.min(1, sp.green + 0.3);
      // its two faces
      quad(P(u0, y0, w), P(u1, y0, w), P(u1, y1, w), P(u0, y1, w), y0, y1, o, cav[k], sp.green, g1);
      quad(P(u1, y0, -w), P(u0, y0, -w), P(u0, y1, -w), P(u1, y1, -w), y0, y1, o, cav[k], sp.green, g1);
      // its sides: open where no block stands beside it, a step where its neighbour is thinner
      for (const [di, uu, flip] of [[-1, u0, true], [1, u1, false]] as const) {
        const n = at(i + di, j);
        const wn = n >= 0 && solid[n] ? halfW[n] : 0;
        if (wn >= w - 0.02) continue;
        const open = wn === 0;
        const cv = open && Math.abs(uu) < doorHalf + 0.5 ? Math.max(cav[k], 0.3) : cav[k];
        for (const side of [1, -1]) {
          const wa = open ? (side === 1 ? -w : 0) : side * wn;
          const wb = open ? (side === 1 ? w : 0) : side * w;
          if (open && side === -1) continue;
          const lo = Math.min(wa, wb);
          const hi = Math.max(wa, wb);
          if (flip) quad(P(uu, y0, lo), P(uu, y0, hi), P(uu, y1, hi), P(uu, y1, lo), y0, y1, o, cv, sp.green, g1);
          else quad(P(uu, y0, hi), P(uu, y0, lo), P(uu, y1, lo), P(uu, y1, hi), y0, y1, o, cv, sp.green, g1);
        }
      }
      // its top (turf where nothing stands on it) and its underside (the door's head, an overhang)
      for (const [dj, yy, isTop] of [[1, y1, true], [-1, y0, false]] as const) {
        const n = at(i, j + dj);
        const wn = n >= 0 && solid[n] ? halfW[n] : 0;
        if (wn >= w - 0.02) continue;
        const open = wn === 0;
        const g = isTop ? (open ? 2 : Math.min(1, sp.green + 0.35)) : sp.green * 0.3;
        const cv = isTop ? 0 : Math.max(cav[k], open ? 0.35 : 0.2);
        for (const side of [1, -1]) {
          if (open && side === -1) continue;
          const lo = open ? -w : side === 1 ? wn : -w;
          const hi = open ? w : side === 1 ? w : -wn;
          const v = out.pos.length / 3;
          const c0 = P(u0, yy, lo);
          const c1 = P(u1, yy, lo);
          const c2 = P(u1, yy, hi);
          const c3 = P(u0, yy, hi);
          out.pos.push(...c0, ...c1, ...c2, ...c3);
          for (let q = 0; q < 4; q++) out.rock.push(o, yy - sp.level, cv, g);
          if (isTop) out.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
          else out.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        }
      }
      if (!roofed && y1 > sp.level + sp.h * 0.55 && rnd() < 0.3) {
        const uc = (u0 + u1) * 0.5;
        perches.push({ x: sp.x + cx * uc, y: y1, z: sp.z + cz * uc, room: w, top: true });
      }
    }
  }
}

/**
 * Fallen blocks round a foot: each a block of six faces, its corners knocked about, half sunk; the biggest nearest
 * the rock. `level`: the sea's or the land's; `ground(x, z)` the land's height there (a stack's: its sea floor).
 */
export function strewBlocks(x: number, z: number, r: number, level: number, n: number, seed: number, sea: boolean, green: number, out: RockOut, ax: number, ay: number, az: number, ground: (x: number, z: number) => number): void {
  const rnd = mulberry(Math.floor(seed * 4294967295) ^ 0x9b1d);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = r * (1.05 + 0.95 * rnd() * rnd());
    const bx = x + Math.cos(a) * d;
    const bz = z + Math.sin(a) * d;
    const size = (0.7 + 2.3 * rnd() * rnd()) * Math.min(1.5, 0.6 + r / 24) * (1.4 - (d / r - 1) * 0.5);
    const g = ground(bx, bz);
    // (a stack's blocks: awash, their heads out of the water; none where the water is deep)
    if (sea && level - g > size * 2.2) continue;
    const base = sea ? Math.max(g, level - size * 0.9) : g - size * 0.35;
    const yaw = rnd() * TAU;
    const tilt = (rnd() - 0.5) * 0.5;
    const sx = size * (0.7 + 0.6 * rnd());
    const sz = size * (0.7 + 0.6 * rnd());
    const sh = size * (0.55 + 0.5 * rnd());
    const corners: [number, number, number][] = [];
    for (let c = 0; c < 8; c++) {
      const lx = (c & 1 ? 1 : -1) * sx * (0.6 + 0.5 * rnd()) * (c & 4 ? 0.8 : 1);
      const lz = (c & 2 ? 1 : -1) * sz * (0.6 + 0.5 * rnd()) * (c & 4 ? 0.8 : 1);
      const ly = (c & 4 ? 1 : 0) * sh * 2 * (0.6 + 0.6 * rnd()) + lx * tilt;
      corners.push([bx + lx * Math.cos(yaw) + lz * Math.sin(yaw) - ax, base + ly - ay, bz - lx * Math.sin(yaw) + lz * Math.cos(yaw) - az]);
    }
    const o = rnd();
    const face = (p: number, q: number, s: number, t: number, top: boolean): void => {
      const v = out.pos.length / 3;
      for (const c of [p, q, s, t]) {
        out.pos.push(...corners[c]);
        out.rock.push(o, corners[c][1] + ay - level, 0.1, top ? Math.min(1, green + 0.2) : green * 0.5);
      }
      out.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    };
    // (its four sides and its top, wound to face out)
    face(0, 4, 5, 1, false);
    face(1, 5, 7, 3, false);
    face(3, 7, 6, 2, false);
    face(2, 6, 4, 0, false);
    face(4, 6, 7, 5, true);
  }
}
