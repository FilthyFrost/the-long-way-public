/**
 * The plants of the world (docs/V3/nodes/W2-flora.md): every kind of tree, shrub and ground plant the flora
 * field can stand somewhere, as data. A region's flora table (flora.ts FloraRule) names plants by their id;
 * the renderer draws a plant by its `model` family with its colours; foraging asks what a plant `bears`.
 *
 * The list is append-only in spirit: a plant's id is what tables and saves may name. Pure data.
 */
import type { Text } from '../modcar/types';

/** the layer a plant stands in: trees and shrubs on the 8 m grid, ground plants on the 4 m grid */
export type PlantLayer = 'tree' | 'shrub' | 'ground';

export interface PlantDef {
  readonly id: string;
  readonly layer: PlantLayer;
  readonly name: Text;
  /** how tall it stands, full grown (m): the flora field's size (0.6 … 1.3 or so) scales this */
  readonly height: number;
  /** the radius of its crown or clump (m), and of its trunk where it has one that stops a wheel or a bullet (0: none) */
  readonly crown: number;
  readonly trunk: number;
  /** keeps its leaves in winter and under snow */
  readonly evergreen?: boolean;
  /** the family of model the renderer draws it with */
  readonly model: string;
  /** main colour and second colour (0xRRGGBB): crown and trunk, leaf and flower; absent: the region's palette decides */
  readonly tint?: readonly [number, number];
  /** what it bears for the forager (a forage kind's id), on itself or fallen under it */
  readonly bears?: { readonly forage: string; readonly where: 'on' | 'under' };
}

const ALL: PlantDef[] = [];

function P(id: string, layer: PlantLayer, zh: string, en: string, height: number, crown: number, trunk: number, model: string, o: Partial<PlantDef> = {}): void {
  ALL.push({ id, layer, name: { zh, en }, height, crown, trunk, model, ...o });
}

// ------------------------------------------------------------------ trees

P('oak', 'tree', '橡树', 'Oak', 11, 4.6, 0.36, 'broadleaf');
P('linden', 'tree', '椴树', 'Linden', 12, 4.2, 0.32, 'broadleaf2');
P('ash', 'tree', '白蜡树', 'Ash', 13, 3.8, 0.3, 'broadleaf3');
P('birch', 'tree', '白桦', 'Birch', 11, 2.6, 0.18, 'birch', { tint: [0x9fcf6a, 0xe9e6dc] });
P('poplar', 'tree', '白杨', 'Poplar', 15, 2.0, 0.24, 'poplar');
P('willow', 'tree', '垂柳', 'Willow', 9, 4.4, 0.34, 'willow', { tint: [0x9cc86a, 0x6e5a40] });
P('maple', 'tree', '枫树', 'Maple', 11, 4.2, 0.3, 'broadleaf', { tint: [0xd4572f, 0x5a4034] });
P('pine', 'tree', '松树', 'Pine', 13, 3.0, 0.3, 'conifer2', { evergreen: true, bears: { forage: 'pine_nut', where: 'under' } });
P('spruce', 'tree', '云杉', 'Spruce', 14, 2.6, 0.28, 'conifer', { evergreen: true });
P('juniper', 'tree', '刺柏', 'Juniper', 5, 1.9, 0.22, 'juniper', { evergreen: true, tint: [0x6f8f5a, 0x7a6248] });
P('camphor', 'tree', '香樟', 'Camphor', 12, 5.2, 0.4, 'broadleaf2', { evergreen: true, tint: [0x4f9a55, 0x5c4a38] });
P('bamboo', 'tree', '毛竹', 'Bamboo', 12, 2.2, 0.14, 'bamboo', { evergreen: true, tint: [0x7fbf55, 0x9fcf6a], bears: { forage: 'bamboo_shoot', where: 'under' } });
P('apple_tree', 'tree', '野苹果树', 'Wild apple tree', 6, 3.2, 0.22, 'fruit_tree', { tint: [0x7fb060, 0xd8483a], bears: { forage: 'wild_apple', where: 'on' } });
P('cherry_tree', 'tree', '樱桃树', 'Cherry tree', 7, 3.4, 0.22, 'fruit_tree', { tint: [0x86b866, 0xb3202c], bears: { forage: 'cherry', where: 'on' } });
P('persimmon_tree', 'tree', '柿树', 'Persimmon tree', 8, 3.4, 0.26, 'fruit_tree', { tint: [0xa9a24e, 0xf08a24], bears: { forage: 'persimmon', where: 'on' } });
P('chestnut_tree', 'tree', '栗树', 'Chestnut tree', 12, 4.8, 0.38, 'broadleaf', { tint: [0x86a84e, 0x5a4034], bears: { forage: 'chestnut', where: 'under' } });
P('walnut_tree', 'tree', '核桃树', 'Walnut tree', 12, 4.6, 0.36, 'broadleaf3', { tint: [0x8fb25a, 0x5e4a38], bears: { forage: 'walnut', where: 'under' } });
P('saguaro', 'tree', '巨人柱', 'Saguaro', 6, 0.9, 0.3, 'cactus', { evergreen: true });

// ------------------------------------------------------------------ shrubs

P('bush', 'shrub', '灌木', 'Bush', 1.6, 1.3, 0, 'bush');
P('hazel', 'shrub', '榛丛', 'Hazel', 2.6, 1.8, 0, 'bush', { tint: [0x7fae5a, 0x6a5540] });
P('berry_bush', 'shrub', '野莓丛', 'Berry bush', 1.2, 1.1, 0, 'berry_bush', { tint: [0x6fa456, 0xc2334a], bears: { forage: 'wild_berry', where: 'on' } });
P('blueberry_bush', 'shrub', '蓝莓丛', 'Blueberry bush', 0.6, 0.8, 0, 'berry_bush', { tint: [0x5f9450, 0x3d4f9c], bears: { forage: 'blueberry', where: 'on' } });
P('cranberry_bush', 'shrub', '蔓越莓丛', 'Cranberry bush', 0.4, 0.9, 0, 'berry_bush', { tint: [0x6a8f52, 0xb01f3c], bears: { forage: 'cranberry', where: 'on' } });
P('rose_bush', 'shrub', '野蔷薇', 'Wild rose', 1.4, 1.2, 0, 'berry_bush', { tint: [0x77a85a, 0xe2572f], bears: { forage: 'rose_hip', where: 'on' } });
P('tea_bush', 'shrub', '茶丛', 'Tea bush', 0.9, 0.8, 0, 'tea_bush', { evergreen: true, tint: [0x3f8a4a, 0x6fb060], bears: { forage: 'tea_leaf', where: 'on' } });
P('sage_bush', 'shrub', '鼠尾草丛', 'Sagebrush', 0.8, 0.9, 0, 'sage', { evergreen: true, tint: [0x9aa88a, 0x8a84b0], bears: { forage: 'sage', where: 'on' } });
P('agave', 'shrub', '龙舌兰', 'Agave', 1.1, 1.0, 0, 'agave', { evergreen: true, tint: [0x7fa58a, 0xc8d6a0], bears: { forage: 'agave_heart', where: 'on' } });
P('prickly_pear', 'shrub', '仙人掌', 'Prickly pear', 1.0, 1.0, 0, 'prickly_pear', { evergreen: true, tint: [0x6fa060, 0xd0406a], bears: { forage: 'cactus_fruit', where: 'on' } });
P('reed', 'shrub', '芦苇丛', 'Reeds', 2.2, 1.0, 0, 'reed', { tint: [0xa9b866, 0xcbb890], bears: { forage: 'reed', where: 'on' } });
P('fern', 'shrub', '蕨丛', 'Ferns', 0.7, 0.9, 0, 'fern', { tint: [0x4f9450, 0x6fae5a], bears: { forage: 'fiddlehead', where: 'on' } });

// ------------------------------------------------------------------ ground

P('rock', 'ground', '石块', 'Rock', 0.6, 0.7, 0.5, 'rock');
P('boulder', 'ground', '大石', 'Boulder', 1.6, 1.6, 1.3, 'boulder');
P('log', 'ground', '朽木', 'Fallen log', 0.4, 1.6, 0.25, 'log');
P('stump', 'ground', '树桩', 'Stump', 0.5, 0.4, 0.3, 'stump');
P('flower_clump', 'ground', '花丛', 'Flower clump', 0.4, 0.6, 0, 'flower_clump');

/** every plant, in the catalogue's order (an index into this list is what a flora cell holds) */
export const PLANTS: readonly PlantDef[] = ALL;

const INDEX = new Map(ALL.map((p, i) => [p.id, i]));

/** the index of a plant in PLANTS; −1: there is none of that id */
export function plantIndex(id: string): number {
  return INDEX.get(id) ?? -1;
}

export function plantDef(id: string): PlantDef {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`no plant ${id}`);
  return ALL[i];
}
