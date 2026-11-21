import { ECO_PROFILES, type EcoProfile } from './data/ecoProfiles';
import type { Ecotope } from './ecotope';

// Profiles whose road already has an equivalent in the original twelve regions.
// A region carrying a profile id directly takes precedence over these historical names.
const original: Record<string,string> = {
  plains:'shenandoah-farm', forest:'sierra-valley', alpine:'sierra-high', desert:'sonoran', lakes:'fiordland',
  maple:'appalachian', red_canyon:'redrock', terraces:'south-china-paddy', karst_peaks:'karst-river',
  wetland:'eglinton-grass', flower_fields:'blue-meadow', bamboo_sea:'karst-river',
};
const profiles = new Map(ECO_PROFILES.map(p => [p.id,p]));
/**
 * A region of the emergent Earth's ground profile, its place's own (earth/profile.ts): what grows on its ground
 * belt by belt, its months, its rocks. Kept beside the reference profiles (and in their list, which the render
 * side reads its rocks from).
 */
export function registerEarthProfile(p: EcoProfile): void {
  profiles.set(p.id, p);
  if (!ECO_PROFILES.some((q) => q.id === p.id)) (ECO_PROFILES as EcoProfile[]).push(p);
}
/** a region of the emergent Earth (earth/road.ts) grows its template's ground plants, at its template's heights, until it has its own */
export function aliasGroundProfile(id: string, as: string): void {
  original[id] = original[as] ?? as;
  if (roadDatum[as] !== undefined) roadDatum[id] = roadDatum[as];
}
export function groundProfile(id: string): EcoProfile | undefined {
  return profiles.get(id) ?? profiles.get(original[id]);
}

// The old biome relief is measured from a road datum. A climate grid cell may be
// hundreds of metres above the road in a narrow valley; use the route's band instead.
const roadDatum:Record<string,number> = {plains:280,forest:1300,alpine:2680,desert:850,lakes:250,maple:680,
  red_canyon:1320,terraces:370,karst_peaks:175,wetland:340,flower_fields:1020,bamboo_sea:260};
export function siteElevation(id:string, e:Ecotope) {
  return roadDatum[id] === undefined ? e.h : roadDatum[id]+e.relief+e.landform;
}

export function elevationBand(p: EcoProfile, altitude: number) {
  return p.bands.find(b => altitude >= b.fromM && altitude < b.toM);
}

export type Habitat = 'bare'|'wood'|'wet'|'open'|'edge'|'bench'|'any';
export interface Growth {
  form: string;
  height: number;
  radius: number;
  paint: number;
  habitat: Habitat;
}
export const plants = new Map<string,Growth>();
export const blossoms = new Map<string,Growth>();
function add(names: string, form: string, height: number, radius: number, paint: number, habitat: Habitat, flower = false) {
  const table = flower ? blossoms : plants;
  for (const name of names.split(' ')) table.set(name,{form,height,radius,paint,habitat});
}
add('裸地 裸岩 裸砾 裸土 生物结皮','crust',0.05,0.85,0x89775f,'bare');
add('苔藓','moss',0.075,0.78,0x728457,'any');
add('岩面地衣','lichen',0.035,0.5,0xa3aa90,'bare');
add('林下针叶毡','needles',0.045,1.1,0x9a7350,'wood');
add('林下落叶 硬叶灌丛落叶','litter',0.065,0.96,0xb58c55,'wood');
add('剑蕨','fern',1.08,0.97,0x486e56,'wood');
add('地蕨','fern',0.63,0.88,0x52805b,'wood');
add('红杉酢浆草','clover',0.13,0.54,0x6d9668,'wood');
add('莎草 田埂莎草 棉花莎草','sedge',0.58,0.56,0x8b9e5e,'wet');
add('越橘 越橘地毯 熊果灌丛','berry',0.45,0.93,0x688353,'edge');
add('草甸禾草 混合草原禾草 高秆草','grass',0.63,0.62,0x9da95b,'open');
add('矮柳 矮桦 贴地小灌木 矮生灌木','dwarf',0.42,1.16,0x798951,'any');
add('丛生旱草 滨海丛草 丛生雪草','tussock',0.83,0.91,0xb1a069,'open');
add('林缘灌丛 湿林灌木 石山灌丛 倒挂金钟类','shrub',1.4,1.25,0x58794f,'edge');
add('河岸灌丛','shrub',1.2,1.3,0x66865c,'wet');
add('垫状草本','cushion',0.13,0.65,0x788c57,'bare');
add('海岸鼠尾草 蒿灌丛','sage',0.67,0.75,0x91a087,'open');
add('加州丁香 黑刷灌木','sage',0.78,0.89,0x627450,'open');
add('杂酚油灌木','creosote',1.28,1.43,0x94934b,'open');
add('刺灌丛 刺小檗类 帕洛维德幼树','thorn',1.06,1.27,0x839152,'open');
add('水稻','rice',0.89,1.53,0x8faa51,'bench');
add('山月桂 杜鹃 高山杜鹃 山龙眼','broad',0.89,1.15,0x506d50,'edge');
add('桃金娘 岩蔷薇 滨海茶树灌木 盐生矮灌','maritime',0.75,1.12,0x7e907a,'open');
add('灯芯草状帚草 帚状欧石南','broom',0.86,0.63,0x878958,'open');
add('加州罂粟 沼泽金盏草类 草甸毛茛 沙漠锦葵 岩蔷薇 库克山毛茛','cup',0.36,0.38,0x809855,'open',true);
add('高山福禄考 高山勿忘草 仙女木 虎耳草类 高山龙胆','star',0.15,0.36,0x728456,'bare',true);
add('加州丁香 卡托巴杜鹃 锈叶杜鹃 糖山龙眼 巴塔哥尼亚小檗','cluster',0.74,0.57,0x527654,'edge',true);
add('雪花草 红杉酢浆草 延龄草 山铁线莲 本地倒挂金钟','woodflower',0.27,0.34,0x749361,'wood',true);
add('柳兰 石南 油菜','spike',0.85,0.32,0x84945a,'open',true);
add('科罗拉多蓝耧斗菜 地被芦荟类','tube',0.63,0.35,0x789763,'open',true);
add('草原锥花 滨海雏菊类','daisy',0.47,0.38,0x859558,'open',true);
add('稻花','rice',0.95,1.53,0x8faa51,'bench',true);
// (docs/V3/nodes/R5-ground.md: the emergent Earth's ground plants the surveyed profiles had none of)
add('刺鬣草团','spinifex',0.6,1.2,0x8fa58c,'open');
add('象草','tall',1.9,0.9,0xb8a85c,'open');
add('林下大叶草','bigleaf',1.8,1.4,0x4f8a3e,'wood');
add('盐生灌丛','saltbush',0.8,0.9,0x9aa088,'open');
// Blossoms growing directly on a tree or cactus crown belong to that crown.
export const crownFlowers = new Set(['智利火树','巨柱仙人掌','苹果','果树花','栗花']);
// The neighbouring surveyed ecotones share the same geometry vocabulary, including
// the research names that carry a scientific binomial.
function aliases(reference:string, names:string[], table = plants) {
  for (const name of names) table.set(name,table.get(reference)!);
}
aliases('草甸禾草',['丛生禾草','牧草','田埂草','山草甸','行间刈草','行间牧草','河岸草','割草地','牧场禾草','阳坡草','沙洲草','田界高草','蓝格兰马草 Bouteloua gracilis','水牛草 Bouteloua dactyloides']);
aliases('丛生旱草',['干季金黄禾草','旱季枯草','海滨丛草','滨海匍匐草','红雪丛草 Chionochloa rubra']);
aliases('莎草',['先锋莎草','灌溉沟莎草','湿岸莎草','湿地莎草']);
aliases('矮柳',['伏地矮灌','林缘柳','湿地矮灌']);
aliases('林下落叶',['落叶']); aliases('林下针叶毡',['针叶碎毡','松针毡']);
aliases('水稻',['水稻 Oryza sativa']);
aliases('林缘灌丛',['灌木栎','山桃花心木灌丛','桤木类','田界灌丛','林缘蔷薇','田界黑莓','次生林缘灌丛','林下灌丛','篱边灌丛','山地缎带木幼株']);
aliases('刺小檗类',['刺小檗']); aliases('海岸鼠尾草',['苦灌木']);
aliases('滨海茶树灌木',['滨海盐生矮灌','蜡质硬叶灌丛','耐盐灌木','滨海露兜类']);
aliases('裸土',['裸沙','潮泥']);
add('气生根群','knees',0.38,0.76,0x807663,'wet');
aliases('草原锥花',['野生天人菊','紫菀类','滨海菊类'],blossoms);
aliases('柳兰',['加拿大一枝黄花类','当地鼠尾草类'],blossoms);
aliases('高山福禄考',['红三叶','白三叶','马鞍藤'],blossoms);
export const pigments: Record<string,number> = {
  橙:0xf59950,深红:0xba4650,白:0xfff6e2,淡粉:0xeac0c4,蓝:0x789acb,蓝白:0xb5c6e7,天蓝:0x91bde5,
  紫粉:0xd69dbf,玫红:0xe18ea4,黄:0xeaca64,深蓝:0x596eba,粉:0xe9acc4,乳白:0xeee4bc,橙红:0xe57a4e,绿紫:0xb588ae,猩红:0xcd534b,
  淡赭:0xb39779,红褐:0xa06e5c,米白:0xd1cbb9,赭灰:0x9c8c7a,深灰:0x747678,淡金:0xcdb67d,
  黄红:0xe79b56,金黄:0xe3bb55,粉红:0xe5a1b1,紫蓝:0x8c89be,淡紫:0xb4a5cc,粉白:0xefd4d3,白粉:0xeed8d5,乳黄:0xe8dca8,白或黄:0xeadcae,粉紫:0xca9dc1,
  灰白:0xb4b2a8,灰褐:0x978a7a,赤红:0xb96950,赭红:0xa86b52,灰色:0x929596,棕灰:0x95897e,粉灰:0xbf9b92,
  灰黄:0xbaaa80,乳灰:0xb9b4a9,赭色:0xac825b,青灰:0x859a96,浅灰:0xb0b1aa,暗灰:0x666b70,蜜黄:0xc9a676,
};

export function siteFit(g: Growth, e: Ecotope, bench: boolean): number {
  if (e.slope > 1.45 && g.habitat !== 'bare') return 0;
  switch (g.habitat) {
    case 'wood': return Math.max(0, (e.canopy-0.15)*1.4);
    case 'wet': return e.waterDist < 8 ? 1 : Math.max(0,(e.moisture-0.46)*2.1);
    case 'bench': return bench ? 1 : 0;
    case 'open': return Math.max(0,1-e.canopy*1.6) * (g.height > 0.2 && e.slope > 0.85 ? 0.24 : 1);
    case 'edge': return 0.85-0.66*Math.abs(2*e.canopy-0.9);
    case 'bare': return Math.max(0.1,1-e.canopy);
    default: return 0.8;
  }
}
