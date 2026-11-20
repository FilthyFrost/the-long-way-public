/**
 * The toolkit's trees (docs/V3/nodes/P2-flora.md): eleven kinds that the fifty roads' trees grow from
 * (docs/V3/research/scenic-50.md §7), each grown by its own botany and drawn by the kit (kit.ts) within its
 * budget. A kind's plan is the same at every level; a seed always grows the same tree.
 *
 *   spruce   excurrent: one stem to a sharp leader; whorls of branches, shorter towards the top, low ones sweeping
 *            down and turning their tips up; foliage in shelves along them, a curtain of branchlets hanging from
 *            their outer edges; each tier's dark core round the stem. Tiers of skirts narrowing to a spire.
 *   oak      decurrent and sympodial: a short thick bole soon dividing into a few great limbs leaning far out,
 *            each going on in zig-zags; foliage in a few big lobes with sky between; wider than tall.
 *   pine     a mature open-grown pine: bare bole for half its height with a few dead stubs, cinnamon plates;
 *            above, stout limbs in loose whorls holding their needles up in separate bunches; a rounded head.
 *            `umbrella`: a stone pine's — the bole bare to high up, the limbs all rising out to a flat dome.
 *   birch    a slender white stem through its crown, thin branches rising and their twigs weeping; an airy crown
 *            of small clumps whose leaves hang on threads. `column`: a Lombardy poplar's, every branch hugging
 *            the stem.
 *   cherry   a short bole parting into wide-spreading limbs that arch over; the crown a broad low cloud of
 *            blossom, wider than tall.
 *   cypress  an Italian cypress: a narrow flame of foliage the whole height of a hidden stem, swelling a little
 *            below its middle and drawn to a point.
 *   palm     a coconut palm: a slender stem curving up from a swollen foot; a head of long arching fronds, the
 *            young ones up, the old drooping; nuts under the head.
 *   acacia   an umbrella thorn: a short bole forking into limbs that rise and fork again and spread out to a flat
 *            table of foliage, wider than the tree is tall. `dragon`: a dragon's blood tree — fork upon fork,
 *            every branch rising, to a dense umbrella turned up like a mushroom's cap.
 *   bamboo   a clump of culms rising from one place, leaning out and arching over at their tops, leafy in their
 *            upper halves.
 *   saguaro  a ribbed column with a rounded top, and arms that go out from it and turn up at an elbow.
 *   baobab   a huge bottle of a trunk, smooth, and at its top short branches spreading like roots, a few tufts of
 *            leaves at their ends.
 */
import * as THREE from 'three';
import type { Out } from '../crowns/grow';
import { mulberry } from '../vegetation';
import { T_ACACIA, T_BAMBOO, T_BIRCH, T_CHERRY, T_CYPRESS, T_FROND, T_OAK, T_PINE, T_ROSETTE, T_ROUND, T_SPRUCE } from './atlas';
import { BOLE, BOUGH, LIMB, PART_SOLID, TAU, TWIG, V3, smooth, writeFrond, writeRibbed, type Clump, type Level, type Plan, type Tube } from './kit';

const curve = (pts: THREE.Vector3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts);
const clump = (c: V3, r: number, o: Partial<Clump> = {}): Clump => ({ c, r, sy: 0.8, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0, ...o });

/** an envelope's openness: the skin open, the inside and the underside deep */
function openness(e: number, ny: number, lo = 0.3, hi = 0.92): number {
  return Math.min(1, Math.max(0, (0.18 + 0.82 * smooth(e, lo, hi)) * (0.55 + 0.45 * smooth(ny, -0.6, 0.6))));
}

// ---- spruce ----

export function planSpruce(seed: number, height = 18): Plan {
  const random = mulberry(seed);
  const H = height * (0.92 + 0.16 * random());
  const R = H * (0.24 + 0.04 * random());
  const girth = H * 0.018;
  const lean = random() * TAU;
  const tip = new V3(Math.cos(lean) * H * 0.01, H, Math.sin(lean) * H * 0.01);
  const tubes: Tube[] = [{ curve: curve([new V3(0, -0.5, 0), new V3(Math.cos(lean + 2) * girth * 0.3, H * 0.5, Math.sin(lean + 2) * girth * 0.3), tip]), r0: girth, r1: girth * 0.08, cls: BOLE, flare: 0.6, furrow: 0.25 }];
  const clumps: Clump[] = [];
  const y0 = H * 0.05;
  const span = H * 0.95 - y0;
  const envelope = (t: number): number => R * Math.pow(1 - t, 1.05) * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
  const openAt = (at: V3, n: V3): number => {
    const t = Math.min(1, Math.max(0, (at.y - y0) / span));
    const e = Math.hypot(at.x, at.z) / Math.max(0.3, envelope(t));
    return Math.min(1, openness(e, n.y) * (0.55 + 0.45 * smooth(t, 0, 0.6)) + (t > 0.9 ? 0.15 : 0));
  };
  const tiers = 12 + Math.floor(random() * 3);
  let turn = random() * TAU;
  for (let i = 0; i < tiers; i++) {
    const t = Math.pow((i + 0.25 + 0.5 * random()) / tiers, 0.92);
    const y = y0 + t * span;
    const reach = envelope(t) * (0.9 + 0.2 * random());
    const from = new V3(tip.x * (y / H), y, tip.z * (y / H));
    // the tier's dark heart round the stem: its core is the mass the shelves stand out from
    clumps.push(clump(from.clone().add(new V3(0, -reach * 0.1, 0)), reach * 0.42, { sy: 0.36, shelf: 0.7, curtain: 0.3 }));
    const n = Math.max(3, Math.round(4.6 - 1.6 * t + (random() - 0.5)));
    turn += 2.39996;
    for (let b = 0; b < n; b++) {
      const a = turn + (b / n) * TAU + (random() - 0.5) * 0.7;
      const outward = new V3(Math.cos(a), 0, Math.sin(a));
      const rise = 0.35 * smooth(t, 0.55, 1) - 0.32 * (1 - t);
      const len = reach * (0.88 + 0.22 * random());
      const end = from.clone().addScaledVector(outward, len).add(new V3(0, len * rise, 0));
      const mid = from.clone().lerp(end, 0.55).add(new V3(0, -len * 0.16 * (1 - t), 0));
      end.y += len * 0.06 * (1 - t);
      const branch = curve([from, mid, end]);
      // (only the lowest branches show their wood, under the skirts)
      if (i < 2) tubes.push({ curve: branch, r0: girth * 0.22, r1: girth * 0.04, cls: TWIG });
      // its foliage: one long shelf along it, a curtain of branchlets hanging from its edge
      clumps.push(clump(branch.getPoint(0.62), Math.max(0.4, len * 0.42), { sy: 0.4, stretch: 1.55, along: outward.clone(), shelf: 0.82, curtain: 0.4 + 0.25 * (1 - t), out: outward.clone(), bare: true }));
    }
  }
  for (let k = 0; k < 3; k++) {
    const u = (k + 1) / 4;
    clumps.push(clump(new V3(tip.x, H * (0.93 + 0.065 * u), tip.z), H * 0.016 * (1.3 - u), { sy: 1.4, shelf: 0.2, open: 0.9 }));
  }
  return { tubes, clumps, tile: T_SPRUCE, spray: H * 0.075, cards: 16, rRef: R * 0.32, openAt, crownY: y0 + span * 0.4, least: [5, 2] };
}

// ---- oak ----

export function planOak(seed: number, height = 14): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const W = H * (0.5 + 0.08 * random());
  const bole = H * (0.19 + 0.05 * random());
  const girth = H * 0.045;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const lean = random() * TAU;
  const top = new V3(Math.cos(lean) * bole * 0.12, bole, Math.sin(lean) * bole * 0.12);
  tubes.push({ curve: curve([new V3(0, -0.6, 0), new V3(Math.cos(lean + 1) * girth * 0.3, bole * 0.5, Math.sin(lean + 1) * girth * 0.3), top]), r0: girth, r1: girth * 0.82, cls: BOLE, flare: 0.9, furrow: 1, extraSides: 2 });
  const crownY = bole + (H - bole) * 0.45;
  const centre = new V3(0, crownY, 0);
  const openAt = (at: V3, n: V3): number => {
    const e = Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / ((H - bole) * 0.55), (at.z - centre.z) / W);
    return Math.min(1, Math.max(0, (0.2 + 0.8 * smooth(e, 0.38, 0.95)) * (0.5 + 0.5 * smooth(n.y, -0.7, 0.5))));
  };
  const limbs = 4 + Math.floor(random() * 2);
  const limb = (from: V3, dir: V3, len: number, r: number, depth: number): void => {
    let at = from.clone();
    let d = dir.clone();
    const pts = [at.clone()];
    const segs = depth === 0 ? 3 : 2;
    for (let s = 0; s < segs; s++) {
      const l = len * (s === 0 ? 0.45 : 0.32) * (0.85 + 0.3 * random());
      // the sympodial turn: the leading bud gives way to a side one
      d = d.clone().applyAxisAngle(new V3(0, 1, 0), (random() - 0.5) * 1.3);
      d.y += (random() - 0.35) * 0.45;
      d.normalize();
      at = at.clone().addScaledVector(d, l);
      if (at.y < bole * 0.8) at.y = bole * 0.8 + random() * 0.4;
      pts.push(at.clone());
      if (depth === 0 && s > 0) limb(at, d.clone().applyAxisAngle(new V3(0, 1, 0), (random() < 0.5 ? -1 : 1) * (0.7 + 0.6 * random())).setY(0.15 + 0.5 * random()).normalize(), len * 0.45, r * 0.45, 1);
    }
    tubes.push({ curve: curve(pts), r0: r, r1: r * 0.25, cls: depth === 0 ? LIMB : BOUGH, furrow: depth === 0 ? 0.6 : 0.2 });
    const end = pts[pts.length - 1];
    const lobe = depth === 0 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
    for (let k = 0; k < lobe; k++) {
      const c = end.clone().add(new V3((random() - 0.5) * 2.2, (random() - 0.2) * 1.6, (random() - 0.5) * 2.2).multiplyScalar(W * 0.11));
      clumps.push(clump(c, W * (depth === 0 ? 0.27 : 0.23) * (0.8 + 0.4 * random()), { sy: 0.78 }));
    }
    if (pts.length > 2 && depth === 0) clumps.push(clump(pts[pts.length - 2].clone().add(new V3(0, W * 0.06, 0)), W * 0.21 * (0.8 + 0.4 * random()), { sy: 0.8 }));
  };
  for (let i = 0; i < limbs; i++) {
    const a = ((i + 0.2 + 0.6 * random()) / limbs) * TAU + lean;
    const rise = 0.35 + 0.9 * (i / limbs) * random() + 0.25 * random();
    limb(top.clone().add(new V3(0, (random() - 0.3) * bole * 0.3, 0)), new V3(Math.cos(a), rise, Math.sin(a)).normalize(), W * (1.05 + 0.25 * random()), girth * (0.5 + 0.12 * random()), 0);
  }
  for (let k = 0; k < 2; k++) clumps.push(clump(new V3((random() - 0.5) * W * 0.5, H * (0.78 + 0.12 * random()), (random() - 0.5) * W * 0.5), W * 0.24 * (0.8 + 0.4 * random()), { sy: 0.8 }));
  return { tubes, clumps, tile: T_OAK, spray: W * 0.15, cards: 30, rRef: W * 0.25, openAt, crownY };
}

// ---- pine ----

export function planPine(seed: number, height = 24, umbrella = false): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const girth = H * (umbrella ? 0.026 : 0.021);
  const clear = H * (umbrella ? 0.52 + 0.08 * random() : 0.38 + 0.1 * random());
  const R = H * (umbrella ? 0.56 + 0.08 * random() : 0.25 + 0.05 * random());
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const wander = (y: number): V3 => {
    const f = (y / H) ** 2;
    return new V3(Math.cos(lean) * H * (umbrella ? 0.05 : 0.015) * f + Math.sin(y * 0.31 + lean) * girth * 0.25, y, Math.sin(lean) * H * (umbrella ? 0.05 : 0.015) * f + Math.cos(y * 0.27 + lean) * girth * 0.25);
  };
  const stemTop = umbrella ? H * 0.8 : H * 0.985;
  const stemPts = [new V3(0, -0.6, 0)];
  for (let k = 1; k <= 6; k++) stemPts.push(wander((stemTop * k) / 6));
  const stem = curve(stemPts);
  tubes.push({ curve: stem, r0: girth, r1: girth * (umbrella ? 0.45 : 0.12), cls: BOLE, flare: 0.5, furrow: 0.9, extraSides: 2, rowsAt: [8, 4] });
  const axis = (y: number): V3 => stem.getPoint(Math.min(1, Math.max(0, (y + 0.6) / (stemTop + 0.6))));
  const stubs = 3 + Math.floor(random() * 3);
  for (let k = 0; k < stubs; k++) {
    const from = axis(clear * (0.35 + 0.6 * random()));
    const a = random() * TAU;
    const d = new V3(Math.cos(a), -0.1 + 0.3 * random(), Math.sin(a)).normalize();
    tubes.push({ curve: new THREE.LineCurve3(from, from.clone().addScaledVector(d, 0.4 + 1.2 * random())), r0: girth * 0.12, r1: girth * 0.05, cls: TWIG });
  }
  const top = H * 0.97;
  // a pine's head is rounded; a stone pine's a flat dome
  const envelope = umbrella
    ? (t: number): number => R * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.75)) ** 0.5) * (1 - 0.35 * t * t)
    : (t: number): number => R * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85))) * (1 - 0.55 * Math.pow(t, 3));
  const openAt = (at: V3, n: V3): number => {
    const t = Math.min(1, Math.max(0, (at.y - clear) / (top - clear)));
    const e = Math.hypot(at.x, at.z) / Math.max(0.5, envelope(t));
    return Math.min(1, Math.max(0, (0.22 + 0.78 * smooth(e, 0.3, 0.95)) * (0.5 + 0.5 * smooth(n.y, -0.7, 0.5)) * (0.75 + 0.25 * t)));
  };
  const whorls = umbrella ? 5 + Math.floor(random() * 2) : 7 + Math.floor(random() * 3);
  let turn = random() * TAU;
  for (let i = 0; i < whorls; i++) {
    const t = (i + 0.3 + 0.4 * random()) / whorls;
    const y = umbrella ? clear + t * (stemTop - clear) : clear + t * (top - clear);
    const reach = envelope(t);
    const n = (umbrella ? 3 : 2) + Math.floor(random() * 2) - (t > 0.8 ? 1 : 0);
    turn += 2.39996;
    for (let b = 0; b < n; b++) {
      if (random() < 0.16) continue;
      const a = turn + (b / n) * TAU + (random() - 0.5) * 0.9;
      const outward = new V3(Math.cos(a), 0, Math.sin(a));
      const from = axis(y);
      const len = reach * (umbrella ? 0.8 + 0.35 * random() : 0.6 + 0.25 * random());
      // a pine's lower limbs go out level and turn up; a stone pine's all rise to its dome
      const rise = umbrella ? 0.55 + 0.35 * random() - 0.4 * t : -0.18 + 0.75 * t + (random() - 0.5) * 0.2;
      const end = from.clone().addScaledVector(outward, len).add(new V3(0, len * rise, 0));
      if (umbrella) end.y = Math.max(end.y, H * (0.82 + 0.1 * random()));
      const mid = from.clone().lerp(end, 0.5).add(new V3(0, -len * 0.12 * (1 - t), 0));
      const tipUp = end.clone().add(new V3(0, len * 0.12, 0)).addScaledVector(outward, len * 0.06);
      const limb = curve([from, mid, end, tipUp]);
      tubes.push({ curve: limb, r0: girth * (0.3 - 0.12 * t), r1: girth * 0.05, cls: BOUGH, furrow: 0.3, rowsAt: [3, 2], sidesAt: undefined });
      // its needles along its outer half (a stone pine's at its end only)
      const tufts = umbrella ? 1 + (random() < 0.55 ? 1 : 0) : 3;
      for (let k = 0; k < tufts; k++) {
        const u = k === 0 ? 1 : umbrella ? 0.6 + 0.3 * random() : 1 - 0.27 * k;
        const c = limb.getPoint(u).add(new V3((random() - 0.5) * 0.8, 0.35 + 0.3 * random(), (random() - 0.5) * 0.8));
        clumps.push(clump(c, (k === 0 ? 1.55 : 1.3 - 0.12 * k) * (0.8 + 0.4 * random()) * (H / 24) * (umbrella ? 1.7 : 1), { sy: umbrella ? 0.5 : 0.72, stretch: 1.15, along: new V3(-outward.z, 0, outward.x), shelf: umbrella ? 0.6 : 0.35, out: outward.clone(), bare: !umbrella && k > 0 }));
      }
    }
  }
  // the head: a few bunches over the leader; a stone pine's dome closed over by more of them
  const heads = umbrella ? 7 : 3;
  for (let k = 0; k < heads; k++) {
    const a = k * 2.39996 + random();
    const d = umbrella ? R * (k === 0 ? 0 : 0.35 + 0.35 * random()) : (random() - 0.5) * R * 0.5;
    const c = axis(stemTop * 0.98).add(new V3(Math.cos(a) * d, H * (umbrella ? 0.12 - 0.05 * (d / R) : 0.02) + random() * 0.6, Math.sin(a) * d));
    clumps.push(clump(c, 1.5 * (0.8 + 0.4 * random()) * (H / 24) * (umbrella ? 1.7 : 1), { sy: umbrella ? 0.5 : 0.8, shelf: umbrella ? 0.6 : 0.4 }));
  }
  // (a branch's middle stays wood: the stub boughs drawn in the middle distance too)
  for (const t of tubes) if (t.cls === BOUGH) t.sidesAt = [4 + (t.extraSides ?? 0), 3];
  return { tubes, clumps, tile: T_PINE, spray: H * 0.06 * (umbrella ? 1.25 : 1), cards: 18, rRef: 1.6 * (H / 24) * (umbrella ? 1.7 : 1), openAt, crownY: clear + (top - clear) * 0.45, least: [5, 2] };
}

// ---- birch, poplar ----

export function planBirch(seed: number, height = 16, column = false): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const girth = H * (column ? 0.016 : 0.012);
  const W = H * (column ? 0.11 : 0.24 + 0.04 * random());
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const stemPts = [new V3(0, -0.4, 0)];
  for (let k = 1; k <= 5; k++) {
    const y = (H * 0.97 * k) / 5;
    stemPts.push(new V3(Math.cos(lean) * H * 0.03 * (k / 5) ** 2 + Math.sin(k * 1.7 + lean) * girth * 0.8, y, Math.sin(lean) * H * 0.03 * (k / 5) ** 2 + Math.cos(k * 1.3 + lean) * girth * 0.8));
  }
  const stem = curve(stemPts);
  tubes.push({ curve: stem, r0: girth, r1: girth * 0.15, cls: BOLE, flare: 0.35, furrow: 0.1, rowsAt: [8, 4] });
  const crownFrom = H * (column ? 0.12 : 0.3);
  const centre = new V3(0, (crownFrom + H) / 2, 0);
  const halfH = (H - crownFrom) / 2;
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / halfH, (at.z - centre.z) / W), n.y, 0.35, 0.95);
  const boughs = column ? 10 : 9 + Math.floor(random() * 3);
  let turn = random() * TAU;
  for (let i = 0; i < boughs; i++) {
    const t = (i + 0.3 + 0.4 * random()) / boughs;
    const y = crownFrom + t * (H * 0.92 - crownFrom);
    const from = stem.getPoint(y / H);
    turn += 2.39996;
    const a = turn;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    // the crown's outline: an egg, widest a third of the way up
    const reach = W * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (0.75 + 0.35 * random());
    // a birch's branches rise and its twigs weep; a poplar's hug the stem
    const rise = column ? 2.4 + random() : 0.7 + 0.5 * random();
    const end = from.clone().addScaledVector(out, reach).add(new V3(0, reach * rise * (column ? 0.9 : 0.7), 0));
    const mid = from.clone().lerp(end, 0.5).addScaledVector(out, reach * 0.12);
    const bough = curve([from, mid, end]);
    tubes.push({ curve: bough, r0: girth * (column ? 0.3 : 0.28), r1: girth * 0.06, cls: BOUGH });
    // its leaves: small airy clumps along its outer half, threads hanging (a birch's), close (a poplar's)
    const per = column ? 2 : 3;
    for (let k = 0; k < per; k++) {
      const u = 0.45 + 0.55 * (k / Math.max(1, per - 1)) * (0.85 + 0.15 * random());
      const c = bough.getPoint(Math.min(1, u)).add(new V3(0, column ? 0 : -W * 0.06 * u, 0));
      clumps.push(clump(c, W * (column ? 0.42 : 0.3) * (0.75 + 0.35 * random()), { sy: column ? 1.25 : 0.7, droop: column ? 0.1 : 0.5, out: out.clone(), bare: !column && random() < 0.6 }));
    }
  }
  clumps.push(clump(stem.getPoint(0.97).add(new V3(0, H * 0.02, 0)), W * 0.28, { sy: column ? 1.6 : 0.9, droop: column ? 0 : 0.3 }));
  return { tubes, clumps, tile: column ? T_ROUND : T_BIRCH, spray: W * (column ? 0.3 : 0.24), cards: 30, rRef: W * 0.3, openAt, crownY: centre.y };
}

// ---- cherry ----

export function planCherry(seed: number, height = 8): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const W = H * (0.72 + 0.1 * random());
  const bole = H * (0.22 + 0.05 * random());
  const girth = H * 0.04;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const lean = random() * TAU;
  const top = new V3(Math.cos(lean) * bole * 0.15, bole, Math.sin(lean) * bole * 0.15);
  tubes.push({ curve: curve([new V3(0, -0.4, 0), new V3(Math.cos(lean + 1) * girth * 0.35, bole * 0.5, Math.sin(lean + 1) * girth * 0.35), top]), r0: girth, r1: girth * 0.8, cls: BOLE, flare: 0.7, furrow: 0.4, extraSides: 1 });
  const crownY = bole + (H - bole) * 0.5;
  const centre = new V3(0, crownY, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / ((H - bole) * 0.6), (at.z - centre.z) / W), n.y, 0.35, 0.95);
  const limbs = 4 + Math.floor(random() * 3);
  for (let i = 0; i < limbs; i++) {
    const a = ((i + 0.25 + 0.5 * random()) / limbs) * TAU + lean;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const len = W * (0.9 + 0.25 * random());
    // out wide and up, then arching over at the end
    const p1 = top.clone().addScaledVector(out, len * 0.35).add(new V3(0, len * (0.42 + 0.2 * random()), 0));
    const p2 = top.clone().addScaledVector(out, len * 0.75).add(new V3(0, len * (0.55 + 0.15 * random()), 0));
    const p3 = top.clone().addScaledVector(out, len).add(new V3(0, len * (0.42 + 0.1 * random()), 0));
    const l = curve([top.clone(), p1, p2, p3]);
    tubes.push({ curve: l, r0: girth * 0.5, r1: girth * 0.12, cls: LIMB, furrow: 0.3 });
    for (let j = 0; j < 2; j++) {
      const from = l.getPoint(0.4 + 0.3 * j);
      const b = a + (j === 0 ? -1 : 1) * (0.6 + 0.5 * random());
      const d = new V3(Math.cos(b), 0.5 + 0.3 * random(), Math.sin(b)).normalize();
      const end = from.clone().addScaledVector(d, len * 0.38);
      tubes.push({ curve: curve([from, from.clone().lerp(end, 0.5).add(new V3(0, len * 0.04, 0)), end]), r0: girth * 0.18, r1: girth * 0.05, cls: BOUGH });
      clumps.push(clump(end.clone().add(new V3(0, W * 0.05, 0)), W * 0.24 * (0.8 + 0.4 * random()), { sy: 0.62 }));
    }
    clumps.push(clump(p3.clone().add(new V3(0, W * 0.04, 0)), W * 0.27 * (0.8 + 0.4 * random()), { sy: 0.62 }));
    clumps.push(clump(p2.clone().add(new V3(0, W * 0.1, 0)), W * 0.24 * (0.8 + 0.4 * random()), { sy: 0.65 }));
  }
  clumps.push(clump(new V3(0, H * 0.88, 0), W * 0.3, { sy: 0.6 }));
  return { tubes, clumps, tile: T_CHERRY, spray: W * 0.14, cards: 26, rRef: W * 0.25, openAt, crownY };
}

// ---- cypress ----

export function planCypress(seed: number, height = 16): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const R = H * (0.07 + 0.015 * random());
  const lean = random() * TAU;
  const tubes: Tube[] = [{ curve: curve([new V3(0, -0.4, 0), new V3(Math.cos(lean) * R * 0.1, H * 0.5, Math.sin(lean) * R * 0.1), new V3(Math.cos(lean) * R * 0.25, H * 0.95, Math.sin(lean) * R * 0.25)]), r0: H * 0.016, r1: H * 0.003, cls: BOLE, flare: 0.3, furrow: 0.5 }];
  const clumps: Clump[] = [];
  // a flame: swelling below its middle, drawn to a point
  const envelope = (t: number): number => R * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)), 0.55) * (1 - 0.65 * t ** 3) * (t < 0.08 ? 0.75 + 3 * t : 1);
  const y0 = H * 0.04;
  const openAt = (at: V3, n: V3): number => {
    const t = Math.min(1, Math.max(0, (at.y - y0) / (H - y0)));
    return openness(Math.hypot(at.x - Math.cos(lean) * R * 0.25 * t, at.z - Math.sin(lean) * R * 0.25 * t) / Math.max(0.2, envelope(t)), n.y * 0.5, 0.25, 0.95);
  };
  const n = 30 + Math.floor(random() * 6);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = y0 + t * (H * 0.98 - y0);
    const e = envelope(t);
    const a = i * 2.39996 + random() * 0.5;
    const d = e * (0.38 + 0.15 * random());
    const c = new V3(Math.cos(a) * d + Math.cos(lean) * R * 0.25 * t, y, Math.sin(a) * d + Math.sin(lean) * R * 0.25 * t);
    clumps.push(clump(c, Math.max(0.25, e * 0.72), { sy: 1.55, out: new V3(Math.cos(a), 0, Math.sin(a)) }));
  }
  return { tubes, clumps, tile: T_CYPRESS, spray: R * 0.7, cards: 22, rRef: R * 0.6, openAt, crownY: H * 0.45, least: [6, 2] };
}

// ---- palm ----

export function planPalm(seed: number, height = 14): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const lean = random() * TAU;
  const bow = H * (0.12 + 0.12 * random());
  const dir = new V3(Math.cos(lean), 0, Math.sin(lean));
  // a stem that leans out and curves back up towards its head
  const stemAt = (t: number): V3 => new V3(0, t * H, 0).addScaledVector(dir, bow * (2 * t - t * t));
  const stem = curve([0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => stemAt(t)));
  const head = stemAt(1);
  const r0 = H * 0.019;
  const tubes: Tube[] = [{ curve: stem, r0: r0 * 1.15, r1: r0 * 0.78, cls: BOLE, flare: 0.45, furrow: 0.2, profile: (t) => 1 + 0.04 * Math.sin(t * H * 5.5), sidesAt: [8, 5], rowsAt: [12, 5] }];
  const clumps: Clump[] = [clump(head.clone().add(new V3(0, 0.3, 0)), H * 0.06, { sy: 0.9, tile: T_ROUND })];
  const fronds = 18 + Math.floor(random() * 5);
  const spec: { a: number; el: number; len: number }[] = [];
  for (let k = 0; k < fronds; k++) {
    const t = k / fronds;
    // the young fronds stand up in the middle, the old ones droop below
    spec.push({ a: k * 2.39996 + random() * 0.4, el: 1.1 - 1.7 * t + (random() - 0.5) * 0.2, len: H * (0.32 + 0.06 * random()) * (t < 0.15 ? 0.75 : 1) });
  }
  const openAt = (at: V3, n: V3): number => openness(at.distanceTo(head) / (H * 0.35), n.y, 0.2, 0.9);
  const nuts: V3[] = [];
  for (let k = 0; k < 7; k++) {
    const a = random() * TAU;
    nuts.push(head.clone().add(new V3(Math.cos(a) * H * 0.025, -H * (0.02 + 0.02 * random()), Math.sin(a) * H * 0.025)));
  }
  const segsAt = [9, 4];
  const extra = (out: Out, level: Level, rnd: () => number): void => {
    for (const f of spec) {
      const d = new V3(Math.cos(f.a) * Math.cos(f.el), Math.sin(f.el), Math.sin(f.a) * Math.cos(f.el));
      const p0 = head.clone();
      const p1 = p0.clone().addScaledVector(d, f.len * 0.45).add(new V3(0, f.len * 0.08, 0));
      // the rachis bends down beyond its middle, more the further out it reaches
      const flat = Math.cos(f.el);
      const p2 = p0.clone().addScaledVector(new V3(d.x, 0, d.z).normalize(), f.len * (0.55 + 0.4 * flat)).add(new V3(0, f.len * (Math.sin(f.el) * 0.6 - 0.35 * flat), 0));
      const c = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      writeFrond(out, c, (t) => f.len * 0.22 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)) + 0.05, segsAt[level], 0.42, T_FROND, head, 0.85, rnd);
    }
    // the nuts: small balls under the head, in the crown's colours
    for (const n of nuts) writeNut(out, n, H * 0.012, level);
  };
  const nutTris = [20, 8];
  return { tubes, clumps, tile: T_FROND, spray: H * 0.08, cards: 4, rRef: H * 0.06, openAt, crownY: head.y, extra, extraTris: (level) => spec.length * segsAt[level] * 4 + nuts.length * nutTris[level], least: [2, 0] };
}

/** a nut, a fruit: a small solid ball in the crown's colours (20 faces near, 8 in the middle distance) */
function writeNut(out: Out, at: V3, r: number, level: Level): void {
  const t = (1 + Math.sqrt(5)) / 2;
  const ico = level === 0 ? [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1] : [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const idx = level === 0 ? [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1] : [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 0, 4, 3, 4, 1, 3, 1, 5, 3, 5, 0, 3];
  const first = out.pos.length / 3;
  for (let i = 0; i < ico.length; i += 3) {
    const l = Math.hypot(ico[i], ico[i + 1], ico[i + 2]);
    const nx = ico[i] / l;
    const ny = ico[i + 1] / l;
    const nz = ico[i + 2] / l;
    out.vertex(at.x + nx * r, at.y + ny * r * 1.15, at.z + nz * r, nx, ny, nz, 0.5, 0.5, 0.55 + 0.3 * ny, 0.5, 0.6, at.y, PART_SOLID);
  }
  for (const f of idx) out.idx.push(first + f);
}

// ---- acacia, dragon tree ----

export function planAcacia(seed: number, height = 9): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const W = H * (0.75 + 0.12 * random());
  const bole = H * (0.22 + 0.08 * random());
  const girth = H * 0.032;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const top = new V3(Math.cos(lean) * bole * 0.25, bole, Math.sin(lean) * bole * 0.25);
  tubes.push({ curve: curve([new V3(0, -0.4, 0), new V3(Math.cos(lean) * bole * 0.08, bole * 0.5, Math.sin(lean) * bole * 0.08), top]), r0: girth, r1: girth * 0.75, cls: BOLE, flare: 0.5, furrow: 0.8 });
  const table = H * 0.86;
  const centre = new V3(0, table, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - centre.x) / W, (at.y - centre.y) / (H * 0.18), (at.z - centre.z) / W), n.y, 0.3, 0.95);
  // two or three limbs rising steeply, each forking twice, every fork leaning further out, all ending at the table
  const forks = 2 + Math.floor(random() * 2);
  const grow = (from: V3, a: number, depth: number, r: number): void => {
    const reach = W * (depth === 0 ? 0.35 : depth === 1 ? 0.3 : 0.25) * (0.8 + 0.4 * random());
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const end = from.clone().addScaledVector(out, reach);
    end.y = Math.min(table - 0.2, from.y + (table - bole) * (depth === 0 ? 0.5 : depth === 1 ? 0.35 : 0.25) * (0.8 + 0.4 * random()));
    const mid = from.clone().lerp(end, 0.5).addScaledVector(out, reach * 0.12);
    tubes.push({ curve: curve([from, mid, end]), r0: r, r1: r * 0.55, cls: depth === 0 ? LIMB : BOUGH, furrow: 0.5 });
    if (depth < 2) {
      for (let k = 0; k < 2; k++) grow(end, a + (k === 0 ? -1 : 1) * (0.35 + 0.35 * random()), depth + 1, r * 0.6);
    } else {
      // a table of foliage on the fork's end: flat, its top lit, its underside deep
      clumps.push(clump(new V3(end.x, table + (random() - 0.5) * H * 0.06, end.z).addScaledVector(out, reach * 0.3), W * (0.27 + 0.08 * random()), { sy: 0.3, shelf: 0.85, flat: 0.7, out: out.clone() }));
    }
  };
  for (let i = 0; i < forks; i++) grow(top, lean + ((i + 0.5) / forks) * TAU + (random() - 0.5) * 0.6, 0, girth * 0.6);
  // a few lower, smaller tables at the rim, so the edge is ragged
  for (let k = 0; k < 3; k++) {
    const a = random() * TAU;
    clumps.push(clump(new V3(Math.cos(a) * W * 0.75, table - H * (0.06 + 0.06 * random()), Math.sin(a) * W * 0.75), W * 0.16, { sy: 0.3, shelf: 0.8, flat: 0.6 }));
  }
  return { tubes, clumps, tile: T_ACACIA, spray: W * 0.17, cards: 46, rRef: W * 0.28, openAt, crownY: table };
}

export function planDragon(seed: number, height = 7): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const W = H * (0.62 + 0.1 * random());
  const bole = H * (0.35 + 0.08 * random());
  const girth = H * 0.06;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const top = new V3(0, bole, 0);
  tubes.push({ curve: curve([new V3(0, -0.4, 0), new V3(0, bole * 0.5, 0), top]), r0: girth, r1: girth * 0.8, cls: BOLE, flare: 0.25, furrow: 0.15, extraSides: 2 });
  const capY = H * 0.88;
  // the cap: an umbrella turned up, its rim lower than its middle
  const cap = (x: number, z: number): number => capY - (H - capY) * 0.9 * ((x * x + z * z) / (W * W));
  const openAt = (at: V3, n: V3): number => Math.min(1, Math.max(0, (0.25 + 0.75 * smooth(at.y - cap(at.x, at.z) + H * 0.12, 0, H * 0.18)) * (0.5 + 0.5 * smooth(n.y, -0.5, 0.6))));
  // fork upon fork, every branch rising at the same angle
  const grow = (from: V3, a: number, depth: number, r: number): void => {
    const len = (H - bole) * (0.42 - depth * 0.08);
    const spread = 0.62;
    const d = new V3(Math.cos(a) * Math.sin(spread), Math.cos(spread), Math.sin(a) * Math.sin(spread));
    const end = from.clone().addScaledVector(d, len);
    tubes.push({ curve: curve([from, from.clone().lerp(end, 0.5).add(new V3(0, len * 0.05, 0)), end]), r0: r, r1: r * 0.7, cls: depth === 0 ? LIMB : BOUGH, furrow: 0.1 });
    if (depth < 2) {
      for (let k = 0; k < 2; k++) grow(end, a + (k === 0 ? -1 : 1) * (0.5 + 0.2 * random()), depth + 1, r * 0.7);
    } else {
      const c = new V3(end.x * 1.15, 0, end.z * 1.15);
      c.y = cap(c.x, c.z) - H * 0.03;
      clumps.push(clump(c, W * 0.3 * (0.85 + 0.3 * random()), { sy: 0.42, shelf: 0.55, out: new V3(c.x, 0, c.z).normalize() }));
    }
  };
  const first = 3 + Math.floor(random() * 2);
  for (let i = 0; i < first; i++) grow(top, ((i + 0.5) / first) * TAU + random() * 0.4, 0, girth * 0.55);
  clumps.push(clump(new V3(0, capY + H * 0.02, 0), W * 0.34, { sy: 0.4, shelf: 0.6 }));
  return { tubes, clumps, tile: T_ROSETTE, spray: W * 0.2, cards: 30, rRef: W * 0.3, openAt, crownY: capY };
}

// ---- bamboo ----

export function planBamboo(seed: number, height = 14): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const culms = 13 + Math.floor(random() * 4);
  const centre = new V3(0, H * 0.7, 0);
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x / (H * 0.3), (at.y - centre.y) / (H * 0.35), at.z / (H * 0.3)), n.y, 0.3, 0.95);
  for (let i = 0; i < culms; i++) {
    const a = i * 2.39996 + random() * 0.5;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const foot = new V3(Math.cos(a) * 0.55 * Math.sqrt(random()), -0.2, Math.sin(a) * 0.55 * Math.sqrt(random()));
    const h = H * (0.8 + 0.25 * random());
    // the inner culms stand up, the outer lean out: a fountain
    const leanOut = h * (0.06 + 0.2 * ((i % 4) / 3)) * (0.8 + 0.4 * random());
    // straight up its lower part, leaning out a little, its top arching over under its leaves
    const p1 = foot.clone().add(new V3(0, h * 0.45, 0)).addScaledVector(out, leanOut * 0.3);
    const p2 = foot.clone().add(new V3(0, h * 0.85, 0)).addScaledVector(out, leanOut);
    const p3 = foot.clone().add(new V3(0, h * 0.97, 0)).addScaledVector(out, leanOut * 2.4);
    const culm = curve([foot, p1, p2, p3]);
    const r = H * (0.005 + 0.002 * random());
    tubes.push({ curve: culm, r0: r, r1: r * 0.55, cls: BOUGH, sidesAt: [4, 3], rowsAt: [6, 3] });
    const leafy = 6;
    for (let k = 0; k < leafy; k++) {
      const u = 0.42 + 0.58 * ((k + 0.5) / leafy);
      // each spray on a short twig out to the culm's outer side, so the culms show between
      const side = out.clone().applyAxisAngle(new V3(0, 1, 0), (random() - 0.5) * 1.6);
      const c = culm.getPoint(u).addScaledVector(side, H * 0.05).add(new V3(0, -H * 0.02, 0));
      clumps.push(clump(c, H * (0.042 + 0.014 * random()), { sy: 0.65, droop: 0.45, out: side, bare: true }));
    }
  }
  return { tubes, clumps, tile: T_BAMBOO, spray: H * 0.06, cards: 16, rRef: H * 0.05, openAt, crownY: centre.y, least: [4, 1] };
}

// ---- saguaro ----

export function planSaguaro(seed: number, height = 9): Plan {
  const random = mulberry(seed);
  const H = height * (0.8 + 0.4 * random());
  const R = 0.28 + 0.05 * random();
  const lean = (random() - 0.5) * 0.08;
  const bodyAt = (t: number): V3 => new V3(Math.sin(lean) * t * H, t * H - 0.3, 0);
  // a column barely narrower at its foot, swelling a little through its middle, its top a dome
  const bodyR = (t: number): number => R * (0.86 + 0.14 * smooth(t, 0, 0.1)) * (1 + 0.06 * Math.sin(Math.PI * t)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.94) / 0.06) ** 2)) + 0.002;
  const arms: { from: number; a: number; out: number; up: number; r: number }[] = [];
  const n = 1 + Math.floor(0.6 + random() * 3);
  // (the arms go out on different sides: they balance the column)
  const a0 = random() * TAU;
  for (let k = 0; k < n; k++) arms.push({ from: 0.35 + 0.25 * random(), a: a0 + (k / n) * TAU + (random() - 0.5) * 0.8, out: 0.5 + 0.35 * random(), up: H * (0.18 + 0.22 * random()), r: R * (0.62 + 0.12 * random()) });
  const ribsAt = [12, 7];
  const rowsAt = [12, 6];
  const armRibs = [8, 5];
  const armRows = [8, 4];
  const extra = (out: Out, level: Level): void => {
    writeRibbed(out, bodyAt, bodyR, ribsAt[level], rowsAt[level]);
    for (const arm of arms) {
      const o = bodyAt(arm.from);
      const d = new V3(Math.cos(arm.a), 0, Math.sin(arm.a));
      // out from the body, an elbow, then up
      const c = new THREE.CubicBezierCurve3(o.clone(), o.clone().addScaledVector(d, arm.out + R), o.clone().addScaledVector(d, arm.out + R).add(new V3(0, arm.up * 0.35, 0)), o.clone().addScaledVector(d, arm.out + R).add(new V3(0, arm.up, 0)));
      writeRibbed(out, (t) => c.getPoint(t), (t) => arm.r * (0.82 + 0.18 * smooth(t, 0, 0.3)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.9) / 0.1) ** 2)) + 0.002, armRibs[level], armRows[level]);
    }
  };
  return {
    tubes: [],
    clumps: [],
    tile: T_ROUND,
    spray: 1,
    cards: 0,
    rRef: 1,
    openAt: () => 0.8,
    crownY: H * 0.5,
    extra,
    extraTris: (level) => ribsAt[level] * 2 * rowsAt[level] * 2 + arms.length * armRibs[level] * 2 * armRows[level] * 2,
    least: [0, 0],
  };
}

// ---- baobab ----

export function planBaobab(seed: number, height = 22): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const R = H * (0.065 + 0.01 * random());
  const trunkH = H * 0.78;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  // a bottle: a little fuller below its middle, drawn in towards its top
  tubes.push({ curve: curve([new V3(0, -0.6, 0), new V3(0.1, trunkH * 0.5, 0), new V3(0, trunkH, 0.15)]), r0: R, r1: R * 0.72, cls: BOLE, flare: 0.25, furrow: 0.05, profile: (t) => 1 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.2)) - 0.2 * t * t, sidesAt: [16, 9], rowsAt: [8, 4] });
  const centre = new V3(0, H * 0.9, 0);
  const openAt = (at: V3, n: V3): number => openness(at.distanceTo(centre) / (H * 0.3), n.y, 0.2, 0.9);
  const limbs = 8 + Math.floor(random() * 4);
  for (let i = 0; i < limbs; i++) {
    const a = i * 2.39996 + random() * 0.4;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const from = new V3(0, trunkH - R * 0.3, 0.15).addScaledVector(out, R * 0.45);
    const len = H * (0.16 + 0.08 * random());
    const rise = 0.6 + 0.6 * random();
    const end = from.clone().addScaledVector(out, len).add(new V3(0, len * rise, 0));
    const mid = from.clone().lerp(end, 0.5).add(new V3(0, -len * 0.08, 0));
    tubes.push({ curve: curve([from, mid, end]), r0: R * 0.24, r1: R * 0.06, cls: LIMB, furrow: 0.05 });
    // two or three short twigs off its end, like a root's, a tuft of leaves at each
    const twigs = 2 + (random() < 0.4 ? 1 : 0);
    for (let k = 0; k < twigs; k++) {
      const d = out.clone().applyAxisAngle(new V3(0, 1, 0), (random() - 0.5) * 1.6).add(new V3(0, 0.6 + 0.6 * random(), 0)).normalize();
      const tl = len * (0.35 + 0.2 * random());
      const tEnd = end.clone().addScaledVector(d, tl);
      tubes.push({ curve: new THREE.LineCurve3(end.clone(), tEnd), r0: R * 0.07, r1: R * 0.03, cls: BOUGH });
      clumps.push(clump(tEnd.clone().add(new V3(0, 0.2, 0)), H * (0.045 + 0.02 * random()), { sy: 0.7, bare: true, out: out.clone() }));
    }
  }
  return { tubes, clumps, tile: T_ROUND, spray: H * 0.05, cards: 18, rRef: H * 0.05, openAt, crownY: centre.y, least: [4, 2] };
}

// ---- stone pine ----

/** an Italian stone pine (Pinus pinea): a tall bare stem forking high into limbs that rise to a dense, flat-topped dome */
export function planStonePine(seed: number, height = 16): Plan {
  const random = mulberry(seed);
  const H = height * (0.9 + 0.2 * random());
  const R = H * (0.5 + 0.08 * random());
  const fork = H * (0.52 + 0.08 * random());
  const girth = H * 0.028;
  const lean = random() * TAU;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const top = new V3(Math.cos(lean) * H * 0.06, fork, Math.sin(lean) * H * 0.06);
  tubes.push({ curve: curve([new V3(0, -0.5, 0), new V3(Math.cos(lean + 1.4) * girth * 0.5, fork * 0.5, Math.sin(lean + 1.4) * girth * 0.5), top]), r0: girth, r1: girth * 0.7, cls: BOLE, flare: 0.45, furrow: 0.9, extraSides: 1 });
  // the dome: flat on top, its rim lower than its middle
  const domeY = (d: number): number => H * 0.86 + H * 0.1 * (1 - Math.min(1, (d / R) ** 2));
  const centre = new V3(top.x, H * 0.88, top.z);
  const openAt = (at: V3, n: V3): number => Math.min(1, Math.max(0, (0.22 + 0.78 * smooth(at.y - (domeY(Math.hypot(at.x - top.x, at.z - top.z)) - H * 0.12), 0, H * 0.14)) * (0.5 + 0.5 * smooth(n.y, -0.6, 0.6))));
  const limbs = 4 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = lean + ((i + 0.3 + 0.4 * random()) / limbs) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const reach = R * (0.55 + 0.2 * random());
    const end = top.clone().addScaledVector(out, reach);
    end.y = domeY(reach) - H * 0.07;
    const mid = top.clone().lerp(end, 0.5).add(new V3(0, H * 0.03, 0));
    const limb = curve([top.clone(), mid, end]);
    tubes.push({ curve: limb, r0: girth * 0.5, r1: girth * 0.16, cls: LIMB, furrow: 0.5 });
    // two boughs off each, spreading the dome out to its rim
    for (let k = 0; k < 2; k++) {
      const b = a + (k === 0 ? -1 : 1) * (0.45 + 0.3 * random());
      const o2 = new V3(Math.cos(b), 0, Math.sin(b));
      const from = limb.getPoint(0.6);
      const r2 = R * (0.75 + 0.2 * random());
      const tip = top.clone().addScaledVector(o2, r2);
      tip.y = domeY(r2) - H * 0.08;
      tubes.push({ curve: curve([from, from.clone().lerp(tip, 0.5).add(new V3(0, H * 0.02, 0)), tip]), r0: girth * 0.18, r1: girth * 0.06, cls: BOUGH });
      clumps.push(clump(tip.clone().add(new V3(0, H * 0.03, 0)), R * 0.36 * (0.85 + 0.3 * random()), { sy: 0.42, shelf: 0.75, flat: 0.45, out: o2.clone() }));
    }
    clumps.push(clump(end.clone().add(new V3(0, H * 0.04, 0)), R * 0.38 * (0.85 + 0.3 * random()), { sy: 0.45, shelf: 0.75, flat: 0.45, out: out.clone() }));
  }
  clumps.push(clump(new V3(top.x, domeY(0) - H * 0.03, top.z), R * 0.42, { sy: 0.4, shelf: 0.8, flat: 0.5 }));
  return { tubes, clumps, tile: T_PINE, spray: R * 0.2, cards: 34, rRef: R * 0.38, openAt, crownY: centre.y };
}
