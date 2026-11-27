/**
 * The body on screen, as the HUD looked on 2026-11-24 — the look the player chose to keep (docs/V3/plan/finish.md
 * §十八, "界面恢复") — in the HUD's cartoon frame, top left: a round dial with the body's temperature in its middle
 * and a small mark round its top for the air's; life (green) round its left half, where health is the half's length:
 * what is lost of health is the end of that half, grey and dashed, with a small mark for what took it (a stomach, a
 * snowflake, a sun) blinking while it is being taken; stamina (blue) round its right half. Beside it three tiles — food,
 * water, energy — each with a bar along its foot, red when low; under them the states, each with its icon. Over the
 * whole view: the edges darken as stamina runs out, flash red when hurt, frost over when one is cold, glow when one is
 * hot, and dim for a moment now and then when one is sleepy.
 */
import { EFFECT_ZH, feels, has, healthOf, sleepy, type HealthLoss, type Vitals } from '../../core/modcar/vitals';
import { MATERIAL_IDS, MATERIALS, type Material } from '../../core/modcar/items';
import { materialIcon } from './craftUi';

const CSS = `
.mc-vit { position: absolute; left: 22px; top: 20px; display: flex; align-items: flex-start; gap: 10px; z-index: 2; pointer-events: none; color: #fff; }
.mc-vit .dial { position: relative; width: 96px; height: 96px; border-radius: 50% !important; padding: 0; box-sizing: border-box; }
.mc-vit .dial svg.ring { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); overflow: visible; }
.mc-vit .dial .t { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.mc-vit .dial .t b { font: 800 25px var(--key-font); letter-spacing: -0.02em; text-shadow: var(--say-shadow); }
.mc-vit .dial .t i { font-style: normal; font-size: 11px; color: var(--tx-2); margin-top: 3px; }
.mc-vit .dial .t i.cold { color: #8fd0ff; }
.mc-vit .dial .t i.hot { color: #ffc98a; }
.mc-vit .dial .why { position: absolute; width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; color: #f2efe8; display: none; filter: drop-shadow(0 0 1.5px rgba(23,18,15,0.95)); }
.mc-vit .dial .why svg { display: block; width: 15px; height: 15px; }
.mc-vit .sap { animation: mc-vit-sap 0.7s steps(2, jump-none) infinite; }
@keyframes mc-vit-sap { from { opacity: 1; } to { opacity: 0.25; } }
.mc-vit .side { display: flex; flex-direction: column; gap: 7px; padding-top: 2px; }
.mc-vit .tiles { display: flex; gap: 7px; }
.mc-vit .tile { width: 50px; height: 48px; padding: 0 !important; display: flex; align-items: flex-start; justify-content: center; position: relative; overflow: hidden; border-radius: 12px !important; }
.mc-vit .tile svg { width: 24px; height: 24px; margin-top: 6px; }
.mc-vit .tile .b { position: absolute; left: 7px; right: 7px; bottom: 6px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.14); overflow: hidden; }
.mc-vit .tile .b i { display: block; height: 100%; border-radius: 3px; transition: width 0.3s; }
.mc-vit .tile[data-k="food"] .b i { background: #f0b43a; }
.mc-vit .tile[data-k="water"] .b i { background: #4f9cf2; }
.mc-vit .tile[data-k="energy"] .b i { background: #b48cf2; }
.mc-vit .tile.low .b i { background: #ff6b5a !important; }
.mc-vit .tile.low svg { stroke: #ff8f80; }
.mc-vit .fx { display: flex; flex-wrap: wrap; gap: 5px; max-width: 190px; }
.mc-vit .fx span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; border-radius: 9px; font-size: 12px; font-weight: 700; background: rgba(23,18,15,0.78); box-shadow: 0 0 0 1.5px rgba(239,230,211,0.55); white-space: nowrap; }
.mc-vit .fx span svg { width: 14px; height: 14px; flex: none; }
.mc-vit .fx span.sleep { color: #d4bfff; }
.mc-vit .fx span.bad { color: #ffb0a6; }
.mc-vit .fx span.good { color: #a9ef9a; }
.mc-vit .fx span.cold { color: #a8dcff; }
.mc-vit .fx span.hot { color: #ffc98a; }
.mc-fx { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.mc-fx .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(12,8,6,0.85) 100%); opacity: 0; transition: opacity 0.4s; }
.mc-fx .hurt { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(160,10,0,0) 45%, rgba(170,20,10,0.65) 100%); opacity: 0; }
.mc-fx .frost { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(220,240,255,0) 50%, rgba(214,236,255,0.75) 100%); opacity: 0; transition: opacity 1s; }
.mc-fx .glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(255,190,90,0) 48%, rgba(255,150,60,0.5) 100%); opacity: 0; transition: opacity 1s; }
.mc-fx .doze { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(10,8,14,0.35) 20%, rgba(6,4,10,0.96) 100%); opacity: 0; }
`;

const ICON = {
  energy: '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 14.6A7.5 7.5 0 0 1 15.5 3.5z" /><path d="M17.5 8.5h3l-3 3.5h3" />',
  food: '<path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 7c0-2 1.6-2 1.6-4M12.5 7c0-2 1.6-2 1.6-4" />',
  water: '<path d="M12 3c3.5 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.4 6-11z" />',
};

/** the small icons (drawn in the line of the tiles' own): the states', and what took health */
const SICK = '<path d="M8 4c-2 3 2 4 0 7s-4 6 1 8M15 4c-2 3 2 4 0 7s-4 6 1 8" />';
const SNOW = '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />';
const SUN = '<circle cx="12" cy="12" r="4" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />';
const FX_ICON: Record<string, string> = {
  sick: SICK,
  cold: SNOW,
  hot: SUN,
  hurt: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-38 12 12)" /><path d="M10.6 10.6l2.8 2.8" />',
  wet: '<path d="M12 4c3 4 5 6.6 5 9.4a5 5 0 0 1-10 0C7 10.6 9 8 12 4z" />',
  meal: '<path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 7c0-2 1.6-2 1.6-4M12.5 7c0-2 1.6-2 1.6-4" />',
  drunk: '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v6M8.5 20.5h7" />',
  sleepy: '<path d="M4 7h6l-6 7h6M13 12h6l-6 7h6" />',
};
const WHY_ICON: Record<HealthLoss, string> = { sick: SICK, cold: SNOW, heat: SUN, poison: SICK };
const svg = (p: string, w = 2.2): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${p}</svg>`;

/** an arc of a circle (svg path), angles in degrees from the top, clockwise */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number): string => {
    const t = ((a - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
  };
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${p(a1)}`;
}

/** life's half of the ring: from the bottom (190°) up the left to the top (350°); health is how far of it there is */
const LIFE_A0 = 190;
const LIFE_SPAN = 160;

type Need = 'food' | 'water' | 'energy';

export class VitalsHud {
  private readonly el: HTMLDivElement;
  private readonly fx: HTMLDivElement;
  private readonly dial: HTMLElement;
  private readonly hp: SVGPathElement;
  private readonly lost: SVGPathElement;
  private readonly st: SVGPathElement;
  private readonly needle: SVGGElement;
  private readonly why: HTMLElement;
  private readonly temp: HTMLElement;
  private readonly unit: HTMLElement;
  private readonly tiles: Record<Need, HTMLElement>;
  private readonly fxList: HTMLDivElement;
  private readonly vig: HTMLDivElement;
  private readonly hurtEl: HTMLDivElement;
  private readonly frost: HTMLDivElement;
  private readonly glow: HTMLDivElement;
  private readonly doze: HTMLDivElement;
  /** sleepy: till the next moment the view dims, and how far into one it is */
  private dozeIn = 12;
  private dozeT = -1;
  private hurtT = 0;
  /** health was taken: the grey end blinks this long (s) */
  private sapT = 0;
  private lastFx = '';
  private lastWhy = '';

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-vit-css')) {
      const st = document.createElement('style');
      st.id = 'mc-vit-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.fx = document.createElement('div');
    this.fx.className = 'mc-fx';
    this.fx.innerHTML = '<div class="vig"></div><div class="hurt"></div><div class="frost"></div><div class="glow"></div><div class="doze"></div>';
    root.appendChild(this.fx);
    this.vig = this.fx.querySelector('.vig')!;
    this.hurtEl = this.fx.querySelector('.hurt')!;
    this.frost = this.fx.querySelector('.frost')!;
    this.glow = this.fx.querySelector('.glow')!;
    this.doze = this.fx.querySelector('.doze')!;
    this.el = document.createElement('div');
    this.el.className = 'mc-vit';
    const tile = (k: Need, title: string): string =>
      `<div class="tile mc-frame" data-k="${k}" title="${title}"><div class="b"><i></i></div><svg viewBox="0 0 24 24" fill="none" stroke="#f2efe8" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${ICON[k]}</svg></div>`;
    // the ring: 114 across (the dial's 96 and 9 round it); life from the bottom up the left, stamina up the right
    this.el.innerHTML = `
      <div class="dial mc-frame" title="生命和健康、体力、体温">
        <svg class="ring" viewBox="0 0 114 114">
          <path d="${arc(57, 57, 52, 190, 350)}" stroke="rgba(0,0,0,0.55)" stroke-width="7" fill="none" stroke-linecap="round" />
          <path d="${arc(57, 57, 52, 170, 10)}" stroke="rgba(0,0,0,0.55)" stroke-width="7" fill="none" stroke-linecap="round" />
          <path class="lost" stroke="rgba(239,230,211,0.5)" stroke-width="5" stroke-dasharray="3 2.5" fill="none" />
          <path class="hp" stroke="#55cf6a" stroke-width="5" fill="none" stroke-linecap="round" />
          <path class="st" stroke="#4f9cf2" stroke-width="5" fill="none" stroke-linecap="round" />
          <g class="nd"><path d="M57 2 l-4.5 -7 h9 z" fill="#f2efe8" stroke="#17120f" stroke-width="1.5" /></g>
        </svg>
        <div class="t"><b>37.5</b><i>°C</i></div>
        <span class="why"></span>
      </div>
      <div class="side">
        <div class="tiles">${tile('food', '饱食')}${tile('water', '口渴')}${tile('energy', '精力')}</div>
        <div class="fx"></div>
      </div>`;
    root.appendChild(this.el);
    this.dial = this.el.querySelector('.dial')!;
    this.hp = this.el.querySelector('path.hp')!;
    this.lost = this.el.querySelector('path.lost')!;
    this.st = this.el.querySelector('path.st')!;
    this.needle = this.el.querySelector('g.nd')!;
    this.why = this.el.querySelector('.why')!;
    this.temp = this.el.querySelector('.t b')!;
    this.unit = this.el.querySelector('.t i')!;
    const q = (k: string): HTMLElement => this.el.querySelector(`[data-k="${k}"]`)!;
    this.tiles = { food: q('food'), water: q('water'), energy: q('energy') };
    this.fxList = this.el.querySelector('.fx')!;
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
    this.fx.style.display = on ? '' : 'none';
  }

  /** a blow: the view's edges flash red */
  hurt(): void {
    this.hurtT = 0.45;
  }

  /** health was taken: the ring's grey end blinks */
  sap(): void {
    this.sapT = 1.6;
  }

  /** draw the body as it is; ambientC = the air round one; buffs: what a good meal left (their names) */
  update(v: Vitals, ambientC: number, dt: number, buffs: readonly string[] = []): void {
    // life up the left from the bottom: lit as far as there is life, grey and dashed from where health ends
    const cap = Math.max(0, Math.min(100, healthOf(v)));
    const hp = Math.max(0, Math.min(cap, v.hp));
    const st = Math.max(0, Math.min(1, v.stamina / 100));
    const capA = LIFE_A0 + (LIFE_SPAN * cap) / 100;
    this.hp.setAttribute('d', hp > 0.5 ? arc(57, 57, 52, LIFE_A0, LIFE_A0 + (LIFE_SPAN * hp) / 100) : '');
    this.lost.setAttribute('d', cap < 99.5 ? arc(57, 57, 52, capA, LIFE_A0 + LIFE_SPAN) : '');
    this.st.setAttribute('d', st > 0.005 ? arc(57, 57, 52, 170, 170 - 160 * st) : '');
    this.hp.setAttribute('stroke', hp < 20 ? '#ff6b5a' : '#55cf6a');
    // (what the scripts read: life and health, in hundredths)
    this.dial.dataset.hp = hp.toFixed(1);
    this.dial.dataset.cap = cap.toFixed(1);
    const ill = has(v, 'sick1') || has(v, 'sick2');
    this.sapT = Math.max(0, this.sapT - dt);
    const taking = this.sapT > 0 || (cap < 100 && (ill || has(v, 'hypo') || has(v, 'heat')));
    this.lost.classList.toggle('sap', taking);
    const why = 100 - cap >= 0.5 && v.capWhy ? v.capWhy : '';
    if (why !== this.lastWhy) {
      this.lastWhy = why;
      this.why.innerHTML = why ? svg(WHY_ICON[why], 2.6) : '';
      this.why.style.display = why ? 'block' : 'none';
      this.dial.dataset.why = why;
    }
    if (why) {
      // (inside the ring, where the grey begins)
      const t = ((capA - 90) * Math.PI) / 180;
      this.why.style.left = `${(57 + 39 * Math.cos(t) - 9).toFixed(1)}px`;
      this.why.style.top = `${(57 + 39 * Math.sin(t) - 9).toFixed(1)}px`;
      this.why.classList.toggle('sap', taking);
    }
    // the air's mark round the top: −30 °C at −60°, +40 °C at +60°
    const a = Math.max(-60, Math.min(60, ((ambientC + 30) / 70) * 120 - 60));
    this.needle.setAttribute('transform', `rotate(${a.toFixed(1)} 57 57)`);
    this.temp.textContent = v.temp.toFixed(1);
    const feel = feels(v);
    const cold = v.temp < 35;
    const hot = !cold && (feel === 'heat' || v.temp > 38.5);
    this.unit.className = cold ? 'cold' : hot ? 'hot' : '';
    this.unit.textContent = cold ? '°C 好冷' : hot ? '°C 好热' : '°C';
    // the needs: a tile each, always there
    const need = (k: Need, value: number, low: boolean): void => {
      const el = this.tiles[k];
      (el.firstElementChild!.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
      el.classList.toggle('low', low);
    };
    const energy = v.energy ?? 100;
    need('food', v.food, v.food < 20);
    need('water', v.water, v.water < 20);
    need('energy', energy, sleepy(v));
    // the states, each with its icon: ill, cold, hot, hurt, wet, sleepy, a good meal (and drunk)
    const fx: [string, string, string][] = [];
    if (ill) fx.push(['sick', 'bad', has(v, 'sick2') ? EFFECT_ZH.sick2 : EFFECT_ZH.sick1]);
    if (feel === 'chilly' || feel === 'frozen') fx.push(['cold', feel === 'frozen' ? 'bad' : 'cold', feel === 'frozen' ? EFFECT_ZH.hypo : '有点冷']);
    if (feel === 'warm' || feel === 'heat') fx.push(['hot', feel === 'heat' ? 'bad' : 'hot', feel === 'heat' ? EFFECT_ZH.heat : '有点热']);
    if (has(v, 'hurt')) fx.push(['hurt', 'bad', EFFECT_ZH.hurt]);
    if (has(v, 'wet')) fx.push(['wet', 'cold', EFFECT_ZH.wet]);
    if (sleepy(v)) fx.push(['sleepy', 'sleep', '困了']);
    const good = buffs.length ? '吃好了' : has(v, 'energy') ? EFFECT_ZH.energy : has(v, 'awake') ? EFFECT_ZH.awake : has(v, 'warm2') ? EFFECT_ZH.warm2 : has(v, 'warm1') ? EFFECT_ZH.warm1 : '';
    if (good) fx.push(['meal', 'good', good]);
    if (has(v, 'drunk')) fx.push(['drunk', 'bad', EFFECT_ZH.drunk]);
    const key = fx.map((e) => e[2]).join(',');
    if (key !== this.lastFx) {
      this.lastFx = key;
      this.fxList.innerHTML = fx.map(([icon, tone, text]) => `<span class="${tone}">${svg(FX_ICON[icon])}${text}</span>`).join('');
    }
    // sleepy: the view dims for a moment every half minute or so (heavier the more tired)
    if (sleepy(v)) {
      if (this.dozeT < 0 && (this.dozeIn -= dt) <= 0) this.dozeT = 0;
      if (this.dozeT >= 0) {
        this.dozeT += dt;
        const d = 1.4;
        const k = this.dozeT < d ? Math.sin((this.dozeT / d) * Math.PI) : 0;
        this.doze.style.opacity = (k * (0.55 + 0.4 * (1 - energy / 20))).toFixed(2);
        if (this.dozeT >= d) {
          this.dozeT = -1;
          this.dozeIn = 18 + Math.random() * 20 * Math.max(0.3, energy / 20);
        }
      }
    } else if (this.dozeT >= 0 || this.doze.style.opacity !== '0') {
      this.dozeT = -1;
      this.dozeIn = 12;
      this.doze.style.opacity = '0';
    }
    // over the view: tired, hurt, cold, hot
    this.vig.style.opacity = v.stamina < 35 ? ((35 - v.stamina) / 35 * 0.9).toFixed(2) : '0';
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hurtEl.style.opacity = (this.hurtT > 0 ? (this.hurtT / 0.45) * 0.9 : hp < 20 ? 0.25 + 0.12 * Math.sin(performance.now() / 260) : 0).toFixed(2);
    this.frost.style.opacity = v.temp < 34 ? Math.min(1, (34 - v.temp) / 2).toFixed(2) : '0';
    this.glow.style.opacity = v.temp > 38.7 ? Math.min(0.9, (v.temp - 38.7) / 1.6).toFixed(2) : '0';
  }
}

const DEATH_CSS = `
.mc-death { position: absolute; inset: 0; z-index: 7; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 45%, rgba(40,6,4,0.55), rgba(8,4,3,0.92)); opacity: 0; transition: opacity 1.2s; pointer-events: none; }
.mc-death.on { opacity: 1; pointer-events: auto; }
.mc-death .card { width: 420px; padding: 18px 20px 16px; color: #fff; }
.mc-death h2 { margin: 0 0 4px; font-size: 26px; }
.mc-death .why { color: var(--tx-2); font-size: 14px; margin-bottom: 12px; }
.mc-death .pts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.mc-death button { display: flex; justify-content: space-between; width: 100%; padding: 8px 12px; border: 2.5px solid var(--ink); border-radius: 10px; background: #f6f2ea; color: var(--ink); box-shadow: 0 3px 0 var(--ink); font: 700 14px inherit; cursor: pointer; }
.mc-death button:hover { background: #e9c14a; }
.mc-death button.alt { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(239,230,211,0.6); box-shadow: none; }
.mc-death .none { color: var(--tx-2); font-size: 13px; margin-bottom: 10px; }
`;

/** after one dies: why, and where to go on from (the restore points), or from the beginning */
export class DeathCard {
  private readonly el: HTMLDivElement;
  open = false;

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-death-css')) {
      const st = document.createElement('style');
      st.id = 'mc-death-css';
      st.textContent = DEATH_CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-death';
    root.appendChild(this.el);
  }

  /** show it: the cause, the points (label, when), what each button does */
  show(why: string, points: { label: string; ago: string }[], pick: (i: number) => void, fresh: () => void): void {
    this.open = true;
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.el.innerHTML = `<div class="card mc-frame"><h2>你倒下了</h2><div class="why">${esc(why)}</div>${
      points.length ? `<div class="pts">${points.map((p, i) => `<button data-i="${i}"><span>${esc(p.label)}</span><span>${esc(p.ago)}</span></button>`).join('')}</div>` : '<div class="none">还没有恢复点（每五分钟存一个）。</div>'
    }<button class="alt" data-fresh="1"><span>回主界面</span><span>新游戏、别的存档在那里</span></button></div>`;
    this.el.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => pick(Number((b as HTMLElement).dataset.i))));
    this.el.querySelector('button[data-fresh]')?.addEventListener('click', () => fresh());
    // (a frame later, so the fade runs)
    requestAnimationFrame(() => this.el.classList.add('on'));
  }

  hide(): void {
    this.open = false;
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }
}

const MAT_CSS = `
.mc-mats { position: absolute; left: 24px; top: 134px; display: flex; flex-direction: column; gap: 5px; pointer-events: none; z-index: 2; }
.mc-mats .m { display: flex; align-items: center; gap: 7px; padding: 4px 12px 4px 7px; border-radius: 12px; font: 700 15px var(--key-font); color: #fff; transition: opacity 0.45s, transform 0.45s; }
.mc-mats .m svg { width: 22px; height: 22px; }
.mc-mats .m i { font-style: normal; font-weight: 400; color: var(--tx-2); font-size: 13px; }
.mc-mats .m.gain b { color: #a9ef9a; }
.mc-mats .m.spend b { color: #ffb0a6; }
.mc-mats .m.out { opacity: 0; transform: translateX(-12px); }
`;

/**
 * The materials as they change (Arctic Drive's popup): under the dial, a line for each that came in or went
 * out — how much, and how much there is now — fading after a few seconds.
 */
export class MaterialsHud {
  private readonly el: HTMLDivElement;
  private readonly lines = new Map<string, { el: HTMLDivElement; n: number; timer: number }>();

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-mats-css')) {
      const st = document.createElement('style');
      st.id = 'mc-mats-css';
      st.textContent = MAT_CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-mats';
    root.appendChild(this.el);
  }

  show(delta: Partial<Record<Material, number>>, stock: Record<Material, number>): void {
    for (const m of MATERIAL_IDS) {
      const d = delta[m] ?? 0;
      if (!d) continue;
      let line = this.lines.get(m);
      if (!line || Math.sign(line.n) !== Math.sign(d)) {
        line?.el.remove();
        const el = document.createElement('div');
        el.className = 'm mc-frame';
        this.el.appendChild(el);
        line = { el, n: 0, timer: 0 };
        this.lines.set(m, line);
      }
      line.n += d;
      line.el.className = `m mc-frame ${line.n > 0 ? 'gain' : 'spend'}`;
      line.el.innerHTML = `${materialIcon(m)}<b>${line.n > 0 ? '+' : ''}${line.n}</b> ${MATERIALS[m].name.zh}<i>共 ${stock[m]}</i>`;
      window.clearTimeout(line.timer);
      const l = line;
      l.timer = window.setTimeout(() => {
        l.el.classList.add('out');
        window.setTimeout(() => {
          l.el.remove();
          if (this.lines.get(m) === l) this.lines.delete(m);
        }, 480);
      }, 2600);
    }
  }
}
