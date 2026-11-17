/**
 * The scrub's own words on the screen (docs/MODCAR.md §15): while a cleaning tool goes over a part, a ring at
 * the tool showing how clean that piece is (its unit: the left side, the windscreen, a door) with its name and
 * the share done; a part come clean makes the ring flash and say so.
 */
const CSS = `
.mc-scrub { position: absolute; transform: translate(26px, -50%); display: flex; align-items: center; gap: 8px; pointer-events: none; z-index: 4; white-space: nowrap; }
.mc-scrub svg { width: 40px; height: 40px; filter: drop-shadow(0 2px 0 rgba(23,18,15,0.7)); }
.mc-scrub .bg { fill: rgba(23,18,15,0.55); stroke: #f2efe8; stroke-width: 3; }
.mc-scrub .arc { fill: none; stroke: #8fe3a2; stroke-width: 5; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 20px 20px; transition: stroke-dashoffset 0.25s ease-out; }
.mc-scrub .pc { font: 800 12px var(--key-font, sans-serif); fill: #fff; text-anchor: middle; dominant-baseline: central; }
.mc-scrub .nm { font: 700 15px var(--key-font, sans-serif); color: #fff; text-shadow: 0 2px 0 rgba(23,18,15,0.85), 0 0 8px rgba(0,0,0,0.4); }
.mc-scrub.done .arc { stroke: #f3c35a; }
.mc-scrub.pop svg { animation: mc-scrub-pop 0.45s ease-out; }
@keyframes mc-scrub-pop { 0% { transform: scale(1.5); } 100% { transform: scale(1); } }
.mc-scrub-cursor { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.5); pointer-events: none; z-index: 4; }
`;

export class ScrubHud {
  private readonly el: HTMLDivElement;
  private readonly cursor: HTMLDivElement;
  private readonly arc: SVGCircleElement;
  private readonly pc: SVGTextElement;
  private readonly nm: HTMLSpanElement;
  private shownKey = '';

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-scrub-css')) {
      const st = document.createElement('style');
      st.id = 'mc-scrub-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-scrub';
    this.el.innerHTML = `<svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="17"/><circle class="arc" cx="20" cy="20" r="14" stroke-dasharray="88" stroke-dashoffset="88"/><text class="pc" x="20" y="20">0</text></svg><span class="nm"></span>`;
    this.arc = this.el.querySelector('.arc') as SVGCircleElement;
    this.pc = this.el.querySelector('.pc') as SVGTextElement;
    this.nm = this.el.querySelector('.nm') as HTMLSpanElement;
    this.el.style.display = 'none';
    root.appendChild(this.el);
    this.cursor = document.createElement('div');
    this.cursor.className = 'mc-scrub-cursor';
    this.cursor.style.display = 'none';
    root.appendChild(this.cursor);
  }

  /**
   * Where the tool is on the screen (HUD px), what it is on and how clean that is (0…1); null hides it.
   * cursor: the mouse's own point (while scrubbing).
   */
  show(at: { x: number; y: number } | null, what: { key: string; name: string; clean: number; done: boolean } | null, cursor: { x: number; y: number } | null): void {
    if (cursor) {
      this.cursor.style.display = '';
      this.cursor.style.left = `${cursor.x.toFixed(0)}px`;
      this.cursor.style.top = `${cursor.y.toFixed(0)}px`;
    } else this.cursor.style.display = 'none';
    if (!at || !what) {
      this.el.style.display = 'none';
      this.shownKey = '';
      return;
    }
    this.el.style.display = '';
    this.el.style.left = `${at.x.toFixed(0)}px`;
    this.el.style.top = `${at.y.toFixed(0)}px`;
    const k = Math.max(0, Math.min(1, what.clean));
    this.arc.setAttribute('stroke-dashoffset', (88 * (1 - k)).toFixed(1));
    this.pc.textContent = `${Math.round(k * 100)}`;
    this.nm.textContent = what.name;
    const was = this.el.classList.contains('done');
    this.el.classList.toggle('done', what.done);
    if (what.done && !was && this.shownKey === what.key) {
      this.el.classList.remove('pop');
      void this.el.offsetWidth;
      this.el.classList.add('pop');
    }
    this.shownKey = what.key;
  }
}
