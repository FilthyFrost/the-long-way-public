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
R('wild_rice', 'rice', '米饭', 'Steamed rice', 'rice', [one('wild_rice', 2)], 'hearty', 600, '煮熟的稻米粒粒分明。', { taste: T(1, 0, 0, 0, 1), region: 'terraces' });
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

// ================================================================== the second batch: to the catalogue's 150
// (fish and game are named by item or by tag: they can be cooked once fishing and hunting bring the things;
// until then the developer's panel hands the ingredients out)

// ------------------------------------------------------------------ soups (to 14)
R('duck_soup', 'soup', '老鸭汤', 'Old duck soup', 'soup', [one('meat_duck'), any('root')], 'sturdy', 720, '汤面上一层金黄的油。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'lakes' });
R('tomato_egg_soup', 'soup', '番茄蛋汤', 'Tomato and egg soup', 'soup', [one('wild_tomato'), one('egg_wild')], 'hydrated', 480, '蛋花要最后淋。', { also: ['veg'], taste: T(2, 1, 2, 0, 2) });
R('crab_soup', 'soup', '蟹汤', 'Crab soup', 'soup', [one('crab'), any('veg')], 'lucky', 600, '壳也一起煮，鲜味都在壳里。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'sea_cliffs' });
R('lotus_bone_soup', 'soup', '莲藕骨头汤', 'Lotus root and bone soup', 'soup', [one('lotus_root'), tag('bone')], 'sturdy', 720, '藕要炖到拉丝。', { also: VEG, taste: T(2, 1, 0, 0, 3), region: 'wetland' });
R('watercress_soup', 'soup', '豆瓣菜汤', 'Watercress soup', 'soup', [one('watercress', 2)], 'cool', 420, '清清爽爽，去火。', { also: ['veg', 'egg'], taste: T(2, 0, 0, 0, 1), region: 'wetland' });
R('bamboo_fungus_soup', 'soup', '竹荪汤', 'Bamboo fungus soup', 'soup', [one('bamboo_fungus'), any(['poultry', 'meat', 'mushroom'])], 'keen', 660, '竹荪吸饱了汤，一咬一包水。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'bamboo_sea' });
// ------------------------------------------------------------------ stews (to 16)
R('venison_stew', 'stew', '鹿肉炖蘑菇', 'Venison and mushroom stew', 'stew', [one('meat_venison'), any('mushroom')], 'sturdy', 780, '鹿肉瘦，要和蘑菇一起慢慢炖。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'forest' });
R('boar_potato_stew', 'stew', '野猪肉炖土豆', 'Boar and potato stew', 'stew', [one('meat_boar'), one('potato')], 'hearty', 720, '土豆吸了油，比肉还香。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'plains' });
R('rabbit_chestnut_stew', 'stew', '兔肉炖栗子', 'Rabbit and chestnut stew', 'stew', [one('meat_rabbit'), one('chestnut')], 'warm', 720, '栗子的甜炖进了肉里。', { also: VEG, taste: T(2, 1, 0, 0, 2), region: 'maple' });
R('bear_stew', 'stew', '熊肉炖菜', 'Bear stew', 'stew', [one('meat_bear'), any('root')], 'sturdy', 900, '要炖很久很久。吃完浑身是劲。', { also: VEG, taste: T(2, 0, 0, 1, 3), region: 'alpine' });
R('fish_stew', 'stew', '炖大鱼', 'Big fish stew', 'stew', [tag('bigfish'), any('veg')], 'steady', 660, '大鱼切块，连头带尾一锅炖。', { also: VEG, taste: T(2, 0, 0, 1, 3), region: 'lakes' });
R('eel_stew', 'stew', '红烧鳗鱼', 'Braised eel', 'stew', [one('eel'), any('root')], 'vigor', 660, '鳗鱼段炖得软糯。', { also: VEG, taste: T(2, 1, 0, 0, 3) });
R('catfish_stew', 'stew', '鲶鱼炖菜', 'Catfish stew', 'stew', [one('catfish'), any('veg')], 'hearty', 600, '鲶鱼没有小刺，放心吃。', { also: VEG, taste: T(2, 0, 0, 1, 3), region: 'wetland' });
R('duck_shoot_stew', 'stew', '笋干老鸭煲', 'Duck and bamboo shoot pot', 'stew', [one('meat_duck'), one('bamboo_shoot')], 'vigor', 780, '笋解了鸭的腻。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'bamboo_sea' });
R('yam_bone_stew', 'stew', '山药炖骨头', 'Yam and bone stew', 'stew', [one('wild_yam'), tag('bone')], 'sturdy', 720, '汤是白的，山药是粉的。', { also: VEG, taste: T(2, 0, 0, 0, 3), region: 'karst_peaks' });
R('burdock_stew', 'stew', '牛蒡炖肉', 'Burdock and meat stew', 'stew', [one('burdock'), tag('red')], 'hearty', 660, '牛蒡有股药香，和红肉最配。', { also: VEG, taste: T(2, 0, 0, 0, 3) });
R('ginseng_fowl', 'stew', '参炖野禽', 'Fowl with ginseng', 'stew', [one('ginseng'), tag('bird')], 'vigor', 900, '一整根参炖一只禽。大补。', { also: ['root', 'mushroom'], taste: T(1, 1, 0, 0, 3) });
// ------------------------------------------------------------------ stir-fries (to 16)
R('scallion_egg', 'stirfry', '野葱炒蛋', 'Eggs with wild scallion', 'stirfry', [one('wild_scallion'), one('egg_wild')], 'vigor', 420, '葱要多，蛋要嫩。', { also: ['veg'], taste: T(2, 0, 0, 1, 2), region: 'plains' });
R('fiddlehead_meat', 'stirfry', '蕨菜炒肉', 'Fiddleheads with meat', 'stirfry', [one('fiddlehead'), tag('red')], 'sturdy', 540, '肉丝和蕨菜一样长。', { also: ['veg'], taste: T(2, 0, 0, 1, 3), region: 'forest' });
R('tomato_egg', 'stirfry', '番茄炒蛋', 'Tomato and eggs', 'stirfry', [one('wild_tomato'), one('egg_wild')], 'hearty', 480, '谁都会做，谁都爱吃。', { also: ['veg'], taste: T(2, 2, 2, 0, 2), region: 'terraces' });
R('chili_fowl', 'stirfry', '辣子野禽', 'Fowl with chili', 'stirfry', [tag('bird'), one('chili')], 'warm', 600, '在辣椒里找肉吃。', { also: ['veg'], taste: T(2, 0, 0, 3, 2), region: 'terraces' });
R('garlic_greens', 'stirfry', '蒜香野菜', 'Garlic greens', 'stirfry', [any('veg', 2), one('wild_garlic')], 'hydrated', 420, '野蒜爆锅，什么菜都香。', { also: ['veg'], taste: T(2, 0, 0, 1, 2) });
R('pepper_rabbit', 'stirfry', '花椒兔丁', 'Rabbit with Sichuan pepper', 'stirfry', [one('meat_rabbit'), one('sichuan_pepper')], 'warm', 600, '麻得嘴唇发抖还想吃。', { also: ['veg'], taste: T(2, 0, 0, 3, 2), region: 'karst_peaks' });
R('squid_fry', 'stirfry', '爆炒鱿鱼', 'Flash-fried squid', 'stirfry', [one('squid'), any('herb')], 'lucky', 480, '下锅数五下就起。', { also: ['veg'], taste: T(2, 0, 0, 1, 3), region: 'sea_cliffs' });
R('crayfish_fry', 'stirfry', '麻辣小龙虾', 'Spicy crayfish', 'stirfry', [one('crayfish', 2), one('chili')], 'warm', 540, '剥一手红油。', { also: ['herb'], taste: T(2, 0, 0, 3, 3), region: 'wetland' });
R('frog_fry', 'stirfry', '干煸牛蛙', 'Dry-fried frog', 'stirfry', [one('bullfrog'), any('spice')], 'vigor', 540, '肉像鸡又比鸡嫩。', { also: ['veg'], taste: T(2, 0, 0, 2, 2), region: 'wetland' });
R('shoot_meat', 'stirfry', '笋片炒肉', 'Bamboo shoots with meat', 'stirfry', [one('bamboo_shoot'), tag('red')], 'hearty', 540, '笋片吸了肉汁。', { also: ['veg'], taste: T(2, 0, 0, 0, 3), region: 'bamboo_sea' });
// ------------------------------------------------------------------ roasts (to 16)
R('salt_trout', 'roast', '盐烤鳟鱼', 'Salt-grilled trout', 'roast', [one('rainbow_trout'), one('salt')], 'steady', 720, '皮上的盐烤出一层白霜。', { taste: T(3, 0, 0, 0, 2), region: 'alpine' });
R('roast_rabbit', 'roast', '烤全兔', 'Whole roast rabbit', 'roast', [one('meat_rabbit', 2)], 'sturdy', 660, '转着烤，刷三遍油。', { also: ['veg'], taste: T(2, 0, 0, 1, 2), region: 'plains' });
R('boar_ribs', 'roast', '野猪肋排', 'Boar ribs', 'roast', [one('meat_boar', 2)], 'sturdy', 720, '啃到骨头发白。', { taste: T(2, 1, 0, 1, 3), region: 'forest' });
R('roast_duck', 'roast', '烤鸭', 'Roast duck', 'roast', [one('meat_duck', 2)], 'hearty', 720, '皮脆得能听见响。', { taste: T(2, 1, 0, 0, 3), region: 'lakes' });
R('roast_fowl', 'roast', '烤野禽', 'Roast wild fowl', 'roast', [one('meat_fowl', 2)], 'vigor', 600, '肚子里塞一把香草。', { also: ['veg'], taste: T(2, 0, 0, 0, 2) });
R('venison_roast', 'roast', '烤鹿腿', 'Roast haunch of venison', 'roast', [one('meat_venison', 2)], 'sturdy', 720, '外面焦，里面还是粉的。', { taste: T(2, 0, 0, 1, 3), region: 'maple' });
R('herb_fish', 'roast', '香草烤鱼', 'Herb-grilled fish', 'roast', [tag('fish'), any('herb', 2)], 'steady', 600, '鱼肚子里塞满香草。', { taste: T(2, 0, 1, 0, 2) });
R('honey_eel', 'roast', '蜜烤鳗鱼', 'Honey-glazed eel', 'roast', [one('eel'), any('sweet')], 'vigor', 660, '刷一层蜜，烤一遍，再刷一层。', { taste: T(2, 2, 0, 0, 3) });
R('grilled_squid', 'roast', '烤鱿鱼', 'Grilled squid', 'roast', [one('squid', 2)], 'lucky', 480, '压平了烤，卷起来就熟了。', { taste: T(2, 0, 0, 1, 3), region: 'sea_cliffs' });
R('grilled_mackerel', 'roast', '烤鲭鱼', 'Grilled mackerel', 'roast', [one('mackerel', 2)], 'steady', 540, '油滴进火里，一股烟。', { taste: T(2, 0, 1, 0, 3), region: 'sea_cliffs' });
R('roast_yam', 'roast', '烤山药', 'Roast yam', 'roast', [one('wild_yam', 2)], 'vigor', 420, '烤裂了皮，里面雪白。', { taste: T(0, 2, 0, 0, 0) });
R('roast_crab', 'roast', '烤蟹', 'Roast crab', 'roast', [one('crab', 2)], 'lucky', 540, '壳烤红了，掰开全是黄。', { taste: T(2, 0, 0, 0, 3) });
R('honey_fowl', 'roast', '蜜汁烤禽', 'Honey-roast fowl', 'roast', [tag('bird'), one('honeycomb')], 'vigor', 720, '甜的咸的都在一张皮上。', { taste: T(2, 2, 0, 0, 2), region: 'flower_fields' });
// ------------------------------------------------------------------ pan (to 12)
R('venison_steak', 'fry', '煎鹿排', 'Venison steak', 'fry', [one('meat_venison'), any('herb')], 'sturdy', 660, '两面各一分钟，歇一歇再切。', { taste: T(2, 0, 0, 1, 3) });
R('fish_fillet', 'fry', '香煎鱼片', 'Pan-fried fillet', 'fry', [tag('bigfish'), any('herb')], 'steady', 600, '皮朝下先煎，别急着翻。', { taste: T(2, 0, 1, 0, 2) });
R('fried_eggs', 'fry', '煎蛋', 'Fried eggs', 'fry', [one('egg_wild', 2)], 'vigor', 360, '边上要焦一圈才香。', { taste: T(2, 0, 0, 0, 1) });
R('potato_cake', 'fry', '土豆饼', 'Potato cakes', 'fry', [one('potato', 2), any('herb')], 'hearty', 480, '擦成丝，摊成饼。', { taste: T(2, 0, 0, 0, 1), region: 'plains' });
R('mushroom_omelette', 'fry', '蘑菇蛋饼', 'Mushroom omelette', 'fry', [one('egg_wild'), any('mushroom')], 'keen', 480, '蘑菇先炒干水分。', { also: ['veg'], taste: T(2, 0, 0, 0, 3) });
R('fried_smelt', 'fry', '香煎小鱼', 'Fried smelt', 'fry', [one('smelt', 2)], 'steady', 420, '连头带骨一起嚼。', { taste: T(2, 0, 0, 0, 2), region: 'alpine' });
R('duck_breast', 'fry', '果香煎鸭胸', 'Duck breast with fruit', 'fry', [one('meat_duck'), any('fruit')], 'hearty', 660, '酸甜的果子解鸭油的腻。', { taste: T(2, 2, 1, 0, 2) });
R('fried_perch', 'fry', '煎黄鲈', 'Pan-fried perch', 'fry', [one('yellow_perch', 2)], 'steady', 480, '小鱼两条正好一盘。', { taste: T(2, 0, 0, 0, 2), region: 'lakes' });
R('sage_boar_chop', 'fry', '鼠尾草煎野猪排', 'Boar chop with sage', 'fry', [one('meat_boar'), one('sage')], 'sturdy', 660, '鼠尾草和猪肉是老搭档。', { taste: T(2, 0, 0, 0, 3), region: 'red_canyon' });
// ------------------------------------------------------------------ steamed (to 10)
R('steamed_sea_bass', 'steam', '清蒸海鲈', 'Steamed sea bass', 'steam', [one('sea_bass'), one('wild_scallion')], 'steady', 720, '出锅淋一勺热油。', { taste: T(2, 0, 0, 1, 3), region: 'sea_cliffs' });
R('matsutake_fowl', 'steam', '松茸蒸野禽', 'Fowl steamed with matsutake', 'steam', [one('matsutake'), tag('bird')], 'keen', 780, '什么都不用放，盖上盖子等。', { taste: T(1, 0, 0, 0, 3), region: 'forest' });
R('steamed_egg', 'steam', '蒸蛋羹', 'Steamed egg custard', 'steam', [one('egg_wild', 2)], 'vigor', 420, '嫩得用勺子舀。', { also: ['shellfish'], taste: T(1, 0, 0, 0, 2) });
R('steamed_crab', 'steam', '清蒸蟹', 'Steamed crab', 'steam', [one('crab', 2)], 'lucky', 600, '蘸一点醋就够了。', { taste: T(1, 0, 1, 0, 3) });
R('steamed_mandarin', 'steam', '清蒸鳜鱼', 'Steamed mandarin fish', 'steam', [one('mandarin_fish'), any('herb')], 'steady', 780, '肉是一瓣一瓣的蒜瓣肉。', { taste: T(2, 0, 0, 0, 3), region: 'lakes' });
R('steamed_shoots', 'steam', '清蒸笋', 'Steamed bamboo shoots', 'steam', [one('bamboo_shoot', 2)], 'cool', 420, '带壳蒸，剥开是甜的。', { taste: T(1, 1, 0, 0, 2), region: 'bamboo_sea' });
R('steamed_bream', 'steam', '清蒸鲷鱼', 'Steamed sea bream', 'steam', [one('sea_bream'), any('herb')], 'steady', 720, '红皮白肉，喜庆。', { taste: T(2, 0, 0, 0, 3) });
// ------------------------------------------------------------------ rice and noodles (to 14)
R('fish_noodles', 'rice', '鱼汤面', 'Fish soup noodles', 'rice', [any('grain'), tag('fish'), any('herb')], 'steady', 660, '汤是奶白的，面是手擀的。', { also: ['veg'], taste: T(2, 0, 0, 0, 3) });
R('egg_rice', 'rice', '蛋炒饭', 'Egg fried rice', 'rice', [any('grain', 2), one('egg_wild')], 'hearty', 600, '隔夜饭炒才粒粒分明。', { also: ['veg', 'herb'], taste: T(2, 0, 0, 0, 2) });
R('sorghum_porridge', 'rice', '高粱粥', 'Sorghum porridge', 'rice', [one('sorghum', 2)], 'hearty', 540, '红通通的一锅，顶饿。', { also: ['sweet', 'root'], taste: T(0, 1, 0, 0, 0), region: 'desert' });
R('lotus_congee', 'rice', '莲藕粥', 'Lotus root congee', 'rice', [any('grain'), one('lotus_root')], 'hydrated', 540, '粥里有藕的清甜。', { also: ['sweet'], taste: T(0, 1, 0, 0, 1), region: 'wetland' });
R('eel_rice', 'rice', '鳗鱼饭', 'Eel on rice', 'rice', [any('grain', 2), one('eel')], 'vigor', 780, '酱汁渗到饭里的那一层最好吃。', { taste: T(2, 2, 0, 0, 3) });
R('game_rice', 'rice', '野味焖饭', 'Game rice', 'rice', [any('grain', 2), tag('game')], 'sturdy', 720, '肉的油都焖进了饭里。', { also: ['veg', 'mushroom'], taste: T(2, 0, 0, 0, 3) });
R('clam_rice', 'rice', '蛤蜊饭', 'Clam rice', 'rice', [any('grain', 2), one('clam')], 'lucky', 660, '掀盖的时候蛤蜊全开了口。', { taste: T(2, 0, 0, 0, 3), region: 'sea_cliffs' });
R('tomato_noodles', 'rice', '番茄面', 'Tomato noodles', 'rice', [any('grain'), one('wild_tomato', 2)], 'hydrated', 540, '酸汤面，连汤喝完。', { also: ['egg', 'veg'], taste: T(2, 1, 2, 0, 2), region: 'terraces' });
R('yam_congee', 'rice', '山药粥', 'Yam congee', 'rice', [any('grain'), one('wild_yam')], 'vigor', 600, '养胃。', { also: ['sweet'], taste: T(0, 1, 0, 0, 1), region: 'karst_peaks' });
R('tea_rice', 'rice', '茶泡饭', 'Rice in tea', 'rice', [any('grain'), one('tea_leaf')], 'cool', 480, '热茶往冷饭上一浇。', { also: ['veg', 'fish'], taste: T(1, 0, 0, 0, 1), region: 'terraces' });
// ------------------------------------------------------------------ salads (to 10)
R('dandelion_salad', 'salad', '凉拌蒲公英', 'Dandelion salad', 'mix', [one('dandelion', 2)], 'hydrated', 360, '微苦，败火。', { also: ['veg', 'nut'], taste: T(2, 0, 2, 0, 0), region: 'plains' });
R('watercress_salad', 'salad', '凉拌豆瓣菜', 'Watercress salad', 'mix', [one('watercress', 2)], 'cool', 360, '脆生生的。', { also: ['veg'], taste: T(2, 0, 1, 1, 0) });
R('sweet_tomato', 'salad', '糖拌番茄', 'Sugared tomatoes', 'mix', [one('wild_tomato', 2), any('sweet')], 'cool', 360, '盘底那口汤要留到最后。', { taste: T(0, 3, 1, 0, 1) });
R('mint_fruit', 'salad', '薄荷果盘', 'Fruit with mint', 'mix', [any('fruit', 2), one('mint')], 'cool', 420, '夏天午后来一盘。', { also: ['sweet'], taste: T(0, 3, 1, 0, 0) });
R('lotus_salad', 'salad', '凉拌藕片', 'Lotus root salad', 'mix', [one('lotus_root'), any('spice')], 'cool', 420, '藕片薄得透光。', { also: ['veg'], taste: T(2, 1, 2, 1, 0), region: 'lakes' });
R('samphire_salad', 'salad', '凉拌海蓬子', 'Samphire salad', 'mix', [one('samphire', 2)], 'hydrated', 360, '不用放盐。', { also: ['veg'], taste: T(2, 0, 1, 0, 1), region: 'sea_cliffs' });
R('nut_greens', 'salad', '坚果拌野菜', 'Greens with nuts', 'mix', [any('veg', 2), any('nut')], 'sturdy', 420, '脆的和嫩的拌在一起。', { also: ['fruit'], taste: T(1, 0, 1, 0, 1) });
// ------------------------------------------------------------------ preserves (12)
R('venison_jerky', 'preserve', '鹿肉干', 'Venison jerky', 'dry', [one('meat_venison'), one('salt')], 'sturdy', 720, '揣在兜里，饿了撕一条。', { taste: T(3, 0, 0, 1, 3) });
R('jerky', 'preserve', '肉干', 'Jerky', 'dry', [tag('red'), one('salt')], 'sturdy', 600, '越嚼越香。', { taste: T(3, 0, 0, 1, 3) });
R('smoked_fish', 'preserve', '熏鱼', 'Smoked fish', 'smoke', [tag('fish', 2)], 'steady', 600, '金黄的皮，带着烟火气。', { taste: T(2, 0, 0, 0, 3) });
R('smoked_duck', 'preserve', '熏鸭', 'Smoked duck', 'smoke', [one('meat_duck')], 'hearty', 660, '挂在车里，一路都是香的。', { taste: T(2, 0, 0, 0, 3), region: 'lakes' });
R('pickled_greens', 'preserve', '腌菜', 'Pickled greens', 'pickle', [any('veg', 2), one('salt')], 'hydrated', 480, '走上一段路，坛子里的菜就酸了。', { taste: T(3, 0, 2, 0, 1) });
R('dried_fruit', 'preserve', '果干', 'Dried fruit', 'dry', [any('fruit', 3)], 'vigor', 480, '晒过的果子更甜。', { taste: T(0, 3, 1, 0, 0) });
R('dried_mushrooms', 'preserve', '蘑菇干', 'Dried mushrooms', 'dry', [any('mushroom', 3)], 'keen', 480, '干了反而更香，泡开又是一锅汤。', { taste: T(0, 0, 0, 0, 3), region: 'forest' });
R('berry_jam', 'preserve', '野莓酱', 'Wild berry jam', 'pickle', [any('fruit', 2), any('sweet')], 'vigor', 540, '熬到挂勺。', { taste: T(0, 3, 1, 0, 0) });
R('salted_fish', 'preserve', '咸鱼', 'Salted fish', 'pickle', [tag('fish'), one('salt')], 'steady', 540, '咸，下饭。', { taste: T(3, 0, 0, 0, 2) });
R('smoked_boar', 'preserve', '熏野猪肉', 'Smoked boar', 'smoke', [one('meat_boar')], 'sturdy', 720, '肥的地方熏成了透明的。', { taste: T(2, 0, 0, 0, 3), region: 'forest' });
R('sour_shoots', 'preserve', '酸笋', 'Sour bamboo shoots', 'pickle', [one('bamboo_shoot', 2)], 'cool', 540, '闻着冲，吃着上瘾。', { taste: T(2, 0, 3, 0, 1), region: 'karst_peaks' });
R('dried_kelp', 'preserve', '干海带', 'Dried kelp', 'dry', [one('kelp', 2)], 'hydrated', 420, '挂在车顶上晒。', { taste: T(2, 0, 0, 0, 2), region: 'sea_cliffs' });
// ------------------------------------------------------------------ sweets (to 10)
R('honey_cake', 'sweet', '蜂蜜饼', 'Honey cake', 'bake', [any('grain'), one('honeycomb')], 'vigor', 600, '饼是烫的，蜜是流的。', { also: ['nut'], taste: T(0, 3, 0, 0, 0), region: 'flower_fields' });
R('persimmon_cake', 'sweet', '柿饼', 'Persimmon cakes', 'bake', [one('persimmon', 2)], 'warm', 540, '表面一层白霜是糖。', { taste: T(0, 3, 0, 0, 0), region: 'maple' });
R('cherry_tart', 'sweet', '樱桃塔', 'Cherry tart', 'bake', [one('cherry', 2), any('grain')], 'vigor', 600, '樱桃要去核，一颗一颗来。', { also: ['sweet'], taste: T(0, 3, 1, 0, 0) });
R('walnut_cake', 'sweet', '核桃酥', 'Walnut shortcake', 'bake', [one('walnut', 2), any('sweet')], 'sturdy', 540, '一碰就掉渣。', { also: ['grain'], taste: T(0, 3, 0, 0, 1) });
R('candied_yam', 'sweet', '拔丝山药', 'Candied yam', 'stirfry', [one('wild_yam'), any('sweet')], 'vigor', 540, '趁热吃，能拉出很长的丝。', { taste: T(0, 3, 0, 0, 0), region: 'karst_peaks' });
// ------------------------------------------------------------------ drinks (to 12)
R('grape_wine', 'drink', '野葡萄酒', 'Wild grape wine', 'brew', [one('wild_grape', 3)], 'lucky', 720, '酸，涩，但是是自己酿的。', { also: ['sweet'], taste: T(0, 2, 2, 0, 0) });
R('buckthorn_juice', 'drink', '沙棘汁', 'Sea buckthorn juice', 'brew', [one('sea_buckthorn', 2)], 'vigor', 540, '橙黄色，酸得一激灵。', { also: ['sweet'], taste: T(0, 2, 3, 0, 0), region: 'red_canyon' });
R('reishi_tea', 'drink', '灵芝茶', 'Reishi tea', 'brew', [one('reishi')], 'steady', 900, '苦后回甘，喝了睡得沉。', { also: ['sweet'], taste: T(0, 0, 0, 0, 1) });
// ------------------------------------------------------------------ camp food (to 8)
R('fish_on_stick', 'camp', '烤鱼串', 'Fish on a stick', 'roast', [tag('fish')], 'steady', 420, '削根树枝穿上就烤。', { taste: T(2, 0, 0, 0, 2) });
R('dumpling_soup', 'camp', '饺子汤', 'Dumpling soup', 'soup', [one('food_dumplings')], 'hearty', 420, '连汤带饺子，暖和。', { also: VEG, taste: T(2, 0, 1, 0, 2) });

/** every recipe, by class in the catalogue's order */
export const RECIPES: readonly Recipe[] = ALL;

const BY_ID = new Map(ALL.map((r) => [r.id, r]));

export function recipe(id: string): Recipe {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
}
