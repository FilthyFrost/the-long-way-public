/**
 * Assists (agreed: hardcore by default, a few switches that make it easier without changing the
 * rules): F2 shows them, the number keys switch them, they are kept in localStorage.
 */
export interface Assists {
  /** pressing the throttle releases a pulled handbrake */
  autoRelease: boolean;
  /** with a driver in, the brakes hold the car once it has stopped */
  autoHold: boolean;
  /** stopped, S drives backwards (else: the gear lever to R) */
  autoReverse: boolean;
  /** the holograms where a part in the hands can go */
  ghosts: boolean;
  /** the stat card beside a ghost */
  card: boolean;
  /** the checklist and the marker over its next thing */
  guide: boolean;
  /** hunger, thirst, the cold and the bladder go on (off: one stays fed and warm) */
  needs: boolean;
}

export const ASSIST_LABELS: [keyof Assists, string][] = [
  ['autoRelease', '踩油门自动松手刹'],
  ['autoHold', '停稳后自动踩住刹车（车里有人时）'],
  ['autoReverse', '停稳后按 S 直接倒车'],
  ['ghosts', '零件幽灵（能装的位置亮起来）'],
  ['card', '属性卡（旧值 → 新值）'],
  ['guide', '任务和指引小旗'],
  ['needs', '生存：会饿、会渴、会冷'],
];

/** the hardcore default: the handbrake stays on until one releases it; the rest helps */
export const DEFAULT_ASSISTS: Assists = { autoRelease: false, autoHold: true, autoReverse: true, ghosts: true, card: true, guide: true, needs: true };

const KEY = 'modcar.assists';

export function loadAssists(): Assists {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULT_ASSISTS, ...(JSON.parse(raw) as Partial<Assists>) };
  } catch {
    // (a broken entry: start from the defaults)
  }
  return { ...DEFAULT_ASSISTS };
}

export function saveAssists(a: Assists): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // (no storage: they last until the page closes)
  }
}
