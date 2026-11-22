// G8 (docs/V3/nodes/G-ghibli.md): the great forms — a salt pan levelled to one plane under a hand of water, a caldera
// round its lake with the road along its inner wall, a karst's pits — shaped in the land function itself, the road's
// corridor left as it was; and the director that goes to see them in turn and keeps neighbours unlike.
import { describe, expect, it } from 'vitest';
import { EarthJourney, SCENE_LENGTH } from '../../src/core/earth/director';
import { SpineSample } from '../../src/core/world/spine';
import { ROAD_HALF, TerrainPoint, type World } from '../../src/core/world/terrain';
import { PAN_FILM, WATER_FILM, type Caldera, type Pan, type Pit, type Wonder } from '../../src/core/world/earth/wonders';
import type { EarthPiece } from '../../src/core/world/earth/road';
import { modcarWorld } from '../../src/game/modcar/seamless';

/** the first place among some worlds' first forty that holds a great form of a kind */
function find(kind: Wonder['kind']): { world: World; piece: EarthPiece; wonders: readonly Wonder[] } {
  for (let seed = 1; seed <= 40; seed++) {
    const { world } = modcarWorld(seed, { worldVersion: 5 });
    const earth = world.earth!;
    earth.chapter(41);
    for (let c = 1; c <= 40; c++) {
      const piece = earth.pieces[c];
      const wonders = world.wonders!.of(piece);
      if (wonders.some((w) => w.kind === kind)) return { world, piece, wonders };
    }
  }
  throw new Error(`no ${kind} among the worlds tried`);
}

const tp = new TerrainPoint();
const st = new SpineSample();

/** the road is the road: on its centre line and its edges the land is the road's own plane, with or without the great forms */
function roadKept(world: World, piece: EarthPiece): void {
  const keep = world.wonders;
  for (let s = piece.start + 50; s < piece.end - 50; s += 97) {
    world.spine.at(s, st);
    for (const d of [0, ROAD_HALF * 0.8, -ROAD_HALF * 0.8]) {
      const x = st.x - Math.sin(st.phi) * d;
      const z = st.z + Math.cos(st.phi) * d;
      world.shape(x, z, tp);
      const h = tp.h;
      expect(tp.zone, `s ${s}`).toBe(1);
      (world as unknown as { wonders: unknown }).wonders = null;
      world.shape(x, z, tp);
      (world as unknown as { wonders: unknown }).wonders = keep;
      expect(h, `s ${s} d ${d}`).toBe(tp.h);
      expect(tp.wl > h, `water on the road at s ${s}`).toBe(false);
    }
  }
}

/** no step in the land along a line: never more than `most` m of height in a metre */
function smooth(world: World, x0: number, z0: number, x1: number, z1: number, most: number): void {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
  let last = NaN;
  for (let i = 0; i <= n; i++) {
    world.shape(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, tp);
    if (i > 0) expect(Math.abs(tp.bed - last), `at ${i} of ${n}`).toBeLessThan(most);
    last = tp.bed;
  }
}

describe('G8: the great forms in the land', () => {
  it('a salt flat is one plane under a hand of water, its road a level causeway across it', () => {
    const { world, piece, wonders } = find('pan');
    const pan = wonders[0] as Pan;
    expect(piece.scene!.road!.id).toBe('causeway');
    expect(pan.s1 - pan.s0).toBeGreaterThan(2500);
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = pan.s0; s <= pan.s1; s += 50) {
      world.spine.at(s, st);
      lo = Math.min(lo, st.y);
      hi = Math.max(hi, st.y);
    }
    expect(hi - lo).toBeLessThan(3.3);
    expect(lo - pan.level).toBeGreaterThan(0.45);
    expect(lo - pan.level).toBeLessThan(1.3);
    // the plane, either side, from the causeway's foot to two kilometres out
    for (let s = pan.s0 + 100; s < pan.s1 - 100; s += 430) {
      world.spine.at(s, st);
      for (const lat of [-2000, -900, -200, -40, -14, 14, 40, 200, 900, 2000]) {
        // (across the road by the road point of the same x, as the land itself measures it)
        world.shape(st.x, st.z + lat / Math.cos(st.phi), tp);
        expect(tp.bed, `s ${s} lat ${lat}`).toBeCloseTo(pan.level, 6);
        expect(tp.wkind).toBe(WATER_FILM);
        expect(tp.wl - tp.bed).toBeCloseTo(PAN_FILM, 6);
        expect(tp.pan).toBeGreaterThan(0.99);
      }
    }
    roadKept(world, piece);
    world.spine.at((pan.s0 + pan.s1) / 2, st);
    smooth(world, st.x, st.z - 3600, st.x, st.z + 3600, 2.6);
  });

  it('a crater lake lies in a ring of rock far under its road, the road inside the rim along its wall', () => {
    const { world, piece, wonders } = find('caldera');
    const c = wonders[0] as Caldera;
    expect(piece.scene!.road!.id).toBe('crater_road');
    expect(c.road - c.lake).toBeGreaterThanOrEqual(120);
    expect(c.crest - c.road).toBeGreaterThanOrEqual(42);
    expect(c.sB - c.sA).toBeGreaterThanOrEqual(1300);
    // the road between the two cuts is inside the rim, the lake's side falling from it to the water
    let wet = 0;
    let n = 0;
    for (let s = c.sA + 150; s < c.sB - 150; s += 120) {
      world.spine.at(s, st);
      expect(Math.hypot(st.x - c.cx, st.z - c.cz)).toBeLessThan(c.r0);
      const lat = c.side * c.wallR * 1.3;
      world.shape(st.x - Math.sin(st.phi) * lat, st.z + Math.cos(st.phi) * lat, tp);
      n++;
      if (tp.wkind === 1 && tp.wl === c.lake && tp.bed < c.lake) wet++;
      // (and on the other hand the rim's shoulder, over the road)
      world.shape(st.x + Math.sin(st.phi) * c.side * c.shoulder * 1.5, st.z - Math.cos(st.phi) * c.side * c.shoulder * 1.5, tp);
      expect(tp.bed, `the shoulder at s ${s}`).toBeGreaterThan(st.y + 8);
    }
    expect(wet / n).toBeGreaterThan(0.8);
    // the middle of the lake: deep water (or the cone's island)
    world.shape(c.cx, c.cz, tp);
    expect(tp.wl).toBe(c.lake);
    if (!c.cone) expect(c.lake - tp.bed).toBeGreaterThan(40);
    // the rim stands over the road somewhere all round it
    let high = 0;
    for (let a = 0; a < 24; a++) {
      const an = (a / 24) * Math.PI * 2;
      world.shape(c.cx + Math.cos(an) * c.r0, c.cz + Math.sin(an) * c.r0, tp);
      if (tp.bed > c.road + 20) high++;
    }
    expect(high).toBeGreaterThanOrEqual(16);
    roadKept(world, piece);
    smooth(world, c.cx - c.r0 - 500, c.cz, c.cx + c.r0 + 500, c.cz, 3.4);
    smooth(world, c.cx, c.cz - c.r0 - 500, c.cx, c.cz + c.r0 + 500, 3.4);
  });

  it('a karst has its great pits, the first at the road\'s edge', () => {
    const { world, piece, wonders } = find('pit');
    const pits = wonders as readonly Pit[];
    expect(pits.length).toBeGreaterThanOrEqual(2);
    expect(piece.scene!.road!.id).toBe('pit_road');
    let near = Infinity;
    for (const p of pits) {
      // its floor far under its lip
      world.shape(p.x, p.z, tp);
      const floor = tp.bed;
      world.shape(p.x + p.ca * (p.r * p.stretch * 1.25 + 80), p.z + p.sa * (p.r * p.stretch * 1.25 + 80), tp);
      expect(tp.bed - floor, 'its depth').toBeGreaterThan(p.depth * 0.6);
      expect(tp.wl > floor, 'no water in it').toBe(false);
      world.spine.at(p.s, st);
      near = Math.min(near, Math.hypot(st.x - p.x, st.z - p.z) - p.r);
      smooth(world, p.x - p.ca * (p.r * p.stretch + 120), p.z - p.sa * (p.r * p.stretch + 120), p.x + p.ca * (p.r * p.stretch + 120), p.z + p.sa * (p.r * p.stretch + 120), 3.6);
    }
    expect(near).toBeLessThan(90);
    roadKept(world, piece);
  });

  it('is the same land whoever asks first', () => {
    const { world, piece, wonders } = find('caldera');
    const c = wonders[0] as Caldera;
    const pts: [number, number][] = [];
    for (let i = 0; i < 60; i++) pts.push([c.cx + Math.cos(i * 2.4) * i * 30, c.cz + Math.sin(i * 2.4) * i * 30]);
    const a = pts.map(([x, z]) => (world.shape(x, z, tp), tp.bed));
    const { world: again } = modcarWorld(world.seed, { worldVersion: 5 });
    const b = [...pts].reverse().map(([x, z]) => (again.shape(x, z, tp), tp.bed)).reverse();
    expect(b).toEqual(a);
    expect(again.wonders!.of(again.earth!.pieces[piece.index])).toEqual(wonders);
  });
});

describe('G8: the director and the great forms', () => {
  it('goes to see each of them in turn, and no landform twice running but seldom', () => {
    const count: Record<string, number> = { salt_flat: 0, crater_lake: 0, sinkholes: 0 };
    let twice = 0;
    let all = 0;
    for (const seed of [3, 7, 11, 99, 2026, 4242, 31337, 8, 77, 500, 1234, 65535]) {
      const j = new EarthJourney(seed, { drama: true });
      j.sceneAt(79 * SCENE_LENGTH + 1);
      const sc = j.scenes.slice(0, 80);
      const last: Record<string, number> = {};
      sc.forEach((s, k) => {
        const id = s.look.landform.id;
        if (id in count) {
          count[id]++;
          // (never the same great form again within an hour's road)
          if (last[id] !== undefined) expect(k - last[id], `seed ${seed}: ${id} at ${last[id]} and ${k}`).toBeGreaterThanOrEqual(12);
          last[id] = k;
        }
        if (k > 0) {
          all++;
          if (sc[k - 1].look.landform.id === id) twice++;
        }
      });
      // (a journey of eighty places meets at least four great forms)
      expect(Object.keys(last).length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
    for (const id of Object.keys(count)) expect(count[id], id).toBeGreaterThanOrEqual(12);
    expect(twice / all).toBeLessThan(0.07);
  });
});
