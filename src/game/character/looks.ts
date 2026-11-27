// How she may look, chosen as a game is begun (docs/V3/plan/finish.md §十: 捏人 — 肤色 5 种, 头盔颜色和条纹 6 种): five
// skins, each a set of paints as her own is (lit, shade, the deep of a crease, the palm's two, the blush — chosen as
// paint, not one colour darkened), and six helmets, each a shell and the stripe over its crown. The first of each is
// how she was made. A game keeps the two numbers (save.ts SaveV1.look); the colours are only here.
import * as THREE from 'three';
import { HER_SKIN, type SkinPaint } from './material';

const C = (r: number, g: number, b: number): THREE.Color => new THREE.Color().setRGB(r, g, b);

export interface SkinLook {
  name: string;
  paint: SkinPaint;
}

/** her skins, the first her own: linear paints */
export const SKINS: readonly SkinLook[] = [
  { name: '深棕', paint: HER_SKIN },
  { name: '棕', paint: { lit: C(0.36, 0.2, 0.14), shade: C(0.29, 0.15, 0.115), deep: C(0.19, 0.09, 0.08), palmLit: C(0.55, 0.36, 0.28), palmShade: C(0.36, 0.21, 0.17), blush: C(0.45, 0.17, 0.13) } },
  { name: '小麦', paint: { lit: C(0.52, 0.32, 0.22), shade: C(0.42, 0.24, 0.18), deep: C(0.28, 0.15, 0.12), palmLit: C(0.68, 0.48, 0.38), palmShade: C(0.47, 0.3, 0.24), blush: C(0.6, 0.26, 0.2) } },
  { name: '暖白', paint: { lit: C(0.7, 0.48, 0.36), shade: C(0.56, 0.36, 0.29), deep: C(0.38, 0.22, 0.19), palmLit: C(0.8, 0.6, 0.5), palmShade: C(0.6, 0.42, 0.35), blush: C(0.76, 0.38, 0.32) } },
  { name: '瓷白', paint: { lit: C(0.82, 0.62, 0.52), shade: C(0.66, 0.47, 0.42), deep: C(0.46, 0.3, 0.28), palmLit: C(0.88, 0.7, 0.62), palmShade: C(0.7, 0.52, 0.46), blush: C(0.86, 0.48, 0.44) } },
];

export interface HelmetLook {
  name: string;
  shellLit: THREE.Color;
  shellShade: THREE.Color;
  stripe: THREE.Color;
}

/** her helmets, the first her own: the shell in the light and in the shade, the stripe over the crown */
export const HELMETS: readonly HelmetLook[] = [
  { name: '白底橙条', shellLit: C(0.86, 0.85, 0.84), shellShade: C(0.6, 0.61, 0.68), stripe: C(0.92, 0.3, 0.1) },
  { name: '白底蓝条', shellLit: C(0.86, 0.85, 0.84), shellShade: C(0.6, 0.61, 0.68), stripe: C(0.1, 0.3, 0.82) },
  { name: '奶黄棕条', shellLit: C(0.88, 0.76, 0.46), shellShade: C(0.62, 0.53, 0.38), stripe: C(0.33, 0.17, 0.08) },
  { name: '红底白条', shellLit: C(0.7, 0.11, 0.08), shellShade: C(0.46, 0.07, 0.1), stripe: C(0.9, 0.88, 0.84) },
  { name: '墨绿金条', shellLit: C(0.09, 0.28, 0.19), shellShade: C(0.05, 0.18, 0.16), stripe: C(0.9, 0.68, 0.18) },
  { name: '黑底红条', shellLit: C(0.09, 0.09, 0.1), shellShade: C(0.045, 0.045, 0.07), stripe: C(0.85, 0.12, 0.1) },
];

/** a look's two numbers made whole: what is not one of them is the first */
export function cleanLook(l: { skin?: unknown; helmet?: unknown } | null | undefined): { skin: number; helmet: number } {
  const skin = Number(l?.skin);
  const helmet = Number(l?.helmet);
  return { skin: Number.isInteger(skin) && skin >= 0 && skin < SKINS.length ? skin : 0, helmet: Number.isInteger(helmet) && helmet >= 0 && helmet < HELMETS.length ? helmet : 0 };
}

/** a paint as a page's colour (the menu's swatches): linear to the screen's */
export function css(c: THREE.Color): string {
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
}
