/**
 * The recipes (node C1, docs/V3/nodes/C1-cooking.md, docs/V3/CATALOG.md "菜谱"): one row each. A recipe says
 * how it is cooked, what must be in the pot (an item, a tag, or one of some classes of ingredient), what else
 * may be, the taste it wants, and the buff it leaves. A pot that satisfies a recipe IS that dish, so recipes
 * are found by cooking as well as from pages.
 *
 * This is the first batch: what can be cooked from forage and from the packed food the game already has, and a
 * few of fish and game written against tags (they can be cooked once fishing and hunting bring the things).
 * To add a recipe, add a row at the end of its class; the tests check that its ingredients exist, that it is
 * not hidden for ever behind a more particular recipe, and that its numbers are within bounds.
 */
import type { BuffId, DishClass, IngClass, Method, Recipe, Slot, Taste } from './types';

const ALL: Recipe[] = [];

const one = (item: string, n = 1): Slot => ({ item, n });
const tag = (t: string, n = 1): Slot => ({ tag: t, n });
const any = (cls: IngClass | readonly IngClass[], n = 1): Slot => ({ cls: typeof cls === 'string' ? [cls] : cls, n });
const T = (salt = 0, sweet = 0, sour = 0, hot = 0, umami = 0): Taste => [salt, sweet, sour, hot, umami];

function R(id: string, cls: DishClass, zh: string, en: string, method: Method, need: readonly Slot[], buff: BuffId, buffS: number, blurb: string, o: { also?: readonly IngClass[]; taste?: Taste; region?: string } = {}): void {
  ALL.push({ id, cls, name: { zh, en }, method, need, buff, buffS, blurb, ...(o.also ? { also: o.also } : {}), ...(o.taste ? { taste: o.taste } : {}), ...(o.region ? { region: o.region } : {}) });
}

const VEG: readonly IngClass[] = ['veg', 'mushroom', 'root'];

// ------------------------------------------------------------------ soups
R('mushroom_soup', 'soup', '野菌汤', 'Wild mushroom soup', 'soup', [any('mushroom', 2)], 'keen', 480, '几样菌子一锅煮，汤是奶白的。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'forest' });
R('matsutake_broth', 'soup', '松茸清汤', 'Matsutake broth', 'soup', [one('matsutake')], 'keen', 720, '什么都别多放，松茸自己会说话。', { also: ['veg'], taste: T(1, 0, 0, 0, 3) });
R('nettle_soup', 'soup', '荨麻汤', 'Nettle soup', 'soup', [one('nettle', 2), any('root')], 'hearty', 480, '煮过的荨麻不蜇人，绿得发亮。', { also: VEG, taste: T(2, 0, 0, 0, 2) });
R('tomato_soup', 'soup', '番茄汤', 'Tomato soup', 'soup', [one('wild_tomato', 2)], 'hydrated', 420, '酸酸的，热着喝。', { also: ['veg', 'egg'], taste: T(2, 1, 2, 0, 2), region: 'terraces' });
R('kelp_soup', 'soup', '海带汤', 'Kelp soup', 'soup', [one('kelp'), any(['shellfish', 'fish'])], 'hydrated', 480, '海的味道都在汤里。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'sea_cliffs' });
R('clam_chowder', 'soup', '蛤蜊浓汤', 'Clam chowder', 'soup', [one('clam', 2), one('potato')], 'sturdy', 540, '土豆煮化了，蛤蜊一个个张开口。', { also: VEG, taste: T(2, 0, 0, 0, 3) });
R('fish_soup', 'soup', '鱼汤', 'Fish soup', 'soup', [tag('fish'), any('herb')], 'steady', 540, '煎过再煮，汤才白。', { also: VEG, taste: T(2, 0, 0, 0, 3) });
R('bone_broth', 'soup', '骨头汤', 'Bone broth', 'soup', [tag('meat'), any('root')], 'sturdy', 600, '小火慢慢熬出来的。', { also: VEG, taste: T(2, 0, 0, 0, 3) });
// ------------------------------------------------------------------ stews
R('mushroom_potato_stew', 'stew', '蘑菇炖土豆', 'Mushroom and potato stew', 'stew', [any('mushroom', 2), one('potato')], 'hearty', 600, '顶饿的一锅，越炖越香。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'plains' });
R('chestnut_stew', 'stew', '栗子炖菜', 'Chestnut stew', 'stew', [one('chestnut', 2), any(VEG)], 'warm', 600, '栗子面面的，吸饱了汤。', { also: [...VEG, 'meat', 'poultry'], taste: T(2, 1, 0, 0, 2), region: 'maple' });
R('lotus_stew', 'stew', '莲藕炖汤', 'Lotus root stew', 'stew', [one('lotus_root', 2)], 'hydrated', 600, '藕炖得粉粉的，汤是淡淡的甜。', { also: [...VEG, 'meat', 'nut'], taste: T(1, 1, 0, 0, 2), region: 'lakes' });
R('yam_stew', 'stew', '山药炖菌', 'Yam and mushroom stew', 'stew', [one('wild_yam'), any('mushroom')], 'vigor', 600, '黏糊糊的一锅，养人。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'karst_peaks' });
R('game_mushroom_stew', 'stew', '野味炖蘑菇', 'Game and mushroom stew', 'stew', [tag('meat'), any('mushroom', 2)], 'sturdy', 720, '肉要炖到筷子一戳就散。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'forest' });
// ------------------------------------------------------------------ stir-fries
R('scallion_mushrooms', 'stirfry', '野葱炒蘑菇', 'Mushrooms with wild scallion', 'stirfry', [any('mushroom', 2), one('wild_scallion')], 'keen', 420, '大火，几铲子就出锅。', { also: ['veg'], taste: T(2, 0, 0, 1, 3) });
R('fiddlehead_fry', 'stirfry', '清炒蕨菜', 'Stir-fried fiddleheads', 'stirfry', [one('fiddlehead', 2)], 'vigor', 420, '脆，带一点山野的苦。', { also: ['veg', 'meat'], taste: T(2, 0, 0, 1, 2), region: 'forest' });
R('bamboo_shoot_fry', 'stirfry', '油焖笋', 'Braised bamboo shoots', 'stirfry', [one('bamboo_shoot', 2)], 'hearty', 480, '笋要先焯，去掉涩味。', { also: ['veg', 'meat'], taste: T(2, 1, 0, 0, 3), region: 'bamboo_sea' });
R('spicy_crab', 'stirfry', '辣炒螃蟹', 'Spicy crab', 'stirfry', [one('crab'), one('chili')], 'warm', 600, '辣得吸手指头。', { also: ['veg'], taste: T(2, 0, 0, 3, 3), region: 'sea_cliffs' });
R('perilla_tomato', 'stirfry', '紫苏番茄', 'Tomato with perilla', 'stirfry', [one('wild_tomato', 2), one('perilla')], 'cool', 420, '紫苏一下锅，味道就变了。', { also: ['veg', 'egg'], taste: T(2, 1, 2, 0, 2) });
R('mapo_shoots', 'stirfry', '麻辣笋丁', 'Numbing shoots', 'stirfry', [one('bamboo_shoot'), one('sichuan_pepper'), one('chili')], 'warm', 540, '又麻又辣，下饭。', { also: ['veg', 'meat'], taste: T(2, 0, 0, 3, 2), region: 'karst_peaks' });
// ------------------------------------------------------------------ roasts
R('roast_matsutake', 'roast', '烤松茸', 'Roast matsutake', 'roast', [one('matsutake')], 'keen', 720, '撕成条，撒一点盐。', { taste: T(1, 0, 0, 0, 3) });
R('roast_potato', 'camp', '烤土豆', 'Roast potatoes', 'roast', [one('potato', 2)], 'hearty', 420, '埋在炭里，皮焦了里面是面的。', { taste: T(2, 0, 0, 0, 1), region: 'plains' });
R('roast_chestnuts', 'camp', '烤栗子', 'Roast chestnuts', 'roast', [one('chestnut', 2)], 'warm', 420, '划一刀再烤，不然会炸。', { taste: T(0, 2, 0, 0, 1), region: 'maple' });
R('mushroom_skewers', 'camp', '烤蘑菇串', 'Mushroom skewers', 'roast', [any('mushroom', 3)], 'keen', 420, '一串三个，刷点油。', { also: ['veg'], taste: T(2, 0, 0, 1, 3) });
R('roast_agave', 'roast', '烤龙舌兰芯', 'Roast agave heart', 'roast', [one('agave_heart')], 'vigor', 540, '烤上大半天，甜得像蜜。', { taste: T(0, 3, 0, 0, 0), region: 'desert' });
R('salt_fish', 'roast', '盐烤鱼', 'Salt-grilled fish', 'roast', [tag('fish'), one('salt')], 'steady', 600, '鱼皮烤得起泡，盐粒还在。', { taste: T(3, 0, 0, 0, 2) });
R('game_skewers', 'camp', '烤肉串', 'Meat skewers', 'roast', [tag('meat')], 'sturdy', 480, '肥瘦相间，油滴到火里滋滋响。', { also: ['veg', 'mushroom'], taste: T(2, 0, 0, 2, 3) });
// ------------------------------------------------------------------ pan
R('greens_pancake', 'fry', '野菜煎饼', 'Wild greens pancake', 'fry', [any('veg', 2), any('grain')], 'hearty', 480, '面糊里拌上切碎的野菜。', { also: ['egg', 'veg'], taste: T(2, 0, 0, 0, 2) });
R('fried_lotus', 'fry', '香煎藕片', 'Pan-fried lotus root', 'fry', [one('lotus_root', 2)], 'vigor', 420, '两面金黄，咬着脆。', { taste: T(2, 1, 0, 0, 1) });
R('fried_dumplings', 'fry', '煎饺', 'Pan-fried dumplings', 'fry', [one('food_dumplings')], 'hearty', 420, '冻饺子最好的归宿。', { also: ['veg'], taste: T(2, 0, 1, 0, 2) });
// ------------------------------------------------------------------ steamed
R('steamed_clams', 'steam', '蒸蛤蜊', 'Steamed clams', 'steam', [one('clam', 3)], 'lucky', 480, '开口就好，多一分就老。', { taste: T(1, 0, 0, 0, 3), region: 'sea_cliffs' });
R('steamed_mussels', 'steam', '蒸贻贝', 'Steamed mussels', 'steam', [one('mussel', 3)], 'lucky', 480, '一锅黑壳，肉是橙色的。', { taste: T(1, 0, 0, 0, 3) });
R('steamed_yam', 'steam', '蒸山药', 'Steamed yam', 'steam', [one('wild_yam', 2)], 'vigor', 420, '蘸点蜜吃。', { also: ['sweet'], taste: T(0, 2, 0, 0, 0) });
// ------------------------------------------------------------------ rice and noodles
R('wild_rice', 'rice', '野稻饭', 'Wild rice', 'rice', [one('wild_rice', 2)], 'hearty', 600, '粒粒分明，有股坚果香。', { taste: T(1, 0, 0, 0, 1), region: 'wetland' });
R('mushroom_rice', 'rice', '菌菇焖饭', 'Mushroom rice', 'rice', [any('grain', 2), any('mushroom', 2)], 'hearty', 720, '掀开锅盖的那一下最香。', { also: ['veg'], taste: T(2, 0, 0, 0, 3), region: 'forest' });
R('chestnut_rice', 'rice', '栗子饭', 'Chestnut rice', 'rice', [any('grain', 2), one('chestnut')], 'warm', 660, '秋天的味道。', { taste: T(1, 2, 0, 0, 1), region: 'maple' });
R('bamboo_rice', 'rice', '竹笋饭', 'Bamboo shoot rice', 'rice', [any('grain', 2), one('bamboo_shoot')], 'vigor', 660, '笋丁切小，和米一起焖。', { also: ['mushroom'], taste: T(2, 0, 0, 0, 2), region: 'bamboo_sea' });
// ------------------------------------------------------------------ salads
R('purslane_salad', 'salad', '凉拌马齿苋', 'Purslane salad', 'mix', [one('purslane', 2)], 'cool', 420, '焯一下过凉水，酸溜溜的。', { also: ['veg'], taste: T(2, 0, 2, 1, 0), region: 'desert' });
R('greens_salad', 'salad', '野菜沙拉', 'Wild greens salad', 'mix', [any('veg', 3)], 'hydrated', 360, '路边摘的，洗干净就是一盘。', { also: ['fruit', 'nut', 'flower'], taste: T(1, 0, 2, 0, 0) });
R('kelp_salad', 'salad', '凉拌海带丝', 'Kelp salad', 'mix', [one('kelp', 2)], 'cool', 420, '切细丝，多放醋。', { also: ['veg'], taste: T(2, 0, 2, 1, 2), region: 'sea_cliffs' });
R('berry_bowl', 'sweet', '野果碗', 'Berry bowl', 'mix', [any('fruit', 3)], 'vigor', 360, '什么熟了放什么。', { also: ['nut', 'sweet', 'flower'], taste: T(0, 3, 1, 0, 0) });
// ------------------------------------------------------------------ baking and sweets
R('berry_pie', 'sweet', '野莓派', 'Wild berry pie', 'bake', [any('fruit', 2), any('grain')], 'vigor', 600, '莓子煮出来的汁把派皮染紫了。', { also: ['sweet', 'nut'], taste: T(0, 3, 1, 0, 0), region: 'plains' });
R('chestnut_cake', 'sweet', '栗子糕', 'Chestnut cake', 'bake', [one('chestnut', 2), any('sweet')], 'warm', 600, '压成泥，再压成糕。', { also: ['grain'], taste: T(0, 3, 0, 0, 0), region: 'maple' });
R('honey_nuts', 'sweet', '蜜烤坚果', 'Honey-roast nuts', 'bake', [any('nut', 2), one('honeycomb')], 'sturdy', 540, '揣在兜里，走一路吃一路。', { taste: T(0, 3, 0, 0, 1), region: 'flower_fields' });
R('baked_apple', 'sweet', '烤苹果', 'Baked apple', 'bake', [one('wild_apple', 2)], 'warm', 480, '芯里填上蜜和坚果。', { also: ['sweet', 'nut'], taste: T(0, 3, 1, 0, 0) });
// ------------------------------------------------------------------ drinks
R('chamomile_tea', 'drink', '洋甘菊茶', 'Chamomile tea', 'brew', [one('chamomile', 2)], 'steady', 600, '喝了心里静。', { also: ['sweet'], taste: T(0, 1, 0, 0, 0), region: 'plains' });
R('mint_water', 'drink', '薄荷水', 'Mint water', 'brew', [one('mint', 2)], 'cool', 600, '大热天的救命水。', { also: ['sweet', 'fruit'], taste: T(0, 1, 1, 0, 0) });
R('pine_tea', 'drink', '松针茶', 'Pine needle tea', 'brew', [one('pine_needle', 2)], 'warm', 540, '有股树林的清气。', { also: ['sweet'], taste: T(0, 0, 1, 0, 0), region: 'alpine' });
R('green_tea', 'drink', '清茶', 'Green tea', 'brew', [one('tea_leaf', 2)], 'keen', 720, '第一泡洗茶，第二泡才喝。', { taste: T(0, 0, 0, 0, 1), region: 'terraces' });
R('jasmine_tea', 'drink', '茉莉花茶', 'Jasmine tea', 'brew', [one('tea_leaf'), one('jasmine')], 'steady', 720, '花香压在茶香上面。', { taste: T(0, 1, 0, 0, 1), region: 'flower_fields' });
R('rose_hip_tea', 'drink', '玫瑰果茶', 'Rose hip tea', 'brew', [one('rose_hip', 2)], 'vigor', 540, '酸，加蜜正好。', { also: ['sweet'], taste: T(0, 2, 2, 0, 0) });
R('mugwort_brew', 'drink', '艾草汤', 'Mugwort brew', 'brew', [one('mugwort', 2)], 'warm', 720, '苦，但是一碗下去手脚都暖了。', { taste: T(0, 0, 0, 0, 0) });
R('ginseng_tea', 'drink', '参茶', 'Ginseng tea', 'brew', [one('ginseng')], 'vigor', 900, '切两片就够，剩下的留着。', { also: ['sweet'], taste: T(0, 1, 0, 0, 0) });
R('chrysanthemum_tea', 'drink', '菊花茶', 'Chrysanthemum tea', 'brew', [one('wild_chrysanthemum', 2)], 'cool', 600, '清火明目。', { also: ['sweet'], taste: T(0, 1, 0, 0, 0) });
// ------------------------------------------------------------------ camp food
R('tin_hash', 'camp', '罐头杂烩', 'Tin hash', 'stew', [tag('tin'), any(VEG)], 'hearty', 480, '罐头倒进锅里，有什么菜切什么菜。', { also: [...VEG, 'grain'], taste: T(2, 0, 0, 1, 3) });
R('nugget_fry', 'camp', '鸡块炒野菜', 'Nuggets with greens', 'stirfry', [one('food_nuggets'), any('veg')], 'sturdy', 420, '冻鸡块也能吃出点新鲜。', { also: ['veg', 'mushroom'], taste: T(2, 0, 0, 1, 2) });

/** every recipe, by class in the catalogue's order */
export const RECIPES: readonly Recipe[] = ALL;

const BY_ID = new Map(ALL.map((r) => [r.id, r]));

export function recipe(id: string): Recipe {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
}
