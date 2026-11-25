/**
 * The fish roster of the casual fishing module as markdown, from the table itself (src/core/v3/fishing/lite/fish.ts):
 * the design document's §6 is this output. Run: npx tsx harness/sim/fishing_roster.ts
 */
import { FISH, fishOfSpot } from '../../src/core/v3/fishing/lite/fish';
import { fmtHour } from '../../src/core/v3/fishing/lite/progress';
import { SPOTS } from '../../src/core/v3/fishing/lite/spots';
import { BAIT_KIND_ZH, TEMPER_ZH, TIERS } from '../../src/core/v3/fishing/lite/types';

const WEATHER: Record<string, string> = { rain: '雨', clear: '晴' };
const ONLY: Record<string, string> = { rainbow: '雨后彩虹', fog: '晨雾', storm: '雷暴', meteor: '流星雨', sunshower: '太阳雨', afterglow: '火烧云', aurora: '极光', ribbon: '地震云', snow: '初雪', dream: '其余天象鱼都见过后的夜里', moonup: '月亮升起后', fullmoon: '满月夜' };

function hours(mask: number): string {
  if (mask === 15) return '全天';
  return [mask & 1 ? '清晨' : '', mask & 2 ? '白天' : '', mask & 4 ? '黄昏' : '', mask & 8 ? '夜' : ''].filter(Boolean).join('、');
}

const out: string[] = [];
SPOTS.forEach((sp, s) => {
  out.push(`### ${s + 1} ${sp.zh}`, '', `${sp.blurb}（第 ${sp.seed} 号世界，第 ${sp.slot} 段路的${sp.sea ? '灯塔码头' : '栈桥'}）`, '');
  out.push('| 鱼 | 稀有度 | 体长 | 时段 · 天气 | 爱吃 | 性格 | 记忆点 |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const i of fishOfSpot(s)) {
    const f = FISH[i];
    const when = f.only ? `只在${ONLY[f.only]}` : f.span ? `${fmtHour(f.span[0])}–${fmtHour(f.span[1])}` : hours(f.hours);
    const wx = f.weather ? ` · ${WEATHER[f.weather]}` : f.only === 'fullmoon' ? '' : '';
    const eats = f.live ? `只吃活的${FISH.find((x) => x.id === f.live)?.zh}` : f.tier === 5 ? '星屑饵' : BAIT_KIND_ZH[f.eats] + (f.also ? `/${BAIT_KIND_ZH[f.also]}` : '');
    const temper = TEMPER_ZH[f.temper] + (f.slick ? ' · 滑' : '') + (f.wary ? ' · 警觉' : '');
    const size = f.cm[1] >= 100 ? `${(f.cm[0] / 100).toFixed(1)}–${(f.cm[1] / 100).toFixed(1)} m` : `${f.cm[0]}–${f.cm[1]} cm`;
    out.push(`| ${f.zh} | ${TIERS[f.tier].zh} | ${size} | ${when}${wx}${f.span && f.only ? ` · 只在${ONLY[f.only]}` : ''} | ${eats} | ${temper} | ${f.note} |`);
  }
  out.push('');
});
console.log(out.join('\n'));
