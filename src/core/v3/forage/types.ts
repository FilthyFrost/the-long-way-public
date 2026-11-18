/**
 * Foraging's contract (node N1, docs/V3/nodes/N1-forage.md): what one row of the table of forage kinds says,
 * what a forage point is, and under which conditions it shows. Types and a few constants only: the 80 rows are
 * kinds.ts, the points are made in field.ts, how much a pick gives is rules.ts. Pure, no three, no DOM.
 *
 * A forage KIND is also an item kind of the same id (the game module registers one item per row from `item`),
 * so "what was picked" needs no second table.
 */
import type { ForageId, HourSpan, Range, Rarity, RegionId, Tag, Text } from '../contracts/base';

/** the ten sorts (docs/V3/CATALOG.md): each is also an item category of the id `forage_<cat>` */
export type ForageCat = 'mushroom' | 'fruit' | 'greens' | 'root' | 'herb' | 'nut' | 'flower' | 'medicinal' | 'shore' | 'resource';

export const FORAGE_CATS: Readonly<Record<ForageCat, { name: Text; unknown: Text; count: number }>> = {
  mushroom: { name: { zh: '蘑菇与菌类', en: 'Mushrooms' }, unknown: { zh: '不认识的蘑菇', en: 'Unknown mushroom' }, count: 12 },
  fruit: { name: { zh: '浆果与水果', en: 'Berries and fruit' }, unknown: { zh: '不认识的果子', en: 'Unknown fruit' }, count: 12 },
  greens: { name: { zh: '野菜与叶菜', en: 'Wild greens' }, unknown: { zh: '不认识的野菜', en: 'Unknown greens' }, count: 10 },
  root: { name: { zh: '根茎与块茎', en: 'Roots and tubers' }, unknown: { zh: '不认识的根茎', en: 'Unknown root' }, count: 6 },
  herb: { name: { zh: '香草与香料', en: 'Herbs and spices' }, unknown: { zh: '不认识的香草', en: 'Unknown herb' }, count: 9 },
  nut: { name: { zh: '坚果、种子、谷物', en: 'Nuts, seeds and grain' }, unknown: { zh: '不认识的果实', en: 'Unknown nut' }, count: 6 },
  flower: { name: { zh: '花与茶', en: 'Flowers and tea' }, unknown: { zh: '不认识的花', en: 'Unknown flower' }, count: 5 },
  medicinal: { name: { zh: '药草', en: 'Medicinal plants' }, unknown: { zh: '不认识的草药', en: 'Unknown medicinal plant' }, count: 5 },
  shore: { name: { zh: '水边与海滨', en: 'Waterside and shore' }, unknown: { zh: '不认识的水产', en: 'Unknown shore find' }, count: 5 },
  resource: { name: { zh: '资源', en: 'Resources' }, unknown: { zh: '不认识的材料', en: 'Unknown material' }, count: 10 },
};

/** the waters the ecotope tells apart */
export type WaterKind = 'none' | 'lake' | 'river' | 'sea';

/**
 * Where a kind likes to grow, as bands of the ecotope's values (src/core/world/ecotope.ts). A band is
 * [low, high]: inside it the fit is 1, outside it falls to 0 over a margin the field chooses. A band left out
 * does not matter to the kind.
 */
export interface Niche {
  /** 0 dry ... 1 wet */
  readonly moisture?: Range;
  /** 0 open ... 1 under closed wood */
  readonly canopy?: Range;
  /** rise over run: 0 flat ... 1 a 45° slope */
  readonly slope?: Range;
  /** metres above the valley floor the road runs in */
  readonly relief?: Range;
  /** 0 a slope in full sun ... 1 a shaded, north-facing one */
  readonly shade?: Range;
  /** metres from the edge of the nearest water, and which waters count (all, when left out) */
  readonly water?: { readonly dist: Range; readonly kinds?: readonly WaterKind[] };
  /** metres from the road's centre line */
  readonly road?: Range;
  /**
   * What it grows on, for where exactly a point is put and how its plant is stood:
   * the ground (default), at the foot of a tree, on dead wood, on rock or scree, in the shallows (just under
   * the waterline), on the strand (the bare strip by the water).
   */
  readonly on?: 'ground' | 'tree' | 'deadwood' | 'rock' | 'shallows' | 'strand';
}

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

/** the families of plant models (how a kind stands in the world) and of things in the hand; the art lane makes one model per family, a kind sets its scale, colours and a few numbers */
export type PlantFamily =
  | 'cap_mushroom' | 'shelf_mushroom' | 'cluster_mushroom' | 'truffle_mound'
  | 'berry_bush' | 'low_berry' | 'vine' | 'fruit_fall' | 'cactus'
  | 'rosette' | 'fern' | 'tall_herb' | 'grass_tuft' | 'shoot'
  | 'flower_clump' | 'shrub' | 'root_tuft' | 'water_plant'
  | 'shell_bed' | 'crab' | 'kelp' | 'rock_nodule' | 'crust' | 'resin_knot' | 'hive';
export type ItemFamily =
  | 'mushroom' | 'truffle' | 'berries' | 'fruit' | 'leaves' | 'sprig' | 'root' | 'tuber' | 'nuts' | 'grain' | 'flower'
  | 'shell' | 'crab' | 'kelp' | 'stone' | 'lump' | 'jar' | 'cane' | 'fibre';

export interface ForageLook {
  readonly plant: PlantFamily;
  readonly item: ItemFamily;
  /** the plant's size against its family's model (1 = as modelled) */
  readonly scale: number;
  /** main colour, second colour (cap and stem, fruit and leaf), accent (spots, the flower's eye); 0xRRGGBB */
  readonly colours: readonly [number, number, number];
  /** it glows by night (its own light in the plant's shader, no lamp) */
  readonly glow?: boolean;
  /** a few numbers its family's model understands (cap flatness, spots, how many berries): see the family's script */
  readonly params?: Readonly<Record<string, number>>;
}

/** one kind of forage: a row of kinds.ts */
export interface ForageKind {
  /** snake_case; also the id of its item */
  readonly id: ForageId;
  readonly cat: ForageCat;
  readonly name: Text;
  readonly rarity: Rarity;
  /** where it grows: region id (src/core/v3/contracts/regions.ts) to weight; 1 = a speciality of the region, about 0.3 = found there now and then. '*' = everywhere, at that weight. */
  readonly regions: Readonly<Record<RegionId, number>>;
  readonly niche: Niche;
  readonly when?: ForageWhen;
  /** one patch of it: how many plants, within how many metres of the patch's middle */
  readonly patch: { readonly n: Range; readonly spread: number };
  /** how many one plant gives, before any bonus */
  readonly yield: Range;
  /** game days until a picked plant bears again */
  readonly regrowDays: number;
  /** the tool that helps with it (a bonus, never a gate): the knife a star of quality, the trowel one more, the sickle twice as many */
  readonly tool?: 'knife' | 'trowel' | 'sickle';
  /** a toxic look-alike names the edible kind it is taken for by a player who knows that one and not this one */
  readonly twin?: ForageId;
  /** its item: weight of one (kg), how many stack, game hours until it has gone off (none: it keeps), what eating one raw does, tags beyond 'forage' and its category */
  readonly item: {
    readonly mass: number;
    readonly stack: number;
    readonly stars: number;
    readonly perishHours?: number;
    readonly eat?: { readonly food: number; readonly hp: number; readonly effect?: 'sick1' | 'sick2' | 'warm1' | 'warm2' };
    readonly tags?: readonly Tag[];
    readonly salvage?: Readonly<Partial<Record<'scrap' | 'organics' | 'chemicals', number>>>;
  };
  readonly look: ForageLook;
  /** the line on its card, once known */
  readonly blurb: string;
  /** for the compendium: where and when to look for it, in a sentence */
  readonly where: Text;
}

/** one plant one can pick: computed from the seed and the place, never stored */
export interface ForageNode {
  /** stable for this seed and place: what the save remembers a picked point by */
  readonly key: number;
  readonly x: number;
  readonly z: number;
  /** index into FORAGE_KINDS */
  readonly kind: number;
  /** how many it gives before any bonus */
  readonly n: number;
  /** one of the after-rain half: shows only for RAIN_SHOW_H after rain */
  readonly hidden: boolean;
  /** 0 ... 1, for the view: its turn and a little of its size */
  readonly vary: number;
  /** the patch it belongs to (points of one patch share it) */
  readonly patch: number;
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

/** the side of a cell of the forage field (m): the world is cut into these, each computed by itself */
export const FORAGE_CELL = 24;
