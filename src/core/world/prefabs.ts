/**
 * Prefab places (docs/ND/PLAN.md): a building made whole in Blender — its shell, its doors, where its furniture
 * stands, what cannot be walked through — laid at a stretch of the road as a place of its own (sites.ts). A system
 * registers its cards as it is loaded (registerPrefab); the plan lays them as a test lot when the world is asked to
 * (WorldOptions.prefabs), and from world version 6 on the places' own dice lay the cards PREFAB_DICE names among the
 * world's own places (docs/V3/plan/growth.md §三): a world of an older version is exactly what it was.
 *
 * A card's own frame is the building's: u along the road (its long side), v away from the road (its front, the
 * side the doors look onto, is −v: it faces the road), y up from its floor; metres. Pure: no three, no DOM.
 */
import type { ContainerKind } from '../items/loot';
import type { PlaceSort, SiteKind } from './sites';

/** an upright box (or a round post: hz = 0, hx its radius) in the card's frame */
export interface PrefabSolid {
  u: number;
  v: number;
  hx: number;
  hz: number;
  /** bottom and top, from the floor */
  y0: number;
  y1: number;
  /** its top can be stood on (a floor, a step, a porch) */
  floor?: boolean;
  /** turned from the building's heading (rad) */
  turn?: number;
}

/** a thing lying where the card puts it (furniture, what lies on it): in the card's frame, y from the floor */
export interface PrefabThing {
  item: string;
  u: number;
  v: number;
  y: number;
  /** turned from the building's heading (rad) */
  yaw: number;
  n?: number;
}

/** a wreck of the road's (sites.ts: a saloon 0, a pick-up 1, a van 2, a bus 3) laid with a place, in its card's frame */
export interface PrefabWreck {
  u: number;
  v: number;
  /** turned from the building's heading (rad): its nose along its own x */
  yaw: number;
  type: number;
  /** stripped long ago: mostly rust, nothing left in it */
  stripped?: boolean;
}

/**
 * A box of a building's that the plan's finds go in (core/modcar/schedule.ts; loot.ts planBoxes) — a shelf, a counter,
 * a locker, a patch of a room's floor — at one of its spots, in the card's frame: it holds nothing of its own (what the
 * building has of its own lies at its spots, the box's own spot left empty for what the plan puts there). Laid only as
 * the places' dice lay the building (from world version 6 on), never in a test lot.
 */
export interface PrefabBox {
  /** the spot it is at (what the card has there of its own is not laid) */
  spot: string;
  kind: ContainerKind;
  /** its middle, its base over the floor (where what has no room on it lies: the room's floor), and how high over its base its things lie */
  u: number;
  v: number;
  y0: number;
  shelf: number;
  /** half its length (along its heading), half its depth, its height (m) */
  hx: number;
  hz: number;
  h: number;
  /** a thing standing there (a shelf, a counter): its room's height is over its top; a patch of floor: as high as 1.2 m */
  solid: boolean;
  /** turned from the building's heading (rad): its things in a row along it, what has no room on it out of its +v side */
  turn: number;
}

export interface PrefabCard {
  readonly id: string;
  /** the game's word for a place of it (its prompt line, the junk it has lying about, the plan's sort of place): an existing kind */
  readonly siteKind: SiteKind;
  /**
   * (world version 7) the sort of place it is to what is found there, where that is not its kind (sites.ts Site.sort):
   * the motel — a home to the dice (its ground, its yard, where it stands), a place of its own to the plan and on its
   * boxes' cards. A world made before version 7 never reads it.
   */
  readonly sort?: PlaceSort;
  /** footprint along the road and away from it, and the height of its walls (m) */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** how far its front stands back from where the levelled ground begins (m) */
  readonly setback: number;
  /** levelled ground beyond the footprint: along the road either end, and behind it (m) */
  readonly margin: number;
  /** the floor's height over the levelled ground (m): its plinth */
  readonly plinth: number;
  /** what the levelled ground is: 0 packed gravel, 1 old concrete */
  readonly ground?: number;
  readonly solids: readonly PrefabSolid[];
  /** wrecks laid with it (Nomad Drive's CarWreckage places: a wreck by the road and what lies on and about it) */
  readonly wrecks?: readonly PrefabWreck[];
  /** the boxes the plan's finds go in, as the dice lay it (absent: none — it takes none of the plan's) */
  readonly boxes?: readonly PrefabBox[];
  /**
   * Levelled ground beyond its own at one end along the road, as the dice lay it (m; absent: none): a big place's yard,
   * room for a vehicle to find (game/modcar/wrecks.ts VehicleFinds) beside the building, clear of it and of its things
   */
  readonly yard?: number;
  /** the things in it, the same for every visit of one seed (its furniture and what lies on and in it); none at the spots in `skip` */
  furnish?(seed: number, s: number, out: PrefabThing[], skip?: ReadonlySet<string>): void;
}

/**
 * The cards the places' dice lay from world version 6 on (sites.ts; docs/V3/plan/growth.md §三, ND9), each with the
 * kind of our places it stands in for and how likely it is against the others for that kind: when the dice pick one of
 * those kinds for a stretch, in a share of them (sites.ts ND_SHARE) one of Nomad Drive's comes in its place — a filling
 * station for a filling station, a home for a house, the camp, a works, the water tower or the graveyard for a lay-by,
 * the watch tower for a hunter's stand; a small place ('small') as a second place the dice made a lay-by or a stand, or
 * alone in a stretch they left empty. Our workshops, shops, jetties, lookouts and lighthouses are never stood in for.
 * A world of version 6 asks for every card named here (sites.ts: made without them registered it would be another
 * world, so it is not made — core/v3/nd/cards.ts registers them).
 */
export const PREFAB_DICE: readonly { readonly id: string; readonly for: SiteKind | 'small'; readonly weight: number }[] = [
  // the filling station: the second look of ours
  { id: 'station', for: 'station', weight: 1 },
  // homes: the cabin, the motel, the commune's houses, the starter house met along the road
  { id: 'cabin', for: 'house', weight: 1.5 },
  { id: 'motel', for: 'house', weight: 1.1 },
  { id: 'commune', for: 'house', weight: 0.9 },
  { id: 'starter', for: 'house', weight: 0.9 },
  // in a lay-by's stead: the camp (the second look of ours), the works (the three factories, the container yard, the
  // radio station, the wind farm: with our old waterworks the works' looks), the water tower, the graveyard
  { id: 'camp', for: 'camp', weight: 1.2 },
  { id: 'factory1', for: 'camp', weight: 0.8 },
  { id: 'factory2', for: 'camp', weight: 0.8 },
  { id: 'factory3', for: 'camp', weight: 0.8 },
  { id: 'containeryard', for: 'camp', weight: 0.9 },
  { id: 'radiostation', for: 'camp', weight: 0.9 },
  { id: 'windfarm', for: 'camp', weight: 0.9 },
  { id: 'watertower', for: 'camp', weight: 1.0 },
  { id: 'graveyard', for: 'camp', weight: 0.8 },
  // in a hunter's stand's: the watch tower
  { id: 'watchtower', for: 'hide', weight: 1 },
  // the small places by the road
  { id: 'busstop', for: 'small', weight: 1.2 },
  { id: 'toilets', for: 'small', weight: 1.0 },
  { id: 'mailboxes', for: 'small', weight: 1.0 },
  { id: 'pump', for: 'small', weight: 1.0 },
  { id: 'windmill', for: 'small', weight: 0.9 },
  { id: 'hays', for: 'small', weight: 0.9 },
  { id: 'crosses', for: 'small', weight: 0.8 },
  { id: 'wreck1', for: 'small', weight: 0.6 },
  { id: 'wreck2', for: 'small', weight: 0.6 },
  { id: 'wreck3', for: 'small', weight: 0.6 },
];

const CARDS = new Map<string, PrefabCard>();

/** a card into the registry (a system's, as it is loaded); its id once */
export function registerPrefab(card: PrefabCard): void {
  if (!/^[a-z][a-z0-9_]*$/.test(card.id)) throw new Error(`prefab id '${card.id}': lower-case letters, digits and _`);
  if (CARDS.has(card.id) && CARDS.get(card.id) !== card) throw new Error(`two prefab cards have the id '${card.id}'`);
  CARDS.set(card.id, card);
}

/** the card of an id, null: none registered */
export function prefabCard(id: string): PrefabCard | null {
  return CARDS.get(id) ?? null;
}

/** every card registered, in the order they were */
export function prefabCards(): readonly PrefabCard[] {
  return [...CARDS.values()];
}

/**
 * The ids an address asks for (`?nd=cabin,motel`; `all` every card): the prefabs a world lays along its road from
 * the first stretch on, one a stretch, in that order. Unknown ids are left out; null: none asked for.
 */
export function prefabsAsked(q: string | null): string[] | null {
  if (!q) return null;
  const ids = q === 'all' || q === '1' ? prefabCards().map((c) => c.id) : q.split(',').map((s) => s.trim()).filter((s) => CARDS.has(s));
  return ids.length ? ids : null;
}
