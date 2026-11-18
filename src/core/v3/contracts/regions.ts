/**
 * The kinds of country of V3, by id (docs/V3/CATALOG.md, "区域类型"): six exist today as the world's biomes
 * (src/core/world/biomes.ts, same ids), the others come with world generation 2.0 (node N10). The list stands
 * here, ahead of them, because tables written earlier (what is foraged where, which animals live where) name
 * regions: a table written against these ids does not have to be touched again when a region becomes real.
 * Pure data.
 */
import type { Intensity, RegionId, Text } from './base';

export interface RegionName {
  readonly id: RegionId;
  readonly name: Text;
  readonly intensity: Intensity;
  /** true: the world makes it today (a biome of the same id) */
  readonly today?: boolean;
}

export const REGIONS: readonly RegionName[] = [
  { id: 'plains', name: { zh: '草原丘陵', en: 'Rolling grassland' }, intensity: 'calm', today: true },
  { id: 'desert', name: { zh: '荒漠', en: 'Desert' }, intensity: 'calm', today: true },
  { id: 'alpine', name: { zh: '针叶雪山', en: 'Snowy conifer mountains' }, intensity: 'scenic', today: true },
  { id: 'forest', name: { zh: '森林', en: 'Forest' }, intensity: 'calm', today: true },
  { id: 'lakes', name: { zh: '湖区', en: 'Lake country' }, intensity: 'calm', today: true },
  { id: 'maple', name: { zh: '枫叶丘陵', en: 'Maple hills' }, intensity: 'calm', today: true },
  { id: 'flower_fields', name: { zh: '花海原野', en: 'Flower fields' }, intensity: 'calm' },
  { id: 'giant_woods', name: { zh: '巨杉猎场', en: 'Giant redwoods' }, intensity: 'scenic' },
  { id: 'bamboo_sea', name: { zh: '竹海', en: 'Bamboo sea' }, intensity: 'scenic' },
  { id: 'cherry_valley', name: { zh: '樱花谷', en: 'Cherry blossom valley' }, intensity: 'scenic' },
  { id: 'wetland', name: { zh: '湿地沼泽', en: 'Wetland' }, intensity: 'calm' },
  { id: 'sea_cliffs', name: { zh: '海岸悬崖', en: 'Sea cliffs' }, intensity: 'scenic' },
  { id: 'red_canyon', name: { zh: '红岩峡谷与丹霞', en: 'Red rock canyon' }, intensity: 'scenic' },
  { id: 'volcanic_tundra', name: { zh: '火山黑沙与苔原', en: 'Volcanic sands and tundra' }, intensity: 'scenic' },
  { id: 'karst_peaks', name: { zh: '喀斯特峰林', en: 'Karst peaks' }, intensity: 'scenic' },
  { id: 'terraces', name: { zh: '梯田山乡', en: 'Terraced hills' }, intensity: 'calm' },
  { id: 'salt_lake', name: { zh: '盐湖天空之镜', en: 'Salt lake mirror' }, intensity: 'scenic' },
  { id: 'savanna', name: { zh: '稀树草原', en: 'Savanna' }, intensity: 'calm' },
  { id: 'alpine_meadow', name: { zh: '高山草甸与冰川垭口', en: 'Alpine meadow and glacier pass' }, intensity: 'highlight' },
  { id: 'drowned_city', name: { zh: '被淹没的城市', en: 'Drowned city' }, intensity: 'highlight' },
  { id: 'vine_ruins', name: { zh: '藤蔓都市废墟', en: 'Vine-grown ruins' }, intensity: 'highlight' },
  { id: 'dry_seabed', name: { zh: '干涸海床与船坟', en: 'Dry seabed and ship graveyard' }, intensity: 'highlight' },
  { id: 'giant_mushrooms', name: { zh: '巨菇林', en: 'Giant mushroom wood' }, intensity: 'highlight' },
  { id: 'crystal_waste', name: { zh: '水晶荒原', en: 'Crystal waste' }, intensity: 'highlight' },
  { id: 'floating_reefs', name: { zh: '浮空岩礁', en: 'Floating reefs' }, intensity: 'highlight' },
];

export const REGION_IDS: readonly RegionId[] = REGIONS.map((r) => r.id);

/** the regions the world makes today */
export const REGIONS_TODAY: readonly RegionId[] = REGIONS.filter((r) => r.today).map((r) => r.id);

/**
 * The sea's edge is not a region of its own today: stretches of coast run through other country. What a table
 * gives the region `sea_cliffs` also holds on any shore of the sea (the ecotope says when the sea is near).
 */
export const COAST_REGION: RegionId = 'sea_cliffs';
