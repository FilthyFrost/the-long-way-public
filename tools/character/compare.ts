// Her body beside the turnaround: front, side and back at the turnaround's own scale (1.63 m to the crown =
// 1250 px), each next to the reference figure, written to .char-work/compare.png. Usage:
//   npx tsx tools/character/compare.ts [cell mm] [out.png]
import { buildSkeleton } from '../../src/core/character/skeleton';
import { sculptBody } from '../../src/core/character/body';
import { compile } from '../../src/core/character/sdf';
import { fieldNormals, meshStats, polygonize } from '../../src/core/character/polygonize';
import { draw, ink, load, newPicture, row, save } from './raster';

const h = (Number(process.argv[2]) || 4) / 1000;
const outFile = process.argv[3] || '.char-work/compare.png';
const t0 = performance.now();
const sk = buildSkeleton();
const sc = sculptBody(sk);
const f = compile(sc.tree, 0.04);
const m = polygonize(f, { h, min: [-0.62, -0.01, -0.2], max: [0.62, 1.66, 0.22] });
const normals = fieldNormals(f, m.positions, h * 0.5);
console.log('polygonize', (performance.now() - t0).toFixed(0), 'ms', meshStats(m));

const PXM = 1250 / 1.63; // the turnaround's pixels a metre
const SOLE = 1358;
const H = 1449;
const ortho = H / PXM;
const cy = (SOLE - H / 2) / PXM;
const skin: [number, number, number] = [0.21, 0.115, 0.085];
const mesh = { positions: m.positions, normals, indices: m.indices, color: skin };
const light = { dir: [0.35, 0.6, 0.72] as [number, number, number], lit: [1.25, 1.2, 1.15] as [number, number, number], shade: [0.62, 0.55, 0.68] as [number, number, number] };

const views: { crop: [number, number, number, number]; eye: [number, number, number]; cx: number }[] = [
  { crop: [200, 0, 480, H], eye: [0, cy, 5], cx: 0 },
  { crop: [810, 0, 400, H], eye: [5, cy, 0], cx: 0 },
  { crop: [1430, 0, 435, H], eye: [0, cy, -5], cx: 0 },
];
const pics = [];
for (const v of views) {
  const ref = load('refs/character/turnaround.png', v.crop);
  const pic = newPicture(v.crop[2], H);
  draw(pic, mesh, { eye: v.eye, target: [0, cy, 0], ortho }, light);
  ink(pic, 0.004);
  pics.push(ref, pic);
}
save(row(pics), outFile);
console.log('wrote', outFile, ((performance.now() - t0) / 1000).toFixed(1), 's');
