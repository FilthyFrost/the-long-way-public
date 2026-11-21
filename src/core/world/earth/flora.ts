/**
 * What a region of the emergent Earth grows (docs/V3/nodes/E1-earth-world.md): its flora table (flora.ts
 * FloraTable) made from the ecosystem cards of its place (core/earth/efg.ts) — the ecosystem at the road and the
 * belts up its slopes — the trees, shrubs and crops their forms name drawn as the plants the world has
 * (plants.ts), as many to the hectare as the card's structure stands them, the woods as much of the land as its
 * cover says, ending where the growing season does (core/earth/climate.ts: the tree line); the grass, the
 * flowers and the bare ground between them as the structure has them.
 *
 * The forms are drawn by the nearest plant the world has (FORM_PLANTS): E3 grows the Earth's own.
 */
import type { Band, FloraRule, FloraTable } from '../flora';
import type { Scene } from '../../earth/director';
import type { RoadType } from '../../earth/roads';
import type { Efg, Form, Struct } from '../../earth/efg';
import { growingAt, wetnessAt, LAPSE } from '../../earth/climate';
import { rock } from '../../earth/rocks';

const LAKE = 1;
const RIVER = 2;
const SEA = 4;
const FRESH = LAKE | RIVER;

/** the plants a form is drawn as, the warm country's first where it has its own (the tropics: tSea above 20 °C) */
const FORM_PLANTS: Partial<Record<Form, { cool: readonly string[]; warm?: readonly string[] }>> = {
  broadleaf: { cool: ['oak', 'linden', 'beech', 'ash'], warm: ['river_fig', 'giant_broadleaf', 'camphor'] },
  broadleaf_small: { cool: ['ash', 'linden'], warm: ['marula', 'camphor'] },
  broadleaf_leader: { cool: ['birch', 'aspen', 'poplar'] },
  emergent: { cool: ['giant_broadleaf'], warm: ['giant_broadleaf'] },
  laurel: { cool: ['camphor'] },
  eucalypt: { cool: ['eucalyptus'] },
  sclerophyll: { cool: ['olive', 'eucalyptus'] },
  conifer_spire: { cool: ['spruce', 'fir'] },
  conifer_tiered: { cool: ['cedar', 'araucaria'] },
  pine: { cool: ['pine'] },
  pine_umbrella: { cool: ['stone_pine'] },
  cypress: { cool: ['cypress'] },
  juniper: { cool: ['juniper'] },
  larch: { cool: ['larch'] },
  redwood: { cool: ['redwood'] },
  palm: { cool: ['coconut_palm'] },
  palm_fan: { cool: ['fan_palm'] },
  bamboo: { cool: ['bamboo'] },
  tree_fern: { cool: ['tree_fern'] },
  umbrella: { cool: ['acacia'] },
  bottle: { cool: ['baobab'] },
  succulent_tree: { cool: ['joshua_tree'], warm: ['dragon_tree', 'joshua_tree'] },
  cactus: { cool: ['saguaro'] },
  mangrove: { cool: ['mangrove'] },
  willow: { cool: ['willow'] },
  krummholz: { cool: ['dwarf_pine'] },
  blossom: { cool: ['cherry_tree'], warm: ['flame_tree', 'jacaranda'] },
  orchard: { cool: ['apple_tree', 'persimmon_tree', 'cherry_tree'] },
  olive: { cool: ['olive'] },
  shrub_round: { cool: ['bush', 'hazel'] },
  shrub_heath: { cool: ['heath_bush', 'blueberry_bush'] },
  shrub_sage: { cool: ['sage_bush'] },
  shrub_thorn: { cool: ['thorn_bush'], warm: ['thorn_bush', 'ocotillo'] },
  shrub_sclero: { cool: ['bush', 'rhododendron'] },
  // (the tropical alpine's giant rosettes are frailejones; the dry country's, agaves: plantsOf)
  rosette_giant: { cool: ['agave'] },
  rosette: { cool: ['agave'] },
  fern: { cool: ['fern'] },
  reed: { cool: ['reed'] },
  crop_rice: { cool: ['rice_stand'] },
  crop_vine: { cool: ['grape_vine'] },
  crop_tea: { cool: ['tea_bush'] },
  crop_sunflower: { cool: ['sunflower'] },
};

/** the trees standing to a hectare where the land suits them, and how much of the land is wood, by structure */
const STAND: Readonly<Record<Struct, { trees: number; wood: number; shrubs: number }>> = {
  // (V4: the woods' shrubs doubled — drawn now in the places of the emergent Earth, scene/floraScatter.ts)
  closed_forest: { trees: 110, wood: 0.82, shrubs: 110 },
  open_forest: { trees: 70, wood: 0.6, shrubs: 100 },
  woodland: { trees: 45, wood: 0.32, shrubs: 80 },
  savanna: { trees: 7, wood: 0.1, shrubs: 25 },
  shrubland: { trees: 3, wood: 0.05, shrubs: 140 },
  grassland: { trees: 0.8, wood: 0.03, shrubs: 10 },
  farmland: { trees: 2, wood: 0.05, shrubs: 6 },
  wetland: { trees: 6, wood: 0.08, shrubs: 30 },
  tundra: { trees: 0, wood: 0, shrubs: 40 },
  desert: { trees: 4, wood: 0, shrubs: 45 },
  bare: { trees: 0, wood: 0, shrubs: 6 },
  ice: { trees: 0, wood: 0, shrubs: 0 },
  water: { trees: 0, wood: 0, shrubs: 0 },
};

/** (a card whose ground has room for a lone tree: grassland with trees of its own) */
const st0 = (e: Efg): boolean => e.trees.length > 0;
/** (salt underfoot: nothing stands on it) */
const salt0 = (m: Scene['macro']): boolean => rock(m.rock).fertile < 0.03;

/** the flowers' colours, by their forms */
const FLOWER_HUE: Readonly<Record<string, number>> = { flower_daisy: 0xf4f0e6, flower_cup: 0xd8483a, flower_spike: 0x9a7fd0, flower_umbel: 0xf4efe0, flower_bell: 0x6f8fd8, flower_tube: 0xe89ab0, flower_cluster: 0xe89ab0, crop_sunflower: 0xf2c84b, crop_tulip: 0xd8483a, crop_rape: 0xf2d84b, crop_lavender: 0x8a6ec8, aquatic: 0xf4f0e6 };

const b = (lo: number, hi: number): Band => [lo, hi];

/**
 * The plants of one card's forms, its first the most. In autumn a deciduous wood's broadleaves are its autumn's:
 * maples red where the winters are hard and the country continental, aspens gold by a milder sea (the trait rules, §6)
 */
function plantsOf(forms: readonly Form[], warm: boolean, autumn: 'red' | 'gold' | null = null, alpine = false): string[] {
  const out: string[] = [];
  for (const f of forms) {
    const p = FORM_PLANTS[f];
    if (!p) continue;
    const ids = alpine && f === 'rosette_giant' ? ['frailejon'] : autumn && (f === 'broadleaf' || f === 'broadleaf_leader') ? (autumn === 'red' ? ['maple', 'maple', 'oak'] : ['golden_aspen', 'birch', 'oak']) : (warm && p.warm) || p.cool;
    for (const id of ids) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** a card's share of the trees and shrubs, for the plants of its forms in turn: a half, then a third of what is left … */
function shares(n: number): number[] {
  const out: number[] = [];
  let left = 1;
  for (let i = 0; i < n; i++) {
    const s = i === n - 1 ? left : left * (i === 0 ? 0.5 : 0.45);
    out.push(s);
    left -= s;
  }
  return out;
}

/** the rules of one card's trees and shrubs, within a band of relief (m above the road's base) */
function rulesOf(e: Efg, warm: boolean, relief: Band | undefined, scale: number, autumn: 'red' | 'gold' | null = null): { trees: FloraRule[]; shrubs: FloraRule[] } {
  const st = STAND[e.struct];
  const trees: FloraRule[] = [];
  const shrubs: FloraRule[] = [];
  const tp = plantsOf(e.trees, warm, autumn);
  const ts = shares(tp.length);
  const r = relief ? { relief } : {};
  const open = e.struct === 'savanna' || e.struct === 'grassland' || e.struct === 'farmland' || e.struct === 'shrubland' || e.struct === 'desert' || e.struct === 'wetland';
  tp.forEach((plant, i) => {
    const perHa = st.trees * ts[i] * scale;
    if (perHa <= 0) return;
    // (in open country the trees stand alone or in clumps over all of it; in a wood, under its canopy)
    if (open) trees.push({ plant, perHa: Math.max(0.3, perHa), grove: e.struct === 'savanna' ? 140 : 90, ...r, size: b(0.75, 1.25) });
    else trees.push({ plant, perHa, canopy: b(0.35, 1), grove: 140, ...r });
  });
  // (a wood's edge and its clearings: some of its trees out in the open, smaller)
  if (!open && tp.length && st.trees > 0) trees.push({ plant: tp[0], perHa: st.trees * 0.12 * scale, canopy: b(0.08, 0.4), size: b(0.55, 0.9), ...r });
  // (V4: its understory — young trees of its second kind, or its first, under the canopy, a third to two thirds grown —
  // so that a wood seen from the road is a wood and not a park of trunks)
  if (!open && tp.length && st.trees > 0) trees.push({ plant: tp[1] ?? tp[0], perHa: st.trees * 0.32 * scale, canopy: b(0.45, 1), size: b(0.38, 0.62), ...r });
  const sp = plantsOf(e.shrubs, warm, null, e.group === 'T6');
  const ss = shares(sp.length);
  sp.forEach((plant, i) => {
    if (plant === 'reed') return;
    const perHa = st.shrubs * ss[i] * scale;
    if (perHa > 0) shrubs.push({ plant, perHa, ...(open ? {} : { canopy: b(0.04, 0.85) }), grove: 70, ...r });
  });
  // (the crops of fields and terraces: their own rows or benches)
  for (const f of e.herbs) {
    if (f === 'crop_rice') shrubs.push({ plant: 'rice_stand', perHa: 220, moisture: b(0.4, 1), slope: b(0, 0.35), ...r });
    if (f === 'crop_tea') shrubs.push({ plant: 'tea_bush', perHa: 160, slope: b(0, 0.6), ...r });
    if (f === 'crop_vine') shrubs.push({ plant: 'grape_vine', perHa: 120, slope: b(0, 0.4), ...r });
  }
  for (const f of e.flowers ?? []) if (f === 'crop_sunflower') shrubs.push({ plant: 'sunflower', perHa: 140, slope: b(0, 0.25), ...r });
  return { trees, shrubs };
}

/**
 * A place's flora table: the card at the road over the land up to near where the next belt begins, the next belt's
 * card above it (a mountain's woods change on the way up), the woods ending at the tree line, the waters' own by
 * their banks, the ground's grass, flowers and bare patches as the card at the road has them.
 */
export function floraOfPlace(sc: Scene, road?: RoadType): FloraTable {
  const m = sc.macro;
  const e = sc.look.efg;
  const warm = m.tSea > 20;
  const w = wetnessAt(m, m.base);
  const R = Math.max(20, m.relief);
  const belts = sc.look.belts;
  const upper = belts.length > 1 ? belts[1] : null;
  // (the tree line: m above the road's base where the growing season falls below 6.4 °C)
  const line = (growingAt(m, m.base) - 6.4) / LAPSE;
  const treeline: readonly [number, number] | null = line < R + 200 ? [Math.max(-40, line - 90), Math.max(-20, line + 10)] : null;
  const autumn = sc.look.sig.veg === 'autumn' && (e.struct === 'closed_forest' || e.struct === 'open_forest' || e.struct === 'woodland') ? (m.cont > 0.55 ? 'red' : 'gold') : null;
  const low = rulesOf(e, warm, upper ? b(-1e4, R * 0.42) : undefined, 1, autumn);
  const high = upper && upper.code !== e.code ? rulesOf(upper, warm, b(R * 0.3, 1e5), 1) : { trees: [], shrubs: [] };
  const trees = [...low.trees, ...high.trees];
  // (the traits of stress, §6: the last trees below the tree line low and bent — the krummholz; in dry country every
  // tree smaller; on a windy card's ridges the same)
  const first = trees[0];
  if (treeline && first) trees.push({ plant: warm ? first.plant : 'dwarf_pine', perHa: 40, relief: b(treeline[0] - 120, treeline[1]), size: b(0.4, 0.7) });
  const stressed = w < 0.35 || (e.weather?.wind ?? 0) > 0.5;
  if (stressed) for (let i = 0; i < trees.length; i++) if (!trees[i].size) trees[i] = { ...trees[i], size: b(0.6, 0.95) };
  // the roadside, as the country has it: in farmland rows of poplars along the road (cypresses in the Mediterranean's), in
  // open grassland now and then a great tree alone by it, in the savanna its flat-topped acacias
  if (e.struct === 'farmland' && !salt0(m)) trees.push({ plant: m.tSea > 13 && w < 0.6 ? 'cypress' : 'poplar', perHa: 160, road: b(12, 26), hedge: 140, size: b(0.9, 1.2) });
  if (e.struct === 'grassland' && st0(e) && !salt0(m)) trees.push({ plant: warm ? 'acacia' : 'oak', perHa: 0.4, road: b(28, 4000), size: b(1.2, 1.45) });
  if (e.struct === 'savanna') trees.push({ plant: 'acacia', perHa: 1.2, road: b(30, 4000), size: b(1, 1.3) });
  // (world version 5) an avenue, a tunnel of trees: the country's own tree in close rows along both sides, its crowns
  // meeting over the road (core/earth/roads.ts RoadType.avenue)
  const avenue = road?.avenue ?? 0;
  if (avenue > 0 && first && !salt0(m)) trees.push({ plant: first.plant, perHa: 640 * avenue, road: b(7.7, 10.6), size: b(1.15, 1.45) });
  const shrubs = [...low.shrubs, ...high.shrubs];
  // the waters' own: willows and poplars by fresh water where the card stands no trees of the bank, reeds, mangroves by a tropical sea
  if (m.water !== 'none' && m.water !== 'salt' && e.struct !== 'ice') {
    if (warm && (m.water === 'coast' || m.water === 'wetland')) trees.push({ plant: 'mangrove', perHa: 60, water: b(0, 14), waterKinds: SEA | FRESH });
    if (!warm || m.water !== 'coast') trees.push({ plant: warm ? 'river_fig' : 'willow', perHa: 30, water: b(0, 14), waterKinds: FRESH });
    if (m.tSea > 15 && (m.water === 'oasis' || (w < 0.3 && m.water === 'river'))) trees.push({ plant: 'fan_palm', perHa: 70, water: b(0, 30), waterKinds: FRESH });
    shrubs.push({ plant: 'reed', perHa: 380, water: b(0, 5), waterKinds: FRESH });
  }
  const st = STAND[e.struct];
  const fl = (e.flowers ?? []).map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const crops = e.herbs.map((f) => FLOWER_HUE[f]).filter((x): x is number => x !== undefined);
  const rows = e.herbs.some((f) => f === 'crop_wheat' || f === 'crop_lavender' || f === 'crop_tulip' || f === 'crop_rape') ? { spacing: e.herbs.includes('crop_lavender') ? 1.6 : 2.2, share: 0.55, maxSlope: 0.18 } : undefined;
  // (on the salt itself — a pan, a crust — hardly a blade: the white shows)
  const salt = rock(m.rock).fertile < 0.03;
  const grass = salt ? 0.04 : e.struct === 'ice' ? 0 : e.struct === 'bare' ? 0.06 : e.struct === 'desert' ? 0.12 : e.struct === 'tundra' ? 0.5 : e.struct === 'shrubland' ? 0.55 : e.struct === 'closed_forest' ? 0.6 : 0.95;
  return {
    earth: true,
    eco: {
      wood: salt ? 0 : Math.min(0.95, st.wood * (0.6 + 0.5 * e.cover)),
      woodScale: e.struct === 'closed_forest' ? 400 : e.struct === 'open_forest' ? 320 : 240,
      // (an avenue's wood comes right up to its rows)
      clear: avenue > 0 ? 9 : 12,
      edge: avenue > 0 ? 10 : e.struct === 'closed_forest' ? 18 : 40,
      treeline,
      thirsty: Math.min(0.8, Math.max(0.15, 0.85 - w)),
      moist: Math.min(0.9, Math.max(0.05, 0.75 * w + (m.water === 'wetland' ? 0.25 : 0))),
    },
    trees,
    shrubs,
    ground: [
      ...(e.struct === 'closed_forest' || e.struct === 'open_forest' ? [{ plant: 'log', perHa: 8, canopy: b(0.5, 1) }] : []),
      { plant: 'rock', perHa: e.struct === 'bare' || e.struct === 'desert' || e.struct === 'tundra' ? 30 : 6 },
      ...(e.struct === 'bare' || e.struct === 'desert' || sc.look.landform.process === 'glacial' ? [{ plant: 'boulder', perHa: 6 }] : []),
      ...(fl.length && grass > 0.3 ? [{ plant: 'flower_clump', perHa: 20 * fl.length, canopy: b(0, 0.3) }] : []),
    ],
    cover: {
      grass,
      // (V4: the meadows a little taller, as Painted Valley's: knee high)
      height: e.struct === 'savanna' ? 0.9 : e.struct === 'tundra' ? 0.15 : e.struct === 'farmland' ? 0.55 : e.struct === 'desert' ? 0.2 : 0.52,
      // (V4: the open country's wild flowers half as many again — a meadow in bloom a sprinkle all over, as Painted Valley's)
      flowers: Math.min(0.5, (e.struct === 'grassland' || e.struct === 'savanna' || e.struct === 'woodland' || e.struct === 'open_forest' || e.struct === 'shrubland' || e.struct === 'tundra' ? 0.065 : 0.04) * fl.length + (e.code === 'T7.1f' ? 0.4 : e.code === 'T7.1l' ? 0.35 : 0)),
      hues: [...crops, ...fl].slice(0, 4).length ? [...crops, ...fl].slice(0, 4) : [0xf4f0e6],
      ...(rows ? { rows } : {}),
      bare: salt ? 0.96 : e.struct === 'ice' ? 1 : e.struct === 'bare' ? 0.9 : e.struct === 'desert' ? 0.75 : e.struct === 'tundra' ? 0.25 : e.struct === 'shrubland' ? 0.2 : 0,
    },
  };
}
