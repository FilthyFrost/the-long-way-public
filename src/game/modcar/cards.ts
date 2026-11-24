/**
 * The item cards drawn (docs/MODCAR.md §5.5): a card for what is in the hands on the right of the screen
 * and one for what the mark is on beside the mark — what it is, its grade, a line about it, its curve,
 * its numbers, what is in it as bars, its condition and weight. Laid out and coloured as Arctic Drive's
 * item cards are (a dark smoky glass, a header shading from black into grey, white words, thin rules between
 * the parts); only the frame is ours, a cartoon one (ui.ts .mc-frame). A card with the same contents is
 * not drawn again; its bars move in place (fuel going in while the can pours). A card that says it is kept
 * (itemInfo.ts itemCardKept: the same object until something on it changes) is not even looked into again.
 */
import type { CardBar, CardCurve, CardColumns, CardIcon, ItemCard, Tone } from './itemInfo';

export const TONE_COLOUR: Record<Tone, string> = {
  petrol: '#ff9a2a',
  diesel: '#d9c23c',
  mix2t: '#c77ddb',
  water: '#4f9cf2',
  oil: '#c9822f',
  charge: '#55cf6a',
  good: '#55cf6a',
  mid: '#f0b43a',
  bad: '#ff6b5a',
};

export const CARD_CSS = `
.mc-ic { position: absolute; z-index: 2; width: 340px; overflow: hidden; color: #fff; font-size: 14.5px; line-height: 1.4; transition: opacity 0.12s; }
.mc-ic .hd { padding: 11px 18px 10px; background: linear-gradient(180deg, rgba(8,8,8,0.92) 0%, rgba(14,14,14,0.85) 52%, rgba(86,85,84,0.78) 100%); }
.mc-ic .cat { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--tx-2); }
.mc-ic .cat svg { width: 16px; height: 16px; flex: none; }
.mc-ic .nm { margin-top: 2px; font-size: 21px; font-weight: 700; line-height: 1.25; letter-spacing: 0.01em; }
.mc-ic.compact .hd { padding: 9px 16px 8px; }
.mc-ic.compact .nm { display: flex; align-items: center; gap: 8px; margin-top: 0; font-size: 18px; }
.mc-ic.compact .nm svg { width: 17px; height: 17px; flex: none; opacity: 0.8; }
.mc-ic .st { display: flex; gap: 4px; margin-top: 5px; }
.mc-ic .st svg { width: 15px; height: 15px; }
.mc-ic .tg { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 6px; font-size: 12.5px; color: var(--tx-2); }
.mc-ic .tg span { display: inline-flex; align-items: center; gap: 5px; }
.mc-ic .tg span::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--tx-3); }
.mc-ic .tg .stock::before { background: #8fd47a; } .mc-ic .tg .apoc::before { background: #ffab5e; } .mc-ic .tg .meme::before { background: var(--gold); }
.mc-ic .tg .warn { color: #ff9a7e; } .mc-ic .tg .warn::before { background: #ff6b5a; }
.mc-ic .bd { padding: 2px 18px 6px; }
.mc-ic .sec { padding: 8px 0; border-top: 1px solid var(--rule); }
.mc-ic .sec:first-child { border-top: 0; }
.mc-ic .desc { color: #ece9e3; }
.mc-ic .lab { margin-bottom: 4px; font-size: 13.5px; color: var(--tx-2); }
.mc-ic svg.cv { display: block; width: 100%; height: 96px; }
.mc-ic .cols { display: flex; align-items: flex-end; gap: 6px; }
.mc-ic .cols div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; font-size: 12px; color: var(--tx-2); }
.mc-ic .cols i { display: block; flex: none; width: 66%; margin: 3px 0 4px; border-radius: 4px 4px 2px 2px; background: #e9e5de; }
.mc-ic .cols i.lo { background: #77746f; }
.mc-ic .cols b { font-size: 12px; font-weight: 700; color: #fff; }
.mc-ic .rw { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 4px; align-items: baseline; }
.mc-ic .rw b { font-weight: 700; white-space: nowrap; }
.mc-ic .rw span { color: var(--tx-2); }
.mc-ic .rw b.good { color: #8fe07a; } .mc-ic .rw b.bad { color: #ff8a6a; }
.mc-ic .rw b.qs { display: inline-flex; gap: 2px; align-self: center; } .mc-ic .rw b.qs svg { width: 13px; height: 13px; }
.mc-ic .cmp { display: grid; grid-template-columns: 1fr auto auto auto; column-gap: 8px; row-gap: 5px; align-items: baseline; font-size: 15px; }
.mc-ic .cmp .k { color: var(--tx-2); }
.mc-ic .cmp .a { text-align: right; color: var(--tx-3); white-space: nowrap; }
.mc-ic .cmp .ar { color: var(--tx-3); }
.mc-ic .cmp .b { text-align: right; font-weight: 700; white-space: nowrap; }
.mc-ic .cmp .b.good { color: #8fe07a; } .mc-ic .cmp .b.bad { color: #ff8a6a; }
.mc-ic .br + .br { margin-top: 12px; }
.mc-ic .br .t { font-size: 15px; font-weight: 700; }
.mc-ic .tr { position: relative; display: flex; height: 8px; margin: 7px 0 6px; border-radius: 999px; background: var(--track); overflow: hidden; }
.mc-ic .tr i { display: block; height: 100%; transition: width 0.15s linear; }
.mc-ic .br .n { font-size: 14px; font-weight: 700; }
.mc-ic .lg { margin-top: 2px; font-size: 14px; }
.mc-ic .lg div::before { content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 7px; border-radius: 3px; background: var(--c); vertical-align: 0; }
.mc-ic .nt { position: relative; margin: 3px 0; padding-left: 19px; font-size: 14px; }
.mc-ic .nt::before { position: absolute; left: 0; top: 3px; width: 14px; height: 14px; border-radius: 50%; font-size: 10px; font-weight: 900; line-height: 14px; text-align: center; color: #17120f; }
.mc-ic .nt.warn { color: #ffb19c; } .mc-ic .nt.warn::before { content: '!'; background: #ff7a62; }
.mc-ic .nt.ok { color: #a6ea92; } .mc-ic .nt.ok::before { content: '✓'; background: #79d866; }
.mc-ic .nt.info { color: var(--tx-2); } .mc-ic .nt.info::before { content: ''; left: 4px; top: 7px; width: 6px; height: 6px; background: var(--tx-3); }
.mc-ic .fits { font-size: 14px; color: var(--tx-2); }
.mc-ic .fits b { color: var(--gold); font-weight: 700; }
.mc-ic .ft { display: flex; flex-wrap: wrap; gap: 4px 22px; align-items: center; font-weight: 700; }
.mc-ic .ft span { display: inline-flex; align-items: center; gap: 7px; }
.mc-ic .ft svg { width: 15px; height: 15px; }
.mc-ic .ft em { font-style: normal; font-weight: 400; color: var(--tx-2); }
.mc-ic.cut::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 34px; background: linear-gradient(180deg, rgba(28,27,26,0), rgba(28,27,26,0.96) 80%); }
`;

const ICON_PATH: Record<CardIcon, string> = {
  engine: '<path d="M2.5 6.5h2v-2h5v2h2l1.5-1.5h1v6h-1L11.5 9.5h-2v2h-5v-2h-2z" /><path d="M6 4.5v-2h3v2" />',
  wheel: '<circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="1.8" />',
  body: '<path d="M2.5 11.5v-4l3-3.5h6v7.5z" /><path d="M5.5 7.5h4" />',
  cab: '<circle cx="8" cy="8" r="5.5" /><path d="M2.6 7.2h10.8M8 8v5.5" />',
  electric: '<path d="M9 1.8L4 9h3.5L6.8 14.2 12 6.8H8.4z" />',
  tool: '<path d="M10.2 2.2a3 3 0 0 0-3.4 4L2.4 10.6a1.4 1.4 0 0 0 2 2l4.4-4.4a3 3 0 0 0 4-3.4L11 6.6 9.4 5z" />',
  car: '<path d="M1.8 10.5V8.3l1.6-3.3h9.2l1.6 3.3v2.2z" /><circle cx="4.6" cy="10.8" r="1.4" /><circle cx="11.4" cy="10.8" r="1.4" />',
  device: '<rect x="3" y="2" width="10" height="12" rx="1.6" /><circle cx="8" cy="6.5" r="1.8" /><path d="M5.5 11h5" />',
  food: '<path d="M2.5 8h11a5.5 5.5 0 0 1-11 0z" /><path d="M6 5.2c0-1.2 1-1.2 1-2.4M9 5.2c0-1.2 1-1.2 1-2.4" />',
  drink: '<path d="M6.2 1.8h3.6M6.6 1.8v2.6L5 6.6v7.6h6V6.6L9.4 4.4V1.8" /><path d="M5 9h6" />',
  med: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.4" /><path d="M8 5.2v5.6M5.2 8h5.6" />',
  wear: '<path d="M5.6 2.2L2 4.6l1.6 3 1.6-.8v7h5.6v-7l1.6.8 1.6-3-3.6-2.4c-.4 1.2-1.4 1.8-2.4 1.8s-2-.6-2.4-1.8z" />',
  pack: '<rect x="3.4" y="4.2" width="9.2" height="9.8" rx="2.2" /><path d="M6 4.2V3a2 2 0 0 1 4 0v1.2M5.6 9h4.8v2.6H5.6z" />',
  box: '<path d="M2.4 5.2L8 2.6l5.6 2.6v6L8 13.8l-5.6-2.6z" /><path d="M2.4 5.2L8 7.8l5.6-2.6M8 7.8v6" />',
};

export function iconSvg(icon: CardIcon, colour = '#c9c6c0'): string {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${ICON_PATH[icon]}</svg>`;
}

const STAR_PATH = 'M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-4.9-4.4 6.5-.7z';
/** a star of a card's grade: white, gold on a find (★4 and ★5) */
const star = (on: boolean, gold = false): string => {
  const c = on ? (gold ? '#f2c14e' : '#f2efe8') : '#2a2826';
  return `<svg viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="${c}" stroke="${on ? c : '#4a4744'}" stroke-width="1.2" stroke-linejoin="round" /></svg>`;
};
/** a row's number drawn as stars out of five (a thing's quality), the same star as the grade's, smaller; what it says in words is its title */
const starsHtml = (n: number, words: string): string => `<b class="qs" data-q="${n}" title="${esc(words)}">${[0, 1, 2, 3, 4].map((i) => star(i < n, n >= 4)).join('')}</b>`;
/** a part's condition in a word (docs/V3/plan/growth.md §五: 差、一般、好、很好) */
export function condWord(c: number): string {
  return c < 0.35 ? '差' : c < 0.6 ? '一般' : c < 0.85 ? '好' : '很好';
}

/** the condition's cross and the weight's bell, as Arctic Drive draws them in a card's last line */
const COND = '<svg viewBox="0 0 16 16"><path d="M8 2v12M2 8h12" stroke="#fff" stroke-width="2.6" stroke-linecap="round" /></svg>';
const MASS = '<svg viewBox="0 0 16 16"><path d="M5.2 6.2h5.6l2.4 7.6H2.8z" fill="#fff" /><circle cx="8" cy="4.2" r="1.9" fill="none" stroke="#fff" stroke-width="1.6" /></svg>';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function curveSvg(c: CardCurve): string {
  const W = 316;
  const H = 96;
  const l = 32;
  const r = 16;
  const t = 8;
  const b = 18;
  const x0 = c.xTicks[0];
  const x1 = c.xTicks.at(-1)!;
  const y1 = c.yTicks.at(-1)!;
  const X = (x: number): number => l + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - l - r);
  const Y = (y: number): number => H - b - (y / Math.max(1e-6, y1)) * (H - t - b);
  const grid = [
    ...c.yTicks.map((y) => `<line x1="${l}" x2="${W - r}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" stroke="rgba(255,255,255,0.22)" />` + `<text x="${l - 5}" y="${(Y(y) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#bdb9b2">${y}</text>`),
    ...c.xTicks.map((x) => `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${t}" y2="${H - b}" stroke="rgba(255,255,255,0.18)" />` + `<text x="${X(x).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#bdb9b2">${x}</text>`),
  ].join('');
  const pts = c.points.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
  const peak = c.peak ? `<circle cx="${X(c.peak[0]).toFixed(1)}" cy="${Y(c.peak[1]).toFixed(1)}" r="3.4" fill="#fff" />` : '';
  return `<svg class="cv" viewBox="0 0 ${W} ${H}">${grid}<polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />${peak}</svg>`;
}

function columnsHtml(c: CardColumns): string {
  return `<div class="cols">${c.items.map((it) => `<div><b>${it.value.toFixed(2)}</b><i${it.value < 0.85 ? ' class="lo"' : ''} style="height:${(3 + Math.min(1, Math.max(0, (it.value - 0.5) / (c.max - 0.5))) * 46).toFixed(0)}px"></i>${esc(it.label)}</div>`).join('')}</div>`;
}

function barFills(bar: CardBar): { colour: string; w: number }[] {
  const max = Math.max(1e-6, bar.max);
  if (bar.parts?.length) return bar.parts.map((p) => ({ colour: TONE_COLOUR[p.tone], w: Math.min(100, (p.value / max) * 100) }));
  return [{ colour: bar.colour ?? TONE_COLOUR[bar.tone], w: Math.min(100, (Math.max(0, bar.value) / max) * 100) }];
}

/** legend = the line of each liquid's share under the bar (left out where the card is cut down) */
function barHtml(bar: CardBar, i: number, legend = true): string {
  const fills = barFills(bar)
    .map((f) => `<i style="width:${f.w.toFixed(1)}%;background:${f.colour}"></i>`)
    .join('');
  const lines = legend && bar.parts?.length ? `<div class="lg">${bar.parts.map((p) => `<div style="--c:${TONE_COLOUR[p.tone]}">${esc(p.text)}</div>`).join('')}</div>` : '';
  return `<div class="br" data-bar="${i}"><div class="t">${esc(bar.label)}</div><div class="tr">${fills}</div><div class="n">${esc(bar.text)}</div>${lines}</div>`;
}

/** the card's HTML without its bars' moving numbers (what decides whether it is drawn again) */
function structureOf(c: ItemCard): string {
  return JSON.stringify({ ...c, bars: c.bars.map((b) => ({ label: b.label, tone: b.tone, colour: b.colour, parts: b.parts?.map((p) => p.tone) })) });
}

/** "缺发动机" in the before column: nothing to compare against */
const beforeOf = (s: string): string => (/\d/.test(s) ? s : '—');

/**
 * The card's HTML; compact = its icon and name in one line, what is in it and its state (the held thing's card, and
 * what the mark is on but for what lies on the ground — docs/V3/plan/prompts.md §五 4)
 */
export function cardHtml(c: ItemCard, compact = false, notes = true): string {
  const stars = c.stars > 0 ? `<div class="st" data-stars="${c.stars}" title="${c.stars} 星">${[0, 1, 2, 3, 4].map((i) => star(i < c.stars, c.stars >= 4)).join('')}</div>` : '';
  const tags = c.badges.length ? `<div class="tg">${c.badges.map((b) => `<span class="${b.tone}">${esc(b.text)}</span>`).join('')}</div>` : '';
  const secs: string[] = [];
  if (compact) {
    if (c.bars.length) secs.push(`<div class="sec">${c.bars.map((b, i) => barHtml(b, i, false)).join('')}</div>`);
    if (notes && c.notes.length) secs.push(`<div class="sec">${c.notes.map((n) => `<div class="nt ${n.tone}">${esc(n.text)}</div>`).join('')}</div>`);
    return `<div class="hd"><div class="nm">${iconSvg(c.icon)}${esc(c.name)}</div>${stars}</div>${secs.length ? `<div class="bd">${secs.join('')}</div>` : ''}`;
  }
  if (c.blurb) secs.push(`<div class="sec"><div class="desc">${esc(c.blurb)}</div></div>`);
  if (c.curve) secs.push(`<div class="sec"><div class="lab">${esc(c.curve.label)}</div>${curveSvg(c.curve)}</div>`);
  if (c.columns) secs.push(`<div class="sec"><div class="lab">${esc(c.columns.label)}</div>${columnsHtml(c.columns)}</div>`);
  if (c.rows.length) {
    if (c.rows.some((r) => r.from !== undefined))
      secs.push(
        `<div class="sec"><div class="cmp">${c.rows
          .map((r) => `<span class="k">${esc(r.label)}</span>${r.from !== undefined ? `<span class="a">${esc(beforeOf(r.from))}</span><span class="ar">→</span>` : '<span></span><span></span>'}<span class="b ${r.tone ?? ''}">${esc(r.value)}</span>`)
          .join('')}</div></div>`,
      );
    else secs.push(`<div class="sec"><div class="rw">${c.rows.map((r) => `${r.stars !== undefined ? starsHtml(r.stars, r.value) : `<b class="${r.tone ?? ''}">${esc(r.value)}</b>`}<span>${esc(r.label)}</span>`).join('')}</div></div>`);
  }
  if (c.bars.length) secs.push(`<div class="sec">${c.bars.map((b, i) => barHtml(b, i)).join('')}</div>`);
  if (c.notes.length) secs.push(`<div class="sec">${c.notes.map((n) => `<div class="nt ${n.tone}">${esc(n.text)}</div>`).join('')}</div>`);
  const f = c.foot;
  if (f.fits) secs.push(`<div class="sec"><div class="fits">${f.fits.startsWith('装在') ? esc(f.fits) : `能装：<b>${esc(f.fits)}</b>`}</div></div>`);
  const foot: string[] = [];
  if (f.cond !== undefined) foot.push(`<span>${COND}${Math.round(f.cond * 100)}%<em>${condWord(f.cond)}</em></span>`);
  if (f.mass !== undefined) foot.push(`<span>${MASS}${f.mass >= 100 ? f.mass.toFixed(0) : f.mass.toFixed(1)} kg</span>`);
  if (foot.length) secs.push(`<div class="sec"><div class="ft">${foot.join('')}</div></div>`);
  return `<div class="hd"><div class="cat">${iconSvg(c.icon)}${esc(c.cat)}</div><div class="nm">${esc(c.name)}</div>${stars}${tags}</div><div class="bd">${secs.join('')}</div>`;
}

/** one card on screen; showing the same contents again only moves its bars */
export class CardView {
  readonly el: HTMLDivElement;
  private structure = '';
  private card: ItemCard | null = null;
  private compact = false;
  private notes = true;
  /** counts the times it was drawn anew (its height may have changed) */
  drawn = 0;

  constructor(parent: HTMLElement, cls: string) {
    this.el = document.createElement('div');
    this.el.className = `mc-ic mc-frame ${cls}`;
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get shown(): ItemCard | null {
    return this.card;
  }

  /** compact: only what it is and what is in it, and (notes) how it stands */
  show(c: ItemCard | null, compact = false, notes = true): void {
    // (a kept card shown again the same way: nothing on it can have changed, it is not looked into)
    if (c && c.kept && c === this.card && compact === this.compact && notes === this.notes) return;
    this.card = c;
    this.compact = compact;
    this.notes = notes;
    if (!c) {
      this.el.style.display = 'none';
      this.structure = '';
      return;
    }
    this.el.style.display = '';
    const s = `${compact ? (notes ? 'c' : 'h') : 'f'}${structureOf(c)}`;
    if (s !== this.structure) {
      this.structure = s;
      this.el.classList.toggle('compact', compact);
      this.el.innerHTML = cardHtml(c, compact, notes);
      this.drawn++;
      return;
    }
    // the same card: its bars to their new values
    c.bars.forEach((bar, i) => {
      const e = this.el.querySelector(`[data-bar="${i}"]`);
      if (!e) return;
      (e.querySelector('.n') as HTMLElement).textContent = bar.text;
      const fills = barFills(bar);
      e.querySelectorAll<HTMLElement>('.tr i').forEach((x, k) => {
        if (fills[k]) x.style.width = `${fills[k].w.toFixed(1)}%`;
      });
      const lg = e.querySelectorAll<HTMLElement>('.lg div');
      bar.parts?.forEach((p, k) => {
        if (lg[k]) lg[k].textContent = p.text;
      });
    });
  }
}
