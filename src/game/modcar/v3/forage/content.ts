/**
 * What the forage module adds to the game's catalogues besides the eighty kinds themselves (those are the
 * core's rows: src/core/v3/forage/items.ts): the four tools, the ten pages of the compendium, the skill with
 * its perks, and the words the module says. Pure data: nothing here touches the page or the game.
 *
 * To add a tool: a row in TOOL_ROWS, and where it helps is the core's (ForageKind.tool, rules.ts pickResult).
 * To add a perk: a row in FORAGE_SKILL.perks (its level is a row of data; what it does is asked by its id
 * where it matters: `progress.hasPerk('forage_glow')`).
 */
import type { ItemRow } from '../../../../core/modcar/items';
import type { Rarity, Text } from '../../../../core/v3/contracts/base';
import { FORAGE_CATS, type ForageCat } from '../../../../core/v3/forage/types';
import type { SkillDef } from '../../../../core/v3/progress/types';

/** the skill's id, and the field of the compendium the kinds are kept in */
export const FORAGE_SKILL_ID = 'forage';
export const FORAGE_DOMAIN = 'forage';

/** the tools: in the hotbar they help (never a gate): rules.ts PickBonus */
export const KNIFE = 'forage_knife';
export const TROWEL = 'forage_trowel';
export const SICKLE = 'forage_sickle';
export const BASKET = 'forage_basket';

export const TOOL_ROWS: readonly ItemRow[] = [
  { id: KNIFE, cat: 'gear', name: { zh: '小刀', en: 'Foraging knife' }, stars: 1, mass: 0.15, carry: 'small', tags: ['forage_tool'], model: 'forage_knife', paint: 0xb9bfc4, paint2: 0x7a4a2a, blurb: '采蘑菇、割野菜、取松脂用的小刀。带在快捷栏里就行：切口干净，采到的品质多一星。' },
  { id: TROWEL, cat: 'gear', name: { zh: '小铲', en: 'Trowel' }, stars: 1, mass: 0.3, carry: 'small', tags: ['forage_tool'], model: 'forage_trowel', paint: 0x8a9096, paint2: 0x7a4a2a, blurb: '挖根茎、贝类、黏土用的小铲。带在快捷栏里就行：每次多挖出一个。' },
  { id: SICKLE, cat: 'gear', name: { zh: '镰刀', en: 'Sickle' }, stars: 1, mass: 0.4, carry: 'small', tags: ['forage_tool'], model: 'forage_sickle', paint: 0x9aa0a6, paint2: 0x6a4a2c, blurb: '割芦苇、谷穗、纤维草用的镰刀。带在快捷栏里就行：一次割下双份。' },
  {
    id: BASKET,
    cat: 'gear',
    name: { zh: '采集篮', en: 'Foraging basket' },
    stars: 1,
    mass: 0.5,
    carry: 'small',
    holds: { slots: 12, accepts: ['#forage'], maxKg: 6, decay: 0.5 },
    salvage: { organics: 2 },
    model: 'forage_basket',
    paint: 0xc8a05c,
    paint2: 0x8a6a3c,
    blurb: '藤编的篮子。放在快捷栏里，采到的东西自己进篮子：装十二叠野货，通风，里面的东西坏得慢一半。',
  },
];

const CAT_ORDER: readonly ForageCat[] = ['mushroom', 'fruit', 'greens', 'root', 'herb', 'nut', 'flower', 'medicinal', 'shore', 'resource'];

/** the id of the page of the compendium that teaches a category */
export function pageId(cat: ForageCat): string {
  return `forage_page_${cat}`;
}

/** the ten pages: taken into the hands, a page teaches every kind of its category (where pages are found is a later node's) */
export const PAGE_ROWS: readonly ItemRow[] = CAT_ORDER.map((c) => ({
  id: pageId(c),
  cat: 'gear',
  name: { zh: `图鉴页：${FORAGE_CATS[c].name.zh}`, en: `Field guide page: ${FORAGE_CATS[c].name.en}` },
  stars: 2,
  mass: 0.02,
  carry: 'small',
  tags: ['forage_page'],
  salvage: { organics: 1 },
  model: 'forage_page',
  paint: 0xe8dcc0,
  paint2: 0x7a9a6a,
  blurb: `从一本野外图鉴上撕下来的一页，画着${FORAGE_CATS[c].name.zh}。拿到手里翻一翻，这一类的 ${FORAGE_CATS[c].count} 种就都认得了。`,
}));

/** the category a page teaches, by the page's id */
export const PAGE_CAT: ReadonlyMap<string, ForageCat> = new Map(CAT_ORDER.map((c) => [pageId(c), c]));

export const FORAGE_CAT_ORDER = CAT_ORDER;

/** the perks' ids */
export const PERK_GLOW = 'forage_glow';
export const PERK_DOUBLE = 'forage_double';
export const PERK_TWINS = 'forage_twins';
export const PERK_STAR = 'forage_star';

export const FORAGE_SKILL: SkillDef = {
  id: FORAGE_SKILL_ID,
  name: { zh: '采集', en: 'Foraging' },
  perks: [
    { id: PERK_GLOW, level: 5, name: { zh: '眼尖', en: 'Sharp eyes' }, blurb: { zh: '可采的东西从更远就看得到微光。', en: 'The glint of things to pick shows from further off.' } },
    { id: PERK_DOUBLE, level: 10, name: { zh: '手熟', en: 'Practised hands' }, blurb: { zh: '有机会一次采到双份。', en: 'A chance of twice as much from a pick.' } },
    { id: PERK_TWINS, level: 15, name: { zh: '火眼金睛', en: 'An eye for twins' }, blurb: { zh: '分得清长得像的可食种和有毒种。', en: 'Tells toxic look-alikes from the edible kinds.' } },
    { id: PERK_STAR, level: 20, name: { zh: '老行家', en: 'Old hand' }, blurb: { zh: '偶尔采到的品质多一星。', en: 'Now and then a pick is a star better.' } },
  ],
};

/**
 * The level of the skill from which every kind of a rarity is known by sight (legendary kinds never: only a
 * taste or a page names them). A toxic look-alike is not learnt this way whatever its rarity: telling it
 * from its edible twin is the perk forage_twins.
 */
export const KNOWN_FROM: Readonly<Record<Rarity, number>> = { common: 3, uncommon: 6, rare: 9, legendary: Infinity };

/** how far off a point glints (m): as it comes, and with the perk forage_glow */
export const HINT_M = 8;
export const HINT_GLOW_M = 16;

/** the line on the card of a kind the player does not know */
export const UNKNOWN_BLURB = '还不认识。尝一口，或者多采一些就认得了。';

export const WORDS = {
  pick: { zh: '采', en: 'Pick' } as Text,
  first: { zh: '第一次采到', en: 'first find' } as Text,
  atFeet: { zh: '拿不下的放在脚边了', en: 'the rest is at your feet' } as Text,
  where: { zh: '哪里找', en: 'Where' } as Text,
  pickedSoFar: { zh: '一共采过', en: 'Picked so far' } as Text,
};
