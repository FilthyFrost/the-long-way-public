/**
 * Day clock. Real time maps to the hour of day unevenly on purpose: dawn, the golden hour and
 * the blue hour pass slowly, plain night passes quickly — the best light stays on screen longest.
 */
import { clamp, smoothstep } from '../math/util';

const DEG = Math.PI / 180;

/** [fraction of the day cycle, hour] — hours run 5.5 → 29.5 (= 5.5 next morning) */
const KEYS: readonly [number, number][] = [
  [0.0, 5.5], // first light
  [0.125, 7.5], // end of the golden morning   (5 min of a 40 min day)
  [0.475, 17.6], // working day               (14 min)
  [0.65, 19.25], // golden evening and sunset  (7 min for under two hours of clock)
  [0.735, 20.0], // blue hour                  (3.4 min)
  [1.0, 29.5], // night                        (11 min)
];

export const SUNRISE = 6.0;
export const SUNSET = 19.0;

export class SkyState {
  /** hour of day, 0–24 */
  hour = 12;
  /** unit vector towards the sun / the moon */
  sunX = 0;
  sunY = 1;
  sunZ = 0;
  moonX = 0;
  moonY = -1;
  moonZ = 0;
  /** sun elevation (rad) */
  sunElev = 1;
  /** 0 night … 1 full day */
  daylight = 1;
  /** 1 deep night … 0 once the sky has brightened */
  night = 0;
  /** true while the sun is past its highest point */
  afternoon = false;
}

export class DayClock {
  /** real seconds for one full day */
  dayLength = 2400;
  /** highest sun elevation (deg) */
  maxElevation = 58;
  private offset: number;

  constructor(startHour = 8.5) {
    this.offset = DayClock.phaseOfHour(startHour);
  }

  /** fraction of the cycle at which the clock shows `hour` */
  static phaseOfHour(hour: number): number {
    let h = ((hour % 24) + 24) % 24;
    if (h < 5.5) h += 24;
    for (let i = 1; i < KEYS.length; i++) {
      if (h <= KEYS[i][1]) {
        const [p0, h0] = KEYS[i - 1];
        const [p1, h1] = KEYS[i];
        return p0 + ((h - h0) / (h1 - h0)) * (p1 - p0);
      }
    }
    return 0;
  }

  static hourOfPhase(phase: number): number {
    const p = phase - Math.floor(phase);
    for (let i = 1; i < KEYS.length; i++) {
      if (p <= KEYS[i][0]) {
        const [p0, h0] = KEYS[i - 1];
        const [p1, h1] = KEYS[i];
        const h = h0 + ((p - p0) / (p1 - p0)) * (h1 - h0);
        return h >= 24 ? h - 24 : h;
      }
    }
    return 5.5;
  }

  /** jump so that time `t` shows `hour` */
  setHour(hour: number, t = 0): void {
    this.offset = DayClock.phaseOfHour(hour) - t / this.dayLength;
  }

  /** move the clock on by this many seconds of the day's cycle (negative: back) without the time passing */
  advance(seconds: number): void {
    this.offset += seconds / this.dayLength;
  }

  /** a day of another length (real seconds), the hour at time `t` kept */
  setDayLength(seconds: number, t: number): void {
    const h = this.hourAt(t);
    this.dayLength = Math.max(10, seconds);
    this.setHour(h, t);
  }

  hourAt(t: number): number {
    return DayClock.hourOfPhase(t / this.dayLength + this.offset);
  }

  /** day number (0-based) at time t; days change at 5:30 */
  dayAt(t: number): number {
    return Math.floor(t / this.dayLength + this.offset);
  }

  state(t: number, out: SkyState): void {
    DayClock.skyAtHour(this.hourAt(t), this.maxElevation, out);
  }

  static skyAtHour(hour: number, maxElevation: number, out: SkyState): void {
    out.hour = hour;
    const th = (Math.PI * (hour - SUNRISE)) / (SUNSET - SUNRISE);
    const me = maxElevation * DEG;
    // the sun travels a tilted circle: east (+x) at sunrise, high towards +z at noon, west at sunset
    const c = Math.cos(th);
    const s = Math.sin(th);
    out.sunX = c;
    out.sunY = s * Math.sin(me);
    out.sunZ = s * Math.cos(me);
    out.sunElev = Math.asin(clamp(out.sunY, -1, 1));
    // the moon rides roughly opposite, on a lower arc
    const tm = th + Math.PI * 0.94;
    const mm = 44 * DEG;
    out.moonX = Math.cos(tm) * 0.92;
    out.moonY = Math.sin(tm) * Math.sin(mm);
    out.moonZ = -Math.sin(tm) * Math.cos(mm) * 0.9 + 0.25;
    const ml = Math.hypot(out.moonX, out.moonY, out.moonZ);
    out.moonX /= ml;
    out.moonY /= ml;
    out.moonZ /= ml;
    out.daylight = smoothstep(-6 * DEG, 9 * DEG, out.sunElev);
    out.night = 1 - smoothstep(-13 * DEG, -3 * DEG, out.sunElev);
    out.afternoon = hour > (SUNRISE + SUNSET) / 2 && hour < SUNSET + 3;
  }
}
