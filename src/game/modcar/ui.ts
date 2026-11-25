/**
 * The few words on screen while working on a vehicle (docs/MODCAR.md §5): the mark in the middle and its
 * progress ring, the item cards, the hotbar and the keys (hudItems.ts), the vehicle's own messages, the
 * garage's checklist (as a quest in the top right corner), the cluster while driving,
 * the key card and the loading card.
 *
 * Plain DOM over the canvas, laid out and coloured as Arctic Drive's HUD is (dark smoky glass, white words
 * with a shadow where they stand on the scene), in a cartoon frame: a cream rim, an ink line round it and a
 * hard shadow under (.mc-frame). Drawn for a 1280 × 720 window and scaled with the window, so the words
 * keep their share of the screen on a bigger one.
 */
import type { Text } from '../../core/modcar/types';
import { ASSIST_KEY_NAMES } from './assists';
import { ItemHud } from './hudItems';
import type { Gauges } from './kernel/heldUse';

/** the arcs beside the mark: a circle's (radius ARC_R) span between y 12 and 108 of a 64 × 120 box, its centre off to
 * the side by ARC_D; the half-angle it spans */
const ARC_R = 62;
const ARC_D = Math.sqrt(ARC_R * ARC_R - 48 * 48);
const ARC_HALF = Math.atan2(48, ARC_D);

/** the cartoon frame round every panel: Arctic Drive's dark smoky glass inside a cream rim, an ink line round that and a hard shadow under */
const SMOKE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0125' numOctaves='3' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.11 -0.02'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E")`;
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

const CSS = `
.mc-ui { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; transform-origin: 0 0; pointer-events: none; z-index: 5; color: #fff;
  font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;
  --ink: #17120f; --rim: #efe6d3; --tx-2: #c9c6c0; --tx-3: #8d8a85; --rule: rgba(255,255,255,0.16); --track: #4e4d4c; --gold: #e9c14a;
  --key-font: "Bahnschrift","Arial",sans-serif;
  --smoke: ${SMOKE}; --grain: ${GRAIN};
  --say-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.45); }
.mc-frame { box-sizing: border-box; border-radius: 14px; background: var(--grain), var(--smoke), linear-gradient(180deg, rgba(22,21,20,0.9), rgba(30,29,28,0.86)); border: 3px solid var(--rim); box-shadow: 0 0 0 2.5px var(--ink), 0 6px 0 1px rgba(10,8,6,0.55); }
.mc-mark { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.5); }
.mc-ring { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); }
/* the two arcs round either side of the mark (a held thing's: a fish's stamina, the line's strain — docs/V3/plan/fishing-feel.md
   §4): a dark track with the HUD's cream rim, filled from its foot in the thing's colour, the marks across it, an icon inside;
   low in the view, as DREADMOOR's are, so the fish out on the water stands clear above them (§7) */
.mc-gauge { position: absolute; top: 50%; width: 64px; height: 120px; margin-top: 86px; overflow: visible; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.6)); }
.mc-gauge.l { left: calc(50% - 98px); }
.mc-gauge.r { left: calc(50% + 34px); }
.mc-gauge .rim { fill: none; stroke: rgba(239,230,211,0.62); stroke-width: 12; stroke-linecap: round; }
.mc-gauge .trk { fill: none; stroke: rgba(20,18,16,0.78); stroke-width: 9; stroke-linecap: round; }
.mc-gauge .val { fill: none; stroke-width: 6; stroke-linecap: round; }
.mc-gauge .tick { fill: none; stroke: rgba(239,230,211,0.9); stroke-width: 12; }
.mc-gauge .zone { fill: none; stroke-width: 9; opacity: 0.85; }
.mc-gauge .ico { fill: var(--rim); stroke: var(--rim); }
.mc-gauge.blink .val { animation: mc-blink 0.5s ease-in-out infinite alternate; }
/* the words under each gauge: what is on the line (left), what to do now (right) */
.mc-glabel { position: absolute; top: calc(50% + 212px); white-space: nowrap; font-size: 14px; font-weight: 700; text-shadow: var(--say-shadow); }
.mc-glabel.l { right: calc(50% + 38px); text-align: right; }
.mc-glabel.r { left: calc(50% + 38px); }
.mc-glabel b { color: var(--gold); }
/* a dial's needle over its bands (the line's strain where it is now, as DREADMOOR's has it): from the icon to a bead on the arc */
.mc-gauge .ndl { stroke: #fff; stroke-width: 2.4; stroke-linecap: round; }
.mc-gauge .bead { fill: #fff; stroke: var(--ink); stroke-width: 1.8; }
.mc-gauge.blink .bead, .mc-gauge.blink .ndl { animation: mc-blink 0.3s steps(2) infinite; }
/* the way to pull (docs/V3/plan/fishing-feel.md §7): chevrons out on that side and its key — nudging while idle, gold
   while the pull is working, red and flashing the wrong way */
.mc-pull { position: absolute; top: calc(50% + 126px); display: none; white-space: nowrap; font-weight: 900; color: var(--rim); text-shadow: 0 0 2px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.55); font-family: var(--key-font); line-height: 1; }
.mc-pull.l { right: calc(50% + 100px); }
.mc-pull.r { left: calc(50% + 100px); }
.mc-pull .chev { font-size: 30px; letter-spacing: -5px; vertical-align: middle; }
.mc-pull.l .chev { padding-right: 9px; }
.mc-pull.r .chev { padding-left: 4px; }
.mc-pull .k { display: inline-block; background: rgba(20,18,16,0.6); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.7); font-size: 17px; font-family: "Arial Black","Arial",sans-serif; min-width: 13px; text-align: center; padding: 3px 5px 2px; border: 2px solid currentColor; border-radius: 5px; vertical-align: middle; margin: 0 4px; }
.mc-pull.l.idle { animation: mc-nudge-l 0.8s ease-in-out infinite; }
.mc-pull.r.idle { animation: mc-nudge-r 0.8s ease-in-out infinite; }
.mc-pull.good { color: var(--gold); }
.mc-pull.l.good { animation: mc-nudge-l 0.36s ease-in-out infinite; }
.mc-pull.r.good { animation: mc-nudge-r 0.36s ease-in-out infinite; }
.mc-pull.bad { color: #ff6b5a; animation: mc-flash 0.3s steps(2) infinite; }
@keyframes mc-nudge-l { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-8px); } }
@keyframes mc-nudge-r { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(8px); } }
@keyframes mc-flash { 50% { opacity: 0.25; } }
/* between the arcs' feet: how far off the fish is */
.mc-gnote { position: absolute; left: 50%; top: calc(50% + 174px); transform: translateX(-50%); white-space: nowrap; font-size: 12px; font-weight: 700; color: var(--tx-2); text-shadow: var(--say-shadow); }
.mc-gnote b { color: #fff; font-size: 17px; font-family: var(--key-font); margin-right: 2px; }
/* (and whether it is being brought in, green, or running out, red) */
.mc-gnote i { font-style: normal; font-size: 12px; font-weight: 900; margin-left: 4px; }
.mc-gnote i.in { color: #7fd16b; }
.mc-gnote i.out { color: #ff6b5a; }
@keyframes mc-blink { from { opacity: 1; } to { opacity: 0.25; } }
.mc-word { position: absolute; left: 50%; top: calc(50% + 30px); transform: translateX(-50%); white-space: nowrap; font-size: 17px; font-weight: 700; text-shadow: var(--say-shadow); }
.mc-word b { color: var(--gold); }
.mc-word small { color: var(--tx-2); margin-left: 6px; font-size: 13px; font-weight: 400; }
/* the name of a scenic stretch as one drives into it (docs/V3/nodes/P3-1-journey-world.md): the name, a gold rule, the line under it */
.mc-place { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); padding: 18px 90px 20px; text-align: center; white-space: nowrap; opacity: 0; transition: opacity 1.4s ease; text-shadow: 0 2px 3px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.5); background: radial-gradient(closest-side, rgba(12,10,8,0.42), rgba(12,10,8,0.18) 62%, transparent); }
.mc-place b { display: block; font-size: 50px; line-height: 1.1; font-weight: 800; letter-spacing: 0.16em; padding-left: 0.16em; }
.mc-place i { display: block; width: 240px; height: 2px; margin: 9px auto 8px; background: linear-gradient(90deg, transparent, var(--gold) 30%, var(--gold) 70%, transparent); box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.mc-place small { display: block; font-size: 18px; font-weight: 700; letter-spacing: 0.3em; padding-left: 0.3em; color: #f4ecdb; text-shadow: 0 1px 2px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.7); }
.mc-toast { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 8px 20px; white-space: nowrap; font-size: 16px; font-weight: 700; transition: opacity 0.4s; }
.mc-list { position: absolute; right: 30px; top: 22px; width: 320px; text-align: right; text-shadow: var(--say-shadow); }
.mc-list h4 { margin: 0; padding-bottom: 7px; font-size: 19px; font-weight: 700; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.75)) left bottom / 100% 1.5px no-repeat; }
.mc-list .now { display: flex; justify-content: flex-end; align-items: center; gap: 9px; margin-top: 8px; font-size: 16px; }
.mc-list .ring { position: relative; flex: none; width: 32px; height: 32px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid var(--rim); box-shadow: 0 0 0 2px var(--ink); text-shadow: none; }
.mc-list .ring b { position: absolute; inset: 4px; border-radius: 50%; background: rgba(20,18,16,0.95); font-size: 9.5px; font-weight: 700; line-height: 19px; text-align: center; }
.mc-dash { position: absolute; left: 24px; bottom: 24px; display: flex; align-items: center; gap: 14px; padding: 11px 18px 12px 16px; }
.mc-dash .sp { display: flex; flex-direction: column; align-items: flex-end; min-width: 66px; }
.mc-dash .spd { font-size: 40px; line-height: 0.95; font-weight: 700; letter-spacing: -0.02em; }
.mc-dash .unit { margin-top: 3px; font-size: 12px; color: var(--tx-2); }
.mc-dash .gear { min-width: 32px; padding: 4px 6px; border-radius: 8px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 19px/1 var(--key-font); text-align: center; }
.mc-dash .col { display: flex; flex-direction: column; gap: 7px; min-width: 150px; }
.mc-dash .row { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--tx-2); }
.mc-dash .rpmT, .mc-dash .tempT { min-width: 34px; text-align: right; color: #fff; font-weight: 700; }
.mc-dash .bar { position: relative; flex: 1; height: 8px; border-radius: 999px; background: var(--track); overflow: hidden; }
.mc-dash .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: #f2efe8; }
.mc-dash .bar.red i { background: #ff6b5a; }
.mc-dash .bar.fuelBar i { background: #ff9a2a; }
.mc-dash .bar.temp i { background: #4f9cf2; }
.mc-dash .bar.low i { background: #ff6b5a; }
.mc-dash .lamps { display: flex; gap: 5px; min-height: 19px; }
.mc-dash .lamps span { padding: 0 8px; border-radius: 999px; background: rgba(255,255,255,0.09); color: var(--tx-3); font-size: 12px; line-height: 19px; }
.mc-dash .lamps span.on { background: #f2efe8; color: var(--ink); font-weight: 700; }
.mc-dash .lamps span.warn { background: #ff6b5a; color: #fff; font-weight: 700; }
.mc-dash .tyres { display: grid; grid-template-columns: 9px 9px; grid-template-rows: 15px 15px; column-gap: 12px; row-gap: 10px; padding: 3px 6px; border-radius: 9px; background: rgba(255,255,255,0.06); position: relative; }
.mc-dash .tyres::before { content: ''; position: absolute; left: 50%; top: 6px; bottom: 6px; width: 8px; margin-left: -4px; border-radius: 3px; background: rgba(255,255,255,0.13); }
.mc-dash .tyres i { display: block; border-radius: 3px; border: 1.5px solid var(--ink); box-shadow: 0 1px 0 var(--ink); }
.mc-dash .tyres i.s0 { background: #55cf6a; }
.mc-dash .tyres i.s1 { background: #b9d94f; }
.mc-dash .tyres i.s2 { background: #f0b43a; }
.mc-dash .tyres i.s3 { background: #ff6b5a; }
.mc-dash .tyres i.flat { background: #2a1512; border-color: #ff6b5a; animation: mc-blink 0.8s steps(2) infinite; }
.mc-dash .tyres i.none { background: transparent; border-style: dashed; opacity: 0.5; }
.mc-dash.compact { gap: 10px; padding: 9px 14px 10px 14px; }
.mc-dash.compact .gear, .mc-dash.compact .tyres, .mc-dash.compact .lamps, .mc-dash.compact .revs, .mc-dash.compact .wl, .mc-dash.compact .temp, .mc-dash.compact .tempT { display: none; }
.mc-dash.compact .col { min-width: 96px; }
@keyframes mc-blink { 50% { opacity: 0.35; } }
.mc-fade { position: absolute; z-index: 5; inset: 0; background: #0b0a09; opacity: 0; transition: opacity 0.6s; }
.mc-help, .mc-assist { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); max-height: calc(100% - 40px); overflow: auto; font-size: 14.5px; line-height: 1.55; }
.mc-help { width: min(660px, calc(100% - 32px)); padding: 16px 22px 14px; }
.mc-assist { width: min(440px, calc(100% - 32px)); padding: 16px 22px 12px; }
.mc-help h3, .mc-assist h3 { margin: 0 0 3px; font-size: 21px; font-weight: 700; }
.mc-help .lead { color: var(--tx-2); margin-bottom: 4px; }
.mc-help h5 { margin: 12px 0 4px; padding-bottom: 5px; border-bottom: 1px solid var(--rule); font-size: 13.5px; font-weight: 400; color: var(--tx-2); }
.mc-help table { width: 100%; border-collapse: collapse; }
.mc-help td { padding: 3px 0; vertical-align: top; }
.mc-help td.k { width: 172px; white-space: nowrap; font-weight: 700; }
.mc-help td.v { color: #ece9e3; }
.mc-help td.v b { color: var(--gold); }
.mc-help td.k b, .mc-help .foot b, .mc-assist b.k { display: inline-flex; align-items: center; justify-content: center; min-width: 23px; height: 23px; margin-right: 3px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 13px/1 var(--key-font); vertical-align: middle; }
.mc-help .foot, .mc-assist .foot { margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--rule); color: var(--tx-2); font-size: 13px; text-align: center; }
.mc-assist .row { display: flex; gap: 10px; align-items: center; padding: 4px 0; }
.mc-assist span.on, .mc-assist span.off { min-width: 30px; padding: 0 8px; border-radius: 999px; font-size: 13px; font-weight: 700; line-height: 21px; text-align: center; }
.mc-assist span.on { background: #f2efe8; color: var(--ink); }
.mc-assist span.off { background: rgba(255,255,255,0.09); color: var(--tx-3); }
.mc-load { position: absolute; z-index: 6; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--grain), var(--smoke) 0 0 / 1600px 1600px, #181716; transition: opacity 0.8s; }
.mc-load .box { width: min(400px, calc(100% - 48px)); text-align: center; }
.mc-load h2 { margin: 0 0 6px; font-size: 34px; font-weight: 700; letter-spacing: 0.08em; }
.mc-load .sub { color: var(--tx-2); font-size: 15px; margin-bottom: 22px; }
.mc-load .bar { height: 14px; padding: 0; border-radius: 999px; overflow: hidden; }
.mc-load .bar i { display: block; height: 100%; width: 0; border-radius: 999px; background: #f2efe8; transition: width 0.2s; }
.mc-load .what { margin-top: 12px; color: var(--tx-3); font-size: 13px; }
.mc-pause { position: absolute; z-index: 4; left: 50%; top: 64%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 999px; white-space: nowrap; font-size: 16px; font-weight: 700; }
.mc-pause b { display: inline-flex; align-items: center; justify-content: center; min-width: 23px; height: 23px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 13px/1 var(--key-font); }
.mc-pause i { font-style: normal; color: var(--tx-3); font-weight: 400; }
.mc-marker { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; white-space: nowrap; font-size: 15px; font-weight: 700; text-shadow: var(--say-shadow); }
.mc-marker svg { width: 22px; height: 26px; margin-top: 3px; filter: drop-shadow(0 2px 0 rgba(10,8,6,0.5)); animation: mc-bob 1.6s ease-in-out infinite; }
.mc-marker.edge svg path.f { fill: #f2efe8; }
.mc-marker.dim { opacity: 0.32; }
@keyframes mc-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
`;

/** the keys (docs/MODCAR.md §5.1), as the help card shows them: a key and a word (docs/V3/plan/prompts.md §五) */
export const HELP = `<h3>按键</h3>
<table>
<tr><td class="k">左键</td><td class="v">拿 · 开 · 用　按住：装 · 拆 · 倒 · 喷</td></tr>
<tr><td class="k">右键</td><td class="v">用手里的东西</td></tr>
<tr><td class="k">滚轮</td><td class="v">换格 · 调</td></tr>
<tr><td class="k"><b>Q</b></td><td class="v">放下 · 收起来　按住：下车</td></tr>
<tr><td class="k"><b>R</b></td><td class="v">仔细摆　摆的时候 <b>Q</b> <b>E</b> 转</td></tr>
<tr><td class="k"><b>Tab</b></td><td class="v">身上 · 车上 · 菜谱</td></tr>
<tr><td class="k"><b>V</b></td><td class="v">换视角</td></tr>
<tr><td class="k"><b>W</b><b>A</b><b>S</b><b>D</b> · <b>空格</b> · <b>Shift</b> · <b>C</b></td><td class="v">走、开车 · 跳、手刹 · 跑 · 蹲</td></tr>
<tr><td class="k"><b>Esc</b></td><td class="v">菜单</td></tr>
</table>
<div class="foot">点击开始 · <b>F1</b> 按键</div>`;

/** the marker's flag: a gold pennant on a pole, in the cartoon ink */
const FLAG = '<svg viewBox="0 0 22 26"><path d="M5 24.5V2.5" stroke="#17120f" stroke-width="3.2" stroke-linecap="round" fill="none" /><path d="M5 24.5V2.5" stroke="#efe6d3" stroke-width="1.4" stroke-linecap="round" fill="none" /><path class="f" d="M6 3h13l-3.6 4.6L19 12.2H6z" fill="#e9c14a" stroke="#17120f" stroke-width="2.2" stroke-linejoin="round" /></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** what the little instrument cluster shows */
export interface DashView {
  kmh: number;
  gear: string;
  /** 0…1 of the redline */
  rpm: number;
  rpmText: string;
  fuel: number;
  /** 0…1 from cold to the seizing point */
  temp: number;
  tempText: string;
  battery: number;
  running: boolean;
  handbrake: boolean;
  lights: 'off' | 'low' | 'high';
  warn: { battery: boolean; oil: boolean; temp: boolean; fuel: boolean; check: boolean };
  /** the four tyres (FL, FR, RL, RR, as seen from above): their stage (0 new … 3 "good luck", tyres.ts), −1 none, 4 blown */
  tyres?: number[];
  /** the speed and the fuel alone (seen from outside the vehicle, the instruments in the cab out of sight) */
  compact?: boolean;
}

export class ModUI {
  readonly root: HTMLDivElement;
  private readonly mark: HTMLDivElement;
  private readonly ring: SVGSVGElement;
  private readonly arc: SVGCircleElement;
  private readonly word: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly place: HTMLDivElement;
  private placeT = 0;
  private readonly list: HTMLDivElement;
  private readonly dash: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly assist: HTMLDivElement;
  private readonly load: HTMLDivElement;
  /** the item cards, the hotbar, the keys (hudItems.ts) */
  readonly items: ItemHud;
  private toastT = 0;
  /** the HUD's scale: the window against the 1280 × 720 it is drawn for */
  private scale = 1;
  private lastMarker = '';
  private lastWord = '';
  private readonly gauge: { el: SVGSVGElement; val: SVGPathElement; ticks: SVGGElement; ico: SVGGElement; ndl: SVGLineElement; bead: SVGCircleElement; label: HTMLDivElement; key: string }[] = [];
  /** the way to pull (an arrow out on either side) and the note between the arcs */
  private readonly pullCue: HTMLDivElement[] = [];
  private pullKey = '';
  private gnote!: HTMLDivElement;
  private gnoteKey = '';
  private gaugeSaid = false;
  private lastList = '';
  lang: 'zh' | 'en' = 'zh';

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'mc-ui', document.body);
    this.fitScreen();
    window.addEventListener('resize', () => this.fitScreen());
    this.mark = el('div', 'mc-mark', this.root);
    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.setAttribute('class', 'mc-ring');
    this.ring.setAttribute('viewBox', '0 0 46 46');
    const bg = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '23', cy: '23', r: '18', fill: 'none', stroke: 'rgba(20,18,16,0.7)', 'stroke-width': '5' })) bg.setAttribute(k, v);
    this.arc = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '23', cy: '23', r: '18', fill: 'none', stroke: '#f2efe8', 'stroke-width': '4', 'stroke-linecap': 'round', transform: 'rotate(-90 23 23)', 'stroke-dasharray': '113.1', 'stroke-dashoffset': '113.1' })) this.arc.setAttribute(k, v);
    this.ring.appendChild(bg);
    this.ring.appendChild(this.arc);
    this.root.appendChild(this.ring);
    // the two arcs beside the mark: the left bulging left (a fish inside it), the right bulging right (a reel inside it)
    for (const side of ['l', 'r']) {
      const g = document.createElementNS(ns, 'svg');
      g.setAttribute('class', `mc-gauge ${side}`);
      g.setAttribute('viewBox', '0 0 64 120');
      g.style.display = 'none';
      const d = side === 'l' ? 'M 50.8 108 A 62 62 0 0 1 50.8 12' : 'M 13.2 108 A 62 62 0 0 0 13.2 12';
      const path = (cls: string): SVGPathElement => {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('class', cls);
        p.setAttribute('d', d);
        p.setAttribute('pathLength', '100');
        g.appendChild(p);
        return p;
      };
      path('rim');
      path('trk');
      const ticks = document.createElementNS(ns, 'g');
      g.appendChild(ticks);
      const val = path('val');
      const ico = document.createElementNS(ns, 'g');
      ico.setAttribute('class', 'ico');
      ico.innerHTML =
        side === 'l'
          ? '<path d="M 41 60 Q 47 52.5 56 60 Q 47 67.5 41 60 Z M 41.5 60 L 35 55 L 35 65 Z" stroke-width="0.6"/>'
          : '<circle cx="22" cy="60" r="6" fill="none" stroke-width="2.2"/><circle cx="22" cy="60" r="1.8"/><path d="M 22 60 L 28.5 53.5" stroke-width="2.2" fill="none"/>';
      g.appendChild(ico);
      // (a dial's needle: from the icon out to a bead on the arc)
      const ndl = document.createElementNS(ns, 'line');
      ndl.setAttribute('class', 'ndl');
      const bead = document.createElementNS(ns, 'circle');
      bead.setAttribute('class', 'bead');
      bead.setAttribute('r', '5.2');
      ndl.style.display = bead.style.display = 'none';
      g.appendChild(ndl);
      g.appendChild(bead);
      this.root.appendChild(g);
      const label = el('div', `mc-glabel ${side}`, this.root);
      label.style.display = 'none';
      this.gauge.push({ el: g, val, ticks, ico, ndl, bead, label, key: '' });
      const cue = el('div', `mc-pull ${side}`, this.root);
      this.pullCue.push(cue);
    }
    this.gnote = el('div', 'mc-gnote', this.root);
    this.gnote.style.display = 'none';
    this.word = el('div', 'mc-word', this.root);
    this.items = new ItemHud(this.root);
    this.toast = el('div', 'mc-toast mc-frame', this.root);
    this.place = el('div', 'mc-place', this.root);
    this.list = el('div', 'mc-list', this.root);
    this.dash = el('div', 'mc-dash mc-frame', this.root);
    this.marker = el('div', 'mc-marker', this.root);
    this.pause = el('div', 'mc-pause mc-frame', this.root);
    this.pause.innerHTML = '点击画面继续 <i>·</i> <b>F1</b> 按键';
    this.help = el('div', 'mc-help mc-frame', this.root);
    this.help.innerHTML = HELP;
    this.assist = el('div', 'mc-assist mc-frame', this.root);
    this.fade = el('div', 'mc-fade', this.root);
    this.load = el('div', 'mc-load', this.root);
    this.load.innerHTML = '<div class="box"><h2>公路旅行</h2><div class="sub">前方三百公里，再无修理厂</div><div class="bar mc-frame"><i></i></div><div class="what">正在把零件搬进车库……</div></div>';
    this.load.style.display = 'none';
    for (const e of [this.word, this.toast, this.list, this.dash, this.marker, this.pause, this.help, this.assist]) e.style.display = 'none';
    this.ring.style.display = 'none';
  }

  t(text: Text): string {
    return text[this.lang];
  }

  /** the HUD's scale (window px per HUD px): a point of the window over it is in HUD px */
  get hudScale(): number {
    return this.scale;
  }

  /** the HUD drawn for 1280 × 720 and scaled to the window (never below 0.7 or above 3) */
  private fitScreen(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.min(3, Math.max(0.7, Math.min(w / 1280, h / 720)));
    this.scale = s;
    this.root.style.width = `${w / s}px`;
    this.root.style.height = `${h / s}px`;
    this.root.style.transform = s === 1 ? '' : `scale(${s})`;
  }

  /** the mark, the word under it ("装上 <b>V8</b>"), and the progress ring (−1 = none) in its colour (absent: the usual white; a rod's line under strain: gold, then red) */
  prompt(show: boolean, html: string, ring: number, colour?: string): void {
    this.mark.style.display = show ? '' : 'none';
    // (the bars beside the mark are a held thing's, said each frame after the mark: gauges(); not said since the last frame, gone)
    if (!this.gaugeSaid) this.gauges(null);
    this.gaugeSaid = false;
    if (html !== this.lastWord) {
      this.word.innerHTML = html;
      this.lastWord = html;
    }
    this.word.style.display = show && html ? '' : 'none';
    const on = show && ring >= 0;
    this.ring.style.display = on ? '' : 'none';
    if (on) this.arc.setAttribute('stroke-dashoffset', String(113.1 * (1 - Math.min(1, ring))));
    const c = colour ?? '#f2efe8';
    if (c !== this.ringColour) {
      this.ringColour = c;
      this.arc.setAttribute('stroke', c);
    }
  }

  private ringColour = '#f2efe8';

  /** the two slim bars beside the mark, left and right (null: none), the way to pull and the note; said each frame after prompt() */
  gauges(g: Gauges | null): void {
    this.gaugeSaid = !!g;
    // the way to pull: an arrow out on that side with its key
    const pull = g?.pull ?? null;
    const pk = pull ? `${pull.side}|${pull.state}|${pull.key}` : '';
    if (pk !== this.pullKey) {
      this.pullKey = pk;
      for (let i = 0; i < 2; i++) {
        const cue = this.pullCue[i];
        const on = !!pull && (i === 0 ? pull.side < 0 : pull.side > 0);
        cue.style.display = on ? 'block' : 'none';
        if (!on || !pull) continue;
        cue.className = `mc-pull ${i === 0 ? 'l' : 'r'} ${pull.state}`;
        cue.innerHTML = i === 0 ? `<span class="chev">❮❮❮</span><span class="k">${pull.key}</span>` : `<span class="k">${pull.key}</span><span class="chev">❯❯❯</span>`;
      }
    }
    const note = g?.note ?? '';
    if (note !== this.gnoteKey) {
      this.gnoteKey = note;
      this.gnote.innerHTML = note;
      this.gnote.style.display = note ? '' : 'none';
    }
    const two = [g?.left ?? null, g?.right ?? null];
    for (let i = 0; i < 2; i++) {
      const v = two[i];
      const slot = this.gauge[i];
      if (!slot) continue;
      if (!v) {
        if (slot.key !== '') {
          slot.key = '';
          slot.el.style.display = 'none';
          slot.label.style.display = 'none';
        }
        continue;
      }
      const pct = Math.round(Math.max(0, Math.min(1, v.value)) * (v.needle ? 400 : 200)) / (v.needle ? 4 : 2);
      const zones = v.zones?.map((z) => `${z.from}-${z.to}-${z.colour}`).join(',') ?? '';
      const key = `${pct}|${v.colour}|${v.blink ? 1 : 0}|${v.ticks?.join(',') ?? ''}~${zones}|${v.icon ?? ''}|${v.label ?? ''}|${v.needle ? 1 : 0}`;
      if (key === slot.key) continue;
      const was = slot.key;
      slot.key = key;
      slot.el.style.display = '';
      // (the arc's length is 100: so much of it drawn from its foot; a dial: no fill, the needle at the value)
      slot.val.style.strokeDasharray = pct > 0 && !v.needle ? `${pct} 200` : '0 200';
      // (nothing to fill: no dot of its round end left at the foot to be taken for a second mark)
      slot.val.style.display = pct > 0 && !v.needle ? '' : 'none';
      slot.val.style.stroke = v.colour;
      slot.ndl.style.display = slot.bead.style.display = v.needle ? '' : 'none';
      if (v.needle) {
        // (the arc's circle: its centre off to the left of the right box, to the right of the left one; the foot at +ARC_HALF)
        const right = i === 1;
        const cx = right ? 13.2 - ARC_D : 50.8 + ARC_D;
        const a = right ? ARC_HALF - (pct / 100) * 2 * ARC_HALF : Math.PI - ARC_HALF + (pct / 100) * 2 * ARC_HALF;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        slot.ndl.setAttribute('x1', (cx + (ARC_R - 14) * c).toFixed(2));
        slot.ndl.setAttribute('y1', (60 + (ARC_R - 14) * sn).toFixed(2));
        slot.ndl.setAttribute('x2', (cx + (ARC_R - 4) * c).toFixed(2));
        slot.ndl.setAttribute('y2', (60 + (ARC_R - 4) * sn).toFixed(2));
        slot.bead.setAttribute('cx', (cx + ARC_R * c).toFixed(2));
        slot.bead.setAttribute('cy', (60 + ARC_R * sn).toFixed(2));
        slot.bead.style.fill = v.colour;
      }
      slot.el.classList.toggle('blink', !!v.blink);
      slot.ico.style.fill = slot.ico.style.stroke = v.icon ?? '';
      if (v.label) {
        if (slot.label.innerHTML !== v.label) slot.label.innerHTML = v.label;
        slot.label.style.display = '';
      } else slot.label.style.display = 'none';
      const ticks = `${v.ticks?.join(',') ?? ''}~${zones}`;
      if (was.split('|')[3] !== ticks || was === '') {
        slot.ticks.innerHTML = '';
        const d = slot.el.querySelector('path')?.getAttribute('d') ?? '';
        // (the track's bands under the fill: where the strain turns gold, then red)
        for (const z of v.zones ?? []) {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('class', 'zone');
          p.setAttribute('d', d);
          p.setAttribute('pathLength', '100');
          p.style.stroke = z.colour;
          p.style.strokeDasharray = `0 ${z.from * 100} ${Math.max(0, (z.to - z.from) * 100)} 200`;
          slot.ticks.appendChild(p);
        }
        for (const t of v.ticks ?? []) {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('class', 'tick');
          p.setAttribute('d', d);
          p.setAttribute('pathLength', '100');
          p.style.strokeDasharray = `0 ${Math.max(0, t * 100 - 0.7)} 1.4 200`;
          slot.ticks.appendChild(p);
        }
      }
    }
  }

  /** the line at the top taken down now (what it said is over: a fish is out of the water) */
  hush(): void {
    this.toastT = 0;
    this.toast.style.opacity = '0';
  }

  say(text: string, seconds = 3.5): void {
    this.toast.textContent = text;
    this.toast.style.display = '';
    this.toast.style.opacity = '1';
    this.toastT = seconds;
  }

  /** the name of the scenic stretch one drives into, and the line under it (北烛原 · 极光冻原), for some seconds before it fades */
  showPlace(name: string, tag: string, seconds = 5.5): void {
    this.place.innerHTML = `<b>${name}</b><i></i><small>${tag}</small>`;
    this.place.style.opacity = '1';
    this.placeT = seconds;
  }

  /** is a place's name on the screen (or fading) */
  get placeShown(): boolean {
    return this.placeT > 0;
  }

  showList(title: string | null, items: { text: string; done: boolean; now: boolean }[]): void {
    if (!title) {
      this.list.style.display = 'none';
      this.items.topRight = 0;
      this.lastList = '';
      return;
    }
    const key = title + JSON.stringify(items);
    this.list.style.display = '';
    if (key === this.lastList) return;
    this.lastList = key;
    const done = items.filter((i) => i.done).length;
    const now = items.find((i) => i.now) ?? items.find((i) => !i.done);
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    this.list.innerHTML =
      `<h4>${title}</h4><div class="now"><span>${now ? now.text : '全部完成'}</span>` +
      `<span class="ring" style="background: conic-gradient(#8ad46a 0 ${pct}%, rgba(20,18,16,0.88) ${pct}% 100%)"><b>${pct}%</b></span></div>`;
    // (the held card keeps below it)
    this.items.topRight = this.list.offsetTop + this.list.offsetHeight;
  }

  private dashEls: { spd: HTMLElement; gear: HTMLElement; rpm: HTMLElement; rpmT: HTMLElement; fuel: HTMLElement; fuelBar: HTMLElement; temp: HTMLElement; tempT: HTMLElement; lamps: HTMLElement; tyres: HTMLElement } | null = null;
  private lastLamps = '';
  private lastTyres = '';

  /** the cluster in the corner while driving (the real gauges are on the dash in the cab) */
  showDash(d: DashView | null): void {
    this.dash.style.display = d ? '' : 'none';
    if (!d) return;
    this.dash.classList.toggle('compact', !!d.compact);
    if (!this.dashEls) {
      this.dash.innerHTML =
        '<div class="spd"></div><div class="unit">km/h</div><div class="gear"></div>' +
        '<div class="col"><div class="row revs"><div class="bar rpm"><i></i></div><span class="rpmT"></span></div>' +
        '<div class="row">油<div class="bar fuelBar"><i></i></div><span class="wl">水</span><div class="bar temp"><i></i></div><span class="tempT"></span></div>' +
        '<div class="lamps"></div></div><div class="tyres" title="轮胎"></div>';
      const q = (sel: string): HTMLElement => this.dash.querySelector(sel) as HTMLElement;
      this.dashEls = { spd: q('.spd'), gear: q('.gear'), rpm: q('.rpm i'), rpmT: q('.rpmT'), fuel: q('.fuelBar i'), fuelBar: q('.fuelBar'), temp: q('.temp i'), tempT: q('.tempT'), lamps: q('.lamps'), tyres: q('.tyres') };
    }
    const e = this.dashEls;
    e.spd.textContent = Math.abs(d.kmh).toFixed(0);
    e.gear.textContent = d.gear;
    e.rpm.style.width = `${(Math.min(1, Math.max(0, d.rpm)) * 100).toFixed(1)}%`;
    e.rpmT.textContent = d.rpmText;
    e.fuel.style.width = `${(Math.min(1, Math.max(0, d.fuel)) * 100).toFixed(1)}%`;
    e.fuelBar.classList.toggle('low', d.fuel < 0.12);
    e.temp.style.width = `${(Math.min(1, Math.max(0, d.temp)) * 100).toFixed(1)}%`;
    e.tempT.textContent = d.tempText;
    const lamp = (on: boolean, text: string, cls = 'on'): string => `<span class="${on ? cls : ''}">${text}</span>`;
    const lamps =
      lamp(d.handbrake, '手刹') +
      lamp(d.lights !== 'off', d.lights === 'high' ? '远光' : '车灯') +
      lamp(!d.running, '熄火', 'warn') +
      (d.warn.battery ? lamp(true, '电瓶', 'warn') : '') +
      (d.warn.oil ? lamp(true, '机油', 'warn') : '') +
      (d.warn.temp ? lamp(true, '水温', 'warn') : '') +
      (d.warn.fuel ? lamp(true, '油量', 'warn') : '');
    if (lamps !== this.lastLamps) {
      e.lamps.innerHTML = lamps;
      this.lastLamps = lamps;
    }
    // the four tyres from above, in their stages' colours (a blown one blinks)
    const ty = (d.tyres ?? []).map((s) => (s < 0 ? 'none' : s >= 4 ? 'flat' : `s${s}`)).join(' ');
    if (ty !== this.lastTyres) {
      this.lastTyres = ty;
      e.tyres.style.display = d.tyres ? '' : 'none';
      e.tyres.innerHTML = (d.tyres ?? []).map((s) => `<i class="${s < 0 ? 'none' : s >= 4 ? 'flat' : `s${s}`}"></i>`).join('');
    }
  }

  /** the assists (F2): their names and whether each is on; null = hide */
  showAssists(items: { label: string; on: boolean }[] | null): void {
    if (!items) {
      this.assist.style.display = 'none';
      return;
    }
    this.assist.style.display = '';
    this.assist.innerHTML =
      '<h3>辅助开关</h3>' +
      items.map((it, i) => `<div class="row"><b class="k">${ASSIST_KEY_NAMES[i] ?? '·'}</b><span class="${it.on ? 'on' : 'off'}">${it.on ? '开' : '关'}</span>${it.label}</div>`).join('') +
      '<div class="foot">按左边的键切换 · F2 关闭 · 默认：硬核（手刹要自己松）</div>';
  }

  get assistsShown(): boolean {
    return this.assist.style.display !== 'none';
  }

  /** the loading card: 0…1 of the way, or null to fade it out */
  showLoading(f: number | null): void {
    if (f === null) {
      if (this.load.style.display === 'none') return;
      this.load.style.opacity = '0';
      setTimeout(() => (this.load.style.display = 'none'), 850);
      return;
    }
    this.load.style.display = '';
    this.load.style.opacity = '1';
    (this.load.querySelector('.bar i') as HTMLElement).style.width = `${(Math.min(1, Math.max(0, f)) * 100).toFixed(0)}%`;
  }

  /** the key card (at the start, and on F1) */
  showHelp(on: boolean): void {
    this.help.style.display = on ? '' : 'none';
  }

  get helpShown(): boolean {
    return this.help.style.display !== 'none';
  }

  /** the line that says the game waits for a click (the mouse let go) */
  showPause(on: boolean): void {
    this.pause.style.display = on ? '' : 'none';
  }

  /**
   * The next thing to go for (the checklist's step): a small bobbing diamond over it with a word, at
   * screen pixels; edge = it is off screen and the marker sits at the edge on its side. null = none.
   */
  showMarker(m: { x: number; y: number; text: string; edge: boolean; dim?: boolean } | null): void {
    if (!m) {
      this.marker.style.display = 'none';
      return;
    }
    this.marker.style.display = '';
    const x = m.x / this.scale;
    let y = m.y / this.scale;
    // (held at the edge of the screen: below the quest in the top right corner, not over it)
    if (m.edge && this.items.topRight > 0 && x > window.innerWidth / this.scale - 380) y = Math.max(y, this.items.topRight + 64);
    this.marker.style.left = `${x.toFixed(0)}px`;
    this.marker.style.top = `${y.toFixed(0)}px`;
    const key = `${m.text}|${m.edge}|${!!m.dim}`;
    if (key !== this.lastMarker) {
      this.lastMarker = key;
      this.marker.className = `mc-marker${m.edge ? ' edge' : ''}${m.dim ? ' dim' : ''}`;
      this.marker.innerHTML = `${m.text ? `<span>${m.text}</span>` : ''}${FLAG}`;
    }
  }

  /** 0 = clear … 1 = black (the garage door to the road) */
  setFade(v: number): void {
    this.fade.style.opacity = String(v);
  }

  update(dt: number): void {
    this.items.update(dt);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast.style.opacity = '0';
    }
    if (this.placeT > 0) {
      this.placeT -= dt;
      if (this.placeT <= 0) this.place.style.opacity = '0';
    }
  }
}
