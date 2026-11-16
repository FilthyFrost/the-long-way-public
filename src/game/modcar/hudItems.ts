/**
 * The words round the hands (docs/MODCAR.md §5.5), after the way Arctic Drive lays them out, drawn in the
 * workshop's cream paper and ink: the two item cards (cards.ts), the two-slot hotbar along the bottom,
 * what the buttons do right now just above it with the keys drawn, every action of the thing in the hands
 * down the right, and while liquid goes from one thing into another, in the place of those words, a strip
 * saying from what into what and how much is in each.
 */
import { CARD_CSS, CardView, TONE_COLOUR } from './cards';
import type { ItemCard, Tone } from './itemInfo';

export type KeyName = 'E' | 'F' | 'G' | 'I' | 'K' | 'C' | 'L' | 'S' | 'W' | 'Q' | 'Z' | 'M' | 'H' | 'B' | 'R' | 'Space' | 'Shift' | '1' | '2' | 'LMB' | 'RMB' | 'Wheel';

/** one thing a button does: "长按 [E]/[左键] 装上 V8" */
export interface Action {
  keys: KeyName[];
  hold?: boolean;
  text: string;
  /** can't be done right now (said why) */
  off?: boolean;
}

export interface SlotView {
  /** the picture (a data URL), null while it is being drawn or when the slot is empty */
  icon: string | null;
  name: string;
  empty: boolean;
  /** a liquid container's fill under the slot */
  fill?: { value: number; max: number; tone: Tone };
}

export interface TransferView {
  /** from what into what: a name and its amount ("油桶 · 汽油", "7.9 L") with its fill */
  from: { name: string; amount: string; fill: number };
  to: { name: string; amount: string; fill: number };
  tone: Tone;
}

const CSS = `
${CARD_CSS}
.mc-ic.held { right: 22px; top: calc(50% - 24px); transform: translateY(-50%); max-height: calc(100vh - 250px); }
.mc-ic.aim { top: 50%; transform: translateY(-46%); }
.mc-ic.aim.l { right: calc(50% + 34px); }
.mc-ic.aim.r { left: calc(50% + 34px); }
.mc-hot { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 8px; }
.mc-hot .s { position: relative; width: 62px; height: 62px; border-radius: 11px; background: rgba(250,244,228,0.78); box-shadow: 0 2px 0 rgba(60,40,24,0.22), 0 0 0 1px rgba(60,40,24,0.12); transition: transform 0.12s; }
.mc-hot .s.on { background: rgba(250,244,228,0.96); box-shadow: 0 2px 0 rgba(60,40,24,0.25), 0 0 0 2.5px #a3472e; transform: translateY(-4px); }
.mc-hot .s img { position: absolute; inset: 5px 5px 9px; width: calc(100% - 10px); height: calc(100% - 14px); object-fit: contain; }
.mc-hot .s .n { position: absolute; left: -4px; bottom: -4px; width: 17px; height: 17px; border-radius: 4px; background: #2b2622; color: #fbf3e1; font-size: 11px; font-weight: 700; line-height: 17px; text-align: center; }
.mc-hot .s .f { position: absolute; left: 9px; right: 9px; bottom: 5px; height: 4px; border-radius: 2px; background: rgba(60,40,24,0.14); overflow: hidden; }
.mc-hot .s .f i { display: block; height: 100%; }
.mc-hot .s .w { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 4px; font-size: 10.5px; line-height: 1.25; color: #5a4c40; text-align: center; }
.mc-acts { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 5px; }
.mc-acts div { padding: 4px 12px; border-radius: 12px; background: rgba(250,244,228,0.92); box-shadow: 0 2px 0 rgba(60,40,24,0.22); font-size: 14px; white-space: nowrap; }
.mc-acts div.off { color: #9a6a4a; }
.mc-acts div b { color: #a3472e; font-weight: 700; }
.mc-keys { position: absolute; right: 22px; bottom: 22px; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; padding: 7px 11px; border-radius: 11px; background: rgba(250,244,228,0.84); box-shadow: 0 2px 0 rgba(60,40,24,0.2); font-size: 12.5px; color: #3a322c; }
.mc-keys div { white-space: nowrap; }
.mc-keys div.off { color: #9a8a7a; }
.mc-ui kbd { display: inline-block; min-width: 18px; height: 18px; margin: 0 2px; padding: 0 5px; border-radius: 4px; background: #2b2622; color: #fbf3e1; font: 700 11.5px/18px "PingFang SC","Microsoft YaHei",sans-serif; text-align: center; box-shadow: 0 1.5px 0 rgba(0,0,0,0.35); vertical-align: 1px; }
.mc-ui svg.ms { display: inline-block; width: 13px; height: 17px; margin: 0 2px; vertical-align: -3px; }
.mc-ui i.or { font-style: normal; color: #9a8a7a; margin: 0 1px; }
.mc-xfer { position: absolute; z-index: 3; left: 50%; bottom: 94px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 7px 14px; border-radius: 13px; background: rgba(250,244,228,0.95); box-shadow: 0 3px 0 rgba(60,40,24,0.22), 0 0 0 1px rgba(60,40,24,0.12); font-size: 13px; white-space: nowrap; }
.mc-xfer .sd { display: flex; flex-direction: column; gap: 3px; min-width: 96px; }
.mc-xfer .sd b { font-weight: 700; }
.mc-xfer .sd span { font-variant-numeric: tabular-nums; color: #5a4c40; font-size: 12.5px; }
.mc-xfer .sd .tr { height: 6px; border-radius: 3px; background: rgba(60,40,24,0.13); overflow: hidden; }
.mc-xfer .sd .tr i { display: block; height: 100%; transition: width 0.12s linear; }
.mc-xfer .ar { display: flex; gap: 1px; font-size: 20px; font-weight: 800; line-height: 1; }
.mc-xfer .ar i { font-style: normal; opacity: 0.18; animation: mc-flow 0.9s linear infinite; }
.mc-xfer .ar i:nth-child(2) { animation-delay: 0.15s; } .mc-xfer .ar i:nth-child(3) { animation-delay: 0.3s; } .mc-xfer .ar i:nth-child(4) { animation-delay: 0.45s; }
@keyframes mc-flow { 0% { opacity: 0.18; } 30% { opacity: 1; } 60%, 100% { opacity: 0.18; } }
.mc-done { position: absolute; z-index: 3; left: 50%; bottom: 94px; transform: translateX(-50%); padding: 5px 14px; border-radius: 12px; background: rgba(250,244,228,0.95); box-shadow: 0 2px 0 rgba(60,40,24,0.22); font-size: 14px; transition: opacity 0.5s; }
.mc-done b { color: #a3472e; }
`;

const MOUSE = (which: 'LMB' | 'RMB' | 'Wheel'): string => {
  const fill = which === 'LMB' ? '<path d="M6.5 1.3a5.2 5.2 0 0 0-5.2 5.2v.7h5.2z" fill="#a3472e" />' : which === 'RMB' ? '<path d="M6.5 1.3a5.2 5.2 0 0 1 5.2 5.2v.7H6.5z" fill="#a3472e" />' : '<rect x="5.3" y="3.2" width="2.4" height="4" rx="1.2" fill="#a3472e" />';
  return `<svg class="ms" viewBox="0 0 13 17">${fill}<rect x="1.3" y="1.3" width="10.4" height="14.4" rx="5.2" fill="none" stroke="#2b2622" stroke-width="1.4" /><path d="M1.3 7.2h10.4${which === 'Wheel' ? '' : 'M6.5 1.3v5.9'}" stroke="#2b2622" stroke-width="1.2" fill="none" /></svg>`;
};

const KEY_TEXT: Partial<Record<KeyName, string>> = { Space: '空格', Shift: 'Shift' };

export function keyHtml(k: KeyName): string {
  if (k === 'LMB' || k === 'RMB' || k === 'Wheel') return MOUSE(k);
  return `<kbd>${KEY_TEXT[k] ?? k}</kbd>`;
}

/** "长按 [E]/[左键] 装上 V8" (the text may carry <b>) */
export function actionHtml(a: Action): string {
  return `${a.hold ? '长按 ' : ''}${a.keys.map(keyHtml).join('<i class="or">/</i>')} ${a.text}`;
}

export class ItemHud {
  readonly held: CardView;
  readonly aim: CardView;
  private readonly hot: HTMLDivElement;
  private readonly acts: HTMLDivElement;
  private readonly keys: HTMLDivElement;
  private readonly xfer: HTMLDivElement;
  private readonly done: HTMLDivElement;
  private lastHot = '';
  private lastActs = '';
  private lastKeys = '';
  private lastXfer = '';
  private doneT = 0;

  constructor(root: HTMLElement) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.aim = new CardView(root, 'aim r');
    this.held = new CardView(root, 'held');
    const div = (cls: string): HTMLDivElement => {
      const e = document.createElement('div');
      e.className = cls;
      e.style.display = 'none';
      root.appendChild(e);
      return e;
    };
    this.hot = div('mc-hot');
    this.acts = div('mc-acts');
    this.keys = div('mc-keys');
    this.xfer = div('mc-xfer');
    this.done = div('mc-done');
  }

  /** the cards: what is in the hands (right), what the mark is on (beside the mark); on = shown at all (I) */
  showCards(held: ItemCard | null, aim: ItemCard | null, on: boolean): void {
    this.held.show(on ? held : null);
    // beside the mark on the side the held card leaves free
    const side = on && held ? 'l' : 'r';
    if (!this.aim.el.classList.contains(side)) {
      this.aim.el.classList.remove('l', 'r');
      this.aim.el.classList.add(side);
    }
    this.aim.show(on ? aim : null);
  }

  /** the hotbar (null = hidden: in a seat, the harness) */
  showHotbar(slots: SlotView[] | null, sel: number): void {
    if (!slots) {
      this.hot.style.display = 'none';
      return;
    }
    this.hot.style.display = '';
    const key = JSON.stringify([slots.map((s) => [s.icon?.length ?? 0, s.name, s.empty, s.fill ? Math.round((s.fill.value / s.fill.max) * 50) : -1, s.fill?.tone]), sel]);
    if (key === this.lastHot) return;
    this.lastHot = key;
    this.hot.innerHTML = slots
      .map((s, i) => {
        const fill = s.fill ? `<div class="f"><i style="width:${Math.min(100, (s.fill.value / Math.max(1e-6, s.fill.max)) * 100).toFixed(0)}%;background:${TONE_COLOUR[s.fill.tone]}"></i></div>` : '';
        const body = s.empty ? '' : s.icon ? `<img src="${s.icon}" alt="">` : `<div class="w">${s.name}</div>`;
        return `<div class="s${i === sel ? ' on' : ''}" title="${s.name}">${body}${fill}<div class="n">${i + 1}</div></div>`;
      })
      .join('');
  }

  /** what the buttons do right now, one line each, above the hotbar */
  showActions(list: Action[]): void {
    const html = list.map((a) => `<div${a.off ? ' class="off"' : ''}>${actionHtml(a)}</div>`).join('');
    if (html === this.lastActs) return;
    this.lastActs = html;
    this.acts.innerHTML = html;
    this.acts.style.display = html ? '' : 'none';
  }

  /** every action of what is in the hands (or of driving), down the right */
  showKeys(list: Action[]): void {
    const html = list.map((a) => `<div${a.off ? ' class="off"' : ''}>${actionHtml(a)}</div>`).join('');
    if (html === this.lastKeys) return;
    this.lastKeys = html;
    this.keys.innerHTML = html;
    this.keys.style.display = html ? '' : 'none';
  }

  /** liquid going from one thing into another; null = none */
  showTransfer(t: TransferView | null): void {
    if (!t) {
      this.xfer.style.display = 'none';
      this.lastXfer = '';
      return;
    }
    this.xfer.style.display = '';
    const c = TONE_COLOUR[t.tone];
    const key = `${t.from.name}|${t.to.name}|${t.tone}`;
    if (key !== this.lastXfer) {
      this.lastXfer = key;
      const side = (s: TransferView['from'], k: string): string => `<div class="sd" data-s="${k}"><b>${s.name}</b><span></span><div class="tr"><i style="background:${c}"></i></div></div>`;
      this.xfer.innerHTML = `${side(t.from, 'a')}<div class="ar" style="color:${c}"><i>›</i><i>›</i><i>›</i><i>›</i></div>${side(t.to, 'b')}`;
    }
    for (const [k, s] of [['a', t.from], ['b', t.to]] as const) {
      const e = this.xfer.querySelector(`[data-s="${k}"]`);
      if (!e) continue;
      (e.querySelector('span') as HTMLElement).textContent = s.amount;
      (e.querySelector('.tr i') as HTMLElement).style.width = `${(Math.min(1, Math.max(0, s.fill)) * 100).toFixed(1)}%`;
    }
  }

  /** a line after a transfer ("加进去 4.6 L 汽油") */
  showDone(html: string, seconds = 2.2): void {
    this.done.innerHTML = html;
    this.done.style.display = '';
    this.done.style.opacity = '1';
    this.doneT = seconds;
  }

  update(dt: number): void {
    if (this.doneT > 0) {
      this.doneT -= dt;
      if (this.doneT <= 0) this.done.style.opacity = '0';
    }
    // (the strip hides the line while it shows)
    if (this.xfer.style.display !== 'none') this.done.style.display = 'none';
  }
}
