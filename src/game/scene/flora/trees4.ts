/**
 * The toolkit's fourth round of trees (docs/V3/nodes/R4-trees.md): the forms the emergent Earth's ecosystems call for
 * that none of the first rounds had — each grown by its own botany, as trees.ts's are, after Painted Valley's way of
 * making a crown a few lit masses (src/valley/trees.js, MIT: its rules, not its code).
 *
 *   emergent    the rainforest's giant: a pale straight bole thirty metres and more, buttresses like fins at its foot,
 *               a broad flat cauliflower crown standing out over the canopy on a few great limbs (a kapok, a dipterocarp)
 *   fig         a strangler fig, a banyan: a squat bole of fused stems, great limbs spreading level far out, a vast low
 *               dome, aerial roots hanging from the limbs down into the ground
 *   frailejon   the páramo's frailejón: a stout stem shaggy with its dead leaves, crowned with a rosette of woolly
 *               silver-green leaves; one stem or a few
 *   ocotillo    the desert's ocotillo: a fountain of long thorny whips from one root, thin leaves along them
 *   araucaria   a monkey puzzle: a tall straight trunk bare below, its branches in whorls level out from it and curving
 *               up at their ends, each end a dark tuft — a candelabra, a dome of them at the top
 */
import * as THREE from 'three';
import { mulberry } from '../vegetation';
import { T_PINE, T_ROSETTE, T_ROUND } from './atlas';
import { BOLE, BOUGH, LIMB, TAU, V3, smooth, type Clump, type Plan, type Tube } from './kit';
import { planBroadleaf, type BroadleafShape } from './broadleaf';

const curve = (pts: THREE.Vector3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts);
const clump = (c: V3, r: number, o: Partial<Clump> = {}): Clump => ({ c, r, sy: 0.8, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0, ...o });
const openness = (e: number, ny: number, lo = 0.3, hi = 0.92): number => Math.min(1, Math.max(0, (0.18 + 0.82 * smooth(e, lo, hi)) * (0.55 + 0.45 * smooth(ny, -0.6, 0.6))));

// ---- emergent ----

export function planEmergent(seed: number, height = 36): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const bole = H * (0.62 + 0.08 * random());
  const girth = H * 0.028;
  const W = H * (0.4 + 0.06 * random());
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const lean = new V3(random() - 0.5, 0, random() - 0.5).multiplyScalar(H * 0.03);
  tubes.push({ curve: curve([new V3(0, 0, 0), new V3(lean.x * 0.4, bole * 0.5, lean.z * 0.4), new V3(lean.x, bole, lean.z)]), r0: girth, r1: girth * 0.72, cls: BOLE, flare: 0.9, furrow: 0.15, extraSides: 4 });
  // the buttresses: thin fins out from the bole's foot, high on the bole and down to the ground a few metres out
  const fins = 5 + Math.floor(random() * 3);
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * TAU + random() * 0.5;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const top = new V3(0, H * (0.07 + 0.05 * random()), 0).addScaledVector(out, girth * 0.6);
    const mid = new V3(0, H * 0.03, 0).addScaledVector(out, girth * 2.2);
    const foot = new V3(0, -0.2, 0).addScaledVector(out, girth * (3.6 + 1.6 * random()));
    tubes.push({ curve: curve([top, mid, foot]), r0: girth * 0.32, r1: girth * 0.16, cls: LIMB, furrow: 0.1 });
  }
  // the crown: a few great limbs out from the bole's top, a broad flat dome of big clumps on them
  const top = new V3(lean.x, bole, lean.z);
  const crownY = bole + (H - bole) * 0.45;
  const limbs = 5 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * TAU + random() * 0.6;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const end = top.clone().addScaledVector(out, W * (0.6 + 0.3 * random())).add(new V3(0, (H - bole) * (0.35 + 0.2 * random()), 0));
    const mid = top.clone().lerp(end, 0.5).add(new V3(0, (H - bole) * 0.1, 0));
    tubes.push({ curve: curve([top.clone(), mid, end]), r0: girth * 0.5, r1: girth * 0.18, cls: LIMB });
    clumps.push(clump(end.clone().add(new V3(0, W * 0.06, 0)), W * (0.38 + 0.08 * random()), { sy: 0.55, shelf: 0.35 }));
    clumps.push(clump(mid.clone().add(new V3(0, W * 0.14, 0)), W * 0.32, { sy: 0.55, shelf: 0.25 }));
  }
  // (the cauliflower's top: one great dome over the limbs, and a ring of clumps filling the crown between them)
  clumps.push(clump(new V3(lean.x, H * 0.9, lean.z), W * 0.48, { sy: 0.5, shelf: 0.3 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    clumps.push(clump(new V3(lean.x + Math.cos(a) * W * 0.42, crownY + (H - bole) * 0.2, lean.z + Math.sin(a) * W * 0.42), W * 0.3, { sy: 0.55, shelf: 0.25 }));
  }
  const openAt = (at: V3, n: V3): number => openness(Math.hypot((at.x - lean.x) / W, (at.y - crownY) / ((H - bole) * 0.6), (at.z - lean.z) / W), n.y, 0.35, 0.95);
  return { tubes, clumps, tile: T_ROUND, spray: W * 0.13, cards: 44, rRef: W * 0.3, openAt, crownY };
}

// ---- fig ----

/** the fig's dome as the round broadleaf grows it (broadleaf.ts): low and very wide, its limbs spreading level */
const FIG_SHAPE: BroadleafShape = { trunk: 2.6, girth: 0.95, crown: 11, rise: 7.5, limbs: 7, clump: 2.7, fill: 18, cards: 44, spray: 1.15, elevation: 0.55, squash: 0.62, furrow: 0.5, tile: T_ROUND };

export function planFig(seed: number, height = 15): Plan {
  const random = mulberry(seed + 0x5f1);
  const plan = planBroadleaf(seed, height, FIG_SHAPE);
  // the aerial roots: from under the dome straight down into the ground, a few thickened into new trunks
  let reach = 0;
  for (const c of plan.clumps) reach = Math.max(reach, Math.hypot(c.c.x, c.c.z));
  const roots = 9 + Math.floor(random() * 6);
  for (let i = 0; i < roots; i++) {
    const a = random() * TAU;
    const d = reach * (0.3 + 0.55 * random());
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = plan.crownY * (0.62 + 0.18 * random());
    const thick = random() < 0.3;
    const r = height * (thick ? 0.018 : 0.006);
    plan.tubes.push({ curve: curve([new V3(x, y, z), new V3(x + (random() - 0.5) * 0.4, y * 0.5, z + (random() - 0.5) * 0.4), new V3(x, -0.2, z)]), r0: r, r1: r * (thick ? 1.4 : 1.1), cls: thick ? LIMB : BOUGH, flare: thick ? 0.4 : 0 });
  }
  return plan;
}

// ---- frailejón ----

export function planFrailejon(seed: number, height = 2.2): Plan {
  const random = mulberry(seed);
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const stems = random() < 0.3 ? 2 + Math.floor(random() * 2) : 1;
  let crownY = 0;
  for (let i = 0; i < stems; i++) {
    const h = height * (0.65 + 0.45 * random()) * (i === 0 ? 1 : 0.7);
    const a = random() * TAU;
    const off = i === 0 ? 0 : 0.35 + 0.3 * random();
    const foot = new V3(Math.cos(a) * off, 0, Math.sin(a) * off);
    const tip = foot.clone().add(new V3((random() - 0.5) * 0.3, h, (random() - 0.5) * 0.3));
    // (the stem shaggy with its dead leaves: thick, the same all the way up)
    tubes.push({ curve: curve([foot, foot.clone().lerp(tip, 0.5).add(new V3((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12)), tip]), r0: 0.19, r1: 0.16, cls: LIMB, furrow: 1 });
    // (the rosette: a flat ball of upturned woolly leaves)
    clumps.push(clump(tip.clone().add(new V3(0, 0.2, 0)), 0.85 + 0.2 * random(), { sy: 0.5, shelf: 0.6 }));
    crownY = Math.max(crownY, tip.y);
  }
  const openAt = (_at: V3, n: V3): number => Math.min(1, Math.max(0, 0.55 + 0.45 * n.y));
  return { tubes, clumps, tile: T_ROSETTE, spray: 0.46, cards: 18, rRef: 0.85, openAt, crownY, least: [8, 4] };
}

// ---- ocotillo ----

export function planOcotillo(seed: number, height = 4.5): Plan {
  const random = mulberry(seed);
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const whips = 10 + Math.floor(random() * 8);
  const tips: V3[] = [];
  for (let i = 0; i < whips; i++) {
    const a = random() * TAU;
    const lean = 0.12 + 0.3 * random();
    const h = height * (0.65 + 0.4 * random());
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const base = out.clone().multiplyScalar(0.12);
    const mid = base.clone().addScaledVector(out, h * lean * 0.45).add(new V3(0, h * 0.5, 0));
    const tip = base.clone().addScaledVector(out, h * lean).add(new V3(0, h, 0));
    tubes.push({ curve: curve([base, mid, tip]), r0: 0.035, r1: 0.014, cls: BOUGH });
    // (its thin leaves along it, after the rains: small clumps up the whip)
    for (const u of [0.45, 0.7]) clumps.push(clump(base.clone().lerp(tip, u), 0.16, { sy: 1.6, stretch: 1, along: tip.clone().sub(base).normalize() }));
    tips.push(tip);
  }
  const openAt = (_at: V3, n: V3): number => Math.min(1, Math.max(0, 0.6 + 0.4 * n.y));
  return { tubes, clumps, tile: T_ROUND, spray: 0.12, cards: 10, rRef: 0.16, openAt, crownY: height * 0.6, least: [3, 1] };
}

// ---- araucaria ----

export function planAraucaria(seed: number, height = 22): Plan {
  const random = mulberry(seed);
  const H = height * (0.88 + 0.24 * random());
  const girth = H * 0.022;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  tubes.push({ curve: curve([new V3(0, 0, 0), new V3(0, H * 0.5, 0), new V3(0, H, 0)]), r0: girth, r1: girth * 0.35, cls: BOLE, furrow: 0.6, flare: 0.3 });
  // whorls of branches over the top third: level out, curving up at the ends, each end a dark tuft
  const whorls = 6 + Math.floor(random() * 3);
  const from = H * (0.52 + 0.06 * random());
  for (let w = 0; w < whorls; w++) {
    const u = w / (whorls - 1);
    const y = from + (H * 0.97 - from) * u;
    const reach = H * (0.28 - 0.18 * u) * (0.9 + 0.2 * random());
    const n = 6 + Math.floor(random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + w * 0.7 + random() * 0.3;
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const p0 = new V3(0, y, 0);
      const p1 = p0.clone().addScaledVector(out, reach * 0.6).add(new V3(0, -reach * 0.05, 0));
      const p2 = p0.clone().addScaledVector(out, reach).add(new V3(0, reach * 0.28, 0));
      tubes.push({ curve: curve([p0, p1, p2]), r0: girth * 0.32, r1: girth * 0.1, cls: LIMB });
      clumps.push(clump(p2.clone().add(new V3(0, reach * 0.06, 0)), Math.max(0.7, reach * 0.36), { sy: 0.7, shelf: 0.3 }));
      // (the branch's own length dark with its scales: a clump along it)
      clumps.push(clump(p1.clone().add(new V3(0, reach * 0.04, 0)), Math.max(0.5, reach * 0.24), { sy: 0.6, shelf: 0.3 }));
    }
  }
  clumps.push(clump(new V3(0, H * 0.98, 0), H * 0.08, { sy: 0.8 }));
  const openAt = (at: V3, n: V3): number => openness(Math.hypot(at.x, at.z) / (H * 0.26), n.y, 0.3, 0.9);
  return { tubes, clumps, tile: T_PINE, spray: H * 0.03, cards: 22, rRef: H * 0.05, openAt, crownY: H * 0.82 };
}
