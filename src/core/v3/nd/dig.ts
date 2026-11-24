/**
 * Digging (docs/ND/PLAN.md, ND3; Nomad Drive's Shovel, buried treasure, metal detector, Lock, Chest and its
 * treasure field model as the game and its assets have them):
 *
 *  - A place may have chests buried round it, the same for every visit of the same world: a minor place (a lay-by,
 *    a camp, a lookout, a water pump) three times in ten one, three to nine metres out from its edge and never on its
 *    road side (within 100° of the way to the road); a major one (a house, a shop, a garage, a station, works, a
 *    lighthouse) two times in three one or two, four to twelve metres out, clear of the drive in; never within four
 *    metres of another. Each lies 0.8 to 1.6 m down (for the look only), and has its key in the same place: on the
 *    ground on its road side, a metre and a half to three metres out from its edge.
 *  - The shovel digs a stroke a press, one at most every 0.55 s, where the line of sight meets bare ground within
 *    3 m; a stroke over a chest (within half a metre of it) brings it a stage nearer the top — four strokes and it is
 *    out, a chest one can carry; one anywhere else leaves a patch of sand for two minutes.
 *  - The metal detector, held, hears the nearest chest not yet dug at within 30 m (on the plan, from its coil): it
 *    beeps, the faster the nearer — every 0.9 s at 30 m to every 0.08 s at 0.57 m — and over it, within 0.57 m,
 *    holds a steady tone. A chest dug at once is heard no more.
 *  - A chest is locked: any key of its kind opens it, E held half a second with the key in the hands (the key stays
 *    in the lock); without one E only rattles the lock. Its lid opens and shuts with E in 0.5 s; shut, it can be
 *    carried, locked or not. Opened the first time it holds three or four things: food, drink, medicine, a battery,
 *    a tool, something worth having, something to wear.
 *
 * Pure: no three, no DOM.
 */
import { hash2, Rng } from '../../math/rng';
import { itemsOf, type ItemDef } from '../../modcar/items';

export const ND_SHOVEL = 'nd_shovel';
export const ND_DETECTOR = 'nd_metal_detector';
export const ND_CHEST = 'nd_chest_1';
export const ND_CHEST_RARE = 'nd_chest_2';
export const ND_KEY = 'nd_key_1';
export const ND_KEY_RARE = 'nd_key_2';

export const DIG = {
  /** a stroke at most this often (s) */
  coolS: 0.55,
  /** the ground within this along the line of sight (m) */
  reach: 3,
  /** a stroke reaches a chest within this of where it went in, on the plan (m) */
  probe: 0.5,
  stages: 4,
  /** a patch of sand where nothing was found lies this long (s) */
  sandS: 120,
  /** a chest's hole stays this long once the chest is out and taken away, then shrinks over the next (s) */
  holeS: 60,
  holeFadeS: 1.5,
  /** the chest's top under (−) or over the ground at each stage (m), and how it is turned (°, about y and z) */
  stageY: [-0.127, 0, 0.128, 0.255] as const,
  stageTwist: [[6, 3], [-4, -2], [8, 4], [0, 0]] as const,
  /** how long a chest takes to come up a stage (s) */
  moveS: 0.25,
} as const;

export const DETECT = {
  /** looked for this often (s) */
  everyS: 0.1,
  /** heard within this, on the plan (m) */
  range: 30,
  /** over it within this: a steady tone (m) */
  over: 0.57,
  /** between beeps at the edge of `over` and how much more by the edge of `range` (s) */
  beepMin: 0.08,
  beepSpan: 0.82,
} as const;

export const LOCK = {
  /** E held this long with the key (s) */
  holdS: 0.5,
  /** the lid's swing (s) */
  lidS: 0.5,
} as const;

/** how a place's chests are laid: chance, how many, how far out from its edge, how deep (m) */
const FIELD = {
  minor: { chance: 0.3, n: [1, 1], ring: [3, 9], depth: [0.8, 1.4] },
  major: { chance: 0.65, n: [1, 2], ring: [4, 12], depth: [0.9, 1.6] },
} as const;
/** two chests no nearer than this (m); a minor place's none within this of the way to the road (°); a major one's clear of the drive in by this (m) */
const APART = 4;
const ROAD_ARC = 100;
const SPUR = 7;
/** a key on the ground: this far out from the place's edge on its road side (m), keys this far apart */
const KEY_OUT = [1.5, 3] as const;
const KEY_APART = 0.8;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const MAJOR = new Set(['house', 'shop', 'garage', 'station', 'works', 'lighthouse']);

/** what of a place the field needs (core/world/sites.ts Site) */
export interface FieldSite {
  readonly id: string;
  readonly seed: number;
  readonly kind: string;
  /** the road point it is anchored to, and its frame: e1 along the road, e2 away from it */
  readonly x: number;
  readonly z: number;
  readonly e1x: number;
  readonly e1z: number;
  readonly e2x: number;
  readonly e2z: number;
  readonly halfL: number;
  readonly depth: number;
  readonly objects: readonly { readonly kind: string; readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly yaw: number }[];
}

export interface Treasure {
  id: string;
  x: number;
  z: number;
  /** how deep it lies (m; for the look) */
  depth: number;
  /** its chest and the key that opens it */
  chest: string;
  key: string;
  /** where its key lies */
  kx: number;
  kz: number;
  /** the chest's heading (rad) */
  yaw: number;
}

/** the footprint the field is laid round: the place's biggest building (else its levelled ground), centre and half sizes in the place's own frame */
function footprint(site: FieldSite): { cx: number; cz: number; hu: number; hv: number; yaw: number } {
  let best: FieldSite['objects'][number] | null = null;
  for (const o of site.objects) {
    if (o.kind !== 'building' && o.kind !== 'prefab' && o.kind !== 'canopy' && o.kind !== 'lighthouse' && o.kind !== 'stand') continue;
    if (!best || o.w * o.d > best.w * best.d) best = o;
  }
  if (best) return { cx: best.x, cz: best.z, hu: best.w / 2, hv: best.d / 2, yaw: best.yaw };
  // (no building: the levelled ground's middle)
  const v = Math.max(4, site.depth * 0.55);
  return { cx: site.x + site.e2x * v, cz: site.z + site.e2z * v, hu: Math.max(2, site.halfL * 0.5), hv: Math.max(1.5, site.depth * 0.25), yaw: Math.atan2(site.e1z, site.e1x) };
}

/** a direction (unit, on the plan) from a footprint's middle out through its edge, and the distance to that edge (a rounded rectangle) */
function edgeAlong(f: { hu: number; hv: number; yaw: number }, dx: number, dz: number): number {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const u = Math.abs(dx * c + dz * s);
  const v = Math.abs(-dx * s + dz * c);
  // (the rectangle's edge along that way, its corners rounded off a little)
  const t = Math.min(u > 1e-6 ? f.hu / u : Infinity, v > 1e-6 ? f.hv / v : Infinity);
  return Math.min(t, Math.hypot(f.hu, f.hv) * 0.92);
}

/**
 * The chests buried round a place, and where their keys lie (none: the place has none). The same for the same
 * place of the same world. `onRoad` says whether a point is on the road or its shoulder (no chest or key there).
 */
export function treasuresOf(site: FieldSite, worldSeed: number, onRoad: (x: number, z: number) => boolean): Treasure[] {
  const field = MAJOR.has(site.kind) ? FIELD.major : FIELD.minor;
  const r = new Rng(hash2(site.seed | 0, worldSeed | 0, 0x7e45));
  if (r.next() >= field.chance) return [];
  const n = field.n[0] + Math.floor(r.next() * (field.n[1] - field.n[0] + 1));
  const f = footprint(site);
  const toRoadX = -site.e2x;
  const toRoadZ = -site.e2z;
  const out: Treasure[] = [];
  const theta0 = r.next() * Math.PI * 2;
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 8; tries++, k++) {
      const th = theta0 + k * GOLDEN;
      const dx = Math.cos(th);
      const dz = Math.sin(th);
      const ring = field.ring[0] + r.next() * (field.ring[1] - field.ring[0]);
      const at = edgeAlong(f, dx, dz) + ring;
      const x = f.cx + dx * at;
      const z = f.cz + dz * at;
      // (never on the road side of a minor place; clear of a major one's drive in)
      const toward = (Math.acos(Math.max(-1, Math.min(1, dx * toRoadX + dz * toRoadZ))) * 180) / Math.PI;
      if (field === FIELD.minor && toward < ROAD_ARC) continue;
      if (field === FIELD.major) {
        const ru = (x - site.x) * site.e1x + (z - site.z) * site.e1z;
        const rv = (x - site.x) * site.e2x + (z - site.z) * site.e2z;
        const fv = (f.cx - site.x) * site.e2x + (f.cz - site.z) * site.e2z;
        const fu = (f.cx - site.x) * site.e1x + (f.cz - site.z) * site.e1z;
        if (Math.abs(ru - fu) < SPUR && rv < fv) continue;
      }
      if (onRoad(x, z)) continue;
      // (clear of the other buildings and of the chests already laid)
      let clear = true;
      for (const o of site.objects) {
        if (o.w < 1 && o.d < 1) continue;
        const c = Math.cos(o.yaw);
        const s = Math.sin(o.yaw);
        const u = (x - o.x) * c + (z - o.z) * s;
        const v = -(x - o.x) * s + (z - o.z) * c;
        if (Math.abs(u) < o.w / 2 + 1 && Math.abs(v) < o.d / 2 + 1) clear = false;
      }
      for (const t of out) if (Math.hypot(t.x - x, t.z - z) < APART) clear = false;
      if (!clear) continue;
      const depth = field.depth[0] + r.next() * (field.depth[1] - field.depth[0]);
      out.push({ id: `${site.id}/t${i}`, x, z, depth, chest: ND_CHEST, key: ND_KEY, kx: 0, kz: 0, yaw: r.next() * Math.PI * 2 });
      k++;
      break;
    }
  }
  // the keys: on the ground on the road side, out from the edge, side by side
  for (let i = 0; i < out.length; i++) {
    const at = edgeAlong(f, toRoadX, toRoadZ) + KEY_OUT[0] + r.next() * (KEY_OUT[1] - KEY_OUT[0]);
    const off = (i - (out.length - 1) / 2) * KEY_APART;
    let kx = f.cx + toRoadX * at + site.e1x * off;
    let kz = f.cz + toRoadZ * at + site.e1z * off;
    // (on the road: back towards the place until it is not)
    for (let step = 0; step < 8 && onRoad(kx, kz); step++) {
      kx -= toRoadX * 0.5;
      kz -= toRoadZ * 0.5;
    }
    out[i].kx = kx;
    out[i].kz = kz;
  }
  return out;
}

/** a stroke's chest: the one not yet out within reach of where the shovel went in, nearest first; its index, or −1 */
export function chestUnder(list: readonly { x: number; z: number; stage: number }[], x: number, z: number): number {
  let best = -1;
  let bd: number = DIG.probe;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.stage >= DIG.stages) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** the detector's sound for a chest this far off on the plan: 'tone' over it, the seconds between beeps, or null (none heard) */
export function beepFor(d: number): 'tone' | number | null {
  if (d < 0 || d > DETECT.range) return null;
  if (d <= DETECT.over) return 'tone';
  return DETECT.beepMin + (DETECT.beepSpan * (d - DETECT.over)) / (DETECT.range - DETECT.over);
}

// ------------------------------------------------------------------ the chest

export interface ChestState {
  /** its lock is on (absent: it was found so — a chest out of the ground starts locked) */
  unlocked?: boolean;
  /** its lid is open */
  open?: boolean;
  /** what was in it was laid in (on the first opening) */
  filled?: true;
  /** the buried chest it came out of (the dig's record of it) */
  from?: string;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** a treasure chest's (docs/ND/PLAN.md) */
    chest?: ChestState;
  }
}

/** the key a chest's lock takes */
export function keyFor(chest: string): string {
  return chest === ND_CHEST_RARE ? ND_KEY_RARE : ND_KEY;
}

/** what the first opening finds: three or four things (four or five in a rare one), each of a different kind of thing, none twice */
export function chestLoot(seed: number, rare = false): string[] {
  const r = new Rng(hash2(seed | 0, 0xc4e5, 0x2b));
  const n = (rare ? 4 : 3) + (r.next() < 0.5 ? 1 : 0);
  // (Nomad Drive's classes: food, water, medicine, power, utility, valuable, comfort — common and uncommon)
  const pools: (() => string[])[] = [
    () => ofCat('food', 2),
    () => ofCat('drink', 2),
    () => ofCat('med', 3).filter((id) => !id.startsWith('med_kit')),
    () => ['nd_battery'],
    () => ['nd_flashlight', 'nd_compass', 'nd_tire_kit', 'nd_engine_kit', 'nd_charger', 'nd_crowbar'],
    // (Nomad Drive's wooden hand is only ever a chest's filler: among its valuables)
    () => ['nd_film_pack', 'nd_coffee_pack', 'nd_seeds_apple', 'nd_seeds_tomato', 'nd_seeds_potato', 'nd_seeds_watermelon', 'nd_wooden_hand'],
    () => ofCat('wear', 2),
  ];
  const order = pools.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < order.length && out.length < n; i++) {
    const pool = pools[order[i]]().filter((id) => !out.includes(id));
    if (!pool.length) continue;
    out.push(pool[Math.floor(r.next() * pool.length) % pool.length]);
  }
  return out;
}

function ofCat(cat: string, stars: number): string[] {
  let list: ItemDef[] = [];
  try {
    list = itemsOf(cat as never);
  } catch {
    return [];
  }
  return list.filter((d) => d.stars <= stars && d.stars >= 1 && d.carry !== 'large').map((d) => d.id);
}
