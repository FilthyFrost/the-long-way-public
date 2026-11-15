/**
 * The 24 paints (docs/MODCAR.md §5.3). Picked from the colours of specs/art/STYLE.md — a little muted and
 * warm, like a hand-painted background — so that any mix of parts still sits in the picture.
 * Stored as sRGB hex (what a colour picker shows); the renderer converts to linear.
 */
import type { Text } from './types';

export interface Paint {
  hex: number;
  name: Text;
}

export const PALETTE: readonly Paint[] = [
  { hex: 0xede3c8, name: { zh: '奶油白', en: 'Cream' } },
  { hex: 0xf4efe2, name: { zh: '象牙白', en: 'Ivory' } },
  { hex: 0xa9d3b5, name: { zh: '薄荷绿', en: 'Mint' } },
  { hex: 0x3e8e87, name: { zh: '青绿', en: 'Teal' } },
  { hex: 0x7fb3d5, name: { zh: '天蓝', en: 'Sky blue' } },
  { hex: 0x2e4a6b, name: { zh: '藏青', en: 'Navy' } },
  { hex: 0x7a7f45, name: { zh: '橄榄', en: 'Olive' } },
  { hex: 0x557a46, name: { zh: '苔绿', en: 'Moss' } },
  { hex: 0xd4a53b, name: { zh: '芥末黄', en: 'Mustard' } },
  { hex: 0xf0c23c, name: { zh: '向日葵黄', en: 'Sunflower' } },
  { hex: 0xe07b39, name: { zh: '橘', en: 'Orange' } },
  { hex: 0xb85c3e, name: { zh: '陶土红', en: 'Terracotta' } },
  { hex: 0x9e3b2f, name: { zh: '砖红', en: 'Brick' } },
  { hex: 0xc8323a, name: { zh: '樱桃红', en: 'Cherry' } },
  { hex: 0x6e2534, name: { zh: '酒红', en: 'Wine' } },
  { hex: 0xe8a3a8, name: { zh: '粉', en: 'Rose' } },
  { hex: 0xa99bc9, name: { zh: '薰衣草', en: 'Lavender' } },
  { hex: 0x6b4a73, name: { zh: '梅紫', en: 'Plum' } },
  { hex: 0x5a3a2b, name: { zh: '巧克力', en: 'Chocolate' } },
  { hex: 0xb9915f, name: { zh: '驼色', en: 'Tan' } },
  { hex: 0xd8c29a, name: { zh: '沙色', en: 'Sand' } },
  { hex: 0x6f7a82, name: { zh: '石板灰', en: 'Slate' } },
  { hex: 0x2f3236, name: { zh: '炭黑', en: 'Charcoal' } },
  { hex: 0xf7f7f2, name: { zh: '白', en: 'White' } },
];

/** each frame's factory colours: [body, second tone] */
export const FACTORY_PAINT: Record<string, [number, number]> = {
  sedan: [3, 0],
  pickup: [9, 1],
  moto: [13, 22],
  rv: [0, 10],
};

export function paintHex(index: number, fallback = 0xd8d4c8): number {
  return index >= 0 && index < PALETTE.length ? PALETTE[index].hex : fallback;
}
