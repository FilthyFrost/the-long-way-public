/**
 * The developer's world tools, the game's side of the bin's world tabs: off to another kind of country (a
 * snowfield, the dunes, a canyon, the coast) at a random place of the road, the weather and the hour at a click,
 * and every frame the dials (devTune.ts) on what the weather, the light, the clock and the sound come out as.
 */
import { WEATHER_KINDS, type WeatherKind, type WeatherState } from '../../core/env/weather';
import { BIOMES, BIOME_INDEX } from '../../core/world/biomes';
import { LAND_SLOT, type LandKind } from '../../core/world/landform';
import { BiomeBlend } from '../../core/world/spine';
import type { World } from '../../core/world/terrain';
import { encodeBuild } from '../../core/modcar/build';
import { globals } from '../render/shaderlib';
import type { Tune } from './devTune';
import type { ModGame } from './ModGame';

export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: '晴天',
  cloudy: '多云',
  overcast: '阴天',
  fog: '大雾',
  rain: '下雨',
  storm: '雷暴雨',
  hail: '冰雹',
  snow: '下雪',
  blizzard: '暴风雪',
  sandstorm: '沙尘暴',
};

export const LAND_NAMES: Record<LandKind, string> = { open: '平地', hillside: '山坡路', valley: '山谷', ridge: '山脊', canyon: '峡谷' };

/** a kind of place to be sent to: a biome, the lie of the land, water */
export interface PlaceKind {
  id: string;
  zh: string;
  /** what one finds there (the button's tooltip) */
  help: string;
  biome?: string;
  land?: LandKind[];
  water?: 'lake' | 'river';
  coast?: boolean;
}

export const PLACES: PlaceKind[] = [
  { id: 'plains', zh: '草原', help: '开阔的草原，缓缓的丘陵，路又长又直。', biome: 'plains', land: ['open'] },
  { id: 'plainsHills', zh: '草原丘陵', help: '草原里的山坡路、山谷和山脊，路边高高低低。', biome: 'plains', land: ['hillside', 'valley', 'ridge'] },
  { id: 'forest', zh: '森林', help: '高大的树贴着路两边，光线一块一块的，路在树林里绕。', biome: 'forest' },
  { id: 'lakes', zh: '湖区', help: '低洼开阔的湖区，路边就是湖，有芦苇，早上常有雾。', biome: 'lakes', water: 'lake' },
  { id: 'maple', zh: '枫叶丘陵', help: '秋天的丘陵，满山红叶和金叶，风里飘着落叶。', biome: 'maple' },
  { id: 'snowPlain', zh: '雪原', help: '针叶雪山地带里平坦开阔的雪地。', biome: 'alpine', land: ['open', 'ridge'] },
  { id: 'snowMountain', zh: '雪山', help: '雪山的山谷和山腰上的路，两边是陡峭的雪山。', biome: 'alpine', land: ['valley', 'hillside'] },
  { id: 'desert', zh: '沙漠', help: '平坦的荒漠公路，远处是平顶的方山。', biome: 'desert', land: ['open'] },
  { id: 'desertHills', zh: '沙漠丘陵', help: '荒漠里起伏的山坡、山脊和沙谷。', biome: 'desert', land: ['hillside', 'ridge', 'valley'] },
  { id: 'canyon', zh: '峡谷', help: '两边是层层叠叠的岩壁，路在峡谷底下走。', land: ['canyon'] },
  { id: 'coast', zh: '海边', help: '沿着海岸的路，一边是山，一边是海滩和海。', coast: true },
  { id: 'river', zh: '河和桥', help: '路从桥上跨过一条河，就停在桥前面。', water: 'river' },
  { id: 'any', zh: '完全随机', help: '整条路上随便挑一个地方。' },
];

/** how far down the road a place is looked for (m) */
const SEARCH_TO = 320_000;

const bl = new BiomeBlend();

/**
 * A random place of a kind along the road (arc length), not the one one is at; null when the road holds none
 * that far. A lake: beside it; a river: just short of its bridge; elsewhere somewhere in the middle of a
 * stretch of that country (not where it blends into the next).
 */
export function findPlace(w: World, kind: PlaceKind, from: number): number | null {
  const kMax = Math.floor(SEARCH_TO / LAND_SLOT);
  const here = Math.floor(from / LAND_SLOT);
  const found: number[] = [];
  const bi = kind.biome !== undefined ? BIOME_INDEX[kind.biome] : -1;
  for (let k = 2; k < kMax; k++) {
    if (Math.abs(k - here) < 2) continue;
    const mid = (k + 0.5) * LAND_SLOT;
    w.spine.biomeAt(mid, bl);
    // (well inside one country, not where two blend)
    const pure = bl.a === bl.b || bl.t < 0.02 || bl.t > 0.98;
    if (!pure) continue;
    const b = bl.t > 0.5 ? bl.b : bl.a;
    if (bi >= 0 && b !== bi) continue;
    if (kind.land && !kind.land.includes(w.land.kindOf(k))) continue;
    if (kind.water && w.water.diceOf(k) !== kind.water) continue;
    if (kind.coast && !w.sea.coastOf(k)) continue;
    found.push(k);
  }
  // (a kind of country that is rare in its biome: any stretch of the biome then)
  if (!found.length && kind.land && kind.biome) return findPlace(w, { ...kind, land: undefined }, from);
  // take one at random; a lake or a river where it actually is (the dice can still fail to fit one)
  for (let tries = 0; tries < 12 && found.length; tries++) {
    const i = Math.floor(Math.random() * found.length);
    const k = found[i];
    if (kind.water) {
      const f = w.water.feature(k);
      if (f && f.kind === kind.water) return Math.max(40, f.s - (f.kind === 'river' ? 90 : 60));
      found.splice(i, 1);
      continue;
    }
    return (k + 0.5) * LAND_SLOT + (Math.random() - 0.5) * 500;
  }
  return null;
}

/** what is here: the country, the lie of the land, water, the distance down the road */
export function describePlace(w: World, s: number): string {
  w.spine.biomeAt(s, bl);
  const a = BIOMES[bl.a].label;
  const b = BIOMES[bl.b].label;
  const country = bl.a === bl.b || bl.t < 0.05 ? a : bl.t > 0.95 ? b : `${a} → ${b}`;
  const k = Math.floor(s / LAND_SLOT);
  const bits = [country, LAND_NAMES[w.land.kindOf(k)]];
  const f = w.water.feature(k);
  if (f) bits.push(f.kind === 'lake' ? '湖边' : '有河');
  if (w.sea.coastOf(k)) bits.push('海边');
  return `${bits.join(' · ')} · 第 ${(s / 1000).toFixed(1)} km`;
}

/** the game's side: the dials applied every frame, the weather and the hour at a click */
export class DevWorld {
  /** the clock runs this many times as fast (0: stopped) */
  timeSpeed = 1;
  private applied = { dayLength: NaN, sunHeight: NaN };

  constructor(
    private readonly game: ModGame,
    readonly tune: Tune,
  ) {
    game.env.tune = (w) => this.weather(w);
  }

  /** the weather as the dials have it */
  private weather(w: WeatherState): void {
    const t = this.tune;
    w.rain *= t.get('rain.amount');
    w.snow *= t.get('snow.amount');
    w.hail *= t.get('hail.amount');
    w.dust *= t.get('dust.amount');
    w.fog = Math.min(2, w.fog * t.get('fog.amount'));
    w.cloud = Math.min(1, w.cloud * t.get('cloud.amount'));
    w.overcast = Math.min(1, w.overcast * t.get('overcast.amount'));
    w.overcastCalm = Math.min(1, w.overcastCalm * t.get('overcast.amount'));
    w.lightning *= t.get('lightning.rate');
    w.wind *= t.get('wind.speed');
    w.windDir += (t.get('wind.turn') * Math.PI) / 180;
    const wet = t.get('ground.wet');
    if (wet >= 0) w.wetness = wet;
    const snow = t.get('ground.snow');
    if (snow >= 0) w.snowCover = snow;
  }

  /** every frame, before the environment: the clock, the drops, the glass, the finish, the sound */
  beforeEnv(dt: number): void {
    const g = this.game;
    const t = this.tune;
    const env = g.env;
    // the clock: faster, slower or stopped (the weather's own schedule keeps the game's time)
    if (this.timeSpeed !== 1) env.clock.advance(dt * (this.timeSpeed - 1));
    const day = t.get('time.dayLength') * 60;
    if (day !== this.applied.dayLength) {
      env.clock.setDayLength(day, g.time);
      this.applied.dayLength = day;
    }
    const sun = t.get('time.sunHeight');
    if (sun !== this.applied.sunHeight) {
      env.clock.maxElevation = sun;
      this.applied.sunHeight = sun;
    }
    const p = env.precip;
    p.count.rain = t.get('rain.count');
    p.length.rain = t.get('rain.length');
    p.count.snow = t.get('snow.count');
    p.count.hail = t.get('rain.count');
    env.glassRain = t.get('glass.rain');
    env.wiperRate = t.get('wiper.speed');
    const gr = g.core.frame.grade;
    gr.saturation = t.get('look.saturation');
    gr.knee = t.get('look.knee');
    gr.shoulder = t.get('look.shoulder');
    gr.vignette = t.get('look.vignette');
    gr.ink = t.get('look.ink');
    gr.threshold = t.get('look.threshold');
    g.core.frame.bloom = t.get('look.bloom');
    const wg = g.audio.weatherGain;
    wg.rain = t.get('sound.rain');
    wg.roof = t.get('sound.roof');
    wg.hail = t.get('sound.hail');
    wg.wind = t.get('sound.wind');
    wg.thunder = t.get('sound.thunder');
  }

  /** every frame, after the environment: the light and the air */
  afterEnv(): void {
    const t = this.tune;
    const core = this.game.core;
    core.exposure *= t.get('look.exposure');
    core.shafts *= t.get('look.shafts');
    globals.uFogDensity.value *= t.get('look.fog');
    globals.uSunColor.value.multiplyScalar(t.get('look.sun'));
    globals.uSkyColor.value.multiplyScalar(t.get('look.sky'));
    globals.uBounceColor.value.multiplyScalar(t.get('look.bounce'));
  }

  // ------------------------------------------------------------------ at a click

  get weatherKinds(): { id: WeatherKind; zh: string }[] {
    return WEATHER_KINDS.map((id) => ({ id, zh: WEATHER_NAMES[id] }));
  }

  /** the weather forced (null: as the schedule has it) */
  get forced(): WeatherKind | null {
    return this.game.env.weather.force;
  }

  setWeather(kind: WeatherKind | null): void {
    const env = this.game.env;
    env.weather.force = kind;
    // (the sky made again at once: the clouds of the new weather, not strip by strip)
    env.cloudsNow = true;
  }

  /** where in its three acts a forced weather stands: 0…1 coming, 1…2 at its height, 2…3 clearing (null: at its height) */
  get stage(): number | null {
    return this.game.env.weather.stage;
  }

  setStage(v: number | null): void {
    this.game.env.weather.stage = v;
    this.game.env.cloudsNow = true;
  }

  strike(): void {
    this.game.env.strike();
  }

  get hour(): number {
    return this.game.env.clock.hourAt(this.game.time);
  }

  setHour(h: number): void {
    this.game.env.clock.setHour(((h % 24) + 24) % 24, this.game.time);
    this.game.env.cloudsNow = true;
  }

  /** the country, the lie of the land, the distance down the road; the garage when one is in it */
  where(): string {
    const g = this.game;
    if (g.place === 'garage' && g.seamless) return '在车库的院子里（公路从大门口开始；传送不会动车库）';
    if (g.place === 'garage' || !g.world) return '在车库里（传送会离开车库，上路）';
    return describePlace(g.world, g.roadS);
  }

  /** off to a random place of a kind; what happened, in words */
  go(kindId: string, bring: boolean): string {
    const g = this.game;
    const kind = PLACES.find((p) => p.id === kindId);
    if (!kind) return '';
    const w = g.devWorld();
    const s = kind.id === 'any' ? 2000 + Math.random() * (SEARCH_TO - 4000) : findPlace(w, kind, g.place === 'road' ? g.roadS : -1e9);
    if (s === null) return `前面 ${SEARCH_TO / 1000} km 的路上没找到「${kind.zh}」。`;
    g.teleport(s, bring);
    return `${kind.zh}：${describePlace(w, s)}`;
  }

  /** to a distance down the road (km) */
  goKm(km: number, bring: boolean): string {
    const g = this.game;
    const s = Math.max(0.05, km) * 1000;
    g.teleport(s, bring);
    return describePlace(g.devWorld(), s);
  }

  /** how far down the road one is (km; 0 in the garage) */
  get km(): number {
    return this.game.place === 'road' ? this.game.roadS / 1000 : 0;
  }

  get seed(): number {
    return this.game.params.seed;
  }

  /** the biome one is in (the garage: the first of the road) */
  get biomeHere(): string {
    const g = this.game;
    const w = g.devWorld();
    w.spine.biomeAt(g.place === 'road' ? g.roadS : 0, bl);
    return BIOMES[bl.t > 0.5 ? bl.b : bl.a].id;
  }

  /** where, what weather, what hour: the context the moved dials were tried in */
  context(): string {
    const f = this.forced;
    return `${this.where()} · 天气：${f ? WEATHER_NAMES[f] : '跟随预报'} · ${DevWorld.hourText(this.hour)} · 种子 ${this.seed}`;
  }

  /** the moved dials saved through the dev server (loop/dev-tune.json); where, or null when that is not there */
  async saveTune(text: string, json: Record<string, unknown>, name = 'dev-tune'): Promise<string | null> {
    try {
      const r = await fetch('/__dev/tune', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, text, json }) });
      if (!r.ok) return null;
      const o = (await r.json()) as { path?: string };
      return o.path ?? null;
    } catch {
      return null;
    }
  }

  /**
   * The world made again (a reload): with the terrain dials as they are now, or (newSeed) another world
   * altogether; back on the road where one was, in the vehicle one was in, the panel open on `tab`.
   */
  regenerate(newSeed: boolean, tab: string): void {
    const g = this.game;
    const q = new URLSearchParams(location.search);
    q.set('start', 'road');
    q.set('s', String(Math.round(newSeed ? 3000 : g.place === 'road' ? g.roadS : g.params.s)));
    q.set('seed', String(newSeed ? 1 + Math.floor(Math.random() * 999_999) : g.params.seed));
    q.set('time', this.hour.toFixed(2));
    const f = this.forced;
    if (f) q.set('weather', f);
    else q.delete('weather');
    const v = g.seated ?? g.focus;
    if (v) q.set('build', encodeBuild(v.build));
    q.set('devpanel', tab);
    q.delete('new');
    location.search = q.toString();
  }

  /** a smooth number for a slider of the hour */
  static hourText(h: number): string {
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

