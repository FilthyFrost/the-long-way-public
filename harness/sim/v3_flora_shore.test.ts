/**
 * The water's own account of its edge (water.ts WaterPlan.shore with lakeShore and riverShore, sea.ts
 * SeaPlan.shore, joined by ecotope.ts shoreOf): how far a point is from the nearest water and which water it
 * is, from the plans' geometry alone. Held here against the land function's own answer to "is this point
 * under water", which is what the ecotope field calls wet:
 *
 *   along lines across shores   0 wherever the land is wet, small on the first dry metre, no step anywhere;
 *   against brute force         the distance it says is the distance to the nearest wet ground, found by
 *                               asking the land on a grid;
 *   in the ecotope field        two tiles that share an edge say the same of it, also where the water lies
 *                               in one of them only (without the water's own account they do not).
 */
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { ECO_N, ECO_TILE, ECO_WET, EcoTile, Ecotope, EcotopeField, WATER_FAR, shoreOf, type ShoreReader } from '../../src/core/world/ecotope';
import { floraTableOf } from '../../src/core/world/floraTables';
import { SeaPlan } from '../../src/core/world/sea';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { WaterPlan, type Lake, type River, type WaterFeature } from '../../src/core/world/water';

const tp = new TerrainPoint();
const out = { dist: 0, kind: 0 };

function worldOf(seed: number, startBiome: string, chapterScale = 4): World {
  return new World(seed, { worldVersion: 2, startBiome, chapterScale });
}

/** is (x, z) under water, as the ecotope field asks the land (and which water: tp.wkind) */
function wet(w: World, x: number, z: number): boolean {
  w.shape(x, z, tp);
  return tp.wl > tp.bed + 0.02;
}

function waters<K extends 'lake' | 'river'>(w: World, kind: K, sMax: number): Extract<WaterFeature, { kind: K }>[] {
  return w.water.between(0, sMax, []).filter((f): f is Extract<WaterFeature, { kind: K }> => f.kind === kind);
}

/** what a walk along a line found */
class Walk {
  /** points under water, and the most the reader said at one of them; how many of them the reader gave to another water */
  wet = 0;
  worstWet = 0;
  otherWater = 0;
  /** crossings of a water's edge, and the most the reader said on the dry side of one */
  shores = 0;
  worstShore = 0;
  /** the most the reader changed from one point to the next, as a share of the step */
  worstStep = 0;
  /** the most it said anywhere */
  most = 0;
}

/** walk n steps of `step` m from (x0, z0) along (ux, uz), asking the land and the reader at every point */
function walk(w: World, reader: ShoreReader, x0: number, z0: number, ux: number, uz: number, n: number, step: number, acc: Walk): void {
  let prev = 0;
  let prevWet = false;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ux * i * step;
    const z = z0 + uz * i * step;
    reader(x, z, out);
    const isWet = wet(w, x, z);
    if (isWet) {
      acc.wet++;
      if (out.dist > acc.worstWet) acc.worstWet = out.dist;
      if (out.kind !== tp.wkind) acc.otherWater++;
    }
    if (i > 0) {
      if (isWet !== prevWet) {
        acc.shores++;
        const dry = isWet ? prev : out.dist;
        if (dry > acc.worstShore) acc.worstShore = dry;
      }
      const d = Math.abs(out.dist - prev) / step;
      if (d > acc.worstStep) acc.worstStep = d;
    }
    if (out.dist > acc.most) acc.most = out.dist;
    prev = out.dist;
    prevWet = isWet;
  }
}

/**
 * The wet ground of a box, by asking the land every `g` m: the wet points that have a dry neighbour (x, z each).
 * The distance from a point to the nearest of them is the distance to the water to within a grid step or so.
 */
function wetEdge(w: World, x0: number, z0: number, x1: number, z1: number, g: number): number[] {
  const W = Math.floor((x1 - x0) / g) + 1;
  const H = Math.floor((z1 - z0) / g) + 1;
  const grid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = wet(w, x0 + i * g, z0 + j * g) ? 1 : 0;
  const pts: number[] = [];
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const n = j * W + i;
      if (grid[n] && !(grid[n - 1] && grid[n + 1] && grid[n - W] && grid[n + W])) pts.push(x0 + i * g, z0 + j * g);
    }
  }
  return pts;
}

/**
 * Ask the reader at `count` points scattered over the box (kept `margin` m inside it, so that the nearest water
 * of each is in the box) and compare with the distance to the nearest wet ground. Returns the worst and the
 * mean of the difference, each less `rel` of the true distance.
 */
function against(w: World, reader: ShoreReader, pts: number[], x0: number, z0: number, x1: number, z1: number, margin: number, count: number, rel: number, seed: number): { worst: number; mean: number; n: number; near: number } {
  let rs = seed;
  const rnd = (): number => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let worst = 0;
  let sum = 0;
  let n = 0;
  let near = 0;
  for (let q = 0; q < count; q++) {
    const x = x0 + margin + rnd() * (x1 - x0 - 2 * margin);
    const z = z0 + margin + rnd() * (z1 - z0 - 2 * margin);
    if (wet(w, x, z)) continue;
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const d2 = (pts[i] - x) * (pts[i] - x) + (pts[i + 1] - z) * (pts[i + 1] - z);
      if (d2 < best) best = d2;
    }
    const truth = Math.min(WATER_FAR, Math.sqrt(best));
    reader(x, z, out);
    const err = Math.max(0, Math.abs(out.dist - truth) - rel * truth);
    if (err > worst) worst = err;
    sum += err;
    n++;
    if (truth < 25) near++;
  }
  return { worst, mean: sum / n, n, near };
}

describe('a lake\'s edge', () => {
  it('is 0 wherever the land is under the lake, small on the first dry metre, and changes by no more than the step along any line', () => {
    const acc = new Walk();
    let lakes = 0;
    for (const [seed, biome] of [[3, 'lakes'], [7, 'wetland'], [9, 'alpine']] as const) {
      const w = worldOf(seed, biome);
      const reader = shoreOf(w);
      for (const f of waters(w, 'lake', 30000).slice(0, 5)) {
        lakes++;
        // rays from the middle of the lake out across its shore and 170 m beyond its basin, a metre at a step
        for (let k = 0; k < 16; k++) {
          const an = (k / 16) * 6.2832 + 0.1;
          walk(w, reader, f.cx, f.cz, Math.cos(an), Math.sin(an), Math.round(Math.max(f.a, f.b) * 1.72 + 170), 1, acc);
        }
        // and lines that pass the lake by, along its length, where the shore runs along the line
        for (const side of [-1, 1]) walk(w, reader, f.cx - f.ax * (f.a + 150) - f.az * side * f.b * 0.9, f.cz - f.az * (f.a + 150) + f.ax * side * f.b * 0.9, f.ax, f.az, Math.round(2 * f.a + 300), 1, acc);
      }
    }
    expect(lakes).toBeGreaterThanOrEqual(12);
    expect(acc.wet).toBeGreaterThan(20000);
    expect(acc.shores).toBeGreaterThanOrEqual(lakes * 16);
    // under water the distance is 0, and the water is the one the land names
    expect(acc.worstWet).toBe(0);
    expect(acc.otherWater).toBe(0);
    // the first dry metre: within the step of the edge (and the two centimetres of water the land does not count)
    expect(acc.worstShore).toBeLessThan(1.5);
    // a distance changes by no more than one walks
    expect(acc.worstStep).toBeLessThanOrEqual(1 + 1e-9);
    expect(acc.most).toBe(WATER_FAR);
  });

  it('is the distance to the nearest wet ground, near and far, round the bays and off the ends of the lake', () => {
    const w = worldOf(11, 'plains');
    const reader = shoreOf(w);
    let lakes = 0;
    for (const f of waters(w, 'lake', 30000)) {
      if (f.a > 200 || lakes >= 3) continue;
      lakes++;
      const M = WATER_FAR + 10;
      const x0 = Math.floor(f.xMin) - M;
      const z0 = Math.floor(f.zMin) - M;
      const x1 = Math.ceil(f.xMax) + M;
      const z1 = Math.ceil(f.zMax) + M;
      const r = against(w, reader, wetEdge(w, x0, z0, x1, z1, 2), x0, z0, x1, z1, M, 900, 0, 77 + f.slot);
      expect(r.n).toBeGreaterThan(500);
      expect(r.near).toBeGreaterThan(30);
      // (the grid is 2 m: the nearest wet point of it is up to some 2 m farther than the water itself, and
      // the reader measures to the water's very edge, the land's wet test to where it is two centimetres deep)
      expect(r.worst, `lake of stretch ${f.slot}`).toBeLessThan(3.3);
      expect(r.mean).toBeLessThan(1.6);
    }
    expect(lakes).toBe(3);
  });

  it('a lake\'s own distance is 0 in its water, grows from its edge, and says `far` where the lake is farther than that', () => {
    const w = worldOf(3, 'lakes');
    const f = waters(w, 'lake', 30000)[0];
    expect(w.water.lakeShore(f, f.cx, f.cz)).toBe(0);
    // along the short axis: the water's edge lies within the plain oval of the shore, a bay's depth or less
    const edge = Math.sqrt(0.8) * f.b;
    let last = 0;
    let first = -1;
    for (let v = 0; v < f.b * 1.72 + 400; v += 0.5) {
      const d = w.water.lakeShore(f, f.cx - f.az * v, f.cz + f.ax * v);
      if (d > 0 && first < 0) first = v;
      if (first >= 0 && v > edge + 1) {
        // beyond the plain oval, straight out from it: a metre out is a metre farther, give or take the shore's slant
        expect(d).toBeGreaterThan(last);
        expect(d).toBeGreaterThanOrEqual(v - edge - 1e-6);
        expect(d).toBeLessThanOrEqual(v - first + 0.5);
      }
      last = d;
    }
    expect(first).toBeGreaterThan(edge - 32);
    expect(first).toBeLessThanOrEqual(edge + 0.5);
    expect(w.water.lakeShore(f, f.cx - f.az * (edge + 400), f.cz + f.ax * (edge + 400), 150)).toBe(150);
    expect(w.water.lakeShore(f, f.cx - f.az * (edge + 100), f.cz + f.ax * (edge + 100), 150)).toBeLessThan(131);
    // the shore measure and the distance agree on where the water is, all round the lake
    let n = 0;
    for (let k = 0; k < 720; k++) {
      const an = (k / 720) * 6.2832;
      for (const rho of [0.6, 0.7, 0.8, 0.86, 0.9]) {
        const x = f.cx + Math.cos(an) * rho * f.a * f.ax - Math.sin(an) * rho * f.b * f.az;
        const z = f.cz + Math.cos(an) * rho * f.a * f.az + Math.sin(an) * rho * f.b * f.ax;
        const d = w.water.lakeShore(f, x, z);
        const inWater = WaterPlan.lakeRho(f, x, z) < Math.sqrt(0.8);
        // (the traced shore is the water's edge to within a hand's width: a point that near it may go either way)
        if (inWater) expect(d).toBeLessThan(0.15);
        else if (d === 0) n++;
      }
    }
    expect(n).toBeLessThan(12);
  });
});

describe('a river\'s edge', () => {
  it('is 0 wherever the land is under the river, small on the first dry metre, and has no step, from the bridge to where the channel fades', () => {
    const acc = new Walk();
    let rivers = 0;
    const rc = { x: 0, dx: 0 };
    for (const [seed, biome] of [[7, 'wetland'], [11, 'plains'], [21, 'karst_peaks'], [5, 'forest']] as const) {
      const w = worldOf(seed, biome);
      const reader = shoreOf(w);
      for (const f of waters(w, 'river', 30000).slice(0, 4)) {
        rivers++;
        // lines across the river, from 220 m on one side to 220 m on the other, at stations along it
        for (const zr of [-2100, -1500, -900, -420, -160, -60, 25, 80, 210, 520, 1000, 1600, 2000]) {
          if (Math.abs(zr) > f.zEnd - 520) continue;
          WaterPlan.riverCentre(f, zr, rc);
          walk(w, reader, rc.x - 220, f.z0 + zr, 1, 0, 440, 1, acc);
        }
        // and along it, a little off its middle, and 40 m off its bank
        walk(w, reader, f.x0 + 3, f.z0 - 800, 0, 1, 1600, 1, acc);
        walk(w, reader, f.x0 + f.w0 + 40, f.z0 - 800, 0, 1, 1600, 1, acc);
      }
    }
    expect(rivers).toBeGreaterThanOrEqual(12);
    expect(acc.wet).toBeGreaterThan(8000);
    expect(acc.shores).toBeGreaterThan(rivers * 12);
    expect(acc.worstWet).toBe(0);
    expect(acc.otherWater).toBe(0);
    expect(acc.worstShore).toBeLessThan(1.5);
    // (the river's measure is the channel's own, taken at the point's z: far off, across a bend, it may
    // change a little faster than the ground is walked, never by a step; on these lines it does not)
    expect(acc.worstStep).toBeLessThan(1.5);
  });

  it('is the distance to the nearest wet ground within a metre or two near the bank, and within an eighth of it far off', () => {
    let rivers = 0;
    for (const [seed, biome] of [[11, 'plains'], [21, 'karst_peaks']] as const) {
      const w = worldOf(seed, biome);
      const reader = shoreOf(w);
      const f = waters(w, 'river', 30000)[1];
      rivers++;
      const x0 = Math.floor(f.xMin) + 150;
      const x1 = Math.ceil(f.xMax) - 150;
      const z0 = Math.floor(f.z0) + 120;
      const z1 = z0 + 760;
      const r = against(w, reader, wetEdge(w, x0, z0, x1, z1, 2), x0, z0, x1, z1, WATER_FAR + 10, 900, 0.13, 5 + f.slot);
      expect(r.n).toBeGreaterThan(400);
      expect(r.near).toBeGreaterThan(30);
      expect(r.worst, `river of stretch ${f.slot}`).toBeLessThan(3.3);
      expect(r.mean).toBeLessThan(1.6);
    }
    expect(rivers).toBe(2);
  });

  it('is no river\'s beyond its ends, and fades out before them without a step', () => {
    const w = worldOf(7, 'wetland');
    const f = waters(w, 'river', 30000)[0];
    const rc = { x: 0, dx: 0 };
    let prev = 0;
    for (let zr = f.zEnd - 900; zr < f.zEnd + 50; zr += 0.5) {
      WaterPlan.riverCentre(f, zr, rc);
      const d = WaterPlan.riverShore(f, rc.x + 60, f.z0 + zr);
      if (zr > f.zEnd - 900) {
        if (d < WATER_FAR) expect(Math.abs(d - prev)).toBeLessThan(4);
        else expect(prev).toBeGreaterThan(WATER_FAR - 4);
      }
      if (zr >= f.zEnd - 250) expect(d).toBe(Infinity);
      if (zr <= f.zEnd - 700) expect(d).toBeLessThan(62);
      prev = d;
    }
    expect(WaterPlan.riverShore(f, f.x0, f.z0)).toBe(0);
    expect(WaterPlan.riverShore(f, f.x0 + f.w0 + 30, f.z0)).toBeGreaterThan(20);
  });
});

describe('the sea\'s edge', () => {
  /** the first worlds that begin in lake country with a sea along their first chapter */
  function seas(count: number): World[] {
    const found: World[] = [];
    for (let seed = 1; seed < 60 && found.length < count; seed++) {
      const w = worldOf(seed, 'lakes', 2);
      if (w.sea.seaOf(0)) found.push(w);
    }
    return found;
  }

  it('is 0 wherever the land is under the sea, small on the last dry metre, and changes by no more than the step: along a coast run and where the shore swings in to it', () => {
    const acc = new Walk();
    const p = new SpineSample();
    let lines = 0;
    for (const w of seas(3)) {
      const c = w.sea.seaOf(0)!;
      const reader = shoreOf(w);
      for (const r of c.runs) {
        for (let s = r.s0 + 60; s < r.s1 - 60; s += 130) {
          const D = SeaPlan.shoreAt(c, s);
          if (D > 900) continue;
          w.spine.at(s, p);
          // square to the road, from the far verge across the road and the beach into the sea
          const ux = -Math.sin(p.phi) * c.side;
          const uz = Math.cos(p.phi) * c.side;
          walk(w, reader, p.x - ux * 120, p.z - uz * 120, ux, uz, Math.round(D + 200), 1, acc);
          lines++;
        }
      }
    }
    expect(lines).toBeGreaterThan(40);
    expect(acc.wet).toBeGreaterThan(lines * 40);
    // (a line that leaves the road where the shore is swinging away may not come to the water)
    expect(acc.shores).toBeGreaterThan(lines * 0.8);
    expect(acc.worstWet).toBe(0);
    expect(acc.otherWater).toBe(0);
    expect(acc.worstShore).toBeLessThan(1.5);
    expect(acc.worstStep).toBeLessThanOrEqual(1 + 1e-9);
    expect(acc.most).toBe(WATER_FAR);
  });

  it('is the distance to the nearest wet ground, also where the shore runs square to the road', () => {
    const w = seas(1)[0];
    const c = w.sea.seaOf(0)!;
    const reader = shoreOf(w);
    const p = new SpineSample();
    const r = c.runs[0];
    // 800 m of road in the first of a run, where the shore comes in from the far coast
    w.spine.at(r.s0 + 20, p);
    const x0 = Math.floor(p.x);
    let zLo = p.z;
    let zHi = p.z;
    for (let s = r.s0 + 20; s <= r.s0 + 820; s += 40) {
      w.spine.at(s, p);
      zLo = Math.min(zLo, p.z);
      zHi = Math.max(zHi, p.z);
    }
    const x1 = Math.ceil(p.x);
    const z0 = Math.floor(c.side > 0 ? zLo - 200 : zLo - 900);
    const z1 = Math.ceil(c.side > 0 ? zHi + 900 : zHi + 200);
    const res = against(w, reader, wetEdge(w, x0, z0, x1, z1, 2), x0, z0, x1, z1, WATER_FAR + 10, 900, 0, 3);
    expect(res.n).toBeGreaterThan(300);
    expect(res.near).toBeGreaterThan(20);
    expect(res.worst).toBeLessThan(3.3);
    expect(res.mean).toBeLessThan(1.6);
  });

  it('says nothing by the road where the coast is kilometres off, and nothing where there is no sea', () => {
    const w = seas(1)[0];
    const c = w.sea.seaOf(0)!;
    const p = new SpineSample();
    // between the sea's start and its first run the shore is the far coast
    const s = (c.s0 + c.runs[0].s0) / 2;
    expect(SeaPlan.shoreAt(c, s)).toBeGreaterThan(1400);
    w.spine.at(s, p);
    for (const lat of [-600, -100, 0, 100, 600]) expect(w.sea.shore(p.x, p.z + lat, s, WATER_FAR)).toBe(WATER_FAR);
    expect(worldOf(5, 'forest').sea.shore(4000, 100, 4000, WATER_FAR)).toBe(WATER_FAR);
  });
});

describe('the ecotope field with the water\'s own account', () => {
  const params = (r: number) => floraTableOf(BIOMES[r].id, BIOMES[r].kin).eco;

  it('two tiles that share an edge say the same of it — how far the water is, the canopy, the moisture — also where the water lies in one of them only; without the water\'s own account they do not', () => {
    const w = worldOf(3, 'lakes');
    // the same field without the reader, as it was: a tile measures to the water it can see inside itself
    const blind = new EcotopeField(w, new TerrainPoint(), params, null, 4000);
    const eco = w.eco!;
    const KEYS = ['waterDist', 'canopy', 'moisture', 'h', 'slope', 'shade', 'hollow'] as const;
    const worst = { waterDist: 0, canopy: 0, moisture: 0, h: 0, slope: 0, shade: 0, hollow: 0 };
    const worstBlind = { waterDist: 0, canopy: 0, moisture: 0, h: 0, slope: 0, shade: 0, hollow: 0 };
    let kinds = 0;
    let edges = 0;
    let blindEdges = 0;
    const compare = (a: EcoTile, b: EcoTile, na: number, nb: number, into: typeof worst): number => {
      let off = 0;
      for (const k of KEYS) {
        const d = Math.abs(a[k][na] - b[k][nb]);
        if (d > into[k]) into[k] = d;
        if (k === 'waterDist') off = d;
      }
      return off;
    };
    for (let tx = 16; tx < 76; tx++) {
      for (let tz = -5; tz < 5; tz++) {
        // the neighbour along x shares this tile's last column, the one along z its last row
        for (const [nx, nz] of [[tx + 1, tz], [tx, tz + 1]]) {
          let seen = 0;
          for (let k = 0; k < ECO_N; k++) {
            const na = nx > tx ? k * ECO_N + ECO_N - 1 : (ECO_N - 1) * ECO_N + k;
            const nb = nx > tx ? k * ECO_N : k;
            compare(eco.tile(tx, tz), eco.tile(nx, nz), na, nb, worst);
            if (eco.tile(tx, tz).waterKind[na] !== eco.tile(nx, nz).waterKind[nb]) kinds++;
            seen = Math.max(seen, compare(blind.tile(tx, tz), blind.tile(nx, nz), na, nb, worstBlind));
          }
          edges++;
          if (seen > 20) blindEdges++;
        }
      }
    }
    expect(edges).toBe(1200);
    // without the reader: water just outside a tile is not seen from inside it, so the two sides of many an
    // edge disagree by tens of metres, and the canopy and the moisture, which follow the water, with them
    expect(blindEdges).toBeGreaterThan(20);
    expect(worstBlind.waterDist).toBeGreaterThan(100);
    expect(worstBlind.canopy).toBeGreaterThan(0.2);
    expect(worstBlind.moisture).toBeGreaterThan(0.15);
    // with it: the same number on both sides, to the bit
    expect(worst).toEqual({ waterDist: 0, canopy: 0, moisture: 0, h: 0, slope: 0, shade: 0, hollow: 0 });
    expect(kinds).toBe(0);
  });

  it('is 0 at every wet node, names the water, reads the same between tiles, and costs a tile little', () => {
    const w = worldOf(7, 'wetland');
    const eco = w.eco!;
    let wetNodes = 0;
    let near = 0;
    const byKind = [0, 0, 0, 0];
    for (let tx = 10; tx < 60; tx++) {
      for (let tz = -4; tz < 4; tz++) {
        const t = eco.tile(tx, tz);
        for (let n = 0; n < ECO_N * ECO_N; n++) {
          if (t.flags[n] & ECO_WET) {
            wetNodes++;
            expect(t.waterDist[n]).toBe(0);
            expect(t.waterKind[n]).toBeGreaterThan(0);
          } else if (t.waterDist[n] < WATER_FAR) {
            near++;
            byKind[t.waterKind[n]]++;
          } else expect(t.waterKind[n]).toBe(0);
        }
      }
    }
    expect(wetNodes).toBeGreaterThan(2000);
    expect(near).toBeGreaterThan(wetNodes);
    expect(byKind[0]).toBe(0);
    expect(byKind[1]).toBeGreaterThan(1000);
    expect(byKind[2]).toBeGreaterThan(300);
    // across tile borders, a metre at a step: the distance to the water has no step (it is read between
    // nodes 8 m apart, of which a wet one says 0 however deep in the water it lies)
    const e = new Ecotope();
    let jump = 0;
    let prev = -1;
    for (let x = 10 * ECO_TILE; x < 40 * ECO_TILE; x += 1) {
      eco.at(x, 77, e);
      if (prev >= 0) jump = Math.max(jump, Math.abs(e.waterDist - prev));
      prev = e.waterDist;
    }
    expect(jump).toBeLessThan(2);
  });
});
