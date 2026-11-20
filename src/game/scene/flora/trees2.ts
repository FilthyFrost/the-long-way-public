/**
 * The toolkit's second round of trees (docs/V3/nodes/P3-kit-more.md): the kinds the first fourteen left out that
 * the fifty roads and the world's families need — each grown by its own botany, as trees.ts's are.
 *
 *   eucalyptus  a tall smooth pale trunk, often leaning, limbs rising from high up, an open crown of narrow leaves
 *               hanging in loose bunches at the limbs' ends, sky everywhere between them (the red outback's ghost
 *               gum, the volcanic coast's rainbow gum)
 *   willow      a short thick trunk parting low into a few great limbs, a broad dome whose twigs hang down to the
 *               ground in long curtains (the polders' canals)
 *   olive       a short gnarled trunk of twisting stems, a low rounded crown of small silvery clumps (the cypress hills,
 *               the lemon cliffs)
 *   mangrove    stilt roots arching out from the trunk into the tide and back, a dense low rounded crown
 *   tree_fern   a single slender trunk, a crown of long lacy fronds arching out from its top (the moss rainforest,
 *               the cloud-forest cliffs, the volcanic coast)
 *   juniper     a shrubby conifer: several stems, a ragged irregular crown of scale-leaf clumps
 *   cedar       a great conifer of flat horizontal plates on long limbs, broad and tiered, its top flattened
 */
import * as THREE from 'three';
import type { Out } from '../crowns/grow';
import { mulberry } from '../vegetation';
import { T_BAMBOO, T_BIRCH, T_CYPRESS, T_FERN, T_PINE, T_ROUND } from './atlas';
import { BOLE, BOUGH, LIMB, TAU, V3, smooth, writeFrond, type Clump, type Level, type Plan, type Tube } from './kit';

const curve = (pts: THREE.Vector3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts);
const clump = (c: V3, r: number, o: Partial<Clump> = {}): Clump => ({ c, r, sy: 0.8, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0, ...o });
const openness = (e: number, ny: number, lo = 0.3, hi = 0.92): number => Math.min(1, Math.max(0, (0.18 + 0.82 * smooth(e, lo, hi)) * (0.55 + 0.45 * smooth(ny, -0.6, 0.6))));

// ---- eucalyptus ----

export function planEucalyptus(seed: number, height = 22): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const girth = H * 0.022;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  // a tall bole leaning a little and bending back, smooth (pale: its second colour)
  const fork = H * (0.45 + 0.12 * random());
  const top = new V3(Math.cos(lean) * H * 0.08, fork, Math.sin(lean) * H * 0.08);
  const stem = curve([new V3(0, -0.4, 0), new V3(Math.cos(lean) * H * 0.05, fork * 0.5, Math.sin(lean) * H * 0.05), top]);
  tubes.push({ curve: stem, r0: girth, r1: girth * 0.72, cls: BOLE, flare: 0.35, furrow: 0.05, rowsAt: [8, 4] });
  const W = H * (0.24 + 0.05 * random());
  const centre = new V3(top.x, H * 0.75, top.z);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / (H * 0.3), (at.z - centre.z) / W), n.y, 0.35, 0.95);
  const limbs = 3 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = lean + ((i + 0.3 * random()) / limbs) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const len = (H - fork) * (0.75 + 0.3 * random());
    // rising steeply, then out
    const mid = top.clone().addScaledVector(out, len * 0.25).add(new V3(0, len * 0.55, 0));
    const end = top.clone().addScaledVector(out, W * (0.7 + 0.35 * random())).add(new V3(0, len * (0.75 + 0.2 * random()), 0));
    const limb = curve([top.clone(), mid, end]);
    tubes.push({ curve: limb, r0: girth * 0.5, r1: girth * 0.12, cls: LIMB, furrow: 0.05 });
    // two or three twigs off its upper part, a loose hanging bunch at each end
    for (let k = 0; k < 3; k++) {
      const from = limb.getPoint(0.55 + 0.15 * k);
      const b = a + (random() - 0.5) * 2.2;
      const tip = from.clone().add(new V3(Math.cos(b) * W * 0.35, H * (0.02 + 0.06 * random()), Math.sin(b) * W * 0.35));
      tubes.push({ curve: new THREE.LineCurve3(from, tip), r0: girth * 0.12, r1: girth * 0.04, cls: BOUGH });
      clumps.push(clump(tip.clone().add(new V3(0, -H * 0.02, 0)), W * (0.26 + 0.08 * random()), { sy: 0.7, droop: 0.55, bare: random() < 0.5 }));
    }
    clumps.push(clump(end.clone(), W * 0.3, { sy: 0.7, droop: 0.45 }));
  }
  return { tubes, clumps, tile: T_BAMBOO, spray: W * 0.22, cards: 34, rRef: W * 0.3, openAt, crownY: centre.y };
}

// ---- willow ----

export function planWillow(seed: number, height = 12): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const W = H * (0.55 + 0.08 * random());
  const bole = H * (0.2 + 0.05 * random());
  const girth = H * 0.05;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const top = new V3(Math.cos(lean) * bole * 0.2, bole, Math.sin(lean) * bole * 0.2);
  tubes.push({ curve: curve([new V3(0, -0.4, 0), new V3(Math.cos(lean) * bole * 0.1, bole * 0.5, Math.sin(lean) * bole * 0.1), top]), r0: girth, r1: girth * 0.8, cls: BOLE, flare: 0.8, furrow: 0.9, extraSides: 1 });
  const centre = new V3(0, H * 0.6, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x / W, (at.y - centre.y) / (H * 0.45), at.z / W), n.y, 0.4, 0.95);
  const limbs = 4 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = lean + ((i + 0.3 + 0.4 * random()) / limbs) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    // up and out to the dome's shoulder
    const p1 = top.clone().addScaledVector(out, W * 0.3).add(new V3(0, H * 0.35, 0));
    const p2 = top.clone().addScaledVector(out, W * (0.65 + 0.2 * random())).add(new V3(0, H * (0.55 + 0.1 * random()), 0));
    const limb = curve([top.clone(), p1, p2]);
    tubes.push({ curve: limb, r0: girth * 0.45, r1: girth * 0.15, cls: LIMB, furrow: 0.6 });
    // the dome's clumps along the limb's outer part: their twigs hang far down, in curtains
    for (let k = 0; k < 3; k++) {
      const c = limb.getPoint(0.5 + 0.25 * k).add(new V3(0, H * 0.03, 0)).addScaledVector(out, W * 0.08 * k);
      clumps.push(clump(c, W * (0.32 + 0.06 * random()), { sy: 0.7, droop: 0.55, curtain: 0.2, out: out.clone(), hangLong: 3.0 }));
    }
  }
  clumps.push(clump(new V3(0, H * 0.92, 0), W * 0.38, { sy: 0.6, droop: 0.4, hangLong: 2.5 }));
  return { tubes, clumps, tile: T_BIRCH, spray: W * 0.26, cards: 36, rRef: W * 0.34, openAt, crownY: centre.y };
}

// ---- olive ----

export function planOlive(seed: number, height = 6): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const W = H * (0.55 + 0.1 * random());
  const bole = H * (0.3 + 0.08 * random());
  const girth = H * 0.05;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  // the old olive's trunk: two or three stems twisting round each other, parting at the crotch
  const stems = 2 + Math.floor(random() * 2);
  const crotch = new V3(Math.cos(lean) * H * 0.08, bole, Math.sin(lean) * H * 0.08);
  for (let k = 0; k < stems; k++) {
    const pts: V3[] = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const a = lean + (k / stems) * TAU + t * (1.4 + 0.3 * k);
      const r = girth * (0.9 - 0.5 * t) * (0.6 + 0.4 * Math.sin(Math.PI * t));
      pts.push(new V3(crotch.x * t + Math.cos(a) * r, -0.3 + (bole + 0.3) * t, crotch.z * t + Math.sin(a) * r));
    }
    tubes.push({ curve: curve(pts), r0: girth * 0.55, r1: girth * 0.38, cls: BOLE, flare: 0.4, furrow: 1 });
  }
  const centre = new V3(crotch.x, bole + (H - bole) * 0.5, crotch.z);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / ((H - bole) * 0.55), (at.z - centre.z) / W), n.y, 0.35, 0.95);
  const limbs = 4 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = lean + ((i + 0.3 + 0.4 * random()) / limbs) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const end = crotch.clone().addScaledVector(out, W * (0.6 + 0.3 * random())).add(new V3(0, (H - bole) * (0.45 + 0.25 * random()), 0));
    const mid = crotch.clone().lerp(end, 0.5).add(new V3((random() - 0.5) * W * 0.25, 0, (random() - 0.5) * W * 0.25));
    tubes.push({ curve: curve([crotch.clone(), mid, end]), r0: girth * 0.35, r1: girth * 0.1, cls: LIMB, furrow: 0.8 });
    clumps.push(clump(end.clone().add(new V3(0, W * 0.05, 0)), W * (0.3 + 0.08 * random()), { sy: 0.65 }));
    clumps.push(clump(mid.clone().add(new V3(0, W * 0.12, 0)).addScaledVector(out, W * 0.1), W * (0.24 + 0.06 * random()), { sy: 0.65 }));
  }
  clumps.push(clump(new V3(crotch.x, H * 0.9, crotch.z), W * 0.32, { sy: 0.6 }));
  return { tubes, clumps, tile: T_ROUND, spray: W * 0.16, cards: 40, rRef: W * 0.3, openAt, crownY: centre.y };
}

// ---- mangrove ----

export function planMangrove(seed: number, height = 7): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const W = H * (0.6 + 0.1 * random());
  const girth = H * 0.035;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const stilt = H * 0.28;
  const bole = H * 0.45;
  tubes.push({ curve: curve([new V3(0, stilt * 0.6, 0), new V3(0.05, bole * 0.7, 0), new V3(0, bole, 0.05)]), r0: girth, r1: girth * 0.8, cls: BOLE, furrow: 0.3 });
  // the stilt roots: out from the trunk above the tide line, arching down into the mud
  const roots = 8 + Math.floor(random() * 4);
  for (let i = 0; i < roots; i++) {
    const a = i * 2.39996 + random() * 0.4;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const from = new V3(0, stilt * (0.55 + 0.6 * random()), 0);
    const reach = W * (0.35 + 0.2 * random());
    const knee = from.clone().addScaledVector(out, reach * 0.55).add(new V3(0, stilt * 0.35, 0));
    const foot = new V3(out.x * reach, -0.3, out.z * reach);
    tubes.push({ curve: curve([from, knee, foot]), r0: girth * 0.35, r1: girth * 0.18, cls: LIMB, furrow: 0.2 });
  }
  const centre = new V3(0, bole + (H - bole) * 0.5, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x / W, (at.y - centre.y) / ((H - bole) * 0.6), at.z / W), n.y, 0.35, 0.95);
  const limbs = 4;
  for (let i = 0; i < limbs; i++) {
    const a = ((i + 0.5 * random()) / limbs) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const end = new V3(0, bole, 0).addScaledVector(out, W * 0.65).add(new V3(0, (H - bole) * 0.45, 0));
    tubes.push({ curve: curve([new V3(0, bole, 0), new V3(0, bole, 0).lerp(end, 0.5).add(new V3(0, H * 0.04, 0)), end]), r0: girth * 0.45, r1: girth * 0.12, cls: BOUGH });
    clumps.push(clump(end.clone().add(new V3(0, W * 0.05, 0)), W * 0.34, { sy: 0.62 }));
    // (and one nearer the trunk: the crown is dense, a dome over the roots)
    clumps.push(clump(new V3(0, bole, 0).lerp(end, 0.5).add(new V3(0, W * 0.16, 0)), W * 0.3, { sy: 0.62 }));
  }
  clumps.push(clump(new V3(0, H * 0.88, 0), W * 0.38, { sy: 0.6 }));
  return { tubes, clumps, tile: T_ROUND, spray: W * 0.16, cards: 46, rRef: W * 0.34, openAt, crownY: centre.y };
}

// ---- tree fern ----

export function planTreeFern(seed: number, height = 5): Plan {
  const random = mulberry(seed);
  const H = height * (0.8 + 0.4 * random());
  const lean = random() * TAU;
  const head = new V3(Math.cos(lean) * H * 0.06, H, Math.sin(lean) * H * 0.06);
  const r0 = H * 0.035;
  // a straight furry trunk, a little thicker at its foot and under its crown
  const tubes: Tube[] = [{ curve: curve([new V3(0, -0.2, 0), new V3(head.x * 0.4, H * 0.5, head.z * 0.4), head.clone()]), r0: r0 * 1.2, r1: r0 * 1.05, cls: BOLE, flare: 0.3, furrow: 0.6, sidesAt: [7, 5], rowsAt: [6, 3] }];
  const fronds = 10 + Math.floor(random() * 4);
  const spec: { a: number; el: number; len: number }[] = [];
  for (let k = 0; k < fronds; k++) spec.push({ a: k * 2.39996 + random() * 0.3, el: 0.9 - 1.1 * (k / fronds) + (random() - 0.5) * 0.2, len: H * (0.5 + 0.12 * random()) });
  const openAt = (at: V3, n: V3): number => openness(at.distanceTo(head) / (H * 0.6), n.y, 0.2, 0.9);
  const segsAt = [8, 4];
  const extra = (out: Out, level: Level, rnd: () => number): void => {
    for (const f of spec) {
      const d = new V3(Math.cos(f.a) * Math.cos(f.el), Math.sin(f.el), Math.sin(f.a) * Math.cos(f.el));
      const p1 = head.clone().addScaledVector(d, f.len * 0.5).add(new V3(0, f.len * 0.08, 0));
      const p2 = head.clone().addScaledVector(new V3(d.x, 0, d.z).normalize(), f.len * 0.95).add(new V3(0, f.len * (Math.sin(f.el) * 0.5 - 0.3), 0));
      writeFrond(out, new THREE.QuadraticBezierCurve3(head.clone(), p1, p2), (t) => f.len * 0.2 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)) + 0.03, segsAt[level], 0.25, T_FERN, head, 0.8, rnd);
    }
  };
  return {
    tubes,
    clumps: [clump(head.clone().add(new V3(0, 0.1, 0)), H * 0.08, { sy: 0.8 })],
    tile: T_FERN,
    spray: H * 0.1,
    cards: 4,
    rRef: H * 0.08,
    openAt,
    crownY: head.y,
    extra,
    extraTris: (level) => spec.length * segsAt[level] * 4,
    least: [2, 0],
  };
}

// ---- juniper ----

export function planJuniper(seed: number, height = 5): Plan {
  const random = mulberry(seed);
  const H = height * (0.85 + 0.3 * random());
  const W = H * (0.4 + 0.1 * random());
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const stems = 2 + Math.floor(random() * 2);
  const centre = new V3(0, H * 0.5, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x / W, (at.y - centre.y) / (H * 0.55), at.z / W), n.y, 0.3, 0.95);
  for (let k = 0; k < stems; k++) {
    const a = (k / stems) * TAU + random() * 0.8;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const top = new V3(0, H * (0.75 + 0.2 * random()), 0).addScaledVector(out, W * 0.35);
    const stem = curve([new V3(0, -0.2, 0), new V3(0, H * 0.4, 0).addScaledVector(out, W * 0.15), top]);
    tubes.push({ curve: stem, r0: H * 0.03, r1: H * 0.008, cls: BOLE, furrow: 0.8 });
    // ragged clumps up the stem, out to its side
    const n = 5 + Math.floor(random() * 3);
    for (let i = 0; i < n; i++) {
      const t = 0.2 + 0.8 * (i / n);
      const b = a + (random() - 0.5) * 2.2;
      const c = stem.getPoint(t).add(new V3(Math.cos(b) * W * 0.3 * (1 - 0.5 * t), 0, Math.sin(b) * W * 0.3 * (1 - 0.5 * t)));
      clumps.push(clump(c, W * (0.32 - 0.12 * t) * (0.8 + 0.4 * random()), { sy: 1.05 }));
    }
  }
  return { tubes, clumps, tile: T_CYPRESS, spray: W * 0.3, cards: 22, rRef: W * 0.26, openAt, crownY: centre.y, least: [5, 2] };
}

// ---- cedar ----

export function planCedar(seed: number, height = 18): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const R = H * (0.38 + 0.06 * random());
  const girth = H * 0.03;
  const lean = random() * TAU;
  const tubes: Tube[] = [{ curve: curve([new V3(0, -0.5, 0), new V3(Math.cos(lean) * girth, H * 0.5, Math.sin(lean) * girth), new V3(Math.cos(lean) * girth * 2, H * 0.92, Math.sin(lean) * girth * 2)]), r0: girth, r1: girth * 0.25, cls: BOLE, flare: 0.6, furrow: 0.9 }];
  const clumps: Clump[] = [];
  const y0 = H * 0.25;
  const envelope = (t: number): number => R * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.8))) * (1 - 0.45 * t * t);
  const openAt = (at: V3, n: V3): number => {
    const t = Math.min(1, Math.max(0, (at.y - y0) / (H - y0)));
    return openness(Math.hypot(at.x, at.z) / Math.max(0.5, envelope(t)), n.y, 0.3, 0.95);
  };
  // a few tiers of long level limbs, each holding up a flat plate of foliage at its end and along it
  const tiers = 5 + Math.floor(random() * 2);
  let turn = random() * TAU;
  for (let i = 0; i < tiers; i++) {
    const t = (i + 0.3 + 0.4 * random()) / tiers;
    const y = y0 + t * (H * 0.9 - y0);
    const n = 4 + Math.floor(random() * 2) - (t > 0.75 ? 1 : 0);
    turn += 2.39996;
    for (let b = 0; b < n; b++) {
      const a = turn + (b / n) * TAU + (random() - 0.5) * 0.6;
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const len = envelope(t) * (0.85 + 0.25 * random());
      const from = new V3(Math.cos(lean) * girth * 2 * (y / H), y, Math.sin(lean) * girth * 2 * (y / H));
      const end = from.clone().addScaledVector(out, len).add(new V3(0, len * 0.08, 0));
      const limb = curve([from, from.clone().lerp(end, 0.5).add(new V3(0, -len * 0.04, 0)), end]);
      tubes.push({ curve: limb, r0: girth * 0.3, r1: girth * 0.06, cls: BOUGH, sidesAt: [4, 3], rowsAt: [3, 2] });
      for (let k = 0; k < 2; k++) {
        const c = limb.getPoint(k === 0 ? 0.98 : 0.6).add(new V3(0, R * 0.04, 0));
        clumps.push(clump(c, len * (k === 0 ? 0.36 : 0.3) * (0.85 + 0.3 * random()), { sy: 0.36, stretch: 1.3, along: out.clone(), shelf: 0.7, flat: 0.12, out: out.clone(), bare: k > 0 }));
      }
    }
  }
  return { tubes, clumps, tile: T_PINE, spray: R * 0.13, cards: 30, rRef: R * 0.3, openAt, crownY: y0 + (H - y0) * 0.5, least: [5, 2] };
}
