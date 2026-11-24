/**
 * The words round the hands (docs/MODCAR.md §5.5), laid out and drawn as Arctic Drive's are, in a cartoon
 * frame of our own (ui.ts .mc-frame): the two item cards (cards.ts), the two-slot hotbar along the bottom,
 * what the buttons do right now just above it in white words with the keys drawn, every action of the
 * thing in the hands down the right, and while liquid goes from one thing into another, in the place of
 * those words, a strip saying from what into what and how much is in each. A stack in a slot has its count in
 * the slot's corner (nothing for one), written when the count changes and not otherwise.
 */
import { CARD_CSS, CardView, TONE_COLOUR } from './cards';
import type { ItemCard, Tone } from './itemInfo';

export type KeyName = 'E' | 'F' | 'G' | 'I' | 'K' | 'C' | 'L' | 'S' | 'W' | 'Q' | 'Z' | 'M' | 'H' | 'B' | 'R' | 'Space' | 'Shift' | '1' | '2' | 'LMB' | 'RMB' | 'Wheel';

/** one thing a button does: "长按 [左键] 装上" */
export interface Action {
  keys: KeyName[];
  hold?: boolean;
  text: string;
  /**
   * can't be done right now: not drawn (docs/V3/plan/prompts.md §五, the user's "做不成时才短闪原因") — pressed anyway, the
   * button says why for a moment (why, else the text)
   */
  off?: boolean;
  /** why not, in a few words (with off) */
  why?: string;
}

export interface SlotView {
  /** the picture (a data URL), null while it is being drawn or when the slot is empty */
  icon: string | null;
  name: string;
  empty: boolean;
  /** a liquid container's fill under the slot (a spray can's paint, in its colour) */
  fill?: { value: number; max: number; tone: Tone; colour?: string };
  /** how many are in the slot: a stack's count, drawn in its corner when more than one (absent: one) */
  count?: number;
}

export interface TransferView {
  /** from what into what: a name and its amount ("油桶 · 汽油", "7.9 L") with its fill */
  from: { name: string; amount: string; fill: number };
  to: { name: string; amount: string; fill: number };
  tone: Tone;
}

const CSS = `
${CARD_CSS}
.mc-ic.held, .mc-ic.aim { right: 22px; top: 96px; }
.mc-hot { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; gap: 10px; }
.mc-hot .s { position: relative; width: 62px; height: 62px; box-sizing: border-box; border-radius: 12px; background: var(--grain), linear-gradient(180deg, rgba(120,124,122,0.55), rgba(26,26,26,0.75) 40%, rgba(20,20,20,0.8)); border: 2.5px solid rgba(239,230,211,0.55); box-shadow: 0 0 0 2px var(--ink); transition: transform 0.12s; }
.mc-hot .s.on { border: 3px solid var(--rim); box-shadow: 0 0 0 2.5px var(--ink), 0 5px 0 1px rgba(10,8,6,0.5); transform: translateY(-4px); }
.mc-hot .s img { position: absolute; inset: 3px; width: calc(100% - 6px); height: calc(100% - 6px); object-fit: contain; }
.mc-hot .s .n { position: absolute; left: -7px; bottom: -7px; width: 20px; height: 20px; box-sizing: border-box; border-radius: 6px; background: #2b2a28; border: 2px solid var(--rim); box-shadow: 0 0 0 1.5px var(--ink); color: #fff; font: 700 12px/16px var(--key-font); text-align: center; }
.mc-hot .s .f { position: absolute; left: 18px; right: 6px; bottom: -11px; height: 7px; box-sizing: border-box; border-radius: 999px; background: #2b2a28; border: 1.5px solid var(--ink); overflow: hidden; }
.mc-hot .s .f i { display: block; height: 100%; border-radius: 999px; }
.mc-hot .s .c { position: absolute; right: 5px; bottom: 3px; color: #fff; font: 700 14px/1 var(--key-font); text-shadow: 0 1px 0 var(--ink), 0 -1px 0 var(--ink), 1px 0 0 var(--ink), -1px 0 0 var(--ink), 0 2px 3px rgba(0,0,0,0.6); }
.mc-hot .s .w { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 4px; font-size: 11px; line-height: 1.25; color: #fff; text-align: center; }
.mc-bot { position: absolute; left: 50%; bottom: 106px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 36vw; }
.mc-acts { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.mc-acts div { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; text-align: center; font-size: 17px; font-weight: 700; text-shadow: var(--say-shadow); }
.mc-acts div b { color: var(--gold); }
.mc-acts div.off { color: #cfcbc4; font-weight: 400; }
.mc-acts div.off kbd, .mc-acts div.off .mk { opacity: 0.6; }
.mc-keys { position: absolute; right: 30px; bottom: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 9px; max-width: 28vw; }
.mc-keys div { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 7px; text-align: right; font-size: 15.5px; text-shadow: var(--say-shadow); }
.mc-keys div.off { opacity: 0.5; }
.mc-ui kbd, .mc-ui .mk { display: inline-flex; align-items: center; justify-content: center; min-width: 23px; height: 23px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 13px/1 var(--key-font); text-shadow: none; vertical-align: middle; }
.mc-ui .mk { padding: 0 5px; }
.mc-ui .mk svg { width: 12px; height: 16px; }
.mc-ui i.or { font-style: normal; color: var(--tx-2); font-weight: 400; }
.mc-xfer { position: absolute; z-index: 3; left: 50%; bottom: 112px; transform: translateX(-50%); display: grid; grid-template-columns: 1fr 64px 1fr; align-items: center; width: 520px; padding: 12px 18px 13px; box-sizing: border-box; }
.mc-xfer .sd b { font-size: 15px; font-weight: 700; }
.mc-xfer .sd span { display: block; margin-top: 2px; font-size: 18px; font-weight: 700; }
.mc-xfer .sd .tr { height: 8px; margin-top: 7px; border-radius: 999px; background: var(--track); overflow: hidden; }
.mc-xfer .sd .tr i { display: block; height: 100%; border-radius: 999px; transition: width 0.12s linear; }
.mc-xfer .sd.to { text-align: right; }
.mc-xfer .ar { text-align: center; font: 900 34px/1 var(--key-font); letter-spacing: -0.08em; text-shadow: 0 2px 0 var(--ink); }
.mc-xfer .ar i { font-style: normal; opacity: 0.25; animation: mc-flow 0.9s linear infinite; }
.mc-xfer .ar i:nth-child(2) { animation-delay: 0.15s; } .mc-xfer .ar i:nth-child(3) { animation-delay: 0.3s; }
@keyframes mc-flow { 30% { opacity: 1; } 60%, 100% { opacity: 0.25; } }
.mc-done { white-space: nowrap; font-size: 18px; font-weight: 700; text-shadow: var(--say-shadow); transition: opacity 0.5s; }
.mc-done b { color: var(--gold); }
`;

const MOUSE = (which: 'LMB' | 'RMB' | 'Wheel'): string => {
  const fill = which === 'LMB' ? '<path d="M6.5 1.3a5.2 5.2 0 0 0-5.2 5.2v.7h5.2z" fill="#17120f" />' : which === 'RMB' ? '<path d="M6.5 1.3a5.2 5.2 0 0 1 5.2 5.2v.7H6.5z" fill="#17120f" />' : '<rect x="5.3" y="3.2" width="2.4" height="4" rx="1.2" fill="#17120f" />';
  return `<span class="mk"><svg viewBox="0 0 13 17">${fill}<rect x="1.3" y="1.3" width="10.4" height="14.4" rx="5.2" fill="none" stroke="#17120f" stroke-width="1.5" /><path d="M1.3 7.2h10.4${which === 'Wheel' ? '' : 'M6.5 1.3v5.9'}" stroke="#17120f" stroke-width="1.2" fill="none" /></svg></span>`;
};

const KEY_TEXT: Partial<Record<KeyName, string>> = { Space: '空格', Shift: 'Shift' };

export function keyHtml(k: KeyName): string {
  if (k === 'LMB' || k === 'RMB' || k === 'Wheel') return MOUSE(k);
  return `<kbd>${KEY_TEXT[k] ?? k}</kbd>`;
}

/** "长按 [E]/[左键] 装上 V8" (the text may carry <b>) */
export function actionHtml(a: Action): string {
  return `${a.hold ? '<span>长按</span>' : ''}${a.keys.map(keyHtml).join('<i class="or">/</i>')}<span>${a.text}</span>`;
}

export class ItemHud {
  readonly held: CardView;
  readonly aim: CardView;
  /** how far down the right-hand side is taken from the top (the quest), for the held card to keep clear of */
  topRight = 0;
  private readonly root: HTMLElement;
  private readonly hot: HTMLDivElement;
  private readonly acts: HTMLDivElement;
  private readonly keys: HTMLDivElement;
  private readonly xfer: HTMLDivElement;
  private readonly done: HTMLDivElement;
  private lastHot = '';
  /** the count written in each slot's corner (−1: to be written: the slots were drawn again) */
  private readonly hotCounts: number[] = [];
  private lastActs = '';
  private lastKeys = '';
  private lastXfer = '';
  private doneT = 0;
  /** how much longer the held card stays cut down (s) */
  private compactT = 0;
  /** what the cards were last placed for (their drawings, the keys' height, the room) */
  private placed = '';
  /** the keys' height (−1 = to be measured: they changed) */
  private keysH = -1;
  private readonly bot: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.root = root;
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
    this.bot = document.createElement('div');
    this.bot.className = 'mc-bot';
    root.appendChild(this.bot);
    this.done = div('mc-done');
    this.acts = div('mc-acts');
    this.bot.append(this.done, this.acts);
    this.keys = div('mc-keys');
    this.xfer = div('mc-xfer mc-frame');
  }

  /**
   * The cards, both down the right of the screen, out of the way of the view: what the mark is on at the top,
   * what is in the hands under it (cut down to what it is and what is in it while the other card is up, and
   * a moment after it goes, so it does not jump about as the mark passes over things); on = shown at all (I).
   */
  /**
   * The two cards; heldCompact: the held thing's cut down to what it is and what is in it whatever else is up;
   * aimCompact: what the mark is on cut down too (the whole card is for what lies on the ground — docs/V3/plan/prompts.md §五 4)
   */
  showCards(held: ItemCard | null, aim: ItemCard | null, on: boolean, heldCompact = false, aimCompact = false): void {
    if (on && aim) this.compactT = 0.35;
    // (the held thing's: its name and how much, no more — docs/V3/plan/prompts.md §五 4)
    this.held.show(on ? held : null, heldCompact || this.compactT > 0, false);
    this.aim.show(on ? aim : null, aimCompact);
  }

  /** the hotbar (null = hidden: in a seat, the harness) */
  showHotbar(slots: SlotView[] | null, sel: number): void {
    if (!slots) {
      this.hot.style.display = 'none';
      return;
    }
    this.hot.style.display = '';
    const key = JSON.stringify([slots.map((s) => [s.icon?.length ?? 0, s.name, s.empty, s.fill ? Math.round((s.fill.value / s.fill.max) * 50) : -1, s.fill?.tone, s.fill?.colour]), sel]);
    const counts = this.hotCounts;
    if (key !== this.lastHot) {
      this.lastHot = key;
      this.hot.innerHTML = slots
        .map((s, i) => {
          const fill = s.fill ? `<div class="f"><i style="width:${Math.min(100, (s.fill.value / Math.max(1e-6, s.fill.max)) * 100).toFixed(0)}%;background:${s.fill.colour ?? TONE_COLOUR[s.fill.tone]}"></i></div>` : '';
          const body = s.empty ? '' : s.icon ? `<img src="${s.icon}" alt="">` : `<div class="w">${s.name}</div>`;
          return `<div class="s${i === sel ? ' on' : ''}" title="${s.name}">${body}${fill}<div class="c"></div><div class="n">${i + 1}</div></div>`;
        })
        .join('');
      for (let i = 0; i < counts.length; i++) counts[i] = -1;
    }
    // a stack's count in its slot's corner: a count is not part of what the slots are drawn again for, and its
    // words are written when it changes, not every frame
    for (let i = 0; i < slots.length; i++) {
      const n = slots[i].count ?? 1;
      if (counts[i] === n) continue;
      counts[i] = n;
      const c = this.hot.children[i]?.querySelector('.c');
      if (c) c.textContent = n > 1 ? String(n) : '';
    }
  }

  /** what the buttons do right now, one line each, above the hotbar */
  showActions(list: Action[]): void {
    // (what cannot be done is not drawn: pressed, it says why — the player's sayWhy)
    const html = list
      .filter((a) => !a.off)
      .map((a) => `<div>${actionHtml(a)}</div>`)
      .join('');
    if (html === this.lastActs) return;
    this.lastActs = html;
    this.acts.innerHTML = html;
    this.acts.style.display = html ? '' : 'none';
  }

  /** every action of what is in the hands (or of driving), down the right */
  showKeys(list: Action[]): void {
    const html = list
      .filter((a) => !a.off)
      .map((a) => `<div>${actionHtml(a)}</div>`)
      .join('');
    if (html === this.lastKeys) return;
    this.lastKeys = html;
    this.keys.innerHTML = html;
    this.keys.style.display = html ? '' : 'none';
    this.keysH = -1;
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
      const side = (s: TransferView['from'], k: string): string => `<div class="sd${k === 'b' ? ' to' : ''}" data-s="${k}"><b>${s.name}</b><span></span><div class="tr"><i style="background:${c}"></i></div></div>`;
      this.xfer.innerHTML = `${side(t.from, 'a')}<div class="ar" style="color:${c}"><i>›</i><i>›</i><i>›</i></div>${side(t.to, 'b')}`;
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

  /**
   * The cards' heights, in the column down the right between the quest and the keys: one alone a little
   * above the middle of the screen; with both, the held one (cut down) just over the keys and the other
   * over it. A card taller than the room left is cut at the bottom and fades out there.
   */
  private place(): void {
    const H = this.root.clientHeight || window.innerHeight;
    if (this.keysH < 0) this.keysH = this.keys.style.display === 'none' ? 0 : this.keys.offsetHeight;
    const key = `${this.held.drawn}|${this.aim.drawn}|${this.keysH}|${H}|${this.topRight}|${this.held.el.style.display}|${this.aim.el.style.display}|${this.compactT > 0}`;
    if (key === this.placed) return;
    this.placed = key;
    /** a card into [top, bottom], about mid (up: how much of it stands above mid); least = the room it gets at the least */
    const fit = (v: CardView, mid: number, top: number, bottom: number, up: number, least = 160): void => {
      if (v.el.style.display === 'none') return;
      const room = Math.max(least, bottom - top);
      v.el.style.maxHeight = `${room}px`;
      const h = Math.min(room, v.el.scrollHeight);
      v.el.classList.toggle('cut', v.el.scrollHeight > room + 1);
      v.el.style.top = `${Math.round(Math.max(top, Math.min(mid - h * up, bottom - h)))}px`;
    };
    const top = Math.max(16, this.topRight + 12);
    const bottom = H - 26 - this.keysH - 16;
    const held = this.held.el.style.display !== 'none';
    const aim = this.aim.el.style.display !== 'none';
    // (the held card stays down by the keys while it is cut down, also the moment after the other goes)
    if (!held || (!aim && this.compactT <= 0)) {
      fit(this.held, H / 2 - 24, top, bottom, 0.5);
      fit(this.aim, H / 2 - 24, top, bottom, 0.5);
      return;
    }
    // what the mark is on comes first; the held card keeps at least its name
    const heldH = this.held.el.scrollHeight;
    const aimRoom = aim ? Math.min(this.aim.el.scrollHeight, bottom - top - Math.min(heldH, 92) - 12) : 0;
    const hh = Math.min(heldH, bottom - top - (aim ? aimRoom + 12 : 0));
    fit(this.held, bottom, bottom - hh, bottom, 1, 0);
    fit(this.aim, H / 2 - 24, top, bottom - hh - 12, 0.5, 60);
  }

  update(dt: number): void {
    this.compactT -= dt;
    this.place();
    if (this.doneT > -1) {
      this.doneT -= dt;
      if (this.doneT <= 0) this.done.style.opacity = '0';
      if (this.doneT <= -0.5 && this.done.style.display !== 'none') this.done.style.display = 'none';
    }
    // (the strip hides the lines while it shows)
    const strip = this.xfer.style.display !== 'none';
    if (strip) this.done.style.display = 'none';
    this.acts.style.visibility = strip ? 'hidden' : '';
  }
}
