/**
 * "这辆车" (docs/V3/plan/finish.md §二 2): a page of the Tab screen — the vehicle one stands by (else the one one had
 * last), and what of it is still missing: every place of its frame the works filled that is empty now, by its name
 * (core/modcar/build.ts missingMounts). Whole, it says so. The first of the pages: from the lists D turns to it, A back.
 *
 * The keys while it is open are its own, as every page of the Tab screen has them: A back to the lists, D on to the
 * next page; the right button, Tab or Esc shut the screen.
 */
import { missingMounts } from '../../core/modcar/build';
import { CAT_LABEL, frameDef } from '../../core/modcar/frames';
import type { Build, Category } from '../../core/modcar/types';
import type { TabPage } from './kernel/context';

const CSS = `
.mc-carpage { position: absolute; z-index: 6; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 620px; max-height: 560px; padding: 16px 22px 12px; display: none; flex-direction: column; pointer-events: none; font-size: 14px; }
.mc-carpage.open { display: flex; }
.mc-carpage h3 { margin: 0; font-size: 21px; font-weight: 700; display: flex; align-items: baseline; gap: 14px; }
.mc-carpage h3 small { font-size: 14px; font-weight: 400; color: var(--tx-2); }
.mc-carpage .sum { margin: 10px 0 8px; font-size: 16px; font-weight: 700; }
.mc-carpage .sum.ok { color: var(--gold); }
.mc-carpage .rows { display: grid; grid-template-columns: 96px 1fr; gap: 6px 14px; align-items: baseline; }
.mc-carpage .rows b { color: var(--tx-2); font-weight: 400; white-space: nowrap; }
.mc-carpage .rows span { line-height: 1.5; }
.mc-carpage .rows i { font-style: normal; margin-left: 10px; padding: 0 8px; border-radius: 999px; background: rgba(255,255,255,0.1); color: var(--tx-2); font-size: 12px; white-space: nowrap; }
.mc-carpage .hint { margin-top: 12px; color: var(--tx-2); line-height: 1.6; font-size: 13px; }
.mc-carpage .foot { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--rule); color: var(--tx-2); font-size: 13px; text-align: center; }
.mc-carpage .foot b { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; margin: 0 3px 0 10px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); font-size: 12px; font-weight: 700; }
`;

export interface CarPageHost {
  /** where the page is drawn */
  readonly root: HTMLElement;
  /** the vehicle the page is of now: the one one stands by, else one's own — and the sorts of part lying about by it, not fitted; null: none */
  car(): { name: string; build: Build; near: ReadonlySet<Category> } | null;
  /** the name of the page after it (its title), or '' */
  nextTitle(): string;
  turnTab(dir: -1 | 1): void;
  closeTab(): void;
}

/** what a vehicle goes without and is none the worse a vehicle for: found down the road, never the works' to miss */
const EXTRAS: ReadonlySet<Category> = new Set<Category>(['radio']);

/**
 * What a vehicle lacks, as the page says it: how many, each sort's places in a line (`near`: one of that sort lies by
 * the vehicle, not fitted), how many of them are nowhere near — and what it could have besides (a radio)
 */
export function carLines(build: Build, near: ReadonlySet<Category> = new Set()): { missing: number; away: number; rows: { label: string; text: string; near: boolean }[]; extras: string[] } {
  const miss = missingMounts(build);
  const by = new Map<Category, string[]>();
  const extras: string[] = [];
  let missing = 0;
  let away = 0;
  for (const m of miss) {
    if (EXTRAS.has(m.cat)) {
      extras.push(m.label.zh);
      continue;
    }
    missing++;
    if (!near.has(m.cat)) away++;
    const list = by.get(m.cat) ?? [];
    list.push(m.label.zh);
    by.set(m.cat, list);
  }
  const rows: { label: string; text: string; near: boolean }[] = [];
  for (const [cat, list] of by) {
    // (a sort with one place of it: its name says it all — "引擎盖"; with several, which of them)
    const one = frameDef(build.frame).mounts.filter((m) => m.cat === cat).length === 1;
    rows.push({ label: CAT_LABEL[cat].zh, text: one ? '没装' : list.join('、'), near: near.has(cat) });
  }
  return { missing, away, rows, extras };
}

export class CarPage {
  private readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private open = false;
  private drawn = '';
  /** the page, as the Tab screen has it */
  readonly page: TabPage;

  constructor(private readonly host: CarPageHost) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'mc-frame mc-carpage';
    host.root.appendChild(this.el);
    window.addEventListener('keydown', this.key, true);
    this.page = { id: 'car', title: '这辆车', show: (open) => this.show(open) };
  }

  private readonly key = (e: KeyboardEvent): void => {
    if (!this.open) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    // the page has the keys while it is open
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'Tab') this.host.closeTab();
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.host.turnTab(-1);
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.host.turnTab(1);
  };

  private show(open: boolean): void {
    this.open = open;
    this.el.classList.toggle('open', open);
    this.drawn = '';
    if (open) this.update();
  }

  /** drawn again when what it says has changed (each frame while it is open) */
  update(): void {
    if (!this.open) return;
    const car = this.host.car();
    const next = this.host.nextTitle();
    const foot = `<div class="foot"><b>A</b>回清单${next ? `<b>D</b>${next}` : ''}<b>Tab</b>关上</div>`;
    let html: string;
    if (!car) html = `<h3>这辆车</h3><div class="sum">身边没有车</div>${foot}`;
    else {
      const { missing, away, rows, extras } = carLines(car.build, car.near);
      const more = extras.length ? `<div class="hint">还可以加：${extras.join('、')}</div>` : '';
      // (where to look for what is not lying by it; how a part goes on)
      const where = away ? '不在旁边的零件要到路上找：修车铺、加油站，还有路边的废车旁边。' : '';
      const body = missing
        ? `<div class="sum">还缺 ${missing} 件</div><div class="rows">${rows.map((r) => `<b>${r.label}</b><span>${r.text}${r.near ? '<i>旁边有</i>' : ''}</span>`).join('')}</div><div class="hint">${where}零件拿在手里走到车边，对着亮起来的位置按住左键装上。</div>`
        : `<div class="sum ok">装齐了，一件不缺</div>`;
      html = `<h3>这辆车<small>${car.name}</small></h3>${body}${more}${foot}`;
    }
    if (html === this.drawn) return;
    this.drawn = html;
    this.el.innerHTML = html;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.key, true);
    this.el.remove();
    this.style.remove();
  }
}
