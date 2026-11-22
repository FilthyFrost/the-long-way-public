/**
 * Weather as a deterministic schedule: the same seed and clock give the same sky to every player.
 *
 * Calm weather drifts slowly (cloud cover from a noise of time). On top of it come events, and
 * every event is written in three acts:
 *   build-up   1–2 min   clouds lower, wind rises — time to look for shelter
 *   peak       5–10 min  the storm itself
 *   aftermath  2–3 min   it clears; wet roads, fresh snow, a rainbow — the reward
 *
 * What an event looks like depends on where you are: the same storm is thunder and rain on the
 * plains, a sand wall in the desert, a blizzard in the mountains. Crossing a biome border
 * mid-storm blends between them.
 */
import { fbm1 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES, regionById, regionRow, regionSalt, type RegionDef } from '../world/biomes';

// (G10, appended — the first ten keep their places: the countries' own weather. cloudburst: the wet tropics' downpour,
// the sun still out through its breaks, steam off the ground after; monsoon: hours of heavy rain under a dark deck;
// drizzle: fine rain in mist, no wind; squall: a coast's — wind first, rain in sheets, soon over; seafog: a bank of fog
// off the sea with the sun above it; dusthaze: the dry country's air gone yellow, no wall; flurries: snow out of a
// half-open sky; thundery: a dry storm — the deck, the wind, the lightning, hardly a drop reaching the ground)
export const WEATHER_KINDS = ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'storm', 'hail', 'snow', 'blizzard', 'sandstorm', 'cloudburst', 'monsoon', 'drizzle', 'squall', 'seafog', 'dusthaze', 'flurries', 'thundery'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];
/** the ten kinds the first worlds know: what their recorded weather is a fingerprint of (harness/sim/worldTrace.ts) */
export const WEATHER_KINDS_V1: readonly WeatherKind[] = WEATHER_KINDS.slice(0, 10);

export class WeatherState {
  /** cloud cover 0…1 */
  cloud = 0;
  /** how much the cloud deck darkens the light, 0…1 */
  overcast = 0;
  /** the same without the event: the deck that fair weather has drawn over by itself */
  overcastCalm = 0;
  rain = 0;
  snow = 0;
  hail = 0;
  /** airborne sand and dust */
  dust = 0;
  fog = 0;
  /** wind speed (m/s) and the direction it blows towards (rad about +y, 0 = +x) */
  wind = 2;
  windDir = 0;
  /** lightning flashes per second */
  lightning = 0;
  /** air temperature (°C) */
  temp = 20;
  /** slow state: how wet the ground is / how much fresh snow lies on the road, 0…1 */
  wetness = 0;
  snowCover = 0;
  /** rainbow visibility after rain, 0…1 */
  rainbow = 0;
  /** 0 calm, 1 build-up, 2 peak, 3 aftermath */
  act = 0;
  /** event envelope 0…1 */
  severity = 0;
  /**
   * The front: the wall of cloud (or sand, or snow) that announces weather before it arrives and
   * stands in the sky after it has passed. Height 0…1; it stands upwind while the weather is coming
   * (side −1) and downwind once it is leaving (side +1).
   */
  front = 0;
  frontSide = -1;
  /** how hard the event itself is coming down, 0…1 (rain, snow, hail or sand, whichever it brings) */
  fall = 0;
  /**
   * How thick the air is with the weather that is coming, by what it carries: it grows all through
   * the build-up (far views go murky under the front long before the first drop), so the haze has
   * a slow start even though the fall itself has a late one.
   */
  murkRain = 0;
  murkSnow = 0;
  murkDust = 0;
  kind: WeatherKind = 'clear';

  copy(o: WeatherState): this {
    Object.assign(this, o);
    return this;
  }
}

export interface WeatherEvent {
  /** start of the build-up, start of the peak, start of the aftermath, end (seconds) */
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  strength: number;
  /** 0…1 selector, turned into a kind by the biome */
  pick: number;
}

/** events are placed one per window of this many seconds (not every window has one) */
export const EVENT_WINDOW = 1500;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * What the event selector means, by region: the kinds an event may be there, each with the share of the
 * selector (0…1) it reaches up to; the last takes what is left. The second round: fog belongs to the
 * woods and most of all to the lakes; the maple hills get the squalls.
 */
const EVENT_KINDS: Record<string, readonly (readonly [number, WeatherKind])[]> = {
  plains: [[0.55, 'storm'], [0.72, 'hail'], [0.9, 'rain'], [1, 'fog']],
  desert: [[0.78, 'sandstorm'], [1, 'storm']],
  alpine: [[0.72, 'blizzard'], [0.9, 'snow'], [1, 'fog']],
  forest: [[0.38, 'storm'], [0.7, 'rain'], [1, 'fog']],
  lakes: [[0.28, 'storm'], [0.6, 'rain'], [1, 'fog']],
  maple: [[0.38, 'rain'], [0.66, 'storm'], [0.82, 'hail'], [1, 'fog']],
};

/** the weather of a region when nothing is happening */
export interface CalmWeather {
  /** how much of the drifting cloud its sky takes (the desert's stays mostly clear) */
  cloud: number;
  /** what thick cloud lets fall, as a share of how thick it is: rain where it is green, snow in the high country, nothing in the dry */
  rain: number;
  snow: number;
  /** wind over and above the drifting wind (m/s) */
  wind: number;
  /**
   * Morning mist: how thick it lies at its thickest (0: there never is any), and between which shares
   * of mornings it comes at all and comes in full (a lower pair: more mornings have it).
   */
  mist: number;
  mistFrom: number;
  mistTo: number;
  /**
   * The emergent Earth's (core/world/earth/weather.ts): fog that lies all day (a cloud forest in its mountain's
   * cloud, a fog desert by its cold sea), and dust that hangs in the air of the hot dry country, 0 … 1
   */
  haze?: number;
  dust?: number;
}

/**
 * Calm weather, by region. Autumn hills are seldom still: there is always enough wind to bring the
 * leaves down. Over the lakes the mist comes most mornings and lies thicker; in the woods it hangs
 * between the trunks.
 */
const CALM: Record<string, CalmWeather> = {
  plains: { cloud: 1, rain: 0.3, snow: 0, wind: 0, mist: 0.6, mistFrom: 0.45, mistTo: 0.9 },
  desert: { cloud: 0.55, rain: 0, snow: 0, wind: 0, mist: 0, mistFrom: 0.45, mistTo: 0.9 },
  alpine: { cloud: 1, rain: 0, snow: 0.35, wind: 0, mist: 0.6, mistFrom: 0.45, mistTo: 0.9 },
  forest: { cloud: 1, rain: 0.3, snow: 0, wind: 0, mist: 0.72, mistFrom: 0.45, mistTo: 0.9 },
  lakes: { cloud: 1, rain: 0.3, snow: 0, wind: 0, mist: 0.85, mistFrom: 0.2, mistTo: 0.7 },
  maple: { cloud: 1, rain: 0.3, snow: 0, wind: 1.6, mist: 0.6, mistFrom: 0.45, mistTo: 0.9 },
};

/**
 * A region of the emergent Earth's weather, its place's own (core/world/earth/weather.ts): its calm weather and
 * the kinds its events may be, under its id.
 */
export function setRegionWeather(id: string, calm: CalmWeather, kinds: readonly (readonly [number, WeatherKind])[]): void {
  CALM[id] = calm;
  EVENT_KINDS[id] = kinds;
}

/** a region's calm weather: the row under its id, else its kin's */
export function calmOf(region: RegionDef): Readonly<CalmWeather> {
  return regionRow(CALM, region);
}

export class WeatherSystem {
  /** forces a fixed weather (debug, screenshots); null = follow the schedule */
  force: WeatherKind | null = null;
  /**
   * With `force`: where in its three acts the forced event stands. 0…1 = through the build-up,
   * 1…2 = the peak, 2…3 = through the aftermath. null = at its peak.
   */
  stage: number | null = null;
  readonly state = new WeatherState();
  private readonly a = new WeatherState();
  private readonly b = new WeatherState();
  private readonly ev: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };

  constructor(readonly seed: number) {}

  /** The event (if any) belonging to schedule window k. */
  eventInWindow(k: number, out: WeatherEvent): boolean {
    const h = hash2(k, 0x77ea, this.seed);
    const r = (n: number): number => (hash2(k, n, this.seed + 0x1234) & 0xffffff) / 0x1000000;
    if ((h & 0xff) / 256 > 0.72) return false;
    const build = 75 + 45 * r(1);
    const peak = 300 + 300 * r(2);
    const after = 130 + 45 * r(3);
    const slack = EVENT_WINDOW - 60 - build - peak - after;
    out.t0 = k * EVENT_WINDOW + 60 + slack * r(4);
    out.t1 = out.t0 + build;
    out.t2 = out.t1 + peak;
    out.t3 = out.t2 + after;
    out.strength = 0.65 + 0.35 * r(5);
    out.pick = r(6);
    return true;
  }

  /** what the event selector means in a biome (the row of EVENT_KINDS under its id, else its kin's; an id the registry does not hold: the first region's) */
  static kindFor(biomeId: string, pick: number): WeatherKind {
    const kinds = regionRow(EVENT_KINDS, regionById(biomeId));
    for (let i = 0; i < kinds.length - 1; i++) if (pick < kinds[i][0]) return kinds[i][1];
    return kinds[kinds.length - 1][1];
  }

  /** fills the instantaneous (non-accumulating) fields for one biome */
  private manifest(biome: number, t: number, hour: number, daylight: number, out: WeatherState): void {
    const B = BIOMES[biome];
    const id = B.id;
    const calm = calmOf(B);
    // ---- calm weather (the drift of each region is its own: its index in the registry seeds it)
    const drift = fbm1(t / 760, this.seed + 17 + regionSalt(biome) * 3, 2);
    let cloud = smoothstep(-0.38, 0.42, drift) * calm.cloud;
    let overcast = smoothstep(0.62, 1.0, cloud) * 0.45;
    let rain = 0;
    let snow = 0;
    let hail = 0;
    let dust = 0;
    let fog = 0;
    let wind = 2.5 + 2.5 * (0.5 + 0.5 * fbm1(t / 310, this.seed + 29, 2));
    let lightning = 0;
    // showers out of thick cloud
    const shower = smoothstep(0.86, 0.98, cloud);
    if (calm.rain > 0) rain = shower * calm.rain;
    else if (calm.snow > 0) snow = shower * calm.snow;
    if (calm.wind > 0) wind += calm.wind;
    // morning mist where there is moisture
    if (calm.mist > 0) {
      // which morning this is: counted from noon to noon (2400 s to the day), so that whether it is a misty
      // one never changes while any mist is about — counted from the clock's start it changed at half past
      // eight, with the last of the mist still lifting
      const day = Math.round((t - ((hour + 12) % 24) * 100) / 2400);
      const misty = (hash2(day, 0x315, this.seed) & 255) / 255;
      // The thicker it gets, the longer it takes to come and to lift: it never thickens faster than plain mist does.
      const amp = calm.mist;
      const slow = amp / 0.6;
      const morning = smoothstep(5.8 - slow, 5.8, hour) * (1 - smoothstep(7.2, 7.2 + 1.6 * slow, hour));
      fog = morning * smoothstep(calm.mistFrom, calm.mistTo, misty) * amp;
    }
    // (the emergent Earth's fog that lies all day, and its dust in the air)
    if (calm.haze) fog = Math.max(fog, calm.haze);
    if (calm.dust) dust = Math.max(dust, calm.dust);
    let act = 0;
    let severity = 0;
    const overcastCalm = overcast;
    let kind: WeatherKind = overcast > 0.3 ? 'overcast' : cloud > 0.45 ? 'cloudy' : 'clear';
    if (rain > 0.05) kind = 'rain';
    if (snow > 0.05) kind = 'snow';
    if (fog > 0.3) kind = 'fog';
    let rainbow = 0;

    // ---- events
    const ev = this.ev;
    const k = Math.floor(t / EVENT_WINDOW);
    let has = false;
    /** how far through the build-up, 0…1 (1 from the peak on) */
    let buildU = 1;
    let evKind: WeatherKind = 'clear';
    if (this.force) {
      has = true;
      evKind = this.force;
      severity = this.force === 'clear' ? 0 : 1;
      act = severity > 0 ? 2 : 0;
      ev.strength = 1;
      const stage = this.stage;
      if (stage !== null && severity > 0) {
        if (stage < 1) {
          act = 1;
          buildU = stage < 0 ? 0 : stage;
          severity = smoothstep(0, 1, buildU);
        } else if (stage >= 2) {
          act = 3;
          severity = 1 - smoothstep(0, 1, Math.min(1, stage - 2));
        }
      }
      if (this.force === 'clear') {
        cloud = 0.12;
        overcast = 0;
        rain = snow = fog = 0;
      } else if (this.force === 'cloudy') {
        cloud = 0.6;
        overcast = 0.1;
        severity = 0;
        act = 0;
      }
    } else if (this.eventInWindow(k, ev) && t >= ev.t0 && t < ev.t3) {
      has = true;
      evKind = WeatherSystem.kindFor(id, ev.pick);
      if (t < ev.t1) {
        severity = smoothstep(ev.t0, ev.t1, t);
        buildU = (t - ev.t0) / (ev.t1 - ev.t0);
        act = 1;
      } else if (t < ev.t2) {
        severity = 1;
        act = 2;
      } else {
        severity = 1 - smoothstep(ev.t2, ev.t3, t);
        act = 3;
      }
    }
    let front = 0;
    let frontSide = -1;
    let falling = 0;
    let murkRain = 0;
    let murkSnow = 0;
    let murkDust = 0;
    if (has && severity > 0) {
      const sv = severity * ev.strength;
      // The build-up is a show before anything falls: the front climbs the sky, the wind rises, thunder
      // mutters — and only in its last third do the first drops come. Leaving, the rain thins as the sky opens.
      // (a long, soft start: the air thickens slowly, so the light and the haze never jump)
      const begun = smoothstep(0.45, 1, buildU);
      const fall = (act === 1 ? begun * Math.sqrt(begun) : severity) * ev.strength;
      // (no wall of cloud comes before a fog, a drizzle, a haze of dust or a flurry of snow: the air just thickens)
      if (evKind !== 'fog' && evKind !== 'overcast' && evKind !== 'clear' && evKind !== 'cloudy' && evKind !== 'drizzle' && evKind !== 'seafog' && evKind !== 'dusthaze' && evKind !== 'flurries') {
        falling = fall;
        front = act === 1 ? smoothstep(0.03, 0.6, buildU) : act === 2 ? 1 : severity;
        frontSide = act === 3 ? 1 : -1;
      }
      // clouds arrive before the weather does and leave after it
      const deck = act === 1 ? smoothstep(0.03, 0.6, buildU) : act === 3 ? severity * severity : 1;
      // gusts: the peak breathes instead of sitting at one level
      const gust = 0.85 + 0.15 * fbm1(t / 23, this.seed + 91, 2);
      switch (evKind) {
        case 'storm':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.85 * deck);
          rain = Math.max(rain, fall * gust);
          murkRain = sv;
          wind += 11 * sv;
          lightning = 0.14 * smoothstep(0.5, 1, sv);
          fog = Math.max(fog, 0.3 * sv);
          break;
        case 'rain':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.6 * deck);
          rain = Math.max(rain, 0.6 * fall * gust);
          murkRain = 0.6 * sv;
          wind += 4 * sv;
          fog = Math.max(fog, 0.2 * sv);
          break;
        case 'hail':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.9 * deck);
          rain = Math.max(rain, 0.45 * fall);
          murkRain = 0.45 * sv;
          // hail comes in bursts within the peak
          hail = fall * smoothstep(0.1, 0.6, fbm1(t / 41, this.seed + 53, 1)) * (act === 2 ? 1 : 0.3);
          wind += 9 * sv;
          lightning = 0.08 * smoothstep(0.6, 1, sv);
          break;
        case 'snow':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.55 * deck);
          snow = Math.max(snow, 0.6 * fall);
          murkSnow = 0.6 * sv;
          wind += 2 * sv;
          fog = Math.max(fog, 0.25 * sv);
          break;
        case 'blizzard':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.75 * deck);
          snow = Math.max(snow, fall * gust);
          murkSnow = sv;
          wind += 14 * sv;
          fog = Math.max(fog, 0.75 * sv);
          break;
        case 'sandstorm':
          cloud = Math.max(cloud, 0.5 * deck);
          overcast = Math.max(overcast, 0.5 * deck);
          dust = fall * gust;
          murkDust = sv;
          wind += 16 * sv;
          break;
        case 'fog':
          fog = Math.max(fog, sv);
          cloud = Math.max(cloud, 0.7 * deck);
          overcast = Math.max(overcast, 0.4 * deck);
          wind *= 1 - 0.7 * sv;
          break;
        case 'overcast':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.6 * deck);
          break;
        case 'cloudburst':
          // (towers, not a deck: the light stays, and the rain comes down in it as hard as rain comes)
          cloud = Math.max(cloud, 0.85 * deck);
          overcast = Math.max(overcast, 0.38 * deck);
          rain = Math.max(rain, fall * (0.9 + 0.1 * gust));
          murkRain = 0.75 * sv;
          wind += 3 * sv;
          lightning = 0.04 * smoothstep(0.7, 1, sv);
          // (after it the wet ground steams in the sun)
          fog = Math.max(fog, act === 3 ? 0.42 * Math.sin(Math.PI * (1 - severity)) : 0.12 * sv);
          break;
        case 'monsoon':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.92 * deck);
          rain = Math.max(rain, 0.85 * fall * (0.8 + 0.2 * gust));
          murkRain = sv;
          wind += 6 * sv;
          lightning = 0.05 * smoothstep(0.6, 1, sv);
          fog = Math.max(fog, 0.4 * sv);
          break;
        case 'drizzle':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.82 * deck);
          rain = Math.max(rain, 0.24 * sv);
          murkRain = 0.3 * sv;
          fog = Math.max(fog, 0.42 * sv);
          wind *= 1 - 0.5 * sv;
          break;
        case 'squall': {
          // (the wind comes first and hardest; the rain in sheets, a minute on and a minute off)
          const sheet = smoothstep(-0.15, 0.35, fbm1(t / 17, this.seed + 67, 2));
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.7 * deck);
          rain = Math.max(rain, fall * (0.35 + 0.65 * sheet));
          murkRain = 0.7 * sv;
          wind += 19 * sv * (0.8 + 0.2 * gust);
          fog = Math.max(fog, 0.15 * sv);
          break;
        }
        case 'seafog':
          // (a bank of it on the ground and the sun above: thick, bright, hardly a cloud over it)
          fog = Math.max(fog, 0.95 * sv);
          cloud = Math.max(cloud, 0.35 * deck);
          overcast = Math.max(overcast, 0.12 * deck);
          wind *= 1 - 0.6 * sv;
          break;
        case 'dusthaze':
          dust = 0.34 * sv * (0.8 + 0.2 * gust);
          murkDust = 0.4 * sv;
          wind += 7 * sv;
          overcast = Math.max(overcast, 0.15 * sv);
          break;
        case 'flurries':
          cloud = Math.max(cloud, 0.7 * deck);
          overcast = Math.max(overcast, 0.22 * deck);
          snow = Math.max(snow, 0.3 * sv * smoothstep(-0.3, 0.4, fbm1(t / 29, this.seed + 71, 2)));
          murkSnow = 0.2 * sv;
          wind += 3 * sv;
          break;
        case 'thundery':
          cloud = Math.max(cloud, deck);
          overcast = Math.max(overcast, 0.8 * deck);
          rain = Math.max(rain, 0.07 * fall);
          murkRain = 0.2 * sv;
          wind += 12 * sv * gust;
          lightning = 0.2 * smoothstep(0.35, 1, sv);
          dust = Math.max(dust, 0.1 * sv);
          break;
        default:
          break;
      }
      if (severity > 0.05) kind = evKind;
      if (act === 3 && (evKind === 'storm' || evKind === 'rain' || evKind === 'hail' || evKind === 'cloudburst' || evKind === 'monsoon' || evKind === 'squall')) rainbow = Math.sin(Math.PI * (1 - severity)) * 0.9 + 0.1 * (1 - severity);
    }
    out.cloud = cloud;
    out.overcast = overcast;
    out.overcastCalm = this.force ? (front > 0 ? 0 : overcast) : overcastCalm;
    out.rain = rain;
    out.snow = snow;
    out.hail = hail;
    out.dust = dust;
    out.fog = fog;
    out.wind = wind;
    out.lightning = lightning;
    out.act = act;
    out.severity = severity;
    out.front = front;
    out.frontSide = frontSide;
    out.fall = falling;
    out.murkRain = murkRain;
    out.murkSnow = murkSnow;
    out.murkDust = murkDust;
    out.kind = kind;
    out.rainbow = rainbow;
    // (the road runs towards +x: a wind out of the east brings its weather on from ahead, where it can be watched coming)
    out.windDir = Math.PI + 0.95 * fbm1(t / 1900, this.seed + 3, 1);
    out.temp = lerp(B.tempNight, B.tempDay, daylight) - 5 * overcast - 3 * Math.max(rain, snow) - 0.25 * wind * (snow > 0.2 ? 1 : 0.3);
  }

  /**
   * Instantaneous weather for a biome mix at time t (pure function of its arguments).
   * Slow fields (wetness, snowCover) are left untouched.
   */
  targets(t: number, hour: number, daylight: number, ba: number, bb: number, bt: number, out: WeatherState): void {
    this.manifest(ba, t, hour, daylight, out);
    if (bt > 0 && bb !== ba) {
      const b = this.b;
      this.manifest(bb, t, hour, daylight, b);
      for (const key of ['cloud', 'overcast', 'rain', 'snow', 'hail', 'dust', 'fog', 'wind', 'lightning', 'temp', 'severity', 'rainbow', 'windDir', 'front', 'fall', 'overcastCalm', 'murkRain', 'murkSnow', 'murkDust'] as const) {
        out[key] = lerp(out[key], b[key], bt);
      }
      if (bt > 0.5) {
        out.kind = b.kind;
        out.act = b.act;
        out.frontSide = b.frontSide;
      }
    }
  }

  /** Advance the slow state and return the full weather. Call with the simulation's fixed step. */
  step(dt: number, t: number, hour: number, daylight: number, ba: number, bb: number, bt: number): WeatherState {
    const s = this.state;
    const wet = s.wetness;
    const cover = s.snowCover;
    this.targets(t, hour, daylight, ba, bb, bt, this.a);
    s.copy(this.a);
    // wetness: soaks in under rain, dries slowly (faster in daylight and wind)
    let w = wet;
    if (s.rain > 0.02) w += s.rain * 0.022 * dt;
    else w -= (0.0035 + 0.003 * daylight + 0.0003 * s.wind) * dt;
    if (cover > 0 && s.temp > 1) w = Math.max(w, Math.min(0.6, cover));
    // snow: settles under snowfall, melts above freezing, is slowly worn off the road otherwise
    let c = cover;
    if (s.snow > 0.02) c += s.snow * 0.0065 * dt;
    else c -= (s.temp > 1 ? 0.004 : 0.0012) * dt;
    if (this.force) {
      // forced weather shows its settled state at once (a build-up has not wetted anything yet)
      const settled = this.stage === null || this.stage >= 1;
      if (settled && (this.force === 'storm' || this.force === 'rain' || this.force === 'hail')) w = 1;
      if (settled && (this.force === 'blizzard' || this.force === 'snow')) c = this.force === 'blizzard' ? 1 : 0.6;
      if (!settled) {
        w = 0;
        c = 0;
      }
      if (this.force === 'clear' || this.force === 'cloudy') {
        w = 0;
        c = 0;
      }
    }
    s.wetness = w < 0 ? 0 : w > 1 ? 1 : w;
    s.snowCover = c < 0 ? 0 : c > 1 ? 1 : c;
    return s;
  }
}
