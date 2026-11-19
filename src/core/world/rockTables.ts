import type { EcoProfile } from './data/ecoProfiles';
import type { Ecotope } from './ecotope';
import { pigments } from './groundTables';

export const rockForms = ['cobbles','scree','boulder','granite','moraine','columns','fin','karst','strata'] as const;

export function sampleRock(p: EcoProfile, e: Ecotope, draw: number, chance: number) {
  const bank = (e.waterKind === 1 || e.waterKind === 2) && e.waterDist < 9 && e.slope < 0.48;
  const slope = e.slope;
  if (chance >= (bank ? 0.83 : Math.min(0.52,0.025 + slope*slope*0.8 + (e.landform > 1 ? 0.19 : 0)))) return;
  let rock = p.rocks[p.rocks.length-1];
  for (const r of p.rocks) {
    draw -= r.share;
    if (draw < 0) {rock = r; break;}
  }
  const {type,form} = rock;
  if (/海砂|坡积土/.test(type)) return;
  const small = /砾|碎块/.test(type+form);
  if (!bank && small && slope < 0.12) return;
  let model: typeof rockForms[number];
  if (bank) model = 'cobbles';
  else if (small || (slope > 0.65 && chance > 0.12)) model = 'scree';
  else if (type === '冰碛') model = 'moraine';
  else if (type === '花岗岩' || /圆蚀/.test(form)) model = 'granite';
  else if (type === '玄武岩') model = 'columns';
  else if (form === '直立岩鳍') model = 'fin';
  else if (form === '竖沟孤峰') model = 'karst';
  else if (/层|片|崖/.test(form)) model = 'strata';
  else model = 'boulder';
  const loose = model === 'cobbles' || model === 'scree';
  const radius = loose ? 0.95 : model === 'fin' ? 2.6 : 1.55;
  const height = loose ? (bank ? 0.18 : 0.31) : model === 'fin' || model === 'karst' ? 3.6 : model === 'columns' ? 2.25 : 1.35;
  return {form:model, radius, height, paint:pigments[rock.color], habitat:'any' as const, name:type};
}
