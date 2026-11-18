/**
 * The render side's plants of a world of version 2 (docs/V3/nodes/W2-flora.md, the renderer's part), as far as
 * they are plain numbers: the registry has a model for every plant the regions' tables stand and leaves what
 * is picked from the ground to the forager; the atlas holds whole models within their triangle budgets; and a
 * scatter tile is exactly what the flora field of the core stands there — every plant once, where the core
 * put it, at its size, and none that the core did not put there.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { ECO_TILE } from '../../src/core/world/ecotope';
import { LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, plantsOf } from '../../src/core/world/flora';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { PLANTS, bearsAt, plantDef, plantIndex } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { LOD_FAR, LOD_MID, LOD_NEAR, buildFloraScatter, type FloraBatch } from '../../src/game/scene/floraScatter';
import { PART_ACCENT, PART_FRUIT, PART_LEAF, PART_ROCK, PART_WOOD } from '../../src/game/scene/plantModels';
import { ATLAS_ROW, ATLAS_WIDTH, FAMILIES, plantRegistry } from '../../src/game/scene/plantRegistry';

const reg = plantRegistry();
const world2 = (startBiome: string, seed = 7): World => new World(seed, { worldVersion: 2, startBiome });

/** the tile under a point `off` m to the side of the road, `s` m along it */
function tileAt(w: World, s: number, off: number): [number, number] {
  const st = new SpineSample();
  w.spine.at(s, st);
  return [Math.floor((st.x - Math.sin(st.phi) * off) / ECO_TILE), Math.floor((st.z + Math.cos(st.phi) * off) / ECO_TILE)];
}

describe('the plant registry', () => {
  it('has a family for every model the twelve regions\' tables name, and for every tree and shrub of the catalogue', () => {
    for (const id of Object.keys(FLORA)) {
      for (const plant of plantsOf(FLORA[id])) expect(FAMILIES[plantDef(plant).model], `${id}: ${plant} (${plantDef(plant).model})`).toBeDefined();
    }
    for (const p of PLANTS) if (p.layer !== 'ground') expect(FAMILIES[p.model], `${p.id} (${p.model})`).toBeDefined();
  });

  it('draws every tree and shrub and the ground\'s rocks, boulders, logs, stumps and flower clumps; what is picked from the ground it leaves alone', () => {
    for (const [i, p] of PLANTS.entries()) {
      const d = reg.draws[i];
      if (p.layer === 'ground' && p.bears) expect(d.drawn, p.id).toBe(false);
      else expect(d.drawn, p.id).toBe(true);
    }
    for (const id of ['rock', 'boulder', 'log', 'stump', 'flower_clump']) expect(reg.draws[plantIndex(id)].drawn, id).toBe(true);
  });

  it('gives every tree a far model, and puts trees and small plants in their own draws', () => {
    for (const [i, p] of PLANTS.entries()) {
      const d = reg.draws[i];
      if (!d.drawn) continue;
      expect(d.cls, p.id).toBe(p.layer === 'tree' ? 'tree' : 'small');
      if (p.layer === 'tree') expect(d.far, `${p.id} far off`).not.toBeNull();
      if (p.layer === 'ground') expect(d.far, `${p.id} far off`).toBeNull();
      // a plant of size 1 stands as tall and as wide as the catalogue says, to the model's own measure
      expect(d.ky * d.family.h).toBeCloseTo(p.height, 6);
      expect(d.kx * d.family.r).toBeCloseTo(p.crown, 6);
    }
  });

  it('takes a plant\'s colours from the catalogue, and the region\'s palette for a plant without', () => {
    const maple = reg.draws[plantIndex('maple')];
    expect(maple.tintA).toBe(0xd4572f);
    expect(reg.draws[plantIndex('oak')].tintA).toBe(-1);
    expect(reg.draws[plantIndex('birch')].tintB).toBe(0xe9e6dc);
    expect(reg.draws[plantIndex('apple_tree')].tintB).toBe(0xd8483a);
    expect(reg.draws[plantIndex('apple_tree')].showsFruit).toBe(true);
    // (what falls under a tree is not shown in its crown)
    expect(reg.draws[plantIndex('chestnut_tree')].showsFruit).toBe(false);
    expect(reg.draws[plantIndex('flower_clump')].regionAccent).toBe(true);
    expect(reg.draws[plantIndex('spruce')].evergreen).toBe(4);
    expect(reg.draws[plantIndex('oak')].evergreen).toBe(0);
  });
});

describe('the plants\' atlas', () => {
  const d = reg.atlas.data;
  const partsOf = (name: string): Set<number> => {
    const m = reg.atlas.models[name];
    const s = new Set<number>();
    for (let v = m.first; v < m.first + m.count; v++) s.add(d[v * 16 + 3]);
    return s;
  };

  it('holds every model the registry names, whole triangles each, one after the other', () => {
    let next = 0;
    for (const [name, m] of Object.entries(reg.atlas.models)) {
      expect(m.first, name).toBe(next);
      expect(m.count % 3, name).toBe(0);
      expect(m.count, name).toBeGreaterThan(0);
      next += m.count;
    }
    expect(reg.atlas.rows).toBe(Math.ceil(next / ATLAS_ROW));
    expect(d.length).toBe(reg.atlas.rows * ATLAS_WIDTH * 4);
    for (const f of Object.values(FAMILIES)) {
      expect(reg.atlas.models[f.near], f.near).toBeDefined();
      if (f.far) expect(reg.atlas.models[f.far], f.far).toBeDefined();
    }
    for (let i = 0; i < next * 16; i++) if (!Number.isFinite(d[i])) throw new Error(`a number of the atlas is not one (at ${i})`);
  });

  it('keeps the models within their budgets: a tree some 200 to 520 triangles near and under 90 far, a shrub under 165, a far shrub under 40', () => {
    for (const [name, f] of Object.entries(FAMILIES)) {
      const near = reg.atlas.models[f.near].count / 3;
      if (f.cls === 'tree') {
        expect(near, name).toBeGreaterThanOrEqual(200);
        expect(near, name).toBeLessThanOrEqual(520);
        expect(reg.atlas.models[f.far!].count / 3, `${name} far`).toBeLessThanOrEqual(90);
      } else {
        expect(near, name).toBeLessThanOrEqual(165);
        if (f.far) expect(reg.atlas.models[f.far].count / 3, `${name} far`).toBeLessThanOrEqual(40);
      }
    }
  });

  it('says of every vertex what part of the plant it is, and unit normals', () => {
    const known = [PART_WOOD, PART_LEAF, PART_ACCENT, PART_FRUIT, PART_ROCK];
    for (const name of Object.keys(reg.atlas.models)) for (const p of partsOf(name)) expect(known, `${name}: part ${p}`).toContain(p);
    expect([...partsOf('rock')]).toEqual([PART_ROCK]);
    expect([...partsOf('boulder')]).toEqual([PART_ROCK]);
    // fruit hangs in the fruit tree and on the berry bush; a birch's bark and a bamboo's canes are of the second colour
    expect(partsOf('fruit_tree').has(PART_FRUIT)).toBe(true);
    expect(partsOf('berry_bush').has(PART_FRUIT)).toBe(true);
    expect(partsOf('birch').has(PART_ACCENT)).toBe(true);
    expect(partsOf('bamboo').has(PART_ACCENT)).toBe(true);
    expect(partsOf('sunflower').has(PART_ACCENT)).toBe(true);
    const m = reg.atlas.models.willow;
    for (let v = m.first; v < m.first + m.count; v++) expect(Math.hypot(d[v * 16 + 8], d[v * 16 + 9], d[v * 16 + 10])).toBeCloseTo(1, 3);
  });

  it('lets stone and dead wood stand still in the wind, and a willow\'s hanging leaves swing more than its crown', () => {
    const flexOf = (name: string): number[] => {
      const m = reg.atlas.models[name];
      const out: number[] = [];
      for (let v = m.first; v < m.first + m.count; v++) out.push(d[v * 16 + 7]);
      return out;
    };
    for (const name of ['rock', 'boulder', 'log', 'stump']) expect(Math.max(...flexOf(name)), name).toBe(0);
    const w = reg.atlas.models.willow;
    let top = 0;
    let hanging = 0;
    for (let v = w.first; v < w.first + w.count; v++) {
      const y = d[v * 16 + 1];
      if (d[v * 16 + 6] > 0.5 && y < 2) hanging = Math.max(hanging, d[v * 16 + 7]);
      top = Math.max(top, y);
    }
    expect(hanging).toBeGreaterThan(top);
  });
});

describe('a scatter tile of a world of version 2', () => {
  /** every instance of a batch as an object */
  const rows = (b: FloraBatch): { x: number; y: number; z: number; yaw: number; sxz: number; sy: number; first: number; count: number; look: number; tintA: number; tintB: number; gx: number; gz: number; vary: number }[] =>
    Array.from({ length: b.count }, (_, i) => ({
      x: b.place[i * 4],
      y: b.place[i * 4 + 1],
      z: b.place[i * 4 + 2],
      yaw: b.place[i * 4 + 3],
      sxz: b.shape[i * 4],
      sy: b.shape[i * 4 + 1],
      first: b.shape[i * 4 + 2],
      count: b.shape[i * 4 + 3],
      look: b.look[i * 4 + 1],
      tintA: b.look[i * 4 + 2],
      tintB: b.look[i * 4 + 3],
      gx: b.lie[i * 4],
      gz: b.lie[i * 4 + 1],
      vary: b.lie[i * 4 + 2],
    }));

  it('is what the flora field stands there: every drawn plant once, where the core put it, as tall as the core says', () => {
    for (const id of ['forest', 'terraces', 'wetland', 'red_canyon', 'karst_peaks']) {
      const w = world2(id);
      const flora = w.flora!;
      for (const off of [60, 260]) {
        const [tx, tz] = tileAt(w, 2400, off);
        const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
        let wantTrees = 0;
        let wantSmall = 0;
        const core = new Map<string, { plant: number; y: number; size: number }>();
        for (const layer of [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND] as const) {
          const t = flora.tile(layer, tx, tz);
          for (let i = 0; i < t.n; i++) {
            if (!reg.draws[t.plant[i]].drawn) continue;
            if (layer === LAYER_TREE) wantTrees++;
            else wantSmall++;
            core.set(`${(t.x[i] - s.wx).toFixed(2)},${(t.z[i] - s.wz).toFixed(2)}`, { plant: t.plant[i], y: t.y[i], size: t.size[i] });
          }
        }
        const trees = s.batches.find((b) => b.cls === 'tree');
        const small = s.batches.find((b) => b.cls === 'small');
        expect(trees?.count ?? 0, `${id} trees`).toBe(wantTrees);
        expect(small?.count ?? 0, `${id} small`).toBe(wantSmall);
        for (const b of s.batches) {
          for (const r of rows(b)) {
            const c = core.get(`${r.x.toFixed(2)},${r.z.toFixed(2)}`);
            expect(c, `${id}: an instance at ${r.x.toFixed(2)}, ${r.z.toFixed(2)} that the core did not put there`).toBeDefined();
            const p = PLANTS[c!.plant];
            const d = reg.draws[c!.plant];
            expect(r.first).toBe(d.near.first);
            expect(r.count).toBe(d.near.count);
            // its height is the core's: the plant's full height times the size the core gave it
            expect(r.sy * d.family.h).toBeCloseTo(p.height * c!.size, 3);
            // never above the ground the core stood it on, and never more than a metre and a bit under it
            const foot = r.y + s.wy;
            expect(foot).toBeLessThanOrEqual(c!.y + 1e-3);
            expect(foot).toBeGreaterThan(c!.y - 1.6);
            expect(r.count).toBeLessThanOrEqual(b.verts);
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x).toBeLessThan(ECO_TILE);
            expect(r.z).toBeGreaterThanOrEqual(0);
            expect(r.z).toBeLessThan(ECO_TILE);
          }
        }
      }
    }
  });

  it('draws a tree plumb and sunk by its slope, and lays a low plant with its ground', () => {
    const w = world2('karst_peaks');
    let lying = 0;
    let steep = 0;
    for (let s0 = 600; s0 < 9000; s0 += 700) {
      for (const off of [80, 300]) {
        const [tx, tz] = tileAt(w, s0, off);
        const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
        for (const b of s.batches) {
          for (const r of rows(b)) {
            if (b.cls === 'tree') {
              expect(r.gx).toBe(0);
              expect(r.gz).toBe(0);
            } else if (Math.hypot(r.gx, r.gz) > 0.02) {
              lying++;
              if (Math.hypot(r.gx, r.gz) > 0.3) steep++;
            }
            expect(Math.abs(r.gx)).toBeLessThanOrEqual(1.5);
            expect(Math.abs(r.gz)).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
    expect(lying).toBeGreaterThan(50);
    expect(steep).toBeGreaterThan(0);
  });

  it('shows fruit on the plants that bear and on no other, and says which keep their leaves', () => {
    const w = world2('plains');
    const flora = w.flora!;
    let bearing = 0;
    let barren = 0;
    for (let s0 = 400; s0 < 14000 && bearing + barren < 40; s0 += 300) {
      const [tx, tz] = tileAt(w, s0, 70);
      const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
      const byPlace = new Map<string, number>();
      for (const b of s.batches) for (const r of rows(b)) byPlace.set(`${r.x.toFixed(2)},${r.z.toFixed(2)}`, r.look);
      for (const layer of [LAYER_TREE, LAYER_SHRUB] as const) {
        const t = flora.tile(layer, tx, tz);
        for (let i = 0; i < t.n; i++) {
          const p = PLANTS[t.plant[i]];
          const look = byPlace.get(`${(t.x[i] - s.wx).toFixed(2)},${(t.z[i] - s.wz).toFixed(2)}`)!;
          const flags = Math.floor(look / 2);
          const shows = flags % 2 === 1;
          expect(Math.floor(flags / 2) === 1, `${p.id} evergreen`).toBe(!!p.evergreen);
          expect(look - 2 * flags).toBeLessThan(1);
          if (!p.bears || p.bears.where !== 'on') {
            expect(shows, p.id).toBe(false);
            continue;
          }
          expect(shows, p.id).toBe(bearsAt(p, t.vary[i]) !== null);
          if (shows) bearing++;
          else barren++;
        }
      }
    }
    expect(bearing).toBeGreaterThan(3);
  });

  it('keeps the trees and the larger shrubs in low models at the middle level, the trees alone at the far level', () => {
    const w = world2('lakes');
    const flora = w.flora!;
    let reeds = 0;
    for (let s0 = 500; s0 < 12000; s0 += 400) {
      const [tx, tz] = tileAt(w, s0, 120);
      const near = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
      const mid = buildFloraScatter(w, reg, tx, tz, LOD_MID);
      const far = buildFloraScatter(w, reg, tx, tz, LOD_FAR);
      const count = (s: typeof near, cls: string): number => s.batches.find((b) => b.cls === cls)?.count ?? 0;
      expect(count(mid, 'tree')).toBe(count(near, 'tree'));
      expect(count(far, 'tree')).toBe(count(near, 'tree'));
      expect(count(far, 'small')).toBe(0);
      const shrubs = flora.tile(LAYER_SHRUB, tx, tz);
      let withFar = 0;
      for (let i = 0; i < shrubs.n; i++) {
        if (reg.draws[shrubs.plant[i]].far) withFar++;
        if (PLANTS[shrubs.plant[i]].id === 'reed') reeds++;
      }
      expect(count(mid, 'small')).toBe(withFar);
      for (const b of far.batches) {
        expect(b.verts).toBeLessThanOrEqual(90 * 3);
        for (const r of rows(b)) expect(r.count).toBeLessThanOrEqual(90 * 3);
      }
      for (const b of mid.batches) if (b.cls === 'small') expect(b.verts).toBeLessThanOrEqual(40 * 3);
    }
    // (lake country has reed beds: they are among what the middle level keeps)
    expect(reeds).toBeGreaterThan(20);
    expect(reg.draws[plantIndex('reed')].far).not.toBeNull();
  });

  it('comes out the same whenever it is built, and soft discs only when asked for', () => {
    const w = world2('bamboo_sea');
    const [tx, tz] = tileAt(w, 2600, 90);
    const a = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
    const other = tileAt(w, 5200, 200);
    buildFloraScatter(w, reg, other[0], other[1], LOD_NEAR);
    const b = buildFloraScatter(new World(7, { worldVersion: 2, startBiome: 'bamboo_sea' }), reg, tx, tz, LOD_NEAR);
    expect(a.batches.length).toBe(b.batches.length);
    for (const [i, x] of a.batches.entries()) {
      const y = b.batches[i];
      expect(x.count).toBe(y.count);
      expect([...x.place]).toEqual([...y.place]);
      expect([...x.shape]).toEqual([...y.shape]);
      expect([...x.look]).toEqual([...y.look]);
      expect([...x.lie]).toEqual([...y.lie]);
    }
    expect(a.discs).toBeNull();
    const withDiscs = buildFloraScatter(w, reg, tx, tz, LOD_NEAR, true);
    expect(withDiscs.discCount).toBeGreaterThan(0);
    expect(withDiscs.discs!.length).toBe(withDiscs.discCount * 16);
    expect(buildFloraScatter(w, reg, tx, tz, LOD_FAR, true).discs).toBeNull();
    // a grove of bamboo: most of its trees are bamboo, drawn with the bamboo's model
    const trees = a.batches.find((x) => x.cls === 'tree')!;
    const bamboo = reg.atlas.models.bamboo.first;
    let n = 0;
    for (let i = 0; i < trees.count; i++) if (trees.shape[i * 4 + 2] === bamboo) n++;
    expect(trees.count).toBeGreaterThan(20);
    expect(n).toBeGreaterThan(0);
  });

  it('is not for a world of version 1, which has no flora field', () => {
    const w = new World(7);
    expect(w.flora).toBeNull();
    expect(() => buildFloraScatter(w, reg, 0, 3, LOD_NEAR)).toThrow();
  });

  it('paints a plant where two regions meet with the palette of the region whose table stood it', () => {
    const w = world2('plains');
    const plan = w.spine.plan;
    // the first border of the journey
    const border = plan.starts[1];
    const flora = w.flora!;
    let pure = 0;
    for (let s0 = border - 300; s0 <= border + 300; s0 += 100) {
      const [tx, tz] = tileAt(w, s0, 90);
      const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
      const trees = flora.tile(LAYER_TREE, tx, tz);
      const b = s.batches.find((x) => x.cls === 'tree');
      if (!b) continue;
      const regions = new Set<number>();
      for (let i = 0; i < trees.n; i++) regions.add(trees.region[i]);
      if (regions.size < 2) continue;
      for (let i = 0; i < b.count; i++) {
        const share = b.look[i * 4 + 1] % 2;
        if (share < 0.001 || share > 0.998) pure++;
      }
    }
    expect(pure).toBeGreaterThan(0);
    expect(BIOMES[BIOME_INDEX.plains]).toBeDefined();
    expect(floraTableOf('plains', 'plains').cover.hues.length).toBeGreaterThan(0);
  });
});
