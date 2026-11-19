import { BIOMES, minRadius } from '../../src/core/world/biomes';
import { BiomeBlend, SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

/** Sample actual road geometry every 50 m. Left/right curves and climbs/descents are distinct. */
export function regionJourney(seed: number) {
  const w = new World(seed, { worldVersion: 2 });
  const { spine } = w;
  spine.ensure(300000);
  const { starts, biomes } = spine.plan;
  const regions = biomes.map((b, i) => ({ id: BIOMES[b].id, start: starts[i], end: starts[i + 1] })).filter(r => r.start < 300000);
  const st = new SpineSample();
  const changes = { curve: 0, grade: 0, verge: 0, enclosure: 0 };
  let last: typeof changes | undefined;
  let maxGrade = 0;
  const gaps: number[] = [];
  const blend = new BiomeBlend();
  let maxRadiusRatio = 0;
  let lastChange = 0;
  for (let s = 0; s < 300000; s += 50) {
    spine.at(s, st);
    spine.biomeAt(s, blend);
    const design = BIOMES[blend.a].designKmh + blend.t * (BIOMES[blend.b].designKmh - BIOMES[blend.a].designKmh);
    maxRadiusRatio = Math.max(maxRadiusRatio, minRadius(design) * Math.abs(st.kappa));
    const region = BIOMES[biomes[spine.plan.chapterAt(s + 0.01)]];
    const kind = w.land.kindOf(Math.floor(s / w.rules.slot));
    const now = {
      curve: Math.abs(st.kappa) < 1 / 1500 ? 0 : Math.sign(st.kappa) * (Math.abs(st.kappa) > 1 / 350 ? 2 : 1),
      grade: Math.abs(st.grade) < 0.02 ? 0 : Math.sign(st.grade),
      verge: region.ground,
      enclosure: Number(kind === 'valley' || kind === 'canyon'),
    };
    maxGrade = Math.max(maxGrade, Math.abs(st.grade));
    if (last) {
      let changed = false;
      for (const k of Object.keys(changes) as (keyof typeof changes)[]) {
        if (last[k] !== now[k]) { changes[k]++; changed = true; }
      }
      if (changed) { gaps.push(s - lastChange); lastChange = s; }
    }
    last = now;
  }
  return { regions, changes, gaps, maxGrade, maxRadiusRatio };
}
