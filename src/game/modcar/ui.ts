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
`;

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
  private toastT = 0;
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
    this.fade = el('div', 'mc-fade', this.root);
    for (const e of [this.word, this.card, this.toast, this.held, this.paint, this.list, this.dash]) e.style.display = 'none';
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
