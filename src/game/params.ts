import type { Quality } from './render/core';

export interface Params {
  seed: number;
  /** start distance along the road (m) */
  s: number;
  /** multiplies biome chapter lengths (small values pack biomes closer: handy for tests) */
  chapter: number;
  /** first biome id */
  biome: string;
  /** hour of day, 0–24; NaN = let time run from the default */
  time: number;
  weather: string;
  /** with a forced weather: where in its three acts it stands (0–1 build-up, 1–2 peak, 2–3 aftermath); NaN = peak */
  wstage: number;
  quality: Quality;
  /** cockpit; chase; hood = the driver's eye with the truck hidden (style comparisons); orbit = round the vehicle */
  view: 'cockpit' | 'chase' | 'hood' | 'orbit';
  /** vehicle id or short name (truck, van, offroad, rv) */
  vehicle: string;
  /** a seat or viewpoint of the vehicle (its `views` key); '' = the driver's seat */
  seat: string;
  /** orbit camera: yaw (deg, 0 = in front, 90 = on the right), pitch (deg), distance (m), height looked at (m above the ground) */
  orbit: [number, number, number, number];
  /** hide the right wall and the roof */
  cutaway: boolean;
  /** parked and set up: door and awning open */
  camp: boolean;
  /** which slots are installed: all, none, default, or a comma list of slot ids */
  slots: string;
  /** cabin lamp: true / false, null = on when it is dark */
  cabinLight: boolean | null;
  scene: 'proving' | 'world';
  /** robot driver */
  auto: boolean;
  /** screenshot mode: no main loop, the harness drives simulation and rendering */
  shot: boolean;
  bench: boolean;
  post: boolean;
  hud: boolean;
  /** world (debug, screenshots): the animals take no notice of the car or of anybody on foot */
  tame: boolean;
  // --- vehicle systems (docs/VEHICLE_SYSTEMS.md §11.3)
  /** relaxed | real ('' = relaxed) */
  assist: string;
  /** P R N D or M1…M6 ('' = D) */
  gear: string;
  /** handbrake latched */
  handbrake: boolean;
  /** off = the engine is not running at the start */
  engine: string;
  /** off | acc | on */
  ignition: string;
  /** light switch: off | auto | low | high */
  lightsw: string;
  /** state patch, e.g. fuel:0.1,battery:5,temp:115,flat:0,engine:30,quirks:1 */
  sys: string;
}

export function readParams(search: string = window.location.search): Params {
  const raw = new URLSearchParams(search);
  // a key given twice: the later one wins (a shot's own parameters override its set's base)
  const q = { get: (k: string): string | null => raw.getAll(k).at(-1) ?? null };
  const num = (k: string, d: number): number => {
    const v = q.get(k);
    if (v === null || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const flag = (k: string, d = false): boolean => {
    const v = q.get(k);
    if (v === null) return d;
    return v !== '0' && v !== 'false';
  };
  const quality = (q.get('quality') ?? 'high') as Quality;
  const orbit = (q.get('orbit') ?? '').split(',').map(Number);
  const o4 = (i: number, d: number): number => (Number.isFinite(orbit[i]) && orbit[i] !== undefined && (q.get('orbit') ?? '') !== '' ? orbit[i] : d);
  const viewQ = q.get('view');
  const cl = q.get('cabinlight');
  const shot = flag('shot');
  return {
    seed: num('seed', 20261113),
    s: num('s', 60),
    chapter: num('chapter', 1),
    biome: q.get('biome') ?? 'plains',
    time: num('time', NaN),
    weather: q.get('weather') ?? 'auto',
    wstage: num('wstage', NaN),
    quality: quality === 'low' || quality === 'med' || quality === 'high' ? quality : 'high',
    view: viewQ === 'chase' || viewQ === 'hood' || viewQ === 'orbit' ? viewQ : 'cockpit',
    vehicle: q.get('vehicle') ?? 't0_truck',
    seat: q.get('seat') ?? '',
    orbit: [o4(0, 35), o4(1, 14), o4(2, 11), o4(3, 1.3)],
    cutaway: flag('cutaway'),
    camp: flag('camp'),
    slots: q.get('slots') ?? 'default',
    cabinLight: cl === null || cl === '' ? null : cl !== '0' && cl !== 'false',
    scene: q.get('scene') === 'proving' ? 'proving' : 'world',
    auto: flag('auto'),
    shot,
    bench: flag('bench'),
    post: flag('post', true),
    hud: flag('hud', !shot),
    tame: flag('tame'),
    assist: q.get('assist') ?? '',
    gear: q.get('gear') ?? '',
    handbrake: flag('handbrake'),
    engine: q.get('engine') ?? '',
    ignition: q.get('ignition') ?? '',
    lightsw: q.get('lightsw') ?? '',
    sys: q.get('sys') ?? '',
  };
}
