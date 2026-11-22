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
import { PLANTS, plantIndex } from '../plants';

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

/** trees or shrubs in clumps: one in `share` of the squares `every` m a side, r m in radius, so many to the hectare inside */
interface Clumps {
  every: number;
  share: number;
  r: Band;
  perHa: number;
}

/**
 * (G3, docs/V3/nodes/G-ghibli.md) How a card's country is set out, by its structure — what a photograph of such country
 * shows, not so many plants to the hectare thrown anywhere:
 *
 *   a forest      stands of one kind of tree with closed crowns (`core` trees to the hectare in a stand's middle, `under`
 *                 young ones beneath), a mantle of shrubs along its edge and round its clearings, a few under it;
 *   a woodland    the same in groves, with copses and thickets out in its grass;
 *   a savanna     its trees keeping their distance, each on its own ground's water, thorn in thickets;
 *   a grassland   open, a copse now and then, a thicket in a hollow;
 *   a shrubland   a mosaic of thickets and open ground, trees in small groups;
 *   a desert      shrubs evenly apart, bare ground between, a tall cactus or a yucca every so often;
 *   a tundra      mats of dwarf shrub in patches;
 *   a wetland     carrs of willow, beds of reed.
 */
interface Pattern {
  core: number;
  under: number;
  /** in the open: copses of trees, and trees that keep their distance (m apart, so many to the hectare) */
  copse?: Clumps;
  apart?: { spacing: number; perHa: number };
  /** shrubs to the hectare along a wood's edge, and under it */
  mantle: number;
  understory: number;
  /** in the open: thickets, and shrubs that keep their distance */
  thicket?: Clumps;
  shrubsApart?: { spacing: number; perHa: number };
}

const PATTERN: Readonly<Record<Struct, Pattern>> = {
  // (the frame's budget: a closed wood's crowns are the dearest thing in sight — harness/shots/perf_gate.mjs, its river spot)
  closed_forest: { core: 104, under: 14, mantle: 330, understory: 22, thicket: { every: 96, share: 0.2, r: [4, 8], perHa: 480 } },
  open_forest: { core: 96, under: 12, mantle: 330, understory: 18, thicket: { every: 90, share: 0.25, r: [4, 9], perHa: 480 } },
  woodland: { core: 92, under: 10, copse: { every: 230, share: 0.22, r: [9, 18], perHa: 130 }, mantle: 320, understory: 16, thicket: { every: 84, share: 0.28, r: [4, 9], perHa: 480 } },
  savanna: { core: 70, under: 0, apart: { spacing: 40, perHa: 5.2 }, copse: { every: 260, share: 0.12, r: [8, 14], perHa: 110 }, mantle: 220, understory: 0, thicket: { every: 72, share: 0.3, r: [4, 9], perHa: 440 } },
  shrubland: { core: 70, under: 0, copse: { every: 210, share: 0.24, r: [7, 14], perHa: 120 }, apart: { spacing: 96, perHa: 0.45 }, mantle: 300, understory: 0, thicket: { every: 44, share: 0.8, r: [7, 18], perHa: 540 } },
  grassland: { core: 80, under: 0, copse: { every: 320, share: 0.24, r: [9, 19], perHa: 140 }, mantle: 300, understory: 0, thicket: { every: 130, share: 0.22, r: [4, 8], perHa: 480 } },
  farmland: { core: 80, under: 0, copse: { every: 280, share: 0.2, r: [8, 16], perHa: 140 }, mantle: 300, understory: 0, thicket: { every: 150, share: 0.15, r: [4, 7], perHa: 480 } },
  wetland: { core: 90, under: 8, copse: { every: 150, share: 0.42, r: [10, 22], perHa: 140 }, mantle: 380, understory: 20, thicket: { every: 64, share: 0.38, r: [5, 11], perHa: 520 } },
  tundra: { core: 0, under: 0, mantle: 0, understory: 0, thicket: { every: 36, share: 0.55, r: [3, 8], perHa: 520 } },
  desert: { core: 0, under: 0, apart: { spacing: 48, perHa: 3.6 }, mantle: 0, understory: 0, shrubsApart: { spacing: 12, perHa: 44 } },
  bare: { core: 0, under: 0, mantle: 0, understory: 0, shrubsApart: { spacing: 28, perHa: 5 } },
  ice: { core: 0, under: 0, mantle: 0, understory: 0 },
  water: { core: 0, under: 0, mantle: 0, understory: 0 },
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

/** how steep a place's woods still grow, against the slope limits of the ecotope (EcoParams.cling) */
function clingOf(sc: Scene, w: number): number {
  const lf = sc.look.landform.id;
  if (w < 0.45) return 1;
  if (lf === 'cone_karst' || lf === 'tower_karst' || lf === 'pillar_mountain') return 2.3;
  if (lf === 'waterfall_gorge' || lf === 'danxia' || lf === 'stone_forest') return 1.6;
  return 1;
}

/** how open a karst's floor is (EcoParams.floor) */
function karstFloor(sc: Scene): number {
  const lf = sc.look.landform.id;
  return lf === 'tower_karst' ? 0.72 : lf === 'pillar_mountain' ? 0.5 : lf === 'cone_karst' ? 0.3 : 0;
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
function rulesOf(e: Efg, warm: boolean, relief: Band | undefined, scale: number, autumn: 'red' | 'gold' | null = null): { trees: FloraRule[]; shrubs: FloraRule[]; brush: FloraRule[] } {
  const st = STAND[e.struct];
  const pt = PATTERN[e.struct];
  const trees: FloraRule[] = [];
  const shrubs: FloraRule[] = [];
  const brush: FloraRule[] = [];
  const tp = st.trees > 0 ? plantsOf(e.trees, warm, autumn) : [];
  const ts = shares(tp.length);
  const r = relief ? { relief } : {};
  // (G3) its trees: the stands of its woods — each stand of one of its kinds, the kinds with the most numbers the
  // oftener (flora.ts FloraRule.stand) — their young under them; out of the woods its copses, and the trees that keep
  // their distance
  tp.forEach((plant, i) => {
    if (pt.core > 0) trees.push({ plant, perHa: pt.core * ts[i] * scale, stand: 1, ...r });
    if (pt.under > 0) trees.push({ plant, perHa: pt.under * ts[i] * scale, stand: 2, canopy: b(0.5, 1), size: b(0.38, 0.62), ...r });
    if (pt.copse) trees.push({ plant, perHa: pt.copse.perHa * ts[i] * scale, stand: 3, clump: { every: pt.copse.every, share: pt.copse.share, r: pt.copse.r }, canopy: b(0, 0.1), size: b(0.8, 1.25), ...r });
    if (pt.apart) trees.push({ plant, perHa: pt.apart.perHa * ts[i] * scale, spaced: pt.apart.spacing, canopy: b(0, 0.1), size: b(0.85, 1.3), ...r });
  });
  // its shrubs: the mantle along the wood's edge, a few under the wood, thickets out in the open — each thicket and each
  // stretch of mantle of one kind —, or evenly apart where the ground is dry
  const sp = plantsOf(e.shrubs, warm, null, e.group === 'T6').filter((plant) => plant !== 'reed');
  const ss = shares(sp.length);
  // (on the brush's grid of 4 m, flora.ts LAYER_BRUSH: shrubs touching. What a shrub's form is drawn as may be a tree of
  // the catalogue — an ocotillo, a frailejón: those stand with the trees, on their grid, in the same thickets)
  sp.forEach((plant, i) => {
    const tall = PLANTS[plantIndex(plant)]?.layer === 'tree';
    const to = tall ? trees : brush;
    const k = tall ? 0.3 : 1;
    if (pt.mantle > 0) to.push({ plant, perHa: pt.mantle * ss[i] * scale * k, stand: tall ? 5 : 1, canopy: b(0.03, 0.26), ...r });
    if (pt.understory > 0 && !tall) to.push({ plant, perHa: pt.understory * ss[i] * scale, stand: 2, canopy: b(0.42, 1), ...r });
    if (pt.thicket) to.push({ plant, perHa: pt.thicket.perHa * ss[i] * scale * k, stand: tall ? 6 : 3, clump: { every: pt.thicket.every, share: pt.thicket.share, r: pt.thicket.r }, canopy: b(0, 0.08), ...r });
    if (pt.shrubsApart) to.push({ plant, perHa: pt.shrubsApart.perHa * ss[i] * scale * k, spaced: tall ? Math.max(24, pt.shrubsApart.spacing * 2) : pt.shrubsApart.spacing, ...r });
  });
  // (the crops of fields and terraces: their own rows or benches)
  for (const f of e.herbs) {
    if (f === 'crop_rice') shrubs.push({ plant: 'rice_stand', perHa: 220, moisture: b(0.4, 1), slope: b(0, 0.35), ...r });
    if (f === 'crop_tea') shrubs.push({ plant: 'tea_bush', perHa: 160, slope: b(0, 0.6), ...r });
    if (f === 'crop_vine') shrubs.push({ plant: 'grape_vine', perHa: 120, slope: b(0, 0.4), ...r });
  }
  for (const f of e.flowers ?? []) if (f === 'crop_sunflower') shrubs.push({ plant: 'sunflower', perHa: 140, slope: b(0, 0.25), ...r });
  return { trees, shrubs, brush };
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
  const high = upper && upper.code !== e.code ? rulesOf(upper, warm, b(R * 0.3, 1e5), 1) : { trees: [], shrubs: [], brush: [] };
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
  // (G3: a great tree alone, one in a few hectares of open country, where the road passes it)
  if (e.struct === 'grassland' && st0(e) && !salt0(m)) trees.push({ plant: warm ? 'acacia' : 'oak', perHa: 0.2, spaced: 200, road: b(26, 420), canopy: b(0, 0.1), size: b(1.25, 1.5) });
  // (world version 5) an avenue, a tunnel of trees: the country's own tree in close rows along both sides, its crowns
  // meeting over the road (core/earth/roads.ts RoadType.avenue)
  const avenue = road?.avenue ?? 0;
  if (avenue > 0 && first && !salt0(m)) trees.push({ plant: first.plant, perHa: 640 * avenue, road: b(7.7, 10.6), size: b(1.15, 1.45) });
  const shrubs = [...low.shrubs, ...high.shrubs];
  // the waters' own: willows and poplars by fresh water where the card stands no trees of the bank, reeds, mangroves by a tropical sea
  if (m.water !== 'none' && m.water !== 'salt' && e.struct !== 'ice') {
    // (G3: the banks' trees in groups along the water with open bank between, the reeds in beds)
    if (warm && (m.water === 'coast' || m.water === 'wetland')) trees.push({ plant: 'mangrove', perHa: 110, water: b(0, 14), waterKinds: SEA | FRESH, clump: { every: 70, share: 0.7, r: [14, 30] } });
    if (!warm || m.water !== 'coast') trees.push({ plant: warm ? 'river_fig' : 'willow', perHa: 90, water: b(0, 16), waterKinds: FRESH, clump: { every: 64, share: 0.55, r: [10, 22] } });
    if (m.tSea > 15 && (m.water === 'oasis' || (w < 0.3 && m.water === 'river'))) trees.push({ plant: 'fan_palm', perHa: 120, water: b(0, 30), waterKinds: FRESH, clump: { every: 56, share: 0.6, r: [9, 20] } });
    shrubs.push({ plant: 'reed', perHa: 520, water: b(0, 5), waterKinds: FRESH, clump: { every: 30, share: 0.75, r: [8, 16] } });
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
      clear: avenue > 0 ? 9 : karstFloor(sc) > 0 ? 22 : 12,
      edge: avenue > 0 ? 10 : e.struct === 'closed_forest' ? 18 : 40,
      treeline,
      thirsty: Math.min(0.8, Math.max(0.15, 0.85 - w)),
      moist: Math.min(0.9, Math.max(0.05, 0.75 * w + (m.water === 'wetland' ? 0.25 : 0))),
      // (V5: a wet karst's trees and shrubs cling to its towers and cones — they were bare green paint; a wet gorge's walls
      // are hung with them)
      cling: clingOf(sc, w),
      // (a karst's towers stand out of open meadow and fields, wooded themselves: Guilin's and Yangshuo's plain)
      floor: karstFloor(sc) || undefined,
    },
    trees,
    shrubs,
    brush: [...low.brush, ...high.brush],
    ground: [
      ...(e.struct === 'closed_forest' || e.struct === 'open_forest' ? [{ plant: 'log', perHa: 8, canopy: b(0.5, 1) }] : []),
      // (G3: its stones are the ground field's, laid where its rock comes through — none thrown about here; its flower clumps in drifts)
      ...(fl.length && grass > 0.3 ? [{ plant: 'flower_clump', perHa: 260, canopy: b(0, 0.3), clump: { every: 58, share: 0.4, r: [7, 18] as const } }] : []),
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
