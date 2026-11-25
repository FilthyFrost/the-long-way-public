/**
 * What is in a vehicle, as a list (docs/MODCAR.md §5.6): Tab with the mark on a vehicle (or standing by
 * one) opens it — every thing riding in it, by where it is (the boot, the bed, a seat), with its picture and
 * weight. The wheel or W / S goes down the list, E or the left button takes the one picked into the hands
 * (from wherever it is: no lid to open, no reaching in), Tab or Esc shuts it. One stands still while it is
 * open. Drawn in the HUD's cartoon frame (ui.ts .mc-frame).
 *
 * The same list shows whatever holds things (listSources.ts: a place's cupboard, what one has on, a basket
 * with things in it, a system's own box): this file only draws what it is handed. A source that things can
 * be put into has one more key in the foot, G, shown only while the thing in the hands would go in.
 */
const CSS = `
.mc-cargo { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); width: 430px; max-height: 470px; display: flex; flex-direction: column; z-index: 4; color: #fff; padding: 14px 16px 12px; box-sizing: border-box; }
.mc-cargo .t { font-size: 13px; color: var(--tx-2); }
.mc-cargo .n { font-size: 21px; font-weight: 800; margin: 1px 0 6px; }
.mc-cargo .ld { font-size: 13px; color: var(--tx-2); margin-bottom: 6px; }
.mc-cargo .ld b { color: #fff; }
.mc-cargo .ls { flex: 1; overflow: hidden; border-top: 1px solid var(--rule); padding-top: 6px; }
.mc-cargo .z { font-size: 12px; color: var(--tx-3); margin: 6px 2px 3px; letter-spacing: 0.05em; }
.mc-cargo .r { display: grid; grid-template-columns: 46px 1fr auto; align-items: center; gap: 10px; padding: 4px 8px 4px 4px; border-radius: 9px; font-size: 15px; }
.mc-cargo .r img, .mc-cargo .r .ph { width: 46px; height: 34px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.06); }
.mc-cargo .r .m { font-size: 12.5px; color: var(--tx-2); }
.mc-cargo .r.on { background: rgba(239,230,211,0.16); box-shadow: inset 0 0 0 2px var(--rim); }
.mc-cargo .r.on .m { color: #fff; }
.mc-cargo .none { padding: 18px 4px; color: var(--tx-2); font-size: 14px; text-align: center; }
.mc-cargo .ks { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--rule); font-size: 13px; color: var(--tx-2); }
.mc-cargo.side-l { left: calc(50% - 222px); }
.mc-cargo.side-r { left: calc(50% + 222px); }
.mc-cargo.off { opacity: 0.6; }
.mc-cargo.off .r.on { background: none; box-shadow: inset 0 0 0 2px rgba(239,230,211,0.25); }
.mc-cargo .ks kbd { display: inline-block; min-width: 18px; padding: 0 5px; margin-right: 4px; border: 2px solid var(--ink); border-radius: 6px; background: #f6f2ea; color: var(--ink); font: 700 12px var(--key-font); text-align: center; }
`;

export interface CargoRow {
  /** the zone's name ("后备箱") */
  zone: string;
  name: string;
  mass: number;
  icon: string | null;
}

/** what the list shows at one moment: the game keeps one of these, fills it in and hands it over every frame the list is open */
export interface CargoView {
  /** the name over the rows, the small line over the name, what it says with no rows, what E does to the row picked */
  title: string;
  head: string;
  empty: string;
  take: string;
  rows: readonly CargoRow[];
  /** goes up whenever `rows` is another list or its rows changed: with the row picked, the weight and the put line, all that is compared from frame to frame */
  rev: number;
  /** the row picked */
  sel: number;
  /** what it all weighs (kg) */
  load: number;
  /** what it holds at most (a box of so many stacks, bearing so much): shown with the count and the weight; null: nothing to show */
  cap: { slots: number; maxKg?: number } | null;
  /** what G would put in ("试验莓 ×5"), shown with its key; '': nothing in the hands would go in */
  put: string;
  /** two lists side by side (the hands beside a vehicle's): the keys that go from one to the other are shown */
  pair?: boolean;
  /** the Tab screen's page D turns to from this list ("菜谱"); '' or absent: none */
  next?: string;
}

export class CargoList {
  readonly el: HTMLDivElement;
  private shown = false;
  // what was drawn last (drawn again only when one of these differs: nothing is put together to find that out)
  private title = '';
  private rev = -1;
  private sel = -1;
  private load = NaN;
  private put = '';
  private place = '';
  private pair = false;
  private next = '';
  open = false;

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-cargo-css')) {
      const st = document.createElement('style');
      st.id = 'mc-cargo-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-cargo mc-frame';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  /**
   * Where it stands: alone in the middle, or one of two side by side (left: the hands, right: a vehicle's), the
   * one not being worked dimmed (docs/V3/nodes/M1-interact.md)
   */
  side(at: 'mid' | 'l' | 'r', active = true): void {
    const place = `${at}${active ? '' : '-off'}`;
    if (place === this.place) return;
    this.place = place;
    this.el.classList.toggle('side-l', at === 'l');
    this.el.classList.toggle('side-r', at === 'r');
    this.el.classList.toggle('off', !active);
  }

  /** show the list as the view has it (null: shut it) */
  show(v: CargoView | null): void {
    this.open = v !== null;
    if (v === null) {
      if (this.shown) {
        this.el.style.display = 'none';
        this.shown = false;
      }
      return;
    }
    if (this.shown && v.rev === this.rev && v.sel === this.sel && v.load === this.load && v.put === this.put && v.title === this.title && (v.pair ?? false) === this.pair && (v.next ?? '') === this.next) return;
    this.pair = v.pair ?? false;
    this.next = v.next ?? '';
    this.shown = true;
    this.title = v.title;
    this.rev = v.rev;
    this.sel = v.sel;
    this.load = v.load;
    this.put = v.put;
    this.el.style.display = '';
    const { rows, sel, load, cap } = v;
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const kg = (m: number): string => m.toFixed(m < 10 ? 1 : 0);
    // (a box: how many of its stacks are taken, how much of what it bears)
    const sum = cap ? `<b>${rows.length} / ${cap.slots}</b> 格 · <b>${kg(load)}${cap.maxKg !== undefined ? ` / ${cap.maxKg}` : ''} kg</b>` : `一共 <b>${rows.length}</b> 件 · <b>${load.toFixed(0)} kg</b>`;
    let html = `<div class="t">${esc(v.head)}</div><div class="n">${esc(v.title)}</div><div class="ld">${sum}</div><div class="ls">`;
    if (!rows.length) html += `<div class="none">${esc(v.empty)}</div>`;
    let zone = '';
    // (the rows round the picked one, as many as fit)
    const from = Math.max(0, Math.min(sel - 4, rows.length - 9));
    rows.forEach((r, i) => {
      if (i < from || i >= from + 9) return;
      if (r.zone !== zone) {
        zone = r.zone;
        html += `<div class="z">${esc(zone)}</div>`;
      }
      html += `<div class="r${i === sel ? ' on' : ''}">${r.icon ? `<img src="${r.icon}" alt="">` : '<div class="ph"></div>'}<div>${esc(r.name)}</div><div class="m">${kg(r.mass)} kg</div></div>`;
    });
    html += `</div><div class="ks"><span><kbd>滚轮</kbd> 选</span><span>左键 ${esc(v.take)}</span>${v.put ? '<span><kbd>Q</kbd> 放进</span>' : ''}${v.pair ? '<span><kbd>A</kbd><kbd>D</kbd> 换边</span>' : ''}${v.next ? `<span><kbd>D</kbd> ${esc(v.next)}</span>` : ''}<span><kbd>Tab</kbd> 关</span></div>`;
    this.el.innerHTML = html;
  }
}
