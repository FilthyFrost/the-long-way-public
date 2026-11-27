/**
 * The fishing module's things in the game's catalogue (docs/V3/plan/fishing.md): every fish one can catch, the
 * rods, the baits, the creel, and what comes up instead of a fish. Rows for core/modcar/items.ts, which the game's
 * module registers as it is loaded, and the helpers that read a thing as fishing sees it. Pure: nothing here
 * touches the page.
 *
 *   fish_<id>        each of the 110 fish (fish.ts), one thing a catch: its own length, weight, medal and colour
 *                    are on the thing (ItemState.fish), for two carp are not the same. It goes off in a day, as the
 *                    kitchen's fish do, into the kitchen's spoiled food; it does not stack.
 *   rod_<id>         the five rods (gear.ts RODS). A rod holds its bait: one stack of one kind (it accepts
 *                    '#bait'), so the bait rides on the rod and takes no slot of the hotbar. A small fish put on
 *                    its hook alive is on the rod itself (ItemState.rod.live), not a thing in it: a fish picked up
 *                    never goes onto a hook by itself. A rod retired since a save was written is read back as the
 *                    rod nearest it in power (rodItemNow).
 *   bait_<id>        the four baits, one to each rarity from common to epic, and the star bait (gear.ts BAITS): they
 *                    stack, a tin of worms, a spoon or two. A bait retired since a save was written is read back as
 *                    the bait of its rarity, one of no kind there is as the worm (baitItemNow).
 *   fishing_creel    holds the fish one catches (ten, fifteen kilograms), and keeps them a little longer.
 *   fishing_bottle   a drift bottle: a note in it (F reads it), now and then the star bait.
 *   fishing_crate    a crate off a wreck, nailed shut for years: things in it (Tab, as any box lying about).
 *   fishing_pearl, fishing_boot, fishing_can   what else comes up.
 *
 * A fish is drawn with a model of its own made in three.js (the module's fishModel.ts): `fish_<id>`, and for a fish
 * of a colour `fish_<id>@<variant>` (itemModelOf).
 */
import type { ItemInstance, ItemRow } from '../../../modcar/items';
import type { Ingredient } from '../../cooking/types';
import { SPOILED } from '../../kitchen/items';
import { FISH, kgOf } from './fish';
import { BAITS, baitIndexOf, ROD_RETIRED, RODS, STAR_TIER } from './gear';
import { SPOTS } from './spots';
import type { FishDef, Junk, Medal, Tier, Variant } from './types';

// ------------------------------------------------------------------ what the things carry on themselves

/** a fish caught: how big, which colour, how it was caught */
export interface FishItemState {
  /** length (cm) and weight (kg) */
  cm: number;
  kg: number;
  /** its weight against its kind's largest (0 … 1) */
  q: number;
  /** its colour (types.ts VARIANTS: 0 plain … 5 prism) and its medal (0 none … 4 diamond) */
  v: Variant;
  m: Medal;
  /** caught on a perfect strike */
  p?: 1;
  /** the first of its kind the angler ever landed; the biggest of its kind landed so far, when it was landed */
  first?: 1;
  rec?: 1;
}

/** a small fish on a rod's hook, alive (a lord's bait) */
export interface LiveBait {
  /** the fish's id (fish.ts) and its size and colour, as it was caught */
  f: string;
  cm: number;
  kg: number;
  q: number;
  v: Variant;
}

/** a rod: the fish on its hook, alive, when it has one (its bait is the thing in it: ItemInstance.inside) */
export interface RodItemState {
  live?: LiveBait;
}

declare module '../../../modcar/items' {
  interface ItemState {
    fish?: FishItemState;
    rod?: RodItemState;
  }
}

// ------------------------------------------------------------------ ids

export const FISH_CAT = { id: 'fish', name: { zh: '鱼', en: 'Fish' }, order: 7 } as const;
export const ROD_CAT = { id: 'rod', name: { zh: '鱼竿', en: 'Fishing rods' }, order: 8 } as const;
export const BAIT_CAT = { id: 'bait', name: { zh: '鱼饵', en: 'Bait' }, order: 9 } as const;
export const TACKLE_CAT = { id: 'tackle', name: { zh: '渔具', en: 'Tackle' }, order: 10 } as const;
export const FLOTSAM_CAT = { id: 'flotsam', name: { zh: '水里捞上来的', en: 'Out of the water' }, order: 11 } as const;

export const CREEL = 'fishing_creel';
export const BOTTLE = 'fishing_bottle';
export const CRATE = 'fishing_crate';
export const PEARL = 'fishing_pearl';
export const BOOT = 'fishing_boot';
export const CAN = 'fishing_can';

/** what comes up instead of a fish (session.ts Junk) as a thing */
export const JUNK_ITEM: Readonly<Record<Junk, string>> = { boot: BOOT, can: CAN, bottle: BOTTLE, crate: CRATE, pearl: PEARL };

/** the tag every bait carries: what a rod holds */
export const BAIT_TAG = 'bait';
/** the tag of the kinds that go onto a hook alive (small fish, and every fish a lord takes) */
export const LIVE_TAG = 'livebait';

export const fishItem = (i: number): string => `fish_${FISH[i].id}`;
export const baitItem = (i: number): string => `bait_${BAITS[i].id}`;
export const rodItem = (i: number): string => RODS[i].id;

const FISH_OF = new Map<string, number>(FISH.map((f, i) => [`fish_${f.id}`, i]));
const ROD_OF = new Map<string, number>(RODS.map((r, i) => [r.id, i]));
const BAIT_OF = new Map<string, number>(BAITS.map((b, i) => [`bait_${b.id}`, i]));

/**
 * Bait out of the larder (docs/V3/plan/finish.md §九: bread and maize do as a common bait): what a loaf or a cob is
 * pulled apart into, and how many pinches of it. In the rules each is the common bait (the worm) under its own name.
 */
export const PANTRY_BAIT: Readonly<Record<string, { bait: string; n: number }>> = {
  ing_bread: { bait: 'bait_bread', n: 12 },
  ing_corn: { bait: 'bait_kernels', n: 16 },
};
const PANTRY_ROWS = [
  ['bait_bread', '面包团', 'Bread paste', 0xd9b47a, 0xf1e6c8],
  ['bait_kernels', '玉米粒', 'Sweetcorn', 0xf2cf4a, 0x6f9a3c],
] as const;
for (const [id] of PANTRY_ROWS) BAIT_OF.set(id, Math.max(0, BAITS.findIndex((b) => b.id === 'worm')));

/** the fish (index into FISH) a kind of thing is; −1: it is no fish */
export function fishOfItem(id: string): number {
  return FISH_OF.get(id) ?? -1;
}

/** the rod (index into RODS) a kind of thing is; −1: none */
export function rodOfItem(id: string): number {
  return ROD_OF.get(id) ?? -1;
}

/** the bait (index into BAITS) a kind of thing is; −1: none */
export function baitOfItem(id: string): number {
  return BAIT_OF.get(id) ?? -1;
}

/**
 * The kind a bait of a save is read back as when the catalogue has it no more (core/modcar/items.ts
 * registerRetiredItems): a retired bait as the one it was merged into, a bait of no kind there is as the worm; null:
 * no bait.
 */
export function baitItemNow(id: string): string | null {
  return id.startsWith('bait_') ? baitItem(baitIndexOf(id.slice(5))) : null;
}

/** the kind a rod of a save is read back as when the catalogue has it no more: the rod nearest it in power (gear.ts ROD_RETIRED); null: no rod of ours */
export function rodItemNow(id: string): string | null {
  return ROD_RETIRED.get(id) ?? null;
}

/** the stars a fish's rarity is shown with on its card (the lord and the sky's fish both five) */
export const TIER_STARS: Readonly<Record<Tier, number>> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5 };

/** a fish caught is drawn in its own colour and at its size (its medal's band): `fish_<id>@<variant>.<medal>`; a fish with no state its kind's (null) */
export function fishModelOf(inst: ItemInstance): string | null {
  const i = fishOfItem(inst.item);
  const s = inst.state?.fish;
  if (i < 0 || !s) return null;
  return `fish_${FISH[i].id}@${s.v}.${s.m}`;
}

/** the kinds that may go onto a hook alive: the small common and uncommon fish, and whatever a lord takes */
const LIVE: ReadonlySet<string> = new Set([
  ...FISH.filter((f) => f.tier <= 1 && kgOf(f, f.cm[1]) <= 1.2).map((f) => f.id),
  ...FISH.filter((f) => f.live).map((f) => f.live!),
]);

export function canGoLive(fish: number): boolean {
  return LIVE.has(FISH[fish].id);
}

/** a fish's typical weight (kg): one of the middle of its lengths */
export function typicalKg(def: FishDef): number {
  return kgOf(def, Math.sqrt(def.cm[0] * def.cm[1]));
}

// ------------------------------------------------------------------ the rows

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

const FISH_ITEMS: readonly ItemRow[] = FISH.map((f): ItemRow => {
  const top = kgOf(f, f.cm[1]);
  const mid = typicalKg(f);
  return {
    id: `fish_${f.id}`,
    cat: FISH_CAT.id,
    name: { zh: f.zh, en: f.en },
    stars: TIER_STARS[f.tier],
    blurb: f.note,
    mass: Math.max(0.02, round(mid, mid < 1 ? 3 : 1)),
    carry: top >= 12 ? 'large' : top >= 3 ? 'medium' : 'small',
    salvage: {},
    model: `fish_${f.id}`,
    paint: f.look.c[1],
    paint2: f.look.c[0],
    matte: 0.35,
    tags: ['fish', ...(LIVE.has(f.id) ? [LIVE_TAG] : [])],
    perish: { hours: 24, into: SPOILED },
  };
});

/** the rods' bodies (tools/blender/items/fishing.py): a cane, a glass rod, a carbon one, a heavy one, a surf rod */
const ROD_SHAPE: Readonly<Record<string, string>> = {
  rod_willow: 'rod_cane', rod_swift: 'rod_carbon', rod_pro: 'rod_glass', rod_sea: 'rod_heavy', rod_heron: 'rod_surf',
};

/** each rod's blank and its fittings (sRGB): the willow's cane, the carbon white and blue, the pro dark and silver, the sea rod navy and orange, the night rod's night blue and moonlight */
const ROD_PAINT: Readonly<Record<string, readonly [number, number]>> = {
  rod_willow: [0xc8a85a, 0x6a4a2a], rod_swift: [0xe8eef2, 0x3e7ec7], rod_pro: [0x2a2a30, 0xc0c4c8], rod_sea: [0x2a4a7a, 0xe0602a], rod_heron: [0x2a2a4a, 0xe8e0ff],
};

/** a rod's grade: by its power (the night rod's between the pro's and the sea rod's) */
const ROD_STARS: Readonly<Record<string, number>> = { rod_willow: 1, rod_swift: 2, rod_pro: 3, rod_heron: 4, rod_sea: 5 };

/** what each weighs with its reel (kg): the carbon the lightest, the sea rod the heaviest */
const ROD_KG: Readonly<Record<string, number>> = { rod_willow: 0.45, rod_swift: 0.3, rod_pro: 0.5, rod_sea: 1.2, rod_heron: 0.55 };

const ROD_ITEMS: readonly ItemRow[] = RODS.map((r): ItemRow => ({
  id: r.id,
  cat: ROD_CAT.id,
  name: { zh: r.zh, en: r.en },
  stars: ROD_STARS[r.id] ?? 1,
  blurb: r.note,
  mass: ROD_KG[r.id] ?? 0.5,
  carry: 'small',
  salvage: { scrap: 2 + (ROD_STARS[r.id] ?? 1) },
  model: ROD_SHAPE[r.id] ?? 'rod_glass',
  paint: ROD_PAINT[r.id]?.[0] ?? 0x3a6a8a,
  paint2: ROD_PAINT[r.id]?.[1] ?? 0xd8c29a,
  tags: ['rod'],
  holds: { slots: 1, accepts: [`#${BAIT_TAG}`] },
}));

/** the baits' packs (tools/blender/items/fishing.py): a tin, a jar, a box, a lure on its card */
const BAIT_SHAPE: Readonly<Record<string, string>> = { worm: 'bait_tin', spoon: 'bait_lure', shrimp: 'bait_box', squid_strip: 'bait_box', stardust: 'bait_jar' };

const BAIT_PAINT: Readonly<Record<string, readonly [number, number]>> = {
  worm: [0x6f7a82, 0xc87a6a], spoon: [0xd8dce0, 0xd8392b], shrimp: [0x8fb8c8, 0xe88a6a], squid_strip: [0xf0f0f0, 0xc86a8a], stardust: [0x8ad0ff, 0xffd0f0],
};

/** what one bait weighs (kg), and how many make a stack */
const BAIT_KG: Readonly<Record<string, number>> = { shrimp: 0.02, squid_strip: 0.02 };

const KIND_ZH = { veg: '素饵', meat: '荤饵', lure: '拟饵' } as const;

const BAIT_ITEMS: readonly ItemRow[] = BAITS.map((b): ItemRow => {
  const star = b.tier === STAR_TIER;
  return {
    id: `bait_${b.id}`,
    cat: BAIT_CAT.id,
    name: { zh: b.zh, en: b.en },
    // (the stars of the rarity it draws, as a fish of it shows)
    stars: TIER_STARS[b.tier as Tier],
    blurb: star ? b.note : `${b.lure ? '拟饵，鱼咬了也不会吃掉，断线才丢。' : `${KIND_ZH[b.kind]}。`}${b.note}`,
    mass: b.lure ? 0.03 : (BAIT_KG[b.id] ?? 0.01),
    carry: 'small',
    salvage: b.lure ? { scrap: 1 } : {},
    model: BAIT_SHAPE[b.id] ?? 'bait_tin',
    paint: BAIT_PAINT[b.id]?.[0] ?? 0x6f7a82,
    paint2: BAIT_PAINT[b.id]?.[1] ?? 0xc87a6a,
    tags: [BAIT_TAG],
    stack: b.lure ? 5 : star ? 10 : b.pack >= 20 ? 40 : b.pack >= 10 ? 30 : 20,
  };
});

const PANTRY_BAIT_ITEMS: readonly ItemRow[] = PANTRY_ROWS.map(
  ([id, zh, en, paint, paint2]): ItemRow => ({
    id,
    cat: BAIT_CAT.id,
    name: { zh, en },
    stars: TIER_STARS[0],
    blurb: '素饵。和蚯蚓一样，哪一种普通的鱼都会来咬，来的是哪种看运气。竿上没饵的时候，带着的面包、玉米会自己掰一些挂上。',
    mass: 0.01,
    carry: 'small',
    salvage: {},
    model: 'bait_tin',
    paint,
    paint2,
    tags: [BAIT_TAG],
    stack: 40,
  }),
);

const OTHER_ITEMS: readonly ItemRow[] = [
  {
    id: CREEL,
    cat: TACKLE_CAT.id,
    name: { zh: '鱼篓', en: 'Creel' },
    stars: 1,
    blurb: '柳条编的鱼篓，斜挎着走。捡起来的鱼直接进篓，放在里面坏得慢一半。',
    mass: 0.8,
    carry: 'small',
    salvage: {},
    model: 'fishing_creel',
    paint: 0xc8a05a,
    paint2: 0x5a3a2a,
    holds: { slots: 10, accepts: [FISH_CAT.id], maxKg: 15, decay: 0.5 },
  },
  {
    id: BOTTLE,
    cat: FLOTSAM_CAT.id,
    name: { zh: '漂流瓶', en: 'Drift bottle' },
    stars: 1,
    blurb: '瓶子里塞着一张卷起来的纸条。',
    mass: 0.4,
    carry: 'small',
    salvage: { scrap: 1 },
    model: 'fishing_bottle',
    paint: 0x6aa88a,
    paint2: 0xf0e6cc,
  },
  {
    id: CRATE,
    cat: FLOTSAM_CAT.id,
    name: { zh: '沉船木箱', en: 'Crate off a wreck' },
    stars: 2,
    blurb: '在水底泡了很多年的木箱，铁皮包着角。看着它按 Tab 打开。',
    mass: 6,
    carry: 'medium',
    salvage: { scrap: 3 },
    model: 'fishing_crate',
    paint: 0x7a5a3a,
    paint2: 0x4a4a40,
    holds: { slots: 4, accepts: ['*'] },
  },
  {
    id: PEARL,
    cat: FLOTSAM_CAT.id,
    name: { zh: '大珍珠', en: 'Big pearl' },
    stars: 4,
    blurb: '从湖底的老河蚌里滚出来的，又圆又亮。',
    mass: 0.05,
    carry: 'small',
    salvage: {},
    model: 'fishing_pearl',
    paint: 0xf4eee8,
    paint2: 0xe8d8e0,
    stack: 10,
  },
  {
    id: BOOT,
    cat: FLOTSAM_CAT.id,
    name: { zh: '泡烂的靴子', en: 'Sodden boot' },
    stars: 0,
    blurb: '不知是谁的靴子，泡得发软。丢进回收台。',
    mass: 0.8,
    carry: 'small',
    salvage: { scrap: 1 },
    model: 'fishing_boot',
    paint: 0x4a3a2a,
    paint2: 0x2a2a28,
  },
  {
    id: CAN,
    cat: FLOTSAM_CAT.id,
    name: { zh: '生锈的易拉罐', en: 'Rusty can' },
    stars: 0,
    blurb: '一个锈透了的易拉罐。丢进回收台。',
    mass: 0.05,
    carry: 'small',
    salvage: { scrap: 1 },
    model: 'fishing_can',
    paint: 0xb84a3a,
    paint2: 0x8a8a8a,
    stack: 10,
  },
];

/** every fishing thing for the catalogue */
export const FISHING_ITEMS: readonly ItemRow[] = [...FISH_ITEMS, ...ROD_ITEMS, ...BAIT_ITEMS, ...PANTRY_BAIT_ITEMS, ...OTHER_ITEMS];

/** the fish as the kitchen's ingredients (core/v3/cooking/ingredients.ts registerIngredients): any fish in a pot */
export const FISH_INGREDIENTS: readonly Ingredient[] = FISH.map((f): Ingredient => {
  const shell = f.family === 'crayfish';
  const meat = f.family === 'frog' || f.family === 'turtle';
  const kg = typicalKg(f);
  return {
    item: `fish_${f.id}`,
    cls: shell ? 'shellfish' : meat ? 'meat' : 'fish',
    food: Math.round(Math.min(40, 6 + 14 * Math.sqrt(kg))),
    hp: 0,
    sick: 0,
    taste: [!!SPOTS[f.spot].sea ? 1 : 0, 0, 0, 0, shell ? 3 : 2],
    tags: [shell ? 'seafood' : meat ? 'meat' : 'fish', !!SPOTS[f.spot].sea ? 'sea' : 'fresh', ...(kg >= 1.5 ? ['bigfish'] : [])],
    raw: false,
    processed: false,
  };
});

