/**
 * The item cards drawn (docs/MODCAR.md §5.5): a card for what is in the hands on the right of the screen
 * and one for what the mark is on beside the mark — what it is, its grade, a line about it, its curve,
 * its numbers, what is in it as bars, its condition and weight. Cream paper and dark ink like the rest
 * of the workshop's words. A card with the same contents is not drawn again; its bars move in place
 * (fuel going in while the can pours).
 */
import type { CardBar, CardCurve, CardColumns, CardIcon, ItemCard, Tone } from './itemInfo';

export const TONE_COLOUR: Record<Tone, string> = {
  petrol: '#e0912f',
  diesel: '#b9a43a',
  mix2t: '#c47bb8',
  water: '#4a9bd6',
  oil: '#8d5d22',
  charge: '#4fae5a',
  good: '#4f9a4a',
  mid: '#d0a032',
  bad: '#c4552e',
};

export const CARD_CSS = `
.mc-ic { position: absolute; z-index: 2; width: 300px; max-height: calc(100vh - 150px); overflow: hidden; border-radius: 12px; background: rgba(250,244,228,0.96); box-shadow: 0 3px 0 rgba(60,40,24,0.22), 0 0 0 1px rgba(60,40,24,0.13); color: #2b2622; font-size: 13px; line-height: 1.4; transition: opacity 0.12s; }
.mc-ic .hd { padding: 9px 14px 8px; background: linear-gradient(180deg, #efe0bf 0%, #f6ecd6 100%); border-bottom: 1px solid rgba(60,40,24,0.12); }
.mc-ic .cat { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: #7a6a5a; letter-spacing: 0.04em; }
.mc-ic .cat svg { width: 14px; height: 14px; flex: none; }
.mc-ic .nm { margin-top: 1px; font-size: 18px; font-weight: 700; line-height: 1.25; }
.mc-ic .st { margin-top: 1px; font-size: 13px; letter-spacing: 2px; color: #c98a2a; }
.mc-ic .st i { font-style: normal; color: rgba(60,40,24,0.2); }
.mc-ic .bd { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.mc-ic .bd span { padding: 0 6px; border-radius: 5px; font-size: 11px; line-height: 1.6; background: rgba(60,40,24,0.08); color: #5a4c40; }
.mc-ic .bd span.stock { background: rgba(63,125,58,0.14); color: #3f7d3a; }
.mc-ic .bd span.apoc { background: rgba(163,71,46,0.14); color: #a3472e; }
.mc-ic .bd span.meme { background: rgba(196,140,40,0.2); color: #946414; }
.mc-ic .bd span.warn { background: #c4552e; color: #fff6e6; }
.mc-ic .bl { padding: 7px 14px 0; color: #5a4c40; font-size: 12.5px; line-height: 1.5; }
.mc-ic .sec { margin: 0 14px; padding: 7px 0; border-top: 1px solid rgba(60,40,24,0.1); }
.mc-ic .bl + .sec { margin-top: 7px; }
.mc-ic .sec:first-of-type { border-top: 0; }
.mc-ic .lab { font-size: 11.5px; color: #7a6a5a; margin-bottom: 3px; }
.mc-ic svg.cv { display: block; width: 100%; height: 82px; }
.mc-ic .cols { display: flex; align-items: flex-end; gap: 4px; height: 58px; }
.mc-ic .cols div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 10.5px; color: #7a6a5a; }
.mc-ic .cols i { display: block; width: 72%; border-radius: 3px 3px 0 0; background: #a3472e; }
.mc-ic .cols b { font-size: 10px; font-weight: 600; color: #5a4c40; }
.mc-ic .rw { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 1px; }
.mc-ic .rw b { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mc-ic .rw b.good { color: #3f7d3a; } .mc-ic .rw b.bad { color: #b0482a; }
.mc-ic .rw span { color: #6a5a4a; }
.mc-ic .rw s { text-decoration: none; color: #9a8a7a; font-weight: 400; }
.mc-ic .br { margin: 2px 0 6px; }
.mc-ic .br:last-child { margin-bottom: 0; }
.mc-ic .br .t { display: flex; justify-content: space-between; font-size: 12px; }
.mc-ic .br .t b { font-weight: 700; }
.mc-ic .br .t span { font-variant-numeric: tabular-nums; color: #5a4c40; }
.mc-ic .tr { position: relative; height: 8px; margin-top: 3px; border-radius: 4px; background: rgba(60,40,24,0.12); overflow: hidden; display: flex; }
.mc-ic .tr i { display: block; height: 100%; transition: width 0.15s linear; }
.mc-ic .lg { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 3px; font-size: 11.5px; color: #5a4c40; }
.mc-ic .lg span::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 2px; background: var(--c); vertical-align: 0; }
.mc-ic .nt { font-size: 12px; line-height: 1.45; margin: 1px 0; padding-left: 16px; text-indent: -16px; }
.mc-ic .nt::before { display: inline-block; width: 16px; text-indent: 0; }
.mc-ic .nt.warn { color: #b0482a; } .mc-ic .nt.warn::before { content: '!'; font-weight: 800; }
.mc-ic .nt.ok { color: #3f7d3a; } .mc-ic .nt.ok::before { content: '✓'; }
.mc-ic .nt.info { color: #6a5a4a; } .mc-ic .nt.info::before { content: '·'; font-weight: 800; }
.mc-ic .ft { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; padding: 7px 14px 9px; border-top: 1px solid rgba(60,40,24,0.12); background: rgba(60,40,24,0.035); font-size: 12px; color: #5a4c40; }
.mc-ic .ft b { font-variant-numeric: tabular-nums; color: #2b2622; }
.mc-ic .ft .cb { display: inline-block; width: 34px; height: 5px; margin-left: 4px; border-radius: 3px; background: rgba(60,40,24,0.14); overflow: hidden; vertical-align: 1px; }
.mc-ic .ft .cb i { display: block; height: 100%; }
.mc-ic .ft .fits { flex-basis: 100%; color: #7a6a5a; font-size: 11.5px; }
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
};

export function iconSvg(icon: CardIcon, colour = '#a3472e'): string {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${ICON_PATH[icon]}</svg>`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function curveSvg(c: CardCurve): string {
  const W = 272;
  const H = 96;
  const l = 30;
  const r = 6;
  const t = 6;
  const b = 16;
  const x0 = c.xTicks[0];
  const x1 = c.xTicks.at(-1)!;
  const y1 = c.yTicks.at(-1)!;
  const X = (x: number): number => l + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - l - r);
  const Y = (y: number): number => H - b - (y / Math.max(1e-6, y1)) * (H - t - b);
  const grid = [
    ...c.yTicks.map((y) => `<line x1="${l}" x2="${W - r}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" stroke="rgba(60,40,24,0.12)" />` + `<text x="${l - 4}" y="${(Y(y) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8a7a6a">${y}</text>`),
    ...c.xTicks.map((x) => `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${t}" y2="${H - b}" stroke="rgba(60,40,24,0.08)" />` + `<text x="${X(x).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#8a7a6a">${x}</text>`),
  ].join('');
  const pts = c.points.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
  const area = `M${X(c.points[0][0]).toFixed(1)},${Y(0).toFixed(1)} L${pts.join(' L')} L${X(c.points.at(-1)![0]).toFixed(1)},${Y(0).toFixed(1)} Z`;
  const peak = c.peak ? `<circle cx="${X(c.peak[0]).toFixed(1)}" cy="${Y(c.peak[1]).toFixed(1)}" r="3" fill="#a3472e" stroke="#fbf3e1" stroke-width="1.2" />` : '';
  return `<svg class="cv" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}<path d="${area}" fill="rgba(163,71,46,0.12)" /><polyline points="${pts.join(' ')}" fill="none" stroke="#a3472e" stroke-width="2" stroke-linejoin="round" />${peak}</svg>`;
}

function columnsHtml(c: CardColumns): string {
  return `<div class="cols">${c.items.map((it) => `<div><b>${it.value.toFixed(2)}</b><i style="height:${Math.max(4, Math.min(100, (it.value / c.max) * 100)).toFixed(0)}%"></i>${esc(it.label)}</div>`).join('')}</div>`;
}

function barFills(bar: CardBar): { colour: string; w: number }[] {
  const max = Math.max(1e-6, bar.max);
  if (bar.parts?.length) return bar.parts.map((p) => ({ colour: TONE_COLOUR[p.tone], w: Math.min(100, (p.value / max) * 100) }));
  return [{ colour: TONE_COLOUR[bar.tone], w: Math.min(100, (Math.max(0, bar.value) / max) * 100) }];
}

function barHtml(bar: CardBar, i: number): string {
  const fills = barFills(bar)
    .map((f) => `<i style="width:${f.w.toFixed(1)}%;background:${f.colour}"></i>`)
    .join('');
  const legend = bar.parts?.length ? `<div class="lg">${bar.parts.map((p) => `<span style="--c:${TONE_COLOUR[p.tone]}">${esc(p.text)}</span>`).join('')}</div>` : '';
  return `<div class="br" data-bar="${i}"><div class="t"><b>${esc(bar.label)}</b><span>${esc(bar.text)}</span></div><div class="tr">${fills}</div>${legend}</div>`;
}

/** the card's HTML without its bars' moving numbers (what decides whether it is drawn again) */
function structureOf(c: ItemCard): string {
  return JSON.stringify({ ...c, bars: c.bars.map((b) => ({ label: b.label, tone: b.tone, parts: b.parts?.map((p) => p.tone) })) });
}

export function cardHtml(c: ItemCard): string {
  const stars = c.stars > 0 ? `<div class="st">${'★'.repeat(c.stars)}<i>${'★'.repeat(5 - c.stars)}</i></div>` : '';
  const badges = c.badges.length ? `<div class="bd">${c.badges.map((b) => `<span class="${b.tone}">${esc(b.text)}</span>`).join('')}</div>` : '';
  const secs: string[] = [];
  if (c.curve) secs.push(`<div class="sec"><div class="lab">${esc(c.curve.label)}</div>${curveSvg(c.curve)}</div>`);
  if (c.columns) secs.push(`<div class="sec"><div class="lab">${esc(c.columns.label)}</div>${columnsHtml(c.columns)}</div>`);
  if (c.rows.length) secs.push(`<div class="sec"><div class="rw">${c.rows.map((r) => `<b class="${r.tone ?? ''}">${r.from !== undefined ? `<s>${esc(r.from)} → </s>` : ''}${esc(r.value)}</b><span>${esc(r.label)}</span>`).join('')}</div></div>`);
  if (c.bars.length) secs.push(`<div class="sec">${c.bars.map(barHtml).join('')}</div>`);
  if (c.notes.length) secs.push(`<div class="sec">${c.notes.map((n) => `<div class="nt ${n.tone}">${esc(n.text)}</div>`).join('')}</div>`);
  const f = c.foot;
  const foot: string[] = [];
  if (f.cond !== undefined) {
    const tone: Tone = f.cond > 0.6 ? 'good' : f.cond > 0.3 ? 'mid' : 'bad';
    foot.push(`<span>成色 <b>${Math.round(f.cond * 100)}%</b><span class="cb"><i style="width:${(f.cond * 100).toFixed(0)}%;background:${TONE_COLOUR[tone]}"></i></span></span>`);
  }
  if (f.mass !== undefined) foot.push(`<span>重量 <b>${f.mass >= 100 ? f.mass.toFixed(0) : f.mass.toFixed(1)} kg</b></span>`);
  if (f.fits) foot.push(`<span class="fits">${f.fits.startsWith('装在') ? esc(f.fits) : `能装：${esc(f.fits)}`}</span>`);
  return (
    `<div class="hd"><div class="cat">${iconSvg(c.icon)}${esc(c.cat)}</div><div class="nm">${esc(c.name)}</div>${stars}${badges}</div>` +
    (c.blurb ? `<div class="bl">${esc(c.blurb)}</div>` : '') +
    secs.join('') +
    (foot.length ? `<div class="ft">${foot.join('')}</div>` : '')
  );
}

/** one card on screen; showing the same contents again only moves its bars */
export class CardView {
  readonly el: HTMLDivElement;
  private structure = '';
  private card: ItemCard | null = null;

  constructor(parent: HTMLElement, cls: string) {
    this.el = document.createElement('div');
    this.el.className = `mc-ic ${cls}`;
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  get shown(): ItemCard | null {
    return this.card;
  }

  show(c: ItemCard | null): void {
    this.card = c;
    if (!c) {
      this.el.style.display = 'none';
      this.structure = '';
      return;
    }
    this.el.style.display = '';
    const s = structureOf(c);
    if (s !== this.structure) {
      this.structure = s;
      this.el.innerHTML = cardHtml(c);
      return;
    }
    // the same card: its bars to their new values
    c.bars.forEach((bar, i) => {
      const e = this.el.querySelector(`[data-bar="${i}"]`);
      if (!e) return;
      (e.querySelector('.t span') as HTMLElement).textContent = bar.text;
      const fills = barFills(bar);
      e.querySelectorAll<HTMLElement>('.tr i').forEach((x, k) => {
        if (fills[k]) x.style.width = `${fills[k].w.toFixed(1)}%`;
      });
      const lg = e.querySelectorAll<HTMLElement>('.lg span');
      bar.parts?.forEach((p, k) => {
        if (lg[k]) lg[k].textContent = p.text;
      });
    });
  }
}
