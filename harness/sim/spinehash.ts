// prints the road hash for (seed, chapterScale, startBiome, stations): used to compare Node with the browser
import { RoadSpine } from '../../src/core/world/spine';

const [seed, chapter, biome, n] = process.argv.slice(2);
const sp = new RoadSpine(Number(seed), { chapterScale: Number(chapter), startBiome: biome });
console.log(sp.hash(Number(n)));
