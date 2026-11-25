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
  /**
   * the before → after card at a part's place (off by default since docs/V3/plan/prompts.md §五 4: the whole card is
   * for what lies on the ground; a new name, so a choice kept from before is not taken for this one)
   */
  compare: boolean;
  /** the checklist and the marker over its next thing */
  guide: boolean;
  /** the brakes give way to steering (ABS), and a side's brakes bring a spin back (the stability control): docs/V3/plan/finish.md §四.1 */
  abs: boolean;
  esc: boolean;
  /** hunger, thirst, the cold and the heat go on (off: one stays fed and warm) */
  needs: boolean;
  /** driving into the dark the headlamps come on by themselves, and go out again in the light (L still switches them) */
  autoLights: boolean;
  /**
   * the vehicle's readings in a corner of the screen as well (speed, gear, revs, fuel, water, lamps, tyres). Off by
   * default: the instruments are in the cab (docs/V3/plan/finish.md §五); from outside the vehicle its speed and its
   * fuel are shown whichever.
   */
  screenDash: boolean;
}

export const ASSIST_LABELS: [keyof Assists, string][] = [
  ['autoRelease', '踩油门自动松手刹'],
  ['autoHold', '停稳后自动踩住刹车（车里有人时）'],
  ['autoReverse', '停稳后按 S 直接倒车'],
  ['abs', '刹车防抱死（刹车时还能打方向）'],
  ['esc', '车身稳定（要打转时自动拉回来）'],
  ['ghosts', '零件幽灵（能装的位置亮起来）'],
  ['compare', '装件时的属性对比（旧值 → 新值）'],
  ['guide', '任务和指引小旗'],
  ['needs', '生存：会饿、会渴、会冷'],
  ['autoLights', '天黑自动开车灯'],
  ['screenDash', '屏幕车况（左下角也显示车速、油、水温、警告灯）'],
];

/** the keys that switch them on the card, in their order (the rest only in the pause menu) */
export const ASSIST_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
export const ASSIST_KEY_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

/** the hardcore default: the handbrake stays on until one releases it; the rest helps */
export const DEFAULT_ASSISTS: Assists = { autoRelease: false, autoHold: true, autoReverse: true, abs: true, esc: true, ghosts: true, compare: false, guide: true, needs: true, autoLights: true, screenDash: false };

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
