/**
 * The compendium: a page of the Tab screen (docs/V3/plan/finish.md §九 and §十四: 图鉴 — 鱼、车、收藏、照片). Four parts,
 * one after another as the page is turned:
 *
 *  - the fish of the waters by their rarity — one caught by its name, how many, the longest and the heaviest and the
 *    best medal; one never caught as ？？？ with the water it lives in (where to look is no secret; what it is, is).
 *    It reads the module's own log (core/v3/fishing/lite/log.ts);
 *  - the vehicles driven, the keepsakes met and the photographs taken, as the game's record has them
 *    (game/modcar/journal.ts, GameContext.journalBook) — absent, the fish alone.
 *
 * The wheel goes down the list; A and D turn through the four parts and then on to the Tab screen's next page, as
 * they turn its pages everywhere else (no key of its own); Esc and Tab shut it.
 */
import { FISH } from '../../../../core/v3/fishing/lite/fish';
import type { FishLog } from '../../../../core/v3/fishing/lite/log';
import { SPOTS } from '../../../../core/v3/fishing/lite/spots';
import { MEDAL_ZH, TIERS, type FishDef } from '../../../../core/v3/fishing/lite/types';
import type { JournalRow, JournalSection } from '../../journal';
import type { GameContext } from '../../kernel/context';

const CSS = `
.fj-book { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 760px; max-width: 94vw; padding: 16px 20px 12px; display: none; flex-direction: column; color: var(--tx); pointer-events: none; }
.fj-book.open { display: flex; }
.fj-book .head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.fj-book .head .t { font-size: 22px; font-weight: 700; letter-spacing: 2px; }
.fj-book .head .parts { flex: 1 1 auto; margin-left: 18px; font-size: 15px; color: var(--tx-2); }
.fj-book .head .parts span { margin-right: 14px; padding: 2px 8px; border-radius: 8px; }
.fj-book .head .parts span.on { color: var(--tx); background: rgba(255,255,255,0.14); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.35); }
.fj-book .head .n { color: var(--tx-2); font-size: 14px; }
.fj-book .head .n b { color: var(--gold); }
.fj-book .body { display: flex; gap: 16px; min-height: 380px; }
.fj-book .list { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; }
.fj-book .tier { margin: 6px 0 2px; font-size: 12px; letter-spacing: 2px; }
.fj-book .row { display: flex; align-items: center; gap: 10px; padding: 3px 10px; border-radius: 8px; font-size: 15px; line-height: 1.5; }
.fj-book .row.sel { background: rgba(255,255,255,0.12); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.35); }
.fj-book .row .nm { flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fj-book .row.no .nm { color: var(--tx-2); }
.fj-book .row .v { color: var(--tx-2); font-size: 13px; white-space: nowrap; }
.fj-book .row .md { color: var(--gold); font-size: 12px; white-space: nowrap; min-width: 34px; text-align: right; }
.fj-book .none { color: var(--tx-2); font-size: 15px; padding: 24px 10px; }
.fj-book .side { flex: 0 0 250px; border-left: 1px solid var(--rule); padding-left: 16px; font-size: 14px; line-height: 1.7; }
.fj-book .side .nm { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.fj-book .side .ti { font-size: 12px; letter-spacing: 2px; margin-bottom: 8px; }
.fj-book .side .ln b { color: var(--tx-2); font-weight: 400; margin-right: 8px; }
.fj-book .side .note { margin-top: 8px; color: var(--tx-2); }
.fj-book .side img { display: block; width: 100%; border-radius: 6px; margin: 4px 0 10px; box-shadow: 0 0 0 5px #f3efe6; }
.fj-book .foot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--rule); color: var(--tx-2); font-size: 13px; text-align: center; }
.fj-book .foot b { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; margin: 0 3px 0 10px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); font-size: 12px; font-weight: 700; }
`;

/** how many rows of the list are on the page at once */
const ROWS = 13;

const cm = (v: number): string => (v >= 100 ? `${(v / 100).toFixed(2)} 米` : `${Math.round(v)} 厘米`);
const kg = (v: number): string => (v >= 1 ? `${v.toFixed(1)} 公斤` : `${Math.round(v * 1000)} 克`);

export class JournalUi {
  private readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  open = false;
  /** which part is shown (0: the fish), and the row chosen in each */
  private part = 0;
  private readonly sels: number[] = [0, 0, 0, 0];
  private dirty = true;
  private off: (() => void) | null = null;
  /** the record's count when the page was last drawn (it is drawn again as the record grows) */
  private rev = -1;
  /** the photographs' pictures asked for: their addresses as they come ('' : none in this browser) */
  private readonly pictures = new Map<string, string>();
  /** the fish in the order of the page: by rarity, then by water */
  private readonly order: FishDef[] = [...FISH].sort((a, b) => a.tier - b.tier || a.spot - b.spot);

  constructor(
    private readonly ctx: GameContext,
    private readonly log: () => FishLog,
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'mc-frame fj-book';
    ctx.ui.root.appendChild(this.el);
    window.addEventListener('keydown', this.key, true);
    this.off = ctx.addTabPage?.({ id: 'journal', title: '图鉴', show: (open) => this.toggle(open), wheel: (dir) => this.wheel(dir) }) ?? null;
  }

  private readonly key = (e: KeyboardEvent): void => {
    if (!this.open) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    // the page has the keys while it is open
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.code === 'Escape' || e.code === 'Tab') {
      if (e.repeat) return;
      if (this.ctx.closeTab) this.ctx.closeTab();
      else this.toggle(false);
      return;
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
      if (!e.repeat) this.turn(e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') this.wheel(1);
    else if (e.code === 'KeyW' || e.code === 'ArrowUp') this.wheel(-1);
  };

  /** the record's parts after the fish (none: a game without the record) */
  private more(): JournalSection[] {
    return this.ctx.journalBook?.sections() ?? [];
  }

  /** A or D: the part before or after; past the last (or before the first) the Tab screen's own next page */
  private turn(dir: -1 | 1): void {
    const n = 1 + this.more().length;
    const to = this.part + dir;
    if (to < 0 || to >= n) {
      // (come round to it again, it opens on the fish)
      this.part = 0;
      this.ctx.turnTab?.(dir);
      return;
    }
    this.part = to;
    this.dirty = true;
  }

  /** how many rows the part shown has */
  private count(): number {
    return this.part === 0 ? this.order.length : (this.more()[this.part - 1]?.rows.length ?? 0);
  }

  /** the wheel a notch (1 down, −1 up): the next row of the list, or the one before */
  wheel(dir: 1 | -1): void {
    if (!this.open) return;
    const to = (this.sels[this.part] ?? 0) + dir;
    if (to < 0 || to >= this.count()) return;
    this.sels[this.part] = to;
    this.dirty = true;
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('open', open);
    this.dirty = true;
  }

  /** drawn again when something of it changed (each frame it is open: a catch may have come in) */
  update(): void {
    if (!this.open) return;
    const rev = this.ctx.journalBook?.rev ?? 0;
    if (rev !== this.rev) {
      this.rev = rev;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const more = this.more();
    if (this.part > more.length) this.part = 0;
    const names = ['鱼', ...more.map((s) => s.title)];
    const parts = names.length > 1 ? names.map((n, i) => `<span${i === this.part ? ' class="on"' : ''}>${n}</span>`).join('') : '';
    const page = this.part === 0 ? this.fishPage() : this.recordPage(more[this.part - 1]);
    this.el.innerHTML = `<div class="head"><span class="t">图鉴</span><span class="parts">${parts}</span><span class="n">${page.count}</span></div>
<div class="body"><div class="list">${page.rows}</div><div class="side">${page.side}</div></div>
<div class="foot"><b>滚轮</b>翻<b>A</b>上一页<b>D</b>下一页<b>Tab</b>关</div>`;
  }

  private fishPage(): { count: string; rows: string; side: string } {
    const log = this.log();
    const sel = Math.max(0, Math.min(this.order.length - 1, this.sels[0]));
    const got = this.order.filter((f) => (log.kinds[f.id]?.n ?? 0) > 0).length;
    const first = Math.max(0, Math.min(this.order.length - ROWS, sel - Math.floor(ROWS / 2)));
    let rows = '';
    let lastTier = -1;
    for (let i = first; i < Math.min(this.order.length, first + ROWS); i++) {
      const f = this.order[i];
      const e = log.kinds[f.id];
      const t = TIERS[f.tier];
      if (f.tier !== lastTier) {
        lastTier = f.tier;
        rows += `<div class="tier" style="color:${t.color}">${t.zh}</div>`;
      }
      const has = !!e && e.n > 0;
      rows += `<div class="row${i === sel ? ' sel' : ''}${has ? '' : ' no'}"><span class="nm">${has ? f.zh : '？？？'}</span><span class="v">${has ? `${e.n} 条 · ${cm(e.cm)}` : (SPOTS[f.spot]?.zh ?? '')}</span><span class="md">${has ? MEDAL_ZH[e.medal] : ''}</span></div>`;
    }
    const f = this.order[sel];
    const e = f ? log.kinds[f.id] : undefined;
    const has = !!e && e.n > 0;
    const t = f ? TIERS[f.tier] : TIERS[0];
    const side = !f
      ? ''
      : has
        ? `<div class="nm">${f.zh}</div><div class="ti" style="color:${t.color}">${t.zh}</div>
<div class="ln"><b>钓到过</b>${e!.n} 条</div>
<div class="ln"><b>最长</b>${cm(e!.cm)}</div>
<div class="ln"><b>最重</b>${kg(e!.kg)}</div>
<div class="ln"><b>最好的牌</b>${MEDAL_ZH[e!.medal] || '还没有'}</div>
<div class="ln"><b>在哪</b>${SPOTS[f.spot]?.zh ?? ''}</div>
<div class="note">${f.note}</div>`
        : `<div class="nm">？？？</div><div class="ti" style="color:${t.color}">${t.zh}</div>
<div class="ln"><b>在哪</b>${SPOTS[f.spot]?.zh ?? ''}</div>
<div class="note">还没钓到过。</div>`;
    return { count: `钓到过 <b>${got}</b> / ${this.order.length} 种 · 一共 ${log.stats.catches} 条`, rows, side };
  }

  /** a part of the record: its rows under their headings, the chosen one's lines (a photograph: its picture) beside them */
  private recordPage(s: JournalSection | undefined): { count: string; rows: string; side: string } {
    if (!s) return { count: '', rows: '', side: '' };
    const n = s.rows.length;
    if (!n) return { count: s.count, rows: `<div class="none">${s.id === 'photos' ? '还没拍过照片。拍立得拍一张，拿到手里就记在这儿。' : '还没有。'}</div>`, side: '' };
    const sel = Math.max(0, Math.min(n - 1, this.sels[this.part] ?? 0));
    this.sels[this.part] = sel;
    const first = Math.max(0, Math.min(n - ROWS, sel - Math.floor(ROWS / 2)));
    let rows = '';
    let group = '';
    for (let i = first; i < Math.min(n, first + ROWS); i++) {
      const r = s.rows[i];
      if (r.group && r.group !== group) {
        group = r.group;
        rows += `<div class="tier">${group}</div>`;
      }
      rows += `<div class="row${i === sel ? ' sel' : ''}${r.known ? '' : ' no'}"><span class="nm">${r.name}</span><span class="v">${r.value}</span></div>`;
    }
    const r = s.rows[sel];
    return { count: s.count, rows, side: this.sideOf(r) };
  }

  private sideOf(r: JournalRow): string {
    let img = '';
    if (r.picture) {
      const u = this.pictures.get(r.picture);
      if (u === undefined) {
        // (asked for once; drawn again as it comes)
        const key = r.picture;
        this.pictures.set(key, '');
        void this.ctx.journalBook?.picture(key).then((url) => {
          if (url) {
            this.pictures.set(key, url);
            this.dirty = true;
          } else this.pictures.delete(key);
        });
      } else if (u) img = `<img src="${u}" alt="">`;
    }
    const lines = r.lines.map(([a, b]) => `<div class="ln"><b>${a}</b>${b}</div>`).join('\n');
    return `${img}<div class="nm">${r.name}</div>${r.group ? `<div class="ti">${r.group}</div>` : ''}
${lines}
${r.note ? `<div class="note">${r.note}</div>` : ''}`;
  }

  /** a catch came in, a save was read: the page is drawn again */
  changed(): void {
    this.dirty = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.key, true);
    this.off?.();
    this.off = null;
    this.el.remove();
    this.style.remove();
  }
}
