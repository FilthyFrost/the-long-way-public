/**
 * The render side's plants of a world of version 2 (docs/V3/nodes/W2-flora.md, the renderer's part), as far as
 * they are plain numbers: the registry has a model for every plant the regions' tables stand and leaves what
 * is picked from the ground to the forager; the atlas holds whole models within their triangle budgets; and a
 * scatter tile is exactly what the flora field of the core stands there — every plant once, where the core
 * put it, at its size, and none that the core did not put there.
 */
import { describe, expect, it } from 'vitest';
import { groundProfile } from '../../src/core/world/groundTables';
import { PART_MINERAL, PART_MINERAL_CHISELLED } from '../../src/game/scene/groundModels';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { ECO_TILE } from '../../src/core/world/ecotope';
import { LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, plantsOf } from '../../src/core/world/flora';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { PLANTS, bearsAt, plantDef, plantIndex } from '../../src/core/world/plants';
import { LandParams } from '../../src/core/world/landform';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { DENSE_TREES, LOD_CLOSE, LOD_FAR, LOD_MID, LOD_NEAR, buildFloraScatter, floraSheet, type FloraBatch, type FloraScatter } from '../../src/game/scene/floraScatter';
import { PART_ACCENT, PART_FRUIT, PART_LEAF, PART_ROCK, PART_ROCK_SMOOTH, PART_WOOD } from '../../src/game/scene/plantModels';
import { ATLAS_ROW, ATLAS_WIDTH, FAMILIES, plantRegistry } from '../../src/game/scene/plantRegistry';

const reg = plantRegistry();
/** how many plants the draws of a class hold together (a class may be cut in two draws by model size) */
const countOf = (s: FloraScatter, cls: string): number => s.batches.filter((b) => b.cls === cls).reduce((n, b) => n + b.count, 0);
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
      if (p.layer === 'tree') {
        expect(d.far, `${p.id} far off`).not.toBeNull();
        expect(d.tiny, `${p.id} furthest off`).not.toBeNull();
      } else expect(d.tiny, `${p.id} furthest off`).toBeNull();
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
        expect(reg.atlas.models[f.tiny!].count / 3, `${name} furthest`).toBeLessThanOrEqual(30);
      } else {
        expect(near, name).toBeLessThanOrEqual(165);
        if (f.far) expect(reg.atlas.models[f.far].count / 3, `${name} far`).toBeLessThanOrEqual(40);
      }
    }
  });

  it('says of every vertex what part of the plant it is, and unit normals', () => {
    const known = [PART_WOOD, PART_LEAF, PART_ACCENT, PART_FRUIT, PART_ROCK, PART_ROCK_SMOOTH, PART_MINERAL, PART_MINERAL_CHISELLED];
    for (const name of Object.keys(reg.atlas.models)) for (const p of partsOf(name)) expect(known, `${name}: part ${p}`).toContain(p);
    // (the stones chiselled, their normals their own: V3, scene/chiselRock.ts)
    expect([...partsOf('rock')]).toEqual([PART_ROCK_SMOOTH]);
    expect([...partsOf('boulder')]).toEqual([PART_ROCK_SMOOTH]);
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
    const tea = plantIndex('tea_bush');
    for (const id of ['forest', 'terraces', 'wetland', 'red_canyon', 'karst_peaks']) {
      const w = world2(id);
      const flora = w.flora!;
      const tp = new TerrainPoint();
      for (const off of [60, 260]) {
        const [tx, tz] = tileAt(w, 2400, off);
        const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
        let wantTrees = 0;
        let wantSmall = 0;
        let teas = 0;
        const core = new Map<string, { plant: number; x: number; z: number; y: number; size: number; seen: number }>();
        for (const layer of [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND] as const) {
          const t = flora.tile(layer, tx, tz);
          for (let i = 0; i < t.n; i++) {
            if (!reg.draws[t.plant[i]].drawn) continue;
            if (layer !== LAYER_TREE && !PLANTS[t.plant[i]].bears && groundProfile(BIOMES[t.region[i]].id)) continue;
            if (layer === LAYER_TREE) wantTrees++;
            else wantSmall++;
            if (t.plant[i] === tea) teas++;
            core.set(`${(t.x[i] - s.wx).toFixed(2)},${(t.z[i] - s.wz).toFixed(2)}`, { plant: t.plant[i], x: t.x[i] - s.wx, z: t.z[i] - s.wz, y: t.y[i], size: t.size[i], seen: 0 });
          }
        }
        expect(countOf(s, 'tree'), `${id} trees`).toBe(wantTrees);
        // (a plant of tea is drawn as up to three rows: its own and one on either side)
        expect(countOf(s, 'small'), `${id} small`).toBeGreaterThanOrEqual(wantSmall);
        expect(countOf(s, 'small'), `${id} small`).toBeLessThanOrEqual(wantSmall + 2 * teas);
        for (const b of s.batches) {
          for (const r of rows(b)) {
            let c = core.get(`${r.x.toFixed(2)},${r.z.toFixed(2)}`);
            if (!c) {
              // not at a plant's own place: then a row of a tea plant, beside it
              for (const k of core.values()) if (k.plant === tea && Math.abs(Math.hypot(k.x - r.x, k.z - r.z) - 2.6) < 0.01) c = k;
              expect(c, `${id}: an instance at ${r.x.toFixed(2)}, ${r.z.toFixed(2)} that the core did not put there`).toBeDefined();
              expect(r.first).toBe(reg.atlas.models.tea_bush.first);
              continue;
            }
            c.seen++;
            const p = PLANTS[c.plant];
            const d = reg.draws[c.plant];
            expect(r.first).toBe(d.near.first);
            expect(r.count).toBe(d.near.count);
            // its height is the core's: the plant's full height times the size the core gave it
            expect(r.sy * d.family.h).toBeCloseTo(p.height * c.size, 3);
            const foot = r.y + s.wy;
            if (p.aquatic) {
              // a plant of the water rises from the water's surface, not from the bed it is rooted in
              w.shape(c.x + s.wx, c.z + s.wz, tp);
              expect(tp.wl).toBeGreaterThan(c.y);
              expect(foot).toBeGreaterThan(c.y);
              expect(foot).toBeLessThanOrEqual(tp.wl);
              expect(foot).toBeGreaterThan(tp.wl - 0.3);
            } else {
              // never above the ground the core stood it on, and never more than a metre and a bit under it
              expect(foot).toBeLessThanOrEqual(c.y + 1e-3);
              expect(foot).toBeGreaterThan(c.y - 1.6);
            }
            expect(r.count).toBeLessThanOrEqual(b.verts);
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x).toBeLessThan(ECO_TILE);
            expect(r.z).toBeGreaterThanOrEqual(0);
            expect(r.z).toBeLessThan(ECO_TILE);
          }
        }
        for (const c of core.values()) expect(c.seen, `${id}: ${PLANTS[c.plant].id} drawn once`).toBe(1);
      }
    }
  });

  it('stands a plant of tea as rows on its bench: level, and only where the bench reaches', () => {
    const w = world2('terraces');
    const flora = w.flora!;
    const tea = plantIndex('tea_bush');
    const first = reg.atlas.models.tea_bush.first;
    const tp = new TerrainPoint();
    let plants = 0;
    let rowsSeen = 0;
    let benched = 0;
    // the stretches of the region's road whose sides are cut into benches
    const lp = new LandParams();
    const SLOT = w.rules.slot;
    const where: number[] = [];
    for (let k = 1; k < 400 && where.length < 12; k++) {
      const kind = w.land.kindOf(k);
      if ((kind === 'hillside' || kind === 'valley') && w.land.at((k + 0.5) * SLOT, lp).terrace > 0.5) where.push((k + 0.5) * SLOT);
    }
    expect(where.length).toBeGreaterThan(3);
    for (const s0 of where) {
      for (const off of [-200, -90, 90, 200]) {
        const [tx, tz] = tileAt(w, s0, off);
        const shrubs = flora.tile(LAYER_SHRUB, tx, tz);
        let here = 0;
        for (let i = 0; i < shrubs.n; i++) if (shrubs.plant[i] === tea) here++;
        if (!here) continue;
        plants += here;
        const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
        const et = w.eco!.tile(tx, tz);
        for (const r of s.batches.filter((x) => x.cls === 'small').flatMap(rows)) {
          if (r.first !== first) continue;
          rowsSeen++;
          // (a row is drawn at the model's own measure across, whatever the plant's size)
          expect(r.sxz).toBeCloseTo(1, 6);
          const node = Math.min(15, Math.max(0, Math.floor(r.z / 8))) * 17 + Math.min(15, Math.max(0, Math.floor(r.x / 8)));
          if (et.terrace[node] < 0.5 || r.gx !== 0 || r.gz !== 0) continue;
          // on terraced country: level, and on the land as it is at its own middle
          benched++;
          w.shape(r.x + s.wx, r.z + s.wz, tp);
          expect(Math.abs(r.y + s.wy + 0.03 - tp.bed)).toBeLessThan(0.3);
        }
      }
    }
    expect(plants).toBeGreaterThan(20);
    expect(rowsSeen).toBeGreaterThan(plants);
    expect(rowsSeen).toBeLessThanOrEqual(plants * 3);
    expect(benched).toBeGreaterThan(10);
  });

  it('draws a tree plumb and sunk by its slope, and lays a low plant with its ground', () => {
    const w = world2('karst_peaks');
    let lying = 0;
    let steep = 0;
    for (let s0 = 600; s0 < 18000; s0 += 350) {
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
          if (layer === LAYER_SHRUB && !p.bears && groundProfile(BIOMES[t.region[i]].id)) continue;
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

  it('keeps the trees and the larger shrubs in low models at the middle level, the trees alone in their smallest at the far level', () => {
    const w = world2('lakes');
    const flora = w.flora!;
    let reeds = 0;
    let open = 0;
    let thick = 0;
    let interior = 0;
    const models = { near: new Set(reg.draws.map((d) => d.near.first)), far: new Set(reg.draws.filter((d) => d.far).map((d) => d.far!.first)) };
    for (let s0 = 500; s0 < 12000; s0 += 400) {
      const [tx, tz] = tileAt(w, s0, 120);
      const near = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
      const close = buildFloraScatter(w, reg, tx, tz, LOD_CLOSE);
      const mid = buildFloraScatter(w, reg, tx, tz, LOD_MID);
      const far = buildFloraScatter(w, reg, tx, tz, LOD_FAR);
      for (const s of [close, mid]) expect(countOf(s, 'tree')).toBe(countOf(near, 'tree'));
      expect(countOf(close, 'small')).toBe(countOf(near, 'small'));
      expect(countOf(far, 'small')).toBe(0);
      const shrubs = flora.tile(LAYER_SHRUB, tx, tz);
      let withFar = 0;
      for (let i = 0; i < shrubs.n; i++) {
        if (reg.draws[shrubs.plant[i]].far && (PLANTS[shrubs.plant[i]].bears || !groundProfile(BIOMES[shrubs.region[i]].id))) withFar++;
        if (PLANTS[shrubs.plant[i]].id === 'reed') reeds++;
      }
      expect(countOf(mid, 'small')).toBe(withFar);
      // a tile that is not thick wood: every tree in its full model at the close level, in its far model at
      // the middle level, in its smallest (and every one of them) at the far level
      const dense = flora.tile(LAYER_TREE, tx, tz).n > DENSE_TREES;
      const level = (r: { first: number }): number => (models.near.has(r.first) ? 0 : models.far.has(r.first) ? 1 : 2);
      const levels = (s: FloraScatter): number[] => s.batches.filter((b) => b.cls === 'tree').flatMap(rows).map(level);
      if (!dense) {
        expect(levels(close).every((l) => l === 0)).toBe(true);
        expect(levels(mid).every((l) => l === 1)).toBe(true);
        expect(countOf(far, 'tree')).toBe(countOf(near, 'tree'));
        open++;
      } else {
        // thick wood: the trees inside it a level lower than its edge, and at the far level every other one of them
        if (levels(close).some((l) => l === 1)) interior++;
        expect(levels(close).every((l) => l <= 1)).toBe(true);
        expect(levels(mid).every((l) => l >= 1)).toBe(true);
        expect(countOf(far, 'tree')).toBeLessThanOrEqual(countOf(near, 'tree'));
        expect(countOf(far, 'tree')).toBeGreaterThanOrEqual(countOf(near, 'tree') * 0.4);
        thick++;
      }
      expect(levels(near).every((l) => l === 0)).toBe(true);
      expect(levels(far).every((l) => l === 2)).toBe(true);
      // the close level's shadows are thrown by every tree of the tile in its far model; no other level has such a draw
      expect(near.shadows).toBeNull();
      expect(mid.shadows).toBeNull();
      expect(far.shadows).toBeNull();
      if (countOf(near, 'tree') > 0) {
        expect(close.shadows!.count).toBe(countOf(near, 'tree'));
        expect(rows(close.shadows!).every((r) => level(r) === 1)).toBe(true);
        expect(buildFloraScatter(w, reg, tx, tz, LOD_CLOSE, true).shadows).toBeNull();
      } else expect(close.shadows).toBeNull();
      for (const b of mid.batches) expect(b.verts).toBeLessThanOrEqual(b.cls === 'tree' ? 90 * 3 : 40 * 3);
      for (const b of far.batches) expect(b.verts).toBeLessThanOrEqual(30 * 3);
    }
    expect(open).toBeGreaterThan(3);
    expect(thick).toBeGreaterThan(0);
    expect(interior).toBeGreaterThan(0);
    // (lake country has reed beds: they are among what the middle level keeps)
    expect(reeds).toBeGreaterThan(20);
    expect(reg.draws[plantIndex('reed')].far).not.toBeNull();
    for (const [i, p] of PLANTS.entries()) if (p.layer === 'tree') expect(reg.draws[i].tiny, `${p.id} furthest`).not.toBeNull();
  });

  it('cuts a draw in two where small models stand among large ones, and never draws a plant with fewer vertices than its model has', () => {
    // a row of rocks (20 triangles) among sunflowers (160): together they would all be drawn as the largest
    const list = [];
    for (let i = 0; i < 120; i++) list.push({ plant: i % 4 === 0 ? 'sunflower' : 'rock', x: i, y: 0, z: 0 });
    const cut = floraSheet(reg, list);
    expect(cut.length).toBe(2);
    expect(cut[0].count + cut[1].count).toBe(120);
    expect(cut[0].verts).toBe(reg.atlas.models.sunflower.count);
    expect(cut[1].verts).toBe(reg.atlas.models.rock.count);
    for (const b of cut) for (const r of rows(b)) expect(r.count).toBeLessThanOrEqual(b.verts);
    // a handful of them: not worth a second draw
    expect(floraSheet(reg, list.slice(0, 8)).length).toBe(1);
    // and in the world: what a tile's draws hold in all is never more than a third over its models' own triangles
    const w = world2('forest');
    let padded = 0;
    let own = 0;
    for (let s0 = 600; s0 < 9000; s0 += 600) {
      const [tx, tz] = tileAt(w, s0, 90);
      const s = buildFloraScatter(w, reg, tx, tz, LOD_NEAR);
      expect(s.batches.length).toBeLessThanOrEqual(4);
      for (const b of s.batches) {
        padded += (b.verts / 3) * b.count;
        own += b.triangles;
        for (const r of rows(b)) expect(r.count).toBeLessThanOrEqual(b.verts);
      }
    }
    expect(padded / own).toBeLessThan(1.34);
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
    // a grove of bamboo: its trees are drawn with the bamboo's model
    const bamboo = reg.atlas.models.bamboo.first;
    let n = 0;
    for (const b of a.batches) if (b.cls === 'tree') for (const r of rows(b)) if (r.first === bamboo) n++;
    expect(countOf(a, 'tree')).toBeGreaterThan(20);
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
      const regions = new Set<number>();
      for (let i = 0; i < trees.n; i++) regions.add(trees.region[i]);
      if (regions.size < 2) continue;
      for (const b of s.batches) {
        if (b.cls !== 'tree') continue;
        for (let i = 0; i < b.count; i++) {
          const share = b.look[i * 4 + 1] % 2;
          if (share < 0.001 || share > 0.998) pure++;
        }
      }
    }
    expect(pure).toBeGreaterThan(0);
    expect(BIOMES[BIOME_INDEX.plains]).toBeDefined();
    expect(floraTableOf('plains', 'plains').cover.hues.length).toBeGreaterThan(0);
  });
});
