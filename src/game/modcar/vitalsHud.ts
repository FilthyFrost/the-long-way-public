/**
 * The body on screen (docs/MODCAR.md §13), laid out as Arctic Drive lays it out, in the HUD's cartoon frame:
 * top left, a round dial with the body's temperature in its middle and a small mark round its top for the
 * air's; health (green) round its left half and stamina (blue) round its right; beside it three small tiles
 * — food, water, the bladder — each with a bar along its top, red under a fifth; under them the effects that
 * last a while. Over the whole view: the edges darken as stamina runs out, flash red when hurt, frost over
 * when one is cold.
 */
import { EFFECT_ZH, has, type VitalEffect, type Vitals } from '../../core/modcar/vitals';
import { MATERIAL_IDS, MATERIALS, type Material } from '../../core/modcar/items';
import { materialIcon } from './craftUi';

const CSS = `
.mc-vit { position: absolute; left: 22px; top: 20px; display: flex; align-items: flex-start; gap: 10px; z-index: 2; pointer-events: none; color: #fff; }
.mc-vit .dial { position: relative; width: 96px; height: 96px; border-radius: 50% !important; padding: 0; box-sizing: border-box; }
.mc-vit .dial svg { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); overflow: visible; }
.mc-vit .dial .t { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.mc-vit .dial .t b { font: 800 25px var(--key-font); letter-spacing: -0.02em; text-shadow: var(--say-shadow); }
.mc-vit .dial .t i { font-style: normal; font-size: 11px; color: var(--tx-2); margin-top: 3px; }
.mc-vit .dial .t i.cold { color: #8fd0ff; }
.mc-vit .side { display: flex; flex-direction: column; gap: 7px; padding-top: 2px; }
.mc-vit .tiles { display: flex; gap: 7px; }
.mc-vit .tile { width: 50px; height: 48px; padding: 0 !important; display: flex; align-items: flex-start; justify-content: center; position: relative; overflow: hidden; border-radius: 12px !important; }
.mc-vit .tile svg { width: 24px; height: 24px; margin-top: 6px; }
.mc-vit .tile .b { position: absolute; left: 7px; right: 7px; bottom: 6px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.14); overflow: hidden; }
.mc-vit .tile .b i { display: block; height: 100%; border-radius: 3px; transition: width 0.3s; }
.mc-vit .tile[data-k="food"] .b i { background: #f0b43a; }
.mc-vit .tile[data-k="water"] .b i { background: #4f9cf2; }
.mc-vit .tile[data-k="bladder"] .b i { background: #e8d257; }
.mc-vit .tile.low .b i { background: #ff6b5a !important; }
.mc-vit .tile.low svg { stroke: #ff8f80; }
.mc-vit .tile.full svg { stroke: #ffd36a; }
.mc-vit .fx { display: flex; flex-wrap: wrap; gap: 5px; max-width: 190px; }
.mc-vit .fx span { padding: 2px 8px 2px 7px; border-radius: 9px; font-size: 12px; font-weight: 700; background: rgba(23,18,15,0.78); box-shadow: 0 0 0 1.5px rgba(239,230,211,0.55); white-space: nowrap; }
.mc-vit .fx span.bad { color: #ffb0a6; }
.mc-vit .fx span.good { color: #a9ef9a; }
.mc-vit .fx span.cold { color: #a8dcff; }
.mc-fx { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.mc-fx .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(12,8,6,0.85) 100%); opacity: 0; transition: opacity 0.4s; }
.mc-fx .hurt { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(160,10,0,0) 45%, rgba(170,20,10,0.65) 100%); opacity: 0; }
.mc-fx .frost { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(220,240,255,0) 50%, rgba(214,236,255,0.75) 100%); opacity: 0; transition: opacity 1s; }
`;

const ICON = {
  food: '<path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 7c0-2 1.6-2 1.6-4M12.5 7c0-2 1.6-2 1.6-4" />',
  water: '<path d="M12 3c3.5 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.4 6-11z" />',
  bladder: '<path d="M6 4h7v6H6z" /><path d="M5 10h14v1.5a7 7 0 0 1-7 7h-1v3h-5v-3a5 5 0 0 1-1-8.5z" />',
};

const GOOD: VitalEffect[] = ['energy', 'warm1', 'warm2'];
const COLD: VitalEffect[] = ['hypo', 'wet'];

/** an arc of a circle (svg path), angles in degrees from the top, clockwise */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number): string => {
    const t = ((a - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
  };
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${p(a1)}`;
}

export class VitalsHud {
  private readonly el: HTMLDivElement;
  private readonly fx: HTMLDivElement;
  private readonly hp: SVGPathElement;
  private readonly st: SVGPathElement;
  private readonly needle: SVGGElement;
  private readonly temp: HTMLElement;
  private readonly unit: HTMLElement;
  private readonly tiles: Record<'food' | 'water' | 'bladder', HTMLElement>;
  private readonly fxList: HTMLDivElement;
  private readonly vig: HTMLDivElement;
  private readonly hurtEl: HTMLDivElement;
  private readonly frost: HTMLDivElement;
  private hurtT = 0;
  private lastFx = '';

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-vit-css')) {
      const st = document.createElement('style');
      st.id = 'mc-vit-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.fx = document.createElement('div');
    this.fx.className = 'mc-fx';
    this.fx.innerHTML = '<div class="vig"></div><div class="hurt"></div><div class="frost"></div>';
    root.appendChild(this.fx);
    this.vig = this.fx.querySelector('.vig')!;
    this.hurtEl = this.fx.querySelector('.hurt')!;
    this.frost = this.fx.querySelector('.frost')!;
    this.el = document.createElement('div');
    this.el.className = 'mc-vit';
    // the rings: 114 across (the dial's 96 and 9 round it); health from the bottom up the left, stamina up the right
    this.el.innerHTML = `
      <div class="dial mc-frame">
        <svg viewBox="0 0 114 114">
          <path d="${arc(57, 57, 52, 190, 350)}" stroke="rgba(0,0,0,0.55)" stroke-width="7" fill="none" stroke-linecap="round" />
          <path d="${arc(57, 57, 52, 170, 10)}" stroke="rgba(0,0,0,0.55)" stroke-width="7" fill="none" stroke-linecap="round" />
          <path class="hp" stroke="#55cf6a" stroke-width="5" fill="none" stroke-linecap="round" />
          <path class="st" stroke="#4f9cf2" stroke-width="5" fill="none" stroke-linecap="round" />
          <g class="nd"><path d="M57 2 l-4.5 -7 h9 z" fill="#f2efe8" stroke="#17120f" stroke-width="1.5" /></g>
        </svg>
        <div class="t"><b>37.5</b><i>°C</i></div>
      </div>
      <div class="side">
        <div class="tiles">
          <div class="tile mc-frame" data-k="food" title="饥饿"><div class="b"><i></i></div><svg viewBox="0 0 24 24" fill="none" stroke="#f2efe8" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${ICON.food}</svg></div>
          <div class="tile mc-frame" data-k="water" title="口渴"><div class="b"><i></i></div><svg viewBox="0 0 24 24" fill="none" stroke="#f2efe8" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${ICON.water}</svg></div>
          <div class="tile mc-frame" data-k="bladder" title="膀胱"><div class="b"><i></i></div><svg viewBox="0 0 24 24" fill="none" stroke="#f2efe8" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${ICON.bladder}</svg></div>
        </div>
        <div class="fx"></div>
      </div>`;
    root.appendChild(this.el);
    this.hp = this.el.querySelector('path.hp')!;
    this.st = this.el.querySelector('path.st')!;
    this.needle = this.el.querySelector('g.nd')!;
    this.temp = this.el.querySelector('.t b')!;
    this.unit = this.el.querySelector('.t i')!;
    this.tiles = { food: this.el.querySelector('[data-k="food"]')!, water: this.el.querySelector('[data-k="water"]')!, bladder: this.el.querySelector('[data-k="bladder"]')! };
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

  /** draw the body as it is; ambientC = the air round one */
  update(v: Vitals, ambientC: number, dt: number): void {
    // health up the left from the bottom (190° → 350°), stamina up the right (170° → 10°)
    const hp = Math.max(0, Math.min(1, v.hp / 100));
    const st = Math.max(0, Math.min(1, v.stamina / 100));
    this.hp.setAttribute('d', hp > 0.005 ? arc(57, 57, 52, 190, 190 + 160 * hp) : '');
    this.st.setAttribute('d', st > 0.005 ? arc(57, 57, 52, 170, 170 - 160 * st) : '');
    this.hp.setAttribute('stroke', hp < 0.2 ? '#ff6b5a' : '#55cf6a');
    // the air's mark round the top: −30 °C at −60°, +40 °C at +60°
    const a = Math.max(-60, Math.min(60, ((ambientC + 30) / 70) * 120 - 60));
    this.needle.setAttribute('transform', `rotate(${a.toFixed(1)} 57 57)`);
    this.temp.textContent = v.temp.toFixed(1);
    this.unit.className = v.temp < 35 ? 'cold' : '';
    this.unit.textContent = v.temp < 35 ? '°C 好冷' : '°C';
    const tile = (k: 'food' | 'water' | 'bladder', value: number, low: boolean, full = false): void => {
      const el = this.tiles[k];
      (el.firstElementChild!.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
      el.classList.toggle('low', low);
      el.classList.toggle('full', full);
    };
    tile('food', v.food, v.food < 20);
    tile('water', v.water, v.water < 20);
    tile('bladder', v.bladder, false, v.bladder >= 90);
    // the effects
    const fx = (Object.keys(v.effects) as VitalEffect[]).filter((e) => has(v, e));
    if (v.bladder >= 90) fx.push('bladder' as VitalEffect);
    const key = fx.join(',');
    if (key !== this.lastFx) {
      this.lastFx = key;
      this.fxList.innerHTML = fx
        .map((e) => (e === ('bladder' as VitalEffect) ? '<span class="bad">憋不住了（按住 P）</span>' : `<span class="${GOOD.includes(e) ? 'good' : COLD.includes(e) ? 'cold' : 'bad'}">${EFFECT_ZH[e]}</span>`))
        .join('');
    }
    // over the view: tired, hurt, cold
    this.vig.style.opacity = v.stamina < 35 ? ((35 - v.stamina) / 35 * 0.9).toFixed(2) : '0';
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hurtEl.style.opacity = (this.hurtT > 0 ? (this.hurtT / 0.45) * 0.9 : v.hp < 20 ? 0.25 + 0.12 * Math.sin(performance.now() / 260) : 0).toFixed(2);
    this.frost.style.opacity = v.temp < 34 ? Math.min(1, (34 - v.temp) / 2).toFixed(2) : '0';
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
    }<button class="alt" data-fresh="1"><span>从头开始</span><span>清空存档</span></button></div>`;
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
