// Grows her from code and writes the meshes the game loads (public/models/character/her.bin): the body seen from
// outside, and both arms finer for the first-person view. Deterministic: the same code gives the same file.
//   npx tsx tools/character/build.ts [--fast]
import fs from 'node:fs';
import { buildSkeleton } from '../../src/core/character/skeleton';
import { sculptBody } from '../../src/core/character/body';
import { buildSkinned, packSkinned } from '../../src/core/character/mesh';
import { meshStats } from '../../src/core/character/polygonize';
import { growHairSolid } from '../../src/core/character/hairSdf';
import { headLocal, maskField, sculptHead } from '../../src/core/character/head';
import { fieldNormals, polygonize } from '../../src/core/character/polygonize';
import { decimate } from '../../src/core/character/decimate';
import { growHelmet } from '../../src/core/character/helmet';
import { HEADWEAR } from '../../src/core/character/body';
import { makeDress } from '../../src/core/character/dress';
import { PATTERNS, type Pattern, growGarment } from '../../src/core/character/wardrobe';

const fast = process.argv.includes('--fast');
const t0 = performance.now();
const sk = buildSkeleton();
const sc = sculptBody(sk);
const body = buildSkinned(sk, sc, { h: fast ? 0.004 : 0.0024, target: fast ? 20000 : 28000, min: [-0.62, -0.01, -0.2], max: [0.62, 1.66, 0.22] });
console.log('body', meshStats({ positions: Float64Array.from(body.positions), indices: body.indices }), ((performance.now() - t0) / 1000).toFixed(1), 's');
const parts: Record<string, ReturnType<typeof buildSkinned>> = { body };
for (const s of ['l', 'r'] as const) {
  const t1 = performance.now();
  const sh = sk.bindPos[sk.index[`upperarm_${s}`]], el = sk.bindPos[sk.index[`lowerarm_${s}`]];
  const dir = [el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]];
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  const n = dir.map((v) => v / L) as [number, number, number];
  const cut = [sh[0] + n[0] * L * 0.35, sh[1] + n[1] * L * 0.35, sh[2] + n[2] * L * 0.35] as [number, number, number];
  const m = s === 'l' ? 1 : -1;
  const xs = [cut[0], m * 0.66].sort((a, b) => a - b);
  const arm = buildSkinned(sk, sc, {
    h: fast ? 0.002 : 0.0011, target: fast ? 9000 : 12500,
    min: [xs[0] - 0.05, 0.7, -0.12], max: [xs[1] + 0.02, cut[1] + 0.06, 0.16],
    keep: { at: cut, n }, maxEdge: 0.02,
  });
  parts[`arm_${s}`] = arm;
  console.log(`arm_${s}`, meshStats({ positions: Float64Array.from(arm.positions), indices: arm.indices }), ((performance.now() - t1) / 1000).toFixed(1), 's');
}
// her head's hair (one solid, hairSdf.ts) and the mask in place of her face (head.ts)
const th = performance.now();
const hs = sculptHead(sk);
if (HEADWEAR === 'helmet') {
  // a full-face helmet in place of her head (helmet.ts): no hair, no mask
  const helmet = growHelmet(hs, { h: fast ? 0.002 : 0.0012, target: fast ? 8000 : 24000 });
  console.log('helmet', helmet.indices.length / 3, 'triangles', ((performance.now() - th) / 1000).toFixed(1), 's');
  (parts as Record<string, unknown>).helmet = helmet;
} else {
const hair = growHairSolid(hs, sk.index.Head, { h: fast ? 0.0024 : 0.0014, target: fast ? 9000 : 40000 });
console.log('hair', hair.indices.length / 3, 'triangles', ((performance.now() - th) / 1000).toFixed(1), 's');
(parts as Record<string, unknown>).hair = hair;
{
  const mf = maskField(hs);
  const O = hs.o;
  const raw = polygonize(mf, { h: 0.0009, min: [O[0] - 0.075, O[1] - 0.05, O[2] - 0.01], max: [O[0] + 0.075, O[1] + 0.15, O[2] + 0.12], project: 3 });
  const dec = decimate(raw.positions, raw.indices, { target: 2400, maxEdge: 0.008 });
  const positions = new Float32Array(dec.positions);
  const normals = fieldNormals(mf, positions, 0.0006);
  const mask = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    const l = headLocal(hs, positions, i * 3);
    mask[i * 2] = l[0];
    mask[i * 2 + 1] = l[1];
  }
  (parts as Record<string, unknown>).mask = { positions, normals, indices: dec.indices, mask };
  console.log('mask', dec.indices.length / 3, 'triangles');
}
}
const t2 = performance.now();
const dress = makeDress(sk, sc);
const P = parts as Record<string, unknown>;
P.bodice = dress.bodice;
P.ribbons = dress.ribbons;
P.bandage = dress.bandage;
const { cols, rows, closed, ...skirtArrays } = dress.skirt;
P.skirt = skirtArrays;
dress.tails.forEach((t, i) => { const { width, ...arrays } = t; void width; P[`tail${i}`] = arrays; });
console.log('dress', dress.bodice.indices.length / 3, 'bodice triangles, skirt', cols, 'x', rows, ((performance.now() - t2) / 1000).toFixed(1), 's');
// the wardrobe: every pattern, and the sleeves and gloves again finer for first person
const t3 = performance.now();
const garments: string[] = [];
for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
  if (process.argv.includes('--no-clothes')) break;
  const t4 = performance.now();
  const g = growGarment(sk, sc, pattern);
  if (g) { P[`garment_${pattern}`] = g; garments.push(pattern); }
  const fine = /^(jacket|sweater|padded|down|gloves)/.test(pattern) && !fast ? growGarment(sk, sc, pattern, true) : null;
  if (fine) P[`garment_${pattern}_fp`] = fine;
  console.log('garment', pattern, g ? g.indices.length / 3 : 0, fine ? fine.indices.length / 3 : '', ((performance.now() - t4) / 1000).toFixed(1), 's');
}
console.log('wardrobe', ((performance.now() - t3) / 1000).toFixed(1), 's');
const meta = {
  garments,
  skirt: { cols, rows, closed },
  tails: dress.tails.map((t) => ({ width: t.width })),
  version: 1,
  bones: sk.names,
  parents: sk.parents,
  t: sk.t,
  rest: sk.rest,
  bind: sk.bind,
  eyeLocal: sk.eyeLocal,
  eyeHeight: sk.eyeHeight,
  built: 'tools/character/build.ts',
};
const out = packSkinned(parts, meta);
fs.writeFileSync('public/models/character/her.bin', out);
console.log('wrote public/models/character/her.bin', (out.byteLength / 1e6).toFixed(2), 'MB', ((performance.now() - t0) / 1000).toFixed(1), 's');
