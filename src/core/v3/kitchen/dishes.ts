/**
 * The kitchen's dishes (docs/V3/plan/cooking.md §3): what a pot may come to. Three layers —
 *   home    by kinds ("any vegetable, fried"): whatever is sensible makes one of them, one or two stars;
 *   named   by name (tomato and eggs): two to four stars;
 *   feast   four or five things from several sources, a rare one among them: four or five stars.
 * A dish's stars are its own: what it asks for says how far one must have travelled to make it.
 *
 * A row: id, 中文, English, way, stars, what it needs, what else may go in. A need or an extra is an ingredient's id
 * (pantry.ts) or "@tag" (any of a kind); "x2" after a need asks for two. More of what a dish needs may always go in.
 * Flags: "raw" — its fish is eaten raw (a pot of raw fish is otherwise no dish).
 *
 * Pure data; cook.ts reads it.
 */
export type Way = 'fry' | 'boil' | 'mix' | 'grill' | 'steam' | 'bake' | 'brew';

/**
 * the cookware of each way (the first three are the first batch: a pan, a pot, a bowl). `gain`: how much more a dish
 * feeds than its portions' own food — never under 1.6 for a dish to eat (docs/V3/plan/finish.md §八 3: 做的菜要明显比
 * 罐头值, at least 1.6 times what went into it eaten raw; a drink is no dish to fill one)
 */
export const WAYS: Readonly<Record<Way, { zh: string; en: string; cookware: string; heats: boolean; gain: number }>> = {
  fry: { zh: '煎炒', en: 'Fry', cookware: 'pan', heats: true, gain: 1.7 },
  boil: { zh: '煮炖', en: 'Boil', cookware: 'pot', heats: true, gain: 1.9 },
  mix: { zh: '拌', en: 'Toss', cookware: 'bowl', heats: false, gain: 1.6 },
  grill: { zh: '烤', en: 'Grill', cookware: 'grill', heats: true, gain: 1.7 },
  steam: { zh: '蒸', en: 'Steam', cookware: 'steamer', heats: true, gain: 1.7 },
  bake: { zh: '烘焙', en: 'Bake', cookware: 'oven', heats: true, gain: 1.9 },
  brew: { zh: '饮品', en: 'Brew', cookware: 'kettle', heats: true, gain: 1.0 },
};

export type Layer = 'home' | 'named' | 'feast';

export interface DishDef {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  readonly way: Way;
  readonly stars: number;
  readonly layer: Layer;
  /** each one portion: an id, or '@tag' */
  readonly need: readonly string[];
  /** what else may be in the pot */
  readonly extra: readonly string[];
  readonly raw: boolean;
}

type Row = readonly [id: string, zh: string, en: string, way: Way, stars: number, need: string, extra?: string, flags?: string];

function defs(layer: Layer, list: readonly Row[]): DishDef[] {
  return list.map(([id, zh, en, way, stars, need, extra = '', flags = '']) => {
    const out: string[] = [];
    for (const tok of need.split(' ').filter(Boolean)) {
      const m = /^(.+?)x(\d)$/.exec(tok);
      if (m) for (let i = 0; i < Number(m[2]); i++) out.push(m[1]);
      else out.push(tok);
    }
    return { id, zh, en, way, stars, layer, need: out, extra: extra.split(' ').filter(Boolean), raw: flags.includes('raw') };
  });
}

const SAV = '@veg @aromatic @mushroom @green';

export const DISHES: readonly DishDef[] = [
  ...defs('home', [
    // a pan
    ['stir_veg', '清炒时蔬', 'Stir-fried greens', 'fry', 1, '@veg', '@veg @aromatic @green'],
    ['fried_egg', '煎蛋', 'Fried egg', 'fry', 1, '@egg', '@aromatic'],
    ['fried_mushroom', '煎蘑菇', 'Fried mushrooms', 'fry', 1, '@mushroom', '@mushroom @aromatic'],
    ['pan_meat', '煎肉排', 'Pan-fried meat', 'fry', 2, '@meat', '@aromatic'],
    ['pan_fish', '香煎鱼', 'Pan-fried fish', 'fry', 2, '@fish', '@aromatic'],
    ['veg_egg', '蔬菜炒蛋', 'Eggs with vegetables', 'fry', 2, '@veg @egg', '@veg @aromatic @green'],
    ['meat_veg', '小炒肉', 'Meat stir-fry', 'fry', 2, '@meat @veg', SAV],
    ['mushroom_meat', '菌菇炒肉', 'Meat with mushrooms', 'fry', 2, '@meat @mushroom', '@mushroom @aromatic'],
    ['egg_fried_rice', '蛋炒饭', 'Egg fried rice', 'fry', 2, 'rice @egg', '@veg @aromatic'],
    ['fried_noodle', '炒面', 'Fried noodles', 'fry', 2, 'noodle @veg', '@veg @aromatic @meat @egg'],
    ['toast', '煎吐司', 'Toast', 'fry', 1, 'bread', 'butter'],
    ['shell_stir', '爆炒海鲜', 'Seafood stir-fry', 'fry', 2, '@shell', '@shell @aromatic'],
    ['fried_tofu', '煎豆腐', 'Fried tofu', 'fry', 1, 'tofu', '@aromatic'],
    // a pot
    ['veg_soup', '蔬菜汤', 'Vegetable soup', 'boil', 1, '@veg', '@veg @aromatic @green'],
    ['mushroom_soup', '菌菇汤', 'Mushroom soup', 'boil', 1, '@mushroom', '@mushroom @aromatic @green'],
    ['meat_stew', '炖肉', 'Stewed meat', 'boil', 2, '@meat', '@veg @aromatic'],
    ['fish_soup', '鱼汤', 'Fish soup', 'boil', 2, '@fish', '@aromatic @green'],
    ['congee', '白粥', 'Rice porridge', 'boil', 1, 'rice', '@green'],
    ['noodle_soup', '汤面', 'Noodle soup', 'boil', 1, 'noodle', '@veg @aromatic @egg @green'],
    ['boiled_egg', '水煮蛋', 'Boiled egg', 'boil', 1, '@egg'],
    ['bean_soup', '豆子汤', 'Bean soup', 'boil', 1, 'bean', '@veg @aromatic'],
    ['shell_boil', '白灼海鲜', 'Boiled seafood', 'boil', 2, '@shell', '@shell @aromatic'],
    ['compote', '糖水水果', 'Stewed fruit', 'boil', 1, '@fruit', '@fruit honey'],
    ['mixed_pot', '什锦锅', 'Everything pot', 'boil', 2, '@meat @veg @mushroom', SAV + ' tofu'],
    ['tofu_soup', '豆腐汤', 'Tofu soup', 'boil', 1, 'tofu', '@veg @aromatic @green @mushroom'],
    // a bowl
    ['salad', '蔬菜沙拉', 'Salad', 'mix', 1, '@veg', '@veg @green @aromatic'],
    ['fruit_salad', '水果沙拉', 'Fruit salad', 'mix', 1, '@fruitx2', '@fruit'],
    ['fruit_milk', '水果牛奶', 'Fruit milk', 'mix', 2, 'milk @fruit', '@fruit'],
    ['veg_sandwich', '蔬菜三明治', 'Vegetable sandwich', 'mix', 2, 'bread @veg', '@veg cheese'],
    // a grill
    ['skewer', '烤肉串', 'Meat skewers', 'grill', 2, '@meat', '@veg @aromatic @mushroom'],
    ['grilled_fish', '烤鱼', 'Grilled fish', 'grill', 2, '@fish', '@aromatic'],
    ['grilled_veg', '烤蔬菜', 'Grilled vegetables', 'grill', 1, '@veg', '@veg @aromatic'],
    ['grilled_mushroom', '烤蘑菇', 'Grilled mushrooms', 'grill', 1, '@mushroom', '@mushroom @aromatic'],
    ['grilled_shell', '烤海鲜', 'Grilled seafood', 'grill', 2, '@shell', '@shell @aromatic'],
    // a steamer
    ['steamed_fish', '清蒸鱼', 'Steamed fish', 'steam', 2, '@fish', '@aromatic'],
    ['steamed_egg', '蒸蛋', 'Steamed egg', 'steam', 1, '@egg', '@aromatic'],
    ['steamed_veg', '蒸时蔬', 'Steamed vegetables', 'steam', 1, '@veg', '@veg @aromatic'],
    ['steamed_shell', '清蒸海鲜', 'Steamed seafood', 'steam', 2, '@shell', '@shell @aromatic'],
    // an oven, a kettle
    ['roast_meat', '烤肉', 'Roast meat', 'bake', 2, '@meat', '@veg @aromatic'],
    ['fruit_tea', '水果茶', 'Fruit tea', 'brew', 1, '@fruit', '@fruit honey'],
    ['herb_tea', '香草茶', 'Herb tea', 'brew', 1, '@herb', 'honey'],
  ]),
  ...defs('named', [
    // a pan
    ['tomato_egg', '番茄炒蛋', 'Tomato and eggs', 'fry', 2, 'tomato @egg', 'scallion'],
    ['potato_shreds', '酸辣土豆丝', 'Hot and sour potato', 'fry', 2, 'potato chili', 'garlic'],
    ['garlic_broccoli', '蒜蓉西兰花', 'Garlic broccoli', 'fry', 2, 'broccoli garlic'],
    ['pepper_pork', '青椒肉丝', 'Pork with green pepper', 'fry', 3, 'pepper pork', '@aromatic'],
    ['yuxiang_eggplant', '鱼香茄子', 'Fragrant aubergine', 'fry', 3, 'eggplant garlic chili', 'pork'],
    ['bacon_egg', '培根煎蛋', 'Bacon and eggs', 'fry', 2, 'bacon @egg'],
    ['bacon_fried_rice', '培根蛋炒饭', 'Bacon fried rice', 'fry', 3, 'rice @egg bacon', '@veg @aromatic'],
    ['onion_beef', '洋葱炒牛肉', 'Beef with onion', 'fry', 3, 'onion beef', '@aromatic'],
    ['kungpao', '宫保鸡丁', 'Kung pao chicken', 'fry', 3, 'chicken chili walnut', '@aromatic'],
    ['mapo', '麻婆豆腐', 'Mapo tofu', 'fry', 3, 'tofu pork chili', '@aromatic'],
    ['scallion_egg', '葱花炒蛋', 'Eggs with wild onion', 'fry', 2, 'scallion @egg'],
    ['shrimp_egg', '虾仁滑蛋', 'Shrimp and eggs', 'fry', 3, 'shrimp @egg', 'scallion'],
    ['butter_chanterelle', '黄油煎鸡油菌', 'Chanterelles in butter', 'fry', 3, 'chanterelle butter', 'garlic'],
    ['bamboo_pork', '竹笋炒肉', 'Pork with bamboo shoots', 'fry', 3, 'bamboo pork', '@aromatic'],
    ['cheese_omelette', '奶酪欧姆蛋', 'Cheese omelette', 'fry', 3, '@egg cheese milk'],
    ['pancake', '松饼', 'Pancakes', 'fry', 2, 'flour @egg milk', 'honey butter @berry'],
    ['french_toast', '法式吐司', 'French toast', 'fry', 3, 'bread @egg milk', 'honey butter'],
    ['steak', '黄油煎牛排', 'Butter steak', 'fry', 4, 'beef butter garlic'],
    ['lamb_chop', '香煎羊排', 'Lamb chops', 'fry', 4, 'lamb garlic mint'],
    ['salmon_steak', '香煎三文鱼', 'Seared salmon', 'fry', 4, 'salmon butter lemon'],
    ['garlic_shrimp', '蒜蓉虾', 'Garlic shrimp', 'fry', 3, 'shrimp garlic', 'butter chili'],
    ['orange_duck', '香橙鸭胸', 'Duck with orange', 'fry', 4, 'duck orange'],
    ['corn_fritter', '玉米烙', 'Corn fritters', 'fry', 2, 'corn flour', '@egg'],
    ['shepherds_egg', '荠菜炒蛋', "Eggs with shepherd's purse", 'fry', 2, 'shepherds @egg'],
    ['cabbage_bacon', '培根炒卷心菜', 'Cabbage with bacon', 'fry', 2, 'cabbage bacon', 'garlic chili'],
    ['porcini_beef', '牛肝菌炒牛肉', 'Beef with porcini', 'fry', 4, 'porcini beef', '@aromatic'],
    ['oyster_egg', '平菇炒蛋', 'Eggs with oyster mushrooms', 'fry', 2, 'oyster @egg', 'scallion'],
    ['berry_toast', '莓果酱吐司', 'Toast with berry jam', 'fry', 2, 'bread berry', 'butter honey'],
    ['wild_frittata', '野菌烘蛋', 'Wildfowl egg frittata', 'fry', 3, 'wildegg @mushroom', 'scallion butter'],
    ['fried_brookfish', '酥炸小溪鱼', 'Crisp brook fish', 'fry', 2, 'brookfish flour'],
    ['cucumber_egg', '黄瓜炒蛋', 'Eggs with cucumber', 'fry', 2, 'cucumber @egg'],
    ['broccoli_shrimp', '西兰花炒虾仁', 'Shrimp with broccoli', 'fry', 3, 'broccoli shrimp', 'garlic'],
    // a pot
    ['potato_beef', '土豆炖牛肉', 'Beef and potato stew', 'boil', 3, 'potato beef', 'carrot onion @aromatic'],
    ['tomato_beef', '番茄牛腩', 'Beef in tomato', 'boil', 3, 'tomato beef', 'onion @aromatic'],
    ['pumpkin_soup', '南瓜浓汤', 'Pumpkin soup', 'boil', 3, 'pumpkin milk', 'butter onion'],
    ['cream_mushroom', '奶油蘑菇汤', 'Cream of mushroom', 'boil', 3, '@mushroom milk butter', '@mushroom onion'],
    ['shiitake_chicken', '香菇炖鸡', 'Chicken with shiitake', 'boil', 3, 'chicken shiitake', '@aromatic'],
    ['corn_pork', '玉米炖排骨', 'Pork and corn soup', 'boil', 3, 'corn pork', 'carrot @aromatic'],
    ['borscht', '罗宋汤', 'Borscht', 'boil', 3, 'tomato cabbage beef', 'potato carrot onion'],
    ['clam_pasta', '蛤蜊意面', 'Clam pasta', 'boil', 3, 'noodle clam garlic', 'chili butter'],
    ['tomato_egg_noodle', '番茄鸡蛋面', 'Tomato and egg noodles', 'boil', 2, 'noodle tomato @egg', 'scallion'],
    ['beef_noodle', '牛肉面', 'Beef noodles', 'boil', 3, 'noodle beef', '@aromatic @leaf'],
    ['shrimp_congee', '鲜虾粥', 'Shrimp porridge', 'boil', 3, 'rice shrimp', 'ginger scallion'],
    ['chicken_congee', '香菇鸡肉粥', 'Chicken and shiitake porridge', 'boil', 3, 'rice chicken shiitake', 'ginger scallion'],
    ['lamb_stew', '胡萝卜炖羊肉', 'Lamb and carrot stew', 'boil', 4, 'lamb carrot', 'onion @aromatic'],
    ['venison_stew', '蘑菇炖鹿肉', 'Venison with mushrooms', 'boil', 4, 'venison @mushroom', '@mushroom @root @aromatic'],
    ['fish_tofu', '鲜鱼豆腐汤', 'Fish and tofu soup', 'boil', 3, '@fish tofu', '@aromatic'],
    ['egg_drop', '番茄蛋花汤', 'Tomato egg-drop soup', 'boil', 2, 'tomato @egg', 'scallion'],
    ['chicken_curry', '咖喱鸡', 'Chicken curry', 'boil', 3, 'chicken potato carrot', 'onion chili'],
    ['bean_bacon', '豆子炖培根', 'Beans with bacon', 'boil', 2, 'bean bacon', 'onion tomato'],
    ['duck_bamboo', '竹笋老鸭汤', 'Duck and bamboo soup', 'boil', 4, 'duck bamboo', 'ginger'],
    ['crab_congee', '蟹粥', 'Crab porridge', 'boil', 4, 'rice crab ginger', 'scallion'],
    ['mac_cheese', '奶酪通心面', 'Macaroni cheese', 'boil', 3, 'noodle cheese milk', 'butter bacon'],
    ['bean_rice', '豆子焖饭', 'Rice and beans', 'boil', 2, 'rice bean', 'bacon onion'],
    ['oyster_pork_soup', '平菇肉片汤', 'Pork and oyster mushroom soup', 'boil', 2, 'oyster pork', '@aromatic'],
    ['carbonara', '培根蛋面', 'Carbonara', 'boil', 3, 'noodle bacon egg cheese'],
    ['brookfish_soup', '小鱼野葱汤', 'Brook fish soup with wild onion', 'boil', 2, 'brookfish scallion', 'ginger tofu'],
    // a bowl
    ['caesar', '凯撒沙拉', 'Caesar salad', 'mix', 3, 'lettuce bread cheese', 'lemon tomato'],
    ['smashed_cucumber', '拍黄瓜', 'Smashed cucumber', 'mix', 2, 'cucumber garlic', 'chili'],
    ['tuna_salad', '金枪鱼沙拉', 'Tuna salad', 'mix', 4, 'tuna lettuce', 'tomato cucumber lemon', 'raw'],
    ['berry_shake', '莓果奶昔', 'Berry shake', 'mix', 2, '@berry milk', '@berry honey'],
    ['banana_milk', '香蕉牛奶', 'Banana milk', 'mix', 3, 'banana milk', 'honey'],
    ['blt', '培根生菜番茄三明治', 'BLT', 'fry', 3, 'bread bacon lettuce tomato', 'cheese'],
    ['honey_fruit', '蜂蜜坚果水果碗', 'Fruit bowl with honey and nuts', 'mix', 3, '@fruitx2 honey walnut', '@fruit'],
    ['salmon_sashimi', '三文鱼刺身', 'Salmon sashimi', 'mix', 4, 'salmon lemon', '', 'raw'],
    ['cold_tofu', '小葱拌豆腐', 'Tofu with wild onion', 'mix', 2, 'tofu scallion'],
    ['watermelon_juice', '西瓜汁', 'Watermelon juice', 'mix', 3, 'watermelon lemon', 'mint honey'],
    ['watermelon_cheese', '西瓜奶酪沙拉', 'Watermelon and cheese salad', 'mix', 3, 'watermelon cheese mint'],
    // a grill
    ['grilled_corn', '烤玉米', 'Grilled corn', 'grill', 2, 'corn', 'butter'],
    ['lamb_skewer', '辣味羊肉串', 'Spiced lamb skewers', 'grill', 3, 'lamb chili', 'onion'],
    ['honey_chicken', '蜜汁烤鸡', 'Honey chicken', 'grill', 3, 'chicken honey', 'garlic'],
    ['garlic_eggplant', '蒜蓉烤茄子', 'Grilled aubergine with garlic', 'grill', 3, 'eggplant garlic', 'chili scallion'],
    ['grilled_matsutake', '炭烤松茸', 'Grilled matsutake', 'grill', 4, 'matsutake'],
    ['lemon_trout', '柠檬烤鳟鱼', 'Grilled trout with lemon', 'grill', 3, 'trout lemon', 'garlic butter'],
    // a steamer
    ['steamed_trout', '清蒸鳟鱼', 'Steamed trout', 'steam', 3, 'trout ginger scallion'],
    ['garlic_clam', '蒜蓉蒸蛤蜊', 'Steamed clams with garlic', 'steam', 3, 'clam garlic', 'chili scallion'],
    ['steamed_crab', '清蒸螃蟹', 'Steamed crab', 'steam', 4, 'crab ginger'],
    ['shrimp_custard', '虾仁蒸蛋', 'Egg custard with shrimp', 'steam', 3, '@egg shrimp', 'scallion'],
    ['honey_pumpkin', '蜂蜜蒸南瓜', 'Steamed pumpkin with honey', 'steam', 2, 'pumpkin honey'],
    ['dumpling', '猪肉白菜饺子', 'Pork and cabbage dumplings', 'steam', 3, 'flour pork cabbage', '@aromatic'],
    ['shepherds_dumpling', '荠菜饺子', "Shepherd's purse dumplings", 'steam', 3, 'flour shepherds pork', '@aromatic'],
    ['stuffed_pepper', '酿青椒', 'Stuffed green peppers', 'steam', 3, 'pepper pork', 'garlic ginger'],
    ['egg_pudding', '蜂蜜布丁', 'Honey pudding', 'steam', 3, 'egg milk honey'],
    // an oven
    ['apple_pie', '苹果派', 'Apple pie', 'bake', 3, 'apple flour butter', '@egg honey'],
    ['baked_potato', '黄油烤土豆', 'Baked potato', 'bake', 2, 'potato butter', 'cheese bacon'],
    ['pizza', '披萨', 'Pizza', 'bake', 4, 'flour cheese tomato', 'bacon @mushroom pepper onion'],
    ['berry_tart', '莓果塔', 'Berry tart', 'bake', 3, '@berry flour butter', '@egg @berry'],
    ['banana_bread', '香蕉面包', 'Banana bread', 'bake', 3, 'banana flour @egg', 'walnut butter'],
    ['roast_chicken', '柠檬烤鸡', 'Lemon roast chicken', 'bake', 4, 'chicken lemon garlic', 'potato carrot'],
    ['cheesecake', '奶酪蛋糕', 'Cheesecake', 'bake', 4, 'cheese @egg flour', 'milk @berry'],
    ['walnut_cookie', '核桃饼干', 'Walnut biscuits', 'bake', 2, 'walnut flour butter', 'honey'],
    ['strawberry_cake', '草莓蛋糕', 'Strawberry cake', 'bake', 4, 'strawberry flour @egg milk', 'butter'],
    ['garlic_bread', '蒜香面包', 'Garlic bread', 'bake', 2, 'bread garlic butter'],
    ['baked_apple', '蜂蜜烤苹果', 'Baked apple with honey', 'bake', 2, 'apple honey', 'walnut butter'],
    // a kettle
    ['lemon_honey', '柠檬蜂蜜茶', 'Honey lemon tea', 'brew', 2, 'lemon honey'],
    ['mint_lemon', '薄荷柠檬水', 'Mint lemonade', 'brew', 2, 'mint lemon', 'honey'],
    ['honey_milk', '蜂蜜热牛奶', 'Hot milk with honey', 'brew', 2, 'milk honey'],
    ['ginger_tea', '姜茶', 'Ginger tea', 'brew', 2, 'ginger honey', 'lemon'],
  ]),
  ...defs('feast', [
    ['paella', '海鲜饭', 'Paella', 'boil', 5, 'rice shrimp clam tomato chili'],
    ['matsutake_chicken', '松茸炖鸡', 'Chicken with matsutake', 'boil', 5, 'matsutake chicken ginger', 'scallion'],
    ['butter_lobster', '黄油龙虾', 'Butter lobster', 'fry', 5, 'lobster butter garlic lemon'],
    ['truffle_pasta', '松露奶酪意面', 'Truffle pasta', 'boil', 5, 'noodle truffle cheese butter'],
    ['sashimi_platter', '刺身拼盘', 'Sashimi platter', 'mix', 5, 'tuna salmon shrimp lemon', '', 'raw'],
    ['herb_lamb_rack', '香草烤羊排', 'Rack of lamb with herbs', 'bake', 5, 'lamb garlic mint potato', 'carrot'],
    ['wellington', '惠灵顿牛排', 'Beef Wellington', 'bake', 5, 'beef @mushroom flour butter @egg'],
    ['seafood_pot', '海鲜锅', 'Seafood pot', 'boil', 5, 'crab shrimp clam tofu cabbage'],
    ['truffle_steak', '松露牛排', 'Truffle steak', 'fry', 5, 'beef truffle butter', 'garlic'],
    ['bouillabaisse', '马赛鱼汤', 'Bouillabaisse', 'boil', 4, '@fish shrimp tomato onion garlic'],
    ['orange_roast_duck', '香橙烤鸭', 'Roast duck with orange', 'bake', 4, 'duck orange honey ginger'],
    ['roast_venison', '烤鹿腿', 'Roast venison', 'bake', 4, 'venison garlic potato carrot'],
    ['crab_noodle', '蟹肉面', 'Crab noodles', 'boil', 4, 'noodle crab ginger scallion'],
    ['mushroom_risotto', '野菌烩饭', 'Wild mushroom risotto', 'boil', 4, 'rice porcini chanterelle butter cheese'],
    ['surf_turf', '海陆双拼', 'Surf and turf', 'grill', 5, 'beef lobster butter', 'garlic lemon'],
    ['farm_breakfast', '农场早餐', 'Farm breakfast', 'fry', 4, '@egg bacon bread tomato', '@mushroom'],
    ['fruit_layer_cake', '鲜果千层', 'Fresh fruit layer cake', 'bake', 4, 'flour @egg milk strawberry orange', 'butter'],
    ['lobster_bisque', '龙虾浓汤', 'Lobster bisque', 'boil', 5, 'lobster milk butter onion'],
    ['tuna_bowl', '金枪鱼盖饭', 'Tuna rice bowl', 'boil', 4, 'rice tuna scallion', '@egg'],
    ['harvest_stew', '丰收炖菜', 'Harvest stew', 'boil', 4, 'pumpkin potato carrot corn bean'],
  ]),
];

export const DISH: Readonly<Record<string, DishDef>> = Object.fromEntries(DISHES.map((d) => [d.id, d]));
