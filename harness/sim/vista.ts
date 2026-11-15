/**
 * What the land looks like from the road, measured without drawing it: for points along the road,
 * the skyline (highest elevation angle per azimuth) in three bands of distance — near hills,
 * middle ranges, far mountains. From those: how often a view opens to one side, how often the
 * road is shut in on both, how many layers of distance show at once, and how jagged the skyline
 * is (designed mountains are smooth at this scale; noise needles are not).
 */
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { LAND_SLOT, type LandKind } from '../../src/core/world/landform';
import { BiomeBlend, SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const FULL = process.env.FULL === '1';
const DEG = 180 / Math.PI;
/** distance bands (m) and the step along a ray inside each */
const BANDS: [number, number, number][] = [
  [120, 1500, 30],
  [1500, 6000, 110],
  [6000, 19000, 420],
];
/** azimuth step (deg) */
const AZ = 3;

export interface Skyline {
  /** per band: elevation angle (deg) for each azimuth, starting straight ahead and turning right */
  bands: Float32Array[];
}

export function skylineAt(world: World, s: number, out?: Skyline): Skyline {
  const n = Math.round(360 / AZ);
  const sky = out ?? { bands: BANDS.map(() => new Float32Array(n)) };
  const st = new SpineSample();
  const tp = new TerrainPoint();
  world.spine.at(s, st);
  const eye = st.y + 1.5;
  for (let i = 0; i < n; i++) {
    const az = st.phi + (i * AZ) / DEG;
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    for (let b = 0; b < BANDS.length; b++) {
      const [r0, r1, step] = BANDS[b];
      let best = -90;
      for (let r = r0; r < r1; r += step) {
        world.shape(st.x + cx * r, st.z + cz * r, tp, r >= 6000);
        const e = Math.atan2(tp.bed - eye, r) * DEG;
        if (e > best) best = e;
      }
      sky.bands[b][i] = best;
    }
  }
  return sky;
}

/** spikes on the far skyline at one-degree steps (see collectVistaMetrics) */
function farNeedles(world: World, s: number): number {
  const st = new SpineSample();
  const tp = new TerrainPoint();
  world.spine.at(s, st);
  const eye = st.y + 1.5;
  const e = new Float32Array(360);
  for (let i = 0; i < 360; i++) {
    const az = st.phi + i / DEG;
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    let best = -90;
    for (let r = 6000; r < 19000; r += 260) {
      world.shape(st.x + cx * r, st.z + cz * r, tp, true);
      const a = Math.atan2(tp.bed - eye, r) * DEG;
      if (a > best) best = a;
    }
    e[i] = best;
  }
  let n = 0;
  for (let i = 0; i < 360; i++) {
    const a = e[(i + 359) % 360];
    const c = e[(i + 1) % 360];
    if (e[i] > 1 && e[i] - a > 0.5 && e[i] - c > 0.5) n++;
  }
  return n;
}

function median(a: number[]): number {
  const s = a.slice().sort((p, q) => p - q);
  return s[s.length >> 1];
}

export function collectVistaMetrics(): Metrics {
  const seeds = FULL ? 8 : 3;
  const n = Math.round(360 / AZ);
  const bl = new BiomeBlend();
  let points = 0;
  let open = 0;
  let shut = 0;
  let layers = 0;
  let needles = 0;
  let roughN = 0;
  let maxFar = 0;
  const kinds = new Set<string>();
  const kindsByBiome: Record<string, Set<LandKind>> = {};
  const sky: Skyline = { bands: BANDS.map(() => new Float32Array(n)) };
  for (const biome of ['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple']) {
    for (let seed = 1; seed <= seeds; seed++) {
      const world = new World(seed * 17 + 3, { chapterScale: 1, startBiome: biome });
      // the first chapter only: the biome asked for
      const len = Math.min(world.spine.plan.starts[1] - 600, 14000);
      for (let s = 700; s < len; s += 900) {
        world.spine.biomeAt(s, bl);
        const id = BIOMES[bl.a].id;
        const kind = world.land.kindOf(Math.floor(s / LAND_SLOT));
        (kindsByBiome[id] ??= new Set()).add(kind);
        kinds.add(`${id}:${kind}`);
        skylineAt(world, s, sky);
        points++;
        // each side: the 100° of view centred square to the road
        const side = (centreDeg: number, band: number): number[] => {
          const v: number[] = [];
          for (let a = centreDeg - 50; a <= centreDeg + 50; a += AZ) v.push(sky.bands[band][((Math.round(a / AZ) % n) + n) % n]);
          return v;
        };
        const right = median(side(90, 0));
        const left = median(side(270, 0));
        if (right < 2 || left < 2) open++;
        if (right > 6 && left > 6) shut++;
        // layers: looking round, in how many bands does something stand clear of everything nearer?
        let shows = 1;
        for (let b = 1; b < BANDS.length; b++) {
          let clear = 0;
          for (let i = 0; i < n; i++) {
            let nearer = -90;
            for (let q = 0; q < b; q++) if (sky.bands[q][i] > nearer) nearer = sky.bands[q][i];
            if (sky.bands[b][i] > nearer + 0.4) clear++;
          }
          if (clear > n * 0.12) shows++;
        }
        layers += shows;
        for (let i = 0; i < n; i++) if (sky.bands[2][i] > maxFar) maxFar = sky.bands[2][i];
        // needles: on the far skyline, degree by degree, a point that stands more than half a degree
        // above both its neighbours is a spike under 350 m wide at ten kilometres — noise, not a mountain
        needles += farNeedles(world, s);
        roughN++;
      }
    }
  }
  let fewest = 99;
  for (const id of Object.keys(kindsByBiome)) fewest = Math.min(fewest, kindsByBiome[id].size);
  void BIOME_INDEX;
  return {
    vista_points: points,
    vista_open_share: open / points,
    vista_shut_share: shut / points,
    vista_layers_mean: layers / points,
    vista_far_needles_per_view: roughN ? needles / roughN : 0,
    vista_far_max_elev_deg: maxFar,
    vista_land_kinds: kinds.size,
    vista_land_kinds_min_per_biome: fewest,
  };
}

// npx tsx harness/sim/vista.ts print: print the numbers
if (process.argv[2] === 'print') {
  const t0 = Date.now();
  console.log(collectVistaMetrics(), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
