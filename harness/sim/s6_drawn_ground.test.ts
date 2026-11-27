// The ground as it is drawn (docs/V3/plan/finish.md §十九 step 6, scene/worldBuild.ts drawnHeight): what a thing lying
// about rests on is the surface the road strip and the terrain leaves show — the same points, straight between them as
// their triangles are, the higher of the two where both are — not the land the wheels go by, which differs from it by a
// few centimetres on a meadow (a cassette sank into it, a page floated over it).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import { World } from '../../src/core/world/terrain';
import type { WorldVersion } from '../../src/core/world/rules';
import { SpineSample } from '../../src/core/world/spine';
import { buildStrip, buildTerrain, drawnHeight, TERRAIN_MAX_LEVEL, TERRAIN_ROOT, type Built } from '../../src/game/scene/worldBuild';

/** the highest of a built mesh's triangles straight under (x, z) (world), null: none there */
function under(b: Built, x: number, z: number): number | null {
  const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
  const idx = b.geometry.getIndex()!;
  const px = x - b.wx;
  const pz = z - b.wz;
  let best: number | null = null;
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t);
    const i1 = idx.getX(t + 1);
    const i2 = idx.getX(t + 2);
    const ax = pos.getX(i0);
    const az = pos.getZ(i0);
    const ux = pos.getX(i1) - ax;
    const uz = pos.getZ(i1) - az;
    const vx = pos.getX(i2) - ax;
    const vz = pos.getZ(i2) - az;
    const det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-7) continue;
    const wx = px - ax;
    const wz = pz - az;
    const a = (wx * vz - wz * vx) / det;
    const c = (ux * wz - uz * wx) / det;
    if (a < -1e-6 || c < -1e-6 || a + c > 1 + 1e-6) continue;
    const y = pos.getY(i0) + (pos.getY(i1) - pos.getY(i0)) * a + (pos.getY(i2) - pos.getY(i0)) * c + b.wy;
    if (best === null || y > best) best = y;
  }
  return best;
}

const LEAF = TERRAIN_ROOT / Math.pow(2, TERRAIN_MAX_LEVEL);

function check(version: WorldVersion, seed: number, chunk: number): number {
  const world = new World(seed, { worldVersion: version });
  const strip = buildStrip(world, chunk, 0);
  const leaves = new Map<string, Built>();
  const leafOf = (x: number, z: number): Built => {
    const ix = Math.floor(x / LEAF);
    const iz = Math.floor(z / LEAF);
    const key = `${ix}/${iz}`;
    let b = leaves.get(key);
    if (!b) leaves.set(key, (b = buildTerrain(world, TERRAIN_MAX_LEVEL, ix, iz)));
    return b;
  };
  const st = new SpineSample();
  const ds = world.spine.ds;
  let worst = 0;
  let n = 0;
  // points over the chunk: on the road, the verge, the meadow, out past the strip's skirts
  for (let k = 0; k < 160; k++) {
    const s = (chunk * 32 + 1 + ((k * 7.31) % 30)) * ds;
    const d = ((k * 13.7) % 120) - 60;
    world.spine.at(s, st);
    const x = st.x - Math.sin(st.phi) * d;
    const z = st.z + Math.cos(st.phi) * d;
    const leaf = under(leafOf(x, z), x, z);
    const onStrip = under(strip, x, z);
    expect(leaf).not.toBeNull();
    const seen = onStrip === null || onStrip < leaf! ? leaf! : onStrip;
    const got = drawnHeight(world, x, z);
    worst = Math.max(worst, Math.abs(got - seen));
    n++;
  }
  expect(n).toBe(160);
  return worst;
}

describe('the ground as drawn', () => {
  it('is the strip and the terrain leaf as built, wherever one stands near the road (a world of version 5)', () => {
    expect(check(5, 7, 3)).toBeLessThan(2e-3);
  });

  it('is so in a world of the newest version, and in the first', () => {
    expect(check(7, 2026, 5)).toBeLessThan(2e-3);
    expect(check(1, 11, 2)).toBeLessThan(2e-3);
  });

  it('is the land itself where no strip is (far from the road, its leaf only)', () => {
    const world = new World(7, { worldVersion: 5 });
    const st = new SpineSample();
    world.spine.at(400, st);
    for (const d of [70, 120, 300]) {
      const x = st.x - Math.sin(st.phi) * d + 3.3;
      const z = st.z + Math.cos(st.phi) * d + 1.7;
      const b = buildTerrain(world, TERRAIN_MAX_LEVEL, Math.floor(x / LEAF), Math.floor(z / LEAF));
      expect(Math.abs(drawnHeight(world, x, z) - under(b, x, z)!)).toBeLessThan(2e-3);
    }
  });
});
