// prints which biome the road is in along its length: npx tsx harness/sim/biomemap.ts <seed> <chapter> [km]
import { BIOMES } from '../../src/core/world/biomes';
import { RoadSpine } from '../../src/core/world/spine';

const [seed, chapter, km] = process.argv.slice(2);
const sp = new RoadSpine(Number(seed ?? 20261113), { chapterScale: Number(chapter ?? 1) });
const out = { a: 0, b: 0, t: 0 };
let last = '';
const end = Number(km ?? 40) * 1000;
sp.ensure(end + 100);
for (let s = 0; s <= end; s += 50) {
  sp.biomeAt(s, out as never);
  const id = out.t < 0.02 ? BIOMES[out.a].id : out.t > 0.98 ? BIOMES[out.b].id : `${BIOMES[out.a].id}→${BIOMES[out.b].id}`;
  if (id !== last) {
    console.log(`${s.toString().padStart(6)} m  ${id}`);
    last = id;
  }
}
