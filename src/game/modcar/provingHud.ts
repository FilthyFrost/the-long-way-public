/**
 * The proving ground's panel on screen (docs/MODCAR.md §28): top right, in the HUD's cartoon frame, while the
 * vehicle one drives is on the proving ground. The section and what to do; four live curves — speed, revs,
 * lateral g, slip angle — over the last fifteen seconds, or over the run while one runs (with the run it is being
 * compared with drawn faint under it: A under B, or the last run of the section); when a run ends, what it measured;
 * when both legs of a comparison are done, A against B.
 */
import { sectionOf } from '../../core/modcar/proving/layout';
import { CHANNELS, type Channel, type Trace } from '../../core/modcar/proving/telemetry';
import type { RunResult } from '../../core/modcar/proving/runs';
import type { ProvingSession } from './provingSession';

const CSS = `
.mc-pg { position: absolute; right: 22px; top: 20px; width: 340px; padding: 10px 12px 11px; z-index: 2; pointer-events: none; color: #fff; font-size: 13px; }
.mc-pg .hd { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.mc-pg .hd b { font-size: 15px; }
.mc-pg .hd .tag { margin-left: auto; padding: 1px 8px; border-radius: 8px; background: #f6f2ea; color: #17120f; font-size: 11.5px; font-weight: 700; box-shadow: 0 0 0 1.5px #17120f; }
.mc-pg .hd .tag.ab { background: #e9c14a; }
.mc-pg .live { color: var(--tx-2); font-variant-numeric: tabular-nums; min-height: 18px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-pg .ch { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 6px; margin-top: 5px; }
.mc-pg .ch .l { line-height: 1.15; }
.mc-pg .ch .l i { display: block; font-style: normal; font-size: 11.5px; color: var(--tx-2); }
.mc-pg .ch .l b { font: 700 16px/1.1 var(--key-font); font-variant-numeric: tabular-nums; }
.mc-pg .ch .l b small { font-size: 11px; font-weight: 400; color: var(--tx-2); margin-left: 3px; }
.mc-pg canvas { width: 100%; height: 40px; display: block; border-radius: 6px; background: rgba(0,0,0,0.28); }
.mc-pg .key { display: flex; gap: 10px; margin-top: 6px; font-size: 11.5px; color: var(--tx-2); }
.mc-pg .key span::before { content: ''; display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; background: currentColor; }
.mc-pg .key .now { color: #e9c14a; }
.mc-pg .key .ghost { color: #8fd0ff; }
.mc-pg .res { margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--rule); }
.mc-pg .res .line { font-weight: 700; margin-bottom: 4px; line-height: 1.4; }
.mc-pg .res .line.bad { color: #ffb0a6; }
.mc-pg table { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.mc-pg td { padding: 1.5px 3px; border-bottom: 1px solid rgba(255,255,255,0.07); white-space: nowrap; }
.mc-pg td.n { color: var(--tx-2); }
.mc-pg td.v { text-align: right; }
.mc-pg td.c { text-align: right; min-width: 46px; font-weight: 700; }
.mc-pg .good { color: #a6ea92; }
.mc-pg .bad { color: #ff9a7e; }
.mc-pg th { font-weight: 700; font-size: 12px; text-align: right; padding: 0 3px 2px; color: #e9c14a; }
.mc-pg th.n { text-align: left; color: var(--tx-2); font-weight: 400; }
`;

/** how long a run's figures stay up after it ends (s) */
const SHOW_S = 14;

interface Row {
  el: HTMLElement;
  val: HTMLElement;
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
}

export class ProvingHud {
  private readonly el: HTMLDivElement;
  private readonly head: HTMLElement;
  private readonly tag: HTMLElement;
  private readonly liveEl: HTMLElement;
  private readonly keyEl: HTMLElement;
  private readonly res: HTMLElement;
  private readonly rows: Record<Channel, Row>;
  private lastRes = '';
  private shown = false;
  private aside = false;
  /** the panel may show (the player's choice, the dev tab's switch) */
  enabled = true;

  constructor(root: HTMLElement) {
    if (!document.getElementById('mc-pg-css')) {
      const st = document.createElement('style');
      st.id = 'mc-pg-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-pg mc-frame';
    this.el.style.display = 'none';
    this.el.innerHTML = `<div class="hd"><b class="h">试车场</b><span class="tag" style="display:none"></span></div>
<div class="live"></div>
${CHANNELS.map((c) => `<div class="ch" data-c="${c.key}"><div class="l"><i>${c.zh}</i><b>—</b></div><canvas width="460" height="80"></canvas></div>`).join('')}
<div class="key"></div>
<div class="res" style="display:none"></div>`;
    root.appendChild(this.el);
    this.head = this.el.querySelector('.h')!;
    this.tag = this.el.querySelector('.tag')!;
    this.liveEl = this.el.querySelector('.live')!;
    this.keyEl = this.el.querySelector('.key')!;
    this.res = this.el.querySelector('.res')!;
    const rows = {} as Record<Channel, Row>;
    for (const c of CHANNELS) {
      const el = this.el.querySelector<HTMLElement>(`.ch[data-c="${c.key}"]`)!;
      const cv = el.querySelector('canvas')!;
      rows[c.key] = { el, val: el.querySelector('.l b')!, cv, g: cv.getContext('2d')! };
    }
    this.rows = rows;
  }

  /** draw the session as it is now (`aside`: the developer's panel is open on the right: out of its way) */
  update(s: ProvingSession, now: number, aside = false): void {
    const on = this.enabled && !!s.vehicle;
    if (on !== this.shown) {
      this.shown = on;
      this.el.style.display = on ? '' : 'none';
    }
    if (!on) return;
    if (aside !== this.aside) {
      this.aside = aside;
      this.el.style.right = aside ? '404px' : '';
    }
    const c = s.car;
    const run = s.runs.current;
    const sec = run ? sectionOf(run.section) : null;
    this.head.textContent = `试车场${sec ? ` · ${sec.zh}` : ''}`;
    const ab = s.ab && s.ab.i < 2 ? s.ab : null;
    const tag = ab ? `${ab.legs[ab.i].label} · ${ab.robot ? '自动' : '我来开'}` : s.pilot ? '自动驾驶' : '';
    this.tag.textContent = tag;
    this.tag.style.display = tag ? '' : 'none';
    this.tag.classList.toggle('ab', !!ab);
    const line = s.runs.line(c) || (s.pilot ? s.pilot.doing : '开到一段路的起点，计时会自己开始（开发者面板「试车场」页可以一键过去）');
    this.liveEl.textContent = s.news && now - s.shownAt > 3 ? s.news : line;
    // the values now
    this.rows.kmh.val.innerHTML = `${c.kmh.toFixed(0)}<small>km/h</small>`;
    this.rows.rpm.val.innerHTML = `${Math.round(c.rpm)}<small>rpm</small>`;
    this.rows.latG.val.innerHTML = `${c.latG.toFixed(2)}<small>g</small>`;
    this.rows.slipDeg.val.innerHTML = `${c.slipDeg.toFixed(1)}<small>°</small>`;
    // the curves: the run's as it goes (with what it is compared with under it), else the last seconds
    const running = run && run.phase === 'running' ? run : null;
    let tr: Trace = s.recent.trace;
    let ghost: Trace | null = null;
    let x0 = c.t - s.recent.keep;
    let x1 = c.t;
    let kind = '最近 15 秒';
    if (running) {
      tr = running.trace;
      const ref = ab && ab.i === 1 ? ab.legs[0].result : this.lastOf(s, running.section);
      ghost = ref?.trace ?? null;
      x0 = 0;
      const xs = tr.x;
      const last = xs.length ? xs[xs.length - 1] : 0;
      const gl = ghost && ghost.length ? ghost.x[ghost.length - 1] : 0;
      x1 = Math.max(running.xKind === 'time' ? 8 : 40, last, gl);
      kind = ab && ab.i === 1 ? 'B（这一轮）' : '这一轮';
    } else if (s.shown && now - s.shownAt < SHOW_S) {
      tr = s.shown.trace;
      const ref = s.ab && s.ab.legs[1].result === s.shown ? s.ab.legs[0].result : null;
      ghost = ref?.trace ?? null;
      x0 = 0;
      x1 = Math.max(tr.length ? tr.x[tr.length - 1] : 1, ghost && ghost.length ? ghost.x[ghost.length - 1] : 0);
      kind = '刚才这一轮';
    }
    this.keyEl.innerHTML = `<span class="now">${kind}</span>${ghost ? `<span class="ghost">${ab || (s.ab && s.ab.legs[1].result === s.shown) ? 'A' : '上一轮'}</span>` : ''}`;
    for (const ch of CHANNELS) this.draw(this.rows[ch.key], ch.key, tr, ghost, x0, x1);
    this.results(s, now);
  }

  /** the last run of a section that ended (the one to compare a new run with) */
  private lastOf(s: ProvingSession, id: string): RunResult | null {
    const list = s.runs.results;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].section === id && list[i].ok) return list[i];
    return null;
  }

  private draw(r: Row, k: Channel, tr: Trace, ghost: Trace | null, x0: number, x1: number): void {
    const g = r.g;
    const W = r.cv.width;
    const H = r.cv.height;
    g.clearRect(0, 0, W, H);
    // (the range: from zero up for speed and revs, either side of zero for g and slip)
    const vals = tr.ch[k];
    let hi = k === 'kmh' ? 60 : k === 'rpm' ? 3000 : k === 'latG' ? 0.5 : 5;
    const scan = (t: Trace | null): void => {
      if (!t) return;
      for (let i = 0; i < t.length; i++) if (t.x[i] >= x0 && t.x[i] <= x1) hi = Math.max(hi, Math.abs(t.ch[k][i]) * 1.1);
    };
    scan(tr);
    scan(ghost);
    const sym = k === 'latG' || k === 'slipDeg';
    const lo = sym ? -hi : 0;
    const px = (x: number): number => ((x - x0) / Math.max(1e-6, x1 - x0)) * W;
    const py = (v: number): number => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
    // the zero line, and a faint grid
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, py(sym ? 0 : hi / 2));
    g.lineTo(W, py(sym ? 0 : hi / 2));
    g.stroke();
    const line = (t: Trace, colour: string, width: number): void => {
      g.strokeStyle = colour;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      let first = true;
      const v = t.ch[k];
      for (let i = 0; i < t.length; i++) {
        const x = t.x[i];
        if (x < x0 || x > x1) continue;
        if (first) g.moveTo(px(x), py(v[i]));
        else g.lineTo(px(x), py(v[i]));
        first = false;
      }
      g.stroke();
    };
    if (ghost) line(ghost, 'rgba(143,208,255,0.75)', 3);
    line(tr, '#e9c14a', 3.5);
    // (the scale's top, small, in the corner)
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '20px Bahnschrift, Arial, sans-serif';
    g.fillText(k === 'rpm' ? `${Math.round(hi)}` : k === 'kmh' ? `${Math.round(hi)}` : hi.toFixed(k === 'latG' ? 1 : 0), 6, 22);
    void vals;
  }

  /** what the last run measured; A against B when both are done */
  private results(s: ProvingSession, now: number): void {
    const ab = s.ab;
    let html = '';
    if (ab && ab.legs[0].result && ab.legs[1].result && now - s.shownAt < SHOW_S * 3) {
      const rows = s.rows();
      html = `<div class="line">A：${ab.legs[0].what}<br>B：${ab.legs[1].what}</div><table><tr><th class="n"></th><th>A</th><th>B</th><th></th></tr>${rows
        .slice(0, 7)
        .map((r) => `<tr><td class="n">${r.zh}</td><td class="v">${r.a}</td><td class="v">${r.b}</td><td class="c ${r.better === null ? '' : r.better ? 'good' : 'bad'}">${r.delta}</td></tr>`)
        .join('')}</table>`;
    } else if (s.shown && now - s.shownAt < SHOW_S) {
      const r = s.shown;
      html = `<div class="line${r.ok ? '' : ' bad'}">${r.line}</div>${r.ok ? `<table>${r.figures
        .filter((f) => Number.isFinite(f.value))
        .slice(0, 8)
        .map((f) => `<tr><td class="n">${f.zh}</td><td class="v">${f.text}</td></tr>`)
        .join('')}</table>` : ''}`;
    }
    if (html !== this.lastRes) {
      this.lastRes = html;
      this.res.innerHTML = html;
      this.res.style.display = html ? '' : 'none';
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
