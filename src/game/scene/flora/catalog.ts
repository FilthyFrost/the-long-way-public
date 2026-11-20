/**
 * The toolkit's samples (docs/V3/nodes/P2-flora.md): every plant the toolkit grows, with what it is drawn in
 * (its colours, its bark, whether it keeps its leaves and bears flowers), how big it stands and the budget it is
 * held to (docs/V3/perf-budget.json `each`, mirrored in FLORA_BUDGET: harness/sim/p2_flora.test.ts keeps the
 * two the same).
 *
 * To add a kind: plan it (trees.ts, ground.ts), then add a row here. Its variants are its seeds.
 */
import { planFlower, planShrub, planTuft, type FlowerKind, type ShrubKind, type TuftKind } from './ground';
import { draw, type Drawn, type Level, type Plan } from './kit';
import { planAcacia, planBamboo, planBaobab, planBirch, planCherry, planCypress, planDragon, planOak, planPalm, planPine, planSaguaro, planSpruce, planStonePine } from './trees';
import { planCedar, planEucalyptus, planJuniper, planMangrove, planOlive, planTreeFern, planWillow } from './trees2';
import { planJoshua, planRedwood, planRimu } from './trees3';
import { planFern } from './fern';

/** triangles of one plant at its levels (near, middle); far off it is a two-triangle picture */
export const FLORA_BUDGET = {
  broadleaf: [2500, 600],
  conifer: [1800, 500],
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
  tree('spruce', '云杉（尖塔针叶）', 'conifer', (s) => planSpruce(s), { leaf: 0x2d5c46, second: 0x6d4b3b, evergreen: true, sway: 0.6 }),
  tree('oak', '橡树（圆冠阔叶）', 'broadleaf', (s) => planOak(s), { leaf: 0x46742c }),
  tree('pine', '黄松（高干松）', 'conifer', (s) => planPine(s), { leaf: 0x4b6a2f, second: 0xa4643a, evergreen: true, pale: true, sway: 0.5 }),
  tree('stone_pine', '伞松（高干松的伞形）', 'conifer', (s) => planStonePine(s), { leaf: 0x3f5f2c, second: 0x8a5a3c, evergreen: true, pale: true, sway: 0.5 }),
  tree('birch', '白桦（白干细叶）', 'broadleaf', (s) => planBirch(s), { leaf: 0x7fa03a, second: 0xe9e4d8, pale: true, sway: 1.1 }),
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
  // (the forest floor's: docs/V3/nodes/P2-B-kit-ground.md)
  { id: 'fern', name: '蕨（林下）', family: 'shrub', budget: 'shrub', plan: (seed) => planFern(seed), look: { leaf: 0x4f7a3a, second: 0x4e4436, evergreen: true, pale: false, bears: false, sway: 0.6 } },
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
