import type { EcoProfile } from './data/ecoProfiles';
import type { Ecotope } from './ecotope';
import { pigments } from './groundTables';

export const rockForms = ['cobbles','scree','boulder','granite','moraine','columns','fin','karst','strata','lava'] as const;

/**
 * `core` (G3, groundField.ts): how deep in an outcrop the spot lies, 0 its rim … 1 its middle — the caller has decided
 * that a stone lies here, and its kind goes by that: the rock itself in the middle, its fallen blocks round it.
 */
export function sampleRock(p: EcoProfile, e: Ecotope, draw: number, chance: number, patch = 0.5, core?: number) {
  const bank = (e.waterKind === 1 || e.waterKind === 2) && e.waterDist < 9 && e.slope < 0.48;
  const slope = e.slope;
  // (V3: the place's stoniness, in patches — a strewn field here, open ground there)
  const stony = (p.rockiness ?? 0) * 0.36 * (0.25 + 1.5 * patch);
  if (core === undefined && chance >= (bank ? 0.83 : Math.min(0.78,0.025 + stony + slope*slope*0.8 + (e.landform > 1 ? 0.19 : 0)))) return;
  let rock = p.rocks[p.rocks.length-1];
  for (const r of p.rocks) {
    draw -= r.share;
    if (draw < 0) {rock = r; break;}
  }
  const {type,form} = rock;
  if (/海砂|坡积土/.test(type)) return;
  const small = /砾|碎块/.test(type+form) && form !== '熔岩块';
  if (!bank && small && slope < 0.12) return;
  // (V3: a steep slope of a stony place shows its rock — outcrops among the scree, bigger than the stones about)
  const outcrop = !bank && !small && (core !== undefined ? core > 0.5 : slope > 0.55 && chance < 0.1 + 0.2 * (p.rockiness ?? 0));
  let model: typeof rockForms[number];
  if (bank) model = 'cobbles';
  else if (small || (slope > 0.65 && !outcrop) || (core !== undefined && core < 0.12 && slope > 0.3)) model = 'scree';
  else if (form === '熔岩块') model = 'lava';
  else if (type === '冰碛') model = 'moraine';
  else if (type === '花岗岩' || /圆蚀/.test(form)) model = 'granite';
  else if (type === '玄武岩') model = 'columns';
  else if (form === '直立岩鳍') model = 'fin';
  // (G3: a limestone's fluted pinnacle only where its rock stands in the middle of an outcrop; round it, its blocks)
  else if (form === '竖沟孤峰') model = core === undefined || core > 0.45 ? 'karst' : 'boulder';
  else if (/层|片|崖/.test(form)) model = 'strata';
  else model = 'boulder';
  const loose = model === 'cobbles' || model === 'scree';
  const radius = bank ? 2.8 : loose ? 1.2 : model === 'fin' ? 2.6 : 1.55;
  const height = loose ? (bank ? 0.39 : 0.34) : model === 'fin' || model === 'karst' ? 3.6 : model === 'columns' ? 2.25 : 1.35;
  const base = pigments[rock.color];
  // (a lava flow's clinker black, a little warm: V3)
  const paint = model === 'lava' ? 0x3d3836 : type === '花岗岩' ? 0xaa9b94 : type === '玄武岩' ? 0x525661 : type === '片麻岩' ? 0x908982 : base;
  return {form:model, radius, height, paint, habitat:'any' as const, name:type, outcrop: outcrop && model !== 'scree'};
}
