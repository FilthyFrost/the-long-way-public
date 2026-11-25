// Close looks at one part of her (polygonized finely in a box round it): head, hand, foot, torso.
//   npx tsx tools/character/closeup.ts head|hand|foot|torso [cell mm] [out.png]
import { buildSkeleton } from '../../src/core/character/skeleton';
import { sculptBody } from '../../src/core/character/body';
import { compile } from '../../src/core/character/sdf';
import { fieldNormals, meshStats, polygonize } from '../../src/core/character/polygonize';
import { type Cam, draw, ink, load, newPicture, row, save } from './raster';

const what = process.argv[2] || 'head';
const h = (Number(process.argv[3]) || 1.5) / 1000;
const outFile = process.argv[4] || `.char-work/close_${what}.png`;
const sk = buildSkeleton();
const sc = sculptBody(sk);
const f = compile(sc.tree, 0.04);
const J = (n: string) => sk.bindPos[sk.index[n]];

type Box = { min: [number, number, number]; max: [number, number, number] };
const around = (c: number[], r: number[]): Box => ({ min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]] });
let box: Box;
let cams: Cam[];
let refs: [number, number, number, number][] = [];
const head = J('Head');
if (what === 'head') {
  const c = [0, head[1] + 0.09, head[2] + 0.01];
  box = around(c, [0.11, 0.16, 0.13]);
  const t: [number, number, number] = [0, head[1] + 0.07, head[2] + 0.02];
  cams = [
    { eye: [0, t[1], 3], target: t, ortho: 0.36 },
    { eye: [3, t[1], t[2]], target: t, ortho: 0.36 },
    { eye: [2.1, t[1] + 0.3, 2.1], target: t, ortho: 0.36 },
    { eye: [0, t[1] - 0.6, 3], target: t, ortho: 0.36 },
  ];
  refs = [[300, 40, 300, 330], [880, 40, 300, 330]];
} else if (what === 'hand') {
  const w = J('hand_l'), mtip = J('middle_04_leaf_l');
  const c = [(w[0] + mtip[0]) / 2, (w[1] + mtip[1]) / 2, (w[2] + mtip[2]) / 2];
  box = around(c, [0.11, 0.11, 0.11]);
  const t = c as [number, number, number];
  const d = 2.5;
  cams = [
    { eye: [t[0] + d * 0.7, t[1] + d * 0.7, t[2]], target: t, ortho: 0.2, up: [0, 0, 1] }, // back of the hand
    { eye: [t[0] - d * 0.7, t[1] - d * 0.7, t[2]], target: t, ortho: 0.2, up: [0, 0, 1] }, // palm
    { eye: [t[0], t[1], t[2] + d], target: t, ortho: 0.2 }, // from the front: thumb side
    { eye: [t[0] + 0.25, t[1] + 0.15, t[2] + 0.3], target: t, fov: 40 },
  ];
} else if (what === 'foot') {
  const a = J('foot_l');
  const c = [a[0], 0.06, a[2] + 0.04];
  box = around(c, [0.07, 0.09, 0.13]);
  const t = [a[0], 0.05, a[2] + 0.04] as [number, number, number];
  cams = [
    { eye: [t[0] + 3, t[1], t[2]], target: t, ortho: 0.26 },
    { eye: [t[0], t[1] + 3, t[2] + 0.001], target: t, ortho: 0.26, up: [0, 0, -1] },
    { eye: [t[0], t[1] + 0.3, t[2] + 3], target: t, ortho: 0.26 },
    { eye: [t[0] + 0.25, t[1] + 0.3, t[2] + 0.35], target: t, fov: 40 },
  ];
} else {
  const c = [0, 1.05, 0];
  box = around(c, [0.25, 0.32, 0.16]);
  const t = [0, 1.05, 0] as [number, number, number];
  cams = [
    { eye: [0, 1.05, 3], target: t, ortho: 0.7 },
    { eye: [3, 1.05, 0], target: t, ortho: 0.7 },
    { eye: [0, 1.05, -3], target: t, ortho: 0.7 },
    { eye: [2.1, 1.3, 2.1], target: t, ortho: 0.7 },
  ];
}
const t0 = performance.now();
const m = polygonize(f, { h, ...box });
const normals = fieldNormals(f, m.positions, h * 0.5);
console.log(what, (performance.now() - t0).toFixed(0), 'ms', meshStats(m));
const mesh = { positions: m.positions, normals, indices: m.indices, color: [0.21, 0.115, 0.085] as [number, number, number] };
const light = { dir: [0.35, 0.6, 0.72] as [number, number, number], lit: [1.25, 1.2, 1.15] as [number, number, number], shade: [0.62, 0.55, 0.68] as [number, number, number] };
const S = 520;
const pics = cams.map((c) => {
  const p = newPicture(S, S);
  draw(p, mesh, c, light);
  ink(p, 0.003);
  return p;
});
const refPics = refs.map((r) => load('refs/character/turnaround.png', r, S));
save(row([...refPics, ...pics]), outFile);
console.log('wrote', outFile);
