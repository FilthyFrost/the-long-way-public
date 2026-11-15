/**
 * The few words on screen while working on a vehicle (docs/MODCAR.md §5): the mark in the middle with
 * the one thing E / the mouse would do and its progress ring, the stat card beside a ghost, the
 * vehicle's own messages, what is in the hands, the paint colour, and the garage's checklist.
 *
 * Plain DOM over the canvas, styled like a note pinned to a workshop board: cream paper, dark ink.
 */
import type { StatLine } from '../../core/modcar/stats';
import type { Text } from '../../core/modcar/types';

const CSS = `
.mc-ui { position: fixed; inset: 0; pointer-events: none; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; color: #2b2622; z-index: 5; }
.mc-mark { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,250,236,0.9); box-shadow: 0 0 0 1.5px rgba(40,30,24,0.55); }
.mc-ring { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; }
.mc-word { position: absolute; left: 50%; top: calc(50% + 30px); transform: translateX(-50%); padding: 4px 12px; border-radius: 12px; background: rgba(250,244,228,0.92); box-shadow: 0 2px 0 rgba(60,40,24,0.25); font-size: 15px; white-space: nowrap; }
.mc-word b { color: #a3472e; font-weight: 600; }
.mc-word small { color: #7a6a5a; margin-left: 6px; font-size: 12px; }
.mc-card { position: absolute; left: calc(50% + 110px); top: calc(50% - 170px); width: 236px; padding: 10px 12px 8px; border-radius: 10px; background: rgba(250,244,228,0.95); box-shadow: 0 3px 0 rgba(60,40,24,0.22), 0 0 0 1px rgba(60,40,24,0.12); font-size: 13px; }
.mc-card h4 { margin: 0 0 2px; font-size: 15px; }
.mc-card .sub { color: #7a6a5a; font-size: 12px; margin-bottom: 6px; }
.mc-card table { width: 100%; border-collapse: collapse; }
.mc-card td { padding: 1px 0; }
.mc-card td.k { color: #6a5a4a; width: 56px; }
.mc-card td.v { text-align: right; font-variant-numeric: tabular-nums; }
.mc-card .up { color: #3f7d3a; } .mc-card .down { color: #c0602a; } .mc-card .same { color: #7a6a5a; }
.mc-card .warn { margin-top: 6px; color: #b0482a; font-size: 12px; }
.mc-toast { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 6px 16px; border-radius: 14px; background: rgba(43,38,34,0.82); color: #fbf3e1; font-size: 15px; transition: opacity 0.4s; }
.mc-held { position: absolute; right: 22px; bottom: 22px; padding: 6px 12px; border-radius: 10px; background: rgba(250,244,228,0.9); font-size: 13px; box-shadow: 0 2px 0 rgba(60,40,24,0.2); }
.mc-held small { color: #7a6a5a; display: block; }
.mc-paint { position: absolute; right: 22px; bottom: 70px; display: flex; gap: 3px; }
.mc-paint i { width: 14px; height: 22px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(40,30,24,0.3); }
.mc-paint i.on { transform: translateY(-5px); box-shadow: 0 0 0 2px #2b2622; }
.mc-list { position: absolute; left: 22px; top: 22px; min-width: 210px; padding: 10px 14px; border-radius: 10px; background: rgba(250,244,228,0.92); box-shadow: 0 3px 0 rgba(60,40,24,0.22); font-size: 14px; }
.mc-list h4 { margin: 0 0 6px; font-size: 15px; }
.mc-list div { margin: 2px 0; } .mc-list .done { color: #7a8a6a; text-decoration: line-through; } .mc-list .now { color: #a3472e; font-weight: 600; }
.mc-dash { position: absolute; left: 22px; bottom: 22px; display: flex; align-items: flex-end; gap: 12px; padding: 8px 14px 8px 12px; border-radius: 14px; background: rgba(36,31,28,0.72); color: #fbf3e1; font-variant-numeric: tabular-nums; box-shadow: 0 2px 0 rgba(0,0,0,0.25); }
.mc-dash .spd { font-size: 34px; line-height: 0.9; font-weight: 600; min-width: 62px; text-align: right; letter-spacing: -0.02em; }
.mc-dash .unit { font-size: 11px; color: #c9bba6; margin-left: -8px; margin-bottom: 2px; }
.mc-dash .gear { min-width: 30px; padding: 2px 6px; border-radius: 7px; background: #fbf3e1; color: #2b2622; font-size: 18px; font-weight: 700; text-align: center; margin-bottom: 1px; }
.mc-dash .col { display: flex; flex-direction: column; gap: 4px; min-width: 116px; }
.mc-dash .row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #c9bba6; }
.mc-dash .bar { position: relative; flex: 1; height: 5px; border-radius: 3px; background: rgba(251,243,225,0.16); overflow: hidden; }
.mc-dash .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #f3e3c0; }
.mc-dash .bar.rpm i { background: linear-gradient(90deg, #f3e3c0 80%, #e2704a 100%); }
.mc-dash .bar.low i { background: #e2704a; }
.mc-dash .lamps { display: flex; gap: 5px; font-size: 11px; min-height: 15px; }
.mc-dash .lamps span { padding: 0 5px; border-radius: 4px; background: rgba(251,243,225,0.12); color: #8f8270; }
.mc-dash .lamps span.on { background: #f3c35a; color: #2b2622; }
.mc-dash .lamps span.warn { background: #e2704a; color: #fff6e6; }
.mc-fade { position: absolute; inset: 0; background: #0e0c0a; opacity: 0; transition: opacity 0.6s; }
.mc-help { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; padding: 16px 20px 12px; border-radius: 14px; background: rgba(250,244,228,0.96); box-shadow: 0 4px 0 rgba(60,40,24,0.25), 0 0 0 1px rgba(60,40,24,0.12); font-size: 14px; line-height: 1.55; }
.mc-help h3 { margin: 0 0 2px; font-size: 18px; }
.mc-help .lead { color: #7a6a5a; font-size: 13px; margin-bottom: 10px; }
.mc-help h5 { margin: 10px 0 4px; font-size: 13px; color: #a3472e; letter-spacing: 0.05em; }
.mc-help table { width: 100%; border-collapse: collapse; }
.mc-help td { padding: 2px 0; vertical-align: top; }
.mc-help td.k { width: 150px; white-space: nowrap; color: #2b2622; }
.mc-help td.k b { display: inline-block; min-width: 18px; padding: 0 5px; margin-right: 2px; border-radius: 4px; background: #2b2622; color: #fbf3e1; font-weight: 600; font-size: 12px; text-align: center; }
.mc-help td.v { color: #5a4c40; }
.mc-help .foot { margin-top: 10px; color: #7a6a5a; font-size: 12px; text-align: center; }
.mc-assist { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); padding: 14px 18px 10px; border-radius: 14px; background: rgba(250,244,228,0.96); box-shadow: 0 4px 0 rgba(60,40,24,0.25), 0 0 0 1px rgba(60,40,24,0.12); font-size: 14px; line-height: 1.6; }
.mc-assist h3 { margin: 0 0 6px; font-size: 17px; }
.mc-assist div.row { display: flex; gap: 8px; align-items: baseline; }
.mc-assist b.k { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 4px; background: #2b2622; color: #fbf3e1; font-size: 12px; text-align: center; }
.mc-assist span.on { color: #3f7d3a; font-weight: 600; } .mc-assist span.off { color: #9a6a4a; }
.mc-assist .foot { margin-top: 8px; color: #7a6a5a; font-size: 12px; }
.mc-load { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #1a1612; transition: opacity 0.8s; }
.mc-load .box { width: min(360px, calc(100vw - 48px)); color: #fbf3e1; text-align: center; }
.mc-load h2 { margin: 0 0 4px; font-size: 26px; font-weight: 600; letter-spacing: 0.08em; }
.mc-load .sub { color: #c9bba6; font-size: 13px; margin-bottom: 18px; }
.mc-load .bar { height: 4px; border-radius: 2px; background: rgba(251,243,225,0.15); overflow: hidden; }
.mc-load .bar i { display: block; height: 100%; width: 0; background: #f3c35a; transition: width 0.2s; }
.mc-load .what { margin-top: 10px; color: #8f8270; font-size: 12px; }
.mc-pause { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%); padding: 6px 16px; border-radius: 14px; background: rgba(43,38,34,0.78); color: #fbf3e1; font-size: 14px; }
.mc-pause b { color: #f3c35a; }
.mc-marker { position: absolute; transform: translate(-50%, -100%); text-align: center; color: #fbf3e1; font-size: 13px; text-shadow: 0 1px 2px rgba(20,14,10,0.8); white-space: nowrap; }
.mc-marker i { display: block; width: 14px; height: 14px; margin: 3px auto 0; transform: rotate(45deg); border: 2px solid #f3c35a; border-radius: 2px; background: rgba(243,195,90,0.25); animation: mc-bob 1.6s ease-in-out infinite; }
.mc-marker.edge i { border-color: #fbf3e1; }
.mc-marker.dim { opacity: 0.32; }
@keyframes mc-bob { 0%, 100% { transform: translateY(0) rotate(45deg); } 50% { transform: translateY(-5px) rotate(45deg); } }
`;

/** the keys (docs/MODCAR.md §5.1), as the help card shows them */
const HELP = `<h3>公路旅行 · 车库</h3><div class="lead">把「方糖」装好、加上油，开出车库上路。拿着零件靠近车，能装的地方会亮起来。</div>
<h5>走路</h5><table>
<tr><td class="k"><b>W</b><b>A</b><b>S</b><b>D</b> · 鼠标</td><td class="v">走动、环顾 · <b>Shift</b> 跑 · <b>空格</b> 跳</td></tr>
<tr><td class="k"><b>E</b> / 左键</td><td class="v">拿起看着的东西；对着亮起的幽灵<b>按住</b>装上（已有零件就是替换，旧的到手上）</td></tr>
<tr><td class="k">按住右键 / <b>F</b></td><td class="v">拆下看着的零件</td></tr>
<tr><td class="k">按住 <b>G</b></td><td class="v">把手上的东西放下</td></tr>
<tr><td class="k"><b>E</b> 看着车门、引擎盖</td><td class="v">开 / 关；看着车身 = 上车</td></tr>
<tr><td class="k">油桶、水壶、机油</td><td class="v">对着油箱盖、水箱、发动机按住左键倒进去</td></tr>
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
<div class="foot">点击画面开始 · <b>F1</b> 随时打开这张卡 · <b>F2</b> 辅助开关 · 连按 <b>F9</b> 新游戏 · <b>Esc</b> 放开鼠标</div>`;

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

export interface CardData {
  title: string;
  sub: string;
  lines: StatLine[];
  warn?: string;
}

export class ModUI {
  readonly root: HTMLDivElement;
  private readonly mark: HTMLDivElement;
  private readonly ring: SVGSVGElement;
  private readonly arc: SVGCircleElement;
  private readonly word: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly held: HTMLDivElement;
  private readonly paint: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly dash: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly assist: HTMLDivElement;
  private readonly load: HTMLDivElement;
  private toastT = 0;
  private lastMarker = '';
  private lastCard = '';
  private lastWord = '';
  private lastList = '';
  lang: 'zh' | 'en' = 'zh';

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'mc-ui', document.body);
    this.mark = el('div', 'mc-mark', this.root);
    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.setAttribute('class', 'mc-ring');
    this.ring.setAttribute('viewBox', '0 0 46 46');
    const bg = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '23', cy: '23', r: '18', fill: 'none', stroke: 'rgba(250,244,228,0.45)', 'stroke-width': '4' })) bg.setAttribute(k, v);
    this.arc = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '23', cy: '23', r: '18', fill: 'none', stroke: '#f3c35a', 'stroke-width': '4', 'stroke-linecap': 'round', transform: 'rotate(-90 23 23)', 'stroke-dasharray': '113.1', 'stroke-dashoffset': '113.1' })) this.arc.setAttribute(k, v);
    this.ring.appendChild(bg);
    this.ring.appendChild(this.arc);
    this.root.appendChild(this.ring);
    this.word = el('div', 'mc-word', this.root);
    this.card = el('div', 'mc-card', this.root);
    this.toast = el('div', 'mc-toast', this.root);
    this.held = el('div', 'mc-held', this.root);
    this.paint = el('div', 'mc-paint', this.root);
    this.list = el('div', 'mc-list', this.root);
    this.dash = el('div', 'mc-dash', this.root);
    this.marker = el('div', 'mc-marker', this.root);
    this.pause = el('div', 'mc-pause', this.root);
    this.pause.innerHTML = '点击画面继续 · <b>F1</b> 按键';
    this.help = el('div', 'mc-help', this.root);
    this.help.innerHTML = HELP;
    this.assist = el('div', 'mc-assist', this.root);
    this.fade = el('div', 'mc-fade', this.root);
    this.load = el('div', 'mc-load', this.root);
    this.load.innerHTML = '<div class="box"><h2>公路旅行</h2><div class="sub">前方三百公里，再无修理厂</div><div class="bar"><i></i></div><div class="what">正在把零件搬进车库……</div></div>';
    this.load.style.display = 'none';
    for (const e of [this.word, this.card, this.toast, this.held, this.paint, this.list, this.dash, this.marker, this.pause, this.help, this.assist]) e.style.display = 'none';
    this.ring.style.display = 'none';
  }

  t(text: Text): string {
    return text[this.lang];
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

  showCard(c: CardData | null): void {
    if (!c) {
      this.card.style.display = 'none';
      this.lastCard = '';
      return;
    }
    const key = JSON.stringify(c);
    this.card.style.display = '';
    if (key === this.lastCard) return;
    this.lastCard = key;
    const rows = c.lines
      .map((l) => {
        const cls = l.better > 0 ? 'up' : l.better < 0 ? 'down' : 'same';
        const arrow = l.better > 0 ? '▲' : l.better < 0 ? '▼' : '';
        const s = (x: StatLine['before']): string => (typeof x === 'string' ? x : x[this.lang]);
        if (l.note) return `<tr><td class="k">${l.label[this.lang]}</td><td class="v">${s(l.after)}</td></tr>`;
        return `<tr><td class="k">${l.label[this.lang]}</td><td class="v">${s(l.before)} → <span class="${cls}">${s(l.after)} ${arrow}</span></td></tr>`;
      })
      .join('');
    this.card.innerHTML = `<h4>${c.title}</h4><div class="sub">${c.sub}</div><table>${rows}</table>${c.warn ? `<div class="warn">${c.warn}</div>` : ''}`;
  }

  say(text: string, seconds = 3.5): void {
    this.toast.textContent = text;
    this.toast.style.display = '';
    this.toast.style.opacity = '1';
    this.toastT = seconds;
  }

  showHeld(html: string | null): void {
    this.held.style.display = html ? '' : 'none';
    if (html) this.held.innerHTML = html;
  }

  showPaint(colours: readonly number[] | null, at: number): void {
    if (!colours) {
      this.paint.style.display = 'none';
      return;
    }
    this.paint.style.display = 'flex';
    if (this.paint.childElementCount !== colours.length) {
      this.paint.innerHTML = colours.map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
    }
    [...this.paint.children].forEach((e, i) => e.classList.toggle('on', i === at));
  }

  showList(title: string | null, items: { text: string; done: boolean; now: boolean }[]): void {
    if (!title) {
      this.list.style.display = 'none';
      return;
    }
    const key = title + JSON.stringify(items);
    this.list.style.display = '';
    if (key === this.lastList) return;
    this.lastList = key;
    this.list.innerHTML = `<h4>${title}</h4>${items.map((i) => `<div class="${i.done ? 'done' : i.now ? 'now' : ''}">${i.done ? '✓' : i.now ? '▸' : '·'} ${i.text}</div>`).join('')}`;
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
    this.marker.style.left = `${m.x.toFixed(0)}px`;
    this.marker.style.top = `${m.y.toFixed(0)}px`;
    const key = `${m.text}|${m.edge}|${!!m.dim}`;
    if (key !== this.lastMarker) {
      this.lastMarker = key;
      this.marker.className = `mc-marker${m.edge ? ' edge' : ''}${m.dim ? ' dim' : ''}`;
      this.marker.innerHTML = `${m.text}<i></i>`;
    }
  }

  /** 0 = clear … 1 = black (the garage door to the road) */
  setFade(v: number): void {
    this.fade.style.opacity = String(v);
  }

  update(dt: number): void {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast.style.opacity = '0';
    }
  }
}
