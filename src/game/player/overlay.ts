/**
 * What is drawn over the picture on foot (docs/DESIGN_V2.md 6.3): a small dot for a crosshair, the
 * one word under it, the ring that fills while E is held, and four hand-drawn corner marks round
 * the thing looked at. Tab opens the backpack: a plain, quiet panel, nothing but things and counts.
 * Nothing here exists on screen while one sits in the vehicle.
 */
import { item } from '../../core/items/catalog';
import type { Stack } from '../../core/items/inventory';

const CSS = `
.rtp-root { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; color: #f3ead6; }
.rtp-dot { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; border-radius: 50%;
  background: #f6eedc; box-shadow: 0 0 0 1px #3a2a2266, 0 1px 3px #0006; opacity: .85; }
.rtp-word { position: absolute; left: 50%; top: calc(50% + 26px); transform: translateX(-50%); font-size: 17px; letter-spacing: .12em;
  text-shadow: 0 1px 2px #2a1d16cc, 0 0 8px #2a1d1688; white-space: nowrap; }
.rtp-ring { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; }
.rtp-ring circle { fill: none; stroke-linecap: round; }
.rtp-mark { position: absolute; width: 10px; height: 10px; border: 0 solid #f6e7c8; opacity: .9; filter: drop-shadow(0 1px 1px #2a1d16aa); border-radius: 2px; }
.rtp-pack { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 18px 20px 16px; border-radius: 12px;
  background: #2a2420e6; box-shadow: 0 6px 30px #0007; min-width: 340px; }
.rtp-pack h3 { margin: 0 0 12px; font-weight: 500; font-size: 14px; letter-spacing: .3em; color: #e8d6b4; text-align: center; }
.rtp-grid { display: grid; grid-template-columns: repeat(4, 76px); gap: 8px; }
.rtp-slot { height: 64px; border-radius: 8px; background: #3a332d; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.rtp-slot i { width: 22px; height: 22px; border-radius: 6px; box-shadow: inset 0 -3px 0 #0003, 0 0 0 1.5px #1e1814; }
.rtp-slot span { font-size: 12px; color: #e9dcc4; }
.rtp-slot b { font-weight: 500; color: #c9b590; margin-left: 3px; }
.rtp-hands { margin-top: 12px; font-size: 12px; color: #c9b590; text-align: center; letter-spacing: .1em; }
`;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export class Overlay {
  readonly root: HTMLDivElement;
  private readonly dot: HTMLDivElement;
  private readonly word: HTMLDivElement;
  private readonly ring: SVGSVGElement;
  private readonly arc: SVGCircleElement;
  private readonly marks: HTMLDivElement[] = [];
  private readonly pack: HTMLDivElement;
  private lastWord = '';
  private lastPack = '';
  private shown = false;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'rtp-root';
    this.dot = document.createElement('div');
    this.dot.className = 'rtp-dot';
    this.word = document.createElement('div');
    this.word.className = 'rtp-word';
    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.setAttribute('class', 'rtp-ring');
    this.ring.setAttribute('viewBox', '0 0 40 40');
    const back = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '20', cy: '20', r: '15', stroke: '#2a1d1666', 'stroke-width': '4' })) back.setAttribute(k, v);
    this.arc = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: '20', cy: '20', r: '15', stroke: '#f6e7c8', 'stroke-width': '2.6', transform: 'rotate(-90 20 20)' })) this.arc.setAttribute(k, v);
    this.ring.append(back, this.arc);
    for (let i = 0; i < 4; i++) {
      const m = document.createElement('div');
      m.className = 'rtp-mark';
      const t = i < 2 ? 'Top' : 'Bottom';
      const l = i % 2 === 0 ? 'Left' : 'Right';
      (m.style as unknown as Record<string, string>)[`border${t}Width`] = '2px';
      (m.style as unknown as Record<string, string>)[`border${l}Width`] = '2px';
      this.marks.push(m);
    }
    this.pack = document.createElement('div');
    this.pack.className = 'rtp-pack';
    this.root.append(this.dot, this.word, this.ring, ...this.marks, this.pack);
    document.body.appendChild(this.root);
    this.hideAll();
  }

  private hideAll(): void {
    this.root.style.display = 'none';
    this.shown = false;
  }

  /**
   * One frame of the on-foot HUD.
   * @param on on foot (else everything is hidden)
   * @param word the word under the crosshair (null = none)
   * @param ring 0…1 while E is held, < 0 for no ring
   * @param box the thing looked at on screen (px: centre and half size), null = no marks
   */
  update(on: boolean, word: string | null, ring: number, box: { x: number; y: number; r: number } | null): void {
    if (!on) {
      if (this.shown) this.hideAll();
      return;
    }
    if (!this.shown) {
      this.root.style.display = '';
      this.shown = true;
    }
    const w = word ?? '';
    if (w !== this.lastWord) {
      this.word.textContent = w;
      this.lastWord = w;
    }
    if (ring >= 0) {
      this.ring.style.display = '';
      const c = 2 * Math.PI * 15;
      this.arc.setAttribute('stroke-dasharray', `${(c * Math.min(1, ring)).toFixed(2)} ${c.toFixed(2)}`);
    } else this.ring.style.display = 'none';
    for (let i = 0; i < 4; i++) {
      const m = this.marks[i];
      if (!box) {
        m.style.display = 'none';
        continue;
      }
      m.style.display = '';
      const r = Math.max(14, Math.min(160, box.r));
      const sx = i % 2 === 0 ? -1 : 1;
      const sy = i < 2 ? -1 : 1;
      m.style.left = `${(box.x + sx * r - (sx < 0 ? 0 : 10)).toFixed(1)}px`;
      m.style.top = `${(box.y + sy * r - (sy < 0 ? 0 : 10)).toFixed(1)}px`;
    }
  }

  /** the backpack panel (null = closed) and what is in the hands */
  showPack(slots: readonly (Stack | null)[] | null, hands: string | null): void {
    if (!slots) {
      this.pack.style.display = 'none';
      this.lastPack = '';
      return;
    }
    const key = JSON.stringify(slots) + (hands ?? '');
    this.pack.style.display = '';
    if (key === this.lastPack) return;
    this.lastPack = key;
    const cells = slots
      .map((s) => {
        if (!s) return '<div class="rtp-slot"></div>';
        const d = item(s.id);
        return `<div class="rtp-slot"><i style="background:${hex(d.tint)}"></i><span>${d.zh}${s.n > 1 ? `<b>${s.n}</b>` : ''}</span></div>`;
      })
      .join('');
    const h = hands ? item(hands).zh : '';
    this.pack.innerHTML = `<h3>背包</h3><div class="rtp-grid">${cells}</div>${h ? `<div class="rtp-hands">手上 · ${h}</div>` : ''}`;
  }
}
