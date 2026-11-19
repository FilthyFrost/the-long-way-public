/**
 * The buffs on screen (node C1): small tiles beside the body's tiles at the top left (vitalsHud.ts), in the
 * HUD's cartoon frame (.mc-frame), each with a drawn sign of its buff and the time it has left; never more
 * than three (two meals and a drink is the most there can be). Its name and its line are the tile's tooltip
 * (seen when the mouse is free: at the cooking panel), and on the dish's card. Redrawn only when what it shows
 * has changed: a tile's time in whole seconds, which buffs there are.
 */
import { BUFFS, type Buffs } from '../../../../core/v3/cooking/buffs';
import type { BuffId } from '../../../../core/v3/cooking/types';

const CSS = `
.mc-buffs { position: absolute; left: 296px; top: 22px; display: flex; gap: 7px; z-index: 2; pointer-events: none; color: #fff; }
.mc-buffs .bf { width: 46px; height: 48px; padding: 0 !important; border-radius: 12px !important; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; pointer-events: auto; position: relative; overflow: hidden; }
.mc-buffs .bf svg { width: 22px; height: 22px; margin-top: 5px; }
.mc-buffs .bf b { font: 700 11px var(--key-font); margin-top: 1px; text-shadow: var(--say-shadow); }
.mc-buffs .bf i { position: absolute; left: 0; bottom: 0; height: 3px; background: currentColor; opacity: 0.85; }
.mc-buffs .bf.low b { color: #ffcf8a; }
`;

/** a sign for each buff, drawn in the HUD's line style (24 × 24), and its colour */
const SIGN: Readonly<Record<BuffId, [string, string]>> = {
  warm: ['<path d="M12 3c2.5 3.5 5 5.8 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2.2-4.6.2 1.8 1 2.8 2 3.1C11 8.5 11.3 5.8 12 3z"/>', '#ffa35c'],
  cool: ['<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>', '#8fd8ff'],
  vigor: ['<path d="M13 2 5 13.5h6L10 22l8.5-12H12.5z"/>', '#ffe066'],
  hearty: ['<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-2 1.6-2 1.6-4M12.5 7c0-2 1.6-2 1.6-4"/>', '#f0b43a'],
  hydrated: ['<path d="M12 3c3.5 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.4 6-11z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.4"/>', '#4f9cf2'],
  sturdy: ['<path d="M4 9h16l-1.5 11h-13z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>', '#d9b38c'],
  keen: ['<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', '#a9ef9a'],
  steady: ['<path d="M7 20v-6.5a2 2 0 0 1 4 0V12m0 0V5.5a1.6 1.6 0 0 1 3.2 0V12m0-5a1.6 1.6 0 0 1 3.2 0v8a5 5 0 0 1-5 5H11a4 4 0 0 1-4-4"/>', '#c9b6ff'],
  quiet: ['<path d="M8 3.5c2 0 3 2.5 3 5.5s-1.2 5-3 5-3-2-3-5 1-5.5 3-5.5zM16 9.5c1.6 0 2.6 2 2.6 4.5S17.5 18 16 18s-2.6-1.6-2.6-4 1-4.5 2.6-4.5z"/><path d="M6.5 17.5h3M14.5 21h3"/>', '#b9c8d4'],
  lucky: ['<path d="M12 12c-1.5-3.5-5.5-4-6.3-1.6C5 12.6 8 14 12 12zm0 0c3.5-1.5 4-5.5 1.6-6.3C11.4 5 10 8 12 12zm0 0c1.5 3.5 5.5 4 6.3 1.6.7-2.2-2.3-3.6-6.3-1.6zm0 0c-3.5 1.5-4 5.5-1.6 6.3C12.6 19 14 16 12 12z"/><path d="M12 12l3.5 8.5"/>', '#7fe0a0'],
};

/** the most tiles shown */
const MOST = 3;

function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  const m = Math.floor(t / 60);
  const ss = t % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}

export class BuffHud {
  private readonly el: HTMLDivElement;
  private readonly tiles: { root: HTMLDivElement; time: HTMLElement; bar: HTMLElement; id: BuffId | null; shown: number; full: number }[] = [];
  private t = 0;

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-buffs-css')) {
      const st = document.createElement('style');
      st.id = 'mc-buffs-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-buffs';
    root.appendChild(this.el);
    for (let i = 0; i < MOST; i++) {
      const tile = document.createElement('div');
      tile.className = 'bf mc-frame';
      tile.style.display = 'none';
      tile.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"></svg><b></b><i></i>';
      this.el.appendChild(tile);
      this.tiles.push({ root: tile, time: tile.querySelector('b')!, bar: tile.querySelector('i')!, id: null, shown: -1, full: 1 });
    }
  }

  /** a few times a second: the tiles as the buffs stand (nothing is written while nothing changed) */
  update(dt: number, b: Buffs): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    for (let i = 0; i < MOST; i++) {
      const tile = this.tiles[i];
      const id = i < b.count ? b.at(i) : null;
      if (id !== tile.id) {
        tile.id = id;
        tile.shown = -1;
        if (!id) {
          tile.root.style.display = 'none';
          continue;
        }
        const [path, colour] = SIGN[id];
        const svg = tile.root.querySelector('svg')!;
        svg.innerHTML = path;
        svg.setAttribute('stroke', colour);
        tile.root.style.color = colour;
        tile.root.title = `${BUFFS[id].name.zh} · ${BUFFS[id].blurb.zh}`;
        tile.root.style.display = '';
        tile.full = Math.max(60, b.left(id));
      }
      if (!id) continue;
      const left = b.left(id);
      if (left > tile.full) tile.full = left;
      const sec = Math.ceil(left);
      if (sec === tile.shown) continue;
      tile.shown = sec;
      tile.time.textContent = clock(left);
      tile.bar.style.width = `${Math.round((100 * left) / tile.full)}%`;
      tile.root.classList.toggle('low', left < 30);
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
