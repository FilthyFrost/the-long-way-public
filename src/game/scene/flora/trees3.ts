/**
 * The plant toolkit's third round of trees (docs/V3/nodes/P2-A-kit-default.md): the last of the world's tree families
 * it had no kind for — the redwood, the rimu, the Joshua tree (the Chilean firebush grows as the cherry does, in its
 * own colours). Each a plan of the toolkit's parts (kit.ts), drawn within its budget by the same fitter.
 *
 *   redwood   a column of a tree: a bole thick and fluted at the foot, bare for a third of its height, then short,
 *             drooping branches in many close tiers, the crown hardly narrowing until near the top
 *   rimu      a weeping conifer: a few limbs rising out of a short trunk, every clump of its fine foliage hanging in
 *             long strands
 *   joshua    a desert yucca grown into a tree: a shaggy trunk forking two or three times at uneven angles, every
 *             branch ending in a ball of stiff, spiky leaves
 */
import * as THREE from 'three';
import { mulberry } from '../vegetation';
import { T_CYPRESS, T_ROSETTE, T_SPRUCE } from './atlas';
import { BOLE, BOUGH, LIMB, TAU, TWIG, V3, smooth, type Clump, type Plan, type Tube } from './kit';

const curve = (pts: THREE.Vector3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts);
const clump = (c: V3, r: number, o: Partial<Clump> = {}): Clump => ({ c, r, sy: 0.8, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0, ...o });
const openness = (e: number, ny: number, lo = 0.3, hi = 0.92): number => Math.min(1, Math.max(0, (0.18 + 0.82 * smooth(e, lo, hi)) * (0.55 + 0.45 * smooth(ny, -0.6, 0.6))));

// ---- redwood ----

export function planRedwood(seed: number, height = 26): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const R = H * (0.1 + 0.02 * random());
  const girth = H * 0.032;
  const lean = random() * TAU;
  const tip = new V3(Math.cos(lean) * H * 0.012, H, Math.sin(lean) * H * 0.012);
  const tubes: Tube[] = [{ curve: curve([new V3(0, -0.6, 0), new V3(Math.cos(lean + 2) * girth * 0.2, H * 0.45, Math.sin(lean + 2) * girth * 0.2), tip]), r0: girth, r1: girth * 0.1, cls: BOLE, flare: 1.1, furrow: 0.9, extraSides: 2 }];
  const clumps: Clump[] = [];
  // the crown: from a third of the way up, hardly narrowing until its last fifth
  const y0 = H * (0.42 + 0.08 * random());
  const span = H * 0.97 - y0;
  const envelope = (t: number): number => R * (t < 0.78 ? 0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, t * 1.4)) : Math.max(0.12, (1 - t) / 0.22));
  const openAt = (at: V3, n: V3): number => {
    const t = Math.min(1, Math.max(0, (at.y - y0) / span));
    const e = Math.hypot(at.x, at.z) / Math.max(0.3, envelope(t));
    return Math.min(1, openness(e, n.y) * (0.6 + 0.4 * smooth(t, 0, 0.5)));
  };
  const tiers = 13 + Math.floor(random() * 3);
  let turn = random() * TAU;
  for (let i = 0; i < tiers; i++) {
    const t = (i + 0.3 + 0.4 * random()) / tiers;
    const y = y0 + t * span;
    const reach = envelope(t) * (0.85 + 0.3 * random());
    const from = new V3(tip.x * (y / H), y, tip.z * (y / H));
    clumps.push(clump(from.clone(), reach * 0.5, { sy: 0.5, shelf: 0.5, curtain: 0.25 }));
    const n = 3 + Math.floor(random() * 2);
    turn += 2.39996;
    for (let b = 0; b < n; b++) {
      const a = turn + (b / n) * TAU + (random() - 0.5) * 0.8;
      const outward = new V3(Math.cos(a), 0, Math.sin(a));
      const len = reach * (0.8 + 0.3 * random());
      // short branches, drooping, and lifting again at their ends
      const end = from.clone().addScaledVector(outward, len).add(new V3(0, -len * 0.18, 0));
      const branch = curve([from, from.clone().lerp(end, 0.5).add(new V3(0, -len * 0.12, 0)), end]);
      if (i < 3) tubes.push({ curve: branch, r0: girth * 0.14, r1: girth * 0.04, cls: TWIG });
      clumps.push(clump(branch.getPoint(0.7), Math.max(0.5, len * 0.5), { sy: 0.45, stretch: 1.3, along: outward.clone(), shelf: 0.6, curtain: 0.45, out: outward.clone() }));
    }
  }
  return { tubes, clumps, tile: T_SPRUCE, spray: H * 0.05, cards: 16, rRef: R * 0.42, openAt, crownY: y0 + span * 0.45, least: [5, 2] };
}

// ---- rimu ----

export function planRimu(seed: number, height = 18): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const W = H * (0.26 + 0.05 * random());
  const bole = H * (0.32 + 0.06 * random());
  const girth = H * 0.035;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const top = new V3(Math.cos(lean) * H * 0.02, H * 0.92, Math.sin(lean) * H * 0.02);
  const stem = curve([new V3(0, -0.4, 0), new V3(Math.cos(lean) * H * 0.01, bole, Math.sin(lean) * H * 0.01), top]);
  tubes.push({ curve: stem, r0: girth, r1: girth * 0.2, cls: BOLE, flare: 0.5, furrow: 0.5, extraSides: 1 });
  const centre = new V3(0, (bole + H) * 0.55, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x / W, (at.y - centre.y) / (H * 0.4), at.z / W), n.y, 0.35, 0.95);
  // limbs up out of the stem, the crown's clumps along them, every one of them hanging in long strands
  const limbs = 6 + Math.floor(random() * 3);
  for (let i = 0; i < limbs; i++) {
    const u = (i + 0.5) / limbs;
    const from = stem.getPoint(0.42 + 0.48 * u);
    const a = lean + i * 2.39996 + random() * 0.5;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const len = W * (1.0 - 0.45 * u) * (0.8 + 0.3 * random());
    const end = from.clone().addScaledVector(out, len).add(new V3(0, len * 0.55, 0));
    const limb = curve([from, from.clone().lerp(end, 0.5).addScaledVector(out, len * 0.08), end]);
    tubes.push({ curve: limb, r0: girth * 0.32 * (1 - 0.5 * u), r1: girth * 0.08, cls: LIMB, furrow: 0.3 });
    for (let k = 0; k < 2; k++) {
      clumps.push(clump(limb.getPoint(0.55 + 0.35 * k), W * (0.34 - 0.1 * u) * (0.85 + 0.3 * random()), { sy: 0.75, droop: 0.65, curtain: 0.3, out: out.clone(), hangLong: 2.4 }));
    }
  }
  clumps.push(clump(top.clone(), W * 0.24, { sy: 0.9, droop: 0.5, hangLong: 1.8 }));
  return { tubes, clumps, tile: T_CYPRESS, spray: W * 0.3, cards: 30, rRef: W * 0.3, openAt, crownY: centre.y };
}

// ---- Joshua tree ----

export function planJoshua(seed: number, height = 8): Plan {
  const random = mulberry(seed);
  const H = height * (0.85 + 0.3 * random());
  const bole = H * (0.24 + 0.1 * random());
  const girth = H * 0.075;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const lean = random() * TAU;
  const top = new V3(Math.cos(lean) * bole * 0.12, bole, Math.sin(lean) * bole * 0.12);
  // the trunk shaggy with dead leaves: deeply furrowed, thick for its height
  tubes.push({ curve: curve([new V3(0, -0.3, 0), new V3(Math.cos(lean) * bole * 0.05, bole * 0.5, Math.sin(lean) * bole * 0.05), top]), r0: girth, r1: girth * 0.85, cls: BOLE, flare: 0.3, furrow: 1.0, extraSides: 1 });
  const openAt = (_at: V3, n: V3): number => Math.min(1, 0.55 + 0.45 * smooth(n.y, -0.3, 0.6));
  // fork upon fork at uneven angles; every end a ball of spiky leaves
  const grow = (from: V3, dir: V3, depth: number, r: number): void => {
    const len = (H - bole) * (0.42 - depth * 0.08) * (0.75 + 0.5 * random());
    const end = from.clone().addScaledVector(dir, len);
    const mid = from.clone().lerp(end, 0.5).add(new V3((random() - 0.5) * len * 0.25, 0, (random() - 0.5) * len * 0.25));
    tubes.push({ curve: curve([from, mid, end]), r0: r, r1: r * 0.8, cls: depth === 0 ? LIMB : BOUGH, furrow: 0.9 });
    const fork = depth < 2 && random() < (depth === 0 ? 1 : 0.7);
    if (fork) {
      const k = 2 + (random() < 0.3 ? 1 : 0);
      for (let j = 0; j < k; j++) {
        const a = Math.atan2(dir.z, dir.x) + (j - (k - 1) / 2) * (0.9 + 0.5 * random());
        const up = 0.35 + 0.45 * random();
        const d = new V3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize();
        grow(end, d, depth + 1, r * 0.8);
      }
    } else {
      clumps.push(clump(end.clone().addScaledVector(dir, H * 0.045), H * (0.1 + 0.03 * random()), { sy: 1.05, open: 0.7, out: dir.clone() }));
    }
  };
  const first = 2 + (random() < 0.6 ? 1 : 0);
  for (let i = 0; i < first; i++) {
    const a = lean + (i / first) * TAU + random() * 0.6;
    const up = 0.45 + 0.3 * random();
    grow(top, new V3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize(), 0, girth * 0.8);
  }
  return { tubes, clumps, tile: T_ROSETTE, spray: H * 0.062, cards: 18, rRef: H * 0.09, openAt, crownY: bole + (H - bole) * 0.5 };
}
