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
.mc-dash { position: absolute; left: 22px; bottom: 22px; padding: 6px 12px; border-radius: 10px; background: rgba(43,38,34,0.7); color: #fbf3e1; font-size: 13px; font-variant-numeric: tabular-nums; }
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
.mc-pause { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%); padding: 6px 16px; border-radius: 14px; background: rgba(43,38,34,0.78); color: #fbf3e1; font-size: 14px; }
.mc-pause b { color: #f3c35a; }
.mc-marker { position: absolute; transform: translate(-50%, -100%); text-align: center; color: #fbf3e1; font-size: 13px; text-shadow: 0 1px 2px rgba(20,14,10,0.8); white-space: nowrap; }
.mc-marker i { display: block; width: 14px; height: 14px; margin: 3px auto 0; transform: rotate(45deg); border: 2px solid #f3c35a; border-radius: 2px; background: rgba(243,195,90,0.25); animation: mc-bob 1.6s ease-in-out infinite; }
.mc-marker.edge i { border-color: #fbf3e1; }
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
<tr><td class="k"><b>L</b> · <b>H</b></td><td class="v">车灯（关 → 近光 → 远光）· 喇叭</td></tr>
<tr><td class="k">鼠标 + 左键</td><td class="v">直接扳手刹杆、拨挡杆、拧钥匙、开收音机、按喇叭、开车门</td></tr>
<tr><td class="k"><b>E</b> · <b>C</b> · <b>R</b></td><td class="v">下车 · 驾驶座 / 车外视角 · 翻车时扶正</td></tr>
</table>
<div class="foot">点击画面开始 · <b>F1</b> 随时打开这张卡 · <b>Esc</b> 放开鼠标</div>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
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
    this.fade = el('div', 'mc-fade', this.root);
    for (const e of [this.word, this.card, this.toast, this.held, this.paint, this.list, this.dash, this.marker, this.pause, this.help]) e.style.display = 'none';
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
        return `<tr><td class="k">${l.label[this.lang]}</td><td class="v">${l.before} → <span class="${cls}">${l.after} ${arrow}</span></td></tr>`;
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

  showDash(text: string | null): void {
    this.dash.style.display = text ? '' : 'none';
    if (text) this.dash.textContent = text;
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
  showMarker(m: { x: number; y: number; text: string; edge: boolean } | null): void {
    if (!m) {
      this.marker.style.display = 'none';
      return;
    }
    this.marker.style.display = '';
    this.marker.style.left = `${m.x.toFixed(0)}px`;
    this.marker.style.top = `${m.y.toFixed(0)}px`;
    const key = `${m.text}|${m.edge}`;
    if (key !== this.lastMarker) {
      this.lastMarker = key;
      this.marker.className = m.edge ? 'mc-marker edge' : 'mc-marker';
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
