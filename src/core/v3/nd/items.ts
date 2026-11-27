/**
 * The ND kinds (docs/ND/PLAN.md): Nomad Drive's furniture, its instant camera and film and the prints it makes, its
 * coffee machine with its bags of coffee and mugs, its plant pot with four kinds of seed and what they grow into,
 * its grinder, its water can, bucket and hand pump — as rows of the catalogue (core/modcar/items.ts), registered once by whichever ND module is loaded
 * first (registerNdItems). Their sizes are Nomad Drive's (the research's 227 items); what they give is its values in
 * ours: its crisps' 25 food are our prawn crackers' 20, so a fruit's food is four fifths of its own (Apple 8 → 6,
 * Tomato 6 → 5, Potato 5 → 4, Watermelon 15 → 12). Pure: no three, no DOM.
 */
import { hasItem, hasItemCat, registerItemCat, registerItems, type ItemRow, retireItem } from '../../modcar/items';
import { ND_BATTERY } from './battery';
import { TAPES } from './tapes';
import { ND_BUCKET, ND_PUMP, ND_WATER_CAN } from './water';

// ------------------------------------------------------------------ ids

export const ND_TABLE = 'nd_table';
export const ND_CHAIR = 'nd_chair';
export const ND_SOFA = 'nd_sofa';
export const ND_BOOKSHELF = 'nd_bookshelf';
export const ND_FRIDGE = 'nd_fridge';
export const ND_KITCHEN_STAND = 'nd_kitchen_stand';
export const ND_TOP_CABINET = 'nd_top_cabinet';
/** ND5's (the motel's, the commune's, the camp's, the starter house's): tools/blender/items/nd_home2.py */
export const ND_NIGHTSTAND = 'nd_nightstand';
export const ND_CHAIR_FOLD = 'nd_chair_fold';
export const ND_DINNER_TABLE = 'nd_dinner_table';
export const ND_DINNER_CHAIR = 'nd_dinner_chair';
export const ND_STOOL = 'nd_stool';
export const ND_SOFA_2 = 'nd_sofa_2';
export const ND_WC = 'nd_wc';
export const ND_WALL_SHELF = 'nd_wall_shelf';
export const ND_CABINET = 'nd_cabinet';
/** furniture for a home on wheels (docs/V3/plan/finish.md §十一 2): a tool board and a rod rack for the wall, a workbench */
export const ND_PEGBOARD = 'nd_pegboard';
export const ND_ROD_RACK = 'nd_rod_rack';
export const ND_WORKBENCH = 'nd_workbench';
/** a folding camp cot (docs/V3/plan/rv.md R3: our own, a bed to put in a motorhome): tools/blender/items/nd_home.py */
export const ND_COT = 'nd_cot';

/** a filling station's nozzle (ND5): in the hands only while it is off its pump's holster (v3/nd-fuel) */
export const ND_NOZZLE = 'nd_nozzle';

export const ND_CAMERA = 'nd_camera';
export const ND_FILM = 'nd_film_pack';
export const ND_PHOTO = 'nd_photo';

export const ND_COFFEE_MACHINE = 'nd_coffee_machine';
export const ND_COFFEE_PACK = 'nd_coffee_pack';
export const ND_MUG = 'nd_mug';

export const ND_POT = 'nd_plant_pot';
export const ND_PLANTER = 'nd_planter';
export const ND_GRINDER = 'nd_grinder';

/**
 * The crops (docs/V3/plan/finish.md §八 2: the garden's sixteen, and the apple there was from the first): each its packet
 * of seeds' colour, how hard the seeds are to come by (1–3), and how many it bears. Nomad Drive's four first, as they were.
 */
const CROP_ROWS = {
  apple: ['苹果', 'Apple', 2, 4, 0xc8372f],
  potato: ['土豆', 'Potato', 1, 4, 0xb8915c],
  tomato: ['番茄', 'Tomato', 1, 4, 0xd8452e],
  watermelon: ['西瓜', 'Watermelon', 3, 1, 0x2f6b34],
  carrot: ['胡萝卜', 'Carrot', 1, 4, 0xe8822a],
  onion: ['洋葱', 'Onion', 1, 3, 0xc88a45],
  cabbage: ['卷心菜', 'Cabbage', 1, 1, 0xbfd98a],
  cucumber: ['黄瓜', 'Cucumber', 1, 3, 0x7fb85a],
  corn: ['玉米', 'Maize', 1, 2, 0xf2cf4a],
  lettuce: ['生菜', 'Lettuce', 1, 2, 0x9fd06a],
  garlic: ['大蒜', 'Garlic', 1, 3, 0xf0e8d8],
  pepper: ['青椒', 'Green pepper', 2, 3, 0x5fa84a],
  eggplant: ['茄子', 'Aubergine', 2, 2, 0x6a3f8a],
  pumpkin: ['南瓜', 'Pumpkin', 2, 1, 0xe89a2e],
  broccoli: ['西兰花', 'Broccoli', 2, 1, 0x4f8f3a],
  chili: ['辣椒', 'Chilli', 2, 4, 0xd6281e],
  strawberry: ['草莓', 'Strawberry', 2, 4, 0xe0304a],
} as const satisfies Record<string, readonly [zh: string, en: string, stars: number, bears: number, paint: number]>;
export type CropId = keyof typeof CROP_ROWS;
export const CROP_IDS = Object.keys(CROP_ROWS) as CropId[];
/** each crop's name, how hard its seeds are to come by and how many it bears at a time */
export const CROP_INFO: Readonly<Record<CropId, { zh: string; en: string; stars: number; bears: number; paint: number }>> = Object.fromEntries(
  CROP_IDS.map((id) => [id, { zh: CROP_ROWS[id][0], en: CROP_ROWS[id][1], stars: CROP_ROWS[id][2], bears: CROP_ROWS[id][3], paint: CROP_ROWS[id][4] }]),
) as Record<CropId, { zh: string; en: string; stars: number; bears: number; paint: number }>;
/** the crops' seeds and what they bear */
export const ND_SEEDS = Object.fromEntries(CROP_IDS.map((id) => [id, `nd_seeds_${id}`])) as { readonly [K in CropId]: `nd_seeds_${K}` };
/** what each bears: the kitchen's own ingredients (docs/V3/plan/growth.md §三: one of each) */
export const ND_FRUIT = Object.fromEntries(CROP_IDS.map((id) => [id, `ing_${id}`])) as { readonly [K in CropId]: `ing_${K}` };

// ------------------------------------------------------------------ categories

/** furniture, the garden, photography, keepsakes: after the kitchen in the catalogue's order */
export const ND_CATS = [
  { id: 'furniture', name: { zh: '家具', en: 'Furniture' }, order: 17 },
  { id: 'garden', name: { zh: '种植', en: 'Garden' }, order: 18 },
  { id: 'photo', name: { zh: '摄影', en: 'Photography' }, order: 19 },
  { id: 'collect', name: { zh: '收藏', en: 'Keepsakes' }, order: 20 },
] as const;

const EAT = 3.9;
/**
 * How the furniture is carried (Nomad Drive: no slower than with empty hands up to 5 kg of its weights, above that
 * 1 − (m − 5)/45.15 × 0.899 of the speed and no running from 10 kg): all of it at a walk as quick as ever, the
 * kitchen stand (its 10 kg) a tenth slower and not run with.
 */
const FREE = { share: 1, run: true } as const;
const HEAVY = { share: 0.9, run: false } as const;
/** taking pills (the game's own), opening a first-aid box and seeing to oneself (s) */
const PILL_S = 2.2;
const KIT_S = 4.5;
/**
 * How long food keeps (game hours): Nomad Drive's is a hundredth of its freshness a game minute, found 80 to 100 %
 * fresh (fruit) or 60 to 100 % (what comes packed) — some 150 hours and 133 on the whole.
 */
const FRESH_H = 150;
const PACKED_H = 133;

/** the rows (the kitchen's things go into the kitchen when the appliances module has brought it, else the garden's neighbour, furniture) */
export function ndItemRows(kitchen: string): ItemRow[] {
  return [
    // ---------------------------------------------------------------- furniture
    { id: ND_TABLE, cat: 'furniture', carryWalk: FREE, name: { zh: '农家餐桌', en: 'Farmhouse table' }, stars: 1, mass: 16, carry: 'large', salvage: { scrap: 2 }, blurb: '桌面是五块厚木板，两头压着横档，抽屉里偶尔还剩点小东西。', paint: 0x7f9a86, paint2: 0xe9dcc0 },
    { id: ND_CHAIR, cat: 'furniture', carryWalk: FREE, name: { zh: '梯背椅', en: 'Ladder-back chair' }, stars: 1, mass: 4.5, carry: 'medium', salvage: {}, blurb: '三根弯横档的老木椅，草编的坐面磨得发亮。', paint: 0xb08a5a, paint2: 0xc9a86a },
    { id: ND_SOFA, cat: 'furniture', carryWalk: FREE, name: { zh: '双人沙发', en: 'Two-seat sofa' }, stars: 2, mass: 32, carry: 'large', salvage: { scrap: 4 }, blurb: '圆扶手的双人沙发，坐下去就不想起来。', paint: 0x7b8f6a, paint2: 0xd9b26a },
    { id: ND_BOOKSHELF, cat: 'furniture', carryWalk: FREE, name: { zh: '书架', en: 'Bookshelf' }, stars: 1, mass: 24, carry: 'large', salvage: {}, blurb: '刷过漆的旧书架，上一家人的书都还在。', paint: 0xe6d6b4, paint2: 0x8a5a3c },
    { id: ND_FRIDGE, cat: 'furniture', carryWalk: FREE, name: { zh: '圆顶冰箱', en: 'Round-top fridge' }, stars: 3, mass: 48, carry: 'large', salvage: { scrap: 18, components: 6 }, blurb: '圆顶的老冰箱，门一拉就开。放进去的吃的坏得慢四倍。', paint: 0xe9e2cf, paint2: 0x6c8fae, holds: { slots: 12, accepts: ['*'], maxKg: 30, decay: 0.25 } },
    { id: ND_KITCHEN_STAND, cat: 'furniture', carryWalk: HEAVY, name: { zh: '橱柜', en: 'Kitchen stand' }, stars: 2, mass: 38, carry: 'large', salvage: { scrap: 4 }, blurb: '两门两抽屉的厨房矮柜，台面是一整块砧板木。', paint: 0x8fb0a6, paint2: 0xf1e8d4 },
    { id: ND_TOP_CABINET, cat: 'furniture', carryWalk: FREE, name: { zh: '吊柜', en: 'Wall cabinet' }, stars: 1, mass: 12, carry: 'large', salvage: {}, blurb: '玻璃门的厨房吊柜，挂在墙上。', paint: 0x8fb0a6, paint2: 0xf1e8d4 },
    { id: ND_COT, cat: 'furniture', carryWalk: FREE, name: { zh: '折叠床', en: 'Camp cot' }, stars: 1, mass: 9, carry: 'large', salvage: { scrap: 4 }, blurb: '铝架帆布的行军床，打开铺在车厢里就是一张床：困了长按，在上面睡一觉，和床一样快。', paint: 0x557a46, paint2: 0xede3c8 },
    { id: ND_NIGHTSTAND, cat: 'furniture', carryWalk: FREE, name: { zh: '床头柜', en: 'Nightstand' }, stars: 1, mass: 8, carry: 'medium', salvage: {}, blurb: '一个抽屉、一层隔板的小床头柜，台面上放得下一盏灯。拉开抽屉，里面放得下几样小东西。', paint: 0x8fb0a6, paint2: 0xe9dcc0, holds: { slots: 3, accepts: ['*'], maxKg: 2.5, shut: true } },
    { id: ND_CHAIR_FOLD, cat: 'furniture', carryWalk: FREE, name: { zh: '折叠椅', en: 'Folding chair' }, stars: 1, mass: 3.5, carry: 'medium', salvage: { scrap: 2 }, blurb: '铝管帆布的露营折叠椅，扶手上带个杯托。', paint: 0x3e7f96, paint2: 0x5a5f66 },
    { id: ND_DINNER_TABLE, cat: 'furniture', carryWalk: FREE, name: { zh: '方餐桌', en: 'Kitchen table' }, stars: 1, mass: 9, carry: 'large', salvage: {}, blurb: '铺着格子油布的小方桌，四个人挤一挤也能吃饭。', paint: 0xd8673a, paint2: 0xe9dcc0 },
    { id: ND_DINNER_CHAIR, cat: 'furniture', carryWalk: FREE, name: { zh: '餐椅', en: 'Kitchen chair' }, stars: 1, mass: 3, carry: 'medium', salvage: { scrap: 1 }, blurb: '弯木靠背的圆座椅子。', paint: 0x8a5a3c, paint2: 0xc8372f },
    { id: ND_STOOL, cat: 'furniture', carryWalk: FREE, name: { zh: '圆凳', en: 'Stool' }, stars: 1, mass: 2, carry: 'medium', salvage: {}, blurb: '三条腿的高圆凳，脚底下有个铁环。', paint: 0xe8a23a, paint2: 0x8a5a3c },
    { id: ND_SOFA_2, cat: 'furniture', carryWalk: FREE, name: { zh: '木框沙发', en: 'Wooden-frame sofa' }, stars: 2, mass: 28, carry: 'large', salvage: { scrap: 2 }, blurb: '方方正正的木框沙发，靠垫上钉着扣子。', paint: 0xc4973f, paint2: 0x6b4a2f },
    { id: ND_WC, cat: 'furniture', carryWalk: FREE, name: { zh: '马桶', en: 'Toilet' }, stars: 1, mass: 25, carry: 'large', salvage: { scrap: 4 }, blurb: '高水箱的老式马桶，拉绳一拉哗啦一声。能坐。', paint: 0xf1ece0, paint2: 0x8a5a3c },
    { id: ND_WALL_SHELF, cat: 'furniture', carryWalk: FREE, name: { zh: '壁挂置物架', en: 'Wall shelf' }, stars: 1, mass: 2.5, carry: 'medium', salvage: {}, blurb: '两层木板的挂墙架子，挂到车厢墙上放杯子、磁带正好。', paint: 0x7d977a, paint2: 0x6b4a2f },
    { id: ND_CABINET, cat: 'furniture', carryWalk: FREE, name: { zh: '双门柜', en: 'Cupboard' }, stars: 1, mass: 22, carry: 'large', salvage: {}, blurb: '两扇门的矮柜，里面一层隔板，台面能放东西。', paint: 0x6c8fae, paint2: 0xf1e8d4 },
    { id: ND_PEGBOARD, cat: 'furniture', carryWalk: FREE, name: { zh: '工具挂板', en: 'Tool board' }, stars: 2, mass: 4, carry: 'medium', salvage: { scrap: 3 }, blurb: '挂到车厢墙上的洞洞板：撬棍、铁锹、探测器、清理铲、手电筒、打磨机各有一个钩子。', paint: 0xd9c9a3, paint2: 0x8a5a3c },
    { id: ND_ROD_RACK, cat: 'furniture', carryWalk: FREE, name: { zh: '鱼竿架', en: 'Rod rack' }, stars: 2, mass: 1.5, carry: 'medium', salvage: { scrap: 2 }, blurb: '挂在车厢墙上的竿架，三根鱼竿横着搁在上面。', paint: 0x6b4a2f, paint2: 0xd9c9a3 },
    { id: ND_WORKBENCH, cat: 'furniture', carryWalk: FREE, name: { zh: '车载工作台', en: 'Van workbench' }, stars: 3, mass: 34, carry: 'large', salvage: { scrap: 20 }, blurb: '带台钳和灯的小工作台。放进有电的车里，路上也能照学会的图纸做东西。', paint: 0x4f6f8a, paint2: 0xb98a5a },
    // ---------------------------------------------------------------- photography
    { id: ND_CAMERA, cat: 'photo', name: { zh: '拍立得相机', en: 'Instant camera' }, stars: 4, mass: 0.6, carry: 'small', salvage: { scrap: 4, components: 1 }, blurb: '一台拍立得，照片十二秒显影。', paint: 0xe9e1cd, paint2: 0x3a3d42 },
    { id: ND_FILM, cat: 'photo', name: { zh: '拍立得相纸', en: 'Instant film' }, stars: 2, mass: 0.15, carry: 'small', salvage: {}, blurb: '一盒十张的相纸。', paint: 0x2e4a6b, paint2: 0xf0e8d6 },
    { id: ND_PHOTO, cat: 'photo', name: { zh: '照片', en: 'Photo' }, stars: 0, mass: 0.01, carry: 'small', salvage: {}, blurb: '一张拍立得照片，能贴在墙上、车上。', paint: 0xf3efe6, paint2: 0x2f3236 },
    // ---------------------------------------------------------------- the kitchen
    { id: ND_COFFEE_MACHINE, cat: kitchen, name: { zh: '咖啡机', en: 'Coffee machine' }, stars: 3, mass: 3, carry: 'medium', salvage: { scrap: 8 }, blurb: '咖啡豆倒进去，磨好煮好，流进下面的壶或杯子里。', paint: 0xc8473d, paint2: 0x2f3236 },
    { id: ND_COFFEE_PACK, cat: kitchen, name: { zh: '咖啡豆', en: 'Coffee beans' }, stars: 2, mass: 0.25, carry: 'small', salvage: {}, blurb: '一袋咖啡豆，能煮一升。', paint: 0x8a5a3c, paint2: 0xe9d8b4 },
    // (the coffee machine's pot: under its spout it fills, poured into a mug — docs/V3/plan/growth.md §一 4)
    { id: 'coffee_pot', cat: kitchen, name: { zh: '咖啡壶', en: 'Coffee pot' }, stars: 1, mass: 0.4, carry: 'small', salvage: { scrap: 1 }, blurb: '一升的玻璃咖啡壶，提神暖身。', paint: 0x2f3236, paint2: 0xc8323a, drink: { litres: 1, liquid: 'coffee', rate: 0.06, empty: true } },
    { id: ND_MUG, cat: kitchen, name: { zh: '搪瓷杯', en: 'Enamel mug' }, stars: 1, mass: 0.3, carry: 'small', salvage: { scrap: 1 }, blurb: '一个搪瓷马克杯。', paint: 0x3e7f96, paint2: 0xf1ece0, drink: { litres: 0.35, liquid: 'coffee', rate: 0.1, empty: true } },
    // (frying, Nomad Drive's stoves, pans and meat: the kitchen's — docs/V3/plan/growth.md §三)
    // ---------------------------------------------------------------- the garden
    { id: ND_POT, cat: 'garden', name: { zh: '花盆', en: 'Plant pot' }, stars: 3, mass: 6, carry: 'medium', salvage: { scrap: 1 }, blurb: '陶土花盆，土已经备好。种下去，白天晒着太阳长，一两天能收；土里的一升水够它长一刻钟，干了就停着等你。收完还会再结。', paint: 0xc0673f, paint2: 0xe8d6b0 },
    { id: ND_PLANTER, cat: 'garden', name: { zh: '种植箱', en: 'Planter box' }, stars: 3, mass: 11, carry: 'medium', salvage: { scrap: 2 }, blurb: '长条的木箱，土已经备好，一箱能种三棵。放在房车窗边、车顶行李架上都行；浇一次水，三棵一起喝。', paint: 0x7a8f5a, paint2: 0xe8d6b0 },
    ...CROP_IDS.map(
      (id): ItemRow => ({
        id: ND_SEEDS[id],
        cat: 'garden',
        name: { zh: `${CROP_INFO[id].zh}种子`, en: `${CROP_INFO[id].en} seeds` },
        stars: CROP_INFO[id].stars,
        mass: 0.05,
        carry: 'small',
        salvage: {},
        model: 'nd_seed_packet',
        blurb: `一包${CROP_INFO[id].zh}种子，种在花盆里，一次结${['', '一', '两', '三', '四'][CROP_INFO[id].bears]}个${CROP_INFO[id].zh}，收完还会再结。`,
        paint: CROP_INFO[id].paint,
        paint2: 0xf1e6c8,
      }),
    ),
    // ---------------------------------------------------------------- water (core/v3/nd/water.ts: they are found a quarter to wholly full)
    { id: ND_WATER_CAN, cat: 'gear', name: { zh: '储水罐', en: 'Water can' }, stars: 2, mass: 1.2, carry: 'medium', salvage: { scrap: 1 }, blurb: '十五升的蓝色储水罐；渴了直接对嘴喝。', paint: 0x3d78b0, paint2: 0xf1ece0, drink: { litres: 15, liquid: 'water', rate: 0.1, empty: true } },
    { id: ND_BUCKET, cat: 'gear', name: { zh: '水桶', en: 'Bucket' }, stars: 2, mass: 1.1, carry: 'medium', salvage: { scrap: 2 }, blurb: '十升的搪瓷水桶。放在露天、头顶没遮挡，下雨就慢慢接满（大雨四分钟）。拿着它能接水、倒水，也能直接喝。', paint: 0xe9e1cd, paint2: 0x3e6f8f, drink: { litres: 10, liquid: 'water', rate: 0.1, empty: true } },
    { id: ND_PUMP, cat: 'furniture', name: { zh: '手压水泵', en: 'Hand pump' }, stars: 0, mass: 60, carry: 'large', salvage: { scrap: 12 }, blurb: '老式铸铁手压泵，井里还剩些水，抽完就没了。', paint: 0x3f6b4f, paint2: 0xc89a46 },
    // ---------------------------------------------------------------- food, drink, medicine (Nomad Drive's: its food at our four fifths, its water as it is — 100 a litre in both)
    { id: 'nd_baked_beans', cat: 'food', name: { zh: '茄汁焗豆', en: 'Baked beans' }, stars: 2, mass: 0.45, carry: 'small', salvage: { scrap: 1 }, model: 'nd_tin_beans', blurb: '一罐茄汁焗豆，拉环一拉就能吃，顶饿。', paint: 0xd8673a, paint2: 0x3e7f96, eat: { food: 20, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_tomato_soup', cat: 'food', name: { zh: '番茄汤', en: 'Tomato soup' }, stars: 2, mass: 0.42, carry: 'small', salvage: { scrap: 1 }, model: 'nd_tin_soup', blurb: '一罐浓番茄汤，冷着喝也不错。', paint: 0xc8372f, paint2: 0xf1e6c8, eat: { food: 16, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_tuna', cat: 'food', name: { zh: '金枪鱼罐头', en: 'Tin of tuna' }, stars: 2, mass: 0.2, carry: 'small', salvage: { scrap: 1 }, model: 'nd_tin_tuna', blurb: '扁扁的一罐金枪鱼，油浸的，香。', paint: 0x3e6f8f, paint2: 0xf0c23c, eat: { food: 20, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_cereal', cat: 'food', name: { zh: '麦片', en: 'Cereal' }, stars: 2, mass: 0.4, carry: 'small', salvage: {}, blurb: '一盒早餐麦片，干嚼也香。', paint: 0xe8a23a, paint2: 0x3e7f96, eat: { food: 20, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_chocolate_1', cat: 'food', name: { zh: '巧克力', en: 'Chocolate' }, stars: 1, mass: 0.1, carry: 'small', salvage: {}, model: 'nd_chocolate', blurb: '一条牛奶巧克力，金纸包着，路上嘴馋就来一口。', paint: 0x7a3b2e, paint2: 0xe8c25a, eat: { food: 12, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_mushroom', cat: 'food', name: { zh: '野蘑菇', en: 'Wild mushrooms' }, stars: 0, mass: 0.15, carry: 'small', salvage: {}, blurb: '路边采来的一丛红伞蘑菇，看着挺肥。吃了顶饿，可肚子要遭罪——有药就好。', paint: 0xb8573a, paint2: 0xefe4cc, eat: { food: 16, hp: 0, sec: EAT, effect: 'sick2' }, perish: { hours: PACKED_H } },
    { id: 'nd_peanut_butter', cat: 'food', name: { zh: '花生酱', en: 'Peanut butter' }, stars: 2, mass: 0.4, carry: 'small', salvage: {}, model: 'nd_peanut_jar', blurb: '一罐花生酱，没有面包，就用手指挖着吃。', paint: 0xb8783a, paint2: 0xc8372f, eat: { food: 16, hp: 1, sec: EAT }, perish: { hours: PACKED_H } },
    { id: 'nd_pills', cat: 'med', name: { zh: '肠胃药', en: 'Stomach pills' }, stars: 2, mass: 0.08, carry: 'small', salvage: {}, blurb: '一小瓶肠胃药：吃坏了肚子就吃两粒，一会儿就好。', paint: 0xd88a3a, paint2: 0xf3efe6, eat: { food: 0, hp: 0, sec: PILL_S }, heal: { hp: 0, cure: true } },
    { id: 'nd_first_aid', cat: 'med', name: { zh: '急救箱', en: 'First-aid box' }, stars: 3, mass: 1.2, carry: 'small', salvage: { scrap: 2 }, blurb: '红色的急救箱。打开用掉，养回 30 点健康；带在身上，倒下时会自己用上，救你一次。', paint: 0xc8372f, paint2: 0xf3efe6, eat: { food: 0, hp: 0, sec: KIT_S }, heal: { hp: 0, cap: 30 }, revive: { hp: 30 } },
    // ---------------------------------------------------------------- ND3: the tools (core/v3/nd/flashlight.ts, dig.ts, pry.ts …)
    { id: 'nd_flashlight', cat: 'gear', name: { zh: '手电筒', en: 'Flashlight' }, stars: 3, mass: 0.6, carry: 'small', salvage: { scrap: 3, components: 1 }, blurb: '大号手电筒，能聚光照远。一节电池亮四分多钟。', paint: 0xc8372f, paint2: 0x2f3236 },
    { id: 'nd_shovel', cat: 'gear', name: { zh: '铁锹', en: 'Shovel' }, stars: 2, mass: 2.2, carry: 'large', salvage: { scrap: 4 }, blurb: '圆头铁锹。埋着箱子的地方，挖四锹就露出来。', paint: 0x5d8a34, paint2: 0x8a5a3c },
    { id: 'nd_metal_detector', cat: 'gear', name: { zh: '金属探测器', en: 'Metal detector' }, stars: 4, mass: 1.6, carry: 'large', salvage: { scrap: 6, components: 4 }, blurb: '拿在手里就开着：三十米内埋着东西它就滴滴响，越近响得越急，到了正上方变成长音。', paint: 0xe8a23a, paint2: 0x2f3236 },
    { id: 'nd_crowbar', cat: 'gear', name: { zh: '撬棍', en: 'Crowbar' }, stars: 3, mass: 1.4, carry: 'medium', salvage: { scrap: 5 }, blurb: '撬开卡住或锁着的门和盖子。撬五次就断了。', paint: 0xc8372f, paint2: 0x2f3236 },
    { id: 'nd_compass', cat: 'gear', name: { zh: '指南针', en: 'Compass' }, stars: 2, mass: 0.3, carry: 'small', salvage: { scrap: 2 }, blurb: '木盒子里的铜指南针。拿在手里盖子就弹开，指针总是指着北。', paint: 0xc89a46, paint2: 0x2f3236 },
    { id: 'nd_engine_kit', cat: 'gear', name: { zh: '引擎修理包', en: 'Engine repair kit' }, stars: 3, mass: 2.4, carry: 'medium', salvage: { scrap: 6 }, blurb: '一次性的引擎修理包，修好一半（+50）。', paint: 0xc8372f, paint2: 0xf0c23c },
    { id: 'nd_tire_kit', cat: 'gear', name: { zh: '轮胎修理包', en: 'Tyre repair kit' }, stars: 2, mass: 1.8, carry: 'medium', salvage: { scrap: 4 }, blurb: '一次性的补胎工具，修好一半（+50）。', paint: 0x3e6f8f, paint2: 0xf0c23c },
    { id: ND_NOZZLE, cat: 'gear', name: { zh: '加油枪', en: 'Fuel nozzle' }, stars: 0, mass: 1.2, carry: 'small', salvage: {}, blurb: '加油机的油枪，油管长八米，一秒两升。', paint: 0x2f3236, paint2: 0xefe6cf },
    { id: 'nd_charger', cat: 'gear', name: { zh: '电瓶充电器', en: 'Battery charger' }, stars: 3, mass: 2.6, carry: 'medium', salvage: { scrap: 5, components: 1 }, blurb: '一次性的充电器，给汽车电瓶充进 65% 的电。', paint: 0xe8a23a, paint2: 0x2f3236 },
    { id: 'nd_chest_1', cat: 'furniture', carryWalk: FREE, name: { zh: '宝箱', en: 'Treasure chest' }, stars: 3, mass: 5, carry: 'large', salvage: { scrap: 4 }, blurb: '从土里挖出来的木箱，箍着铁条，挂着锁。要一把钥匙才打得开；锁着的也能搬走。', paint: 0x8a5a3c, paint2: 0x5a5f66, holds: { slots: 16, accepts: ['*'], maxKg: 40 } },
    { id: 'nd_chest_2', cat: 'furniture', carryWalk: FREE, name: { zh: '稀有宝箱', en: 'Rare treasure chest' }, stars: 4, mass: 5, carry: 'large', salvage: { scrap: 6 }, blurb: '漆成蓝色、镶着铜钉的箱子，要一把稀有钥匙。', paint: 0x3e5f8f, paint2: 0xd8b04a, holds: { slots: 16, accepts: ['*'], maxKg: 40 } },
    { id: 'nd_key_1', cat: 'gear', name: { zh: '钥匙', en: 'Key' }, stars: 2, mass: 0.05, carry: 'small', salvage: { scrap: 1 }, blurb: '一把旧铁钥匙。能开埋着的宝箱，也能开锁着的门；用一次就留在锁里了。', paint: 0x6f7a82, paint2: 0x5a5f66 },
    { id: 'nd_key_2', cat: 'gear', name: { zh: '稀有钥匙', en: 'Rare key' }, stars: 4, mass: 0.05, carry: 'small', salvage: { scrap: 2 }, blurb: '一把镶着红石头的铜钥匙，开稀有宝箱用。', paint: 0xd8b04a, paint2: 0xc8372f },
    { id: 'nd_polisher', cat: 'gear', name: { zh: '抛光机', en: 'Polisher' }, stars: 4, mass: 2.6, carry: 'medium', salvage: { scrap: 9, components: 3 }, blurb: '充电式抛光机，让褪色发乌的漆面亮起来。满电 125，一节电池加 100。', paint: 0x3e7fb0, paint2: 0x2f3236 },
    // ---------------------------------------------------------------- tools
    { id: ND_BATTERY, cat: 'gear', name: { zh: '电池', en: 'Battery' }, stars: 1, mass: 0.4, carry: 'small', salvage: { scrap: 1 }, blurb: '一节大号电池，给打磨机、抛光机或手电充进 100 的电（没电了才换得上）。', paint: 0x2f6b4f, paint2: 0xe8d36a },
    { id: ND_GRINDER, cat: 'gear', name: { zh: '打磨机', en: 'Grinder' }, stars: 4, mass: 2.4, carry: 'medium', salvage: { scrap: 10, components: 3 }, blurb: '充电式角磨机，锈一磨就掉；慢慢磨比飞快划过去管用。满电能转三分多钟。', paint: 0xe0a23a, paint2: 0x2f3236 },
    // ---------------------------------------------------------------- keepsakes: the tapes (core/v3/nd/tapes.ts)
    ...TAPES.map((t): ItemRow => ({ id: t.id, cat: 'collect', name: { zh: `磁带《${t.title}》`, en: `Tape: ${t.title}` }, stars: 2, mass: 0.06, carry: 'small', salvage: { scrap: 1 }, model: 'nd_cassette', blurb: `一盘磁带，标签上手写着《${t.title}》。坐在车里拿着它看着卡带机，按住左键放进去。`, paint: t.shell, paint2: t.label, tags: ['tape'] })),
    // ---------------------------------------------------------------- keepsakes: the bobbleheads (only ever in buried chests, one of each), a plate, a frame, a wooden hand
    { id: 'nd_bobble_1', cat: 'collect', name: { zh: '摇头狐狸', en: 'Bobblehead fox' }, stars: 4, mass: 0.15, carry: 'small', salvage: {}, blurb: '弹簧上顶着一个大脑袋的小狐狸。摆在仪表台上，车一动它就点头晃脑。', paint: 0xe07a2e, paint2: 0x3a3d42, tags: ['bobble'] },
    { id: 'nd_bobble_2', cat: 'collect', name: { zh: '摇头青蛙', en: 'Bobblehead frog' }, stars: 4, mass: 0.15, carry: 'small', salvage: {}, blurb: '戴草帽的青蛙，咧着嘴笑。摆在仪表台上，过个坑它就跟着蹦。', paint: 0x6fae4a, paint2: 0xd8b04a, tags: ['bobble'] },
    { id: 'nd_bobble_3', cat: 'collect', name: { zh: '摇头小熊', en: 'Bobblehead bear' }, stars: 4, mass: 0.15, carry: 'small', salvage: {}, blurb: '戴鸭舌帽的小熊，抱着圆肚子。转弯的时候它的脑袋往外甩。', paint: 0x8a5a3c, paint2: 0xc8372f, tags: ['bobble'] },
    { id: 'nd_bobble_4', cat: 'collect', name: { zh: '摇头小猫', en: 'Bobblehead cat' }, stars: 4, mass: 0.15, carry: 'small', salvage: {}, blurb: '系着铃铛项圈的灰猫。一刹车它就冲你点头。', paint: 0x7d8a96, paint2: 0xe86ab0, tags: ['bobble'] },
    { id: 'nd_plate', cat: 'collect', name: { zh: '车牌', en: 'Licence plate' }, stars: 1, mass: 0.4, carry: 'small', salvage: { scrap: 2 }, blurb: '一块旧车牌。每块的号码、地方和成色都不一样，有的很少见。挂到车厢墙上收着。', paint: 0xe9e2cf, paint2: 0x3e5f8f, tags: ['plate'] },
    { id: 'nd_frame', cat: 'furniture', carryWalk: FREE, name: { zh: '画框', en: 'Picture frame' }, stars: 2, mass: 1.2, carry: 'medium', salvage: {}, blurb: '木画框里镶着一幅画。挂到墙上，或者立在桌上。', paint: 0x8a5a3c, paint2: 0xf1e8d4 },
    { id: 'nd_wooden_hand', cat: 'furniture', carryWalk: FREE, name: { zh: '木头手模', en: 'Wooden hand' }, stars: 3, mass: 0.6, carry: 'small', salvage: {}, blurb: '画画用的木头手模，每根手指都能掰。没什么用，摆着好看。', paint: 0xc89a6a, paint2: 0x6b4a2f },
  ];
}

/** the kinds and their categories into the catalogue, once (the first ND module loaded does it) */
export function registerNdItems(): void {
  if (hasItem(ND_CAMERA)) return;
  // (the three chocolates were one and the same: one — docs/V3/plan/growth.md §三)
  retireItem('nd_chocolate_2', 'nd_chocolate_1');
  retireItem('nd_chocolate_3', 'nd_chocolate_1');
  // (thirteen medicines sorted into five — docs/V3/plan/finish.md §三.3: what a save holds of the others is the nearest)
  retireItem('med_pain_1', 'med_pain_2');
  retireItem('med_pain_3', 'med_pain_2');
  retireItem('med_warm_1', 'med_warm_2');
  retireItem('med_warm_3', 'med_warm_2');
  retireItem('med_stomach', 'nd_pills');
  for (const id of ['med_kit_1', 'med_kit_2', 'med_kit_3']) retireItem(id, 'nd_first_aid');
  for (const c of ND_CATS) if (!hasItemCat(c.id)) registerItemCat(c);
  registerItems(ndItemRows(hasItemCat('kitchen') ? 'kitchen' : 'furniture'));
}
