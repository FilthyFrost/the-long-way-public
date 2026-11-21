/**
 * The mist of the low ground (V8, docs/V3/nodes/V8-director.md): what lies in a place's hollows of a morning, as the
 * director would have its light — the land under it drawn into it by the shared fog (render/shaderlib.ts rtFog).
 *
 *   valley  a karst's plain, a river's valley, a lake's shore, a marsh, a gorge, a fjord: a mist on the road some tens
 *           of metres deep, thickening into the distance, the towers' and the pillars' tops standing out of it — "江上起雾",
 *           "浮在云里的一根根石柱";
 *   sea     a wet country's ridge, pass, switchback and shelf roads high over their valleys: a sea of cloud filling the
 *           valleys some way under the road, the peaks standing out of it.
 *
 * Thickest from first light to eight, gone by ten; a valley's lighter again of an evening. Not every day (by the day
 * and the place, the same whoever asks), not in a gale or under rain, never in dry country.
 */
import type { WeatherState } from '../../core/env/weather';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';

export interface Mist {
  /** its top (world m), how soft its top is (m), how thick it is (1/m: 0 none) */
  top: number;
  soft: number;
  density: number;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x3c6ef372, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const VALLEY_FORMS = new Set(['tower_karst', 'cone_karst', 'pillar_mountain', 'meander_valley', 'braided_river', 'delta', 'waterfall_gorge', 'fjord', 'moraine_lake', 'travertine', 'sinkholes', 'rift_valley']);
const VALLEY_ROADS = new Set(['river_road', 'lakeshore', 'gorge', 'valley', 'tower_road', 'forest_tunnel', 'shore']);
const HIGH_ROADS = new Set(['skyline', 'pass', 'switchback', 'shelf', 'terrace_road']);

const tp = new TerrainPoint();
const st = new SpineSample();

/** the mist there should be about the camera now (world coordinates; density 0: none) */
export function mistAt(world: World, camX: number, camZ: number, hour: number, day: number, w: WeatherState, out: Mist): Mist {
  out.density = 0;
  const earth = world.earth;
  if (!earth) return out;
  const s = world.spine.sAtX(camX);
  const p = earth.pieces.find((q) => q.start <= s && q.end > s);
  const sc = p?.kind === 'scene' ? p.scene : null;
  if (!p || !sc) return out;
  const place = sc.place;
  const m = place.macro;
  if (m.wet < 0.4 || w.wind > 7 || w.rain > 0.3 || w.snow > 0.3) return out;
  const lf = place.look.landform.id;
  const road = sc.road?.id ?? '';
  const wetLand = m.water === 'river' || m.water === 'lake' || m.water === 'wetland';
  const valley = VALLEY_FORMS.has(lf) || (wetLand && VALLEY_ROADS.has(road));
  const high = !valley && HIGH_ROADS.has(road) && m.wet > 0.5;
  if (!valley && !high) return out;
  // not every morning: the karst's and the rivers' most of them, the high country's half
  const chance = lf.endsWith('karst') || lf === 'pillar_mountain' ? 0.85 : valley ? 0.6 : 0.5;
  if (hash(day, p.index * 7 + 3) > chance) return out;
  const dawn = smooth(4.6, 6.0, hour) * (1 - smooth(8.2, 10.2, hour));
  const evening = valley ? 0.4 * smooth(18.8, 20.6, hour) * (1 - smooth(23.0, 23.9, hour)) : 0;
  const amount = Math.max(dawn, evening) * (1 - smooth(3, 7, w.wind)) * Math.min(1, (m.wet - 0.4) / 0.25);
  if (amount <= 0.01) return out;
  world.spine.at(s, st);
  const roadY = st.y;
  if (valley) {
    // (a karst's mist deeper: the towers and pillars stand out of it from their waists)
    const karst = lf.endsWith('karst') || lf === 'pillar_mountain';
    out.top = roadY + (karst ? 45 + 35 * hash(day, p.index * 7 + 5) : 26 + 22 * hash(day, p.index * 7 + 5));
    out.soft = karst ? 30 : 22;
    out.density = (karst ? 0.0036 : 0.0032) * amount;
    return out;
  }
  // a sea of cloud: its top somewhere between the valleys' floor and the road, well under the road
  let floor = roadY;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const d = k % 2 ? 450 : 900;
    world.shape(camX + Math.cos(a) * d, camZ + Math.sin(a) * d, tp);
    floor = Math.min(floor, tp.bed);
  }
  if (roadY - floor < 140) return out;
  out.top = Math.min(roadY - 60, floor + (roadY - floor) * (0.42 + 0.2 * hash(day, p.index * 7 + 9)));
  out.soft = 45;
  out.density = 0.011 * amount;
  return out;
}
