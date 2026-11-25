/**
 * The crafting bench's list (docs/MODCAR.md §14, docs/V3/plan/finish.md §六 3): the materials there are, the things
 * one knows how to make — those and no others: a making is learnt from its blueprint, and until then it is not on the
 * list — and the one picked: its picture, what it is, what it costs against what there is (short in red), how many
 * blows of the hammer, with the button that makes it. In the HUD's cartoon frame, on the right of the view; the bench
 * and its plate stay in sight. The wheel (or W / S) picks, the left button on "制作" (or Enter) makes it, Esc closes.
 */
import { shortOf, type Recipe, type Stock } from '../../core/modcar/crafting';
import { MATERIAL_IDS, MATERIALS } from '../../core/modcar/items';
import type { ItemCard } from './itemInfo';

export interface CraftRow {
  recipe: Recipe;
  open: boolean;
  name: string;
  icon: string | null;
  card: ItemCard;
  hits: number;
}

export interface CraftHost {
  rows(): CraftRow[];
  stock(): Stock;
  craft(id: string): void;
  close(): void;
}

const CSS = `
.mc-craft { position: absolute; right: 26px; top: 64px; bottom: 74px; width: 600px; display: flex; flex-direction: column; padding: 14px 16px 12px; pointer-events: auto; z-index: 6; }
.mc-craft .hd { display: flex; align-items: center; gap: 12px; padding-bottom: 9px; border-bottom: 1px solid var(--rule); }
.mc-craft .hd h3 { margin: 0; font-size: 21px; font-weight: 700; flex: 1; }
.mc-craft .stock { display: flex; gap: 12px; }
.mc-craft .stock span, .mc-craft .cost span { display: inline-flex; align-items: center; gap: 4px; font: 700 15px var(--key-font); }
.mc-craft .stock svg { width: 20px; height: 20px; }
.mc-craft .tabs { display: flex; gap: 6px; margin: 10px 0 8px; }
.mc-craft .tabs button { padding: 4px 12px; border-radius: 999px; border: 2px solid rgba(239,230,211,0.45); background: rgba(255,255,255,0.06); color: #fff; font: 700 13.5px inherit; cursor: pointer; }
.mc-craft .tabs button.on { background: #f6f2ea; color: var(--ink); border-color: var(--ink); box-shadow: 0 2px 0 var(--ink); }
.mc-craft .body { flex: 1; display: flex; gap: 14px; min-height: 0; }
.mc-craft .list { width: 262px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px; }
.mc-craft .row { display: flex; align-items: center; gap: 9px; padding: 5px 7px; border-radius: 10px; cursor: pointer; border: 2px solid transparent; }
.mc-craft .row:hover { background: rgba(255,255,255,0.07); }
.mc-craft .row.sel { background: rgba(255,255,255,0.12); border-color: rgba(239,230,211,0.7); }
.mc-craft .row img, .mc-craft .row .ph { width: 38px; height: 38px; flex: none; border-radius: 8px; background: rgba(255,255,255,0.06); object-fit: contain; }
.mc-craft .row .nm { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; line-height: 1.25; }
.mc-craft .row .nm small { display: block; font: 400 12px inherit; color: var(--tx-2); }
.mc-craft .list .more { margin-top: 8px; padding: 8px 9px; border-top: 1px dashed var(--rule); font-size: 12.5px; line-height: 1.5; color: var(--tx-2); }
.mc-craft .row .short { color: #ff8f80; }
.mc-craft .det { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mc-craft .det .top { display: flex; gap: 12px; align-items: center; }
.mc-craft .det .top img, .mc-craft .det .top .ph { width: 92px; height: 92px; flex: none; border-radius: 12px; background: rgba(255,255,255,0.06); object-fit: contain; }
.mc-craft .det h4 { margin: 0; font-size: 19px; }
.mc-craft .det .cat { color: var(--tx-2); font-size: 12.5px; margin-bottom: 2px; }
.mc-craft .det .stars { color: #fff; letter-spacing: 2px; font-size: 13px; }
.mc-craft .det .stars i { font-style: normal; color: rgba(255,255,255,0.25); }
.mc-craft .det .blurb { margin: 9px 0 6px; font-size: 13.5px; line-height: 1.5; color: #ece9e3; }
.mc-craft .det .rows { font-size: 13px; color: var(--tx-2); display: flex; flex-direction: column; gap: 3px; }
.mc-craft .det .rows b { color: #fff; margin-right: 6px; }
.mc-craft .det .need { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--rule); }
.mc-craft .det .need .lbl { font-size: 12.5px; color: var(--tx-2); margin-bottom: 5px; }
.mc-craft .det .cost { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
.mc-craft .det .cost svg { width: 22px; height: 22px; }
.mc-craft .det .cost .have { font: 400 12.5px inherit; color: var(--tx-2); margin-left: 3px; }
.mc-craft .det .cost span.short { color: #ff8f80; }
.mc-craft .det button.go { width: 100%; padding: 10px 14px; border-radius: 12px; border: 3px solid var(--ink); background: #e9c14a; color: var(--ink); box-shadow: 0 4px 0 var(--ink); font: 800 16px inherit; cursor: pointer; }
.mc-craft .det button.go:hover { background: #f2d061; }
.mc-craft .det button.go:disabled { background: rgba(255,255,255,0.12); color: var(--tx-3); border-color: rgba(239,230,211,0.35); box-shadow: none; cursor: default; }
.mc-craft .ft { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--rule); font-size: 12.5px; color: var(--tx-2); }
.mc-craft .ft b { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; margin: 0 3px; padding: 0 5px; border-radius: 6px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); font: 700 11.5px/1 var(--key-font); }
`;

/** the materials' little pictures: a cog for scrap, a chip with its legs for components (in their colours) */
export function materialIcon(m: (typeof MATERIAL_IDS)[number]): string {
  const c = `#${MATERIALS[m].hex.toString(16).padStart(6, '0')}`;
  if (m === 'scrap') return `<svg viewBox="0 0 24 24"><path fill="${c}" stroke="#17120f" stroke-width="1.6" d="M10.4 2h3.2l.5 2.6 1.9.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.9 2.6.5v3.2l-2.6.5-.8 1.9 1.5 2.2-2.3 2.3-2.2-1.5-1.9.8-.5 2.6h-3.2l-.5-2.6-1.9-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.9L2 13.6v-3.2l2.6-.5.8-1.9-1.5-2.2 2.3-2.3 2.2 1.5 1.9-.8z"/><circle cx="12" cy="12" r="3.2" fill="#17120f"/></svg>`;
  return `<svg viewBox="0 0 24 24"><path fill="${c}" stroke="#17120f" stroke-width="1.6" stroke-linejoin="round" d="M7 7h10v10H7z"/><path d="M10 7V3m4 4V3m-4 18v-4m4 4v-4M7 10H3m4 4H3m18-4h-4m4 4h-4" stroke="#17120f" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M10 10h4v4h-4z" fill="#17120f" opacity="0.35"/></svg>`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class CraftUi {
  private readonly el: HTMLDivElement;
  private sel = '';
  private shown = false;
  private key0 = '';
  private refreshT = 0;

  constructor(
    root: HTMLElement,
    private readonly host: CraftHost,
  ) {
    if (!document.getElementById('mc-craft-css')) {
      const st = document.createElement('style');
      st.id = 'mc-craft-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-craft mc-frame';
    this.el.style.display = 'none';
    root.appendChild(this.el);
    // (the wheel picks, wherever on the card it is turned: the list follows the one picked)
    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.move(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  get open(): boolean {
    return this.shown;
  }

  show(): void {
    this.shown = true;
    this.el.style.display = '';
    const rows = this.visible();
    if (!rows.some((r) => r.recipe.id === this.sel)) this.sel = rows[0]?.recipe.id ?? '';
    this.key0 = '';
    this.draw();
  }

  hide(): void {
    this.shown = false;
    this.el.style.display = 'none';
  }

  /** the pictures come in as they are drawn, the stock changes: drawn again when anything shown changed */
  update(dt: number): void {
    if (!this.shown) return;
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.25;
    this.draw();
  }

  key(code: string): boolean {
    if (!this.shown) return false;
    if (code === 'KeyW' || code === 'ArrowUp') this.move(-1);
    else if (code === 'KeyS' || code === 'ArrowDown') this.move(1);
    else if (code === 'Enter' || code === 'Space') this.make();
    else return false;
    return true;
  }

  /** what one knows how to make, in the order it was to be learnt in */
  private visible(): CraftRow[] {
    return this.host.rows().filter((r) => r.open);
  }

  private move(d: number): void {
    const rows = this.visible();
    if (!rows.length) return;
    const i = Math.max(0, rows.findIndex((r) => r.recipe.id === this.sel));
    this.sel = rows[(i + d + rows.length) % rows.length].recipe.id;
    this.draw();
  }

  private make(): void {
    const r = this.host.rows().find((x) => x.recipe.id === this.sel);
    if (!r || !r.open || shortOf(this.host.stock(), r.recipe.cost)) return;
    this.host.craft(r.recipe.id);
  }

  private costHtml(cost: Recipe['cost'], stock: Stock, have = false): string {
    return MATERIAL_IDS.filter((m) => (cost[m] ?? 0) > 0)
      .map((m) => `<span class="${(stock[m] ?? 0) < (cost[m] ?? 0) ? 'short' : ''}">${materialIcon(m)}${cost[m]}${have ? `<span class="have">（有 ${stock[m] ?? 0}）</span>` : ''}</span>`)
      .join('');
  }

  private draw(): void {
    const rows = this.visible();
    const stock = this.host.stock();
    const sel = rows.find((r) => r.recipe.id === this.sel) ?? rows[0];
    const key = JSON.stringify([this.sel, stock, rows.map((r) => [r.recipe.id, !!r.icon])]);
    if (key === this.key0) return;
    this.key0 = key;
    const listScroll = (this.el.querySelector('.list') as HTMLElement | null)?.scrollTop ?? 0;
    const img = (url: string | null, cls = ''): string => (url ? `<img src="${url}" class="${cls}">` : `<div class="ph ${cls}"></div>`);
    const stars = (n: number): string => (n > 0 ? `<div class="stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></div>` : '');
    const short = sel ? shortOf(stock, sel.recipe.cost) : null;
    this.el.innerHTML = `
      <div class="hd"><h3>工作台</h3><div class="stock">${MATERIAL_IDS.map((m) => `<span title="${MATERIALS[m].name.zh}">${materialIcon(m)}${stock[m] ?? 0}</span>`).join('')}</div></div>
      <div class="body">
        <div class="list">${rows
          .map((r) => {
            const s = shortOf(stock, r.recipe.cost);
            return `<div class="row ${r.recipe.id === sel?.recipe.id ? 'sel' : ''}" data-id="${r.recipe.id}">${img(r.icon)}<div class="nm">${esc(r.name)}<small class="${s ? 'short' : ''}">${this.costPlain(r.recipe.cost)}</small></div></div>`;
          })
          .join('')}<div class="more">路上找到图纸，拿在手里按右键学会，这里就多一样。</div></div>
        <div class="det">${
          sel
            ? `<div class="top">${img(sel.icon)}<div><div class="cat">${esc(sel.card.cat)}</div><h4>${esc(sel.name)}</h4>${stars(sel.card.stars)}</div></div>
          <div class="blurb">${esc(sel.card.blurb)}</div>
          <div class="rows">${sel.card.rows
            .slice(0, 4)
            .map((r) => `<div><b>${r.value}</b>${esc(r.label)}</div>`)
            .join('')}</div>
          <div class="need"><div class="lbl">需要的材料 · 做的时候敲 ${sel.hits} 下锤子</div><div class="cost">${this.costHtml(sel.recipe.cost, stock, true)}</div>
          <button class="go" ${short ? 'disabled' : ''}>${short ? `材料不够：还差 ${short.n} ${MATERIALS[short.mat].name.zh}` : '制作'}</button></div>`
            : ''
        }</div>
      </div>
      <div class="ft"><span>滚轮 选 · 左键点 <b>制作</b></span><span><b>Esc</b> 离开</span></div>`;
    const list = this.el.querySelector('.list') as HTMLElement;
    list.scrollTop = listScroll;
    // (the picked one kept in sight)
    const picked = list.querySelector('.row.sel') as HTMLElement | null;
    if (picked && (picked.offsetTop < list.scrollTop || picked.offsetTop + picked.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = picked.offsetTop - 40;
    this.el.querySelectorAll('.row').forEach((b) =>
      b.addEventListener('click', () => {
        this.sel = (b as HTMLElement).dataset.id ?? '';
        this.draw();
      }),
    );
    this.el.querySelector('button.go')?.addEventListener('click', () => this.make());
  }

  private costPlain(cost: Recipe['cost']): string {
    return MATERIAL_IDS.filter((m) => (cost[m] ?? 0) > 0)
      .map((m) => `${cost[m]} ${MATERIALS[m].name.zh}`)
      .join(' · ');
  }

  dispose(): void {
    this.el.remove();
  }
}
