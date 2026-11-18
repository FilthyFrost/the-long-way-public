/**
 * The trunks of the trees as solids (src/core/world/floraSolids.ts): the trees near a point are the trees the
 * flora field stands there, each a round post as thick as its kind's trunk at its size; the same trunk is
 * the same object from one question to the next; the road's corridor has none.
 */
import { describe, expect, it } from 'vitest';
import { ECO_TILE } from '../../src/core/world/ecotope';
import { LAYER_TREE } from '../../src/core/world/flora';
import { FloraSolids, TREE_TAG, floraSolidsNear } from '../../src/core/world/floraSolids';
import { PLANTS } from '../../src/core/world/plants';
import { Push, Solid, pushOut } from '../../src/core/world/solids';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

function worldOf(seed: number, startBiome: string): World {
  return new World(seed, { worldVersion: 2, startBiome, chapterScale: 6 });
}

describe('the trunks of the trees', () => {
  it('near a point are the trees of the flora field there, no more and no fewer, each a round post of its kind\'s thickness', () => {
    const w = worldOf(8, 'forest');
    const flora = w.flora!;
    const trunks = new FloraSolids(flora);
    const out: Solid[] = [];
    let found = 0;
    let rs = 12345;
    const rnd = (): number => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let q = 0; q < 400; q++) {
      // (points anywhere, tile borders and corners among them, and rounds from a walker's reach to a lorry's)
      const x = q % 5 === 0 ? Math.round(30 + rnd() * 20) * ECO_TILE + (rnd() - 0.5) * 3 : (30 + rnd() * 20) * ECO_TILE;
      const z = q % 7 === 0 ? Math.round(-3 + rnd() * 6) * ECO_TILE + (rnd() - 0.5) * 3 : (-3 + rnd() * 6) * ECO_TILE;
      const r = q % 3 === 0 ? 0.4 : q % 3 === 1 ? 4 : 14;
      out.length = 0;
      trunks.solidsNear(x, z, r, out);
      // the same by going through every tree of the tiles round the point
      const want: string[] = [];
      const tx0 = Math.floor(x / ECO_TILE);
      const tz0 = Math.floor(z / ECO_TILE);
      for (let tz = tz0 - 1; tz <= tz0 + 1; tz++) {
        for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
          const t = flora.tile(LAYER_TREE, tx, tz);
          for (let i = 0; i < t.n; i++) {
            const rad = PLANTS[t.plant[i]].trunk * t.size[i];
            if (Math.hypot(t.x[i] - x, t.z[i] - z) < r + rad) want.push(`${t.x[i]},${t.z[i]}`);
          }
        }
      }
      expect(out.map((s) => `${s.x},${s.z}`).sort()).toEqual(want.sort());
      found += out.length;
      for (const s of out) {
        const p = PLANTS[s.ref];
        expect(p.layer).toBe('tree');
        expect(s.tag).toBe(TREE_TAG);
        expect(s.round).toBe(true);
        expect(s.hx).toBeGreaterThan(p.trunk * 0.7);
        expect(s.hx).toBeLessThan(p.trunk * 1.35);
        // from below the ground at its foot to its top
        const y = w.heightAt(s.x, s.z);
        expect(s.y0).toBeLessThan(y - 0.3);
        expect(s.y1).toBeGreaterThan(y + p.height * 0.7);
        expect(s.y1).toBeLessThan(y + p.height * 1.35);
        expect(s.floor).toBe(false);
      }
    }
    expect(found).toBeGreaterThan(400);
  });

  it('are the same objects from one question to the next, and keep a walker\'s feet out', () => {
    const w = worldOf(8, 'forest');
    const flora = w.flora!;
    const a: Solid[] = [];
    const b: Solid[] = [];
    floraSolidsNear(flora, 40 * ECO_TILE + 60, 200, 30, a);
    const tiles = flora.size;
    floraSolidsNear(flora, 40 * ECO_TILE + 60, 200, 30, b);
    expect(a.length).toBeGreaterThan(10);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBe(a[i]);
    // (nothing new was made for the second question: the tiles were there, and so were their trunks)
    expect(flora.size).toBe(tiles);
    // through another source over the same field: the same trees, as posts of its own
    const other: Solid[] = [];
    new FloraSolids(flora).solidsNear(40 * ECO_TILE + 60, 200, 30, other);
    expect(other.map((s) => [s.x, s.z, s.hx, s.y0, s.y1, s.ref])).toEqual(a.map((s) => [s.x, s.z, s.hx, s.y0, s.y1, s.ref]));
    // feet (a round of 0.3 m) set down in a trunk are put out of it, by the shortest way
    const push = new Push();
    const s = a[0];
    expect(pushOut(s, s.x + 0.05, s.z, 0.3, push)).toBe(true);
    expect(Math.hypot(push.x - s.x, push.z - s.z)).toBeCloseTo(s.hx + 0.3, 9);
    expect(pushOut(s, s.x + s.hx + 0.31, s.z, 0.3, push)).toBe(false);
  });

  it('none stands in the road\'s corridor: the road, its shoulders and its ditches are free of trunks in wooded country', () => {
    const p = new SpineSample();
    const out: Solid[] = [];
    for (const [seed, biome] of [[8, 'forest'], [5, 'bamboo_sea'], [4, 'maple']] as const) {
      const w = worldOf(seed, biome);
      const trunks = new FloraSolids(w.flora!);
      let nearest = Infinity;
      let seen = 0;
      for (let s = 500; s < 16000; s += 5) {
        w.spine.at(s, p);
        out.length = 0;
        trunks.solidsNear(p.x, p.z, 14, out);
        seen += out.length;
        for (const t of out) nearest = Math.min(nearest, Math.hypot(t.x - p.x, t.z - p.z) - t.hx);
      }
      // (woods stand along the road, a few metres back: no trunk's bark within 6.5 m of the centre line)
      expect(seen, biome).toBeGreaterThan(300);
      expect(nearest, biome).toBeGreaterThan(6.5);
      expect(nearest, biome).toBeLessThan(14);
    }
  });
});
