/**
 * The weather of a region of the emergent Earth (docs/V3/nodes/E6-earth-sky.md): its calm weather and the kinds
 * its events may be (core/env/weather.ts), from its place — how cloudy its sky is by its wetness, what its showers
 * bring in its month (rain, or snow where the month freezes), its wind (a windy card's, a coast's), its morning
 * mist and its fog all day where it lies in a mountain's cloud belt (a cloud forest), on a desert coast (the
 * fog deserts) or by a cold wet sea; the dust in the air of the hot dry country; and its storms: blizzards in the
 * snow, sand walls in the sand seas, thunderstorms in the wet tropics, rain and hail in the temperate country,
 * fog in the cloud forests and on the coasts.
 */
import type { CalmWeather, WeatherKind } from '../../env/weather';
import { cloudAt, seasonOf, snowAt, wetnessAt } from '../../earth/climate';
import type { Scene } from '../../earth/director';
import { rock } from '../../earth/rocks';
import { monthWarmth } from './region';

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** a place's calm weather and its events' kinds (with the share of the selector each reaches up to) */
export function weatherOfPlace(sc: Scene): { calm: CalmWeather; kinds: readonly (readonly [number, WeatherKind])[] } {
  const m = sc.macro;
  const e = sc.look.efg;
  const ew = e.weather ?? {};
  const w = wetnessAt(m, m.base);
  const t = monthWarmth(m, m.base, m.month);
  const snowy = snowAt(m, m.base, m.month);
  const coast = m.water === 'coast' || m.context === 'coast';
  const cloudBelt = cloudAt(m, m.base);
  const fogDesert = coast && e.group === 'T5';
  const fog = ew.fog ?? 0;
  const calm: CalmWeather = {
    cloud: cloudBelt > 0.3 ? 1 : clamp(0.3 + 0.8 * w, 0.3, 1),
    rain: snowy || w < 0.18 ? 0 : clamp(0.12 + 0.42 * w, 0, 0.5),
    snow: snowy ? 0.35 : 0,
    wind: 3 * (ew.wind ?? 0) + (coast ? 1 : 0),
    mist: fog > 0 ? clamp(0.45 + 0.5 * fog, 0, 0.95) : w > 0.55 ? 0.6 : w > 0.35 ? 0.35 : 0,
    mistFrom: fog > 0.5 ? 0.1 : 0.45,
    mistTo: fog > 0.5 ? 0.5 : 0.9,
    haze: cloudBelt > 0.3 ? 0.3 + 0.35 * cloudBelt : fogDesert ? 0.3 : e.code === 'T2.3' ? 0.15 : coast && t < 10 && w > 0.6 ? 0.12 : 0,
    dust: w < 0.2 && t > 15 ? clamp(0.06 + 0.25 * (ew.dust ?? 0) + (rock(m.rock).loose ? 0.04 : 0), 0, 0.2) : 0,
  };
  let kinds: readonly (readonly [number, WeatherKind])[];
  if (snowy) kinds = [[0.6, 'blizzard'], [0.9, 'snow'], [1, 'fog']];
  else if (w < 0.25) kinds = rock(m.rock).loose ? [[0.75, 'sandstorm'], [1, 'storm']] : [[0.45, 'sandstorm'], [1, 'storm']];
  else if (cloudBelt > 0.3) kinds = [[0.3, 'rain'], [1, 'fog']];
  else if (m.tSea > 20 && w > 0.6) kinds = [[0.65, 'storm'], [0.95, 'rain'], [1, 'fog']];
  else if (coast) kinds = [[0.35, 'storm'], [0.65, 'rain'], [1, 'fog']];
  else if (seasonOf(m.tSea, m.wet, m.cont) === 'mediterranean' && m.month >= 5 && m.month <= 9) kinds = [[0.3, 'storm'], [1, 'rain']];
  else kinds = [[0.45, 'storm'], [0.6, 'hail'], [0.9, 'rain'], [1, 'fog']];
  return { calm, kinds };
}
