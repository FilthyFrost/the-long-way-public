/**
 * The player's settings (the main menu's 设置, docs/V3/plan/growth.md 定案 7): the volume, how fast the view turns
 * with the mouse and the picture's quality, kept in the browser beside the assists (assists.ts) — not in a save:
 * they are the player's, whatever game is going on. The quality is the address's ?quality= when it has one.
 */
import type { Quality } from '../render/core';

export interface Settings {
  /** the whole mix, 0…1 */
  volume: number;
  /** the mouse's turn, times the default (0.4…2.5) */
  look: number;
  /** the picture: low, med or high (a change takes the page being loaded again) */
  quality: Quality;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, look: 1, quality: 'high' };

const KEY = 'modcar.settings';

export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
      return {
        volume: Math.min(1, Math.max(0, Number(s.volume) || 0)),
        look: Math.min(2.5, Math.max(0.4, Number(s.look) || 1)),
        quality: s.quality === 'low' || s.quality === 'med' ? s.quality : 'high',
      };
    }
  } catch {
    // (a broken entry: the defaults)
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: for this visit only */
  }
}
