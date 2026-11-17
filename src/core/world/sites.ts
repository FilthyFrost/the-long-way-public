/**
 * Places by the road (docs/DESIGN_V2.md 3.3, 8.1, 4.6): what there is to stop for.
 *
 *   station   a filling station: canopy, pumps, a kiosk, a tall sign — petrol in the old tank
 *   garage    a workshop with its gate open: tools, tyres, a car that never got mended
 *   shop      a roadside store: shelves
 *   house     somebody's house and shed: cupboards, cloth, firewood
 *   camp      a lay-by with a shelter, tables, a cold fire, crates left behind
 *   jetty     a lay-by above a lake, a jetty out over the water: fishing
 *   hide      a lay-by, and a hunter's stand at the edge of the wood beyond it: game
 *   lookout   a railing and a telescope where the land falls away
 *   roadside  not a place at all: wrecks and crates left on the verge
 *
 * Stretches are the slots the lakes and the landforms use (1250 m), each holds at most one place
 * and whatever lies about on its verges. A place with buildings stands on levelled ground beside
 * the road — the height function (terrain.ts) asks `padWeight` — so a car can turn in.
 *
 * Everything here is description: where each thing stands and how big it is, what cannot be
 * walked through, which containers there are and what seeds their contents, where petrol is left.
 * The scene draws it (game/scene/siteBuild.ts), the walker collides with it, the hands open it.
 * Pure and seeded: every player finds the same crate behind the same shed.
 */
import type { ContainerKind } from '../items/loot';
import { Rng, hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES } from './biomes';
import { LAND_SLOT } from './landform';
import { COAST_FADE, type CoastRun } from './sea';
import { Solid, solidWithin, type SolidSource } from './solids';
import { BiomeBlend, SpineSample } from './spine';
import type { TerrainPoint, World } from './terrain';
import type { Lake, River } from './water';

/** how likely a stretch is to have a place, one, two, three or more stretches after the last (WorldOptions.placeOdds) */
const PLACE_ODDS: readonly [number, number, number] = [0.2, 0.45, 0.8];

/** metres of road per stretch (the same as a water slot and a landform) */
export const SITE_SLOT = LAND_SLOT;
/** the levelled ground starts where the shoulder ends (terrain.ts ROAD_EDGE) */
export const PAD_FROM = 4.5;
/** how far beyond each end of the levelled ground the verge takes to come back (m) */
const FADE = 12;
/** fall of the levelled ground away from the road (rise per metre) */
export const PAD_FALL = 0.012;

export const SITE_KINDS = ['station', 'garage', 'shop', 'house', 'camp', 'jetty', 'hide', 'lookout', 'lighthouse', 'works', 'roadside'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** the pictogram on a place's board */
export const SIGN = { none: 0, fuel: 1, wrench: 2, shop: 3, house: 4, camp: 5, fish: 6, game: 7, view: 8, light: 9, works: 10 } as const;

export type ObjectKind =
  | 'building'
  | 'canopy'
  | 'pump'
  | 'lid'
  | 'signpole'
  | 'board'
  | 'icebox'
  | 'crate'
  | 'barrel'
  | 'drum'
  | 'tyres'
  | 'toolbox'
  | 'workbench'
  | 'lift'
  | 'shelf'
  | 'counter'
  | 'cupboard'
  | 'wardrobe'
  | 'desk'
  | 'cabinet'
  | 'ktable'
  | 'bed'
  | 'table'
  | 'bench'
  | 'firering'
  | 'log'
  | 'tent'
  | 'caravan'
  | 'shelter'
  | 'wreck'
  | 'fence'
  | 'mailbox'
  | 'tank'
  | 'woodpile'
  | 'line'
  | 'patch'
  | 'trolley'
  | 'jetty'
  | 'boat'
  | 'rack'
  | 'tacklebox'
  | 'icehole'
  | 'stand'
  | 'bag'
  | 'trough'
  | 'rail'
  | 'scope'
  | 'lighthouse'
  | 'wallrun'
  | 'pipes'
  | 'silo';

export interface BuildingSpec {
  roof: 'gable' | 'mono' | 'flat';
  /** the opening in the front wall: offset along the wall from its middle, and width (m) */
  doorAt: number;
  doorW: number;
  /** a wide gate (a workshop, a shed) rather than a door */
  gate: boolean;
  /** windows in the front wall: offsets along it, and their width */
  windows: number[];
  windowW: number;
  /** windows in the end walls too */
  sideWindows: boolean;
  /** depth of the roof over the front (m): a porch on posts, or an awning without */
  porch: number;
  porchPosts: boolean;
  chimney: boolean;
  /** pictogram on the board over the door (SIGN) */
  sign: number;
}

/**
 * One thing standing at a place. It is drawn and collided with in its own frame: `yaw` is the
 * heading of its long axis u = (cos yaw, sin yaw), v = (−sin yaw, cos yaw) is across, and its
 * front is the −v side (a building's door wall).
 */
export interface SiteObject {
  kind: ObjectKind;
  x: number;
  /** the level it stands on (a building's floor, a jetty's deck) */
  y: number;
  z: number;
  yaw: number;
  /** size along u, across, and up (m) */
  w: number;
  d: number;
  h: number;
  /** variant: which wreck (+ 8 for one stripped long ago), which pictogram, which paint */
  v: number;
  /** nose-up and right-side-up lean (rad): wrecks settle into the ditch */
  pitch: number;
  roll: number;
  b: BuildingSpec | null;
}

export interface SiteContainer {
  /** stable id: the same crate for every player and across saves */
  id: string;
  kind: ContainerKind;
  /**
   * The box that is searched: the centre of its base, its heading, half length, height and half
   * width (m). For a crate it is the crate; for a wreck, the space by its open door or behind its boot.
   */
  x: number;
  y: number;
  z: number;
  yaw: number;
  hx: number;
  h: number;
  hz: number;
  /** how high above the base the things found are laid out: inside an open crate, on a counter's top, on the ground by a car */
  shelf: number;
  /** the box is a thing standing there (a crate), not just the place to search by a car's door */
  solid: boolean;
  /** which of the site's objects it is (it moves with it when a car shoves it), −1 for a place by a bigger thing */
  obj: number;
  /** seeds what is inside (items/loot.ts rollLoot) */
  seed: number;
}

/** a thing lying in plain sight */
export interface SiteLoose {
  id: string;
  item: string;
  n: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** petrol left somewhere: a station's tank, a wreck's */
export interface SiteFuel {
  id: string;
  x: number;
  y: number;
  z: number;
  litres: number;
  /** 'tank' is siphoned at the station's rate, 'wreck' at a wreck's (5.6) */
  from: 'tank' | 'wreck';
}

export class Site {
  id = '';
  slot = 0;
  kind: SiteKind = 'roadside';
  seed = 0;
  /** the country it stands in (a biome id): what grows over it, whether snow lies on it */
  biome = 'plains';
  /** the road point it is anchored to: arc length, side (+1 right, −1 left), position, heading */
  s = 0;
  side = 1;
  x = 0;
  y = 0;
  z = 0;
  phi = 0;
  /** its own frame on the plan: e1 along the road as the place sees it, e2 away from the road; `yaw` is e1's heading */
  yaw = 0;
  e1x = 1;
  e1z = 0;
  e2x = 0;
  e2z = 1;
  /** levelled ground: half length along the road, far edge measured from the centre line, width of the bank beyond it; depth 0 = none */
  halfL = 0;
  depth = 0;
  skirt = 14;
  /** what the levelled ground is: 0 packed gravel, 1 old concrete */
  ground = 0;
  objects: SiteObject[] = [];
  containers: SiteContainer[] = [];
  loose: SiteLoose[] = [];
  fuel: SiteFuel[] = [];
  solids: Solid[] = [];
  /** where the fish or the game are: centre and radius on the plan (0 = neither) */
  zoneX = 0;
  zoneZ = 0;
  zoneR = 0;
  /** everything of it lies within this distance of (x, z) */
  reach = 0;
  /** where the grass is trodden short: round the low things that stand out in the open (x, z, radius) */
  bare: number[] = [];
  /** counts up whenever something of it is moved (a car shoved a crate): whoever draws it draws it again */
  version = 0;
}

/**
 * How high above its base the things found in a container are laid out: on the bottom of an open
 * crate, on the top of what has a lid or a top, on a board of a set of shelves (the scene draws the
 * boards at the same heights: `shelfBoards`).
 */
export function shelfOf(o: SiteObject): number {
  switch (o.kind) {
    case 'crate':
      return 0.09;
    case 'shelf': {
      const boards = shelfBoards(o.h);
      let best = boards[0];
      for (const y of boards) if (Math.abs(y - 1.05) < Math.abs(best - 1.05)) best = y;
      return best + 0.01;
    }
    case 'cupboard':
    case 'wardrobe':
    case 'desk':
    case 'cabinet':
      return o.h * 0.5 + 0.01;
    default:
      return o.h + 0.01;
  }
}

/** the heights of the boards of a set of shelves h metres tall (above its base) */
export function shelfBoards(h: number): number[] {
  const n = Math.max(3, Math.round(h / 0.45));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(0.12 + (i * (h - 0.16)) / (n - 1));
  return out;
}

/** odds of each kind of place by biome: station, garage, shop, house, camp, hide, lookout */
const ODDS: Record<string, readonly number[]> = {
  plains: [0.15, 0.14, 0.13, 0.24, 0.14, 0.14, 0.06],
  desert: [0.22, 0.19, 0.11, 0.13, 0.22, 0, 0.13],
  alpine: [0.12, 0.09, 0.08, 0.28, 0.14, 0.19, 0.1],
  // (cabins and hunters' stands in the forest; shops and houses by the lakes — their jetties come with the lakes)
  forest: [0.1, 0.08, 0.06, 0.3, 0.16, 0.24, 0.06],
  lakes: [0.12, 0.08, 0.14, 0.26, 0.2, 0.1, 0.1],
  maple: [0.12, 0.1, 0.1, 0.28, 0.14, 0.16, 0.1],
};
const PICKS: readonly SiteKind[] = ['station', 'garage', 'shop', 'house', 'camp', 'hide', 'lookout'];

/** half length and depth of the levelled ground each kind asks for, and the smaller one it will settle for */
const PADS: Record<SiteKind, readonly [number, number, number, number]> = {
  station: [24, 30, 18, 24],
  garage: [20, 30, 16, 24],
  shop: [18, 28, 15, 22],
  house: [18, 30, 15, 24],
  camp: [16, 20, 13, 14],
  jetty: [12, 20, 10, 9],
  hide: [12, 13, 10, 10],
  lookout: [14, 16, 11, 12],
  lighthouse: [15, 19, 12, 13],
  works: [20, 28, 17, 23],
  roadside: [0, 0, 0, 0],
};

interface Fit {
  s: number;
  side: number;
  cost: number;
}

const st = new SpineSample();
const bl = new BiomeBlend();

export class SitePlan implements SolidSource {
  /** list[k] = what slot k holds: the place (if any) first, then the verge's odds and ends; filled in order */
  private readonly list: Site[][] = [];
  private readonly places: (Site | null)[] = [];
  /** a second place in a slot that has one (WorldOptions.secondPlace: ModCar's), well away from the first */
  private readonly seconds: (Site | null)[] = [];
  private readonly byId = new Map<string, Site>();
  private readonly seed: number;
  private growing = false;
  /** slots since the last place, and since the last filling station */
  private sincePlace = 1;
  private sinceStation = 3;
  private lastKind: SiteKind = 'roadside';
  private readonly br: { river: River | null; mask: number } = { river: null, mask: 0 };
  private stations = 0;

  /**
   * @param tp a point of the caller's to write into (the plan asks the land about itself while
   *           the land is asking the plan: it must not borrow the land's own scratch)
   */
  constructor(
    private readonly world: World,
    private readonly tp: TerrainPoint,
    seed: number,
  ) {
    this.seed = hash2(seed | 0, 0x517e, 77);
  }

  // ------------------------------------------------------------------------------------------ asking

  /** has slot k been laid out? */
  ready(k: number): boolean {
    return k < this.list.length;
  }

  /**
   * Lay out every slot up to k. While a slot is being laid out the plan is asking the land for
   * heights, and those questions must not start another layout: then this does nothing.
   */
  ensure(k: number): void {
    if (this.growing || k < this.list.length) return;
    this.growing = true;
    try {
      while (this.list.length <= k) this.grow();
    } finally {
      this.growing = false;
    }
  }

  /** everything in slot k: the place first (if there is one), then the verge */
  sitesOf(k: number): readonly Site[] {
    if (k < 0) return [];
    this.ensure(k);
    return this.list[k] ?? [];
  }

  /** the place of slot k (null: only the verge) */
  placeOf(k: number): Site | null {
    if (k < 0) return null;
    this.ensure(k);
    return this.places[k] ?? null;
  }

  /** places and verges anchored within [sMin, sMax] */
  between(sMin: number, sMax: number, out: Site[]): Site[] {
    const k0 = Math.max(0, Math.floor(sMin / SITE_SLOT));
    const k1 = Math.floor(sMax / SITE_SLOT);
    for (let k = k0; k <= k1; k++) for (const s of this.sitesOf(k)) out.push(s);
    return out;
  }

  /**
   * How fully (s, d) lies on a place's levelled ground: 0…1. Never lays anything out: a slot not
   * yet asked for has no ground to level (the land asks `ensure` first).
   * @param d metres to the right of the centre line (negative: left)
   */
  padWeight(s: number, d: number): number {
    const k = Math.floor(s / SITE_SLOT);
    if (k < 0 || k >= this.places.length) return 0;
    const a = this.padOf(this.places[k], s, d);
    if (a > 0) return a;
    return this.padOf(this.seconds[k] ?? null, s, d);
  }

  /** padWeight of one place's levelled ground */
  private padOf(p: Site | null, s: number, d: number): number {
    if (!p || p.depth <= 0) return 0;
    const dd = d * p.side;
    if (dd <= 0 || dd >= p.depth + p.skirt) return 0;
    const as = s < p.s ? p.s - s : s - p.s;
    if (as >= p.halfL + FADE) return 0;
    const along = as <= p.halfL ? 1 : 1 - smoothstep(p.halfL, p.halfL + FADE, as);
    const across = dd <= p.depth ? 1 : 1 - smoothstep(p.depth, p.depth + p.skirt, dd);
    this.padGround = p.ground;
    return along * across;
  }

  /** what the levelled ground of the last `padWeight` hit is: 0 gravel, 1 concrete */
  padGround = 0;

  /**
   * Is the grass trodden short at (x, z)? Round crates on the verge, a trough in a clearing, the
   * foot of a hunter's stand. Like `padWeight` it never lays anything out.
   */
  bareAt(x: number, z: number): boolean {
    const k = Math.floor(this.world.spine.sAtX(x) / SITE_SLOT);
    if (k < 0 || k >= this.list.length) return false;
    for (const site of this.list[k]) {
      const b = site.bare;
      for (let i = 0; i < b.length; i += 3) {
        const dx = x - b[i];
        const dz = z - b[i + 1];
        if (dx * dx + dz * dz < b[i + 2] * b[i + 2]) return true;
      }
    }
    return false;
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const s = this.world.spine.sAtX(x);
    const k0 = Math.max(0, Math.floor((s - 400) / SITE_SLOT));
    const k1 = Math.floor((s + 400) / SITE_SLOT);
    for (let k = k0; k <= k1; k++) {
      for (const site of this.sitesOf(k)) {
        const dx = x - site.x;
        const dz = z - site.z;
        const reach = site.reach + r;
        if (dx * dx + dz * dz > reach * reach) continue;
        for (const sd of site.solids) if (solidWithin(sd, x, z, r)) out.push(sd);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ laying out

  private biomeId(s: number): string {
    this.world.spine.biomeAt(s, bl);
    return BIOMES[bl.t < 0.5 ? bl.a : bl.b].id;
  }

  private groundAt(x: number, z: number): number {
    this.world.shape(x, z, this.tp);
    return this.tp.h;
  }

  private grow(): void {
    const k = this.list.length;
    const here: Site[] = [];
    // (pushed before it is built: the land, asked about this slot meanwhile, finds nothing levelled yet)
    this.list.push(here);
    this.places.push(null);
    this.seconds.push(null);
    const r = new Rng(hash2(k, 0x51e0, this.seed));
    const place = k >= 1 ? this.makePlace(k, r) : null;
    if (place) {
      here.push(place);
      this.lastKind = place.kind;
      this.sincePlace = 0;
      this.sinceStation = place.kind === 'station' ? 0 : this.sinceStation + 1;
      if (place.kind === 'station') this.stations++;
    } else {
      this.sincePlace++;
      this.sinceStation++;
    }
    // Now and then, where the dice left a stretch empty, an old waterworks stands by the road. It is
    // outside the count: the rhythm of the other places (and every place there was before it existed)
    // stays what it was.
    const extra = place ? null : this.makeWorks(k);
    if (extra) here.push(extra);
    // (ModCar: a second place in a stretch that has one, well away from it — dice of their own, so that the
    // first place and the verges are what they would be without it)
    const second = place && this.world.secondPlace > 0 ? this.makeSecond(k, place, new Rng(hash2(k, 0x51e2, this.seed))) : null;
    if (second) here.push(second);
    for (const v of this.makeVerge(k, place ?? extra, new Rng(hash2(k, 0x51e1, this.seed)), second)) here.push(v);
    for (const site of here) this.byId.set(site.id, site);
  }

  /** one empty stretch in eight, away from the very start, the canyons, the bridges and the coast */
  private makeWorks(k: number): Site | null {
    if (k < 6 || (hash2(k, 0x3a7e5, this.seed) & 0xff) >= 26) return null;
    // (never two within a few stretches of each other)
    for (let q = k - 5; q < k; q++) if (q >= 0 && this.places[q]?.kind === 'works') return null;
    const world = this.world;
    if (world.land.kindOf(k) === 'canyon' || world.sea.coastOf(k) || world.water.feature(k)?.kind === 'river' || world.quiet(k)) return null;
    return this.tryPlace(k, 'works', null, new Rng(hash2(k, 0x51e2, this.seed)));
  }

  /** the dice for slot k, then somewhere to put what they chose */
  private makePlace(k: number, r: Rng): Site | null {
    const world = this.world;
    const land = world.land.kindOf(k);
    const water = world.water.feature(k);
    const id = this.biomeId((k + 0.5) * SITE_SLOT);
    const odds = ODDS[id] ?? ODDS.plains;
    let kind: SiteKind | null = null;
    const lake = water && water.kind === 'lake' ? water : null;
    // a filling station is never more than a tank away: one in the first few stretches, then every 22 km at the latest
    const needStation = this.sinceStation >= 18 || (this.stations === 0 && k >= 5);
    // every stretch of coast road has its lighthouse, about the middle of it
    const light = this.lightRun(k);
    // a quiet stretch is left alone (quiet.ts) — unless the tank needs it: a filling station comes first
    if (!needStation && !light && world.quiet(k)) return null;
    // between canyon walls there is no room for more than a lay-by, where the walls stand back
    if (land === 'canyon') {
      if (r.next() >= (this.sincePlace === 0 ? 0.2 : this.sincePlace === 1 ? 0.45 : 0.8)) return null;
      return this.tryPlace(k, 'camp', null, r);
    }
    if (needStation) kind = 'station';
    else if (light) kind = 'lighthouse';
    else if (k === 1) kind = 'camp';
    // (not every lake has its jetty: two in five; the others keep their shores to themselves)
    else if (lake && this.shoreGap(lake) < 60 && r.next() < 0.42) kind = 'jetty';
    else {
      const po = this.world.placeOdds ?? PLACE_ODDS;
      const p = this.sincePlace === 0 ? po[0] : this.sincePlace === 1 ? po[1] : po[2];
      if (r.next() >= p) return null;
      kind = 'camp';
      for (let tries = 0; tries < 4; tries++) {
        const pick = PICKS[r.weighted(odds)];
        // two filling stations are never neighbours, and a lookout wants something to look out over
        if (pick === 'station' && this.sinceStation < 8) continue;
        if (pick === 'lookout' && land !== 'ridge' && land !== 'hillside') continue;
        // (and the same kind of place twice running is dull)
        if (pick === this.lastKind && tries < 3) continue;
        kind = pick;
        break;
      }
    }
    // a river's bridge takes the middle of its stretch: only small places fit beside it
    if (water && water.kind === 'river' && kind !== 'station') kind = kind === 'house' || kind === 'camp' ? kind : 'camp';
    const site = this.tryPlace(k, kind, lake, r, kind === 'lighthouse' ? light : null);
    if (site) return site;
    // no room for it as drawn: a lay-by with a few crates may still fit
    return kind !== 'camp' ? this.tryPlace(k, 'camp', null, r) : null;
  }

  /**
   * A second place in slot k (ModCar's), of another kind than the first and never a filling station, a jetty or a
   * lookout, at least 300 m beyond the first's levelled ground; null when the dice say no or there is no room
   */
  private makeSecond(k: number, first: Site, r: Rng): Site | null {
    const world = this.world;
    if (r.next() >= world.secondPlace) return null;
    const land = world.land.kindOf(k);
    if (land === 'canyon' || world.quiet(k)) return null;
    const water = world.water.feature(k);
    if (water && water.kind === 'river') return null;
    const odds = ODDS[this.biomeId((k + 0.5) * SITE_SLOT)] ?? ODDS.plains;
    let kind: SiteKind = 'camp';
    for (let tries = 0; tries < 6; tries++) {
      const pick = PICKS[r.weighted(odds)];
      if (pick === 'station' || pick === 'lookout' || pick === first.kind) continue;
      kind = pick;
      break;
    }
    return this.tryPlace(k, kind, null, r, null, first) ?? (kind !== 'camp' && first.kind !== 'camp' ? this.tryPlace(k, 'camp', null, r, null, first) : null);
  }

  /**
   * The coast run whose lighthouse belongs in slot k (null: none does): the middle stretch of the run,
   * or the next one if the middle had to be something else (a filling station comes first).
   */
  private lightRun(k: number): CoastRun | null {
    const c = this.world.sea.coastOf(k);
    if (!c) return null;
    for (const run of c.runs) {
      if (k < run.k0 || k > run.k1) continue;
      const mid = run.k0 + ((run.k1 - run.k0) >> 1);
      if (k === mid) return run;
      if (k === mid + 1 && this.places[mid]?.kind !== 'lighthouse') return run;
    }
    return null;
  }

  /** how far a lake's nearest shore lies from the road (m) */
  private shoreGap(l: Lake): number {
    this.world.spine.at(l.s, st);
    const dx = st.x - l.cx;
    const dz = st.z - l.cz;
    return Math.abs(-dx * l.az + dz * l.ax) - l.b;
  }

  private tryPlace(k: number, kind: SiteKind, lake: Lake | null, r: Rng, coast: CoastRun | null = null, avoid: Site | null = null): Site | null {
    const world = this.world;
    const land = world.land.kindOf(k);
    const pad = PADS[kind];
    let wantSide = r.next() < 0.5 ? 1 : -1;
    let only = 0;
    if (kind === 'jetty' && lake) only = lake.side;
    else if (coast) only = world.sea.coastOf(k)?.side ?? 0;
    // a lookout looks out: on the side where the land falls away
    else if (kind === 'lookout' && land === 'hillside') only = -world.land.sideOf(k);
    const canyon = land === 'canyon';
    for (let size = canyon ? 1 : 0; size < 2; size++) {
      const L = canyon ? 11 : pad[size * 2];
      let W = canyon ? 10 : pad[size * 2 + 1];
      let skirt = canyon ? 4 : 14;
      if (kind === 'jetty' && lake) {
        // between the road and the water: as much ground as there is
        W = Math.max(9, Math.min(W, this.shoreGap(lake) - 10));
        skirt = 8;
      }
      const fit = this.fit(k, L, W, skirt, kind === 'jetty' ? lake : null, only, wantSide, kind === 'jetty' || coast ? 7.5 : 5, r, coast, avoid);
      if (!fit) continue;
      const site = this.open(k, kind, fit, L, W, skirt, r, avoid ? 'q' : null);
      // (from here on the land of this slot is levelled: heights asked now are the heights things stand on)
      if (avoid) this.seconds[k] = site;
      else this.places[k] = site;
      this.furnish(site, lake, r);
      this.finish(site);
      return site;
    }
    return null;
  }

  /**
   * Somewhere in slot k for levelled ground of half length L reaching W from the centre line:
   * straight, nearly level road, no bridge, no water, and land that need not be cut or filled
   * much to meet it. The best of twelve places (with a little chance, so it is not always the flattest).
   */
  private fit(k: number, L: number, W: number, skirt: number, lake: Lake | null, only: number, wantSide: number, maxCut: number, r: Rng, coast: CoastRun | null = null, avoid: Site | null = null): Fit | null {
    const world = this.world;
    const sp = world.spine;
    const tp = this.tp;
    let lo = k * SITE_SLOT + 150;
    let hi = (k + 1) * SITE_SLOT - 150;
    if (coast) {
      // (where the shore is fully at the road, not where it is still coming in)
      lo = Math.max(lo, coast.s0 + COAST_FADE + 30);
      hi = Math.min(hi, coast.s1 - COAST_FADE - 30);
      if (hi - lo < 40) return null;
    }
    // towards water the land is meant to fall away, and the water must be a walk from the lay-by
    const water = lake ? 1 : coast ? 3 : 0;
    let best: Fit | null = null;
    for (let c = 0; c < 12; c++) {
      let sc: number;
      // (a jetty stands where the lake comes nearest the road: about the middle of its length)
      if (lake) sc = Math.max(lo, Math.min(hi, lake.s + lake.a * 0.05 * (c - 5.5)));
      else sc = lo + (hi - lo) * ((c + r.next()) / 12);
      // (a second place in the slot: well away from the first)
      if (avoid && Math.abs(sc - avoid.s) < avoid.halfL + L + 300) continue;
      // ---- the road there
      let bend = 0;
      let slope = 0;
      for (let q = sc - L - 16; q <= sc + L + 16; q += 6) {
        sp.at(q, st);
        const kp = st.kappa < 0 ? -st.kappa : st.kappa;
        const g = st.grade < 0 ? -st.grade : st.grade;
        if (kp > bend) bend = kp;
        if (g > slope) slope = g;
      }
      // (a short lay-by can follow a bend; a forecourt with buildings on it wants the road nearly straight)
      if (bend > (L > 16 ? 0.004 : 0.006) || slope > 0.055) continue;
      let onBridge = false;
      for (let q = sc - L - 45; q <= sc + L + 45 && !onBridge; q += 15) {
        world.water.bridgeAt(q, this.br);
        if (this.br.mask > 0) onBridge = true;
      }
      if (onBridge) continue;
      // ---- the land on either side
      for (const side of only !== 0 ? [only] : [wantSide, -wantSide]) {
        let cut = 0;
        let wet = false;
        for (let i = -1; i <= 1 && !wet; i++) {
          sp.at(sc + i * L, st);
          const nx = -Math.sin(st.phi) * side;
          const nz = Math.cos(st.phi) * side;
          const padH = st.y + st.bank * side * PAD_FROM - 0.075 - (W - PAD_FROM) * PAD_FALL;
          for (const b of [W * 0.55, W, W + skirt]) {
            world.shape(st.x + nx * b, st.z + nz * b, tp);
            // standing water where the ground would be: not here (a lake's own beach lies beyond the bank)
            if (tp.wl > -1e8 && tp.wl > tp.bed - 0.3 && b <= W) wet = true;
            if (b > W) {
              // (towards a lake or the sea the land is meant to fall: only rising ground has to be cut)
              const dh = tp.bed - padH;
              const c2 = water ? (dh > 0 ? dh : -dh * 0.45) : dh < 0 ? -dh : dh;
              if (c2 > cut) cut = c2;
            }
          }
        }
        if (wet || cut > maxCut) continue;
        if (water) {
          // … and the water itself must be a short walk from the lay-by, not across a wide beach
          sp.at(sc, st);
          const nx = -Math.sin(st.phi) * side;
          const nz = Math.cos(st.phi) * side;
          let shore = false;
          for (let b = W; b <= W + (lake ? 75 : 170) && !shore; b += 3) {
            world.shape(st.x + nx * b, st.z + nz * b, tp);
            shore = tp.wkind === water && tp.wl > tp.bed + 0.03;
          }
          if (!shore) continue;
        }
        const cost = cut + bend * 600 + slope * 30 + 1.2 * r.next() + (side === wantSide ? 0 : 0.6);
        if (!best || cost < best.cost) best = { s: sc, side, cost };
      }
    }
    return best;
  }

  /** a site anchored at a road point, with its frame */
  private open(k: number, kind: SiteKind, fit: Fit, L: number, W: number, skirt: number, r: Rng, tag: string | null = null): Site {
    const site = new Site();
    site.slot = k;
    site.kind = kind;
    site.id = `site${k}${tag ?? (kind === 'roadside' ? 'v' : 'p')}`;
    site.seed = r.nextU32();
    site.biome = this.biomeId(fit.s);
    site.s = fit.s;
    site.side = fit.side;
    this.world.spine.at(fit.s, st);
    site.x = st.x;
    site.y = st.y;
    site.z = st.z;
    site.phi = st.phi;
    site.yaw = fit.side > 0 ? st.phi : st.phi + Math.PI;
    site.e1x = Math.cos(site.yaw);
    site.e1z = Math.sin(site.yaw);
    site.e2x = -Math.sin(site.yaw);
    site.e2z = Math.cos(site.yaw);
    site.halfL = L;
    site.depth = W;
    site.skirt = skirt;
    return site;
  }

  // ------------------------------------------------------------------------------------------ putting things down

  /** a thing at (a, b) of the site's frame: a along the road, b metres out from the centre line */
  private put(site: Site, kind: ObjectKind, a: number, b: number, turn: number, w: number, d: number, h: number, v = 0): SiteObject {
    const x = site.x + site.e1x * a + site.e2x * b;
    const z = site.z + site.e1z * a + site.e2z * b;
    const o: SiteObject = { kind, x, y: this.groundAt(x, z), z, yaw: site.yaw + turn, w, d, h, v, pitch: 0, roll: 0, b: null };
    site.objects.push(o);
    return o;
  }

  /** a thing at (u, v) of another thing's frame, standing on that thing's level (plus `up`) */
  private putIn(site: Site, host: SiteObject, kind: ObjectKind, u: number, v: number, turn: number, w: number, d: number, h: number, vv = 0, up = 0): SiteObject {
    const c = Math.cos(host.yaw);
    const s = Math.sin(host.yaw);
    const o: SiteObject = { kind, x: host.x + c * u - s * v, y: host.y + up, z: host.z + s * u + c * v, yaw: host.yaw + turn, w, d, h, v: vv, pitch: 0, roll: 0, b: null };
    site.objects.push(o);
    return o;
  }

  private building(site: Site, a: number, b: number, turn: number, w: number, d: number, h: number, spec: Partial<BuildingSpec>, v = 0): SiteObject {
    const o = this.put(site, 'building', a, b, turn, w, d, h, v);
    // the floor is level: a plinth takes up whatever the ground does under it
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    let top = o.y;
    for (const [u, vv] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
      const g = this.groundAt(o.x + c * u - s * vv, o.z + s * u + c * vv);
      if (g > top) top = g;
    }
    o.y = top + 0.14;
    o.b = { roof: 'gable', doorAt: 0, doorW: 1, gate: false, windows: [], windowW: 1.1, sideWindows: false, porch: 0, porchPosts: false, chimney: false, sign: 0, ...spec };
    return o;
  }

  /**
   * A container that is a thing standing there (a crate, a toolbox, shelves, a counter): searched
   * where it stands, and what is found lies in it or on it.
   * @param shelf how high above its base the found things lie (default: inside it, at 0.72 of its height)
   */
  private container(site: Site, kind: ContainerKind, o: SiteObject, shelf = shelfOf(o)): void {
    const i = site.containers.length;
    site.containers.push({ id: `${site.id}/c${i}`, kind, x: o.x, y: o.y, z: o.z, yaw: o.yaw, hx: o.w / 2, h: o.h, hz: o.d / 2, shelf, solid: true, obj: site.objects.indexOf(o), seed: hash2(site.seed, i, 0xc0a7) });
  }

  /**
   * A container that is part of something bigger (a wreck's glovebox, its boot, a caravan's
   * cupboard): searched at a small box against the big thing's side — by the door, behind the boot —
   * and what is found is laid out on the ground there.
   * @param u, v where that box stands, in the big thing's own frame
   */
  private containerBy(site: Site, kind: ContainerKind, o: SiteObject, u: number, v: number, hx: number, hz: number): void {
    const i = site.containers.length;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const x = o.x + c * u - s * v;
    const z = o.z + s * u + c * v;
    site.containers.push({ id: `${site.id}/c${i}`, kind, x, y: this.groundAt(x, z), z, yaw: o.yaw, hx, h: 1.0, hz, shelf: 0.03, solid: false, obj: -1, seed: hash2(site.seed, i, 0xc0a7) });
  }

  /** a thing lying on the ground at (a, b), or on top of another thing */
  private lie(site: Site, item: string, n: number, a: number, b: number, r: Rng, on: SiteObject | null = null): void {
    let x: number;
    let z: number;
    let y: number;
    if (on) {
      const c = Math.cos(on.yaw);
      const s = Math.sin(on.yaw);
      x = on.x + c * a - s * b;
      z = on.z + s * a + c * b;
      y = on.y + on.h;
    } else {
      x = site.x + site.e1x * a + site.e2x * b;
      z = site.z + site.e1z * a + site.e2z * b;
      y = this.groundAt(x, z);
    }
    site.loose.push({ id: `${site.id}/l${site.loose.length}`, item, n, x, y, z, yaw: r.next() * 6.2832 });
  }

  /** odds and ends on the open ground of a place: n things from a list, never inside a building or on top of anything */
  private litter(site: Site, n: number, list: readonly string[], r: Rng): void {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 6; tries++) {
        const a = (r.next() * 2 - 1) * (site.halfL - 2.5);
        const b = 7.5 + r.next() * (site.depth - 9.5);
        const x = site.x + site.e1x * a + site.e2x * b;
        const z = site.z + site.e1z * a + site.e2z * b;
        let free = true;
        for (const o of site.objects) {
          const c = Math.cos(o.yaw);
          const s = Math.sin(o.yaw);
          const u = (x - o.x) * c + (z - o.z) * s;
          const v = -(x - o.x) * s + (z - o.z) * c;
          if (Math.abs(u) < o.w / 2 + 0.5 && Math.abs(v) < o.d / 2 + 0.5) free = false;
        }
        if (!free) continue;
        this.lie(site, list[r.int(list.length)], 1, a, b, r);
        break;
      }
    }
  }

  private petrol(site: Site, o: SiteObject, litres: number, from: 'tank' | 'wreck', up = 0.5): void {
    site.fuel.push({ id: `${site.id}/f${site.fuel.length}`, x: o.x, y: o.y + up, z: o.z, litres: Math.round(litres * 10) / 10, from });
  }

  /** the board every place has by the road at the end drivers come to first, its picture facing them */
  private boardAt(site: Site, sign: number): void {
    this.put(site, 'board', -(site.halfL - 2.5) * site.side, 6.9, Math.PI / 2, 1.3, 0.12, 2.5, sign);
  }

  /** a wreck settled into the ground it stands on */
  private wreck(site: Site, o: SiteObject, r: Rng): void {
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const hf = this.groundAt(o.x + c * o.w * 0.4, o.z + s * o.w * 0.4);
    const hb = this.groundAt(o.x - c * o.w * 0.4, o.z - s * o.w * 0.4);
    const hr = this.groundAt(o.x - s * o.d * 0.45, o.z + c * o.d * 0.45);
    const hl = this.groundAt(o.x + s * o.d * 0.45, o.z - c * o.d * 0.45);
    o.pitch = Math.atan2(hf - hb, o.w * 0.8);
    o.roll = Math.atan2(hl - hr, o.d * 0.9);
    o.y = (hf + hb + hr + hl) / 4;
    // one stripped long ago holds nothing (it can still be taken apart for its metal)
    if (o.v & 8) return;
    // under the dash and in the boot; and now and then a little petrol left in the tank
    this.containerBy(site, 'glovebox', o, o.w * 0.1, -o.d / 2 - 0.28, 0.45, 0.24);
    if ((o.v & 7) !== 3) this.containerBy(site, 'boot', o, -o.w / 2 - 0.3, 0, 0.26, o.d * 0.36);
    if (r.next() < 0.4) this.petrol(site, { ...o, x: o.x - c * o.w * 0.3 - s * o.d * 0.5, z: o.z - s * o.w * 0.3 + c * o.d * 0.5 }, 2 + 4 * r.next(), 'wreck', 0.7);
  }

  /** which wreck: 0 saloon, 1 pick-up, 2 van, 3 bus (seldom) — and its size */
  private wreckSize(r: Rng): [number, number, number, number] {
    const t = r.next();
    if (t < 0.07) return [3, 8.6, 2.4, 2.9];
    if (t < 0.42) return [0, 4.2, 1.7, 1.42];
    if (t < 0.72) return [1, 4.7, 1.8, 1.6];
    return [2, 4.4, 1.8, 1.95];
  }

  private furnish(site: Site, lake: Lake | null, r: Rng): void {
    const L = site.halfL;
    const W = site.depth;
    // one in two is laid out the other way round
    const f = r.next() < 0.5 ? 1 : -1;
    const paint = r.int(4);
    const pick = (list: readonly string[]): string => list[r.int(list.length)];
    switch (site.kind) {
      case 'station': {
        site.ground = 1;
        // (where the road gives less room, a smaller forecourt: everything a few metres closer in)
        const big = W >= 28;
        const cb = big ? 12.5 : 10.9;
        const kb = big ? 23.4 : 18.6;
        const kd = big ? 6.4 : 5.6;
        this.put(site, 'canopy', -3 * f, cb, 0, big ? 11 : 9.5, big ? 7 : 6, 4.6, paint);
        const p1 = this.put(site, 'pump', -5.5 * f, cb, 0, 0.9, 0.55, 1.5, paint);
        this.put(site, 'pump', -0.5 * f, cb, 0, 0.9, 0.55, 1.5, paint);
        const lid = this.put(site, 'lid', 4.4 * f, cb - 2.3, 0, 0.9, 0.9, 0.04);
        this.petrol(site, lid, 15 + 15 * r.next(), 'tank', 0.1);
        const kiosk = this.building(site, -2 * f, kb, 0, big ? 10 : 9, kd, 3.1, { roof: r.next() < 0.5 ? 'flat' : 'mono', doorAt: -2.6 * f, doorW: 1.1, windows: [1.6 * f], windowW: 3.4, sign: SIGN.fuel }, paint);
        const counter = this.putIn(site, kiosk, 'counter', 2.4 * f, 0.5, 0, 2.6, 0.7, 1.05);
        this.container(site, 'counter', counter);
        this.container(site, 'shelf', this.putIn(site, kiosk, 'shelf', -3.3 * f, kd / 2 - 0.6, 0, 2.2, 0.5, 1.9));
        if (r.next() < 0.6) this.container(site, 'shelf', this.putIn(site, kiosk, 'shelf', -0.4 * f, kd / 2 - 0.6, 0, 2.2, 0.5, 1.9));
        this.container(site, 'toolbox', this.put(site, 'toolbox', (big ? 3.7 : 3.2) * f, kb - 1.0, Math.PI / 2, 0.8, 0.45, 0.5));
        if (r.next() < 0.65) this.container(site, 'crate', this.put(site, 'crate', 4.6 * f, kb + 2.0, 0.3, 0.9, 0.7, 0.7));
        this.put(site, 'drum', -8.3 * f, kb - 1.2, 0, 0.6, 0.6, 0.88, 1);
        this.put(site, 'drum', -8.5 * f, kb - 0.3, 0, 0.6, 0.6, 0.88, 2);
        this.put(site, 'tyres', -8.2 * f, kb + 2.2, 0, 0.8, 0.8, 0.85);
        this.put(site, 'icebox', 0.9 * f, kb - kd / 2 - 0.45, 0, 0.9, 0.7, 1.7);
        this.put(site, 'signpole', (L - 4) * site.side, 7.6, Math.PI / 2, 2.6, 0.3, 8.4, SIGN.fuel);
        if (r.next() < 0.45) {
          const [t, w, d, h] = this.wreckSize(r);
          if (t !== 3) this.wreck(site, this.put(site, 'wreck', -5.5 * f, cb - 2.9, (r.next() - 0.5) * 0.12 + (r.next() < 0.5 ? Math.PI : 0), w, d, h, t), r);
        }
        this.lie(site, pick(['food.snack', 'keep.map', 'drink.water']), 1, -0.5, 0, r, counter);
        if (r.next() < 0.6) this.lie(site, 'keep.tape', 1, 0.6, 0.1, r, counter);
        if (r.next() < 0.45) this.lie(site, 'fuel.jerrycan', 1, -4.6 * f, cb + 1.1, r);
        this.lie(site, 'fuel.oil', 1, 0.2, 0.05, r, p1);
        if (r.next() < 0.3) this.lie(site, 'fuel.drum', 1, -9.3 * f, kb + 0.8, r);
        this.lie(site, pick(['mat.scrap', 'mat.rubber', 'mat.bottle']), 1 + r.int(2), 6.5 * f, kb + 1.4, r);
        this.litter(site, 2 + r.int(3), ['mat.scrap', 'mat.bottle', 'mat.rubber', 'mat.wire', 'food.snack'], r);
        break;
      }
      case 'garage': {
        const gb = W - 8.4;
        const shop = this.building(site, -2 * f, gb, 0, 11.6, 8.2, 4.0, { roof: r.next() < 0.6 ? 'mono' : 'flat', doorAt: -2.3 * f, doorW: 4.4, gate: true, windows: [3.7 * f], windowW: 1.6, sign: SIGN.wrench }, paint);
        const floor: SiteObject = { ...shop, h: 0 };
        this.putIn(site, shop, 'lift', -2.3 * f, 0.7, 0, 3.3, 0.4, 2.6);
        if (r.next() < 0.55) {
          const [t, w, d, h] = this.wreckSize(r);
          if (t !== 3) {
            const car = this.putIn(site, shop, 'wreck', -2.3 * f, 0.5, Math.PI / 2, w, d, h, t);
            this.containerBy(site, 'glovebox', car, car.w * 0.1, -car.d / 2 - 0.28, 0.45, 0.24);
          }
        }
        const bench = this.putIn(site, shop, 'workbench', 3.9 * f, 3.4, 0, 2.6, 0.7, 0.9);
        this.container(site, 'toolbox', this.putIn(site, shop, 'toolbox', 3.5 * f, 3.4, 0, 0.8, 0.45, 0.42, 0, 0.9));
        this.container(site, 'toolbox', this.putIn(site, shop, 'toolbox', 5.0 * f, -2.6, Math.PI / 2, 0.8, 0.45, 0.5));
        // the big parts are on the workshop's own shelves (loot kind 'garage': engines, radiators, tyres by tier)
        this.container(site, 'garage', this.putIn(site, shop, 'shelf', -5.2 * f, 1.2, Math.PI / 2, 2.4, 0.5, 2.0));
        if (r.next() < 0.7) {
          const [t, w, d, h] = this.wreckSize(r);
          if (t !== 3) this.wreck(site, this.put(site, 'wreck', 7.6 * f, Math.min(13.2, gb - 2), 0.5 * f + (r.next() - 0.5) * 0.3, w, d, h, t), r);
        }
        this.put(site, 'tyres', 4.9 * f, gb - 5.0, 0, 0.8, 0.8, 0.85);
        this.put(site, 'tyres', 5.9 * f, gb - 4.7, 0, 0.8, 0.8, 0.62);
        this.put(site, 'drum', -9.2 * f, gb - 3.2, 0, 0.6, 0.6, 0.88, 1);
        this.put(site, 'drum', -9.6 * f, gb - 2.3, 0, 0.6, 0.6, 0.88, 3);
        this.container(site, 'crate', this.put(site, 'crate', 5.3 * f, gb + 3.0, -0.2, 0.9, 0.7, 0.7));
        if (r.next() < 0.5) this.container(site, 'barrel', this.put(site, 'barrel', -9.4 * f, gb + 2.8, 0, 0.62, 0.62, 0.9));
        this.put(site, 'signpole', (L - 3.5) * site.side, 7.4, Math.PI / 2, 2.2, 0.3, 5.4, SIGN.wrench);
        this.lie(site, 'tyre.road', 1, 6.8 * f, gb - 4.0, r);
        if (r.next() < 0.5) this.lie(site, 'tyre.road', 1, 4.1 * f, gb - 3.9, r);
        if (r.next() < 0.4) this.lie(site, 'part.battery.1', 1, 0.6, 0.05, r, bench);
        this.lie(site, pick(['tool.wrench', 'part.sparkplug', 'mat.wire', 'mat.tape']), 1, -0.7, -0.05, r, bench);
        if (r.next() < 0.3) this.lie(site, 'tool.jack', 1, 1.6 * f, -2.4, r, floor);
        this.lie(site, pick(['fuel.oil', 'part.belt', 'mat.rubber']), 1, 4.6 * f, 0.4, r, floor);
        this.lie(site, 'mat.scrap', 1 + r.int(3), -6.4 * f, gb - 5.8, r);
        this.litter(site, 2 + r.int(3), ['mat.scrap', 'mat.rubber', 'mat.wire', 'mat.tape', 'mat.plank'], r);
        break;
      }
      case 'shop': {
        const sb = W - 7.6;
        const b = this.building(site, 0, sb, 0, 12, 7, 3.3, { roof: r.next() < 0.55 ? 'flat' : 'gable', doorAt: 0, doorW: 1.5, windows: [-3.7, 3.7], windowW: 2.8, porch: 2.2, sign: SIGN.shop }, paint);
        const floor: SiteObject = { ...b, h: 0 };
        this.container(site, 'shelf', this.putIn(site, b, 'shelf', -4.2 * f, 2.9, 0, 2.4, 0.5, 1.8));
        this.container(site, 'shelf', this.putIn(site, b, 'shelf', -1.2 * f, 2.9, 0, 2.4, 0.5, 1.8));
        const mid = this.putIn(site, b, 'shelf', -2.8 * f, 0.3, 0, 2.6, 0.55, 1.5);
        this.container(site, 'shelf', mid);
        const counter = this.putIn(site, b, 'counter', 3.9 * f, 0.6, Math.PI / 2, 2.6, 0.7, 1.05);
        this.container(site, 'counter', counter);
        this.container(site, 'crate', this.put(site, 'crate', -7.2 * f, sb - 2.2, 0.2, 0.9, 0.7, 0.7));
        if (r.next() < 0.6) this.container(site, 'crate', this.put(site, 'crate', 7.3 * f, sb + 1.4, -0.4, 0.9, 0.7, 0.7));
        this.put(site, 'trolley', 5.2 * f, sb - 6.6, 0.7, 1.0, 0.6, 1.0);
        this.put(site, 'bench', -3.4 * f, sb - 4.5, 0, 1.6, 0.45, 0.45);
        this.put(site, 'icebox', 4.6 * f, sb - 4.3, 0, 0.9, 0.7, 1.7);
        this.put(site, 'signpole', (L - 3.5) * site.side, 7.4, Math.PI / 2, 2.2, 0.3, 6.2, SIGN.shop);
        this.lie(site, pick(['food.can.beans', 'food.can.meat', 'drink.water']), 1 + r.int(2), 0.4, 0, r, mid);
        this.lie(site, pick(['spice.salt', 'spice.sugar', 'food.snack']), 1, -0.6, 0.05, r, mid);
        this.lie(site, pick(['keep.tape', 'mat.cells', 'drink.tea']), 1, 0.3, 0, r, counter);
        this.lie(site, pick(['food.rice', 'food.flour', 'food.can.beans']), 1, 1.5 * f, 1.6, r, floor);
        this.lie(site, pick(['drink.water', 'food.snack', 'mat.seeds']), 1 + r.int(2), 0.2 * f, -1.8, r, floor);
        if (r.next() < 0.5) this.lie(site, 'drink.water', 2, -3.0 * f, sb - 4.0, r);
        this.lie(site, pick(['mat.bottle', 'mat.cloth', 'mat.plank']), 1 + r.int(2), 6.4 * f, sb - 5.2, r);
        this.litter(site, 1 + r.int(3), ['mat.bottle', 'mat.plank', 'mat.cloth', 'food.snack'], r);
        break;
      }
      case 'house': {
        const big = W >= 28;
        const hb = W - 9;
        const b = this.building(site, -3 * f, hb, 0, 8.6, 6.6, 2.9, { roof: 'gable', doorAt: -1.7 * f, doorW: 1.0, windows: [1.9 * f], windowW: 1.3, sideWindows: true, porch: 1.7, porchPosts: true, chimney: r.next() < 0.8, sign: 0 }, paint);
        const floor: SiteObject = { ...b, h: 0 };
        this.container(site, 'cupboard', this.putIn(site, b, 'cupboard', 3.2 * f, 2.75, 0, 1.8, 0.5, 1.9));
        this.container(site, 'wardrobe', this.putIn(site, b, 'wardrobe', -3.7 * f, 1.4, Math.PI / 2, 1.4, 0.6, 2.0));
        const table = this.putIn(site, b, 'ktable', 1.0 * f, 0.2, 0, 1.4, 0.9, 0.76);
        const bed = this.putIn(site, b, 'bed', -2.3 * f, -1.9, 0, 2.0, 1.0, 0.5);
        const shed = this.building(site, 8.2 * f, hb + 3.6, 0, 3.4, 2.8, 2.2, { roof: 'mono', doorAt: 0, doorW: 1.8, gate: true }, paint + 1);
        this.container(site, r.next() < 0.3 ? 'toolbox' : 'crate', this.putIn(site, shed, 'crate', -0.8 * f, 0.6, 0.2, 0.9, 0.7, 0.7));
        if (r.next() < 0.6) this.container(site, 'barrel', this.putIn(site, shed, 'barrel', 0.9 * f, 0.7, 0, 0.62, 0.62, 0.9));
        if (big) {
          this.put(site, 'fence', -13 * f, 10, 0, 7, 0.1, 1.0);
          this.put(site, 'fence', 9 * f, 10, 0, 12, 0.1, 1.0);
        }
        this.put(site, 'mailbox', -8.6 * f, 6.9, 0, 0.3, 0.45, 1.15, paint);
        this.put(site, 'tank', -10 * f, hb + 2.2, 0, 1.7, 1.7, 3.3);
        this.put(site, 'woodpile', 2.0 * f, hb + 0.6, Math.PI / 2, 2.4, 0.7, 1.1);
        this.put(site, 'line', 9.5 * f, hb - 4.6, 0.15, 5.2, 0.1, 1.9, paint);
        this.put(site, 'patch', -11.5 * f, hb - 5.8, 0, 4.2, 2.4, 0.25);
        if (r.next() < 0.35) {
          const [t, w, d, h] = this.wreckSize(r);
          // (in the drive, nose to the house; where there is less room, along the road)
          if (t !== 3) this.wreck(site, this.put(site, 'wreck', 3.4 * f, big ? hb - 6.8 : 8.0, (big ? Math.PI / 2 : 0) + (r.next() - 0.5) * 0.2, w, d, h, t), r);
        }
        this.lie(site, pick(['food.can.beans', 'keep.book', 'mat.bottle', 'drink.tea']), 1, 0.2, 0, r, table);
        if (r.next() < 0.5) this.lie(site, pick(['keep.photo', 'spice.salt', 'mat.button']), 1, -0.4, 0.1, r, table);
        this.lie(site, pick(['mat.cloth', 'keep.book', 'mat.yarn']), 1, 0.3, 0.1, r, bed);
        this.lie(site, pick(['mat.bottle', 'food.flour', 'spice.sugar', 'mat.cells']), 1, 2.4 * f, 1.6, r, floor);
        this.lie(site, 'mat.firewood', 2 + r.int(3), 3.0 * f, hb + 1.2, r);
        if (r.next() < 0.45) this.lie(site, 'food.potato', 1 + r.int(3), -11.2 * f, hb - 5.6, r);
        if (r.next() < 0.5) this.lie(site, pick(['mat.cloth', 'mat.yarn']), 1, 9.2 * f, hb - 4.4, r);
        this.litter(site, 1 + r.int(3), ['mat.plank', 'mat.bottle', 'mat.rope', 'mat.firewood'], r);
        break;
      }
      case 'camp': {
        const small = W < 18;
        if (!small) {
          const sh = this.put(site, 'shelter', -5 * f, 14.6, 0, 5.2, 3.2, 2.6, paint);
          this.container(site, 'crate', this.putIn(site, sh, 'crate', 1.6 * f, 0.5, 0.25, 0.9, 0.7, 0.7));
          const t1 = this.put(site, 'table', 3 * f, 12.4, 0.1, 1.8, 1.6, 0.75);
          this.lie(site, pick(['food.can.meat', 'mat.bottle', 'drink.coffee', 'keep.map']), 1, 0.2, 0, r, t1);
          if (r.next() < 0.6) this.put(site, 'table', 7.6 * f, 15.2, 0.5, 1.8, 1.6, 0.75);
          this.put(site, 'firering', 1.2 * f, 16.7, 0, 1.4, 1.4, 0.25);
          this.put(site, 'log', 2.9 * f, 17.2, 1.2, 1.5, 0.35, 0.35);
          this.put(site, 'log', -0.3 * f, 17.9, -0.5, 1.4, 0.35, 0.35);
          const t = r.next();
          if (t < 0.45) this.put(site, 'tent', 10 * f, 11.6, 0.3 * f, 2.6, 2.0, 1.4, paint);
          else if (t < 0.8) {
            const van = this.put(site, 'caravan', 9.6 * f, 15.2, 0.3 * f, 4.2, 2.1, 2.4, paint);
            this.containerBy(site, 'cupboard', van, 0.95, -van.d / 2 - 0.28, 0.4, 0.24);
          }
          this.container(site, 'crate', this.put(site, 'crate', -8.6 * f, 12.8, 0.5, 0.9, 0.7, 0.7));
          if (r.next() < 0.55) this.container(site, 'crate', this.put(site, 'crate', 5.4 * f, 17.6, -0.3, 0.9, 0.7, 0.7));
          this.container(site, 'barrel', this.put(site, 'barrel', -2.6 * f, 17.4, 0, 0.62, 0.62, 0.9));
          this.lie(site, 'mat.firewood', 1 + r.int(3), 0.2 * f, 15.4, r);
          if (r.next() < 0.5) this.lie(site, pick(['mat.rope', 'mat.cloth', 'tool.torch']), 1, 8.4 * f, 12.6, r);
        } else {
          // a lay-by: a bench, a table, what somebody left
          const t1 = this.put(site, 'table', 2.5 * f, W - 3.4, 0.1, 1.8, 1.6, 0.75);
          this.lie(site, pick(['food.can.beans', 'mat.bottle', 'keep.map']), 1, 0.2, 0, r, t1);
          this.put(site, 'bench', -3.2 * f, W - 2.2, Math.PI, 1.6, 0.45, 0.45);
          this.container(site, 'crate', this.put(site, 'crate', -6.4 * f, W - 2.6, 0.4, 0.9, 0.7, 0.7));
          if (r.next() < 0.6) this.container(site, r.next() < 0.5 ? 'crate' : 'barrel', this.put(site, 'barrel', 5.6 * f, W - 2.4, 0, 0.62, 0.62, 0.9));
          if (r.next() < 0.5) this.put(site, 'firering', -0.2 * f, W - 3.0, 0, 1.4, 1.4, 0.25);
        }
        this.boardAt(site, SIGN.camp);
        break;
      }
      case 'jetty': {
        this.boardAt(site, SIGN.fish);
        this.put(site, 'bench', 2.4 * f, W - 1.6, Math.PI, 1.6, 0.45, 0.45);
        this.container(site, 'crate', this.put(site, 'crate', -3.6 * f, W - 1.7, 0.3, 0.9, 0.7, 0.7));
        if (lake) this.shore(site, lake, f, r);
        break;
      }
      case 'hide': {
        this.boardAt(site, SIGN.game);
        this.put(site, 'rack', 3.2 * f, W - 2.4, 0, 2.4, 0.2, 2.3);
        this.container(site, 'crate', this.put(site, 'crate', -4 * f, W - 2.2, 0.4, 0.9, 0.7, 0.7));
        this.lie(site, 'mat.rope', 1, 4.0 * f, W - 2.0, r);
        this.wood(site, f, r);
        break;
      }
      case 'works': {
        // an old waterworks: a long wall with its pipes at the back of a concrete yard, the pump house,
        // a round tank, pipes on their saddles between them, drums — one with petrol still in it
        site.ground = 1;
        this.boardAt(site, SIGN.works);
        const small = W < 26;
        const wb = W - 1.6;
        this.put(site, 'wallrun', 1.5 * f, wb, 0, small ? 17 : 22, 0.6, 5.2, paint);
        const hb = wb - 5.6;
        const house = this.building(site, -9.5 * f, hb, 0, 6.4, 5.2, 3.3, { roof: 'flat', doorAt: 1.3 * f, doorW: 1.1, windows: [-1.5 * f], windowW: 1.3, sideWindows: true, sign: SIGN.works }, 0);
        const floor: SiteObject = { ...house, h: 0 };
        const bench = this.putIn(site, house, 'workbench', -1.6 * f, 2.05, 0, 2.2, 0.7, 0.9);
        this.container(site, 'toolbox', this.putIn(site, house, 'toolbox', -1.9 * f, 2.05, 0, 0.8, 0.45, 0.42, 0, 0.9));
        this.container(site, 'garage', this.putIn(site, house, 'shelf', 2.6 * f, 0.4, Math.PI / 2, 2.2, 0.5, 2.0));
        this.lie(site, pick(['tool.wrench', 'mat.wire', 'mat.tape', 'fluid.coolant']), 1, 0.6, -0.05, r, bench);
        this.lie(site, pick(['mat.scrap', 'mat.rubber', 'fuel.oil']), 1, 0.4 * f, -1.2, r, floor);
        const silo = this.put(site, 'silo', (small ? 7.5 : 9.5) * f, wb - (small ? 6.4 : 7.6), 0, 5.6, 5.6, 5.2 + 1.2 * r.next(), paint);
        this.put(site, 'pipes', (small ? 0.4 : 1.2) * f, wb - 5.4, 0, small ? 6.5 : 8.5, 1.5, 1.05, paint);
        const d1 = this.put(site, 'drum', -4.6 * f, hb + 1.0, 0, 0.6, 0.6, 0.88, 1);
        this.put(site, 'drum', -3.8 * f, hb + 1.5, 0, 0.6, 0.6, 0.88, 3);
        this.put(site, 'drum', -4.1 * f, hb + 0.2, 0, 0.6, 0.6, 0.88, 0);
        this.petrol(site, d1, 6 + 8 * r.next(), 'tank', 0.9);
        this.container(site, 'crate', this.put(site, 'crate', (silo.w / 2 + 6.3) * f, wb - 3.0, 0.3, 0.9, 0.7, 0.7));
        this.container(site, 'crate', this.put(site, 'crate', -13.4 * f, hb - 3.4, -0.2, 0.9, 0.7, 0.7));
        if (r.next() < 0.6) this.container(site, 'barrel', this.put(site, 'barrel', -13.6 * f, hb + 1.6, 0, 0.62, 0.62, 0.9));
        if (r.next() < 0.5) {
          const [t, w, d, h] = this.wreckSize(r);
          if (t !== 3) this.wreck(site, this.put(site, 'wreck', 2.5 * f, 10.5, 0.25 * f + (r.next() - 0.5) * 0.3, w, d, h, t), r);
        }
        this.lie(site, 'mat.scrap', 1 + r.int(3), 4.2 * f, wb - 3.6, r);
        this.litter(site, 2 + r.int(3), ['mat.scrap', 'mat.wire', 'mat.bottle', 'mat.tape', 'mat.plank'], r);
        break;
      }
      case 'lighthouse': {
        this.boardAt(site, SIGN.light);
        // the keeper's cottage on the levelled ground, its door to the yard
        const hb = W - 4.6;
        const b = this.building(site, -5 * f, hb, 0, 6.6, 5.0, 2.7, { roof: 'gable', doorAt: 1.5 * f, doorW: 0.95, windows: [-1.5 * f], windowW: 1.1, sideWindows: true, porch: 0, porchPosts: false, chimney: true, sign: 0 }, paint);
        const floor: SiteObject = { ...b, h: 0 };
        this.container(site, 'cupboard', this.putIn(site, b, 'cupboard', -2.3 * f, 1.95, 0, 1.6, 0.5, 1.9));
        const desk = this.putIn(site, b, 'desk', 2.2 * f, 1.9, 0, 1.3, 0.6, 0.76);
        this.container(site, 'desk', desk);
        const bed = this.putIn(site, b, 'bed', -1.9 * f, -1.3, 0, 2.0, 1.0, 0.5);
        this.lie(site, pick(['keep.book', 'keep.map', 'tool.binoculars', 'drink.tea']), 1, 0.2, 0, r, desk);
        this.lie(site, pick(['mat.cloth', 'keep.book', 'mat.yarn']), 1, 0.3, 0.1, r, bed);
        this.lie(site, pick(['mat.bottle', 'mat.cells', 'food.can.beans']), 1, 1.2 * f, -0.6, r, floor);
        this.put(site, 'woodpile', -9.6 * f, hb + 0.4, Math.PI / 2, 2.2, 0.7, 1.0);
        this.container(site, 'barrel', this.put(site, 'barrel', -0.9 * f, hb + 1.2, 0, 0.62, 0.62, 0.9));
        // a bench at the edge of the yard, looking out to sea
        this.put(site, 'bench', 6 * f, W - 1.2, 0, 1.6, 0.45, 0.45);
        this.container(site, 'crate', this.put(site, 'crate', 9.5 * f, W - 2.4, 0.4, 0.9, 0.7, 0.7));
        this.lie(site, 'mat.firewood', 1 + r.int(3), -8.2 * f, hb - 1.4, r);
        this.strand(site, f, r);
        this.litter(site, 1 + r.int(2), ['mat.rope', 'mat.bottle', 'mat.plank'], r);
        break;
      }
      case 'lookout': {
        this.boardAt(site, SIGN.view);
        this.put(site, 'rail', 0, W - 0.7, 0, 2 * L - 6, 0.1, 1.05);
        this.put(site, 'scope', 1.6 * f, W - 1.5, 0, 0.3, 0.3, 1.5);
        this.put(site, 'bench', -5 * f, W - 2.6, Math.PI, 1.6, 0.45, 0.45);
        this.put(site, 'bench', 6 * f, W - 2.6, Math.PI, 1.6, 0.45, 0.45);
        const t1 = this.put(site, 'table', -1.5 * f, W - 5.2, 0.15, 1.8, 1.6, 0.75);
        if (r.next() < 0.6) this.lie(site, pick(['keep.photo', 'keep.map', 'mat.bottle']), 1, 0.3, 0, r, t1);
        this.container(site, 'crate', this.put(site, 'crate', -8.2 * f, W - 2.4, 0.5, 0.9, 0.7, 0.7));
        break;
      }
      default:
        break;
    }
    if (site.kind === 'station' || site.kind === 'garage' || site.kind === 'shop') this.boardAt(site, site.kind === 'station' ? SIGN.fuel : site.kind === 'garage' ? SIGN.wrench : SIGN.shop);
    else if (site.kind === 'house') this.boardAt(site, SIGN.house);
  }

  /** the water's edge below a lay-by: a jetty out over it (or a hut on the ice), a boat, a drying rack */
  private shore(site: Site, lake: Lake, f: number, r: Rng): void {
    const tp = this.tp;
    const world = this.world;
    const aj = -1.5 * f;
    // walk out from the lay-by until the water begins
    let bs = -1;
    for (let b = site.depth; b < site.depth + 110; b += 0.5) {
      world.shape(site.x + site.e1x * aj + site.e2x * b, site.z + site.e1z * aj + site.e2z * b, tp);
      if (tp.wkind === 1 && tp.wl > tp.bed + 0.03) {
        bs = b;
        break;
      }
    }
    if (bs < 0) return;
    const level = tp.wl;
    const turn = Math.PI / 2;
    if (lake.frozen > 0.5) {
      // on the ice: a hut over a hole
      const hut = this.put(site, 'building', aj, bs + 13, 0, 2.3, 2.3, 2.0, 5);
      hut.y = level + 0.02;
      hut.b = { roof: 'mono', doorAt: 0, doorW: 0.8, gate: false, windows: [], windowW: 0.6, sideWindows: true, porch: 0, porchPosts: false, chimney: true, sign: 0 };
      const hole = this.putIn(site, hut, 'icehole', 0, 0.2, 0, 0.6, 0.6, 0.02);
      this.container(site, 'tacklebox', this.putIn(site, hut, 'tacklebox', 0.7, 0.75, 0.3, 0.5, 0.3, 0.3));
      site.zoneX = hole.x;
      site.zoneZ = hole.z;
      site.zoneR = 6;
      return;
    }
    // the jetty runs out until the water is deep enough to fish, 13 m at most
    let len = 7;
    for (; len < 13; len += 0.5) {
      const b = bs + len - 1;
      world.shape(site.x + site.e1x * aj + site.e2x * b, site.z + site.e1z * aj + site.e2z * b, tp);
      if (tp.wl - tp.bed > 1.5) break;
    }
    const jetty = this.put(site, 'jetty', aj, bs - 1 + len / 2, turn, len, 1.8, 0.5 + Math.max(0.4, tp.wl - tp.bed));
    jetty.y = level + 0.5;
    this.container(site, 'tacklebox', this.putIn(site, jetty, 'tacklebox', len * 0.18, 0.55, 0.4, 0.5, 0.3, 0.3));
    this.lie(site, 'bait.worm', 1, -len * 0.2, -0.5, r, { ...jetty, h: 0 });
    if (r.next() < 0.75) this.put(site, 'boat', aj + 4.6 * f, bs - 2.4, turn + 0.5 * f, 3.4, 1.3, 0.55, r.int(3));
    const rack = this.put(site, 'rack', aj - 4.2 * f, bs - 3.6, 0.2, 2.4, 0.2, 1.9, 1);
    this.lie(site, 'mat.bamboo', 1, rack.w * 0.3, 0.3, r, { ...rack, h: 0 });
    if (r.next() < 0.3) this.lie(site, 'junk.boot', 1, aj + 2.2 * f, bs - 1.2, r);
    site.zoneX = site.x + site.e1x * aj + site.e2x * (bs + len + 4);
    site.zoneZ = site.z + site.e1z * aj + site.e2z * (bs + len + 4);
    site.zoneR = 22;
  }

  /**
   * The sea's edge below a lighthouse yard: the tower on the last of the land above the beach, a long
   * pier out over the shelf to where the water is deep enough to fish, a boat drawn up on the sand.
   */
  private strand(site: Site, f: number, r: Rng): void {
    const tp = this.tp;
    const world = this.world;
    const at = (a: number, b: number): TerrainPoint => {
      world.shape(site.x + site.e1x * a + site.e2x * b, site.z + site.e1z * a + site.e2z * b, tp);
      return tp;
    };
    // walk out from the yard until the water begins
    const ap = -7 * f;
    let bs = -1;
    for (let b = site.depth; b < site.depth + 200; b += 0.5) {
      if (at(ap, b).wkind === 3 && tp.wl > tp.bed + 0.03) {
        bs = b;
        break;
      }
    }
    if (bs < 0) return;
    const level = tp.wl;
    // the tower: off to one side of the yard, on the slope well above the tide
    // — of a few spots, the one where the ground falls least under its foot
    const bt = Math.max(site.depth + 9, Math.min(bs - 34, site.depth + 46));
    let ta = 11 * f;
    let tb = bt;
    let top = 0;
    let least = Infinity;
    for (const b of [bt, bt - 9, bt + 9, bt - 18, bt - 27, site.depth + 8]) {
      if (b < site.depth + 7 || b > bs - 22) continue;
      for (const a of [11 * f, 15 * f, 7 * f]) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const [u, v] of [[0, 0], [-2.7, 0], [2.7, 0], [0, -2.7], [0, 2.7]] as const) {
          const g = at(a + u, b + v).bed;
          if (g < lo) lo = g;
          if (g > hi) hi = g;
        }
        // (never on the beach itself: the foot well above the tide)
        if (lo < level + 2.4) continue;
        // (it belongs out towards the water: a spot back by the yard has to be a good deal flatter to win)
        const score = hi - lo + 0.03 * Math.abs(b - bt);
        if (score < least - 0.15) {
          least = score;
          ta = a;
          tb = b;
          top = hi;
        }
      }
    }
    const tower = this.put(site, 'lighthouse', ta, tb, 0, 5.2, 5.2, 19 + 4 * r.next(), r.int(4));
    // (its foot is level with the highest ground under it; the plinth takes up the fall of the slope)
    tower.y = (least < Infinity ? top : tower.y) + 0.12;
    // the pier: out until the water is deep enough, 30 m at most
    let len = 14;
    for (; len < 30; len += 0.5) if (at(ap, bs + len - 1).wl - tp.bed > 1.4) break;
    const pier = this.put(site, 'jetty', ap, bs - 1.5 + len / 2, Math.PI / 2, len, 2.1, 0.8 + Math.max(0.5, tp.wl - tp.bed), 1);
    pier.y = level + 0.8;
    this.container(site, 'tacklebox', this.putIn(site, pier, 'tacklebox', len * 0.3, 0.6, 0.4, 0.5, 0.3, 0.3));
    this.lie(site, 'bait.worm', 1, len * 0.12, -0.55, r, { ...pier, h: 0 });
    this.put(site, 'boat', ap + 5.2 * f, bs - 3.2, Math.PI / 2 + 0.45 * f, 3.4, 1.3, 0.55, r.int(3));
    if (r.next() < 0.7) this.put(site, 'boat', ap + 9.4 * f, bs - 4.4, Math.PI / 2 - 0.3 * f, 3.4, 1.3, 0.55, r.int(3));
    const rack = this.put(site, 'rack', ap - 4.6 * f, bs - 5.2, 0.2, 2.4, 0.2, 1.9, 1);
    this.lie(site, 'mat.rope', 1, rack.w * 0.3, 0.3, r, { ...rack, h: 0 });
    site.zoneX = site.x + site.e1x * ap + site.e2x * (bs + len + 5);
    site.zoneZ = site.z + site.e1z * ap + site.e2z * (bs + len + 5);
    site.zoneR = 26;
  }

  /** a hunter's stand out beyond a lay-by, and a salt lick further on for it to look at */
  private wood(site: Site, f: number, r: Rng): void {
    const tp = this.tp;
    const world = this.world;
    const level = (a: number, b: number): boolean => {
      const x = site.x + site.e1x * a + site.e2x * b;
      const z = site.z + site.e1z * a + site.e2z * b;
      world.shape(x, z, tp);
      if (tp.wl > -1e8 && tp.wl > tp.bed - 0.4) return false;
      const h0 = tp.bed;
      world.shape(x + site.e2x * 4, z + site.e2z * 4, tp);
      const d1 = tp.bed - h0;
      world.shape(x + site.e1x * 4, z + site.e1z * 4, tp);
      const d2 = tp.bed - h0;
      return d1 < 1.5 && d1 > -1.5 && d2 < 1.5 && d2 > -1.5;
    };
    for (const dist of [85, 70, 100, 115, 60]) {
      for (const da of [0, 22 * f, -22 * f]) {
        if (!level(da, dist)) continue;
        const stand = this.put(site, 'stand', da, dist, 0, 2.6, 2.6, 2.4);
        const bag = this.putIn(site, stand, 'bag', 0.75, 0.7, 0.4, 0.5, 0.4, 0.45, 0, 2.4);
        this.container(site, 'gamebag', bag);
        if (r.next() < 0.5) this.lie(site, 'ammo.bullet', 2, -0.6, 0.6, r, { ...stand, h: 2.4 });
        let lick = stand;
        for (const more of [42, 32, 54]) {
          if (!level(da, dist + more)) continue;
          lick = this.put(site, 'trough', da, dist + more, 0.3, 1.6, 0.5, 0.55);
          break;
        }
        site.zoneX = lick === stand ? stand.x + site.e2x * 30 : lick.x;
        site.zoneZ = lick === stand ? stand.z + site.e2z * 30 : lick.z;
        site.zoneR = 90;
        // the deer keep the grass short round the lick: a lawn in the meadow, seen from the stand
        site.bare.push(site.zoneX, site.zoneZ, 19);
        return;
      }
    }
  }

  /**
   * What lies about on the verges of slot k: wrecks and crates, clear of the place if there is
   * one. Each wreck and each heap of crates is a small site of its own, anchored at its road point.
   */
  private makeVerge(k: number, place: Site | null, r: Rng, second: Site | null = null): Site[] {
    const world = this.world;
    const sp = world.spine;
    const tp = this.tp;
    const out: Site[] = [];
    const canyon = world.land.kindOf(k) === 'canyon';
    /** a free spot on the verge: null when the dice land on a bridge, in water, on a steep bank, or on the place */
    const spot = (s: number, off: number): Site | null => {
      if (place && Math.abs(s - place.s) < place.halfL + 70) return null;
      if (second && Math.abs(s - second.s) < second.halfL + 70) return null;
      world.water.bridgeAt(s - 14, this.br);
      if (this.br.mask > 0) return null;
      world.water.bridgeAt(s + 14, this.br);
      if (this.br.mask > 0) return null;
      const side = r.next() < 0.5 ? 1 : -1;
      sp.at(s, st);
      const x = st.x - Math.sin(st.phi) * off * side;
      const z = st.z + Math.cos(st.phi) * off * side;
      world.shape(x, z, tp);
      if (tp.wl > -1e8 && tp.wl > tp.bed - 0.3) return null;
      const h0 = tp.h;
      world.shape(x - Math.sin(st.phi) * 1.6 * side, z + Math.cos(st.phi) * 1.6 * side, tp);
      if (tp.h - h0 > 0.9 || tp.h - h0 < -0.9) return null;
      const site = this.open(k, 'roadside', { s, side, cost: 0 }, 0, 0, 0, r);
      site.id = `site${k}v${out.length}`;
      return site;
    };
    const lo = k * SITE_SLOT + 30;
    const span = SITE_SLOT - 60;
    // ---- wrecks: most stretches have one or two. Three in five were stripped long ago; the others
    // still have something under the dash, and now and then petrol in the tank
    const t = r.next();
    const wrecks = k < 1 ? 0 : t < 0.32 ? 0 : t < 0.72 ? 1 : t < 0.94 ? 2 : 3;
    for (let i = 0; i < wrecks; i++) {
      const [type, w, d, h] = this.wreckSize(r);
      const off = (canyon ? 5.7 : 5.7 + 2.6 * r.next()) + d * 0.5;
      const site = spot(lo + span * r.next(), off);
      const stripped = r.next() < 0.6;
      // most stopped where they were going, some face the way they came, a few lie across
      const u = r.next();
      const turn = u < 0.55 ? (r.next() - 0.5) * 0.3 : u < 0.9 || w > 6 ? Math.PI + (r.next() - 0.5) * 0.3 : 0.9 * (r.next() < 0.5 ? 1 : -1);
      const tyre = r.next() < 0.3;
      if (!site) continue;
      const o = this.put(site, 'wreck', 0, off, turn + (site.side > 0 ? 0 : Math.PI), w, d, h, type + (stripped ? 8 : 0));
      this.wreck(site, o, r);
      if (tyre && !stripped) this.lie(site, 'tyre.road', 1, w * 0.5 + 1.0, off + 0.4, r);
      this.finish(site);
      out.push(site);
    }
    // ---- crates: something fell off, or was set down and never fetched; the first heap is right by the start
    const heaps = k === 0 ? 1 : r.next() < 0.36 ? 1 : 0;
    for (let i = 0; i < heaps; i++) {
      // (just off the shoulder, where the grass is thin and a driver sees them)
      const off = canyon ? 5.5 : 5.5 + 1.1 * r.next();
      const site = spot(k === 0 ? 260 + 160 * r.next() : lo + span * r.next(), off);
      if (!site) continue;
      const n = 1 + r.int(3);
      for (let j = 0; j < n; j++) {
        const barrel = r.next() < 0.25;
        const a = (j - (n - 1) / 2) * 1.25 + (r.next() - 0.5) * 0.4;
        const o = this.put(site, barrel ? 'barrel' : 'crate', a, off + r.next() * 0.9, (r.next() - 0.5) * 1.2, barrel ? 0.62 : 0.9, barrel ? 0.62 : 0.7, barrel ? 0.9 : 0.7, r.int(3));
        this.container(site, barrel ? 'barrel' : 'crate', o);
      }
      this.finish(site);
      out.push(site);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ what cannot be walked through

  private solid(site: Site, o: SiteObject, u: number, v: number, hx: number, hz: number, y0: number, y1: number, floor = false, turn = 0): void {
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const sd = new Solid().set(o.x + c * u - s * v, o.z + s * u + c * v, hx, hz, o.yaw + turn, y0, y1, floor, `${site.id}:${o.kind}`);
    sd.ref = site.objects.indexOf(o);
    site.solids.push(sd);
  }

  /**
   * A car ran into something light (the vehicle decides what is light: a crate, a barrel, a board, a
   * fence): it is shoved along the way the car was going and comes to rest askew — or flat, if it
   * stood on a post. Returns the site it belongs to (to be drawn again), or null if the solid is no
   * object of a site's.
   */
  knock(solid: Solid, vx: number, vz: number, speed: number): Site | null {
    const cut = solid.tag.indexOf(':');
    const site = cut > 0 ? this.byId.get(solid.tag.slice(0, cut)) : undefined;
    const o = site ? site.objects[solid.ref] : undefined;
    if (!site || !o || o.kind === 'building' || o.kind === 'wreck') return null;
    const v = Math.hypot(vx, vz) || 1;
    const far = Math.min(4, Math.max(0.6, 0.4 + speed * 0.2));
    const h = hash2(site.seed, solid.ref, 0x60c + site.version);
    o.x += (vx / v) * far;
    o.z += (vz / v) * far;
    o.y = this.groundAt(o.x, o.z);
    o.yaw += (((h & 0xff) / 255) - 0.5) * 1.4;
    // what stood on a post or on edge goes over; a barrel ends on its side; a crate only slides
    if (o.kind === 'board' || o.kind === 'mailbox' || o.kind === 'fence' || o.kind === 'rail' || o.kind === 'barrel' || o.kind === 'drum') o.roll = (h & 0x100 ? 1 : -1) * 1.5;
    else if (o.kind === 'table' || o.kind === 'bench' || o.kind === 'trolley') o.roll = speed > 6 ? (h & 0x100 ? 1 : -1) * 1.5 : 0;
    for (const c of site.containers) {
      if (c.obj !== solid.ref) continue;
      c.x = o.x;
      c.y = o.y;
      c.z = o.z;
      c.yaw = o.yaw;
    }
    site.solids.length = 0;
    site.bare.length = 0;
    this.finish(site);
    site.version++;
    return site;
  }

  private finish(site: Site): void {
    let reach = 0;
    for (const o of site.objects) {
      const far = Math.hypot(o.x - site.x, o.z - site.z) + Math.hypot(o.w, o.d) * 0.5 + 1;
      if (far > reach) reach = far;
      // low things out in the meadow would be lost in the grass: it is trodden short round them
      if (o.kind !== 'wreck' && o.kind !== 'building' && o.h < 1.4 || o.kind === 'stand' || o.kind === 'lighthouse') site.bare.push(o.x, o.z, Math.max(o.w, o.d) / 2 + (o.kind === 'stand' || o.kind === 'lighthouse' ? 2.4 : 0.9));
      // (what a car has laid flat keeps nobody out any more)
      if (o.kind !== 'wreck' && (o.roll > 1 || o.roll < -1)) continue;
      const y = o.y;
      const box = (h = o.h): void => this.solid(site, o, 0, 0, o.w / 2, o.d / 2, y - 0.3, y + h);
      const post = (u: number, v: number, rad: number, h: number): void => this.solid(site, o, u, v, rad, 0, y - 0.3, y + h);
      switch (o.kind) {
        case 'building': {
          const b = o.b!;
          const t = 0.24;
          const w2 = o.w / 2;
          const d2 = o.d / 2;
          // the floor (a step up from the ground), then the walls, the front one in two parts about its opening
          this.solid(site, o, 0, 0, w2, d2, y - 1.4, y, true);
          const l = b.doorAt - b.doorW / 2;
          const rr = b.doorAt + b.doorW / 2;
          if (l > -w2 + 0.05) this.solid(site, o, (-w2 + l) / 2, -d2 + t / 2, (l + w2) / 2, t / 2, y - 0.3, y + o.h);
          if (rr < w2 - 0.05) this.solid(site, o, (rr + w2) / 2, -d2 + t / 2, (w2 - rr) / 2, t / 2, y - 0.3, y + o.h);
          this.solid(site, o, 0, d2 - t / 2, w2, t / 2, y - 0.3, y + o.h);
          this.solid(site, o, -w2 + t / 2, 0, t / 2, d2, y - 0.3, y + o.h);
          this.solid(site, o, w2 - t / 2, 0, t / 2, d2, y - 0.3, y + o.h);
          if (b.porch > 0 && b.porchPosts) {
            post(-w2 + 0.3, -d2 - b.porch + 0.15, 0.09, o.h);
            post(w2 - 0.3, -d2 - b.porch + 0.15, 0.09, o.h);
          }
          break;
        }
        case 'canopy':
          for (const su of [-1, 1]) for (const sv of [-1, 1]) post(su * (o.w / 2 - 0.6), sv * (o.d / 2 - 0.6), 0.15, o.h);
          break;
        case 'shelter':
          this.solid(site, o, 0, o.d / 2 - 0.08, o.w / 2, 0.08, y - 0.3, y + o.h);
          post(-o.w / 2 + 0.1, -o.d / 2 + 0.1, 0.08, o.h);
          post(o.w / 2 - 0.1, -o.d / 2 + 0.1, 0.08, o.h);
          break;
        case 'signpole':
        case 'mailbox':
        case 'scope':
          post(0, 0, o.kind === 'signpole' ? 0.16 : 0.1, o.h);
          break;
        case 'board':
        case 'rack':
        case 'line':
          post(-o.w / 2 + 0.06, 0, 0.06, o.h);
          post(o.w / 2 - 0.06, 0, 0.06, o.h);
          break;
        case 'lift':
          post(-o.w / 2 + 0.15, 0, 0.14, o.h);
          post(o.w / 2 - 0.15, 0, 0.14, o.h);
          break;
        case 'barrel':
        case 'drum':
        case 'tyres':
        case 'silo':
          post(0, 0, o.w / 2, o.h);
          break;
        case 'wallrun':
          // (the wall and the buttresses and pipes on its face: nothing passes)
          this.solid(site, o, 0, -0.45, o.w / 2, 0.75, y - 0.3, y + o.h);
          break;
        case 'tank':
          box();
          break;
        case 'lighthouse':
          // (the plinth and the foot of the tower: round, and nobody gets in)
          post(0, 0, o.w / 2 + 0.25, o.h);
          break;
        case 'jetty':
          // a deck to walk on, from the bank out over the water
          this.solid(site, o, 0, 0, o.w / 2, o.d / 2, y - 0.2, y, true);
          break;
        case 'stand': {
          // a deck on legs, railed on three sides, with stairs up the front
          const deck = y + o.h;
          this.solid(site, o, 0, 0, o.w / 2, o.d / 2, deck - 0.15, deck, true);
          this.solid(site, o, 0, o.d / 2 - 0.05, o.w / 2, 0.05, deck, deck + 1.0);
          this.solid(site, o, -o.w / 2 + 0.05, 0, 0.05, o.d / 2, deck, deck + 1.0);
          this.solid(site, o, o.w / 2 - 0.05, 0, 0.05, o.d / 2, deck, deck + 1.0);
          const steps = Math.ceil(o.h / 0.24);
          for (let i = 1; i < steps; i++) {
            const top = y + (o.h * i) / steps;
            this.solid(site, o, -o.w / 2 + 0.5, -o.d / 2 - (steps - i) * 0.28 + 0.14, 0.5, 0.14, top - 0.12, top, true);
          }
          for (const su of [-1, 1]) for (const sv of [-1, 1]) post(su * (o.w / 2 - 0.12), sv * (o.d / 2 - 0.12), 0.07, o.h);
          break;
        }
        case 'fence':
        case 'rail':
          this.solid(site, o, 0, 0, o.w / 2, 0.06, y - 0.3, y + o.h);
          break;
        case 'lid':
        case 'firering':
        case 'patch':
        case 'icehole':
        case 'bag':
        case 'tacklebox':
          break;
        default:
          box();
      }
    }
    site.reach = reach;
  }
}
