/**
 * The meadow of a world of version 2 (src/game/scene/meadow.ts): its map holds the land's 2 m samples round the
 * vehicle in texels that wrap round, each the sample a grass tile reads (worldBuild.ts meadowSample), the nearest
 * taken first, those gone out of the square forgotten until their new ones are in; its rings of blades fit the
 * render origin's steps and hand the grass on from one to the next. A grass tile asked for its flowers alone gives
 * the same flowers.
 */
import { describe, expect, it } from 'vitest';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { MEADOW_MAP, MEADOW_SCALE } from '../../src/game/render/meadowMaterial';
import { MEADOW_REACH, MeadowMap, RINGS } from '../../src/game/scene/meadow';
import { GRASS_TILE, MeadowSample, buildGrass, meadowSample } from '../../src/game/scene/worldBuild';

const N = MEADOW_MAP.n;
const SP = MEADOW_MAP.spacing;
const mod = (a: number, n: number): number => ((a % n) + n) % n;
const byte = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

function world(seed: number, startBiome: string): World {
  return new World(seed, { worldVersion: 2, startBiome, chapterScale: 6 });
}

/** a point by the road of world w, d metres to its left, s metres along */
function byRoad(w: World, s: number, d: number): [number, number] {
  const p = new SpineSample();
  w.spine.at(s, p);
  return [p.x - Math.sin(p.phi) * d, p.z + Math.cos(p.phi) * d];
}

/** every texel of the square holds the sample of its own column and row, as meadowSample has it */
function expectHeld(m: MeadowMap, w: World, every = 1): void {
  const s = new MeadowSample();
  for (let v = 0; v < N; v += every) {
    for (let u = 0; u < N; u += every) {
      const i = m.i0 + u;
      const j = m.j0 + v;
      expect(m.holds(i, j)).toBe(true);
      const t = mod(j, N) * N + mod(i, N);
      meadowSample(w, i * SP, j * SP, s);
      expect(m.a[t * 2]).toBe(Math.fround(s.y));
      expect(m.a[t * 2 + 1]).toBe(Math.fround(s.pair + 0.98 * s.share + (s.bare > 0 ? 16 : 0)));
      expect([m.b[t * 4], m.b[t * 4 + 1], m.b[t * 4 + 2], m.b[t * 4 + 3]]).toEqual([byte(s.ad / MEADOW_SCALE.ad), byte(s.grow / MEADOW_SCALE.grow), byte(s.tall / MEADOW_SCALE.tall), byte(s.mow)]);
      expect([m.c[t * 4], m.c[t * 4 + 1], m.c[t * 4 + 2]]).toEqual([byte(s.shore / MEADOW_SCALE.shore), byte(s.lush), byte(s.canopy)]);
    }
  }
}

describe('the meadow\'s map', () => {
  it('holds the square of samples round a point, each as a grass tile reads it', () => {
    const w = world(7, 'plains');
    const m = new MeadowMap(w);
    const [x, z] = byRoad(w, 44750, 20);
    m.follow(x, z);
    expect(m.pending).toBe(N * N);
    m.fill(Infinity);
    expect(m.pending).toBe(0);
    // (the point is the square's middle sample)
    expect(m.i0 + N / 2).toBe(Math.floor(x / SP));
    expect(m.j0 + N / 2).toBe(Math.floor(z / SP));
    expectHeld(m, w, 7);
    // a meadow by the road: grass grows in most of it, the road itself is in it
    let grows = 0;
    let road = 0;
    for (let t = 0; t < N * N; t++) {
      if (m.b[t * 4 + 1] > 40 && m.a[t * 2 + 1] < 16) grows++;
      if (m.b[t * 4] < byte(4 / MEADOW_SCALE.ad)) road++;
    }
    expect(grows / (N * N)).toBeGreaterThan(0.5);
    expect(road).toBeGreaterThan(N);
  });

  it('takes only the samples newly come into the square as it moves, and forgets the ones gone out of it until then', () => {
    const w = world(7, 'plains');
    const m = new MeadowMap(w);
    const [x, z] = byRoad(w, 44750, 0);
    m.follow(x, z);
    m.fill(Infinity);
    // five samples on along x, three back along z
    m.follow(x + 5 * SP, z - 3 * SP);
    expect(m.pending).toBe(5 * N + 3 * N - 5 * 3);
    // (a texel that does not hold its sample yet says bare: no blade grows from it)
    let bareNew = 0;
    for (let v = 0; v < N; v++) {
      for (let u = 0; u < N; u++) {
        const i = m.i0 + u;
        const j = m.j0 + v;
        if (!m.holds(i, j)) {
          expect(m.a[(mod(j, N) * N + mod(i, N)) * 2 + 1]).toBeGreaterThanOrEqual(16);
          bareNew++;
        }
      }
    }
    expect(bareNew).toBe(m.pending);
    m.fill(Infinity);
    expect(m.pending).toBe(0);
    expectHeld(m, w, 5);
    // and a jump: all of it again
    const [x2, z2] = byRoad(w, 52000, -30);
    m.follow(x2, z2);
    expect(m.pending).toBe(N * N);
    m.fill(Infinity);
    expectHeld(m, w, 11);
  });

  it('takes the nearest samples first', () => {
    const w = world(7, 'forest');
    const m = new MeadowMap(w);
    const [x, z] = byRoad(w, 30000, 10);
    m.follow(x, z);
    // (a budget that runs out at once: the first sixteen samples, the middle and the squares round it)
    m.fill(0);
    const c = N / 2;
    expect(m.holds(m.i0 + c, m.j0 + c)).toBe(true);
    expect(m.holds(m.i0 + c + 1, m.j0 + c + 1)).toBe(true);
    expect(m.holds(m.i0, m.j0)).toBe(false);
    expect(m.pending).toBe(N * N - 16);
    // carried on, the rest
    m.fill(Infinity);
    expect(m.pending).toBe(0);
  });
});

describe('the meadow\'s rings', () => {
  it('count their cells from the render origin: each cell and tile a whole part of the 256 m it moves by', () => {
    for (const r of RINGS) {
      const perStep = 256 / r.cell;
      expect(Math.abs(perStep - Math.round(perStep))).toBeLessThan(1e-9);
      const perTile = r.tile / r.cell;
      expect(Math.abs(perTile - Math.round(perTile))).toBeLessThan(1e-9);
    }
  });

  it('hand the grass on from one to the next, each covering its own fade, the last reaching the meadow\'s end', () => {
    for (let k = 0; k < RINGS.length; k++) {
      const r = RINGS[k];
      // (a ring's square round the eye, less a tile the eye may be into its middle tile, holds its fade)
      expect(((r.tiles - 1) * r.tile) / 2).toBeGreaterThanOrEqual(r.fade[3]);
      if (k > 0) {
        expect(r.fade[0]).toBe(RINGS[k - 1].fade[2]);
        expect(r.fade[1]).toBe(RINGS[k - 1].fade[3]);
      }
    }
    expect(RINGS[RINGS.length - 1].fade[3]).toBe(MEADOW_REACH);
    // the map reaches past the meadow's end, with room for the vehicle to be a few samples off its middle
    expect((N / 2 - 2) * SP).toBeGreaterThan(MEADOW_REACH + 16);
  });
});

describe('a grass tile asked for its flowers alone', () => {
  it('gives the same flowers and no tufts', () => {
    const w = world(7, 'flower_fields');
    for (const s of [30000, 61000, 90000]) {
      const [x, z] = byRoad(w, s, 25);
      const gx = Math.floor(x / GRASS_TILE);
      const gz = Math.floor(z / GRASS_TILE);
      const full = buildGrass(w, gx, gz, 1, true);
      const only = buildGrass(w, gx, gz, 1, true, true);
      if (!full || full.flowers === 0) {
        expect(only === null || only.flowers === 0).toBe(true);
        continue;
      }
      expect(only).not.toBeNull();
      expect(only!.count).toBe(0);
      expect(only!.flowers).toBe(full.flowers);
      expect(Array.from(only!.flowerRoots)).toEqual(Array.from(full.flowerRoots));
      expect(Array.from(only!.flowerInfo)).toEqual(Array.from(full.flowerInfo));
    }
  });
});
