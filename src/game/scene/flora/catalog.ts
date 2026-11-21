/**
 * The toolkit's samples (docs/V3/nodes/P2-flora.md): every plant the toolkit grows, with what it is drawn in
 * (its colours, its bark, whether it keeps its leaves and bears flowers), how big it stands and the budget it is
 * held to (docs/V3/perf-budget.json `each`, mirrored in FLORA_BUDGET: harness/sim/p2_flora.test.ts keeps the
 * two the same).
 *
 * To add a kind: plan it (trees.ts, ground.ts), then add a row here. Its variants are its seeds.
 */
import { planBigleaf, planFlower, planShrub, planTuft, type FlowerKind, type ShrubKind, type TuftKind } from './ground';
import { draw, type Drawn, type Level, type Plan } from './kit';
import { planAcacia, planBamboo, planBaobab, planBirch, planCherry, planCypress, planDragon, planOak, planPalm, planPine, planSaguaro, planSpruce, planStonePine } from './trees';
import { planCedar, planEucalyptus, planJuniper, planMangrove, planOlive, planTreeFern, planWillow } from './trees2';
import { planJoshua, planRedwood, planRimu } from './trees3';
import { planAraucaria, planEmergent, planFig, planFrailejon, planOcotillo } from './trees4';
import { planFern } from './fern';
import { planBroadleaf, type BroadleafShape } from './broadleaf';
import { T_ACACIA, T_BIRCH, T_OAK, T_ROUND } from './atlas';

/**
 * The round broadleaf's shapes (broadleaf.ts; docs/V3/art/plants-standard.md §3), in Painted Valley's numbers: an
 * oak between its grove trees and its great tree, a maple lower and wider, a birch slim with a leader up its middle.
 */
export const OAK_SHAPE: BroadleafShape = { trunk: 3.0, girth: 0.55, crown: 6.4, rise: 9.6, limbs: 5, clump: 2.1, fill: 12, cards: 44, spray: 1.15, tile: T_OAK };
export const MAPLE_SHAPE: BroadleafShape = { trunk: 2.6, girth: 0.5, crown: 6.8, rise: 8.4, limbs: 5, clump: 2.0, fill: 13, cards: 44, spray: 1.1, tile: T_OAK };
export const BIRCH_SHAPE: BroadleafShape = { trunk: 3.4, girth: 0.24, crown: 3.4, rise: 11, limbs: 6, clump: 1.35, fill: 10, cards: 34, spray: 0.8, leader: 0.8, elevation: 1.15, boughs: [1, 2], squash: 0.9, furrow: 0, tile: T_BIRCH };
/**
 * (docs/V3/nodes/R4-trees.md) Each broadleaf of the world its own shape where all were grown as the oak: a linden's
 * tall dense dome, a beech's smooth grey bole under a broad low dome, an ash's open airy crown high on a tall bole, a
 * chestnut's massive spreading dome on a furrowed bole, a camphor's wide evergreen dome, the savanna marula's broad
 * crown on a short trunk, a southern beech's level tiers, the desert poplar's ragged crown.
 */
export const LINDEN_SHAPE: BroadleafShape = { trunk: 3.4, girth: 0.46, crown: 5.0, rise: 11.5, limbs: 6, clump: 1.9, fill: 15, cards: 46, spray: 1.05, elevation: 1.15, squash: 0.98, furrow: 0.5, tile: T_OAK };
export const BEECH_SHAPE: BroadleafShape = { trunk: 4.4, girth: 0.5, crown: 7.0, rise: 9.0, limbs: 6, clump: 2.2, fill: 14, cards: 44, spray: 1.1, elevation: 0.82, squash: 0.74, furrow: 0, tile: T_OAK };
export const ASH_SHAPE: BroadleafShape = { trunk: 5.2, girth: 0.42, crown: 5.8, rise: 9.5, limbs: 6, clump: 1.95, fill: 13, cards: 44, spray: 1.2, elevation: 1.15, squash: 0.9, furrow: 0.7, tile: T_BIRCH };
export const CHESTNUT_SHAPE: BroadleafShape = { trunk: 2.6, girth: 0.8, crown: 8.2, rise: 8.0, limbs: 6, clump: 2.4, fill: 14, cards: 46, spray: 1.15, elevation: 0.85, squash: 0.76, furrow: 1, tile: T_OAK };
export const CAMPHOR_SHAPE: BroadleafShape = { trunk: 2.4, girth: 0.66, crown: 8.8, rise: 8.4, limbs: 7, clump: 2.5, fill: 18, cards: 46, spray: 1.0, elevation: 0.8, squash: 0.7, furrow: 0.6, tile: T_ROUND };
export const MARULA_SHAPE: BroadleafShape = { trunk: 2.6, girth: 0.5, crown: 7.4, rise: 5.6, limbs: 5, clump: 2.0, fill: 9, cards: 40, spray: 1.1, elevation: 0.7, squash: 0.6, furrow: 0.4, tile: T_ACACIA };
export const NOTHO_SHAPE: BroadleafShape = { trunk: 4.0, girth: 0.5, crown: 6.4, rise: 8.4, limbs: 6, clump: 2.05, fill: 15, cards: 44, spray: 0.95, elevation: 0.66, squash: 0.7, furrow: 0.3, tile: T_ROUND };
export const TUGAI_SHAPE: BroadleafShape = { trunk: 3.0, girth: 0.62, crown: 5.6, rise: 6.2, limbs: 5, clump: 1.75, fill: 10, cards: 38, spray: 1.15, elevation: 1.2, squash: 0.9, furrow: 1, tile: T_BIRCH };

/** triangles of one plant at its levels (near, middle); far off it is a two-triangle picture */
export const FLORA_BUDGET = {
  // (raised for the plant pipeline, docs/V3/art/plants-standard.md §6: Painted Valley's trees near are some 5,600)
  broadleaf: [6000, 1200],
  conifer: [4000, 900],
  // (the shrubs as they were until theirs are done: the ground's plants' 1.2 M of grass and flowers counts them)
  shrub: [800, 200],
  grass_tuft: [12, 12],
  flower: [40, 40],
} as const;
export type BudgetKind = keyof typeof FLORA_BUDGET;

export interface FloraLook {
  /** its foliage's colour (0xRRGGBB; a cactus's skin, a blossom's) and its bark's, or its flowers' */
  leaf: number;
  second: number;
  /** keeps its leaves through the snow (a conifer, a palm, a cactus) */
  evergreen: boolean;
  /** its bark is its second colour (a birch's, a baobab's, a ponderosa's plates) */
  pale: boolean;
  /** it bears flowers in its second colour */
  bears: boolean;
  /** its tones kept light (a blossom cloud, grass, flowers): material.ts */
  bright?: boolean;
  /** how much it gives to the wind (1 a broad-leaved tree) */
  sway: number;
}

export interface FloraKind {
  id: string;
  /** its name (for the player) and what it stands for among the fifty roads */
  name: string;
  family: 'tree' | 'tuft' | 'flower' | 'shrub';
  budget: BudgetKind;
  plan: (seed: number) => Plan;
  look: FloraLook;
}

const tree = (id: string, name: string, budget: BudgetKind, plan: (seed: number) => Plan, look: Partial<FloraLook> & { leaf: number }): FloraKind => ({
  id,
  name,
  family: 'tree',
  budget,
  plan,
  look: { second: 0x5e554b, evergreen: false, pale: false, bears: false, sway: 0.9, ...look },
});

const tuft = (kind: TuftKind, name: string, leaf: number): FloraKind => ({ id: `tuft_${kind}`, name, family: 'tuft', budget: 'grass_tuft', plan: (seed) => planTuft(seed, kind), look: { leaf, second: 0, evergreen: false, pale: false, bears: false, bright: true, sway: 0.3 } });
const flower = (kind: FlowerKind, name: string, petals: number): FloraKind => ({ id: `flower_${kind}`, name, family: 'flower', budget: 'flower', plan: (seed) => planFlower(seed, kind), look: { leaf: 0x6f9a40, second: petals, evergreen: false, pale: false, bears: true, bright: true, sway: 0.4 } });
const shrub = (kind: ShrubKind, name: string, leaf: number, second = 0x4e4436, bears = false): FloraKind => ({ id: `shrub_${kind}`, name, family: 'shrub', budget: 'shrub', plan: (seed) => planShrub(seed, kind), look: { leaf, second, evergreen: kind !== 'round', pale: false, bears, bright: kind === 'lavender', sway: 0.5 } });

export const FLORA: readonly FloraKind[] = [
  tree('spruce', '云杉（尖塔针叶）', 'conifer', (s) => planSpruce(s), { leaf: 0x5c9474, second: 0x6d4b3b, evergreen: true, sway: 0.6 }),
  tree('oak', '橡树（圆冠阔叶）', 'broadleaf', (s) => planBroadleaf(s, 14, OAK_SHAPE), { leaf: 0x8cbf62 }),
  tree('pine', '黄松（高干松）', 'conifer', (s) => planPine(s), { leaf: 0x4b6a2f, second: 0xa4643a, evergreen: true, pale: true, sway: 0.5 }),
  tree('stone_pine', '伞松（高干松的伞形）', 'conifer', (s) => planStonePine(s), { leaf: 0x3f5f2c, second: 0x8a5a3c, evergreen: true, pale: true, sway: 0.5 }),
  tree('birch', '白桦（白干细叶）', 'broadleaf', (s) => planBroadleaf(s, 16, BIRCH_SHAPE), { leaf: 0xa8cc5e, second: 0xe9e4d8, pale: true, sway: 1.1 }),
  tree('poplar', '钻天杨（白干细叶的柱形）', 'broadleaf', (s) => planBirch(s, 20, true), { leaf: 0x5f8a33, second: 0xb8b0a0, pale: true, sway: 1 }),
  tree('cherry', '樱花（圆冠阔叶的花冠）', 'broadleaf', (s) => planCherry(s), { leaf: 0xf7d6df, second: 0x4a3a36, bright: true, sway: 0.8 }),
  tree('cypress', '意大利柏（柱形）', 'conifer', (s) => planCypress(s), { leaf: 0x2c4a2a, second: 0x5a4a3c, evergreen: true, sway: 0.4 }),
  tree('palm', '椰子（棕榈）', 'broadleaf', (s) => planPalm(s), { leaf: 0x5f8f3a, second: 0x8c7a62, evergreen: true, pale: true, sway: 0.8 }),
  tree('acacia', '金合欢（平顶伞形）', 'broadleaf', (s) => planAcacia(s), { leaf: 0x667f34, second: 0x4f4034, sway: 0.6 }),
  tree('dragon', '龙血树（平顶伞形的蘑菇冠）', 'broadleaf', (s) => planDragon(s), { leaf: 0x3d5a34, second: 0xa29a86, evergreen: true, pale: true, sway: 0.3 }),
  tree('bamboo', '毛竹（竹）', 'broadleaf', (s) => planBamboo(s), { leaf: 0x6e9a3c, second: 0x7d9a52, evergreen: true, pale: true, sway: 1.3 }),
  tree('saguaro', '巨柱仙人掌', 'conifer', (s) => planSaguaro(s), { leaf: 0x5d7d4f, second: 0x5d7d4f, evergreen: true, sway: 0 }),
  tree('baobab', '猴面包树（瓶干）', 'broadleaf', (s) => planBaobab(s), { leaf: 0x6c8a3a, second: 0xb59a86, pale: true, sway: 0.3 }),
  // (the second round: docs/V3/nodes/P3-kit-more.md)
  tree('eucalyptus', '桉树', 'broadleaf', (s) => planEucalyptus(s), { leaf: 0x7a9658, second: 0xe2dccb, evergreen: true, pale: true, sway: 1.1 }),
  tree('willow', '垂柳', 'broadleaf', (s) => planWillow(s), { leaf: 0x8fae4a, second: 0x5e554b, sway: 1.3 }),
  tree('olive', '橄榄', 'broadleaf', (s) => planOlive(s), { leaf: 0x8a9a6a, second: 0x6b5d4e, evergreen: true, sway: 0.6 }),
  tree('mangrove', '红树', 'broadleaf', (s) => planMangrove(s), { leaf: 0x4e7a34, second: 0x6b5a48, evergreen: true, sway: 0.6 }),
  tree('tree_fern', '树蕨', 'broadleaf', (s) => planTreeFern(s), { leaf: 0x5d8f3a, second: 0x5a4636, evergreen: true, sway: 0.9 }),
  tree('juniper', '刺柏', 'conifer', (s) => planJuniper(s), { leaf: 0x3e5a3a, second: 0x7a5a44, evergreen: true, sway: 0.4 }),
  tree('cedar', '雪松', 'conifer', (s) => planCedar(s), { leaf: 0x355a48, second: 0x6a5040, evergreen: true, sway: 0.5 }),
  // (the third round: docs/V3/nodes/P2-A-kit-default.md)
  tree('redwood', '红杉', 'conifer', (s) => planRedwood(s), { leaf: 0x2f5a3c, second: 0x8a4a32, evergreen: true, sway: 0.3 }),
  tree('rimu', '陆均松（垂枝针叶）', 'conifer', (s) => planRimu(s), { leaf: 0x55704a, second: 0x6a5040, evergreen: true, sway: 0.9 }),
  tree('joshua', '约书亚树', 'broadleaf', (s) => planJoshua(s), { leaf: 0x5f7a3a, second: 0x6e604c, evergreen: true, pale: true, sway: 0.1 }),
  tuft('meadow', '草甸草丛', 0x6f9a3c),
  tuft('tussock', '金色丛草', 0xd2bb7a),
  tuft('needle', '针茅', 0xd2bd78),
  tuft('spinifex', '刺鬣草团', 0x8fa58c),
  // (docs/V3/nodes/R5-ground.md)
  tuft('tall', '象草（稀树草原一人高的草）', 0xb8a85c),
  flower('poppy', '虞美人', 0xd8392b),
  flower('goldpoppy', '金罂粟', 0xf0a020),
  flower('tulip', '郁金香', 0xe0443c),
  flower('daisy', '雏菊', 0xf4f0e6),
  flower('lupin', '鲁冰花', 0x8a5cc8),
  shrub('round', '圆团灌木', 0x4c7330),
  shrub('heather', '石楠', 0x86687f),
  shrub('sage', '鼠尾草灌丛', 0x8e9a7d),
  shrub('lavender', '薰衣草', 0x7d8f74, 0x7b5bc4, true),
  shrub('protea', '帝王花', 0x5d7a4a, 0xe08aa0, true),
  // (docs/V3/nodes/R5-ground.md)
  shrub('cushion', '垫状植物（苔原和高山）', 0x7a9050),
  shrub('saltbush', '盐生灌丛', 0x9aa088),
  { id: 'herb_bigleaf', name: '林下大叶草（芭蕉、海里康）', family: 'shrub', budget: 'shrub', plan: (seed) => planBigleaf(seed), look: { leaf: 0x4f8a3e, second: 0x4e4436, evergreen: true, pale: false, bears: false, sway: 0.7 } },
  // (the forest floor's: docs/V3/nodes/P2-B-kit-ground.md)
  { id: 'fern', name: '蕨（林下）', family: 'shrub', budget: 'shrub', plan: (seed) => planFern(seed), look: { leaf: 0x4f7a3a, second: 0x4e4436, evergreen: true, pale: false, bears: false, sway: 0.6 } },
  // (the plant pipeline's first samples: docs/V3/art/plants-standard.md)
  tree('maple', '枫树（圆冠阔叶的秋色）', 'broadleaf', (s) => planBroadleaf(s, 13, MAPLE_SHAPE), { leaf: 0xec8a3c }),
  // (the fourth round: every broadleaf its own shape, and the emergent Earth's forms, docs/V3/nodes/R4-trees.md)
  tree('linden', '椴树（高圆冠）', 'broadleaf', (s) => planBroadleaf(s, 18, LINDEN_SHAPE), { leaf: 0x7fae58 }),
  tree('beech', '山毛榉（灰白光干、宽低圆冠）', 'broadleaf', (s) => planBroadleaf(s, 22, BEECH_SHAPE), { leaf: 0x77a45a, second: 0x9a978c, pale: true }),
  tree('ash', '白蜡树（高干疏冠）', 'broadleaf', (s) => planBroadleaf(s, 22, ASH_SHAPE), { leaf: 0x8cb060, sway: 1.1 }),
  tree('chestnut', '欧洲栗（粗干宽冠）', 'broadleaf', (s) => planBroadleaf(s, 18, CHESTNUT_SHAPE), { leaf: 0x9faf63 }),
  tree('camphor', '香樟（常绿宽圆冠）', 'broadleaf', (s) => planBroadleaf(s, 16, CAMPHOR_SHAPE), { leaf: 0x63975f, evergreen: true }),
  tree('marula', '马鲁拉（稀树草原的宽冠）', 'broadleaf', (s) => planBroadleaf(s, 11, MARULA_SHAPE), { leaf: 0x8da261, second: 0x938b7c, pale: true, sway: 0.7 }),
  tree('nothofagus', '南青冈（层层平展）', 'broadleaf', (s) => planBroadleaf(s, 18, NOTHO_SHAPE), { leaf: 0x668c68, evergreen: true, sway: 0.8 }),
  tree('tugai', '胡杨（虬曲乱冠）', 'broadleaf', (s) => planBroadleaf(s, 11, TUGAI_SHAPE), { leaf: 0x94ab72, sway: 0.8 }),
  tree('emergent', '热带雨林的露生巨树（板根、平顶冠）', 'broadleaf', (s) => planEmergent(s), { leaf: 0x3f7a42, second: 0xb4a894, evergreen: true, pale: true, sway: 0.4 }),
  tree('fig', '榕树（气生根、低而极宽的冠）', 'broadleaf', (s) => planFig(s), { leaf: 0x4f8a48, second: 0x9a8f7c, evergreen: true, pale: true, sway: 0.5 }),
  tree('araucaria', '南洋杉（烛台状的层枝）', 'conifer', (s) => planAraucaria(s), { leaf: 0x3e5c3c, second: 0x6e5c4c, evergreen: true, sway: 0.3 }),
  tree('ocotillo', '蜡烛木（一丛长鞭）', 'conifer', (s) => planOcotillo(s), { leaf: 0x7f9a52, second: 0x7a6a58, evergreen: true, sway: 0.5 }),
  { id: 'frailejon', name: '毛叶菊（帕拉莫的巨型莲座）', family: 'shrub', budget: 'shrub', plan: (seed) => planFrailejon(seed), look: { leaf: 0xa8b29a, second: 0x6f6250, evergreen: true, pale: true, bears: false, sway: 0.2 } },
];

export function floraKind(id: string): FloraKind {
  const k = FLORA.find((f) => f.id === id);
  if (!k) throw new Error(`flora: no kind ${id}`);
  return k;
}

/** a kind grown from a seed at a level, within its budget */
export function growFlora(kind: FloraKind, seed: number, level: Level): Drawn {
  return draw(kind.plan(seed), level, FLORA_BUDGET[kind.budget][level], seed);
}
