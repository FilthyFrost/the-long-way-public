/**
 * The journey of a world of version 4 on its road (docs/V3/nodes/E1-earth-world.md): the emergent Earth's
 * director (core/earth/director.ts) lays the places; this lays them on the road as chapters, one chapter to a
 * place — home first, as the region the world was asked to begin in (the workshop's country, drawn as it always
 * was), then each place five kilometres of road (four stretches, the chapters' scale reckoned in) as a region of
 * its own (earth/region.ts, put in the registry the first time the journey reaches it: biomes.ts earthRegion).
 * Two places blend into each other over most of a chapter's length: they are neighbours on the Earth, and the
 * director made them alike enough to.
 *
 * Its pieces are shaped as version 3's journey's are (journey/road.ts JourneyRoad), so that whoever reads one —
 * the place names on the screen, the developer's journey strip — reads the other.
 */
import { earthRegion, type RegionDef } from '../biomes';
import { FLORA } from '../floraTables';
import { registerEarthProfile } from '../groundTables';
import { aliasRouteProfile, setRouteSettings, setSceneSnowLine } from '../routeProfiles';
import type { ChapterDealer, DealtChapter } from '../rules';
import { setSceneMonth } from '../sceneSeason';
import { setRegionWeather } from '../../env/weather';
import { weatherOfPlace } from './weather';
import { EarthJourney, type Scene } from '../../earth/director';
import { floraOfPlace } from './flora';
import { profileOfPlace } from './profile';
import { earthRegionId, regionOfPlace, settingsOf, templateOf } from './region';

/** a place's stretches (the chapters' scale reckoned in) */
export const PLACE_SLOTS = 4;
/** how much of the shorter of two chapters their blend may take */
const BLEND_SHARE = 0.7;

/** what the screen and the developer's tools read of a place (journey/road.ts SceneCard's name and tag) */
export interface EarthCard {
  name: string;
  tag: string;
  /** the director's place */
  place: Scene;
}

/** a piece of the journey on the road: home, or one of the director's places */
export interface EarthPiece {
  kind: 'home' | 'scene';
  scene: EarthCard | null;
  buffer: null;
  /** the director's index of the place (home: 0, the place the director begins at) */
  index: number;
  region: number;
  slots: number;
  start: number;
  end: number;
  border: number;
  threshold: null;
  thresholdLength: number;
}

export interface EarthChapter {
  region: number;
  length: number;
  border: number;
  first: number;
  end: number;
}

/**
 * The region of place k of a world: made the first time it is asked for (with the tables of the other modules
 * it needs a row in: its plants, its month, its ground profile, its kinds of country, its snow line), the same
 * index after.
 */
export function regionOfPlaceIn(seed: number, k: number, sc: Scene): number {
  const id = earthRegionId(seed, k);
  return earthRegion(id, (): RegionDef => {
    const def = regionOfPlace(sc, seed, k);
    const template = templateOf(sc);
    // (its plants its ecosystems' (earth/flora.ts), its ground plants too, belt by belt (earth/profile.ts))
    if (!FLORA[id]) FLORA[id] = floraOfPlace(sc);
    registerEarthProfile(profileOfPlace(sc, id));
    aliasRouteProfile(id, template);
    setSceneMonth(id, sc.macro.month);
    setRouteSettings(id, settingsOf(sc));
    setSceneSnowLine(id, def.relief?.snow ?? 1e5);
    // (its weather its place's: its sky, its showers, its mist and fog, its dust, its storms)
    const weather = weatherOfPlace(sc);
    setRegionWeather(id, weather.calm, weather.kinds);
    return def;
  });
}

/** the journey of a world of version 4, on its road */
export class EarthRoad {
  readonly earth: EarthJourney;
  readonly pieces: EarthPiece[] = [];
  readonly chapters: EarthChapter[] = [];

  constructor(
    readonly seed: number,
    readonly scale = 1,
    readonly slot = 1250,
    /** the region the world was asked to begin in: home (an index into BIOMES) */
    readonly home = 0,
    /** the widest blend the chapter plan allows (rules.ts transition at the world's scale) */
    readonly widest = 2000,
  ) {
    this.earth = new EarthJourney(seed | 0);
    this.push({ kind: 'home', scene: null, buffer: null, index: 0, region: home, slots: this.slotsOf(PLACE_SLOTS), border: 0, threshold: null, thresholdLength: 0 });
  }

  private slotsOf(n: number): number {
    return Math.max(1, Math.round(n * this.scale));
  }

  private push(p: Omit<EarthPiece, 'start' | 'end'>): void {
    const last = this.pieces[this.pieces.length - 1];
    const start = last ? last.end : 0;
    const piece: EarthPiece = { ...p, start, end: start + p.slots * this.slot };
    this.pieces.push(piece);
    this.chapters.push({ region: piece.region, length: piece.end - piece.start, border: piece.border, first: this.pieces.length - 1, end: this.pieces.length });
  }

  /** the next of the director's places laid on the road */
  private layOne(): void {
    const k = this.pieces.length;
    const sc = this.earth.sceneAt(k * 5000 + 1);
    const region = regionOfPlaceIn(this.seed, k, sc);
    const slots = this.slotsOf(PLACE_SLOTS);
    const last = this.pieces[this.pieces.length - 1];
    const border = Math.min(this.widest, BLEND_SHARE * Math.min(slots * this.slot, last.end - last.start));
    this.push({ kind: 'scene', scene: { name: sc.name, tag: sc.tag, place: sc }, buffer: null, index: k, region, slots, border, threshold: null, thresholdLength: 0 });
  }

  /** chapter c of the road */
  chapter(c: number): EarthChapter {
    while (this.chapters.length <= c) this.layOne();
    return this.chapters[c];
  }

  /** the piece of the journey at a point of the road (m) */
  pieceAt(s: number): EarthPiece {
    const x = Math.max(0, s);
    while (this.pieces[this.pieces.length - 1].end <= x) this.layOne();
    let lo = 0;
    let hi = this.pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pieces[mid].end <= x) lo = mid + 1;
      else hi = mid;
    }
    return this.pieces[lo];
  }

  /** the director's place at a point of the road (home's too: the director's first) */
  placeAt(s: number): Scene {
    const p = this.pieceAt(s);
    return p.scene ? p.scene.place : this.earth.sceneAt(1);
  }

  /** the place the journey is in at a point of the road, as the screen names it; null at home */
  sceneAt(s: number): EarthCard | null {
    return this.pieceAt(s).scene;
  }
}

/** the journey of a world, made once and kept (the last few worlds asked) */
const roads = new Map<string, EarthRoad>();

export function earthRoad(seed: number, scale = 1, slot = 1250, home = 0, widest = 2000): EarthRoad {
  const key = `${seed | 0}|${scale}|${slot}|${home}|${widest}`;
  let r = roads.get(key);
  if (!r) {
    r = new EarthRoad(seed | 0, scale, slot, home, widest);
    roads.set(key, r);
    if (roads.size > 8) roads.delete(roads.keys().next().value!);
  }
  return r;
}

function dealt(c: EarthChapter): DealtChapter {
  return { region: c.region, length: c.length, border: c.border };
}

/**
 * The dealer of world version 4 (rules.ts ChapterDealer): the director's places on the road, from home — the
 * region the world was asked to begin in.
 */
export const DEALER_V4: ChapterDealer = {
  first(deal) {
    return dealt(earthRoad(deal.seed, deal.scale, deal.rules.slot, deal.startRegion, deal.rules.transition(deal.scale)).chapter(0));
  },
  next(deal) {
    return dealt(earthRoad(deal.seed, deal.scale, deal.rules.slot, deal.startRegion, deal.rules.transition(deal.scale)).chapter(deal.regions.length));
  },
};
