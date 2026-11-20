/**
 * The journey laid on the road: world version 3 (docs/V3/nodes/P3-1-journey-world.md). The journey (journey.ts)
 * deals the fifty scenic roads and the joins between them; here they become the road's chapters.
 *
 *   - A scene is a chapter of its own country for five to seven kilometres, in whole stretches: for now the
 *     region there already was that is nearest it (STAND_INS), until the scene's own region is made (milestones
 *     3-3 … 3-12: a region of the scene's id, which a world that knows it deals instead).
 *   - Two near neighbours blend into each other over the join's length (an ecotone).
 *   - Between two further apart, a quiet stretch: a chapter of one of the six quiet regions, blended into and out
 *     of over a short border.
 *   - Between two worlds apart, a threshold: a short border, where the thing that hides the change will stand
 *     (milestone 3-2) — and from heat to cold a quiet stretch after it, for the cold to come on slowly.
 *
 * A journey sets out from home: two stretches of the region the world was asked to begin in (the workshop's
 * country, the plains), then its first scene.
 *
 * Pieces of the same region running on are one chapter (two lakes running would each hang a sea of their own);
 * every piece keeps its own place along the road, for the name on the screen when one enters it.
 *
 * Pure: a function of the seed, the chapters' scale, how many regions the world knows and the length of a
 * stretch. It loads nothing of the road or the land (the world's rules load it). DOM-free.
 */
import { BIOMES, BIOME_INDEX } from '../biomes';
import { borderWidth } from '../routeProfiles';
import type { ChapterDealer, DealtChapter } from '../rules';
import { Journey } from './journey';
import { BUFFERS, SCENES, type BufferCard, type SceneCard, type Threshold } from './scenes';

/**
 * The region each scene is drawn as until its own is made: the nearest of the twelve there were before the fifty
 * (docs/V3/research/scenic-50.md §6 for the six that grow from one; the rest by their land, their plants and
 * their colour first, their climate second).
 */
export const STAND_INS: Readonly<Record<string, string>> = {
  // A polar and cold
  aurora_tundra: 'alpine',
  ice_sea_isles: 'lakes',
  black_sand_glacier: 'lakes',
  rainbow_rhyolite: 'red_canyon',
  // (the frozen lake and the snow-laden taiga: the snow country's, the lakes and the woods being summer's)
  frozen_mirror_lake: 'alpine',
  snow_veil_taiga: 'alpine',
  // B cold-temperate mountains
  icefield_avenue: 'alpine',
  fjord_waterfalls: 'lakes',
  hairpin_pass: 'alpine',
  pale_spires: 'alpine',
  heather_glen: 'flower_fields',
  geyser_basin: 'forest',
  // C high plateaus and mountains
  sky_grassland: 'plains',
  prayer_flag_plateau: 'lakes',
  apricot_gorge: 'red_canyon',
  jewel_lagoons: 'desert',
  sky_mirror_salt: 'desert',
  cloud_cliff_road: 'bamboo_sea',
  wind_towers: 'plains',
  // D temperate forests and farmland
  giant_fog_forest: 'forest',
  moss_rainforest: 'forest',
  maple_fire_ridges: 'maple',
  cherry_tunnel: 'flower_fields',
  cypress_hills: 'plains',
  lavender_plateau: 'flower_fields',
  windmill_tulips: 'wetland',
  lupin_star_lake: 'lakes',
  balloon_chimneys: 'red_canyon',
  // E East Asian landscapes
  mirror_terraces: 'terraces',
  bamboo_sea: 'bamboo_sea',
  karst_river: 'karst_peaks',
  floating_pillars: 'karst_peaks',
  // F coasts and islands
  fog_cliff_coast: 'lakes',
  lemon_cliffs: 'lakes',
  fynbos_cape: 'flower_fields',
  coral_bridges: 'wetland',
  volcano_garden: 'bamboo_sea',
  mangrove_tide: 'wetland',
  // G deserts
  red_monuments: 'red_canyon',
  rainbow_hills: 'red_canyon',
  red_dune_sea: 'desert',
  kasbah_oasis: 'red_canyon',
  saguaro_valley: 'desert',
  red_outback: 'desert',
  wind_city_yardangs: 'desert',
  dragon_blood_plateau: 'desert',
  // H grassland and tropics
  baobab_avenue: 'plains',
  acacia_savanna: 'plains',
  endless_steppe: 'plains',
  red_earth_rainforest: 'bamboo_sea',
};

/** a scene's stretches: its length in them, never fewer or more than these (before the scale) */
const SCENE_SLOTS: readonly [number, number] = [4, 6];
/** the blend into a quiet stretch and out of it, at most (m) */
const BUFFER_BORDER = 900;
/** the border at a threshold (m): a short one, where what hides the change will stand */
const THRESHOLD_BORDER = 400;
/** a threshold's quiet stretch from heat to cold: two stretches (2.5 km), for the cold to come on slowly */
const COLD_BUFFER_SLOTS = 2;
/** home, where the journey sets out: two stretches of the region the world was asked to begin in */
const HOME_SLOTS = 2;

export interface JourneyPiece {
  /** a scenic stretch, a quiet stretch between two, or home, where the journey sets out */
  kind: 'scene' | 'buffer' | 'home';
  /** the scene's card (a scene) */
  scene: SceneCard | null;
  /** the quiet stretch's card (a buffer) */
  buffer: BufferCard | null;
  /** the scene's place in the journey (the i-th scene dealt, from 0); a quiet stretch has the scene's before it, home −1 */
  index: number;
  /** the region drawn for it (an index into the registry, BIOMES) */
  region: number;
  /** its stretches, where it begins along the road and where it ends (m) */
  slots: number;
  start: number;
  end: number;
  /** the width of the blend at its start (m): an ecotone's length, a quiet stretch's way in, a threshold's short border */
  border: number;
  /** what hides the change at its start (a threshold), and the road it takes there (m); null where there is none */
  threshold: Threshold | null;
  thresholdLength: number;
}

/**
 * What whoever reads a world's journey reads of it — the place names on the screen, the developer's journey strip,
 * the description of a place: version 3's journey (JourneyRoad) and version 4's (earth/road.ts EarthRoad) alike.
 */
export interface JourneyPieceView {
  kind: 'scene' | 'buffer' | 'home';
  scene: { readonly name: string; readonly tag: string } | null;
  buffer: { readonly name: string } | null;
  index: number;
  region: number;
  start: number;
  end: number;
  threshold: Threshold | null;
}

export interface RoadJourney {
  readonly pieces: readonly JourneyPieceView[];
  readonly chapters: readonly { readonly region: number; readonly length: number; readonly border: number }[];
  chapter(c: number): { readonly region: number; readonly length: number; readonly border: number };
  pieceAt(s: number): JourneyPieceView;
}

/** one chapter of the road: pieces of one region running on */
export interface JourneyChapter {
  region: number;
  /** its length along the road (m) and the blend at its start (m) */
  length: number;
  border: number;
  /** its first piece and the one after its last */
  first: number;
  end: number;
}

/** the region a scene is drawn as, in a world that knows `regionCount` regions */
export function regionOfScene(card: SceneCard, regionCount: number): number {
  for (const id of [card.id, card.region, STAND_INS[card.id]]) {
    if (!id) continue;
    const r = BIOME_INDEX[id];
    if (r !== undefined && r < regionCount) return r;
  }
  return 0;
}

function regionOfBuffer(card: BufferCard, regionCount: number): number {
  const r = BIOME_INDEX[card.id];
  return r !== undefined && r < regionCount ? r : 0;
}

/** the journey of a world of version 3, on its road */
export class JourneyRoad {
  readonly journey: Journey;
  readonly pieces: JourneyPiece[] = [];
  readonly chapters: JourneyChapter[] = [];
  /** the journey's next chapter (journey.ts: scene, join, scene, join …) to lay on the road */
  private next = 0;
  /** what the next piece's border and threshold are, as the join before it said */
  private border = 0;
  private threshold: Threshold | null = null;
  private thresholdLength = 0;

  constructor(
    readonly seed: number,
    readonly scale = 1,
    readonly regionCount = BIOMES.length,
    readonly slot = 1250,
    /** the region the world was asked to begin in: home (an index into BIOMES) */
    readonly home = 0,
  ) {
    this.journey = new Journey(seed);
    this.push({ kind: 'home', scene: null, buffer: null, index: -1, region: home < regionCount ? home : 0, slots: this.slotsOf(HOME_SLOTS) });
  }

  /** what the borders are multiplied by: the chapters' scale, between a tenth and one */
  private get shrink(): number {
    return Math.max(0.1, Math.min(1, this.scale));
  }

  private slotsOf(n: number): number {
    return Math.max(1, Math.round(n * this.scale));
  }

  private push(p: Omit<JourneyPiece, 'start' | 'end' | 'border' | 'threshold' | 'thresholdLength'>): void {
    const last = this.pieces[this.pieces.length - 1];
    const start = last ? last.end : 0;
    const piece: JourneyPiece = { ...p, start, end: start + p.slots * this.slot, border: last ? this.border : 0, threshold: this.threshold, thresholdLength: this.thresholdLength };
    this.pieces.push(piece);
    this.border = 0;
    this.threshold = null;
    this.thresholdLength = 0;
    // (a piece of the region the chapter before runs through goes on with it)
    const c = this.chapters[this.chapters.length - 1];
    if (c && c.region === piece.region) {
      c.length += piece.end - piece.start;
      c.end = this.pieces.length;
      return;
    }
    this.chapters.push({ region: piece.region, length: piece.end - piece.start, border: piece.border, first: this.pieces.length - 1, end: this.pieces.length });
  }

  /** the border into a quiet stretch or out of it: the corridors' own where they have one, never more than BUFFER_BORDER */
  private bufferBorder(a: number, b: number): number {
    return Math.min(BUFFER_BORDER, borderWidth(BIOMES[a].id, BIOMES[b].id, this.regionCount) ?? BUFFER_BORDER) * this.shrink;
  }

  /** the next of the journey's chapters laid on the road */
  private layOne(): void {
    const c = this.journey.chapter(this.next++);
    if (c.kind === 'scene') {
      const card = c.scene!;
      const slots = Math.min(SCENE_SLOTS[1], Math.max(SCENE_SLOTS[0], Math.round(c.length / this.slot)));
      const region = regionOfScene(card, this.regionCount);
      // (into a scene from a quiet stretch: its own short border)
      const last = this.pieces[this.pieces.length - 1];
      if (last && last.kind !== 'scene' && this.threshold === null) this.border = this.bufferBorder(last.region, region);
      this.push({ kind: 'scene', scene: card, buffer: null, index: c.index + c.round * SCENES.length, region, slots: this.slotsOf(slots) });
      return;
    }
    const join = c.join!;
    const before = this.pieces[this.pieces.length - 1];
    const i = before.index;
    if (join.kind === 'ecotone') {
      this.border = join.length * this.shrink;
      return;
    }
    if (join.kind === 'threshold') {
      this.border = THRESHOLD_BORDER * this.shrink;
      this.threshold = join.threshold ?? 'fog';
      this.thresholdLength = (join.buffer ? 1500 : join.length) * this.shrink;
      if (!join.buffer) return;
    }
    const card = BUFFERS.find((b) => b.id === join.buffer) ?? BUFFERS[0];
    const region = regionOfBuffer(card, this.regionCount);
    if (join.kind === 'buffer') this.border = this.bufferBorder(before.region, region);
    const slots = join.kind === 'threshold' ? COLD_BUFFER_SLOTS : Math.max(1, Math.round(join.length / this.slot));
    this.push({ kind: 'buffer', scene: null, buffer: card, index: i, region, slots: this.slotsOf(slots) });
  }

  /** chapter c of the road (laid out as far as it is whole: the next one begun) */
  chapter(c: number): JourneyChapter {
    while (this.chapters.length <= c + 1) this.layOne();
    return this.chapters[c];
  }

  /** the piece of the journey at a point of the road (m) */
  pieceAt(s: number): JourneyPiece {
    const x = Math.max(0, s);
    while (!this.pieces.length || this.pieces[this.pieces.length - 1].end <= x) this.layOne();
    let lo = 0;
    let hi = this.pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pieces[mid].end <= x) lo = mid + 1;
      else hi = mid;
    }
    return this.pieces[lo];
  }

  /** the scene the journey is in at a point of the road, or the one a quiet stretch there follows; null at home */
  sceneAt(s: number): SceneCard | null {
    const p = this.pieceAt(s);
    if (p.scene) return p.scene;
    for (let k = this.pieces.indexOf(p) - 1; k >= 0; k--) if (this.pieces[k].scene) return this.pieces[k].scene!;
    return null;
  }
}

/** the journey of a world, made once and kept (the last few worlds asked) */
const roads = new Map<string, JourneyRoad>();

export function journeyRoad(seed: number, scale = 1, regionCount = BIOMES.length, slot = 1250, home = 0): JourneyRoad {
  const key = `${seed | 0}|${scale}|${regionCount}|${slot}|${home}`;
  let r = roads.get(key);
  if (!r) {
    r = new JourneyRoad(seed | 0, scale, regionCount, slot, home);
    roads.set(key, r);
    if (roads.size > 8) roads.delete(roads.keys().next().value!);
  }
  return r;
}

function dealt(c: JourneyChapter): DealtChapter {
  return { region: c.region, length: c.length, border: c.border };
}

/**
 * The dealer of world version 3 (rules.ts ChapterDealer): the chapters of the journey on the road, from home —
 * the region the world was asked to begin in.
 */
export const DEALER_V3: ChapterDealer = {
  first(deal) {
    return dealt(journeyRoad(deal.seed, deal.scale, deal.rules.regionCount, deal.rules.slot, deal.startRegion).chapter(0));
  },
  next(deal) {
    return dealt(journeyRoad(deal.seed, deal.scale, deal.rules.regionCount, deal.rules.slot, deal.startRegion).chapter(deal.regions.length));
  },
};
