/**
 * What the renderer paints of the flora without standing a plant (docs/V3/nodes/W2-flora.md, the renderer's
 * part): the ground cover and the woods far off. The render side reads the core's cover and canopy in pieces
 * of its own (scene/floraCover.ts, scene/floraCanopy.ts: a grass tuft and a ground vertex cannot ask the core
 * one by one); these tests hold the pieces to the core's own answers, point by point, so that a change of the
 * core's rule shows here. And the builders that use them: the land's vertices, the grass, the far-woods cards.
 */
import { groundField } from '../../src/core/world/groundField';
import { groundProfile, pigments } from '../../src/core/world/groundTables';
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { ECO_N, ECO_PLOT, ECO_ROAD, ECO_SITE, ECO_STEP, ECO_TILE, ECO_WET, Ecotope, WOOD_SHEER, WOOD_STEEP, canopyAt } from '../../src/core/world/ecotope';
import { Cover } from '../../src/core/world/flora';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { LandParams } from '../../src/core/world/landform';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { BIOME_STYLES, coverUniforms, ownPalettes, paletteUniforms, setSlotBiome } from '../../src/game/render/style';
import { canopyOf, woodHeight, woodOnSlope } from '../../src/game/scene/floraCanopy';
import { CoverBase, coverBase, driftHue01, hueOf, hueShares, rowCoord, rowHue01, rowsRun } from '../../src/game/scene/floraCover';
import { GRASS_TILE, TERRAIN_N, TERRAIN_ROOT, WOODS_TILE, buildFarWoods, buildGrass, buildStrip, buildTerrain } from '../../src/game/scene/worldBuild';

const world2 = (startBiome: string, seed = 7): World => new World(seed, { worldVersion: 2, startBiome });
const st = new SpineSample();
/** the point `off` m to the right of the road, `s` m along it */
function beside(w: World, s: number, off: number): [number, number] {
  w.spine.at(s, st);
  return [st.x - Math.sin(st.phi) * off, st.z + Math.cos(st.phi) * off];
}

/** the first stretch of a region's first chapter with a terraced side: its middle (m of road); NaN: none */
function terracedAt(w: World): number {
  const lp = new LandParams();
  const SLOT = w.rules.slot;
  for (let k = 1; k < 400; k++) {
    const kind = w.land.kindOf(k);
    if ((kind === 'hillside' || kind === 'valley') && w.land.at((k + 0.5) * SLOT, lp).terrace > 0.5) return (k + 0.5) * SLOT;
  }
  return NaN;
}

describe('the ground cover as the renderer reads it', () => {
  it('is the core\'s cover at every point: the smooth part, the rows, the colour of a row', () => {
    const e = new Ecotope();
    const cb = new CoverBase();
    const out = new Cover();
    const tp = new TerrainPoint();
    let inRows = 0;
    let flowered = 0;
    for (const id of Object.keys(FLORA)) {
      const w = world2(id);
      const flora = w.flora!;
      const far = id === 'terraces' ? terracedAt(w) : NaN;
      for (let n = 0; n < 1500; n++) {
        // (points scattered beside the road; in terraced country half of them on a terraced stretch)
        const s = far === far && n % 2 ? far + ((n * 37) % 300) - 150 : 400 + ((n * 7919) % 7000);
        const off = (((n * 104729) % 6000) / 10 - 300) * (n % 3 === 0 ? 0.25 : 1);
        const [x, z] = beside(w, s, off);
        w.shape(x, z, tp);
        const y = n % 4 === 0 ? undefined : tp.bed;
        w.eco!.at(x, z, e);
        const c = floraTableOf(BIOMES[e.rt >= 0.5 ? e.rb : e.ra].id, BIOMES[e.rt >= 0.5 ? e.rb : e.ra].kin).cover;
        coverBase(e, c, cb);
        flora.cover(x, z, out, y);
        expect(cb.grass).toBe(out.grass);
        expect(cb.height).toBe(out.height);
        expect(cb.bare).toBe(out.bare);
        expect(cb.litter).toBe(out.litter);
        let flowers = cb.flowers;
        let hue = hueOf(c.hues, driftHue01(w.seed, x, z));
        if (c.rows && cb.flowers > 0) {
          if (!rowsRun(c.rows, e.slope, e.terrace, e.step, y)) flowers = 0;
          else {
            const p = rowCoord(w.seed, x, z) / c.rows.spacing;
            const k = Math.floor(p);
            if (!(p - k < c.rows.share)) flowers = 0;
            else inRows++;
            hue = hueOf(c.hues, rowHue01(w.seed, k));
          }
        }
        expect(flowers, `${id} flowers at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(out.flowers);
        // (where nothing grows — road, water, a place, a plot — the core names no colour)
        if (e.flags & (ECO_ROAD | ECO_WET | ECO_SITE | ECO_PLOT)) expect(out.hue).toBe(0);
        else if (cb.flowers > 0 || !c.rows) expect(hue, `${id} hue`).toBe(out.hue);
        if (out.flowers > 0) flowered++;
      }
    }
    expect(inRows).toBeGreaterThan(200);
    expect(flowered).toBeGreaterThan(2000);
  });

  it('deals the first and the last colour of a list to the most rows, and all of them to some', () => {
    const shares = hueShares(5);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(shares[0]).toBeGreaterThan(shares[2]);
    expect(shares[4]).toBeGreaterThan(shares[2]);
    const hues = FLORA.flower_fields.cover.hues;
    const count = new Map<number, number>();
    for (let k = -3000; k < 3000; k++) {
      const h = hueOf(hues, rowHue01(7, k));
      count.set(h, (count.get(h) ?? 0) + 1);
    }
    expect(count.size).toBe(hues.length);
    for (const [i, h] of hues.entries()) expect((count.get(h) ?? 0) / 6000).toBeCloseTo(shares[i], 1);
    expect(hueShares(1)).toEqual([1]);
    expect(hueOf([], 0.4)).toBe(0);
  });

  it('lays each palette slot\'s cover out for the ground\'s paint: its colours, their mean, its rows; a marsh is wet, a lake\'s shore reedy', () => {
    setSlotBiome(1, BIOME_INDEX.flower_fields);
    setSlotBiome(2, BIOME_INDEX.wetland);
    setSlotBiome(3, BIOME_INDEX.lakes);
    setSlotBiome(0, BIOME_INDEX.red_canyon);
    const d = coverUniforms.tCover.value!.image.data as Float32Array;
    const c = FLORA.flower_fields.cover;
    const row = 1 * 8 * 4;
    expect(d[row + 6 * 4]).toBe(c.rows!.spacing);
    expect(d[row + 6 * 4 + 1]).toBeCloseTo(c.rows!.share, 6);
    expect(d[row + 6 * 4 + 2]).toBe(c.hues.length);
    // (colours are held as the paints are: linear, each within 0 … 1; the mean lies among them)
    for (let i = 0; i < 6 * 4; i++) expect(d[row + i]).toBeGreaterThanOrEqual(0);
    const shares = hueShares(c.hues.length);
    for (let k = 0; k < 3; k++) {
      let mean = 0;
      for (let i = 0; i < c.hues.length; i++) mean += d[row + i * 4 + k] * shares[i];
      expect(d[row + 5 * 4 + k]).toBeCloseTo(mean, 6);
    }
    // a region without rows says so
    expect(d[2 * 8 * 4 + 6 * 4]).toBe(0);
    // (a flat vec4 array: slot k's x at 4k, its y at 4k + 1)
    const misc = coverUniforms.uCoverMisc.value;
    expect(misc[2 * 4]).toBe(1);
    expect(misc[1 * 4]).toBe(0);
    expect(misc[0]).toBe(0);
    expect(misc[3 * 4 + 1]).toBe(1);
    expect(misc[2 * 4 + 1]).toBe(1);
    expect(misc[1]).toBeLessThan(0.5);
    for (let sl = 0; sl < 4; sl++) setSlotBiome(sl, 0);
  });
});

describe('the palettes of the far land', () => {
  it('are a far leaf\'s own: the regions of its own four chapters, whatever the rolling slots hold', () => {
    // the rolling slots as a traveller deep in other country has them
    for (let sl = 0; sl < 4; sl++) setSlotBiome(sl, BIOME_INDEX.desert);
    const biomes = [BIOME_INDEX.flower_fields, BIOME_INDEX.wetland, BIOME_INDEX.alpine, BIOME_INDEX.red_canyon];
    const own = ownPalettes(biomes);
    // (flat vec3 arrays: element i at 3i; the GPU's single precision)
    const ground = own.uniforms.uGroundPal.value as Float32Array;
    const forest = own.uniforms.uForestPal.value as Float32Array;
    for (const [slot, b] of biomes.entries()) {
      const st = BIOME_STYLES[b];
      expect(Array.from(ground.subarray(slot * 9, slot * 9 + 3))).toEqual(st.ground.deep.map(Math.fround));
      expect(ground[(slot * 3 + 2) * 3]).toBe(Math.fround(st.ground.lit[0]));
      expect(forest[(slot * 4 + 3) * 3 + 1]).toBe(Math.fround(st.forest[3][1]));
      expect((own.uniforms.uBiomeMisc.value as Float32Array)[slot * 4]).toBe(Math.fround(st.snow));
    }
    // its cover is its own too: the flower fields' rows in the slot they were given, a marsh's wet in its slot
    const cover = (own.uniforms.tCover.value as { image: { data: Float32Array } }).image.data;
    expect(cover[0 * 32 + 24]).toBe(FLORA.flower_fields.cover.rows!.spacing);
    expect(cover[1 * 32 + 24]).toBe(0);
    expect((own.uniforms.uCoverMisc.value as Float32Array)[1 * 4]).toBe(1);
    // and the rolling slots are as they were
    expect(paletteUniforms.uGroundPal.value[0]).toBe(Math.fround(BIOME_STYLES[BIOME_INDEX.desert].ground.deep[0]));
    expect(own.uniforms.uGroundPal.value).not.toBe(paletteUniforms.uGroundPal.value);
    own.dispose();
    for (let sl = 0; sl < 4; sl++) setSlotBiome(sl, 0);
  });

  it('are told which chapters a leaf lies in by the leaf itself', () => {
    const w = world2('plains');
    const plan = w.spine.plan;
    // a far leaf across the first border of the journey
    const border = plan.starts[1];
    const [x, z] = beside(w, border, 0);
    const size = TERRAIN_ROOT * 4;
    const leaf = buildTerrain(w, -2, Math.floor(x / size), Math.floor(z / size));
    expect(leaf.chapters).toBeDefined();
    const [first, last] = leaf.chapters!;
    expect(first).toBeLessThanOrEqual(plan.chapterAt(border - 50));
    expect(last).toBeGreaterThanOrEqual(plan.chapterAt(border + 50));
    // an 8 km leaf never touches more chapters than there are slots
    expect(last - first).toBeLessThan(4);
    leaf.geometry.dispose();
  });
});

describe('the canopy as the renderer asks for it', () => {
  it('is the ecotope\'s at its nodes: the same regions, road, water, coast and slope', () => {
    const tp = new TerrainPoint();
    let wooded = 0;
    let steep = 0;
    for (const id of ['plains', 'forest', 'lakes', 'karst_peaks', 'bamboo_sea', 'alpine', 'red_canyon']) {
      const w = world2(id);
      for (const [s, off] of [[900, 60], [2600, -140], [4300, 300], [6100, -40], [8200, 500]] as const) {
        const [px, pz] = beside(w, s, off);
        const t = w.eco!.tile(Math.floor(px / ECO_TILE), Math.floor(pz / ECO_TILE));
        for (let j = 0; j < ECO_N; j++) {
          for (let i = 0; i < ECO_N; i++) {
            const n = j * ECO_N + i;
            const x = t.tx * ECO_TILE + i * ECO_STEP;
            const z = t.tz * ECO_TILE + j * ECO_STEP;
            w.shape(x, z, tp);
            const got = canopyOf(w, tp, x, z) * woodOnSlope(t.slope[n]);
            expect(got, `${id} at ${x}, ${z}`).toBeCloseTo(t.canopy[n], 6);
            if (t.canopy[n] > 0.5) wooded++;
            if (t.slope[n] > WOOD_STEEP) steep++;
          }
        }
      }
    }
    expect(wooded).toBeGreaterThan(500);
    expect(steep).toBeGreaterThan(0);
  });

  it('thins the woods on a slope as the core does, and knows how tall a region\'s woods stand', () => {
    const p = FLORA.forest.eco;
    for (const slope of [0, 0.5, WOOD_STEEP, 0.9, 1.1, 1.3, WOOD_SHEER, 2]) {
      const level = canopyAt(p, 99, 1234, 567, 200, 20, 150, 0);
      expect(level).toBeGreaterThan(0);
      expect(canopyAt(p, 99, 1234, 567, 200, 20, 150, slope)).toBeCloseTo(level * woodOnSlope(slope), 9);
    }
    expect(woodHeight(BIOME_INDEX.forest)).toBeGreaterThan(10);
    expect(woodHeight(BIOME_INDEX.forest)).toBeLessThan(15);
    // (red rock country has no woods of its own: nothing is lifted there)
    expect(woodHeight(BIOME_INDEX.red_canyon)).toBe(0);
    expect(woodHeight(BIOME_INDEX.bamboo_sea)).toBeGreaterThan(8);
  });
});

describe('the land of a world of version 2', () => {
  const leafAt = (w: World, s: number, off: number): [number, number] => {
    const [x, z] = beside(w, s, off);
    const size = TERRAIN_ROOT / 8;
    return [Math.floor(x / size), Math.floor(z / size)];
  };

  it('is painted wooded where the ecotope is: a near leaf\'s vertices carry the canopy of the nodes they stand on', () => {
    const tp = new TerrainPoint();
    let checked = 0;
    for (const id of ['forest', 'karst_peaks', 'lakes']) {
      const w = world2(id);
      const [ix, iz] = leafAt(w, 3000, 200);
      const b = buildTerrain(w, 3, ix, iz);
      const gd = b.geometry.getAttribute('aGround');
      expect(b.geometry.getAttribute('aCover')).toBeDefined();
      const V = TERRAIN_N + 1;
      for (let j = 0; j <= TERRAIN_N; j++) {
        for (let i = 0; i <= TERRAIN_N; i++) {
          const x = b.wx + i * 8;
          const z = b.wz + j * 8;
          w.shape(x, z, tp);
          if (tp.plot > 0) continue;
          const t = w.eco!.tile(Math.floor(x / ECO_TILE), Math.floor(z / ECO_TILE));
          const n = ((z - t.tz * ECO_TILE) / 8) * ECO_N + (x - t.tx * ECO_TILE) / 8;
          expect(gd.getZ(j * V + i), `${id} at ${x}, ${z}`).toBeCloseTo(t.canopy[n], 5);
          checked++;
        }
      }
      b.geometry.dispose();
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it('carries the rows of the flower fields, by the lie of the land, and those of the terraces\' benches', () => {
    const tp = new TerrainPoint();
    const fields = world2('flower_fields');
    const c = FLORA.flower_fields.cover;
    let rows = 0;
    for (const off of [150, -150]) {
      const [ix, iz] = leafAt(fields, 3000, off);
      const b = buildTerrain(fields, 3, ix, iz);
      const cov = b.geometry.getAttribute('aCover');
      const gd = b.geometry.getAttribute('aGround');
      const V = TERRAIN_N + 1;
      for (let k = 0; k < V * V; k++) {
        const x = b.wx + (k % V) * 8;
        const z = b.wz + Math.floor(k / V) * 8;
        const amount = cov.getY(k);
        expect(amount).toBeGreaterThanOrEqual(0);
        expect(amount).toBeLessThanOrEqual(c.flowers + 1e-6);
        if (amount > 0) {
          rows++;
          expect(cov.getX(k)).toBeCloseTo(rowCoord(fields.seed, x, z), 2);
          // (never under closed wood, never on the road)
          expect(gd.getZ(k)).toBeLessThan(1);
          fields.shape(x, z, tp);
          expect(Math.abs(tp.d)).toBeGreaterThanOrEqual(7.5);
        }
      }
      b.geometry.dispose();
    }
    expect(rows).toBeGreaterThan(800);
    // the terraces: on a terraced stretch, rows that keep to the benches (written negative)
    const terr = world2('terraces');
    const s = terracedAt(terr);
    expect(s).toBe(s);
    let onBenches = 0;
    for (const off of [120, -120]) {
      const [ix, iz] = leafAt(terr, s, off);
      const b = buildTerrain(terr, 3, ix, iz);
      const cov = b.geometry.getAttribute('aCover');
      for (let k = 0; k < cov.count; k++) if (cov.getY(k) < 0) onBenches++;
      b.geometry.dispose();
    }
    expect(onBenches).toBeGreaterThan(50);
    // the road's own strip carries them too
    const strip = buildStrip(fields, Math.floor(3000 / (32 * fields.spine.ds)), 0);
    const sc = strip.geometry.getAttribute('aCover');
    let stripRows = 0;
    for (let k = 0; k < sc.count; k++) if (sc.getY(k) > 0) stripRows++;
    expect(stripRows).toBeGreaterThan(20);
    strip.geometry.dispose();
  });

  it('lifts the far land under its woods, and stands its far-woods cards where the canopy is thick', () => {
    const w = world2('forest');
    const tp = new TerrainPoint();
    const [x, z] = beside(w, 3000, 900);
    const size = TERRAIN_ROOT / 2;
    const leaf = buildTerrain(w, 1, Math.floor(x / size), Math.floor(z / size));
    const pos = leaf.geometry.getAttribute('position');
    const gd = leaf.geometry.getAttribute('aGround');
    const V = TERRAIN_N + 1;
    let lifted = 0;
    for (let k = 0; k < V * V; k++) {
      const px = leaf.wx + pos.getX(k);
      const pz = leaf.wz + pos.getZ(k);
      w.shape(px, pz, tp);
      const over = pos.getY(k) + leaf.wy - tp.bed;
      if (gd.getZ(k) > 0.5 && tp.wl <= tp.bed - 1 && Math.abs(tp.d) > 60) {
        expect(over).toBeGreaterThan(3);
        expect(over).toBeLessThan(14);
        lifted++;
      }
      if (gd.getZ(k) === 0 && Math.abs(tp.d) > 60) expect(Math.abs(over)).toBeLessThan(1e-3);
    }
    expect(lifted).toBeGreaterThan(200);
    leaf.geometry.dispose();
    const cards = buildFarWoods(w, Math.floor(x / WOODS_TILE), Math.floor(z / WOODS_TILE))!;
    expect(cards.count).toBeGreaterThan(300);
    let nearRoad = 0;
    for (let i = 0; i < cards.count; i++) {
      const cx = cards.wx + cards.roots[i * 4];
      const cz = cards.wz + cards.roots[i * 4 + 2];
      w.shape(cx, cz, tp, true);
      expect(Math.abs(tp.d)).toBeGreaterThanOrEqual(60);
      expect(canopyOf(w, tp, cx, cz)).toBeGreaterThanOrEqual(0.3);
      if (Math.abs(tp.d) < 430) nearRoad++;
    }
    // (in a world of version 2 the woods beside the road are carded too, not only the far belt)
    expect(nearRoad).toBeGreaterThan(0);
  });

  it('leaves a world of version 1 without any of it', () => {
    const w = new World(7);
    const b = buildTerrain(w, 3, 12, 0);
    expect(b.geometry.getAttribute('aCover')).toBeUndefined();
    b.geometry.dispose();
    const strip = buildStrip(w, 40, 0);
    expect(strip.geometry.getAttribute('aCover')).toBeUndefined();
    strip.geometry.dispose();
    const g = buildGrass(w, Math.floor(2600 / GRASS_TILE), 0, 1, true);
    if (g) for (let i = 0; i < g.flowers; i++) expect([0, 1, 2]).toContain(g.flowerInfo[i * 4]);
  });
});

describe('the grass of a world of version 2', () => {
  it('draws the surveyed flower in the field rows during its flowering months', () => {
    const w = world2('flower_fields');
    const field = groundField(w);
    const flower = groundProfile('flower_fields')!.bands[0].flowers[0];
    const cover = new Cover();
    let count = 0;
    expect(flower.bloomMonths).toContain(9);
    for (let s = 1000; s < 6300; s += 250) {
      const [x,z] = beside(w,s,75);
      for (const c of field.tile(Math.floor(x/128),Math.floor(z/128),false)) {
        if (c.name !== flower.name) continue;
        expect(w.flora!.cover(c.x,c.z,cover,c.y).flowers).toBeGreaterThan(0);
        expect(flower.colors.map(color=>pigments[color])).toContain(c.accent);
        count++;
      }
    }
    expect(count).toBeGreaterThan(10);
  });

  it('grows thin under closed wood and thick in the open, tall in the marsh, hardly at all on red rock', () => {
    const tufts = (id: string, s: number, off: number): { count: number; size: number } => {
      const w = world2(id);
      const [x, z] = beside(w, s, off);
      const g = buildGrass(w, Math.floor(x / GRASS_TILE), Math.floor(z / GRASS_TILE), 1, true);
      if (!g) return { count: 0, size: 0 };
      let size = 0;
      for (let i = 0; i < g.count; i++) size += g.roots[i * 4 + 3];
      return { count: g.count, size: size / Math.max(1, g.count) };
    };
    const plains = tufts('plains', 2600, 80);
    const marsh = tufts('wetland', 2600, 80);
    const canyon = tufts('red_canyon', 2600, 80);
    expect(plains.count).toBeGreaterThan(5000);
    expect(marsh.count).toBeGreaterThan(5000);
    expect(marsh.size).toBeGreaterThan(plains.size * 1.1);
    expect(canyon.count).toBeLessThan(plains.count * 0.2);
  });
});
