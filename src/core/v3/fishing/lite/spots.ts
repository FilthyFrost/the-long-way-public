/**
 * The ten waters of the casual fishing module (docs/V3/nodes/F2-fishing-lite.md §5): each a real lake of the
 * emergent Earth (world version 5) with the jetty its world built there, or the pier under a lighthouse, found by
 * the world's seed and the road's slot (harness/sim/fishing_lakes_scan.ts lists them). The page stands the angler
 * at the end of that jetty; the water in reach is the pond.
 *
 * In the main game these become every lake of its kind along the road; here they are ten, in order of difficulty.
 */
import type { SpotDef } from './types';

export const SPOTS: readonly SpotDef[] = [
  { id: 'sakura_pond', zh: '樱岭塘', en: 'Sakura Ridge Pond', blurb: '开春的落叶林边一口小塘。', seed: 20261113, slot: 39, site: 'site39p', capacity: 30, licence: 0, event: 'rainbow', eventZh: '雨后彩虹', eventSpan: [15.5, 18.5], tip: '鲫鱼和白条最多；黄昏去深水碰碰运气。' },
  { id: 'cang_lake', zh: '苍谷湖', en: 'Cang Valley Lake', blurb: '湿润林里的一片湖，鳟鱼的家。', seed: 20261113, slot: 41, site: 'site41p', capacity: 34, licence: 800, event: 'fog', eventZh: '晨雾', eventSpan: [5, 8.5], tip: '鳟鱼爱晨昏；鳗鱼只在夜里。' },
  { id: 'jincha_delta', zh: '金汊水乡', en: 'Jincha Delta', blurb: '三角洲上的水田和水塘。', seed: 20261113, slot: 85, site: 'site85p', sea: true, capacity: 36, licence: 1400, event: 'storm', eventZh: '雷暴', eventSpan: [15, 18], tip: '夜里和雨天最热闹；黑鱼只追会动的。' },
  { id: 'xia_haizi', zh: '霞海子', en: 'Xia Great Lake', blurb: '旷野上的一片大湖，深水区很大。', seed: 20261113, slot: 143, site: 'site143p', capacity: 44, licence: 3000, event: 'meteor', eventZh: '流星雨', eventSpan: [21, 2], tip: '掠食鱼要抛远；梭鲈和鳜鱼在昏暗里出来。' },
  { id: 'hei_haizi', zh: '黑海子', en: 'Black Great Lake', blurb: '大断崖下稀树草原的大湖。', seed: 20261113, slot: 98, site: 'site98p', capacity: 40, licence: 6300, event: 'sunshower', eventZh: '太阳雨', eventSpan: [11, 14], tip: '夜里是鲶鱼和怪鱼的天下；雨季肺鱼会醒。' },
  { id: 'bi_sinkhole', zh: '碧梯天坑', en: 'Jade Terrace Sinkhole', blurb: '老梯田中间的一口天坑深潭。', seed: 20261113, slot: 106, site: 'site106p', capacity: 36, licence: 12000, event: 'afterglow', eventZh: '火烧云', eventSpan: [18, 19.6], tip: '食人鱼偷饵快；电鳗出来的时候记得松手。' },
  { id: 'xiajing_ice', zh: '霞镜冰湖', en: 'Rose Mirror Ice Lake', blurb: '石柱与烟囱岩之间一片刚化冻的高山湖。', seed: 20261113, slot: 66, site: 'site66p', capacity: 32, licence: 27000, event: 'aurora', eventZh: '极光', eventSpan: [22, 3], tip: '水清，鱼警觉，抛远一点；金鳟只在晴天。' },
  { id: 'qingye_bay', zh: '青野海湾', en: 'Qingye Bay', blurb: '海蚀柱和石拱之间，灯塔下的长码头。', seed: 20261113, slot: 205, site: 'site205p', sea: true, capacity: 44, licence: 40000, event: 'ribbon', eventZh: '地震云', eventSpan: [9, 12], tip: '鲭鱼成群；章鱼和鱿鱼在夜里。' },
  { id: 'heiyan_lake', zh: '黑焰湖', en: 'Black Flame Lake', blurb: '火山渣锥和熔岩流环着的一片冷湖。', seed: 20261113, slot: 33, site: 'site33p', capacity: 34, licence: 76000, event: 'snow', eventZh: '初雪', eventSpan: [6, 10], tip: '熔岩鳅夜里透出火光；浮石鱼会往上漂。' },
  { id: 'bijing_crater', zh: '碧镜天池', en: 'Jade Mirror Crater', blurb: '星空底下，高原上的一口火山口湖。', seed: 20261113, slot: 198, site: 'site198p', capacity: 30, licence: 150000, event: 'dream', eventZh: '梦', eventSpan: [21, 4], tip: '大多是夜里的鱼；满月夜，潭底的月亮会来。' },
];

export const SPOT_INDEX: ReadonlyMap<string, number> = new Map(SPOTS.map((s, i) => [s.id, i]));

export function spotIndex(id: string): number {
  const i = SPOT_INDEX.get(id);
  if (i === undefined) throw new Error(`no spot ${id}`);
  return i;
}

/** the farthest water a pond holds (m from the end of the jetty) */
export const REACH_MAX = 44;
/** the half-angle one can cast across (rad) */
export const FAN = (80 * Math.PI) / 180;
/** how far out each water's bands reach (m): the casts of the first build's ten rods, one to each water (its zones are laid out by it) */
const HOME_CAST: readonly number[] = [14, 18, 22, 26, 28, 30, 32, 36, 38, 38];

/**
 * A water's three bands of distance from the end of the jetty (m): near, middle and deep, the further out the later the
 * water: the deep water, where its epic fish and its lord keep, is within the willow's cast at the first water, and at
 * the last all of it within the carbon's alone (the rod that casts furthest, gear.ts).
 */
export function zonesOf(spot: number): readonly (readonly [number, number])[] {
  const c = HOME_CAST[Math.max(0, Math.min(HOME_CAST.length - 1, spot))];
  return [
    [3, c * 0.5],
    [c * 0.5, c * 0.85],
    [c * 0.85, Math.min(REACH_MAX, c * 1.3)],
  ];
}
