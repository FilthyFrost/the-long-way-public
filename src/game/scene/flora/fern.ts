/**
 * The toolkit's ground fern (docs/V3/nodes/P2-B-kit-ground.md): a crown of fronds on the forest floor, each frond
 * arching up and out from the crown and drooping at its tip — the tree fern's fronds without its trunk, knee-high.
 * Within the shrubs' budget (800 triangles near, 200 in the middle distance).
 */
import * as THREE from 'three';
import type { Out } from '../crowns/grow';
import { mulberry } from '../vegetation';
import { T_FERN } from './atlas';
import { V3, smooth, writeFrond, type Clump, type Level, type Plan } from './kit';

const clump = (c: V3, r: number, o: Partial<Clump> = {}): Clump => ({ c, r, sy: 0.8, stretch: 1, along: null, shelf: 0, curtain: 0, out: new V3(c.x, 0, c.z).normalize(), open: 0, ...o });

export function planFern(seed: number, height = 0.8): Plan {
  const random = mulberry(seed);
  const H = height * (0.75 + 0.5 * random());
  const crown = new V3(0, H * 0.05, 0);
  const fronds = 7 + Math.floor(random() * 4);
  const spec: { a: number; el: number; len: number }[] = [];
  for (let k = 0; k < fronds; k++) spec.push({ a: k * 2.39996 + random() * 0.5, el: 0.55 + 0.6 * random(), len: H * (1.05 + 0.35 * random()) });
  const openAt = (at: V3, n: V3): number => Math.min(1, Math.max(0, (0.35 + 0.65 * smooth(at.distanceTo(crown) / (H * 1.2), 0.1, 0.8)) * (0.6 + 0.4 * smooth(n.y, -0.5, 0.6))));
  const segsAt = [8, 4];
  const extra = (out: Out, level: Level, rnd: () => number): void => {
    for (const f of spec) {
      const d = new V3(Math.cos(f.a) * Math.cos(f.el), Math.sin(f.el), Math.sin(f.a) * Math.cos(f.el));
      // up and out, then over and down at the tip
      const p1 = crown.clone().addScaledVector(d, f.len * 0.55);
      const p2 = crown.clone().addScaledVector(new V3(d.x, 0, d.z).normalize(), f.len * 0.9).add(new V3(0, f.len * (Math.sin(f.el) * 0.35 - 0.05), 0));
      writeFrond(out, new THREE.QuadraticBezierCurve3(crown.clone(), p1, p2), (t) => f.len * 0.16 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)) + 0.01, segsAt[level], 0.2, T_FERN, crown, 0.85, rnd);
    }
  };
  return {
    tubes: [],
    clumps: [clump(crown.clone().add(new V3(0, H * 0.06, 0)), H * 0.12, { sy: 0.7 })],
    tile: T_FERN,
    spray: H * 0.12,
    cards: 4,
    rRef: H * 0.12,
    openAt,
    crownY: H * 0.4,
    extra,
    extraTris: (level) => spec.length * segsAt[level] * 4,
    least: [2, 0],
  };
}
