/**
 * The world tabs of the developer's panel (devPanel.ts): where one is and off to another kind of country, the
 * weather, the hour, the look of the picture, the terrain — every dial a slider with what it does in plain words
 * under the mouse (a bubble beside the panel), its value, and a way back to the game's own. The moved dials can
 * be copied out or saved for the game (devTune.ts).
 */
import { BIOMES } from '../../core/world/biomes';
import type { WeatherKind } from '../../core/env/weather';
import { INTENSITIES, INTENSITY_ZH, REGION_ENTRY, journeyTotals, type JourneyStop } from './devJourney';
import { fmt, type Dial, type DialTab, type Tune } from './devTune';
import { DevWorld, PLACES } from './devWorld';

export type PaneId = 'place' | DialTab;

export const PANE_CSS = `
.mc-dev .tabs { display: flex; gap: 0; padding: 0 8px; border-bottom: 1px solid rgba(255,255,255,0.14); }
.mc-dev .tabs span { flex: 1; text-align: center; padding: 6px 2px 7px; font-size: 13px; color: #a8a49e; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.mc-dev .tabs span:hover { color: #fff; }
.mc-dev .tabs span.on { color: #fff; font-weight: 700; border-bottom-color: #e9c14a; }
.mc-dev .tabs span i { font-style: normal; font-size: 10px; color: #17120f; background: #e9c14a; border-radius: 7px; padding: 0 4px; margin-left: 2px; vertical-align: 1px; }
.mc-dev .pane { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.mc-dev .pane .body { flex: 1; overflow-y: auto; padding: 2px 12px 10px 14px; overscroll-behavior: contain; }
.mc-dev .dial { padding: 4px 0 2px; }
.mc-dev .dial .top { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.mc-dev .dial .lb { flex: 1; cursor: help; }
.mc-dev .dial.moved .lb::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 3px; background: #e9c14a; margin-right: 5px; vertical-align: 1px; }
.mc-dev .dial .val { font-variant-numeric: tabular-nums; color: #c9c6c0; min-width: 56px; text-align: right; cursor: text; border-radius: 5px; padding: 0 3px; }
.mc-dev .dial .val:hover { background: rgba(255,255,255,0.08); }
.mc-dev .dial .val input { width: 70px; font: inherit; font-size: 12.5px; text-align: right; border: 1.5px solid #e9c14a; border-radius: 5px; background: rgba(0,0,0,0.4); color: #fff; outline: none; }
.mc-dev .dial .rs { visibility: hidden; cursor: pointer; color: #e9c14a; font-weight: 400; padding: 0 2px; }
.mc-dev .dial.moved .rs { visibility: visible; }
.mc-dev .dial.moved .val { color: #e9c14a; font-weight: 700; }
.mc-dev input[type=range] { display: block; width: 100%; accent-color: #e9c14a; margin: 1px 0 0; height: 18px; cursor: pointer; }
.mc-dev .btns { display: flex; flex-wrap: wrap; gap: 6px; }
.mc-dev .btns.two { display: grid; grid-template-columns: 1fr 1fr; }
.mc-dev .btns.three { display: grid; grid-template-columns: 1fr 1fr 1fr; }
.mc-dev .btns button { padding: 6px 8px; border: 0; border-radius: 9px; background: rgba(255,255,255,0.08); box-shadow: inset 0 0 0 1.5px rgba(239,230,211,0.3); color: #fff; font: inherit; font-size: 12.5px; cursor: pointer; }
.mc-dev .btns button:hover { box-shadow: inset 0 0 0 2px #efe6d3; }
.mc-dev .btns button.on { background: #f6f2ea; color: #17120f; font-weight: 700; box-shadow: inset 0 0 0 2px #17120f; }
.mc-dev .btns button.go { background: #e9c14a; color: #17120f; font-weight: 700; box-shadow: inset 0 0 0 2px #17120f; }
.mc-dev .where { font-size: 13px; line-height: 1.5; padding: 7px 10px; border-radius: 9px; background: rgba(255,255,255,0.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
.mc-dev .msg { min-height: 18px; font-size: 12px; color: #a6ea92; margin-top: 5px; line-height: 1.45; }
.mc-dev .msg.bad { color: #ff9a7e; }
.mc-dev .big { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.mc-dev .big small { font-size: 13px; font-weight: 400; color: #c9c6c0; margin-left: 8px; letter-spacing: 0; }
.mc-dev .note { font-size: 12px; color: #c9c6c0; line-height: 1.5; margin: 3px 0 6px; }
.mc-dev .row { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 4px 0; }
.mc-dev .row input[type=number] { width: 84px; font: inherit; font-size: 13px; padding: 4px 6px; border: 1.5px solid rgba(239,230,211,0.35); border-radius: 7px; background: rgba(0,0,0,0.35); color: #fff; }
.mc-dev label.check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 7px 0 2px; cursor: pointer; }
.mc-dev label.check input { accent-color: #e9c14a; }
.mc-dev .ft2 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 9px 12px 12px; border-top: 1px solid rgba(255,255,255,0.14); }
.mc-dev .ft2 button { padding: 6px 4px; border: 2px solid #17120f; border-radius: 9px; background: #f6f2ea; color: #17120f; box-shadow: 0 2px 0 #17120f; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.mc-dev .ft2 button:hover { background: #e9c14a; }
.mc-dev .ft2 .msg { grid-column: 1 / -1; margin: 0; }
.mc-dev .btns button.out { color: #8d8a84; box-shadow: inset 0 0 0 1.5px rgba(239,230,211,0.14); }
.mc-dev .jleg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: #c9c6c0; margin: 2px 0 6px; }
.mc-dev .jleg span { display: inline-flex; align-items: center; gap: 5px; }
.mc-dev .jleg i, .mc-dev .jcell i { font-style: normal; }
.mc-dev .jleg b { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }
.mc-dev .journey { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
.mc-dev .jcell { min-width: 0; padding: 3px 4px 4px; border-radius: 4px; font-size: 11px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.mc-dev .jcell small { display: block; font-size: 9.5px; opacity: 0.8; font-variant-numeric: tabular-nums; }
.mc-dev .jcell.here { box-shadow: inset 0 0 0 2px #fff; }
.mc-dev .jcell[data-s] { cursor: pointer; }
.mc-dev .jleg b.calm, .mc-dev .jcell.calm { background: #6f6a5c; }
.mc-dev .jleg b.scenic, .mc-dev .jcell.scenic { background: #b39647; }
.mc-dev .jleg b.highlight, .mc-dev .jcell.highlight { background: #f0cf66; }
.mc-dev .jcell.calm { color: #fff; }
.mc-dev .jcell.scenic, .mc-dev .jcell.highlight { color: #17120f; }
.mc-dev-tip { position: fixed; z-index: 40; max-width: 280px; padding: 9px 12px 10px; box-sizing: border-box; border-radius: 10px; border: 2.5px solid #efe6d3; box-shadow: 0 0 0 2px #17120f, 0 5px 0 rgba(10,8,6,0.5); background: rgba(22,21,20,0.96); color: #fff; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; font-size: 13px; line-height: 1.6; pointer-events: none; }
.mc-dev-tip b { color: #e9c14a; font-weight: 700; }
.mc-dev-tip small { display: block; margin-top: 5px; color: #c9c6c0; font-size: 11.5px; line-height: 1.45; }
`;

/** the bubble beside the panel with what the thing under the mouse does */
class Tip {
  private readonly el: HTMLDivElement;

  constructor(private readonly panel: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'mc-dev-tip';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  show(html: string, at: HTMLElement): void {
    this.el.innerHTML = html;
    this.el.style.display = '';
    const p = this.panel.getBoundingClientRect();
    const r = at.getBoundingClientRect();
    const h = this.el.offsetHeight;
    // to the left of the panel, level with the row (kept on the screen)
    this.el.style.right = `${Math.max(8, window.innerWidth - p.left + 10)}px`;
    this.el.style.left = '';
    this.el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2))}px`;
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  dispose(): void {
    this.el.remove();
  }
}

/** a slider's position for a speed of the clock (0 = stopped; the rest on a log scale up to 300×) */
const speedOf = (pos: number): number => (pos <= 0 ? 0 : Math.round(10 ** ((pos - 50) / 25) * 100) / 100);
const posOf = (speed: number): number => (speed <= 0 ? 0 : Math.max(1, Math.min(100, 50 + 25 * Math.log10(speed))));

const HOURS: [string, number][] = [
  ['日出', 6.1],
  ['清晨', 7.2],
  ['上午', 9.5],
  ['正午', 12.5],
  ['下午', 15.5],
  ['黄昏', 18.5],
  ['蓝调', 19.6],
  ['夜晚', 22],
  ['深夜', 2.5],
];

/** how many regions of the journey the 传送 tab shows */
const JOURNEY_SHOWN = 60;

/** what hides the change between two scenic stretches worlds apart (core/world/journey/scenes.ts Threshold) */
const THRESHOLD_ZH: Readonly<Record<string, string>> = { tunnel: '长隧道', pass: '垭口', fog: '雾墙', dust: '沙尘暴', blizzard: '暴风雪', rain: '雨幕', bridge: '长桥' };
/** a mark beside the name for the two that are not calm: the strip reads without its colours too */
const JOURNEY_MARK: Readonly<Record<JourneyStop['intensity'], string>> = { calm: '', scenic: '◆', highlight: '★' };

export interface PaneHost {
  readonly tune: Tune;
  readonly devTools: DevWorld;
}

export class WorldPanes {
  private readonly tip: Tip;
  private readonly rows = new Map<string, { el: HTMLElement; d: Dial }>();
  private readonly bodies = new Map<PaneId, HTMLElement>();
  private terrainBiome = '';
  private bring = true;
  private hourSlider: HTMLInputElement | null = null;
  private hourBig: HTMLElement | null = null;
  private dragHour = false;
  private whereEl: HTMLElement | null = null;
  private regionsEl: HTMLElement | null = null;
  private journeyEl: HTMLElement | null = null;
  private journeyLegend: HTMLElement | null = null;
  /** the chapter the journey shown begins with (drawn again when one has driven into the next) */
  private journeyFrom = -1;
  private wxButtons: HTMLElement | null = null;
  private stageSlider: HTMLInputElement | null = null;
  private stageText: HTMLElement | null = null;
  private speedSlider: HTMLInputElement | null = null;
  private speedText: HTMLElement | null = null;

  constructor(
    private readonly host: PaneHost,
    private readonly panel: HTMLElement,
  ) {
    this.tip = new Tip(panel);
    // the bubble: whatever has a help text under the mouse
    panel.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest('[data-tip], .dial') as HTMLElement | null;
      if (!el || !panel.contains(el)) return this.tip.hide();
      const id = el.dataset.id;
      const row = id ? this.rows.get(id) : undefined;
      if (row) this.tip.show(this.dialTip(row.d), el);
      else if (el.dataset.tip) this.tip.show(el.dataset.tip, el);
    });
    panel.addEventListener('mouseleave', () => this.tip.hide());
    host.tune.onChange((id) => {
      const row = this.rows.get(id);
      if (row) this.sync(row.el, row.d);
    });
  }

  private dialTip(d: Dial): string {
    const t = this.host.tune;
    const now = fmt(d, t.get(d.id));
    const def = fmt(d, d.def);
    return `<b>${d.label}</b><br>${d.help}<small>默认：${def}${t.moved(d.id) ? ` · 现在：${now}` : ''}${d.regen ? '<br>改完要点「重新生成世界」才看得到。' : ''}</small>`;
  }

  /** make a tab's content into `pane` (a body to scroll and the buttons under it) */
  build(id: PaneId, pane: HTMLElement): void {
    const body = document.createElement('div');
    body.className = 'body';
    pane.appendChild(body);
    this.bodies.set(id, body);
    if (id === 'place') this.buildPlace(body);
    if (id === 'weather') this.buildWeather(body);
    if (id === 'time') this.buildTime(body);
    if (id === 'terrain') this.buildTerrainHead(body);
    if (id !== 'place') this.buildDials(id, body);
    this.buildFooter(id, pane);
  }

  // ------------------------------------------------------------------ the dials

  private buildDials(tab: DialTab, body: HTMLElement): void {
    const holder = document.createElement('div');
    holder.className = 'dials';
    body.appendChild(holder);
    this.fillDials(tab, holder);
  }

  private fillDials(tab: DialTab, holder: HTMLElement): void {
    holder.innerHTML = '';
    let sec = '';
    for (const d of this.host.tune.dials) {
      if (d.tab !== tab) continue;
      if (tab === 'terrain' && d.biome !== this.terrainBiome) continue;
      if (d.section !== sec) {
        sec = d.section;
        const h = document.createElement('h5');
        h.textContent = sec;
        holder.appendChild(h);
      }
      holder.appendChild(this.dialRow(d));
    }
  }

  private dialRow(d: Dial): HTMLElement {
    const t = this.host.tune;
    const el = document.createElement('div');
    el.className = 'dial';
    el.dataset.id = d.id;
    el.innerHTML = `<div class="top"><span class="lb">${d.label}</span><span class="val"></span><b class="rs" title="恢复默认">↺</b></div><input type="range" min="${d.min}" max="${d.max}" step="${d.step}">`;
    const r = el.querySelector('input') as HTMLInputElement;
    r.addEventListener('input', () => {
      t.set(d.id, Number(r.value));
      this.sync(el, d);
      this.tip.show(this.dialTip(d), el);
    });
    (el.querySelector('.rs') as HTMLElement).addEventListener('click', () => t.reset(d.id));
    // the value can be typed in
    const val = el.querySelector('.val') as HTMLElement;
    val.addEventListener('click', () => {
      if (val.querySelector('input')) return;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = String(d.step);
      inp.value = String(+(d.unit === 'pct' && t.get(d.id) >= 0 ? t.get(d.id) * 100 : t.get(d.id)).toFixed(4));
      val.textContent = '';
      val.appendChild(inp);
      inp.focus();
      inp.select();
      const done = (keep: boolean): void => {
        if (keep && inp.value.trim() !== '') {
          const n = Number(inp.value);
          if (Number.isFinite(n)) t.set(d.id, d.unit === 'pct' && n >= 0 ? n / 100 : n);
        }
        this.sync(el, d);
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        }
      });
      inp.addEventListener('blur', () => done(true));
    });
    this.rows.set(d.id, { el, d });
    this.sync(el, d);
    return el;
  }

  private sync(el: HTMLElement, d: Dial): void {
    const t = this.host.tune;
    const v = t.get(d.id);
    const val = el.querySelector('.val') as HTMLElement;
    if (!val.querySelector('input')) val.textContent = fmt(d, v);
    (el.querySelector('input[type=range]') as HTMLInputElement).value = String(v);
    el.classList.toggle('moved', t.moved(d.id));
  }

  // ------------------------------------------------------------------ the footer: out of the panel, back to the game's own

  private buildFooter(id: PaneId, pane: HTMLElement): void {
    const ft = document.createElement('div');
    ft.className = 'ft2';
    const tab = id === 'place' ? null : id;
    ft.innerHTML = `<button data-act="copy" data-tip="把所有改过的参数整理成一段文字，复制到剪贴板。直接粘贴发给 Claude 就行。">复制我的调整</button><button data-act="save" data-tip="把所有改过的参数存成文件 loop/dev-tune.json。然后跟 Claude 说一声「调好了」，它会自己去读、写进游戏里。">保存给 Claude</button><button data-act="reset" data-tip="${tab ? '把这一页的参数全部恢复成游戏原本的值。' : '把所有页的参数全部恢复成游戏原本的值。'}">${tab ? '恢复这页默认' : '全部恢复默认'}</button><div class="msg"></div>`;
    pane.appendChild(ft);
    const msg = ft.querySelector('.msg') as HTMLElement;
    const say = (text: string, bad = false): void => {
      msg.textContent = text;
      msg.classList.toggle('bad', bad);
    };
    ft.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      const t = this.host.tune;
      if (act === 'copy') {
        const { text } = t.export(this.host.devTools.context());
        const n = t.changed().length;
        void copyText(text).then((ok) => say(ok ? `已复制 ${n} 项调整，可以直接粘贴给 Claude。` : '没能复制到剪贴板，改用「保存给 Claude」。', !ok));
      } else if (act === 'save') {
        const { text, json } = t.export(this.host.devTools.context());
        const n = t.changed().length;
        void this.host.devTools.saveTune(text, json).then((where) => say(where ? `已保存 ${n} 项到 ${where}。跟 Claude 说一声「调好了」就行。` : '保存失败：要用 npm run dev 打开的游戏才能保存。可以改用「复制我的调整」。', !where));
      } else if (act === 'reset') {
        t.resetAll(tab ?? undefined);
        say(tab ? '这一页恢复成默认了。' : '全部恢复成默认了。');
      }
    });
  }

  // ------------------------------------------------------------------ where one is, and off somewhere else

  private buildPlace(body: HTMLElement): void {
    const tools = this.host.devTools;
    body.innerHTML = `<h5>现在在哪</h5><div class="where"></div>
<h5>随机传送到…</h5><div class="note">每点一次就随机换一个这种地形的地方。</div>
<div class="btns three places">${PLACES.map((p) => `<button data-place="${p.id}" data-tip="<b>${p.zh}</b><br>${p.help}">${p.zh}</button>`).join('')}</div>
<label class="check" data-tip="勾上：坐在车里就连车带人一起传送；走路时把最后开的那辆车停在你前面的路边。不勾：只传送你自己。"><input type="checkbox" class="bring" checked>带上我的车</label>
<div class="msg placeMsg"></div>
<h5>去某种区域</h5><div class="note">去前面路上下一段这种区域：停在它开头往里 300 米的路上。灰色的是这个世界里没有的区域。</div>
<div class="btns three regions"></div>
<div class="msg regionMsg"></div>
<h5>旅程预览</h5><div class="note jnote">从你现在所在的区域起，接下来 ${JOURNEY_SHOWN} 个区域，按「强度」上色：舒缓为主，隔几个来一个有看点的，高潮很少。鼠标放上去看里程。</div>
<div class="jleg"></div><div class="journey"></div>
<h5>按里程去</h5>
<div class="row"><span>第</span><input type="number" class="km" min="0" step="0.5" value="10"><span>km</span><div class="btns"><button class="go" data-km="go">去</button></div></div>
<div class="btns three"><button data-km="-5">往回 5 km</button><button data-km="5">往前 5 km</button><button data-km="50">往前 50 km</button></div>
<h5>换一个世界</h5><div class="note seed"></div>
<div class="btns"><button data-act="seed" data-tip="用一个新的随机种子把整个世界重新生成一遍（地形、路、湖、村子全都变）。页面会刷新。">随机换一个世界（刷新页面）</button></div>`;
    this.whereEl = body.querySelector('.where');
    this.regionsEl = body.querySelector('.regions');
    this.journeyEl = body.querySelector('.journey');
    this.journeyLegend = body.querySelector('.jleg');
    // (a world of version 3: a piece of the journey is a click away)
    this.journeyEl!.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest('.jcell') as HTMLElement | null;
      const s = Number(cell?.dataset.s);
      if (!cell || !Number.isFinite(s)) return;
      msg.textContent = tools.goKm(s / 1000, this.bring);
      this.tick();
    });
    this.regionsEl!.innerHTML = tools.regions.map((r) => `<button data-region="${r.id}"${r.known ? '' : ' class="out"'} data-tip="<b>${r.zh}</b><br>${r.known ? '去前面路上下一段「' + r.zh + '」。' : '这个世界里没有这种区域：它是在这个世界开局之后才加进游戏的（或者这是第 1 版的世界）。'}">${r.zh}</button>`).join('');
    const regionMsg = body.querySelector('.regionMsg') as HTMLElement;
    const msg = body.querySelector('.placeMsg') as HTMLElement;
    const seed = body.querySelector('.seed') as HTMLElement;
    seed.textContent = `现在的世界种子：${tools.seed}。同一个种子永远生成一模一样的世界。`;
    (body.querySelector('.bring') as HTMLInputElement).addEventListener('change', (e) => (this.bring = (e.target as HTMLInputElement).checked));
    body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.place) {
        msg.textContent = tools.go(b.dataset.place, this.bring);
        this.tick();
      }
      if (b.dataset.region) {
        const went = tools.goRegion(b.dataset.region, this.bring);
        regionMsg.textContent = went;
        // (nothing happened: said in the warning colour)
        regionMsg.classList.toggle('bad', went.startsWith('这个世界') || went.startsWith('前面') || went.startsWith('没有'));
        this.tick();
      }
      const km = b.dataset.km;
      if (km) {
        const input = body.querySelector('.km') as HTMLInputElement;
        const target = km === 'go' ? Number(input.value) : tools.km + Number(km);
        if (Number.isFinite(target)) {
          msg.textContent = tools.goKm(Math.max(0.1, target), this.bring);
          input.value = Math.max(0.1, target).toFixed(1);
        }
        this.tick();
      }
      if (b.dataset.act === 'seed') tools.regenerate(true, 'place');
    });
  }

  /**
   * The journey ahead as a strip of cells, one to a region, in the tone of how much it asks of the traveller
   * (one hue from quiet to full: an order, not three unrelated colours), each with its name, a mark for its
   * intensity and its distance under the mouse; and how many of each there are.
   */
  private drawJourney(stops: readonly JourneyStop[]): void {
    const strip = this.journeyEl;
    const legend = this.journeyLegend;
    if (!strip || !legend) return;
    if (stops[0]?.scene !== undefined) {
      // (a world of version 3: the journey's pieces — the scenic stretches by name, the quiet ones between)
      const note = strip.parentElement?.querySelector('.jnote');
      if (note) note.textContent = `从你现在所在的一段起，接下来 ${stops.length} 段：金色是风景段（地名，暂用最接近的现有区域的画法），灰色是两段之间的缓冲和出发的那一段。鼠标放上去看里程，点一下传送过去。`;
      const scenes = stops.filter((x) => x.scene).length;
      legend.innerHTML = `<span><b class="scenic"></b>风景段 ${scenes}</span><span><b class="calm"></b>缓冲 ${stops.length - scenes}</span>`;
    } else {
    const totals = journeyTotals(stops);
    legend.innerHTML = INTENSITIES.map((k) => `<span><b class="${k}"></b>${JOURNEY_MARK[k] ? `<i>${JOURNEY_MARK[k]}</i>` : ''}${INTENSITY_ZH[k]} ${totals[k]}</span>`).join('');
    }
    strip.innerHTML = stops
      .map((x, i) => {
        const km = `${(x.start / 1000).toFixed(1)} km 起 · 长 ${(x.length / 1000).toFixed(2)} km`;
        if (x.scene !== undefined) {
          // (a world of version 3: the journey's pieces, a click away)
          const gate = x.threshold ? `<br>开头有门槛：${THRESHOLD_ZH[x.threshold] ?? x.threshold}（3-2 再做出来）` : '';
          const tip = x.scene ? `<b>${x.label}</b> · ${x.tag}<br>旅程的第 ${x.chapter + 1} 段 · 暂用「${BIOMES[x.region].label}」的画法${gate}<br>${km}<br>${i === 0 ? '你现在在这里。' : '点一下传送过去。'}` : `<b>${x.label}</b><br>${km}${gate}<br>${i === 0 ? '你现在在这里。' : '点一下传送过去。'}`;
          return `<div class="jcell ${x.intensity}${i === 0 ? ' here' : ''}" data-s="${x.start + REGION_ENTRY}" data-tip="${tip}">${x.label}<small>${x.chapter + 1} · ${Math.round(x.start / 1000)} km</small></div>`;
        }
        const tip = `<b>${x.label}</b><br>旅程的第 ${x.chapter + 1} 个区域 · ${INTENSITY_ZH[x.intensity]}<br>${km}${i === 0 ? '<br>你现在在这里。' : ''}`;
        return `<div class="jcell ${x.intensity}${i === 0 ? ' here' : ''}" data-tip="${tip}">${JOURNEY_MARK[x.intensity] ? `<i>${JOURNEY_MARK[x.intensity]}</i> ` : ''}${x.label}<small>${x.chapter + 1} · ${Math.round(x.start / 1000)} km</small></div>`;
      })
      .join('');
  }

  // ------------------------------------------------------------------ the weather at a click

  private buildWeather(body: HTMLElement): void {
    const tools = this.host.devTools;
    const head = document.createElement('div');
    head.innerHTML = `<h5>一键换天气</h5>
<div class="btns three wx"><button data-wx="auto" data-tip="<b>跟随天气预报</b><br>不再强制，回到游戏自己的天气变化（同一个种子、同一时刻，大家看到的天气一样）。">跟随天气预报</button>${tools.weatherKinds.map((k) => `<button data-wx="${k.id}" data-tip="<b>${k.zh}</b><br>${WX_HELP[k.id]}">${k.zh}</button>`).join('')}</div>
<div class="dial stage" data-tip="<b>天气阶段</b><br>每场坏天气都分三幕：先酝酿（云压过来、风变大），然后最猛，最后雨过天晴（路面湿、可能有彩虹）。拖动它看任何一个阶段。只有选了上面某种天气才有用。"><div class="top"><span class="lb">天气阶段</span><span class="val stageText"></span><b class="rs stageReset" title="回到最猛">↺</b></div><input type="range" class="stageSlider" min="0" max="3" step="0.01" value="1.5"></div>
<div class="btns" style="margin-top:6px"><button data-act="strike" data-tip="马上劈一道闪电（打雷要过一两秒才听到）。">劈一道闪电</button></div>`;
    body.appendChild(head);
    this.wxButtons = head.querySelector('.wx');
    this.stageSlider = head.querySelector('.stageSlider');
    this.stageText = head.querySelector('.stageText');
    head.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (b?.dataset.wx) tools.setWeather(b.dataset.wx === 'auto' ? null : (b.dataset.wx as WeatherKind));
      if (b?.dataset.act === 'strike') tools.strike();
      if ((e.target as HTMLElement).classList.contains('stageReset')) tools.setStage(null);
      this.tick();
    });
    this.stageSlider!.addEventListener('input', () => {
      tools.setStage(Number(this.stageSlider!.value));
      this.tick();
    });
  }

  // ------------------------------------------------------------------ the hour

  private buildTime(body: HTMLElement): void {
    const tools = this.host.devTools;
    const head = document.createElement('div');
    head.innerHTML = `<h5>现在几点</h5><div class="big hourBig"></div>
<div class="dial" data-tip="<b>时刻</b><br>拖动直接改成一天里的任何时间，天色、太阳、影子、灯光马上跟着变。"><input type="range" class="hourSlider" min="0" max="24" step="0.0167"></div>
<div class="btns three hours">${HOURS.map(([zh, h]) => `<button data-h="${h}">${zh} ${DevWorld.hourText(h)}</button>`).join('')}</div>
<h5>时间流速</h5>
<div class="dial" data-tip="<b>时间流速</b><br>时间过得多快。拖到最左是「暂停」（天色定住不动，方便看）；1× 是正常速度；往右最快 300 倍，几秒钟看完一整天。"><div class="top"><span class="lb">流速</span><span class="val speedText"></span></div><input type="range" class="speedSlider" min="0" max="100" step="1"></div>
<div class="btns"><button data-sp="0">暂停</button><button data-sp="1">正常 1×</button><button data-sp="10">10×</button><button data-sp="60">60×</button><button data-sp="300">300×</button></div>`;
    body.appendChild(head);
    this.hourSlider = head.querySelector('.hourSlider');
    this.hourBig = head.querySelector('.hourBig');
    this.speedSlider = head.querySelector('.speedSlider');
    this.speedText = head.querySelector('.speedText');
    const hs = this.hourSlider!;
    hs.addEventListener('pointerdown', () => (this.dragHour = true));
    hs.addEventListener('pointerup', () => (this.dragHour = false));
    hs.addEventListener('input', () => {
      tools.setHour(Number(hs.value));
      this.tick();
    });
    this.speedSlider!.addEventListener('input', () => {
      tools.timeSpeed = speedOf(Number(this.speedSlider!.value));
      this.tick();
    });
    head.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (b?.dataset.h) tools.setHour(Number(b.dataset.h));
      if (b?.dataset.sp) tools.timeSpeed = Number(b.dataset.sp);
      this.tick();
    });
  }

  // ------------------------------------------------------------------ the terrain: which country's dials

  private buildTerrainHead(body: HTMLElement): void {
    const tools = this.host.devTools;
    this.terrainBiome = tools.biomeHere;
    const head = document.createElement('div');
    head.innerHTML = `<div class="note">这里的参数决定世界怎么生成。改完点下面的「重新生成世界」，页面会刷新，世界照新参数重新生成，你会回到路上同一个位置（坐着同一辆车）。</div>
<div class="btns" style="margin-bottom:4px"><button class="go" data-act="regen" data-tip="照现在的地形参数把世界重新生成一遍。页面会刷新，回到路上同一个位置。">重新生成世界（刷新页面）</button></div>
<h5>调哪种地形</h5><div class="btns three biomes">${BIOMES.map((b) => `<button data-b="${b.id}">${b.label}</button>`).join('')}</div>`;
    body.appendChild(head);
    head.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (b?.dataset.act === 'regen') tools.regenerate(false, 'terrain');
      if (b?.dataset.b) {
        this.terrainBiome = b.dataset.b;
        this.markBiome(head);
        const holder = body.querySelector('.dials') as HTMLElement | null;
        if (holder) this.fillDials('terrain', holder);
      }
    });
    this.markBiome(head);
  }

  private markBiome(head: HTMLElement): void {
    const here = this.host.devTools.biomeHere;
    for (const b of head.querySelectorAll<HTMLButtonElement>('.biomes button')) {
      b.classList.toggle('on', b.dataset.b === this.terrainBiome);
      const label = BIOMES.find((x) => x.id === b.dataset.b)?.label ?? '';
      b.textContent = b.dataset.b === here ? `${label}（这里）` : label;
    }
  }

  // ------------------------------------------------------------------ kept up to date while it shows

  /** the live bits (where, the hour, the weather) brought up to date */
  tick(): void {
    const tools = this.host.devTools;
    if (this.whereEl) this.whereEl.textContent = tools.where();
    // (the journey is drawn once for where one is, and again when one has come into the next region)
    if (this.journeyEl && tools.chapterHere !== this.journeyFrom) {
      this.journeyFrom = tools.chapterHere;
      this.drawJourney(tools.journey(JOURNEY_SHOWN));
    }
    if (this.hourBig) this.hourBig.innerHTML = `${DevWorld.hourText(tools.hour)}<small>${tools.timeSpeed === 0 ? '时间暂停' : tools.timeSpeed === 1 ? '正常流速' : `${tools.timeSpeed}× 流速`}</small>`;
    if (this.hourSlider && !this.dragHour) this.hourSlider.value = String(tools.hour);
    if (this.speedSlider) this.speedSlider.value = String(posOf(tools.timeSpeed));
    if (this.speedText) this.speedText.textContent = tools.timeSpeed === 0 ? '暂停' : `${tools.timeSpeed}×`;
    if (this.wxButtons) {
      const f = tools.forced;
      for (const b of this.wxButtons.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.wx === (f ?? 'auto'));
    }
    if (this.stageSlider && this.stageText) {
      const st = tools.stage;
      const f = tools.forced;
      this.stageSlider.disabled = !f || f === 'clear' || f === 'cloudy';
      if (document.activeElement !== this.stageSlider) this.stageSlider.value = String(st ?? 1.5);
      const v = st ?? 1.5;
      this.stageText.textContent = !f ? '跟随预报' : st === null ? '最猛' : v < 1 ? `正在变坏 ${Math.round(v * 100)}%` : v < 2 ? '最猛' : `正在转好 ${Math.round((v - 2) * 100)}%`;
    }
  }

  /** how many dials of a tab have been moved */
  movedIn(tab: DialTab): number {
    return this.host.tune.changed(tab).length;
  }

  dispose(): void {
    this.tip.dispose();
  }
}

const WX_HELP: Record<WeatherKind, string> = {
  clear: '万里无云的大晴天。',
  cloudy: '天上飘着几朵大白云。',
  overcast: '整片灰云压着，没有太阳。',
  fog: '大雾，远处什么都看不清。',
  rain: '一场中等的雨，有风。',
  storm: '雷暴雨：大雨、大风、闪电打雷。',
  hail: '冰雹：一阵一阵砸下来，伴着雨和雷。',
  snow: '安静的下雪天。',
  blizzard: '暴风雪：大雪横飞、几乎看不见路。',
  sandstorm: '沙尘暴：黄沙满天、风很大（在沙漠里最像样）。',
  cloudburst: '骤雨：雨林里的太阳雨，雨极大但天还亮，雨后地面冒水汽、出彩虹。',
  monsoon: '季风大雨：乌云压顶，大雨下很久，雾气重。',
  drizzle: '毛毛雨：细雨加薄雾，没有风。',
  squall: '飑线：海边先来大风，雨一阵一阵横着扫，很快过去。',
  seafog: '海雾：贴地的一堵浓雾，头顶还有太阳。',
  dusthaze: '浮尘：干旱地区空气发黄，没有沙墙。',
  flurries: '阵雪：半晴的天上飘一阵一阵的雪。',
  thundery: '干雷暴：乌云、大风、闪电，雨几乎落不到地上。',
};

/** copy to the clipboard; false when the page may not */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // (an older way, for a page not allowed the clipboard)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
