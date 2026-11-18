/**
 * The ecotope field and the flora field of a world of version 2 are functions of the world and the place
 * alone (src/core/world/ecotope.ts, flora.ts through World.eco and World.flora): the same whatever was asked
 * first and from which side, the same after the caches have let a tile go, the same across the border of two
 * regions whichever region's side was asked first, and the same in two worlds of one seed.
 */
import { describe, expect, it } from 'vitest';
import { ECO_TILE, type EcoTile } from '../../src/core/world/ecotope';
import { FloraCell, LAYER_CELL, LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, type FloraLayer, type FloraTile } from '../../src/core/world/flora';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World, type WorldOptions } from '../../src/core/world/terrain';

const LAYERS: FloraLayer[] = [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND];
const ECO_LISTS = ['h', 'ad', 'slope', 'shade', 'hollow', 'waterDist', 'canopy', 'moisture', 'relief', 'landform', 'terrace', 'step', 'flags', 'waterKind', 'ra', 'rb', 'rt', 'open'] as const;
const FLORA_LISTS = ['plant', 'x', 'z', 'y', 'size', 'yaw', 'vary', 'rule', 'region', 'row'] as const;

/** a number that is the same for the same bytes (FNV-1a over every list of a tile) */
function digest(lists: readonly ArrayBufferView[]): number {
  let h = 0x811c9dc5;
  for (const a of lists) {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619) >>> 0;
    h = Math.imul(h ^ b.length, 16777619) >>> 0;
  }
  return h;
}
const ecoDigest = (t: EcoTile): number => digest(ECO_LISTS.map((k) => t[k]));
const floraDigest = (t: FloraTile): number => digest(FLORA_LISTS.map((k) => t[k]));

/** the tiles of a box, as [tx, tz] */
function box(tx0: number, tx1: number, tz0: number, tz1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let tz = tz0; tz < tz1; tz++) for (let tx = tx0; tx < tx1; tx++) out.push([tx, tz]);
  return out;
}

/** what a world says of some tiles, each as "tx,tz: the ecotope's digest and the three layers'" (asked in the order given) */
function said(w: World, tiles: readonly [number, number][], layers: readonly FloraLayer[] = LAYERS): Map<string, string> {
  const out = new Map<string, string>();
  for (const [tx, tz] of tiles) {
    const parts: number[] = [0, 0, 0, 0];
    for (const layer of layers) parts[layer + 1] = floraDigest(w.flora!.tile(layer, tx, tz));
    parts[0] = ecoDigest(w.eco!.tile(tx, tz));
    out.set(`${tx},${tz}`, parts.join(' '));
  }
  return out;
}

function sorted(m: Map<string, string>): [string, string][] {
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** the tiles beside the road for `count` tiles of x from where the road has run s metres */
function besideRoad(w: World, s: number, count: number, half: number): [number, number][] {
  const sp = new SpineSample();
  w.spine.at(s, sp);
  const tx0 = Math.floor(sp.x / ECO_TILE);
  const out: [number, number][] = [];
  for (let tx = tx0; tx < tx0 + count; tx++) {
    w.spine.at(w.spine.sAtX((tx + 0.5) * ECO_TILE), sp);
    const tzc = Math.floor(sp.z / ECO_TILE);
    for (let tz = tzc - half; tz <= tzc + half; tz++) out.push([tx, tz]);
  }
  return out;
}

/** the countries looked at: woods, water (lakes, rivers, a sea), towers, benches */
const COUNTRIES: [string, WorldOptions, number][] = [
  ['forest', { worldVersion: 2, startBiome: 'forest', chapterScale: 6 }, 8],
  ['lakes', { worldVersion: 2, startBiome: 'lakes', chapterScale: 2 }, 3],
  ['karst_peaks', { worldVersion: 2, startBiome: 'karst_peaks', chapterScale: 6 }, 21],
  ['terraces', { worldVersion: 2, startBiome: 'terraces', chapterScale: 6 }, 6],
];

describe('the fields of a world of version 2 do not depend on the asking', () => {
  it('the same tiles whatever was asked first: far country before near, the last tile first, the ground before the trees, single cells in between', () => {
    for (const [name, opts, seed] of COUNTRIES) {
      const a = new World(seed, opts);
      const tiles = besideRoad(a, 4200, 9, 2);
      const plain = said(a, tiles);
      // the other world: the land, the ecotope and the plants of places far along the road first (the
      // places by the road and the water are laid out stretch by stretch as the land is first asked about)
      const b = new World(seed, opts);
      const tp = new TerrainPoint();
      const sp = new SpineSample();
      b.spine.at(31000, sp);
      b.shape(sp.x + 40, sp.z - 90, tp);
      for (const [tx, tz] of besideRoad(b, 26000, 3, 1)) {
        b.flora!.tile(LAYER_GROUND, tx, tz);
        b.eco!.tile(tx, tz - 3);
      }
      // then single cells scattered over the tiles themselves, then the tiles from the last to the first, the ground layer first
      const c = new FloraCell();
      for (let q = 0; q < 300; q++) {
        const [tx, tz] = tiles[(q * 7919) % tiles.length];
        const layer = LAYERS[q % 3];
        const per = ECO_TILE / LAYER_CELL[layer];
        b.flora!.cell(layer, tx * per + ((q * 31) % per), tz * per + ((q * 17) % per), c);
      }
      const other = said(b, [...tiles].reverse(), [LAYER_GROUND, LAYER_SHRUB, LAYER_TREE]);
      expect(sorted(other), name).toEqual(sorted(plain));
      // (and the tiles hold something to differ in)
      let plants = 0;
      for (const [tx, tz] of tiles) for (const layer of LAYERS) plants += a.flora!.tile(layer, tx, tz).n;
      expect(plants, name).toBeGreaterThan(1500);
    }
  });

  it('the same tiles after the caches have let them go, and the caches keep no more than they may', () => {
    for (const [name, opts, seed] of COUNTRIES.slice(0, 2)) {
      const a = new World(seed, opts);
      const tiles = besideRoad(a, 4200, 6, 1);
      const plain = said(a, tiles);
      const b = new World(seed, opts);
      b.eco!.capacity = 4;
      b.flora!.capacity = 5;
      // twice over, so that every tile is made, dropped and made again
      const first = said(b, tiles);
      expect(b.eco!.size).toBeLessThanOrEqual(4);
      expect(b.flora!.size).toBeLessThanOrEqual(5);
      const again = said(b, tiles);
      expect(sorted(first), name).toEqual(sorted(plain));
      expect(sorted(again), name).toEqual(sorted(plain));
      expect(b.eco!.size).toBeLessThanOrEqual(4);
      expect(b.flora!.size).toBeLessThanOrEqual(5);
      // (a tile's plants do not hang on its ecotope tile being there still: asked alone, after the ecotope has moved on)
      const [tx, tz] = tiles[0];
      for (const [ox, oz] of besideRoad(b, 9000, 6, 0)) b.eco!.tile(ox, oz);
      for (const [ox, oz] of besideRoad(b, 9000, 6, 0)) b.flora!.tile(LAYER_SHRUB, ox, oz);
      expect(said(b, [[tx, tz]]).get(`${tx},${tz}`), name).toBe(plain.get(`${tx},${tz}`));
    }
  });

  it('the same plants across the border of two regions whichever side was asked first, and each cell there is one region\'s or the other\'s by its own dice', () => {
    let borders = 0;
    for (const seed of [5, 12]) {
      const opts: WorldOptions = { worldVersion: 2 };
      const a = new World(seed, opts);
      const plan = a.spine.plan;
      const from = plan.biomeOf(0);
      const to = plan.biomeOf(1);
      expect(to).not.toBe(from);
      // the tiles from 700 m before the border to 700 m beyond it: the stretch over which the two regions blend, and a little of each alone
      const tiles = besideRoad(a, plan.starts[1] - 700, 12, 2);
      const westFirst = said(a, tiles);
      const b = new World(seed, opts);
      // the far side first: the next region's own country, then back across the border
      for (const [tx, tz] of besideRoad(b, plan.starts[1] + 2600, 3, 1)) b.flora!.tile(LAYER_TREE, tx, tz);
      const eastFirst = said(b, [...tiles].reverse());
      expect(sorted(eastFirst), `seed ${seed}`).toEqual(sorted(westFirst));
      // cell by cell, in an order of their own, in a third world: the same plants as the tiles hold
      const c = new World(seed, opts);
      const cell = new FloraCell();
      let mixedTiles = 0;
      const regions = new Set<number>();
      for (const [tx, tz] of tiles) {
        for (const layer of LAYERS) {
          const t = a.flora!.tile(layer, tx, tz);
          const per = ECO_TILE / LAYER_CELL[layer];
          const found = new Map<number, number>();
          for (let q = 0; q < per * per; q++) {
            // (every cell of the tile once, in steps that share no factor with their number)
            const n = (q * 613 + 7) % (per * per);
            if (c.flora!.cell(layer, tx * per + (n % per), tz * per + Math.floor(n / per), cell)) found.set(n, cell.plant * 1e6 + Math.round(cell.vary * 4096) + cell.region * 1e4);
          }
          expect(found.size, `seed ${seed}: tile ${tx}, ${tz}, layer ${layer}`).toBe(t.n);
          const here = new Set<number>();
          for (let k = 0; k < t.n; k++) {
            const n = (Math.floor(t.z[k] / LAYER_CELL[layer]) - tz * per) * per + Math.floor(t.x[k] / LAYER_CELL[layer]) - tx * per;
            expect(found.get(n)).toBe(t.plant[k] * 1e6 + Math.round(t.vary[k] * 4096) + t.region[k] * 1e4);
            here.add(t.region[k]);
            regions.add(t.region[k]);
          }
          if (layer === LAYER_TREE && here.size === 2) mixedTiles++;
        }
      }
      // the plants of the border's tiles are the one region's and the other's and no third's; and there are tiles where the two stand mixed
      expect([...regions].sort((p, q) => p - q), `seed ${seed}`).toEqual([from, to].sort((p, q) => p - q));
      if (mixedTiles > 0) borders++;
    }
    expect(borders).toBeGreaterThanOrEqual(1);
  });

  it('two worlds of one seed are the same country; another seed is another', () => {
    const opts: WorldOptions = { worldVersion: 2 };
    const a = new World(77, opts);
    const tiles = besideRoad(a, 3000, 8, 1);
    const one = sorted(said(a, tiles));
    expect(sorted(said(new World(77, opts), tiles))).toEqual(one);
    // (the same world with its options spelled out: the region count it would have taken anyway)
    expect(sorted(said(new World(77, { worldVersion: 2, regionCount: a.rules.regionCount }), tiles))).toEqual(one);
    const other = sorted(said(new World(78, opts), tiles));
    expect(other).not.toEqual(one);
    // (not one tile of the other seed's is this one's)
    for (let i = 0; i < one.length; i++) expect(other[i][1]).not.toBe(one[i][1]);
  });
});
