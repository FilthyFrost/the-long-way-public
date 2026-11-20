/**
 * The round broadleaf (docs/V3/art/plants-standard.md §3): an archetype grown as Painted Valley grows its trees
 * (D:/美术参考/painted-valley src/valley/trees.js growTree, MIT; its rules, not its code): a short bole leaning a
 * little, a few thick limbs from its top bending out and up into the crown, two or three boughs from each limb, and
 * the crown a full uneven dome of clumps — one at the end of every limb and bough, more laid on the dome's skin —
 * so that its outline is a mass and not a ring of branch ends, and the wood shows only where a painter would leave
 * it: the bole and the first of the limbs.
 *
 * One archetype, many species: an oak, a maple, a linden, a beech, a chestnut are its shapes by their numbers
 * (BroadleafShape); a birch's is the same with a leader up its middle and a narrow crown. Every length is scaled so
 * the tree stands `height` tall. DOM-free and deterministic.
 */
import * as THREE from 'three';
import { mulberry } from '../vegetation';
import { BOLE, BOUGH, LIMB, TAU, V3, smooth, type Clump, type Plan, type Tube } from './kit';

export interface BroadleafShape {
  /** the bole's height and radius, the crown's radius and height (m, as Painted Valley's numbers: scaled to height) */
  trunk: number;
  girth: number;
  crown: number;
  rise: number;
  /** how many limbs, a clump's radius (m), how many clumps laid on the dome's skin */
  limbs: number;
  clump: number;
  fill: number;
  /** sprays to a clump of `clump` radius near, and a spray's size (m) */
  cards: number;
  spray: number;
  /** boughs to a limb (the fewest, the most) */
  boughs?: [number, number];
  /**
   * A leader: the bole goes on up the middle to this share of the crown's height (a birch's, a poplar's), the limbs
   * along it rather than from its top; 0: none (an oak's, a maple's).
   */
  leader?: number;
  /** how far the limbs rise (0 … 1: Painted Valley's 0.38 … 1 rad of elevation, scaled), how the crown is squashed */
  elevation?: number;
  squash?: number;
  /** the atlas tile its sprays are cut from */
  tile: number;
  /** how deeply its bark is furrowed (0 … 1) */
  furrow?: number;
}

const curve = (pts: THREE.Vector3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts);

export function planBroadleaf(seed: number, height: number, o: BroadleafShape): Plan {
  const random = mulberry(seed);
  // (Painted Valley's numbers are for a tree of its own height: everything scaled to this one's, give or take a tenth)
  const H = height * (0.9 + 0.2 * random());
  const k = H / (o.trunk + o.rise);
  const trunk = o.trunk * k;
  const girth = o.girth * k;
  const crown = o.crown * k * (0.92 + 0.16 * random());
  const rise = o.rise * k;
  const clumpR = o.clump * k;
  const squash = o.squash ?? 0.82;
  const leader = o.leader ?? 0;
  const elev = o.elevation ?? 1;
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const clump = (c: V3, r: number): Clump => ({ c, r, sy: squash, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0 });

  // the bole: leaning a little, its crown fuller on one side
  const lean = random() * TAU;
  const top = new V3(Math.cos(lean) * trunk * 0.1, trunk, Math.sin(lean) * trunk * 0.1);
  const crownY = trunk + rise * 0.42;
  if (leader > 0) {
    // (a leader: the bole on up through the crown, slimming, a little wandering)
    const lt = trunk + rise * leader;
    const pts = [new V3(0, -0.8, 0), new V3(Math.cos(lean + 1) * girth * 0.25, trunk * 0.45, Math.sin(lean + 1) * girth * 0.25), top];
    for (let s = 1; s <= 3; s++) {
      const y = trunk + ((lt - trunk) * s) / 3;
      pts.push(new V3(top.x * (1 + s * 0.4) + Math.sin(s * 2.1 + lean) * girth * 0.6, y, top.z * (1 + s * 0.4) + Math.cos(s * 1.7 + lean) * girth * 0.6));
    }
    tubes.push({ curve: curve(pts), r0: girth, r1: girth * 0.16, cls: BOLE, flare: 0.55, furrow: o.furrow ?? 0.4 });
  } else {
    tubes.push({ curve: curve([new V3(0, -0.8, 0), new V3(Math.cos(lean + 1) * girth * 0.25, trunk * 0.45, Math.sin(lean + 1) * girth * 0.25), top]), r0: girth, r1: girth * 0.74, cls: BOLE, flare: 1.1, furrow: o.furrow ?? 0.8 });
  }
  const bole = tubes[0].curve;
  const full = lean + 2 + random() * 2;
  const reach = (a: number): number => crown * (0.82 + 0.26 * Math.cos(a - full) + 0.1 * Math.sin(a * 3 + seed));

  // the limbs, from the bole's top (or along the leader), bending out and up, two or three boughs from each
  const [b0, b1] = o.boughs ?? [2, 3];
  for (let i = 0; i < o.limbs; i++) {
    const a = ((i + 0.15 + random() * 0.7) / o.limbs) * TAU;
    const e = (0.38 + random() * 0.62) * elev + (leader > 0 ? 0.15 : 0);
    const len = reach(a) * (0.62 + 0.26 * random()) * (leader > 0 ? 0.8 : 1);
    // (along a leader: from its upper half, where the crown is, never from the bare stem below it)
    const from = leader > 0 ? bole.getPoint(0.55 + (0.38 * (i + random() * 0.6)) / o.limbs) : top.clone().add(new V3(0, -girth * 0.5, 0));
    const dir = new V3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    const side = new V3(-Math.sin(a), 0, Math.cos(a));
    const bend = (random() - 0.5) * len * 0.3;
    const mid = from.clone().addScaledVector(dir, len * 0.5).addScaledVector(side, bend).add(new V3(0, -len * 0.07, 0));
    const end = from.clone().addScaledVector(dir, len).addScaledVector(side, bend * 0.4).add(new V3(0, len * 0.14, 0));
    const q1 = from.clone().lerp(mid, 0.5).add(new V3((random() - 0.5) * len * 0.12, len * 0.05, (random() - 0.5) * len * 0.12));
    const q3 = mid.clone().lerp(end, 0.5).add(new V3((random() - 0.5) * len * 0.14, -len * 0.04, (random() - 0.5) * len * 0.14));
    const limb = curve([from, q1, mid, q3, end]);
    const rl = girth * (0.36 + 0.12 * random()) * (leader > 0 ? 0.7 : 1);
    tubes.push({ curve: limb, r0: rl, r1: girth * 0.1, cls: LIMB, furrow: (o.furrow ?? 0.8) * 0.5 });
    clumps.push(clump(end, clumpR * (0.85 + 0.4 * random())));
    const boughs = b0 + Math.floor(random() * (b1 - b0 + 1));
    for (let j = 0; j < boughs; j++) {
      const at = limb.getPoint(0.4 + 0.45 * random());
      const a2 = a + (random() - 0.5) * 2.2;
      const e2 = 0.25 + random() * 0.85;
      const l2 = len * (0.34 + 0.26 * random());
      const d2 = new V3(Math.cos(a2) * Math.cos(e2), Math.sin(e2), Math.sin(a2) * Math.cos(e2));
      const end2 = at.clone().addScaledVector(d2, l2);
      const mid2 = at.clone().addScaledVector(d2, l2 * 0.5).add(new V3((random() - 0.5) * l2 * 0.2, l2 * 0.06, (random() - 0.5) * l2 * 0.2));
      tubes.push({ curve: curve([at, mid2, end2]), r0: girth * 0.13, r1: girth * 0.035, cls: BOUGH });
      clumps.push(clump(end2, clumpR * (0.75 + 0.45 * random())));
    }
  }
  // clumps on the skin of the crown, so that its outline is a full, uneven dome and not a ring of branch ends
  for (let i = 0; i < o.fill; i++) {
    const a = random() * TAU;
    const up = Math.min(0.96, -0.3 + 1.3 * random());
    const ring = Math.sqrt(1 - up * up);
    const r = reach(a) * 0.8;
    clumps.push(clump(new V3(Math.cos(a) * ring * r, crownY + up * rise * 0.5, Math.sin(a) * ring * r), clumpR * (0.8 + 0.5 * random())));
  }
  // how deep in the crown a point sits: the inside and the underside are dark (Painted Valley's own measure)
  const openAt = (at: V3, n: V3): number => {
    const e = Math.hypot(at.x / crown, (at.y - crownY) / (rise * 0.5), at.z / crown);
    const low = smooth((at.y - crownY) / (rise * 0.5), -0.9, 0.2);
    void n;
    return Math.min(1, Math.max(0, (0.22 + 0.78 * smooth(e, 0.4, 0.95)) * (0.55 + 0.45 * low)));
  };
  return { tubes, clumps, tile: o.tile, spray: o.spray * k, cards: o.cards, rRef: clumpR, openAt, crownY };
}
