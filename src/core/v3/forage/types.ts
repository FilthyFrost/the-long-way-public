/**
 * Foraging's contract (node W3, docs/V3/nodes/W3-forage.md): what one row of the table of forage kinds says,
 * what a forage point is, and under which conditions it shows. Types and a few constants only: the catalogue rows are
 * kinds.ts; where things grow is the flora field's (src/core/world/flora.ts); how much a pick gives is rules.ts.
 * Pure, no three, no DOM.
 *
 * A forage KIND is also an item kind of the same id (the game module registers one item per row from `item`),
 * so "what was picked" needs no second table.
 */
import type { ForageId, HourSpan, Range, Rarity, Tag, Text } from '../contracts/base';

/** the ten sorts (docs/V3/CATALOG.md): each is also an item category of the id `forage_<cat>` */
export type ForageCat = 'mushroom' | 'fruit' | 'greens' | 'root' | 'herb' | 'nut' | 'flower' | 'medicinal' | 'shore' | 'resource';

export const FORAGE_CATS: Readonly<Record<ForageCat, { name: Text; unknown: Text; count: number }>> = {
  mushroom: { name: { zh: '蘑菇与菌类', en: 'Mushrooms' }, unknown: { zh: '不认识的蘑菇', en: 'Unknown mushroom' }, count: 12 },
  fruit: { name: { zh: '浆果与水果', en: 'Berries and fruit' }, unknown: { zh: '不认识的果子', en: 'Unknown fruit' }, count: 19 },
  greens: { name: { zh: '野菜与叶菜', en: 'Wild greens' }, unknown: { zh: '不认识的野菜', en: 'Unknown greens' }, count: 10 },
  root: { name: { zh: '根茎与块茎', en: 'Roots and tubers' }, unknown: { zh: '不认识的根茎', en: 'Unknown root' }, count: 6 },
  herb: { name: { zh: '香草与香料', en: 'Herbs and spices' }, unknown: { zh: '不认识的香草', en: 'Unknown herb' }, count: 9 },
  nut: { name: { zh: '坚果、种子、谷物', en: 'Nuts, seeds and grain' }, unknown: { zh: '不认识的果实', en: 'Unknown nut' }, count: 8 },
  flower: { name: { zh: '花与茶', en: 'Flowers and tea' }, unknown: { zh: '不认识的花', en: 'Unknown flower' }, count: 5 },
  medicinal: { name: { zh: '药草', en: 'Medicinal plants' }, unknown: { zh: '不认识的草药', en: 'Unknown medicinal plant' }, count: 5 },
  shore: { name: { zh: '水边与海滨', en: 'Waterside and shore' }, unknown: { zh: '不认识的水产', en: 'Unknown shore find' }, count: 5 },
  resource: { name: { zh: '资源', en: 'Resources' }, unknown: { zh: '不认识的材料', en: 'Unknown material' }, count: 10 },
};

/** when its points show; a kind without any of these shows always */
export interface ForageWhen {
  /** half of its points are hidden and show only for RAIN_SHOW_H game hours after rain (mushrooms: twice as many after rain) */
  readonly afterRain?: boolean;
  /** it shows only in these hours of the day (dew-fresh greens at dawn; kinds that glow, at night) */
  readonly hours?: HourSpan;
  /** it shows only at low tide (tideAt below LOW_TIDE) */
  readonly lowTide?: boolean;
}

/** how many game hours after rain the hidden half of an after-rain kind shows */
export const RAIN_SHOW_H = 12;
/** the tide, −1 ... 1, below which the strand's kinds are uncovered */
export const LOW_TIDE = -0.35;

/** the families of models of things in the hand: the art makes one model a family, a kind sets its colours */
export type ItemFamily =
  | 'mushroom' | 'truffle' | 'berries' | 'fruit' | 'leaves' | 'sprig' | 'root' | 'tuber' | 'nuts' | 'grain' | 'flower'
  | 'shell' | 'crab' | 'kelp' | 'stone' | 'lump' | 'jar' | 'cane' | 'fibre';

/**
 * One kind of forage: a row of kinds.ts. Where it grows is not said here: a kind is borne by plants
 * (src/core/world/plants.ts PlantDef.bears), and where those plants stand is the flora field's business
 * (src/core/world/flora.ts, the regions' flora tables). So "what grows where" has one answer.
 */
export interface ForageKind {
  /** snake_case; also the id of its item */
  readonly id: ForageId;
  readonly cat: ForageCat;
  readonly name: Text;
  readonly rarity: Rarity;
  readonly when?: ForageWhen;
  /** how many portions one plant gives, before any bonus */
  readonly yield: Range;
  /** game days until a picked plant bears again */
  readonly regrowDays: number;
  /** the tool that helps with it (a bonus, never a gate): the knife a star of quality, the trowel one more, the sickle twice as many */
  readonly tool?: 'knife' | 'trowel' | 'sickle';
  /** a toxic look-alike names the edible kind it is taken for by a player who knows that one and not this one */
  readonly twin?: ForageId;
  /** its item: weight of one portion (kg), how many stack, game hours until it has gone off (none: it keeps), what eating one raw does, tags beyond 'forage' and its category */
  readonly item: {
    readonly mass: number;
    readonly stack: number;
    readonly stars: number;
    readonly perishHours?: number;
    readonly eat?: { readonly food: number; readonly hp: number; readonly effect?: 'sick1' | 'sick2' | 'warm1' | 'warm2' };
    readonly tags?: readonly Tag[];
  };
  /** the thing in the hand: its family of model and its colours (main, second, accent; 0xRRGGBB); it glows by night */
  readonly look: { readonly item: ItemFamily; readonly colours: readonly [number, number, number]; readonly glow?: boolean };
  /** the line on its card, once known */
  readonly blurb: string;
  /** for the compendium: where and when to look for it, in a sentence */
  readonly where: Text;
}

/** one plant one can pick: a cell of the flora field whose plant bears a forage kind; computed, never stored */
export interface ForageNode {
  /** stable for this seed and place (the flora layer and the cell): what the save remembers a picked point by */
  readonly key: number;
  readonly x: number;
  readonly z: number;
  /** index into FORAGE_KINDS, and into PLANTS for the plant that bears it */
  readonly kind: number;
  readonly plant: number;
  /** one of the after-rain half: shows only for RAIN_SHOW_H after rain */
  readonly hidden: boolean;
  /** 0 ... 1, from the cell: for how many it gives and for the view */
  readonly vary: number;
}

/** what the conditions are now, for whether a point shows */
export interface ForageCond {
  /** the hour of the day, 0 ... 24 */
  readonly hour: number;
  /** game hours since it last rained (large when it has not) */
  readonly sinceRainH: number;
  /** the tide, −1 ... 1 */
  readonly tide: number;
}
