import { routeProfileId } from '../../world/routeProfiles';
import { hash2 } from '../../math/rng';
import { ECO_PROFILES, type EcoProfile } from '../../world/data/ecoProfiles';
import { groundProfile } from '../../world/groundTables';
import type { WeatherState } from '../../env/weather';

export type Motion = 'perch' | 'flock' | 'soar' | 'wade' | 'swim' | 'nectar' | 'dart' | 'glow' | 'lamp';
export type Form = 'song' | 'crow' | 'swift' | 'gull' | 'raptor' | 'egret' | 'swan' | 'duck' | 'pelican' | 'bee' | 'butterfly' | 'dragonfly' | 'firefly' | 'moth';
type Site = 'wood' | 'field' | 'stream' | 'pond' | 'shore' | 'ridge' | 'flowers' | 'wetEdge' | 'lamp';
export interface Animal {
  name: string; form: Form; motion: Motion; site: Site;
  span: number; back: number; breast: number; tips: number;
}
export const animals: Record<string, Animal> = Object.create(null);
function row(name: string, form: Form, motion: Motion, site: Site, span: number, back: number, breast: number, tips: number): void {
  animals[name] = { name, form, motion, site, span, back, breast, tips };
}
row('暗冠蓝鸦','crow','perch','wood',.47,0x316791,0x587dbc,0x283247);
row('克拉克星鸦','crow','perch','wood',.61,0x9a9b9c,0xb4b5ad,0x333646);
row('灰噪鸦','crow','perch','wood',.46,0x727781,0xbcbeb5,0x474b56);
row('灌丛鸦','crow','perch','wood',.40,0x456f9d,0xaaa99b,0x354461);
row('黑嘴喜鹊','crow','perch','wood',.61,0x28414c,0xefebd9,0x304957);
row('渡鸦','crow','soar','ridge',1.35,0x343944,0x464957,0x252936);
row('黄嘴山鸦','crow','flock','ridge',.82,0x363d49,0x48505d,0x282d39);
row('吉拉啄木鸟','song','perch','wood',.42,0x575456,0xc8b9a5,0x453f40);
row('白翅哀鸽','song','perch','wood',.49,0x958477,0xc6ac99,0xe6e1d2);
row('深红玫瑰鹦鹉','song','perch','wood',.54,0xab413a,0xc9413b,0x466e9d);
row('果鸠','song','perch','wood',.42,0x789661,0xb9bd88,0x537257);
row('麦哲伦啄木鸟','crow','perch','wood',.70,0x423e42,0x474449,0x38353a);
row('查考窜鸟','song','perch','wood',.25,0x866850,0xbd764e,0x5e5349);
row('红眼莺雀','song','perch','wood',.24,0x75835b,0xd5d4b6,0x495c50);
row('绯红丽唐纳雀','song','perch','wood',.29,0xbb4939,0xdc5744,0x333444);
row('山蓝鸲','song','perch','field',.33,0x639ed0,0xa4c7cf,0x476c98);
row('西草地鹨','song','perch','field',.39,0x96855e,0xe7c755,0x574b40);
row('黑顶山雀','song','perch','wood',.20,0x707981,0xe9d8bd,0x333543);
row('草地鹨','song','perch','field',.23,0x968768,0xc7b68c,0x665b4e);
row('冬鹪鹩近缘的太平洋鹪鹩','song','perch','wood',.15,0x826344,0xae8058,0x624c42);
row('织布鸟','song','perch','stream',.25,0xb4a744,0xe2bd49,0x534636);
row('翠鸟','song','perch','stream',.26,0x3489a3,0xd08348,0x2b637a);
row('新西兰扇尾鹟','song','perch','wood',.23,0x746550,0xd4b88a,0x50483f);
row('黄色知更鸲类','song','perch','wood',.22,0x708070,0xddba49,0x52655e);
row('开普糖鸟','song','perch','flowers',.32,0x84735d,0xb3a286,0x554d42);
row('太阳鸟','song','perch','flowers',.18,0x55786b,0xd9a755,0x404f53);
row('雨燕','swift','flock','field',.43,0x494752,0x70685e,0x363744);
row('燕类','swift','flock','field',.32,0x3b5266,0xe2c8a9,0x343e50);
row('银鸥','gull','flock','shore',.98,0xb3bdc5,0xf1eee0,0x414552);
row('短尾鹱','gull','flock','shore',1.02,0x564f54,0x777072,0x3d3b43);
row('褐鹈鹕','pelican','flock','shore',2.12,0x806e62,0xc7b299,0x514b50);
row('白鹭','egret','wade','wetEdge',1.03,0xe3e5d7,0xf7f0dc,0xb9c8c3);
row('苔原天鹅','swan','swim','pond',1.95,0xe5e6de,0xf4ecdb,0xbcc6c8);
row('非洲渔雕','raptor','soar','stream',2.05,0x6d4736,0xf2e9d2,0x393840);
row('南方凤头卡拉鹰','raptor','soar','ridge',1.33,0x594b45,0xcbb9a1,0x373842);
row('野蜂','bee','nectar','flowers',.027,0xaf8552,0x674d36,0xe1d3a9);
row('熊蜂','bee','nectar','flowers',.043,0xe4ae42,0x3f3740,0xcebea6);
row('粉蝶类','butterfly','nectar','flowers',.069,0xffedb8,0xfff6d4,0x686957);
row('灰蝶类','butterfly','nectar','flowers',.043,0x7eabcb,0xb6ccd3,0x676273);
row('斑蝶类','butterfly','nectar','flowers',.102,0xe5914a,0xf3b065,0x473d3f);
row('凤蝶类','butterfly','nectar','flowers',.135,0x428e78,0x84b889,0x343a45);
row('蜻蜓','dragonfly','dart','pond',.11,0x539d96,0x376f76,0xc0d2bf);
row('绿头鸭','duck','swim','pond',.91,0x776951,0x955c45,0x416b51);
row('绿翅鸭','duck','swim','pond',.60,0x968d7d,0xb09777,0x945535);
row('澳洲黑鸭近缘灰鸭','duck','swim','pond',.86,0x786450,0x977b5f,0x9d8768);
row('美洲鸦','crow','perch','field',.92,0x353c47,0x48545c,0x29303a);
row('红尾鵟','raptor','soar','ridge',1.34,0x79553d,0xe6cba0,0x433c3b);
row('仓燕','swift','flock','field',.36,0x304452,0xe6cfad,0x323441);
row('东部蓝鸲','song','perch','field',.32,0x467eab,0xcc966c,0x334c61);
row('萤火虫','firefly','glow','wetEdge',.026,0x645638,0x54493a,0xd3e884);
row('蛾类','moth','lamp','lamp',.057,0xb3a18a,0xc7bbab,0x907e71);

const byId = new Map(ECO_PROFILES.map(p => [p.id, p]));
// Legacy landscapes predate geographical IDs. Never fall through by kin across continents.

export function profileFor(region: string): EcoProfile | undefined {
  // (a place of the emergent Earth: its own profile, registered as the journey reaches it — its own birds and insects)
  return byId.get(region) ?? (region.startsWith('earth') ? groundProfile(region) : undefined) ?? byId.get(routeProfileId(region));
}

export const CELL_COUNT = 25;
export const GROUP_LIMIT = 64;
export const CELL_BIRD = 62, CELL_INSECT = 7;
export const isDay = (hour: number): boolean => hour >= 6 && hour < 19;
export function sheltered(w: WeatherState): boolean {
  return w.rain >= .5 || w.snow >= .35 || w.hail > .05 || w.dust >= .4 ||
    w.kind === 'storm' || w.kind === 'blizzard' || w.kind === 'sandstorm' || w.kind === 'hail';
}
export function inSeason(profile: EcoProfile, name: string, month: number, hour: number, w: WeatherState): boolean {
  if (sheltered(w) || !animals[name]) return false;
  for (const b of profile.birds) if (b.name === name) return isDay(hour);
  for (const i of profile.insects) {
    if (i.name !== name || !i.months.includes(month) || (i.activity === 'day') !== isDay(hour)) continue;
    if (w.temp < 9 || w.wind > 9 || w.snowCover > .35 || w.rain > .18) return false;
    return name !== '萤火虫' || (w.temp >= 14 && profile.climate.precipMm[month-1] >= 65 && profile.climate.lowC[month-1] >= 13);
  }
  return false;
}

export interface Habitat {
  wood: boolean; flowers: boolean; wet: boolean; depth: number; kind: number;
  nearWater: number; moisture: number; lamp: boolean; field: boolean; ridge: boolean;
}
export function suits(a: Animal, h: Habitat): boolean {
  switch (a.site) {
    case 'wood': return h.wood && !h.wet;
    case 'field': return h.field && !h.wet;
    case 'ridge': return h.ridge && !h.wet;
    case 'stream': return h.kind === 2 && h.nearWater < 24;
    case 'pond': return h.wet && (h.kind === 1 || (a.motion === 'dart' && h.kind === 2));
    case 'shore': return h.kind === 3 && h.nearWater < 45;
    case 'wetEdge': return a.motion === 'glow' ? !h.wet && h.moisture >= .42 && (h.field || h.wood) : h.wet && h.depth < .65;
    case 'flowers': return h.flowers && !h.wet;
    case 'lamp': return h.lamp && !h.wet;
  }
}
// The same silhouette can occupy different water in different surveys (a pond, a channel or a river bay).
export function localHabitat(text: string, h: Habitat): boolean {
  if (/海浪|近海/.test(text)) return h.kind === 3 && h.nearWater < 45;
  if (/池塘|池背风/.test(text)) return h.kind === 1 && h.nearWater < 8;
  if (/江岸|河湾|沿河|河岸|河边|溪岸|水渠/.test(text)) return h.kind === 2 && h.nearWater < 24;
  return true;
}
// Each of the 25 slots always owns the same residue in a 5 x 5 world grid.
export function ringCell(center: number, residue: number): number {
  const first = center - 2;
  return first + ((residue - first) % 5 + 5) % 5;
}
export function anchor(cell: number, size: number, hash: number): number {
  return (cell + .12 + .76 * (hash >>> 0) / 4294967296) * size;
}
export const cellHash = (cx: number, cz: number, seed: number, layer: number): number => hash2(cx, cz, seed ^ (layer ? 0x295abd : 0x6dffc));
