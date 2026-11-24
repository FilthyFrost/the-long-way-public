/**
 * What grows in an ND plant pot, drawn (docs/ND/PLAN.md; the rules: core/v3/nd/plants.ts): each crop a plan of the
 * plant toolkit (scene/flora/kit.ts — Painted Valley's way, a dark lumpy core the sprays stand on, each spray lit by
 * its clump's ball normal), painted by the crowns' material as the world's own plants are: an apple sapling with a
 * round crown, a tomato climbing its cane, a bushy potato in flower, a watermelon's vine trailing over the rim. A
 * plant is planned once at its full size and drawn smaller while it is young; ripe, its fruits are the fruits' own
 * models where its plan puts them. Positions are in the pot's frame, metres over its soil.
 */
import * as THREE from 'three';
import type { CropId } from '../../../../core/v3/nd/items';
import { T_HERB, T_ROUND, T_ROSETTE } from '../../../scene/flora/atlas';
import { draw, LIMB, smooth, TAU, TWIG, V3, writeBloom, type Clump, type Plan, type Tube } from '../../../scene/flora/kit';
import { mulberry } from '../../../scene/vegetation';

export interface CropLook {
  /** leaf, bark (the crowns' material: aLook.z, .w), whether it is drawn bright */
  leaf: number;
  second: number;
  bright: boolean;
}

export const CROP_LOOK: Readonly<Record<CropId, CropLook>> = {
  apple: { leaf: 0x7aa64a, second: 0x6b4a35, bright: true },
  tomato: { leaf: 0x5e9440, second: 0x5d7a3a, bright: true },
  potato: { leaf: 0x6a9a44, second: 0x5d7a3a, bright: true },
  watermelon: { leaf: 0x5f8f3c, second: 0x6f8f45, bright: true },
};

export interface CropDrawn {
  /** how big the plant is once it is ripe (a potato dies back over its tubers), against its full size */
  ripe: number;
  geometry: THREE.BufferGeometry;
  /** where its fruits hang when it is ripe (the pot's frame, over the soil), and how big each is drawn */
  fruits: THREE.Vector3[];
  fruitScale: number;
  /** a cane it climbs (the tomato's): from the soil to this height, null none */
  cane: number | null;
}

const ball = (c: V3, r: number, sy: number, out: V3, o: Partial<Clump> = {}): Clump => ({ c, r, sy, stretch: 1, along: null, shelf: 0.15, curtain: 0, out, open: 0, ...o });

/** a crop's plan at its full size, and where its fruits go */
function planCrop(crop: CropId, seed: number): { plan: Plan; fruits: V3[]; fruitScale: number; cane: number | null } {
  const random = mulberry(seed);
  const tubes: Tube[] = [];
  const clumps: Clump[] = [];
  const fruits: V3[] = [];
  let H = 0.5;
  let W = 0.25;
  let tile = T_ROUND;
  let cane: number | null = null;
  let fruitScale = 0.55;
  const turn = random() * TAU;
  let extra: Plan['extra'];
  let extraTris: Plan['extraTris'];
  if (crop === 'apple') {
    // a sapling: a stem to its fork, four limbs, a round crown of five masses; four apples on its skin
    H = 0.62;
    W = 0.26;
    const fork = new V3(0, H * 0.42, 0);
    tubes.push({ curve: new THREE.CatmullRomCurve3([new V3(0, -0.04, 0), new V3(0.01, H * 0.2, 0), fork]), r0: 0.016, r1: 0.011, cls: LIMB });
    for (let i = 0; i < 5; i++) {
      const a = turn + i * 2.39996;
      const top = i === 0;
      const ring = top ? 0 : W * (0.5 + 0.2 * random());
      const c = new V3(Math.cos(a) * ring, top ? H * 0.86 : H * (0.62 + 0.1 * random()), Math.sin(a) * ring);
      clumps.push(ball(c, W * (top ? 0.52 : 0.46) * (0.85 + 0.3 * random()), 0.82, new V3(Math.cos(a), 0, Math.sin(a))));
      if (i > 0) tubes.push({ curve: new THREE.CatmullRomCurve3([fork.clone(), fork.clone().lerp(c, 0.55).add(new V3(0, 0.03, 0)), c.clone().multiplyScalar(0.9)]), r0: 0.008, r1: 0.004, cls: TWIG });
      if (i > 0) fruits.push(c.clone().add(new V3(Math.cos(a) * W * 0.5, -W * 0.14, Math.sin(a) * W * 0.5)));
    }
    fruitScale = 0.6;
  } else if (crop === 'tomato') {
    // a vine up its cane: the stem zig-zagging, small masses along it on both sides; four tomatoes hanging
    H = 0.72;
    W = 0.2;
    tile = T_HERB;
    cane = H + 0.04;
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) pts.push(new V3(0.018 * Math.sin(k * 1.9) + 0.012, H * (k / 6), 0.018 * Math.cos(k * 1.7)));
    tubes.push({ curve: new THREE.CatmullRomCurve3(pts), r0: 0.008, r1: 0.004, cls: TWIG });
    for (let i = 0; i < 7; i++) {
      const a = turn + i * 2.2;
      const y = H * (0.18 + 0.8 * (i / 6));
      const c = new V3(Math.cos(a) * W * 0.55, y, Math.sin(a) * W * 0.55);
      clumps.push(ball(c, W * (0.42 - 0.12 * (i / 6)) * (0.85 + 0.3 * random()), 0.75, new V3(Math.cos(a), 0, Math.sin(a)), { droop: 0.3 }));
      tubes.push({ curve: new THREE.CatmullRomCurve3([new V3(0.012, y - 0.03, 0), c.clone().multiplyScalar(0.7).add(new V3(0, 0.02, 0)), c.clone()]), r0: 0.004, r1: 0.002, cls: TWIG });
      if (i >= 1 && i <= 4) fruits.push(new V3(Math.cos(a + 0.9) * W * 0.4, y - 0.06, Math.sin(a + 0.9) * W * 0.4));
    }
    fruitScale = 0.48;
  } else if (crop === 'potato') {
    // a bushy mound of leaves with a few white flowers on top; the potatoes dug up on the soil
    H = 0.4;
    W = 0.26;
    tile = T_HERB;
    for (let i = 0; i < 6; i++) {
      const a = turn + i * 2.39996;
      const top = i === 0;
      const ring = top ? 0 : W * (0.45 + 0.25 * random());
      const c = new V3(Math.cos(a) * ring, top ? H * 0.72 : H * (0.35 + 0.2 * random()), Math.sin(a) * ring);
      clumps.push(ball(c, W * 0.5 * (0.8 + 0.35 * random()), 0.7, new V3(Math.cos(a), 0, Math.sin(a))));
      tubes.push({ curve: new THREE.CatmullRomCurve3([new V3(0, -0.02, 0), c.clone().multiplyScalar(0.5), c.clone()]), r0: 0.007, r1: 0.004, cls: TWIG });
    }
    const blooms: V3[] = [];
    for (let k = 0; k < 5; k++) {
      const a = turn + k * 1.3;
      blooms.push(new V3(Math.cos(a) * W * 0.35 * random(), H * (0.85 + 0.15 * random()), Math.sin(a) * W * 0.35 * random()));
    }
    extra = (out, level, rnd) => {
      if (level > 0) return;
      for (const b of blooms) writeBloom(out, b, new V3(0, 1, 0), 0.035, 5, 0.4, rnd);
    };
    extraTris = (level) => (level === 0 ? blooms.length * 10 * 2 : 0);
    for (let i = 0; i < 4; i++) {
      const a = turn + 0.6 + i * (TAU / 4);
      fruits.push(new V3(Math.cos(a) * 0.112, -0.004, Math.sin(a) * 0.112));
    }
    fruitScale = 0.62;
  } else {
    // a watermelon's vine: runners trailing over the rim, broad flat leaves, the melon sitting in the middle
    H = 0.22;
    W = 0.34;
    tile = T_ROSETTE;
    for (let i = 0; i < 5; i++) {
      const a = turn + i * (TAU / 5) + 0.3 * random();
      const tip = new V3(Math.cos(a) * W * 0.95, -0.06 - 0.06 * random(), Math.sin(a) * W * 0.95);
      const mid = new V3(Math.cos(a) * W * 0.72, H * 0.5, Math.sin(a) * W * 0.72);
      tubes.push({ curve: new THREE.CatmullRomCurve3([new V3(0, 0, 0), mid, tip]), r0: 0.006, r1: 0.003, cls: TWIG });
      clumps.push(ball(mid.clone().add(new V3(0, 0.03, 0)), W * 0.34, 0.45, new V3(Math.cos(a), 0, Math.sin(a)), { flat: 0.7, shelf: 0.6 }));
      clumps.push(ball(tip.clone().lerp(mid, 0.35), W * 0.24, 0.4, new V3(Math.cos(a), 0, Math.sin(a)), { flat: 0.8, shelf: 0.6 }));
    }
    fruits.push(new V3(0.0, 0.004, 0.0));
    fruitScale = 1.0;
  }
  const centre = new V3(0, H * 0.55, 0);
  const openAt = (at: V3, n: V3): number => Math.min(1, Math.max(0, (0.3 + 0.7 * smooth(Math.hypot(at.x / W, (at.y - centre.y) / (H * 0.6), at.z / W), 0.3, 0.95)) * (0.55 + 0.45 * smooth(n.y, -0.6, 0.6))));
  const plan: Plan = { tubes, clumps, tile, spray: W * 0.42, cards: 40, rRef: W * 0.5, openAt, crownY: H * 0.55, least: [5, 2], ...(extra ? { extra, extraTris } : {}) };
  return { plan, fruits, fruitScale, cane };
}

/** a crop drawn near, within the budget of a shrub */
export function drawCrop(crop: CropId, seed: number): CropDrawn {
  const { plan, fruits, fruitScale, cane } = planCrop(crop, seed);
  const d = draw(plan, 0, 950, seed);
  return { geometry: d.geometry, fruits, fruitScale, cane, ripe: crop === 'potato' ? 0.62 : 1 };
}
