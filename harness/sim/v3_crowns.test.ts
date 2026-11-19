/**
 * The painted crowns (docs/V3/nodes/L-landscape.md, the sample stretch; scene/crowns/): trees grown as a
 * background painter paints them, and handed over by the scatter tiles to a view of their own.
 *
 *   the growers are pure: the same seed and shape grow the same tree, to the vertex; every level of a tree has
 *   the same frame (its clumps stand where the nearest level's do, fewer of them, with fewer and bigger sprays);
 *   every species stays within its budget of triangles at each level, and its leaves run the height of its
 *   crown with no gap (a tall crown is not a ball floating over a bare stem);
 *   a scatter tile asked to hand its crowns over draws none of those trees itself and loses none: what it hands
 *   over and what it still draws are, together, what it draws when no crowns are asked for; the far tiles keep
 *   every tree in the atlas;
 *   a tile set again under the same key is not taken back by the one it replaced.
 */
import { describe, expect, it } from 'vitest';
import { LAYER_TREE } from '../../src/core/world/flora';
import { PLANTS } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { CROWN_LEVELS, growBroadleaf, growConifer } from '../../src/game/scene/crowns/grow';
import { CROWN_STRIDE, type CrownLookup } from '../../src/game/scene/crowns/crownData';
import { paintedFamily, CROWN_PAINT } from '../../src/game/scene/crowns/palette';
import { FLORA } from '../../src/core/world/floraTables';
import { growSpeciesModel, crownBudget, crownSpecies, SPECIES } from '../../src/game/scene/crowns/species';
import { LOD_CLOSE, LOD_FAR, LOD_MID, LOD_NEAR, buildFloraScatter, type FloraLod } from '../../src/game/scene/floraScatter';
import { plantRegistry } from '../../src/game/scene/plantRegistry';
import * as THREE from 'three';
import { CrownView } from '../../src/game/scene/crowns/crownView';
import type { RenderCore } from '../../src/game/render/core';

/** the crowns as the scatter sees them, without a renderer */
function lookup(): CrownLookup {
  const species = [...crownSpecies().values()];
  const index = new Map(species.map((s, i) => [s.family, i]));
  return {
    speciesOf: (f) => index.get(f) ?? -1,
    measure: (i) => ({ height: species[i].height, radius: species[i].radius, small: species[i].def.small === true }),
    variants: (i) => species[i].models.length,
  };
}

describe('painted crowns · the growers', () => {
  it('grow the same tree from the same seed, to the vertex', () => {
    const shape = SPECIES.broadleaf.variants[0].grow;
    if (shape.kind !== 'broadleaf') throw new Error('broadleaf');
    const a = growBroadleaf(51, shape.shape, 0);
    const b = growBroadleaf(51, shape.shape, 0);
    expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(Array.from(b.geometry.getAttribute('position').array));
    const c = SPECIES.conifer.variants[0].grow;
    if (c.kind !== 'conifer') throw new Error('conifer');
    expect(Array.from(growConifer(211, c.shape, 1).geometry.getAttribute('position').array)).toEqual(Array.from(growConifer(211, c.shape, 1).geometry.getAttribute('position').array));
  });

  it('grows two deterministic, budgeted variants for every tree named in a region', () => {
    for (const table of Object.values(FLORA)) for (const row of table.trees) {
      const plant = PLANTS.find(p => p.id === row.plant)!;
      expect(SPECIES[paintedFamily(plant.id, plant.model)], row.plant).toBeDefined();
    }
    for (const s of crownSpecies().values()) {
      expect(s.models.length).toBeGreaterThanOrEqual(2);
      const limits = [6500,1800,1100].map(n => n * (s.def.small ? 0.4 : 1));
      for (const [v, levels] of s.models.entries()) for (const [l, m] of levels.entries()) {
        const shape = s.def.variants[v];
        const again = growSpeciesModel(shape.grow,shape.seed,l);
        const positions = m.geometry.getAttribute('position').array;
        expect(Buffer.from(again.geometry.getAttribute('position').array.buffer).equals(Buffer.from(positions.buffer))).toBe(true);
        expect(m.triangles, s.family).toBeLessThanOrEqual(limits[l]);
        again.geometry.dispose();
        if (CROWN_PAINT[s.family]?.autumn !== undefined) {
          const bare = growSpeciesModel(shape.grow,shape.seed,l,true);
          expect(bare.geometry.getAttribute('aPart').array.every(part => part === 0),s.family).toBe(true);
          expect(bare.radius).toBeGreaterThan(0);
          expect(bare.triangles,s.family).toBeLessThanOrEqual(limits[l]);
          bare.geometry.dispose();
        }
      }
    }
  });

  it('keep every species within its budget at each level, the levels ever lighter', () => {
    const budget = crownBudget();
    // (triangles: the nearest level within some 70 m, the second to 200 m, the third beyond)
    const most = [6500, 1800, 1100];
    for (const [family, levels] of Object.entries(budget)) {
      for (let l = 0; l < CROWN_LEVELS.length; l++) expect(levels[l], `${family} level ${l}`).toBeLessThanOrEqual(most[l] * (SPECIES[family].small ? 0.4 : 1));
      expect(levels[1], family).toBeLessThan(levels[0] * 0.4);
      expect(levels[2], family).toBeLessThan(levels[1]);
    }
  });

  it('anchors each broadleaf mass to visible wood at the close level', () => {
    for (const s of crownSpecies().values()) {
      for (const [variant, models] of s.models.entries()) {
        const shape = s.def.variants[variant].grow;
        if (shape.kind !== 'broadleaf' || shape.shape.boughWood === false) continue;
        const geo = models[0].geometry;
        const p = geo.getAttribute('position');
        const part = geo.getAttribute('aPart');
        const wood: THREE.Vector3[] = [];
        for (let i=0; i<p.count; i++) {
          if (part.getX(i) === 0) wood.push(new THREE.Vector3().fromBufferAttribute(p,i));
          if (part.getX(i) !== 1) continue;
          const points: THREE.Vector3[] = [];
          while (i<p.count && part.getX(i) === 1) points.push(new THREE.Vector3().fromBufferAttribute(p,i++));
          const ball = new THREE.Sphere().setFromPoints(points);
          const distance = Math.min(...wood.map(v=>v.distanceTo(ball.center)));
          expect(distance, s.family).toBeLessThan(ball.radius*1.65+0.3);
        }
      }
    }
  });

  it('run the leaves of every crown up its whole height, with no gap a metre and more wide', () => {
    for (const s of crownSpecies().values()) {
      for (const [v, levels] of s.models.entries()) {
        for (const [l, m] of levels.entries()) {
          const pos = m.geometry.getAttribute('position');
          const part = m.geometry.getAttribute('aPart');
          let lo = Infinity;
          let hi = -Infinity;
          const ys: number[] = [];
          for (let i = 0; i < pos.count; i++) {
            if (part.getX(i) < 0.5) continue;
            const y = pos.getY(i);
            ys.push(y);
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
          ys.sort((a, b) => a - b);
          let gap = 0;
          for (let i = 1; i < ys.length; i++) gap = Math.max(gap, ys[i] - ys[i - 1]);
          expect(gap, `${s.family} variant ${v} level ${l}: leaves ${lo.toFixed(1)}–${hi.toFixed(1)} m`).toBeLessThan(Math.max(1, (hi - lo) * 0.12));
          // (and the crown stands on the tree, not under the ground)
          expect(lo, `${s.family} ${v} ${l}`).toBeGreaterThan(-0.5);
        }
      }
    }
  });
});

describe('painted crowns · the scatter hands them over', () => {
  const world = new World(7, { worldVersion: 2, startBiome: 'forest' });
  const reg = plantRegistry();
  const crowns = lookup();

  /** the tiles of a stretch of road: a forest's and a plain's */
  const tiles: [number, number][] = [];
  for (const s of [2000, 4000, 6000]) {
    const st = new SpineSample();
    world.spine.at(s, st);
    const p = { x: st.x, z: st.z };
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) tiles.push([Math.floor(p.x / 128) + dx, Math.floor(p.z / 128) + dz]);
  }

  const count = (b: { count: number }[]): number => b.reduce((a, x) => a + x.count, 0);

  for (const lod of [LOD_NEAR, LOD_CLOSE, LOD_MID, LOD_FAR] as FloraLod[]) {
    it(`at level ${lod}: what is handed over and what is still drawn are what is drawn without crowns`, () => {
      let handed = 0;
      for (const [tx, tz] of tiles) {
        const plain = buildFloraScatter(world, reg, tx, tz, lod, false, null);
        const n0 = count(plain.batches);
        const withCrowns = buildFloraScatter(world, reg, tx, tz, lod, false, crowns);
        const n1 = count(withCrowns.batches);
        expect(n1 + withCrowns.crownCount, `tile ${tx},${tz}`).toBe(n0);
        handed += withCrowns.crownCount;
        if (lod === LOD_FAR) expect(withCrowns.crownCount).toBe(0);
        // every crown handed over is of a species, in the tile, standing on the land
        const c = withCrowns.crowns;
        for (let i = 0; i < withCrowns.crownCount; i++) {
          const o = i * CROWN_STRIDE;
          expect(c![o + 6]).toBeGreaterThanOrEqual(0);
          expect(Math.floor(c![o] / 128)).toBe(tx);
          expect(Math.floor(c![o + 2] / 128)).toBe(tz);
          expect(c![o + 15]).toBeGreaterThan(0.5);
          expect(Number.isFinite(c![o + 1])).toBe(true);
        }
      }
      if (lod !== LOD_FAR) expect(handed).toBeGreaterThan(0);
    });
  }

  it('hands over every tree of a crowned family at the three nearer levels, and draws the rest', () => {
    const [tx, tz] = tiles[0];
    const t = world.flora!.tile(LAYER_TREE, tx, tz);
    let crowned = 0;
    for (let i = 0; i < t.n; i++) if (reg.draws[t.plant[i]].drawn && crowns.speciesOf(PLANTS[t.plant[i]].model) >= 0) crowned++;
    const s = buildFloraScatter(world, reg, tx, tz, LOD_MID, false, crowns);
    // (at the middle level the shrubs stay the atlas's: what is handed over is the crowned trees, all of them)
    expect(s.crownCount).toBe(crowned);
  });
});

describe('painted crowns · the view', () => {
  it('takes a tile back only with the token that set it: a tile set again under its key stays', () => {
    const core = { camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000), origin: { x: 0, y: 0, z: 0 } } as unknown as RenderCore;
    const view = new CrownView(core);
    const one = new Float32Array(CROWN_STRIDE);
    one.set([10, 0, 10, 0, 1, 1, 0, 0, 0, 0, -1, 0, 0.5, 0, 4, 9]);
    const first = view.setTile('3,4', one, 1);
    const second = view.setTile('3,4', one, 1);
    view.dropTile('3,4', first);
    expect(view.trees).toBe(1);
    view.dropTile('3,4', second);
    expect(view.trees).toBe(0);
    // (and it draws what it holds where the camera looks)
    view.setTile('0,0', one, 1);
    core.camera.position.set(10, 2, 40);
    core.camera.lookAt(10, 3, 10);
    view.update();
    expect(view.drawn.levels.reduce((a, b) => a + b, 0)).toBe(1);
    expect(view.drawn.levels[0]).toBe(1);
    view.dispose();
  });
});
