/**
 * What is in a vehicle, as a list (docs/MODCAR.md §5.6): Tab with the mark on a vehicle (or standing by
 * one) opens it — every thing riding in it, by where it is (the boot, the bed, a seat), with its picture and
 * weight. The wheel or W / S goes down the list, E or the left button takes the one picked into the hands
 * (from wherever it is: no lid to open, no reaching in), Tab or Esc shuts it. One stands still while it is
 * open. Drawn in the HUD's cartoon frame (ui.ts .mc-frame).
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
.mc-cargo .ks kbd { display: inline-block; min-width: 18px; padding: 0 5px; margin-right: 4px; border: 2px solid var(--ink); border-radius: 6px; background: #f6f2ea; color: var(--ink); font: 700 12px var(--key-font); text-align: center; }
`;

export interface CargoRow {
  /** the zone's name ("后备箱") */
  zone: string;
  name: string;
  mass: number;
  icon: string | null;
}

export class CargoList {
  readonly el: HTMLDivElement;
  private shown = '';
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

  /** show the list (null: shut it); sel = the row picked */
  show(title: string | null, rows: readonly CargoRow[], sel: number, load: number, head = '车里的东西', empty = '车里什么也没有。拿着东西看着车按 E 放进去，或者长按 G 收进车里。', take = '拿出来'): void {
    this.open = title !== null;
    if (title === null) {
      if (this.shown) {
        this.el.style.display = 'none';
        this.shown = '';
      }
      return;
    }
    const key = `${title}|${sel}|${load.toFixed(0)}|${rows.map((r) => `${r.zone}:${r.name}:${r.icon ? 1 : 0}`).join(',')}`;
    if (key === this.shown) return;
    this.shown = key;
    this.el.style.display = '';
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = `<div class="t">${esc(head)}</div><div class="n">${esc(title)}</div><div class="ld">一共 <b>${rows.length}</b> 件 · <b>${load.toFixed(0)} kg</b></div><div class="ls">`;
    if (!rows.length) html += `<div class="none">${esc(empty)}</div>`;
    let zone = '';
    // (the rows round the picked one, as many as fit)
    const from = Math.max(0, Math.min(sel - 4, rows.length - 9));
    rows.forEach((r, i) => {
      if (i < from || i >= from + 9) return;
      if (r.zone !== zone) {
        zone = r.zone;
        html += `<div class="z">${esc(zone)}</div>`;
      }
      html += `<div class="r${i === sel ? ' on' : ''}">${r.icon ? `<img src="${r.icon}" alt="">` : '<div class="ph"></div>'}<div>${esc(r.name)}</div><div class="m">${r.mass.toFixed(r.mass < 10 ? 1 : 0)} kg</div></div>`;
    });
    html += `</div><div class="ks"><span><kbd>滚轮</kbd>/ <kbd>W</kbd><kbd>S</kbd> 选</span><span><kbd>E</kbd>/ 左键 ${esc(take)}</span><span><kbd>Tab</kbd> 关上</span></div>`;
    this.el.innerHTML = html;
  }
}
