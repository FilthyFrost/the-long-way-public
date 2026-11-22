// G (docs/V3/nodes/G-ghibli.md): the places of the emergent Earth composed — a wood is stands of one kind, its trees
// massed and the open ground open; the ground's stones lie in outcrops; a meadow's flowers stand in drifts; every crown
// is painted in one ladder; a sky is one theme of its climate's; a place has a light of its own.
import { describe, expect, it } from 'vitest';
import { wetnessAt } from '../../src/core/earth/climate';
import { Ecotope } from '../../src/core/world/ecotope';
import { Cover, LAYER_BRUSH, LAYER_TREE } from '../../src/core/world/flora';
import { groundField } from '../../src/core/world/groundField';
import { Clump, clumpAt, driftFactor, spacedAt, standAt } from '../../src/core/world/layout';
import { PLANTS } from '../../src/core/world/plants';
import { crownLadder, paletteOfPlace } from '../../src/core/world/earth/palette';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

const st = new SpineSample();

/** the pieces of a journey that are places, to the k-th */
function places(w: World, to: number): { k: number; start: number; end: number; struct: string; scene: NonNullable<World['earth']>['pieces'][number] }[] {
  const j = w.earth!;
  const out = [];
  for (let k = 1; k < to; k++) {
    while (j.pieces.length <= k + 1) j.chapter(j.chapters.length);
    const p = j.pieces[k];
    if (p.kind === 'scene' && p.scene) out.push({ k, start: p.start, end: p.end, struct: p.scene.place.look.efg.struct, scene: p });
  }
  return out;
}

describe('how a place is set out (layout)', () => {
  it('a clump is the same whoever asks, one in so many squares holds one, and a point deep in it knows whose it is', () => {
    const a = new Clump();
    const b = new Clump();
    let inside = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const x = ((i * 7919) % 5000) - 2500 + 0.37;
      const z = ((i * 104729) % 5000) - 2500 + 0.11;
      const k = clumpAt(x, z, 60, 0.4, 8, 16, 99, a);
      expect(clumpAt(x, z, 60, 0.4, 8, 16, 99, b)).toBe(k);
      expect(b.id).toBe(a.id);
      if (k > 0) {
        inside++;
        // (within its radius of its own middle, its outline a third in and out)
        expect(Math.hypot(x - a.x, z - a.z)).toBeLessThan(a.r);
      }
    }
    // (0.4 of the squares, each clump some 450 m² of a square's 3600: about a twentieth of the country)
    expect(inside / N).toBeGreaterThan(0.02);
    expect(inside / N).toBeLessThan(0.12);
  });

  it('a stand is one number over tens of metres and another in the next stand', () => {
    let same = 0;
    let far = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const x = i * 173.3;
      const z = i * 91.7;
      const s = standAt(x, z, 190, 5);
      if (standAt(x + 9, z + 6, 190, 5) === s) same++;
      if (standAt(x + 900, z + 700, 190, 5) !== s) far++;
    }
    expect(same / N).toBeGreaterThan(0.85);
    expect(far / N).toBeGreaterThan(0.9);
  });

  it('plants that keep their distance: one cell to a square, never two side by side in one', () => {
    for (const n of [3, 5]) {
      for (let q = 0; q < 40; q++) {
        let got = 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (spacedAt(q * n + i, 7 * n + j, 8, 8 * n, 3)) got++;
        expect(got).toBe(1);
      }
    }
  });
});

describe('a place composed (world version 5)', () => {
  it('a wood is stands of one kind: a tree\'s neighbours are mostly its own kind, and the trees are massed', () => {
    let checked = 0;
    for (const seed of [1, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      for (const p of places(w, 40)) {
        if (p.struct !== 'closed_forest' && p.struct !== 'open_forest' && p.struct !== 'woodland') continue;
        if (p.scene.scene!.place.look.sig.snow) continue;
        w.spine.at((p.start + p.end) / 2, st);
        const tx0 = Math.floor(st.x / 128);
        const tz0 = Math.floor(st.z / 128);
        const xs: number[] = [];
        const zs: number[] = [];
        const kinds: number[] = [];
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const t = w.flora!.tile(LAYER_TREE, tx0 + dx, tz0 + dz);
            for (let i = 0; i < t.n; i++) {
              // (the grown trees of the stands: not the young ones under them, which are counted with their own)
              if (t.size[i] < 0.66) continue;
              xs.push(t.x[i]);
              zs.push(t.z[i]);
              kinds.push(t.plant[i]);
            }
          }
        }
        if (xs.length < 60) continue;
        let same = 0;
        let pairs = 0;
        let open = 0;
        const e = new Ecotope();
        for (let i = 0; i < xs.length; i++) {
          for (let j = 0; j < xs.length; j++) {
            if (i === j) continue;
            const d = Math.hypot(xs[i] - xs[j], zs[i] - zs[j]);
            if (d < 15) {
              pairs++;
              if (kinds[i] === kinds[j]) same++;
            }
          }
          if (w.eco!.at(xs[i], zs[i], e).canopy < 0.08) open++;
        }
        // (thrown cell by cell with five kinds to a wood, one neighbour in three was a tree's own kind; a stand is
        // seven in eight its own kind, one stand in four a mixed one, and a tree at a stand's edge has the next stand's beside it)
        expect(same / pairs, `${seed}:${p.k} ${p.struct}`).toBeGreaterThan(0.5);
        // (and the trees are the woods': out in the open only a copse's, a bank's, the road's own)
        expect(open / xs.length, `${seed}:${p.k} ${p.struct}`).toBeLessThan(0.3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('its brush stands on the 4 m grid, each shrub in its own cell, and is some country\'s', () => {
    let seen = 0;
    for (const seed of [1, 3, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      for (const p of places(w, 30)) {
        w.spine.at((p.start + p.end) / 2, st);
        const tx = Math.floor(st.x / 128);
        const tz = Math.floor(st.z / 128);
        for (let d = -1; d <= 1; d++) {
          const t = w.flora!.tile(LAYER_BRUSH, tx + d, tz);
          for (let i = 0; i < t.n; i++) {
            expect(PLANTS[t.plant[i]].layer).toBe('shrub');
            expect(Math.floor(t.x[i] / 4) >> 5).toBe(t.tx);
            seen++;
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('its stones lie together where its rock comes through, and most of its ground has none', () => {
    let fields = 0;
    for (const seed of [1, 3, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      const gf = groundField(w);
      const e = new Ecotope();
      for (const p of places(w, 30)) {
        if (p.struct === 'desert' || p.struct === 'bare' || p.struct === 'tundra' || p.struct === 'ice') continue;
        w.spine.at((p.start + p.end) / 2, st);
        const tx0 = Math.floor(st.x / 128);
        const tz0 = Math.floor(st.z / 128);
        const xs: number[] = [];
        const zs: number[] = [];
        let tiles = 0;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            tiles++;
            for (const r of gf.tile(tx0 + dx, tz0 + dz, true)) {
              // (the stones of open, gentle ground: a bank's cobbles and a steep slope's scree lie as they lie)
              w.eco!.at(r.x, r.z, e);
              if (e.slope > 0.4 || e.waterDist < 12) continue;
              xs.push(r.x);
              zs.push(r.z);
            }
          }
        }
        // (a stone to every third cell of 8 m was nearly a thousand to these tiles; an outcrop is a dozen)
        expect(xs.length, `${seed}:${p.k}`).toBeLessThan(tiles * 40);
        if (xs.length < 12) continue;
        let grouped = 0;
        for (let i = 0; i < xs.length; i++) {
          for (let j = 0; j < xs.length; j++) {
            if (i !== j && Math.hypot(xs[i] - xs[j], zs[i] - zs[j]) < 13) {
              grouped++;
              break;
            }
          }
        }
        expect(grouped / xs.length, `${seed}:${p.k}`).toBeGreaterThan(0.62);
        fields++;
      }
    }
    expect(fields).toBeGreaterThan(2);
  });

  it('a meadow\'s flowers stand in drifts: a carpet inside one, hardly one between', () => {
    const c = new Clump();
    const out = new Cover();
    let inDrift = 0;
    let between = 0;
    let places5 = 0;
    for (const seed of [1, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      for (const p of places(w, 30)) {
        if (p.struct !== 'grassland' && p.struct !== 'woodland' && p.struct !== 'savanna') continue;
        places5++;
        let sumIn = 0;
        let nIn = 0;
        let sumOut = 0;
        let nOut = 0;
        for (let n = 0; n < 1500; n++) {
          const s = p.start + 300 + ((n * 7919) % Math.max(1, Math.floor(p.end - p.start - 600)));
          w.spine.at(s, st);
          const off = ((n * 104729) % 300) - 150;
          const x = st.x - Math.sin(st.phi) * off;
          const z = st.z + Math.cos(st.phi) * off;
          const f = driftFactor(x, z, w.seed, c);
          w.flora!.cover(x, z, out);
          if (f > 1) {
            sumIn += out.flowers;
            nIn++;
          } else {
            sumOut += out.flowers;
            nOut++;
          }
        }
        if (nIn > 20 && sumIn > 0) {
          inDrift += sumIn / nIn;
          between += sumOut / Math.max(1, nOut);
        }
      }
    }
    expect(places5).toBeGreaterThan(0);
    if (inDrift > 0) expect(inDrift).toBeGreaterThan(between * 8);
  });
});

describe('a place painted and lit (G2, G1, G7)', () => {
  it('every crown is painted in one ladder: Painted Valley\'s four tones from its key, a shade never bluer than a teal', () => {
    const pv = crownLadder([0.1, 0.36, 0.12]);
    const want = [[0.014, 0.1, 0.1], [0.035, 0.2, 0.12], [0.1, 0.36, 0.12], [0.3, 0.56, 0.15]];
    for (let t = 0; t < 4; t++) for (let i = 0; i < 3; i++) expect(Math.abs(pv[t][i] - want[t][i])).toBeLessThan(0.006);
    // a spruce's key, half blue: its shade a deep teal
    const teal = crownLadder([0.05, 0.2, 0.17]);
    expect(teal[0][2]).toBeLessThanOrEqual(teal[0][1] * 1.02 + 1e-9);
    expect(teal[1][2]).toBeLessThan(teal[1][1]);
    // an autumn wood's gold: its shade a red brown, with less blue than red
    const gold = crownLadder([0.6, 0.4, 0.08]);
    expect(gold[0][2]).toBeLessThan(gold[0][0]);
    for (const l of [pv, teal, gold]) for (let t = 1; t < 4; t++) expect(l[t][1]).toBeGreaterThan(l[t - 1][1]);
  });

  it('a sky is one theme: no two sheets of cloud one over the other, and the kinds differ from place to place', () => {
    const themes = new Set<string>();
    for (const seed of [1, 3, 7]) {
      const w = new World(seed, { worldVersion: 5 });
      for (const p of places(w, 40)) {
        const sky = paletteOfPlace(p.scene.scene!.place, seed, p.k).air.sky!;
        const sheets = [sky.cirrocumulus, sky.altocumulus, sky.veil, sky.waves].filter((v) => v > 0.25).length;
        expect(sheets, `${seed}:${p.k}`).toBeLessThanOrEqual(1);
        themes.add(sky.towers > 0 ? 'towers' : sky.altocumulus > 0.25 ? 'flock' : sky.cirrocumulus > 0.25 ? 'ripples' : sky.veil > 0.25 ? 'veil' : sky.waves > 0.25 ? 'billows' : sky.cirrus > 0.55 ? 'tails' : sky.cumulus < 0.4 ? 'clear' : 'heaps');
      }
    }
    expect(themes.size).toBeGreaterThanOrEqual(5);
  });

  it('a place has its own light: a dry country\'s sun hard and its fill little, snow\'s shade blue, the wet warm country\'s fill strong', () => {
    let dry = 0;
    let snowy = 0;
    let humid = 0;
    for (const seed of [1, 3, 7, 19]) {
      const w = new World(seed, { worldVersion: 5 });
      for (const p of places(w, 40)) {
        const sc = p.scene.scene!.place;
        const L = paletteOfPlace(sc, seed, p.k).air.light!;
        expect(L.sun).toBeGreaterThan(0.8);
        expect(L.fill).toBeGreaterThan(0.6);
        expect(L.shafts).toBeGreaterThanOrEqual(0.15);
        const wet = wetnessAt(sc.macro, sc.macro.base);
        if (sc.look.sig.snow) {
          expect(L.shade[2]).toBeGreaterThan(L.shade[0]);
          snowy++;
        } else if (wet < 0.12) {
          expect(L.fill).toBeLessThan(0.95);
          expect(L.sun).toBeGreaterThan(1.02);
          expect(L.contrast).toBeGreaterThan(1.02);
          dry++;
        } else if (wet > 0.9 && sc.macro.tSea > 22 && sc.macro.base < 1500) {
          expect(L.fill).toBeGreaterThan(1.05);
          humid++;
        }
      }
    }
    expect(dry + snowy + humid).toBeGreaterThan(4);
  });
});
