/**
 * A save and the world it was made in, now that the generator has versions and, within version 2, revisions
 * (core/world/rules.ts WORLD_REV; docs/V3/nodes/W1-worldgen.md, step W1.3).
 *
 * WRITING. A save of a version 1 world names its seed and nothing more, as saves always did. A save of a
 * version 2 world also names the version, how many regions the world knows and the generator's revision
 * (`savedWorldOf`), and keeps what a later revision needs to make sense of it (`stampWorld`): beside every
 * vehicle, the walker and every thing lying about beyond the workshop's plots how far along the road it is,
 * and the kind of every place the save remembers something of.
 *
 * READING A SAVE OF ANOTHER REVISION (`worldMoved`, `rehome`). While version 2 is being built its worlds
 * change with the generator: the same seed lays another road through other land. Where the save says a
 * vehicle stands there may now be a hill or a lake. So before the game reads such a save it is rewritten in
 * place — the game then reads it as it reads any save:
 *
 *  - every vehicle beyond the workshop's plots stands on the road again at the arc length it had reached, in
 *    the lane and facing down the road as a game begun on the road stands its vehicle; two that were close
 *    together stand one behind the other, the one driven where it was;
 *  - the walker is beside the vehicle they sat in or were nearest to, else on the road's verge at their own
 *    arc length;
 *  - a thing lying about stays where it is on the plan and takes its height from the land; one that would lie
 *    in water or inside what stands there now is put beside the road at its arc length;
 *  - what was remembered of the places and the wrecks is kept where the place is still there under its id
 *    and still of its kind (a kept wreck then lies where the world has it now), and forgotten otherwise;
 *  - the revision is written as this build's.
 *
 * The workshop, its yard and the proving ground are plots of the world's land (seamless.ts): the same in every
 * revision. What stands or lies on them is left as it is.
 *
 * A world of version 1 never changes and never goes through this. Nothing here draws or touches the page: the
 * save and the world in, the save out (harness/sim/v3_world_save.test.ts).
 */
import { frameDef } from '../../core/modcar/frames';
import type { Text } from '../../core/modcar/types';
import { RULES_V1, WORLD_REV } from '../../core/world/rules';
import { SITE_SLOT, type Site } from '../../core/world/sites';
import { pushOut, Push, type Solid } from '../../core/world/solids';
import { SpineSample } from '../../core/world/spine';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { worldOfSave, type SavedWorld, type SaveV1 } from './save';

/** what the player is told when a save of another revision has been opened */
export const WORLD_CHANGED: Text = { zh: '世界有了变化，车和人已放回路上', en: 'the world is generated differently since this save was written: the vehicles and the traveller were put back on the road' };

/** a vehicle on the road stands this far right of the centre line (m): in the lane (ModGame.placeOnRoad) */
const LANE = 1.6;
/** no vehicle is stood on the first metres of the road: its tail would be in the workshop's gate */
const MIN_S = 6;
/** between two vehicles stood one behind the other (m) */
const GAP = 2;
/** the walker beside a vehicle: this far beyond its flank (m) */
const BESIDE = 1.3;
/** the walker on foot is put beside a vehicle that stood within this of them (m); further off they keep their own place along the road */
const NEAR_VEHICLE = 250;
/** the verge: the walker's place on it, and where things put beside the road begin (m right of the centre line; the paved surface ends at 4.5) */
const VERGE_WALK = 5.2;
const VERGE_THINGS = 5.8;
/** a place by the road that is under water or on a bridge is passed over in steps of this (m), no further than this many */
const DRY_STEP = 12;
const DRY_TRIES = 80;
/** no id of a place is believed that names a stretch beyond this (20,000 km of road): the places are laid out from the road's start to the one asked for */
const MAX_STRETCH = 16_000;

/** what `rehome` did, in numbers */
export interface Rehomed {
  /** vehicles stood on the road again */
  vehicles: number;
  /** the walker: left where they were (the workshop's plots), put beside a vehicle, or on the verge */
  walker: 'kept' | 'vehicle' | 'verge';
  /** things lying about that took their height from the land where they were, and those put beside the road */
  dropped: number;
  roadside: number;
  /** entries of the places' and the wrecks' memory forgotten, and kept wrecks laid where the world has them now */
  forgotten: number;
  wrecksMoved: number;
}

/** what a save says of the world it is written in */
export function savedWorldOf(world: World, seed: number): SavedWorld {
  const r = world.rules;
  // (version 1 with its own count: the seed alone, as every save before there were versions)
  if (r.version === 1) return r.regionCount === RULES_V1.regionCount ? { seed } : { seed, regionCount: r.regionCount };
  return { seed, version: r.version, regionCount: r.regionCount, rev: WORLD_REV };
}

/** is the save of a world this build generates otherwise now: of version 2 and written under another revision */
export function worldMoved(s: SaveV1): boolean {
  const w = worldOfSave(s);
  return !!w && w.version === 2 && w.rev !== WORLD_REV;
}

const tp = new TerrainPoint();
const st = new SpineSample();
const push = new Push();
const near: Solid[] = [];

/** is (x, z) within one of the caller's plots of the world's land (the workshop and its yard, the proving ground) */
function onPlot(world: World, x: number, z: number): boolean {
  for (const p of world.plots) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return true;
  return false;
}

/** the place an id of the places' or the wrecks' memory belongs to: `site12p/c3`, `site12p`, `site12p/b0/d1` are all of site12p */
function siteIdOf(id: string): string {
  const cut = id.indexOf('/');
  return cut < 0 ? id : id.slice(0, cut);
}

/** the stretch of the road a place's id names (site12p: 12); −1 for what is no place's id, or names a stretch further than any journey goes */
function stretchOf(siteId: string): number {
  const m = /^site(\d+)/.exec(siteId);
  const k = m ? Number(m[1]) : -1;
  return k <= MAX_STRETCH ? k : -1;
}

/**
 * The place of an id, in this world; null: it has none there. With `layOut` the places are laid out as far
 * down the road as the id says (they are laid out in order from the road's start); without it only a place
 * already laid out is found — and undefined says the stretch has not been, so nothing is known of it here.
 */
function siteOf(world: World, siteId: string, cache: Map<string, Site | null>, layOut: boolean): Site | null | undefined {
  const known = cache.get(siteId);
  if (known !== undefined) return known;
  const k = stretchOf(siteId);
  if (k >= 0 && !layOut && !world.sites.ready(k)) return undefined;
  const site = k >= 0 ? (world.sites.sitesOf(k).find((x) => x.id === siteId) ?? null) : null;
  cache.set(siteId, site);
  return site;
}

/** every id the save remembers something under at a place: the containers, the pumps, the things taken, the roadside workshops, the doors, the wrecks */
function rememberedIds(s: SaveV1): string[] {
  const p = s.places;
  const w = s.wrecks;
  return [...(p?.searched ?? []), ...Object.keys(p?.left ?? {}), ...Object.keys(p?.pumps ?? {}), ...(p?.taken ?? []), ...Object.keys(p?.shops ?? {}), ...Object.keys(p?.doors ?? {}), ...Object.keys(w?.kept ?? {}), ...(w?.gone ?? [])];
}

const cm = (v: number): number => Math.round(v * 100) / 100;

/**
 * A save of a version 2 world, as it is written: beside every vehicle, the walker and every thing lying about
 * beyond the plots, how far along the road its nearest road point is; and the kind of every place something
 * is remembered of. (A save of a version 1 world is left as it is.)
 *
 * Nothing is laid out for this: a place remembered since an earlier session, further down the road than this
 * session has been, keeps the kind the save it was loaded from had for it (`known`).
 */
export function stampWorld(s: SaveV1, world: World, known?: Readonly<Record<string, string>>): void {
  const w = s.world;
  if (!w || world.rules.version !== 2) return;
  for (const sv of s.vehicles) {
    if (onPlot(world, sv.x, sv.z)) continue;
    world.shape(sv.x, sv.z, tp);
    sv.s = cm(tp.s);
  }
  if (!onPlot(world, s.player.x, s.player.z)) {
    world.shape(s.player.x, s.player.z, tp);
    s.player.s = cm(tp.s);
  }
  for (const l of s.loose) {
    if (l.on !== undefined || onPlot(world, l.x, l.z)) continue;
    world.shape(l.x, l.z, tp);
    l.s = cm(tp.s);
  }
  const cache = new Map<string, Site | null>();
  const sites: Record<string, string> = {};
  let any = false;
  for (const id of rememberedIds(s)) {
    const siteId = siteIdOf(id);
    const site = siteOf(world, siteId, cache, false);
    const kind = site ? site.kind : site === undefined ? known?.[siteId] : undefined;
    if (kind === undefined) continue;
    sites[siteId] = kind;
    any = true;
  }
  if (any) w.sites = sites;
}

/** is the land at (x, z) somewhere a thing can lie and be found: not under water, not inside what stands at a place (the land is left in `tp`) */
function canLie(world: World, x: number, z: number): boolean {
  // (the places of the stretches round it laid out first: the land takes their levelled ground, and what stands on them is asked below)
  world.sites.ensure(Math.floor(Math.max(0, world.spine.sAtX(x)) / SITE_SLOT) + 1);
  world.shape(x, z, tp);
  if (tp.wl > tp.h + 0.02) return false;
  while (near.length > 0) near.pop();
  world.sites.solidsNear(x, z, 0.3, near);
  for (const sd of near) if (!sd.floor && sd.y1 > tp.h + 0.05 && pushOut(sd, x, z, 0.1, push)) return false;
  return true;
}

/**
 * A place beside the road at arc length s, d metres right of the centre line, that is dry and free; where the
 * road is on a bridge there or runs through water, the next such place further on. Left in `st` (the road
 * point) and returned as x, z and the land's height.
 */
function besideRoad(world: World, s: number, d: number, out: { x: number; y: number; z: number; s: number; phi: number }): void {
  let at = Math.max(MIN_S, s);
  for (let i = 0; i < DRY_TRIES; i++, at += DRY_STEP) {
    world.spine.at(at, st);
    out.x = st.x - Math.sin(st.phi) * d;
    out.z = st.z + Math.cos(st.phi) * d;
    if (canLie(world, out.x, out.z) && tp.bridge < 0.01) break;
  }
  out.y = tp.h;
  out.s = at;
  out.phi = st.phi;
}

/**
 * A save written under another revision of the generator, made fit for the world as this build makes it (see
 * the head of the file). Rewritten in place; the world must be the save's own (its seed, its version, its
 * region count) as this build generates it.
 */
export function rehome(s: SaveV1, world: World): Rehomed {
  const done: Rehomed = { vehicles: 0, walker: 'kept', dropped: 0, roadside: 0, forgotten: 0, wrecksMoved: 0 };
  const spot = { x: 0, y: 0, z: 0, s: 0, phi: 0 };

  // ---- the vehicles: on the road at the arc length each had reached
  interface Moved {
    sv: SaveV1['vehicles'][number];
    /** where it stood in the save */
    x0: number;
    z0: number;
    /** where along the road it is stood */
    at: number;
  }
  const moved: Moved[] = [];
  for (const sv of s.vehicles) {
    if (onPlot(world, sv.x, sv.z)) continue;
    let at = sv.s;
    if (typeof at !== 'number' || !Number.isFinite(at)) {
      // (a save without it: the road point nearest to where it stood, on the road as it runs now)
      world.shape(sv.x, sv.z, tp);
      at = tp.s;
    }
    moved.push({ sv, x0: sv.x, z0: sv.z, at: Math.max(MIN_S, at) });
  }
  moved.sort((a, b) => a.at - b.at);
  const body = (m: Moved): { front: number; rear: number; halfWidth: number } => frameDef(m.sv.build.frame).body;
  // the one driven stays at its arc length; those behind it make room backwards, then everything makes room forwards
  const seat = s.seat !== undefined ? s.vehicles[s.seat] : undefined;
  const anchor = Math.max(0, moved.findIndex((m) => m.sv === seat));
  for (let i = anchor - 1; i >= 0; i--) {
    const ahead = moved[i + 1];
    moved[i].at = Math.max(MIN_S, Math.min(moved[i].at, ahead.at + body(ahead).rear - body(moved[i]).front - GAP));
  }
  for (let i = 1; i < moved.length; i++) {
    const behind = moved[i - 1];
    moved[i].at = Math.max(moved[i].at, behind.at + body(behind).front - body(moved[i]).rear + GAP);
  }
  for (const m of moved) {
    world.spine.at(m.at, st);
    m.sv.x = st.x - Math.sin(st.phi) * LANE;
    m.sv.z = st.z + Math.cos(st.phi) * LANE;
    m.sv.yaw = -st.phi;
    m.sv.s = cm(m.at);
    done.vehicles++;
  }

  // ---- the walker: beside the vehicle they sat in or were nearest to, else on the verge at their own arc length
  const p = s.player;
  const afoot = !onPlot(world, p.x, p.z);
  let by: Moved | null = seat ? (moved.find((m) => m.sv === seat) ?? null) : null;
  if (!seat && afoot) {
    let best = NEAR_VEHICLE;
    for (const m of moved) {
      const d = Math.hypot(m.x0 - p.x, m.z0 - p.z);
      if (d < best) {
        best = d;
        by = m;
      }
    }
  }
  if (by) {
    world.spine.at(by.at, st);
    const d = LANE + body(by).halfWidth + BESIDE;
    p.x = st.x - Math.sin(st.phi) * d;
    p.z = st.z + Math.cos(st.phi) * d;
    p.heading = st.phi;
    p.s = cm(by.at);
    done.walker = 'vehicle';
  } else if (!seat && afoot) {
    let at = p.s;
    if (typeof at !== 'number' || !Number.isFinite(at)) {
      world.shape(p.x, p.z, tp);
      at = tp.s;
    }
    besideRoad(world, at, VERGE_WALK, spot);
    p.x = spot.x;
    p.z = spot.z;
    p.heading = spot.phi;
    p.s = cm(spot.s);
    done.walker = 'verge';
  }

  // ---- the things lying about: down onto the land where they are, or beside the road at their arc length
  for (const l of s.loose) {
    if (l.on !== undefined || onPlot(world, l.x, l.z)) continue;
    if (canLie(world, l.x, l.z)) {
      l.y = tp.h;
      l.s = cm(tp.s);
      done.dropped++;
      continue;
    }
    const at = typeof l.s === 'number' && Number.isFinite(l.s) ? l.s : tp.s;
    // (several from one spot lie in rows along the verge, not in one heap)
    const n = done.roadside++;
    besideRoad(world, at + (n % 8) * 0.8, VERGE_THINGS + ((n >> 3) % 3) * 0.7, spot);
    l.x = spot.x;
    l.y = spot.y;
    l.z = spot.z;
    l.s = cm(spot.s);
  }

  // ---- the places and the wrecks: what is still there under its id, and still of its kind
  const kinds = worldOfSave(s)?.sites ?? {};
  const cache = new Map<string, Site | null>();
  /** the place an id belongs to, when it is the place the save knew: there, and of the kind it was */
  const same = (id: string): Site | null => {
    const siteId = siteIdOf(id);
    // (a place the save has no kind for is not looked for: nothing says it is the place it was)
    if (!Object.prototype.hasOwnProperty.call(kinds, siteId)) return null;
    const site = siteOf(world, siteId, cache, true);
    return site && kinds[siteId] === site.kind ? site : null;
  };
  const keepList = (list: string[] | undefined, has: (site: Site, id: string) => boolean): string[] => {
    const kept = (list ?? []).filter((id) => {
      const site = same(id);
      return !!site && has(site, id);
    });
    done.forgotten += (list?.length ?? 0) - kept.length;
    return kept;
  };
  const keepKeys = (rec: Record<string, unknown> | undefined, has: (site: Site, id: string) => boolean): void => {
    for (const id of Object.keys(rec ?? {})) {
      const site = same(id);
      if (site && has(site, id)) continue;
      delete rec![id];
      done.forgotten++;
    }
  };
  const pl = s.places;
  if (pl) {
    const container = (site: Site, id: string): boolean => site.containers.some((c) => c.id === id);
    pl.searched = keepList(pl.searched, container);
    keepKeys(pl.left, container);
    keepKeys(pl.pumps, (site, id) => site.fuel.some((f) => f.id === id));
    pl.taken = keepList(pl.taken, (site, id) => site.loose.some((x) => x.id === id));
    keepKeys(pl.shops, () => true);
    keepKeys(pl.doors, () => true);
  }
  const wr = s.wrecks;
  if (wr) {
    /** the wreck an id names at its place (`site12p/w3`: the place's fourth object), if that is a wreck */
    const wreckAt = (site: Site, id: string): Site['objects'][number] | null => {
      const m = /\/w(\d+)$/.exec(id);
      const o = m ? site.objects[Number(m[1])] : undefined;
      return o && o.kind === 'wreck' ? o : null;
    };
    wr.gone = keepList(wr.gone, (site, id) => !!wreckAt(site, id));
    for (const [id, k] of Object.entries(wr.kept ?? {})) {
      const site = same(id);
      const o = site ? wreckAt(site, id) : null;
      if (!o) {
        delete wr.kept[id];
        done.forgotten++;
        continue;
      }
      // (where the world lays it now, as wrecks.ts wreckSpots has it: a vehicle's yaw runs the other way round)
      k.x = o.x;
      k.z = o.z;
      k.yaw = -o.yaw;
      done.wrecksMoved++;
    }
  }

  const w = worldOfSave(s);
  if (w) w.rev = WORLD_REV;
  return done;
}
