// Times the world builders in Node (no GPU): the worst single build of each kind along a stretch of road.
//   npx tsx harness/sim/buildtime.ts [seed] [km]
// The streaming gate (specs/render/world.json, stream_max_build_ms) is measured in the browser;
// this is the quick way to see which builder is the slow one.
import { World } from '../../src/core/world/terrain';
import { SpineSample } from '../../src/core/world/spine';
import { GRASS_TILE, TERRAIN_ROOT, TILE, buildGrass, buildScatter, buildStrip, buildTerrain } from '../../src/game/scene/worldBuild';

const seed = Number(process.argv[2] ?? 7);
const km = Number(process.argv[3] ?? 30);
const world = new World(seed);
const st = new SpineSample();
const worst: Record<string, number> = {};
const count: Record<string, number> = {};
const time = (kind: string, f: () => unknown): void => {
  const t0 = performance.now();
  f();
  const ms = performance.now() - t0;
  worst[kind] = Math.max(worst[kind] ?? 0, ms);
  count[kind] = (count[kind] ?? 0) + 1;
};
// warm up the JIT
world.spine.ensure(km * 1000 + 5000);
for (let i = 0; i < 3; i++) buildGrass(world, i, 0, 1, true);
for (let s = 500; s < km * 1000; s += 1500) {
  world.spine.at(s, st);
  const gx = Math.floor((st.x + 20) / GRASS_TILE);
  const gz = Math.floor((st.z + 20) / GRASS_TILE);
  time('grass near', () => buildGrass(world, gx, gz, 1, true));
  time('grass far', () => buildGrass(world, gx + 1, gz, 1, false));
  time('scatter near', () => buildScatter(world, Math.floor(st.x / TILE), Math.floor((st.z + 60) / TILE), false, false));
  time('scatter far', () => buildScatter(world, Math.floor(st.x / TILE), Math.floor((st.z + 400) / TILE), true, false));
  time('strip lod0', () => buildStrip(world, Math.floor(s / (32 * world.spine.ds)), 0));
  for (const level of [-2, -1, 0, 2, 4]) {
    const size = TERRAIN_ROOT / Math.pow(2, level);
    time(`terrain L${level}`, () => buildTerrain(world, level, Math.floor(st.x / size), Math.floor((st.z + 3000) / size)));
  }
}
for (const k of Object.keys(worst)) console.log(`${k.padEnd(14)} worst ${worst[k].toFixed(2)} ms  (${count[k]} builds)`);
