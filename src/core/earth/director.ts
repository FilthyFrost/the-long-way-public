/**
 * The emergent Earth's director (docs/V3/plan/emergent-earth.md §7): it does not choose places, it chooses which
 * way to go — the fastest and grandest ways the real Earth changes along a road: over a range (its height belts
 * one after another), across a rain shadow, down to the sea and along it, into a basin, onto a plateau, along a
 * river, through a volcanic field, a karst, a dune sea, a lake district, a wetland, across a geological contact,
 * and, on the long flat drives between, slowly toward warmer or colder latitudes. Each move eases the knobs of the
 * place (climate.ts Macro) from what they are to what it makes them; the places themselves follow from the knobs.
 *
 * It looks ahead at every turn: every move that can be made from here is tried, its places foreseen, and the one
 * chosen (by the seed's dice, the better ones more often) that brings the most that is new — places unlike the last
 * dozen, ecosystems and landforms not yet met, the warmth the journey's long tour asks for — while keeping the
 * rhythm: no two climbs running, open and closed, high and low in turn.
 *
 * Deterministic: a journey is its seed. Pure, DOM-free (the world reads it in E1).
 */
import { Rng, hash2 } from '../math/rng';
import { LAPSE, ecosystemAt, growingAt, landformsFor, patchesAt, snowAt, swingOf, warmthAt, type Macro } from './climate';
import type { Efg } from './efg';
import type { Context } from './kinds';
import type { Process } from './landforms';
import { bestMonth, distance, lookOf, monthToward, nameOf, type Look, type Signature } from './look';
import type { RockId } from './rocks';

export type MoveId = 'climb' | 'descend' | 'basin' | 'plateau' | 'coast' | 'inland' | 'river' | 'latitude' | 'wetter' | 'drier' | 'province' | 'volcanic' | 'karst' | 'dunes' | 'lakes' | 'wetland' | 'glacial';

export const MOVE_ZH: Readonly<Record<MoveId, string>> = {
  climb: '翻山',
  descend: '下山',
  basin: '穿过盆地',
  plateau: '上高原',
  coast: '到海边',
  inland: '离开海岸',
  river: '顺着河走',
  latitude: '换纬度',
  wetter: '变湿润',
  drier: '变干',
  province: '跨过地质分界',
  volcanic: '进火山区',
  karst: '进喀斯特',
  dunes: '进沙海',
  lakes: '进湖区',
  wetland: '进湿地',
  glacial: '进冰川区',
};

/** one leg of a move: its length along the road (m) and the knobs at its end (numbers ease to them, the rest change at its start) */
export interface Leg {
  move: MoveId;
  length: number;
  to: Macro;
  /** it ends on a crest (the view from the top) */
  crest?: boolean;
  /** how far along it its lie of the land, rock and water turn to its end's (0 … 1; absent: halfway) */
  turn?: number;
}

/** a laid leg: where it begins and ends along the road, and the knobs at either end */
export interface Segment {
  move: MoveId;
  s0: number;
  s1: number;
  from: Macro;
  to: Macro;
  crest: boolean;
  /** how far along it the lie of the land, rock and water turn to its end's (0 … 1) */
  turn: number;
}

/** a place of the journey: about five kilometres of road, what it is, what it is called, what it shows */
export interface Scene {
  index: number;
  s0: number;
  s1: number;
  macro: Macro;
  look: Look;
  name: string;
  tag: string;
  /** the moment the road is laid to show, and the move it came by */
  moment: string;
  move: MoveId;
}

/** a scene's length (m): four stretches of 1,250 m, five minutes at 60 km/h */
export const SCENE_LENGTH = 5000;
/** a place less unlike the one before than this (look.ts distance) is varied (another landform, a river, a sibling rock) */
const VARY_BELOW = 0.25;
/** a rock's sibling across a contact: the same country, another colour */
const SIBLING: Partial<Record<RockId, RockId>> = { sandstone_red: 'sandstone_pale', sandstone_pale: 'sandstone_red', limestone: 'dolomite', dolomite: 'limestone', granite: 'schist', schist: 'granite', basalt: 'cinder', cinder: 'basalt', quartz_sand: 'sandstone_red', shale: 'rhyolite', rhyolite: 'shale', loess: 'sandstone_pale', till: 'granite', salt: 'shale', gypsum: 'quartz_sand', peat: 'till', coral_sand: 'limestone', laterite: 'sandstone_red' };
/** how steeply the road climbs on average over a climb (rise over run): a mountain road's long climbs, which the world's road follows (world/rules.ts RULES_V4) */
const GRADE: readonly [number, number] = [0.045, 0.06];
/** the coldest a road's pass is (its growing season's warmth, °C, climate.ts growingAt): roads cross among the alpine meadows and the rock below the ice, the ice in view above them */
const PASS_COLDEST = 0.5;
/** how much more often a patch not yet met on the journey is the one chosen */
const FRESH_PATCH = 2.5;
/**
 * The places that are the journey's highlights (docs/V3/nodes/E5-earth-director.md): the landforms one remembers
 * — the ice's valleys and horns, the volcanoes, the karst's towers and stone forests, the great dunes, the
 * tables, canyons and gorges, the granite domes, the danxia and the hoodoos, the sea's cliffs and stacks and
 * cays, the salt mirrors — and the ecosystems one remembers (the cloud forest, the páramo, the rice terraces,
 * the lavender).
 */
const HIGHLIGHT_LANDS: ReadonlySet<string> = new Set(['u_valley', 'horn_arete', 'glacier', 'moraine_lake', 'fjord', 'cinder_cones', 'stratovolcano', 'crater_lake', 'geothermal', 'tower_karst', 'cone_karst', 'pillar_mountain', 'stone_forest', 'travertine', 'dune_star', 'gypsum_dunes', 'dune_linear', 'mesas_buttes', 'tepui', 'rift_valley', 'canyon', 'waterfall_gorge', 'inselberg', 'danxia', 'hoodoos', 'sea_cliffs', 'sea_stacks', 'coral_cays', 'island_chain', 'barrier_lagoon', 'lava_field', 'salt_flat', 'badlands', 'yardang']);
const HIGHLIGHT_EFGS: ReadonlySet<string> = new Set(['T1.3', 'T6.5', 'T7.1r', 'T7.1l', 'T7.1f', 'T7.1t', 'MFT1.2']);
/** after this many places without a highlight the director goes looking for one, the more eagerly the longer it has been */
const HIGHLIGHT_AFTER = 7;
/**
 * The most places with snow lying at the road among the last six before the journey turns toward summer (V1, docs/V3/nodes/V1-light.md):
 * a boreal wood is at its best in January, and a cold continental winter froze fifteen places running under one white —
 * an hour of the same snow, the grassland's, the lava field's and the forest's alike.
 */
const SNOW_RUN = 2;

/** after this many places without drama (a range, a coast, a highlight) a journey with a sense of drama goes looking for some */
const DRAMA_AFTER = 2;
/** the relief of a range (m): a place this high above its road, or by the sea, is drama enough */
const DRAMA_RELIEF = 350;
const dramatic = (m: Macro): boolean => m.relief >= DRAMA_RELIEF || m.context === 'coast' || m.water === 'coast';

/** is a place one of the journey's highlights? */
export function isHighlight(look: Look): boolean {
  return HIGHLIGHT_LANDS.has(look.landform.id) || HIGHLIGHT_EFGS.has(look.efg.code) || (look.water !== null && look.water.code === 'F2.9');
}
/** the landforms a move goes to see (a volcanic field's cones and flows, a karst's towers …), the more often chosen there */
const THEME: Partial<Record<MoveId, readonly Process[]>> = { glacial: ['glacial', 'periglacial'], volcanic: ['volcanic'], karst: ['karst'], dunes: ['aeolian', 'evaporite'], coast: ['coastal'], river: ['fluvial'], basin: ['evaporite', 'aeolian', 'weathering'], plateau: ['tectonic', 'weathering'] };

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

function withLandform(m: Macro, r: Rng): Macro {
  const options = landformsFor(m).slice(0, 6);
  if (!options.length) return { ...m, landform: null };
  const i = r.weighted(options.map((o) => o.fit * o.fit));
  return { ...m, landform: options[i].landform.id };
}

const MOUNTAIN_ROCKS: readonly RockId[] = ['granite', 'schist', 'limestone', 'dolomite', 'basalt', 'sandstone_pale'];

/** the moves, each from a place's knobs to its legs (null: it cannot be made from here) */
const MOVES: Readonly<Record<MoveId, (m: Macro, r: Rng, last: MoveId | null) => Leg[] | null>> = {
  climb(m, r) {
    const top = Math.min(4700, (m.tSea + 0.6 * swingOf(m) - PASS_COLDEST) / LAPSE);
    // (the tropics' great ranges climbed in one go: the rainforest, the cloud forest, the páramo one above another)
    const dh = Math.min(top - m.base, r.range(700, m.tSea > 20 ? 3300 : 2400));
    if (dh < 500) return null;
    const rock = r.chance(0.5) ? r.pick(MOUNTAIN_ROCKS) : m.rock;
    const to: Macro = { ...m, base: m.base + dh, relief: r.range(800, 1600), context: 'mountain', windward: m.windward >= 0 ? r.range(0.4, 1) : m.windward, rock, water: r.chance(0.35) ? 'river' : 'none', landform: null, disturb: 'none' };
    // (the lowland's river and shore are left at the foot: the mountains' own from a little way up)
    return [{ move: 'climb', length: dh / r.range(GRADE[0], GRADE[1]), to: withLandform(to, r), crest: true, turn: 0.15 }];
  },
  descend(m, r, last) {
    if (m.base < 500) return null;
    const dh = Math.min(m.base - 20, r.range(600, 2400));
    // (over a crest from the windward side: the lee, its rain shadow)
    const shadow = last === 'climb' && m.windward > 0 && r.chance(0.65);
    const context: Context = r.pick(['valley', 'basin', 'plain', 'hills'] as const);
    const to: Macro = { ...m, base: m.base - dh, relief: r.range(150, 600), context, windward: shadow ? -r.range(0.5, 1) : m.windward * 0.5, wet: shadow ? clamp(m.wet - r.range(0.15, 0.35), 0.02, 1) : m.wet, water: r.chance(0.3) ? 'river' : 'none', landform: null };
    // (the valley's river and plain come at the bottom)
    return [{ move: 'descend', length: dh / r.range(GRADE[0], GRADE[1]), to: withLandform(to, r), turn: 0.85 }];
  },
  basin(m, r) {
    if (m.context === 'coast') return null;
    const dry = m.wet < 0.32;
    const rock: RockId = dry ? r.pick(['salt', 'gypsum', 'shale', 'quartz_sand'] as const) : r.pick(['shale', 'loess', 'sandstone_pale'] as const);
    // (a dry basin's water its salt, or a spring where the warm desert's groundwater comes up: an oasis)
    const oasis = dry && m.tSea > 12 && rock !== 'salt' && r.chance(0.3);
    const to: Macro = { ...m, context: 'basin', relief: r.range(60, 260), wet: clamp(m.wet - 0.05, 0.01, 1), water: oasis ? 'oasis' : dry ? (rock === 'salt' ? 'salt' : r.chance(0.4) ? 'salt' : 'none') : m.wet > 0.45 ? 'lake' : 'none', rock, landform: null };
    return [{ move: 'basin', length: r.range(10000, 20000), to: withLandform(to, r) }];
  },
  plateau(m, r) {
    if (m.base < 2200) return null;
    const to: Macro = { ...m, context: 'plateau', relief: r.range(80, 450), base: m.base + r.range(-200, 300), water: r.pick(['none', 'none', 'salt', 'lake'] as const), rock: r.chance(0.5) ? r.pick(['rhyolite', 'basalt', 'sandstone_red', 'limestone', 'shale'] as const) : m.rock, landform: null };
    return [{ move: 'plateau', length: r.range(12000, 22000), to: withLandform(to, r) }];
  },
  coast(m, r) {
    if (m.base > 1600 || m.water === 'coast') return null;
    const legs: Leg[] = [];
    let at = m;
    if (m.base > 120) {
      const down: Macro = { ...m, base: r.range(5, 80), relief: r.range(80, 400), context: 'hills', landform: null };
      legs.push({ move: 'coast', length: (m.base - down.base) / r.range(GRADE[0], GRADE[1]), to: withLandform(down, r), turn: 0.85 });
      at = down;
    }
    const tropical = at.tSea > 21;
    const rock: RockId = r.pick(tropical ? (['coral_sand', 'coral_sand', 'basalt', 'limestone', 'quartz_sand'] as const) : (['granite', 'basalt', 'sandstone_pale', 'sandstone_red', 'limestone', 'quartz_sand', 'schist'] as const));
    const cliffs = rock !== 'coral_sand' && rock !== 'quartz_sand' && r.chance(0.5);
    const to: Macro = { ...at, base: cliffs ? r.range(40, 160) : r.range(2, 20), relief: cliffs ? r.range(120, 600) : r.range(10, 80), context: 'coast', water: 'coast', cont: r.range(0, 0.12), wet: at.tSea > 14 && at.wet < 0.25 ? at.wet : clamp(at.wet + r.range(0, 0.15), 0, 1), rock, landform: null };
    legs.push({ move: 'coast', length: r.range(10000, 20000), to: withLandform(to, r) });
    return legs;
  },
  inland(m, r) {
    if (m.cont > 0.35 && m.water !== 'coast') return null;
    const to: Macro = { ...m, cont: clamp(m.cont + r.range(0.3, 0.6), 0, 1), water: 'none', context: r.pick(['plain', 'hills'] as const), base: m.base + r.range(50, 400), relief: r.range(40, 260), wet: clamp(m.wet - r.range(0.05, 0.2), 0.02, 1), landform: null };
    return [{ move: 'inland', length: r.range(14000, 24000), to: withLandform(to, r) }];
  },
  river(m, r) {
    if (m.water === 'river' || m.water === 'coast') return null;
    const canyon = m.base > 1200 && m.wet < 0.4;
    const to: Macro = { ...m, water: 'river', context: 'valley', base: Math.max(5, m.base - r.range(50, 400)), relief: canyon ? r.range(250, 700) : r.range(60, 400), landform: null };
    return [{ move: 'river', length: r.range(8000, 18000), to: withLandform(to, r) }];
  },
  latitude(m, r) {
    if (m.context === 'mountain') return null;
    return [{ move: 'latitude', length: r.range(15000, 30000), to: withLandform({ ...m, tSea: m.tSea, landform: null }, r) }];
  },
  wetter(m, r) {
    if (m.wet > 0.85) return null;
    return [{ move: 'wetter', length: r.range(12000, 22000), to: withLandform({ ...m, wet: clamp(m.wet + r.range(0.15, 0.35), 0, 1), landform: null }, r) }];
  },
  drier(m, r) {
    if (m.wet < 0.12) return null;
    return [{ move: 'drier', length: r.range(12000, 22000), to: withLandform({ ...m, wet: clamp(m.wet - r.range(0.15, 0.35), 0.01, 1), cont: clamp(m.cont + 0.1, 0, 1), landform: null }, r) }];
  },
  province(m, r) {
    const rocks: RockId[] = m.context === 'coast' ? ['granite', 'basalt', 'limestone', 'sandstone_pale'] : ['limestone', 'granite', 'sandstone_red', 'sandstone_pale', 'shale', 'loess', 'basalt', 'rhyolite', 'schist', 'dolomite'];
    // (the cool latitudes' lowlands the ice sheets left: their till, its drumlins and lakes)
    if (m.tSea < 8 && m.context !== 'coast' && m.context !== 'mountain') rocks.push('till', 'till');
    const rock = r.pick(rocks.filter((x) => x !== m.rock));
    // (sandstone in the wet tropics: the table mountains' country, their walls rising out of the forest)
    const tables = (rock === 'sandstone_pale' || rock === 'sandstone_red') && m.tSea > 20 && m.wet > 0.6 && m.context !== 'coast' && r.chance(0.5);
    return [{ move: 'province', length: r.range(8000, 14000), to: withLandform({ ...m, rock, relief: tables ? r.range(400, 1000) : m.relief, context: tables ? 'hills' : m.context, landform: null }, r) }];
  },
  volcanic(m, r) {
    if (m.rock === 'basalt' || m.rock === 'cinder') return null;
    const context: Context = m.context === 'coast' ? 'coast' : r.pick(['plateau', 'plain', 'mountain'] as const);
    const to: Macro = { ...m, rock: r.pick(['basalt', 'cinder', 'rhyolite'] as const), context, relief: r.range(150, 900), disturb: r.chance(0.3) ? 'lava' : 'none', water: r.chance(0.3) ? 'lake' : m.water === 'coast' ? 'coast' : 'none', landform: null };
    return [{ move: 'volcanic', length: r.range(10000, 20000), to: withLandform(to, r) }];
  },
  karst(m, r) {
    if (m.wet < 0.42 || m.rock === 'limestone') return null;
    const to: Macro = { ...m, rock: r.chance(0.8) ? 'limestone' : 'dolomite', context: r.pick(['hills', 'plain', 'valley'] as const), relief: r.range(150, 420), water: r.chance(0.5) ? 'river' : 'none', landform: null };
    return [{ move: 'karst', length: r.range(10000, 18000), to: withLandform(to, r) }];
  },
  dunes(m, r) {
    if (m.wet > 0.28 || m.context === 'mountain') return null;
    const to: Macro = { ...m, rock: r.pick(['quartz_sand', 'quartz_sand', 'sandstone_red', 'gypsum'] as const), context: r.pick(['basin', 'plain'] as const), relief: r.range(30, 260), water: m.tSea > 14 && r.chance(0.2) ? 'oasis' : 'none', landform: null };
    return [{ move: 'dunes', length: r.range(8000, 16000), to: withLandform(to, r) }];
  },
  lakes(m, r) {
    if (m.water === 'lake' || m.water === 'coast' || m.wet < 0.3) return null;
    const to: Macro = { ...m, water: 'lake', context: m.context === 'mountain' ? 'mountain' : r.pick(['hills', 'plain', 'valley'] as const), landform: null };
    return [{ move: 'lakes', length: r.range(8000, 16000), to: withLandform(to, r) }];
  },
  wetland(m, r) {
    if (m.base > 700 || m.wet < 0.4 || m.water === 'wetland') return null;
    const to: Macro = { ...m, water: 'wetland', context: 'plain', relief: r.range(5, 40), base: Math.max(2, m.base - r.range(0, 150)), rock: r.chance(0.4) ? 'peat' : m.rock, landform: null };
    return [{ move: 'wetland', length: r.range(6000, 14000), to: withLandform(to, r) }];
  },
  glacial(m, r) {
    // (the ice above the road: its peaks rise into the cold where the growing season never thaws)
    if (m.context !== 'mountain' || growingAt(m, m.base + 2200) > -1.5) return null;
    const relief = clamp((growingAt(m, m.base) + 2.5) / LAPSE + r.range(0, 400), 700, 2400);
    // (the ice's country: its till, or the hard rock it carves — the rock already here where that is hard)
    const hard = m.rock === 'granite' || m.rock === 'schist' || m.rock === 'limestone' || m.rock === 'dolomite';
    const rock: RockId = r.chance(0.45) ? 'till' : hard && r.chance(0.6) ? m.rock : r.pick(['granite', 'schist'] as const);
    const to: Macro = { ...m, context: r.pick(['mountain', 'valley'] as const), rock, water: r.chance(0.5) ? 'lake' : 'river', relief, landform: null };
    return [{ move: 'glacial', length: r.range(8000, 16000), to: withLandform(to, r) }];
  },
};

const MOVE_IDS = Object.keys(MOVES) as MoveId[];

/** how often a patch is chosen on a climb or a descent, where the belts one above another are the show: the fields and pastures seldom, the terraces of rice and tea now and then */
function onSlopes(e: Efg): number {
  if (e.group !== 'T7') return 1;
  return e.code === 'T7.1r' || e.code === 'T7.1t' ? 0.3 : 0.08;
}

/**
 * The knobs at a point of a segment: its numbers eased from its start to its end; the rest — the lie of the land,
 * the rock, the water, the landform — its start's for the first half and its end's after (a climb is in the
 * mountains from halfway up, a coast's shore comes halfway down to it, a contact lies at a province move's middle)
 */
export function macroOf(seg: Segment, s: number): Macro {
  const u = clamp((s - seg.s0) / Math.max(1, seg.s1 - seg.s0), 0, 1);
  const k = u * u * (3 - 2 * u);
  const a = seg.from;
  const b = seg.to;
  const lerp = (x: number, y: number): number => x + (y - x) * k;
  return { ...(u < seg.turn ? a : b), tSea: lerp(a.tSea, b.tSea), wet: lerp(a.wet, b.wet), cont: lerp(a.cont, b.cont), base: lerp(a.base, b.base), relief: lerp(a.relief, b.relief), windward: lerp(a.windward, b.windward), month: b.month };
}

/** a journey's home: where its road begins (the workshop's gentle, temperate country) */
export function homeOf(seed: number): Macro {
  const r = new Rng(hash2(seed | 0, 0xe0, 1));
  return { tSea: r.range(10, 13.5), wet: r.range(0.6, 0.72), cont: r.range(0.5, 0.7), month: 5, base: r.range(80, 220), relief: r.range(40, 90), context: 'hills', rock: r.pick(['limestone', 'loess', 'granite'] as const), water: 'none', windward: 0, disturb: 'none', landform: 'rolling_hills' };
}

/** a triangle wave of period `period` (−1 … 1): it goes from one end to the other at an even pace */
function triangle(s: number, period: number, phase: number): number {
  return (2 / Math.PI) * Math.asin(Math.sin((2 * Math.PI * s) / period + phase));
}

/** a value at a share q (0 … 1) of a table of [share, value], linear between */
function quantile(table: readonly (readonly [number, number])[], q: number): number {
  const x = clamp(q, 0, 1);
  for (let k = 1; k < table.length; k++) {
    const [q1, v1] = table[k];
    if (x <= q1) {
      const [q0, v0] = table[k - 1];
      return v0 + ((v1 - v0) * (x - q0)) / Math.max(1e-9, q1 - q0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * The share of a tour's road below each sea-level warmth (°C): the polar a twentieth, the boreal a tenth, the
 * cool temperate a fifth, the warm temperate a quarter, the subtropics and the equatorial a fifth each — the
 * Earth's land as a traveller would choose to cross it (the mountains bring the cold belts on top).
 */
const TOUR_WARMTH: readonly (readonly [number, number])[] = [[0, -10], [0.05, -6], [0.15, 2], [0.35, 10], [0.6, 18], [0.8, 24], [1, 28]];
/** … and below each wetness: the deserts a quarter, the dry lands a fifth, the rest the humid */
const TOUR_WETNESS: readonly (readonly [number, number])[] = [[0, 0.03], [0.1, 0.1], [0.25, 0.22], [0.45, 0.4], [0.7, 0.65], [1, 0.97]];

/**
 * The long tour's warmth: the sea-level warmth the journey is drawn toward at a distance (°C) — a swing from the
 * tropics to the high latitudes and back, some two hundred kilometres a swing, at an even pace through the
 * shares of TOUR_WARMTH (a wobble on it), so that one journey meets the whole Earth.
 */
export function tourWarmth(seed: number, s: number): number {
  const r = new Rng(hash2(seed | 0, 0xe1, 2));
  const period = r.range(160000, 240000);
  const phase = r.range(0, Math.PI * 2);
  const q = 0.5 + 0.5 * triangle(s, period, phase) + 0.08 * Math.sin((2 * Math.PI * s) / (period * 0.37) + phase * 1.7);
  return quantile(TOUR_WARMTH, q);
}

/**
 * The Earth's wetness by latitude (by the sea-level warmth, °C): the always-wet equator, the dry belts of the
 * subtropics where the deserts are, the wet westerlies of the temperate latitudes, the dry cold of the poles
 */
const ZONAL_WET: readonly (readonly [number, number])[] = [[-10, 0.35], [0, 0.45], [8, 0.62], [15, 0.55], [19, 0.3], [23, 0.45], [26, 0.85], [28, 0.9]];

/** a table of [x, value] at x, linear between, its ends beyond */
function interp(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) {
    const [x1, v1] = table[k];
    if (x <= x1) {
      const [x0, v0] = table[k - 1];
      return v0 + ((v1 - v0) * (x - x0)) / Math.max(1e-9, x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * The long tour's wetness: the moisture the journey is drawn toward at a distance — a swing between the deserts
 * and the always-wet, a little quicker than the warmth's and out of step with it, so that every warmth meets
 * every wetness on a journey; a third of it the latitude's own (ZONAL_WET), so that the equator is more often
 * wet and the subtropics dry, as they are.
 */
export function tourWetness(seed: number, s: number): number {
  const r = new Rng(hash2(seed | 0, 0xe6, 4));
  const period = r.range(110000, 170000);
  const phase = r.range(0, Math.PI * 2);
  const q = 0.5 + 0.5 * triangle(s, period, phase) + 0.08 * Math.sin((2 * Math.PI * s) / (period * 0.41) + phase * 2.3);
  return clamp(0.7 * quantile(TOUR_WETNESS, q) + 0.3 * interp(ZONAL_WET, tourWarmth(seed, s)), 0.02, 0.97);
}

/** the journey of a seed: its legs and its places, laid out as far as asked */
export class EarthJourney {
  readonly segments: Segment[] = [];
  readonly scenes: Scene[] = [];
  private readonly names = new Set<string>();
  private readonly seenEfg = new Set<string>();
  private readonly seenWater = new Set<string>();
  private readonly seenLand = new Set<string>();
  private readonly lastMoves: MoveId[] = [];
  /** the index of the last place that was a highlight (isHighlight) */
  private lastHighlight = 0;
  /** the month the journey is in (the director turns it toward each place's best, two months a place at most) */
  private month = 5;
  /** the index of the last place of high drama (a range, a coast, a highlight: DRAMA_RELIEF) — kept by a journey with a sense of drama */
  private lastDrama = 0;

  /**
   * @param opts.drama the scenic roads' journey (world version 5, docs/V3/nodes/R2-roads.md): after two places of
   *   lowland the director goes looking for a range, a coast or a highlight, the harder the longer it has been —
   *   the plains never run on for long. Absent: the journey of version 4, to the last place.
   */
  constructor(
    readonly seed: number,
    readonly opts: { readonly drama?: boolean } = {},
  ) {}

  /** the place at a distance along the road (m) */
  sceneAt(s: number): Scene {
    const i = Math.max(0, Math.floor(s / SCENE_LENGTH));
    while (this.scenes.length <= i) this.layScene();
    return this.scenes[i];
  }

  /**
   * The knobs at a distance along the road (m): the legs' numbers (eased along them), with the place's own of the
   * rest — its lie of the land, rock, water, landform, month and patches (which change at a place's border)
   */
  macroAt(s: number): Macro {
    const scene = this.sceneAt(s);
    const k = this.knobsAt(s);
    return { ...scene.macro, tSea: k.tSea, wet: k.wet, cont: k.cont, base: k.base, relief: k.relief, windward: k.windward };
  }

  /** the legs' own knobs at a distance (what a place's month and landform are chosen from) */
  knobsAt(s: number): Macro {
    this.layTo(s + 1);
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.segments[mid].s1 <= s) lo = mid + 1;
      else hi = mid;
    }
    return macroOf(this.segments[lo], s);
  }

  private get end(): number {
    return this.segments.length ? this.segments[this.segments.length - 1].s1 : 0;
  }

  private state(): Macro {
    return this.segments.length ? this.segments[this.segments.length - 1].to : homeOf(this.seed);
  }

  /** (a lake in dry country is salt) */
  private static fit(m: Macro): Macro {
    let x = m;
    // (a lake in dry country is salt; a salt lake in wet country fresh again, and an oasis no more than a pond)
    if (x.water === 'lake' && x.wet < 0.26) x = { ...x, water: 'salt' };
    else if (x.water === 'salt' && x.wet > 0.38) x = { ...x, water: 'lake' };
    else if (x.water === 'oasis' && x.wet > 0.35) x = { ...x, water: 'none' };
    // (salt and gypsum are the deserts' own: in wet country they are washed away, the clays they lay on left)
    if ((x.rock === 'salt' || x.rock === 'gypsum') && x.wet > 0.38) x = { ...x, rock: 'shale' };
    // (coral sand is the warm seas' own)
    if (x.rock === 'coral_sand' && x.tSea < 18) x = { ...x, rock: 'quartz_sand' };
    return x;
  }

  /** the legs laid on as far as s */
  private layTo(s: number): void {
    if (!this.segments.length) {
      // (home: the first two scenes as the workshop's country)
      const home = homeOf(this.seed);
      this.segments.push({ move: 'latitude', s0: 0, s1: SCENE_LENGTH * 1.5, from: home, to: home, crest: false, turn: 0.5 });
    }
    while (this.end < s) this.chooseNext();
  }

  /** the signatures of the last places laid (the newest last) */
  private recent(n: number): Signature[] {
    return this.scenes.slice(-n).map((x) => x.look.sig);
  }

  /**
   * The patch of the country's mosaic a place shows, and of its water: among the cards that fit it nearly as well
   * as the best (climate.ts patchesAt), each as often as it is found, one not yet met on the journey more often,
   * the last place's own kept now and then, one of the few before less often.
   */
  private withPatches(m: Macro, r: Rng, vertical = false): Macro {
    const pick = (cands: { efg: Efg; raw: number; weight: number }[], prev: string | undefined, recent: readonly string[], seen: Set<string>): string | null => {
      if (!cands.length) return null;
      const w = cands.map((c) => {
        let x = c.weight * c.raw * c.raw;
        if (vertical) x *= onSlopes(c.efg);
        if (!seen.has(c.efg.code)) x *= FRESH_PATCH;
        if (c.efg.code === prev) x *= 1.3;
        else if (recent.includes(c.efg.code)) x *= 0.5;
        return x;
      });
      return cands[r.weighted(w)].efg.code;
    };
    const last = this.scenes.slice(-5);
    const prev = last[last.length - 1];
    const efg = pick(patchesAt(m, m.base), prev?.look.efg.code, last.map((x) => x.look.efg.code), this.seenEfg);
    const waterEfg = pick(patchesAt(m, m.base, true), prev?.look.water?.code, last.map((x) => x.look.water?.code ?? ''), this.seenWater);
    return { ...m, efg, waterEfg };
  }

  private chooseNext(): void {
    const m = this.state();
    const step = this.segments.length;
    const last = this.lastMoves[this.lastMoves.length - 1] ?? null;
    const r = new Rng(hash2(this.seed | 0, step, 0xe3));
    const recent = this.recent(12);
    const target = tourWarmth(this.seed, this.end + 20000);
    const options: { legs: Leg[]; score: number }[] = [];
    MOVE_IDS.forEach((id, k) => {
      const mr = new Rng(hash2(this.seed | 0, step * 31 + k, 0xe4));
      let legs = MOVES[id](m, mr, last);
      if (!legs) return;
      // (every move drifts toward the long tour's warmth and wetness, as far as its length allows: about a degree
      // and a twentieth of the wetness every five kilometres — a latitude move twice that; a rain shadow's or a
      // shore's own change comes on top)
      legs = legs.map((leg) => {
        const reach = leg.length / 5000;
        const wantT = tourWarmth(this.seed, this.end + leg.length);
        const wantW = tourWetness(this.seed, this.end + leg.length);
        // (over a range the change is the height's: the latitude and the climate barely drift on a climb)
        const vertical = id === 'climb' || id === 'descend' || id === 'glacial';
        const kT = id === 'latitude' ? 2 : vertical ? 0.25 : 1;
        const kW = vertical ? 0.25 : 1;
        const tSea = clamp(leg.to.tSea + clamp(wantT - leg.to.tSea, -1.1 * kT * reach, 1.1 * kT * reach), -16, 28);
        const wet = id === 'wetter' || id === 'drier' ? leg.to.wet : clamp(leg.to.wet + clamp(wantW - leg.to.wet, -0.05 * kW * reach, 0.05 * kW * reach), 0.01, 1);
        // (and the road comes down as its latitude cools under it: it stays below the snowline — PASS_COLDEST)
        const cooled: Macro = { ...leg.to, tSea, wet };
        const highest = Math.max(0, (tSea + 0.6 * swingOf(cooled) - PASS_COLDEST) / LAPSE);
        return { ...leg, to: cooled.base > highest ? { ...cooled, base: highest } : cooled };
      });
      // the places it would bring, foreseen at its legs' middles and ends
      let novelty = 0;
      let fresh = 0;
      let samples = 0;
      let prev = m;
      let runs = 1;
      let highlight = false;
      const lastScenes = this.scenes.slice(-3);
      for (const leg of legs) {
        for (const u of [0.5, 1]) {
          const at: Macro = u === 1 ? leg.to : macroOf({ move: id, s0: 0, s1: 1, from: prev, to: leg.to, crest: false, turn: leg.turn ?? 0.5 }, 0.5);
          const look = lookOf(at);
          const d = recent.length ? Math.min(...recent.map((x) => distance(x, look.sig))) : 1;
          novelty += d;
          if (!this.seenEfg.has(look.efg.code)) fresh += 1;
          if (!this.seenLand.has(look.landform.id)) fresh += 0.6;
          // (the same lie of the land, the same structure as each of the last three places: a run too long)
          if (lastScenes.length === 3 && lastScenes.every((x) => x.macro.context === at.context)) runs *= 0.7;
          if (lastScenes.length === 3 && lastScenes.every((x) => x.look.sig.struct === look.sig.struct)) runs *= 0.7;
          if (look.efg.code === 'T6.1' && lastScenes.some((x) => x.look.efg.code === 'T6.1')) runs *= 0.4;
          if (isHighlight(look) || (leg.crest && u === 1)) highlight = true;
          samples++;
        }
        prev = leg.to;
      }
      novelty /= samples;
      // the rhythm: not the same move twice running, not three of a kind in the last four
      let rhythm = 1;
      if (id === last) rhythm *= 0.25;
      if (this.lastMoves.slice(-4).filter((x) => x === id).length >= 2) rhythm *= 0.4;
      // (high and low in turn: after a long time up high, the way down is welcome; after the lowlands, a range)
      if (id === 'climb' && m.base > 2500) rhythm *= 0.5;
      // (the wet tropics' great climb, through the rainforest, the cloud forest and the páramo, is the Earth's finest)
      if (id === 'climb' && m.tSea > 21 && m.wet > 0.7 && m.base < 1200) rhythm *= 1.8;
      if (id === 'descend' && m.base > 2500) rhythm *= 1.5;
      // the tour: a move that brings the warmth the tour asks for
      const end = legs[legs.length - 1].to;
      const tour = (1 + 0.15 * Math.max(0, 1 - Math.abs(target - end.tSea) / 12)) * (id === 'latitude' ? 1 + Math.min(1.5, Math.abs(target - m.tSea) / 8) : 1) * (target > 20 && end.base < 400 ? 1.35 : 1);
      // (a while without a highlight: the moves that bring one, the more eagerly the longer it has been)
      const gap = this.scenes.length - this.lastHighlight;
      const want = highlight && gap >= HIGHLIGHT_AFTER ? Math.min(4, 1 + 0.45 * (gap - HIGHLIGHT_AFTER + 1)) : 1;
      // (a journey with a sense of drama: after the lowlands a range, a coast, a highlight — the harder the longer)
      let drama = 1;
      if (this.opts.drama) {
        const flat = this.scenes.length - this.lastDrama;
        if (flat >= DRAMA_AFTER && (highlight || legs.some((g) => dramatic(g.to)))) drama = Math.min(4, 1 + 0.6 * (flat - DRAMA_AFTER + 1));
      }
      const score = (0.2 + novelty) * (1 + 0.5 * fresh) * rhythm * tour * runs * want * drama;
      options.push({ legs, score });
    });
    options.sort((a, b) => b.score - a.score);
    const top = options.slice(0, 4);
    const chosen = top[r.weighted(top.map((o) => o.score * o.score))];
    let from = m;
    for (const leg of chosen.legs) {
      const s0 = this.end;
      const to = EarthJourney.fit(leg.to);
      this.segments.push({ move: leg.move, s0, s1: s0 + leg.length, from, to, crest: !!leg.crest, turn: leg.turn ?? 0.5 });
      from = to;
    }
    this.lastMoves.push(chosen.legs[0].move);
  }

  private layScene(): void {
    const i = this.scenes.length;
    const s0 = i * SCENE_LENGTH;
    const s1 = s0 + SCENE_LENGTH;
    const mid = (s0 + s1) / 2;
    const knobs = this.knobsAt(mid);
    const r = new Rng(hash2(this.seed | 0, i, 0xe5));
    // the month: turned toward the season this place is at its best in, two months a place at most
    // (after SNOW_RUN places in the snow among the last six, toward the warmest month instead, as fast as the season may turn,
    // wherever the place would still lie under snow in the month it wants: the snow is a place now and then, not the winter)
    const here = ecosystemAt(knobs, knobs.base).efg.code;
    let want = bestMonth(here, this.month);
    const snowy = this.scenes.slice(-6).filter((sc) => snowAt(sc.macro, sc.macro.base, sc.macro.month)).length;
    const escape = snowy >= SNOW_RUN && snowAt(knobs, knobs.base, want);
    if (escape) want = 7;
    this.month = i === 0 ? 5 : monthToward(this.month, want, 2);
    // the landform: among those that can stand here, the move's own more often, the last place's now and then, not one of the few before
    const prevLand = this.scenes[i - 1]?.macro.landform ?? null;
    const recentLands = this.scenes.slice(-5).map((x) => x.macro.landform);
    const options = landformsFor(knobs).slice(0, 8);
    let landform: string | null = null;
    const seg0 = this.segments.find((x) => x.s0 <= mid && x.s1 > mid);
    const theme = seg0 ? THEME[seg0.move] : undefined;
    if (options.length) {
      const w = options.map((o) => {
        let x = o.fit * o.fit;
        if (o.landform.id === knobs.landform) x *= 2.2;
        if (theme?.includes(o.landform.process)) x *= 2;
        // (a while without a highlight: one of the landforms one remembers, where one can stand here, the more often the longer it has been)
        const gap = i - this.lastHighlight;
        if (gap >= HIGHLIGHT_AFTER && HIGHLIGHT_LANDS.has(o.landform.id)) x *= 1 + 0.8 * (gap - HIGHLIGHT_AFTER + 1);
        if (o.landform.id === prevLand) x *= 0.45;
        else if (recentLands.includes(o.landform.id)) x *= 0.3;
        if (o.landform.process === 'plain') x *= 0.5;
        return x;
      });
      landform = options[r.weighted(w)].landform.id;
    }
    const vertical = seg0?.move === 'climb' || seg0?.move === 'descend';
    let macro: Macro = this.withPatches({ ...knobs, month: this.month, landform }, r, vertical);
    let look = lookOf(macro);
    // (too like the place before — five more minutes of the same: the director varies it as the country itself
    // varies within a province: another landform that can stand here, a river come down to the road or left
    // behind, the rock's sibling across a contact — whichever makes it most unlike, as long as it can be)
    const prev = this.scenes[i - 1];
    if (prev && distance(prev.look.sig, look.sig) < VARY_BELOW) {
      // (each way of varying it as likely as it is: a landform as it fits, a patch as often as it is found)
      const tries: { m: Macro; p: number }[] = [];
      for (const o of options) if (o.landform.id !== landform && o.landform.id !== prev.macro.landform) tries.push({ m: { ...macro, landform: o.landform.id }, p: o.fit });
      for (const p of patchesAt(macro, macro.base)) if (p.efg.code !== look.efg.code) tries.push({ m: { ...macro, efg: p.efg.code }, p: p.weight * p.raw * p.raw * (vertical ? onSlopes(p.efg) : 1) });
      if (macro.water === 'none' && macro.wet > 0.12 && macro.context !== 'coast') tries.push({ m: { ...macro, water: 'river', waterEfg: null }, p: 0.7 });
      if (macro.water === 'none' && macro.wet < 0.25 && warmthAt(macro, macro.base) > 12 && macro.context !== 'coast') tries.push({ m: { ...macro, water: 'oasis', waterEfg: null }, p: 0.3 });
      if (macro.water === 'river') tries.push({ m: { ...macro, water: 'none', waterEfg: null }, p: 0.7 });
      // (a lake, a salt pan, a marsh left behind: the plain beyond it)
      if (macro.water === 'lake' || macro.water === 'salt' || macro.water === 'wetland') tries.push({ m: { ...macro, water: 'none', waterEfg: null, rock: macro.rock === 'salt' ? 'shale' : macro.rock }, p: 0.6 });
      const sib = SIBLING[macro.rock];
      if (sib) tries.push({ m: { ...macro, rock: sib }, p: 0.6 });
      // (those that make it unlike enough, by their likelihood; or failing any, the most unlike)
      const d0 = distance(prev.look.sig, look.sig);
      const enough: { m: Macro; look: Look; p: number }[] = [];
      let far: { m: Macro; look: Look; d: number } | null = null;
      for (const t of tries) {
        const fitted = landformsFor(t.m).find((o) => o.landform.id === t.m.landform);
        const m2: Macro = fitted || t.m.landform === null ? t.m : { ...t.m, landform: landformsFor(t.m)[0]?.landform.id ?? null };
        const l2 = lookOf(m2);
        const d = distance(prev.look.sig, l2.sig);
        if (d >= VARY_BELOW) enough.push({ m: m2, look: l2, p: t.p });
        else if (d > d0 + 0.02 && (!far || d > far.d)) far = { m: m2, look: l2, d };
      }
      const pick = enough.length ? enough[r.weighted(enough.map((x) => x.p))] : far;
      if (pick) {
        macro = pick.m;
        look = pick.look;
      }
    }
    const avoid = this.scenes.slice(-2).map((x) => x.name.slice(0, 1));
    const { name, tag } = nameOf(look, macro, this.names, () => r.next(), avoid);
    // the moment: the landform's, or the ecosystem's (or its water's) where the land is plain
    const seg = this.segments.find((x) => x.s0 <= mid && x.s1 > mid) ?? this.segments[this.segments.length - 1];
    const crestHere = this.segments.some((x) => x.crest && x.s1 >= s0 && x.s1 < s1);
    const moments = [look.landform.process !== 'plain' ? look.landform.moment : null, ...look.efg.signature, ...(look.water?.signature ?? [])].filter((x): x is string => !!x);
    const moment = crestHere ? `翻过山口：${moments[0] ?? look.efg.signature[0]}` : moments[Math.floor(r.next() * Math.min(moments.length, 3))] ?? look.efg.signature[0];
    this.seenEfg.add(look.efg.code);
    if (look.water) this.seenWater.add(look.water.code);
    this.seenLand.add(look.landform.id);
    for (const b of look.belts) this.seenEfg.add(b.code);
    if (isHighlight(look) || crestHere) this.lastHighlight = i;
    if (isHighlight(look) || crestHere || dramatic(macro)) this.lastDrama = i;
    this.scenes.push({ index: i, s0, s1, macro, look, name, tag, moment, move: seg.move });
  }
}
