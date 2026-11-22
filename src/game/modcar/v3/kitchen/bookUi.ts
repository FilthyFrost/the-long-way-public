/**
 * The recipe book on screen (docs/V3/plan/cooking.md §3): J opens and shuts it. A page to each number of stars; every
 * dish a tile — its picture, its name and how often it was made, a gold mark when it once came out perfect; a dish not
 * yet made is its silhouette and "？？？". Beside the tiles, the one chosen: what it is made of and how (a dish not
 * yet made: a hint, the kinds of what it needs and never the names), and whether it is pinned — E pins it: what a
 * pinned dish needs is pointed out when it is in the hands, at the pot and on its card.
 *
 * The keys while it is open are its own (they do not reach the game: one does not walk off with the book open):
 * W A S D or the arrows choose, 1 to 5 turn to a page, E pins, J or Esc shuts it.
 */
import { hintOf, pinned, tally, togglePin } from '../../../../core/v3/kitchen/book';
import { DISHES, WAYS, type DishDef } from '../../../../core/v3/kitchen/dishes';
import { recipeLine, VESSEL } from '../../../../core/v3/kitchen/items';
import { DISH_LOOK } from '../../../../core/v3/kitchen/looks';
import { itemDef } from '../../../../core/modcar/items';
import { cloneModel, itemGlb } from '../../assets';
import type { GameContext } from '../../kernel/context';
import { PartThumbs } from '../../thumbs';
import type { Kitchen } from './system';

const COLS = 6;
/** rows of tiles on a page (the page is 600 tall) */
const ROWS = 4;

const CSS = `
.kt-book { position: absolute; z-index: 6; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 980px; height: 600px; padding: 16px 20px 12px; display: none; flex-direction: column; pointer-events: none; font-size: 14px; background: var(--grain), var(--smoke), linear-gradient(180deg, rgba(27,25,23,0.985), rgba(34,32,30,0.975)); box-shadow: 0 0 0 2.5px var(--ink), 0 6px 0 1px rgba(10,8,6,0.55), 0 0 0 2400px rgba(10,8,6,0.46); }
.kt-book.open { display: flex; }
.kt-book h3 { margin: 0; font-size: 21px; font-weight: 700; display: flex; align-items: baseline; gap: 14px; }
.kt-book h3 small { font-size: 13px; font-weight: 400; color: var(--tx-2); }
.kt-book .tabs { display: flex; gap: 6px; margin: 10px 0 10px; }
.kt-book .tabs span { padding: 3px 12px; border-radius: 999px; background: rgba(255,255,255,0.09); color: var(--tx-2); font-size: 13px; white-space: nowrap; }
.kt-book .tabs span.on { background: #f2efe8; color: var(--ink); font-weight: 700; }
.kt-book .tabs span i { font-style: normal; opacity: 0.7; margin-left: 6px; font-weight: 400; }
.kt-book .tabs em { margin-left: auto; align-self: center; font-style: normal; font-size: 12.5px; color: var(--tx-3); }
.kt-book .main { flex: 1; min-height: 0; display: flex; gap: 16px; }
.kt-book .grid { flex: 1; overflow: hidden; display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-auto-rows: 104px; gap: 6px; align-content: start; }
.kt-book .tile { position: relative; border-radius: 10px; background: rgba(255,255,255,0.05); border: 2px solid transparent; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 2px 4px 5px; overflow: hidden; }
.kt-book .tile.sel { border-color: var(--gold); background: rgba(233,193,74,0.12); }
.kt-book .tile img, .kt-book .tile .ph { width: 96px; height: 72px; object-fit: contain; }
.kt-book .ph { display: block; flex: none; }
.kt-book .tile.no img { filter: brightness(0); opacity: 0.45; }
.kt-book .tile .nm { width: 100%; text-align: center; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kt-book .tile.no .nm { color: var(--tx-3); }
.kt-book .tile .n { position: absolute; right: 5px; top: 3px; font-size: 11px; color: var(--tx-2); }
.kt-book .tile .p { position: absolute; left: 5px; top: 2px; font-size: 12px; color: var(--gold); }
.kt-book .tile .pin { position: absolute; left: 5px; bottom: 22px; font-size: 11px; color: var(--ink); background: var(--gold); border-radius: 999px; padding: 0 6px; font-weight: 700; }
.kt-book .side { width: 270px; flex: none; border-left: 1px solid var(--rule); padding-left: 16px; display: flex; flex-direction: column; }
.kt-book .side img, .kt-book .side .ph { width: 240px; height: 180px; object-fit: contain; align-self: center; }
.kt-book .side.no img { filter: brightness(0); opacity: 0.45; }
.kt-book .side .name { font-size: 20px; font-weight: 700; margin-top: 2px; }
.kt-book .side .stars { color: var(--gold); letter-spacing: 2px; margin: 2px 0 8px; }
.kt-book .side .row { color: #ece9e3; line-height: 1.6; }
.kt-book .side .row b { color: var(--tx-2); font-weight: 400; margin-right: 8px; }
.kt-book .side .hint { color: var(--tx-2); line-height: 1.6; }
.kt-book .side .pinned { margin-top: 8px; color: var(--gold); font-weight: 700; }
.kt-book .foot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--rule); color: var(--tx-2); font-size: 13px; text-align: center; }
.kt-book .foot b { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; margin: 0 3px 0 10px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 12px/1 var(--key-font); vertical-align: middle; }
`;

export class BookUi {
  private readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly thumbs = new PartThumbs();
  private readonly urls = new Map<string, string | null>();
  open = false;
  private page = 1;
  private sel = 0;
  private list: DishDef[] = [];
  private dirty = true;
  private waiting = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly sys: Kitchen,
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'mc-frame kt-book';
    ctx.ui.root.appendChild(this.el);
    window.addEventListener('keydown', this.key, true);
  }

  private readonly key = (e: KeyboardEvent): void => {
    if (e.repeat && e.code === 'KeyJ') return;
    const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT' || (e.target as HTMLElement | null)?.tagName === 'SELECT';
    if (typing) return;
    if (e.code === 'KeyJ') {
      // (in a seat the keys are the car's)
      if (!this.open && this.ctx.seated) return;
      this.toggle();
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    if (!this.open) return;
    // the book has the keys while it is open
    e.stopImmediatePropagation();
    e.preventDefault();
    const n = this.list.length;
    if (e.code === 'Escape') this.toggle(false);
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.sel = Math.min(n - 1, this.sel + 1);
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.sel = Math.max(0, this.sel - 1);
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') this.sel = Math.min(n - 1, this.sel + COLS);
    else if (e.code === 'KeyW' || e.code === 'ArrowUp') this.sel = Math.max(0, this.sel - COLS);
    else if (/^Digit[1-5]$/.test(e.code)) this.turn(Number(e.code.slice(5)));
    else if (e.code === 'KeyE' || e.code === 'Enter') {
      const d = this.list[this.sel];
      if (d) {
        const now = togglePin(this.sys.book, d.id);
        this.ctx.sound('switch', 0.5);
        this.ctx.ui.say(now ? `钉住了「${this.sys.book.made[d.id] ? d.zh : '？？？'}」：拿到它要的食材时会提醒。` : '不再钉住。', 2.2);
      }
    } else return;
    this.dirty = true;
  };

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('open', open);
    if (open) {
      // (to the pinned dish's page, or stay where one was)
      const pin = pinned(this.sys.book);
      if (pin) {
        this.turn(pin.stars);
        this.sel = Math.max(0, this.list.indexOf(pin));
      } else this.turn(this.page);
      this.ctx.sound('wrapper', 0.5);
    }
    this.dirty = true;
  }

  private turn(page: number): void {
    this.page = page;
    this.list = DISHES.filter((d) => d.stars === page);
    this.sel = 0;
  }

  /** a dish's picture (null until it is drawn) */
  private pic(d: DishDef): string | null {
    const key = `meal:${d.id}`;
    if (this.urls.has(key)) return this.urls.get(key) ?? null;
    this.urls.set(key, null);
    const look = DISH_LOOK[d.id];
    this.waiting++;
    this.thumbs.request(
      key,
      () => itemGlb(`meal_${look.meal}`).then((m) => (m ? cloneModel(m) : null)),
      (url) => {
        this.urls.set(key, url);
        this.waiting--;
        this.dirty = true;
      },
      look.paint,
      look.paint2,
    );
    return null;
  }

  /** every frame: the pictures still to draw, and the page when something on it changed */
  update(): void {
    if (!this.open) return;
    if (this.waiting > 0) this.thumbs.pump();
    if (!this.dirty) return;
    this.dirty = false;
    const book = this.sys.book;
    const t = tally(book);
    const pin = pinned(book);
    const rows = ROWS;
    const first = Math.max(0, Math.min(Math.floor(this.sel / COLS) - rows + 1, Math.floor(this.sel / COLS)));
    const top = Math.max(0, Math.min(first, Math.ceil(this.list.length / COLS) - rows)) * COLS;
    let tiles = '';
    for (let i = top; i < Math.min(this.list.length, top + rows * COLS); i++) {
      const d = this.list[i];
      const e = book.made[d.id];
      const url = this.pic(d);
      tiles += `<div class="tile${i === this.sel ? ' sel' : ''}${e ? '' : ' no'}">${url ? `<img src="${url}">` : '<i class="ph"></i>'}${e ? `<span class="n">×${e.n}</span>${e.p ? '<span class="p">★ 完美</span>' : ''}` : ''}${pin === d ? '<span class="pin">钉住</span>' : ''}<div class="nm">${e ? d.zh : '？？？'}</div></div>`;
    }
    const d = this.list[this.sel];
    let side = '';
    if (d) {
      const e = book.made[d.id];
      const url = this.pic(d);
      side = `<div class="side${e ? '' : ' no'}">${url ? `<img src="${url}">` : '<i class="ph"></i>'}<div class="name">${e ? d.zh : '？？？'}</div><div class="stars">${'★'.repeat(d.stars)}</div>`;
      side += `<div class="row"><b>厨具</b>${itemDef(VESSEL[d.way]).name.zh}（${WAYS[d.way].zh}）</div>`;
      if (e) side += `<div class="row"><b>做法</b>${recipeLine(d)}</div><div class="row"><b>做过</b>${e.n} 次${e.p ? ' · 做到过完美' : ' · 还没做到完美'}</div><div class="hint" style="margin-top:6px">切好、调过味、火候正好，就是完美。</div>`;
      else side += `<div class="hint">还没做出来过。<br>线索：${hintOf(d)}</div>`;
      if (pin === d) side += '<div class="pinned">已钉住</div>';
      side += '</div>';
    }
    const shown = Math.min(this.list.length, top + rows * COLS);
    let tabs = '';
    for (let s = 1; s <= 5; s++) tabs += `<span class="${s === this.page ? 'on' : ''}">${'★'.repeat(s)}<i>${t.stars[s - 1].made}/${t.stars[s - 1].total}</i></span>`;
    this.el.innerHTML = `<h3>食谱本<small>做出来过 ${t.made} / ${t.total} 道 · 完美 ${t.perfect} 道 · 记下的失败搭配 ${book.fails.length} 个</small></h3><div class="tabs">${tabs}<em>${this.list.length > rows * COLS ? `第 ${top + 1}–${shown} 道，共 ${this.list.length} 道` : ''}</em></div><div class="main"><div class="grid">${tiles}</div>${side}</div><div class="foot"><b>W</b><b>A</b><b>S</b><b>D</b>选菜<b>1</b>–<b>5</b>翻到几星<b>E</b>钉住 / 取消<b>J</b>合上</div>`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.key, true);
    this.el.remove();
    this.style.remove();
  }
}
