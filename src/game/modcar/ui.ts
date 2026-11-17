/**
 * The few words on screen while working on a vehicle (docs/MODCAR.md §5): the mark in the middle and its
 * progress ring, the item cards, the hotbar and the keys (hudItems.ts), the vehicle's own messages, the
 * paint colours, the garage's checklist (as a quest in the top right corner), the cluster while driving,
 * the key card and the loading card.
 *
 * Plain DOM over the canvas, laid out and coloured as Arctic Drive's HUD is (dark smoky glass, white words
 * with a shadow where they stand on the scene), in a cartoon frame: a cream rim, an ink line round it and a
 * hard shadow under (.mc-frame). Drawn for a 1280 × 720 window and scaled with the window, so the words
 * keep their share of the screen on a bigger one.
 */
import type { Text } from '../../core/modcar/types';
import { ItemHud } from './hudItems';

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
.mc-word { position: absolute; left: 50%; top: calc(50% + 30px); transform: translateX(-50%); white-space: nowrap; font-size: 17px; font-weight: 700; text-shadow: var(--say-shadow); }
.mc-word b { color: var(--gold); }
.mc-word small { color: var(--tx-2); margin-left: 6px; font-size: 13px; font-weight: 400; }
.mc-toast { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 8px 20px; white-space: nowrap; font-size: 16px; font-weight: 700; transition: opacity 0.4s; }
.mc-paint { position: absolute; left: calc(50% + 86px); bottom: 26px; display: grid; grid-template-columns: repeat(12, 16px); gap: 7px 6px; padding: 10px 13px; border-radius: 18px; }
.mc-paint i { width: 16px; height: 16px; border-radius: 50%; box-shadow: 0 0 0 2px var(--ink); transition: transform 0.1s; }
.mc-paint i.on { transform: translateY(-4px) scale(1.12); box-shadow: 0 0 0 2px var(--ink), 0 0 0 4.5px var(--rim), 0 0 0 6.5px var(--ink); }
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

/** the keys (docs/MODCAR.md §5.1), as the help card shows them */
const HELP = `<h3>公路旅行 · 车库</h3><div class="lead">把「方糖」装好、加上油，开出车库上路。拿着零件靠近车，能装的地方会亮起来。</div>
<h5>走路</h5><table>
<tr><td class="k"><b>W</b><b>A</b><b>S</b><b>D</b> · 鼠标</td><td class="v">走动、环顾 · <b>Shift</b> 跑（耗体力）· <b>空格</b> 跳 · 按住 <b>P</b> 方便</td></tr>
<tr><td class="k"><b>E</b> / 左键</td><td class="v">拿起看着的东西（放进快捷栏）；对着亮起的幽灵<b>按住</b>装上（已有零件就是替换，旧的到手上）</td></tr>
<tr><td class="k">按住右键 / <b>F</b></td><td class="v">拆下看着的零件；拿着吃的、药：吃，拿着喝的：按住喝</td></tr>
<tr><td class="k"><b>1</b> <b>2</b> · 滚轮</td><td class="v">快捷栏两格（背上背包多几格，数字键换）：按 1、2 换到手上</td></tr>
<tr><td class="k">按住 <b>G</b> · <b>I</b></td><td class="v">把手上的东西放下（看着车：自己塞进车里）· 隐藏 / 显示物品信息卡</td></tr>
<tr><td class="k"><b>E</b> 看着车门、引擎盖</td><td class="v">开 / 关；看着车身 = 上车；拿着东西对着后备箱、车斗：放进去</td></tr>
<tr><td class="k"><b>Tab</b></td><td class="v">车里装着的东西（<b>W</b> <b>S</b> 选，<b>E</b> 拿出来）；身边没车：身上的背包</td></tr>
<tr><td class="k">油桶</td><td class="v">先空手按 E 打开车身侧面的<b>加油口盖</b>，再拿着油桶对准它：油桶自己对上去，按住 E 加油，按住右键抽回</td></tr>
<tr><td class="k">水壶 · 机油壶</td><td class="v">打开引擎盖，对着散热器的<b>蓝色盖子</b> / 发动机的<b>黄色盖子</b>，按住 E 倒进去</td></tr>
<tr><td class="k">喷罐 · 海绵</td><td class="v">对着零件或车身按住左键喷漆 / 擦洗；滚轮换颜色</td></tr>
</table>
<h5>开车</h5><table>
<tr><td class="k"><b>W</b> <b>S</b> · <b>A</b> <b>D</b></td><td class="v">油门 / 刹车（停稳后 S 倒车）· 转向</td></tr>
<tr><td class="k">按住 <b>K</b></td><td class="v">拧钥匙打火；着车时按一下熄火</td></tr>
<tr><td class="k"><b>空格</b></td><td class="v">手刹：按住拉；停稳时长按锁住，再按一下松开</td></tr>
<tr><td class="k"><b>Q</b> <b>Z</b> · <b>M</b></td><td class="v">挡杆 P R N D（手动挡时加 / 减挡）· 手动挡切换</td></tr>
<tr><td class="k"><b>L</b> · <b>H</b> · <b>B</b></td><td class="v">车灯（关 → 近光 → 远光）· 喇叭 · 双闪</td></tr>
<tr><td class="k">鼠标 + 左键</td><td class="v">直接扳手刹杆、拨挡杆、拧钥匙、开收音机（右键换台）、按喇叭、开车门</td></tr>
<tr><td class="k"><b>E</b> · <b>C</b> · <b>R</b></td><td class="v">下车 · 驾驶座 / 车外视角 · 翻车时扶正</td></tr>
</table>
<div class="foot">点击画面开始 · <b>F1</b> 随时打开这张卡 · <b>F2</b> 辅助开关 · <b>\`</b>（1 左边那个键）开发者面板 · 连按 <b>F9</b> 新游戏 · <b>Esc</b> 放开鼠标</div>`;

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
}

export class ModUI {
  readonly root: HTMLDivElement;
  private readonly mark: HTMLDivElement;
  private readonly ring: SVGSVGElement;
  private readonly arc: SVGCircleElement;
  private readonly word: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly paint: HTMLDivElement;
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
    this.word = el('div', 'mc-word', this.root);
    this.items = new ItemHud(this.root);
    this.toast = el('div', 'mc-toast mc-frame', this.root);
    this.paint = el('div', 'mc-paint mc-frame', this.root);
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
    for (const e of [this.word, this.toast, this.paint, this.list, this.dash, this.marker, this.pause, this.help, this.assist]) e.style.display = 'none';
    this.ring.style.display = 'none';
  }

  t(text: Text): string {
    return text[this.lang];
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

  /** the mark, the word under it ("装上 <b>V8</b>"), and the progress ring (−1 = none) */
  prompt(show: boolean, html: string, ring: number): void {
    this.mark.style.display = show ? '' : 'none';
    if (html !== this.lastWord) {
      this.word.innerHTML = html;
      this.lastWord = html;
    }
    this.word.style.display = show && html ? '' : 'none';
    const on = show && ring >= 0;
    this.ring.style.display = on ? '' : 'none';
    if (on) this.arc.setAttribute('stroke-dashoffset', String(113.1 * (1 - Math.min(1, ring))));
  }

  say(text: string, seconds = 3.5): void {
    this.toast.textContent = text;
    this.toast.style.display = '';
    this.toast.style.opacity = '1';
    this.toastT = seconds;
  }

  showPaint(colours: readonly number[] | null, at: number): void {
    if (!colours) {
      this.paint.style.display = 'none';
      return;
    }
    this.paint.style.display = '';
    if (this.paint.childElementCount !== colours.length) {
      this.paint.innerHTML = colours.map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
    }
    [...this.paint.children].forEach((e, i) => e.classList.toggle('on', i === at));
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

  private dashEls: { spd: HTMLElement; gear: HTMLElement; rpm: HTMLElement; rpmT: HTMLElement; fuel: HTMLElement; fuelBar: HTMLElement; temp: HTMLElement; tempT: HTMLElement; lamps: HTMLElement } | null = null;
  private lastLamps = '';

  /** the cluster in the corner while driving (the real gauges are on the dash in the cab) */
  showDash(d: DashView | null): void {
    this.dash.style.display = d ? '' : 'none';
    if (!d) return;
    if (!this.dashEls) {
      this.dash.innerHTML =
        '<div class="spd"></div><div class="unit">km/h</div><div class="gear"></div>' +
        '<div class="col"><div class="row"><div class="bar rpm"><i></i></div><span class="rpmT"></span></div>' +
        '<div class="row">油<div class="bar fuelBar"><i></i></div>水<div class="bar temp"><i></i></div><span class="tempT"></span></div>' +
        '<div class="lamps"></div></div>';
      const q = (sel: string): HTMLElement => this.dash.querySelector(sel) as HTMLElement;
      this.dashEls = { spd: q('.spd'), gear: q('.gear'), rpm: q('.rpm i'), rpmT: q('.rpmT'), fuel: q('.fuelBar i'), fuelBar: q('.fuelBar'), temp: q('.temp i'), tempT: q('.tempT'), lamps: q('.lamps') };
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
      items.map((it, i) => `<div class="row"><b class="k">${i + 1}</b><span class="${it.on ? 'on' : 'off'}">${it.on ? '开' : '关'}</span>${it.label}</div>`).join('') +
      '<div class="foot">按数字键切换 · F2 关闭 · 默认：硬核（手刹要自己松）</div>';
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
  }
}
