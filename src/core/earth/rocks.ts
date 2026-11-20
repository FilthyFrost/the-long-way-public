/**
 * The rocks and grounds of the emergent Earth (docs/V3/plan/emergent-earth.md §5): what the land is made of where
 * the road goes, and so the colour it shows where nothing covers it — a cliff, a dune, a bank, a field of stones —
 * and what landforms it can make. About fifteen; a geological province is one of them, crossed at a contact.
 *
 * Colours are painted colours (0xRRGGBB, the lit and the shaded face, and the ground's own where it is soil or
 * sand), chosen as a painter of the game's look would mix them: a few tones, the shade a colour of its own.
 * Pure data, DOM-free.
 */

export type RockId =
  | 'limestone'
  | 'dolomite'
  | 'sandstone_red'
  | 'sandstone_pale'
  | 'granite'
  | 'basalt'
  | 'cinder'
  | 'rhyolite'
  | 'gypsum'
  | 'salt'
  | 'loess'
  | 'laterite'
  | 'peat'
  | 'shale'
  | 'quartz_sand'
  | 'coral_sand'
  | 'till'
  | 'schist';

export interface Rock {
  id: RockId;
  zh: string;
  /** the colour of its bare rock, lit and in shade; of its soil or sand where it lies loose */
  lit: number;
  shade: number;
  ground: number;
  /** a word for its colour in a place's name (白、赤、黑……) */
  hue: string;
  /** it lies loose (sand, salt, silt) rather than standing as rock */
  loose?: boolean;
  /** how much it lets plants grow, 0 bare … 1 rich soil (salt and gypsum hold back nearly everything) */
  fertile: number;
  /** what it is in its eroded forms: soft (it slumps into slopes, badlands) or hard (it stands in cliffs, towers) */
  hard: number;
}

export const ROCKS: readonly Rock[] = [
  { id: 'limestone', zh: '石灰岩', lit: 0xd9d4c6, shade: 0x7d8a92, ground: 0xb7aa8c, hue: '玉', fertile: 0.6, hard: 0.8 },
  { id: 'dolomite', zh: '白云岩', lit: 0xeee2d2, shade: 0x9a8f9e, ground: 0xcbbca6, hue: '粉', fertile: 0.5, hard: 0.9 },
  { id: 'sandstone_red', zh: '红砂岩', lit: 0xd8784a, shade: 0x8a4a4a, ground: 0xc77a52, hue: '赤', fertile: 0.35, hard: 0.7 },
  { id: 'sandstone_pale', zh: '浅色砂岩', lit: 0xe8cf9e, shade: 0x9f8478, ground: 0xd8bf90, hue: '金', fertile: 0.4, hard: 0.65 },
  { id: 'granite', zh: '花岗岩', lit: 0xd8c4b8, shade: 0x7e7c8c, ground: 0xb8a48c, hue: '磐', fertile: 0.45, hard: 0.95 },
  { id: 'basalt', zh: '玄武岩', lit: 0x5d5a5e, shade: 0x2c2c3a, ground: 0x4a4440, hue: '黑', fertile: 0.55, hard: 0.85 },
  { id: 'cinder', zh: '火山渣', lit: 0x9a4a3a, shade: 0x3e2a30, ground: 0x6e3a32, hue: '焰', loose: true, fertile: 0.25, hard: 0.2 },
  { id: 'rhyolite', zh: '流纹岩', lit: 0xe0b878, shade: 0x8a7a8e, ground: 0xcaa070, hue: '彩', fertile: 0.3, hard: 0.6 },
  { id: 'gypsum', zh: '石膏', lit: 0xf6f3ec, shade: 0xb4bccb, ground: 0xf0ece2, hue: '白', loose: true, fertile: 0.05, hard: 0.1 },
  { id: 'salt', zh: '盐', lit: 0xf8f6f0, shade: 0xbcc6d4, ground: 0xf2efe6, hue: '镜', loose: true, fertile: 0, hard: 0.05 },
  { id: 'loess', zh: '黄土', lit: 0xe2c08a, shade: 0x9a7e66, ground: 0xd6b07a, hue: '黄', loose: true, fertile: 0.8, hard: 0.15 },
  { id: 'laterite', zh: '红土', lit: 0xc8603a, shade: 0x7a3a34, ground: 0xb85a38, hue: '丹', fertile: 0.55, hard: 0.3 },
  { id: 'peat', zh: '泥炭', lit: 0x6a5240, shade: 0x2e2624, ground: 0x4e3e32, hue: '褐', loose: true, fertile: 0.7, hard: 0.05 },
  { id: 'shale', zh: '页岩黏土', lit: 0xc8a8a0, shade: 0x6e6276, ground: 0xb49690, hue: '霞', fertile: 0.3, hard: 0.25 },
  { id: 'quartz_sand', zh: '石英沙', lit: 0xf0d28c, shade: 0xb08a70, ground: 0xe8c880, hue: '金', loose: true, fertile: 0.15, hard: 0.05 },
  { id: 'coral_sand', zh: '珊瑚沙', lit: 0xfaf4e6, shade: 0xb8c8d0, ground: 0xf4ecdc, hue: '白', loose: true, fertile: 0.2, hard: 0.05 },
  { id: 'till', zh: '冰碛', lit: 0xa8a49a, shade: 0x5e6670, ground: 0x8e8a7e, hue: '砾', fertile: 0.45, hard: 0.4 },
  { id: 'schist', zh: '片岩', lit: 0x9a9a8a, shade: 0x4c5462, ground: 0x7a786a, hue: '青', fertile: 0.5, hard: 0.85 },
];

export const rockById = new Map(ROCKS.map((r) => [r.id, r]));

export function rock(id: RockId): Rock {
  const r = rockById.get(id);
  if (!r) throw new Error(`earth: no rock ${id}`);
  return r;
}
