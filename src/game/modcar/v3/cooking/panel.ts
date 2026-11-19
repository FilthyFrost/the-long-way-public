/**
 * The cooking panel (node C1): what is drawn of the session (session.ts) while the modal is open, in the
 * HUD's cartoon frame (ui.ts .mc-frame) on the right of the view, so that the fire and the pot stay in sight on
 * the left. From the top: the station and what the pot is (a recipe by its name once it is known, "？" until
 * it was cooked once, a pot of no recipe by the name it would go by), the ways of cooking on offer, the steps
 * this pot takes with the one under way lit, the portions in the pot, then the step itself — the ingredients
 * at hand to choose from, the knife's beat, the flame and the doneness in its five bands, the five tastes, the
 * wait, the plate, the dish that came out — and the keys at the foot.
 *
 * Drawn again only when what it says has changed (the session's count of changes, the phase, the flame, the
 * band …); the knife's marker, the doneness needle and the wait's bar move every frame by their style alone.
 */
import { freshNow, freshStage, itemName } from '../../../../core/modcar/items';
import { BUFFS } from '../../../../core/v3/cooking/buffs';
import { recipe as recipeById } from '../../../../core/v3/cooking/recipes';
import { band, METHOD_STEPS, potDone } from '../../../../core/v3/cooking/steps';
import { METHODS, POT_MAX } from '../../../../core/v3/cooking/types';
import { ingredient } from '../../../../core/v3/cooking/ingredients';
import type { GameContext } from '../../kernel/context';
import { progress } from '../progress/api';
import { BAND_NAME, COOK_DOMAIN, HEAT_NAME, PERK_TASTE, STATION_NAME, TASTES } from './content';
import { keptEnough, potItems } from './pot';
import type { StepId } from './session';
import type { Cooking, CookPanelView, Station } from './system';

const CSS = `
.mc-cook { position: absolute; right: 26px; top: 64px; width: 440px; max-height: calc(100% - 150px); display: flex; flex-direction: column; padding: 13px 16px 11px; pointer-events: auto; z-index: 6; color: #fff; }
.mc-cook .hd { padding-bottom: 7px; border-bottom: 1px solid var(--rule); }
.mc-cook .hd .st { font-size: 12.5px; color: var(--tx-2); }
.mc-cook .hd h3 { margin: 1px 0 0; font-size: 22px; font-weight: 800; line-height: 1.2; }
.mc-cook .hd h3 .q { color: var(--gold); }
.mc-cook .hd small { display: block; font-size: 12.5px; color: var(--tx-2); margin-top: 1px; }
.mc-cook .hd small.odd { color: #ffb0a6; }
.mc-cook .ways { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 2px; }
.mc-cook .ways span { padding: 2px 10px; border-radius: 999px; border: 2px solid rgba(239,230,211,0.4); font-size: 13px; font-weight: 700; color: var(--tx-2); }
.mc-cook .ways span.on { background: #f6f2ea; color: var(--ink); border-color: var(--ink); box-shadow: 0 2px 0 var(--ink); }
.mc-cook .steps { display: flex; align-items: center; gap: 4px; margin: 8px 0 6px; font-size: 13px; color: var(--tx-3); }
.mc-cook .steps span { padding: 1px 7px; border-radius: 7px; }
.mc-cook .steps span.done { color: var(--tx-2); }
.mc-cook .steps span.on { background: var(--gold); color: var(--ink); font-weight: 800; }
.mc-cook .steps i { font-style: normal; color: var(--tx-3); }
.mc-cook .pot { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-bottom: 8px; }
.mc-cook .pot div { height: 34px; border-radius: 9px; background: rgba(255,255,255,0.06); border: 1.5px dashed rgba(239,230,211,0.25); font-size: 11.5px; line-height: 1.15; padding: 2px 4px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; text-align: center; }
.mc-cook .pot div.f { background: rgba(239,230,211,0.14); border: 1.5px solid rgba(239,230,211,0.55); color: #fff; }
.mc-cook .body { flex: 1; min-height: 120px; overflow: hidden; border-top: 1px solid var(--rule); padding-top: 8px; }
.mc-cook .rows { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: hidden; }
.mc-cook .r { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 4px 8px; border-radius: 9px; font-size: 14.5px; }
.mc-cook .r small { color: var(--tx-2); font-size: 12px; }
.mc-cook .r.on { background: rgba(239,230,211,0.16); box-shadow: inset 0 0 0 2px var(--rim); }
.mc-cook .r.off { color: var(--tx-3); }
.mc-cook .r .s { color: var(--gold); font-size: 11px; letter-spacing: 1px; }
.mc-cook .none { padding: 16px 4px; color: var(--tx-2); font-size: 14px; text-align: center; line-height: 1.5; }
.mc-cook .lbl { font-size: 12.5px; color: var(--tx-2); margin: 2px 0 5px; display: flex; justify-content: space-between; }
.mc-cook .lbl b { color: #fff; font-size: 13.5px; }
.mc-cook .track { position: relative; height: 22px; border-radius: 11px; background: var(--track); overflow: hidden; margin-bottom: 8px; border: 2px solid var(--ink); }
.mc-cook .track .tg { position: absolute; left: 42%; width: 16%; top: 0; bottom: 0; background: rgba(169,239,154,0.45); }
.mc-cook .track .tg2 { position: absolute; left: 48%; width: 4%; top: 0; bottom: 0; background: rgba(169,239,154,0.8); }
.mc-cook .track .mk { position: absolute; top: -2px; bottom: -2px; width: 5px; margin-left: -2.5px; background: #fff; border-radius: 3px; box-shadow: 0 0 0 1.5px var(--ink); }
.mc-cook .done { height: 20px; display: flex; border-radius: 10px; overflow: hidden; border: 2px solid var(--ink); position: relative; margin-bottom: 4px; }
.mc-cook .done span { height: 100%; }
.mc-cook .done .nd { position: absolute; top: -3px; bottom: -3px; width: 4px; margin-left: -2px; background: #fff; box-shadow: 0 0 0 1.5px var(--ink); border-radius: 2px; }
.mc-cook .bands { display: flex; font-size: 11px; color: var(--tx-3); margin-bottom: 8px; }
.mc-cook .bands span { text-align: center; }
.mc-cook .big { font-size: 26px; font-weight: 800; text-align: center; margin: 2px 0 6px; text-shadow: var(--say-shadow); }
.mc-cook .flame { display: flex; align-items: center; gap: 6px; margin: 4px 0 8px; font-size: 13px; color: var(--tx-2); }
.mc-cook .flame i { width: 22px; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.1); border: 1.5px solid rgba(239,230,211,0.3); }
.mc-cook .flame i.on { background: #ff9a3c; border-color: var(--ink); box-shadow: 0 0 6px rgba(255,140,40,0.7); }
.mc-cook .flame b { color: #fff; margin-left: 4px; }
.mc-cook .note { font-size: 12.5px; color: var(--tx-2); line-height: 1.45; }
.mc-cook .note b { color: #fff; }
.mc-cook .wait { height: 8px; border-radius: 4px; background: var(--track); overflow: hidden; margin: 4px 0 8px; }
.mc-cook .wait i { display: block; height: 100%; background: #a9ef9a; width: 0; }
.mc-cook .tastes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 4px 0 8px; }
.mc-cook .tastes div { text-align: center; font-size: 13px; }
.mc-cook .tastes .col { position: relative; height: 70px; border-radius: 8px; background: var(--track); border: 2px solid var(--ink); overflow: hidden; margin: 3px auto 4px; width: 30px; }
.mc-cook .tastes .col i { position: absolute; left: 0; right: 0; bottom: 0; background: #e9c14a; }
.mc-cook .tastes .col u { position: absolute; left: -2px; right: -2px; height: 3px; background: #a9ef9a; box-shadow: 0 0 0 1px var(--ink); }
.mc-cook .tastes kbd, .mc-cook .ft kbd { display: inline-block; min-width: 16px; padding: 0 5px; border: 2px solid var(--ink); border-radius: 6px; background: #f6f2ea; color: var(--ink); font: 700 11.5px var(--key-font); text-align: center; }
.mc-cook .dish { text-align: center; padding: 6px 0 4px; }
.mc-cook .dish h4 { margin: 0; font-size: 23px; }
.mc-cook .dish .stars { color: var(--gold); letter-spacing: 3px; font-size: 16px; margin: 2px 0 6px; }
.mc-cook .dish .stars i { font-style: normal; color: rgba(255,255,255,0.22); }
.mc-cook .dish .gives { display: flex; justify-content: center; gap: 14px; font-size: 14px; margin-bottom: 6px; }
.mc-cook .dish .gives b { color: #a9ef9a; }
.mc-cook .ft { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--rule); font-size: 12.5px; color: var(--tx-2); }
`;

const STEP_NAME: Readonly<Record<StepId, string>> = { knife: '切', heat: '火候', season: '调味', wait: '等', keep: '晾 / 熏', plate: '装盘' };
/** the bands' colours along the doneness bar: raw, tender, just right, overdone, burnt */
const BAND_COL = ['#7f97a8', '#c9d97a', '#7fd36a', '#d9a04a', '#5a3b2a'];
/** the doneness bar reads from raw to this (a little past burnt) */
const D_MAX = 1.75;
const BAND_EDGES = [0, 0.5, 0.85, 1.15, 1.45, D_MAX];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const kbd = (k: string): string => `<kbd>${k}</kbd>`;

const PHASE_I: Readonly<Record<string, number>> = { pick: 0, knife: 1, heat: 2, season: 3, wait: 4, keep: 5, plate: 6 };
const METHOD_I: Readonly<Record<string, number>> = Object.fromEntries(Object.keys(METHODS).map((m, i) => [m, i]));

export class CookPanel implements CookPanelView {
  private readonly el: HTMLDivElement;
  private st: Station | null = null;
  /** what was drawn, as numbers; drawn again at once when `drawn` is set */
  private readonly sig = new Float64Array(8);
  private drawn = true;
  private lastDish: unknown = null;
  private mk: HTMLElement | null = null;
  private nd: HTMLElement | null = null;
  private wt: HTMLElement | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly c: Cooking,
  ) {
    if (!document.getElementById('mc-cook-css')) {
      const s = document.createElement('style');
      s.id = 'mc-cook-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'mc-cook mc-frame';
    this.el.style.display = 'none';
    ctx.ui.root.appendChild(this.el);
  }

  show(st: Station): void {
    this.st = st;
    this.drawn = true;
    this.el.style.display = '';
    this.update(0);
  }

  hide(): void {
    this.st = null;
    this.el.style.display = 'none';
  }

  dispose(): void {
    this.el.remove();
  }

  /** every frame while open: drawn again when what it says changed; the moving bits by their style */
  update(dt: number): void {
    void dt;
    const st = this.st;
    const se = this.c.session;
    const s = se.state;
    if (!st || !s) return;
    // (what it says, as numbers: compared one by one, nothing is built while nothing changed)
    const k = this.sig;
    let added = 0;
    for (let i = 0; i < 5; i++) added = added * 8 + Math.round(s.added[i] * 2);
    const v0 = se.rev;
    const v1 = PHASE_I[s.phase] * 64 + METHOD_I[s.method];
    const v2 = s.items.length * 1000 + s.heat * 100 + band(s.pot.d) * 10 + (s.auto ? 1 : 0) + (s.lit ? 2 : 0) + (s.pot.turned ? 4 : 0);
    const v3 = s.cuts.length * 10000 + se.sel;
    const v4 = Math.ceil(Math.max(0, METHOD_STEPS[s.method].waitS - s.pot.waited));
    const v5 = s.phase === 'keep' ? Math.ceil(Math.max(0, (METHOD_STEPS[s.method].keepH ?? 0) * 3600 - (this.ctx.clock.worldSeconds - s.keepFrom)) / 60) : 0;
    if (this.drawn || k[0] !== v0 || k[1] !== v1 || k[2] !== v2 || k[3] !== v3 || k[4] !== v4 || k[5] !== v5 || k[6] !== added || this.lastDish !== se.last) {
      this.drawn = false;
      k[0] = v0;
      k[1] = v1;
      k[2] = v2;
      k[3] = v3;
      k[4] = v4;
      k[5] = v5;
      k[6] = added;
      this.lastDish = se.last;
      this.draw(st);
    }
    // (the moving bits, in fifths of a per cent: written only when they moved)
    this.move(this.mk, 0, se.marker() * 100);
    this.move(this.nd, 1, (Math.min(D_MAX, s.pot.d) / D_MAX) * 100);
    this.move(this.wt, 2, Math.min(100, (100 * s.pot.waited) / Math.max(1, METHOD_STEPS[s.method].waitS)));
  }

  private readonly at = new Float64Array(3).fill(-1);

  private move(el: HTMLElement | null, i: number, pc: number): void {
    if (!el) return;
    const v = Math.round(pc * 5);
    if (v === this.at[i]) return;
    this.at[i] = v;
    if (i === 2) el.style.width = `${v / 5}%`;
    else el.style.left = `${v / 5}%`;
  }

  private draw(st: Station): void {
    const se = this.c.session;
    const s = se.state!;
    const now = this.ctx.clock.worldSeconds;
    const what = se.what();
    const showDish = !!se.last && s.phase === 'pick' && s.items.length === 0;
    // the head: the station, and what the pot is
    let title = '';
    let sub = '';
    let odd = false;
    if (showDish) {
      title = esc(se.last!.name.zh);
      sub = '装好盘了';
    } else if (!s.items.length) {
      title = s.phase === 'pick' ? '空锅' : '';
      sub = '选一种做法，往锅里放东西';
    } else if (what.recipe) {
      const known = progress.knowledge(COOK_DOMAIN, what.recipe.id) === 2;
      title = known ? esc(what.recipe.name.zh) : '<span class="q">？</span>';
      sub = known ? `菜谱 · 做过 ${this.c.cooked.get(what.recipe.id) ?? 0} 次` : '一道还没做过的菜谱：做一次就知道是什么了';
    } else {
      title = esc(what.name);
      odd = what.odd;
      sub = what.odd ? '不像一道菜：能吃，但没什么劲儿' : '随手一锅（不是菜谱：没有刀工和调味）';
    }
    const ways = s.phase === 'pick' && !showDish ? this.c.methodsAt(st) : [];
    const steps = se.steps();
    const cur: StepId | null = s.phase === 'pick' ? null : s.phase === 'heat' ? 'heat' : s.phase === 'wait' ? 'wait' : (s.phase as StepId);
    const at = cur ? steps.indexOf(cur) : -1;
    const stepRow = steps.map((id, i) => `<span class="${i === at ? 'on' : at >= 0 && i < at ? 'done' : ''}">${STEP_NAME[id]}</span>`).join('<i>›</i>');
    const pot: string[] = [];
    for (let i = 0; i < POT_MAX; i++) {
      const it = s.items[i];
      pot.push(it ? `<div class="f">${esc(itemName(it))}</div>` : '<div></div>');
    }
    let body = '';
    let keys = '';
    this.mk = null;
    this.nd = null;
    this.wt = null;
    if (showDish) {
      const d = se.last!;
      const stars = `${'★'.repeat(d.stars)}<i>${'★'.repeat(5 - d.stars)}</i>`;
      const gives = [`饱腹 <b>+${d.food}</b>`, ...(d.water ? [`解渴 <b>+${d.water}</b>`] : []), ...(d.hp > 0 ? [`生命 <b>+${d.hp}</b>`] : [])].join('');
      body = `<div class="dish"><h4>${esc(d.name.zh)}</h4><div class="stars">${stars}</div><div class="gives">${gives.replace(/<\/b>/g, '</b>&nbsp;')}</div><div class="note">${d.servings} 份，到手里了${d.buff ? ` · 吃完：<b>${BUFFS[d.buff].name.zh}</b> ${Math.round(d.buffS / 60)} 分钟` : ''}${d.odd ? ' · 说不清是什么，没有增益' : ''}</div></div>`;
      keys = `<span>${kbd('E')} 再做一锅</span><span>${kbd('Esc')} 离开</span>`;
    } else if (s.phase === 'pick') {
      const rows = se.rows;
      body = rows.length
        ? `<div class="rows">${rows
            .map((r, i) => {
              const fresh = r.item.fresh === undefined ? -1 : freshStage(freshNow(r.item, now));
              const ok = !!ingredient(r.item.item) && fresh < 3;
              const where = r.where === 'hand' ? '手上' : r.where === 'box' ? '篮子里' : '旁边';
              const fw = fresh === 2 ? ' · 快坏了' : fresh === 3 ? ' · 坏了' : '';
              return `<div class="r ${i === se.sel ? 'on' : ''} ${ok ? '' : 'off'}"><span>${esc(r.name)} <small>×${r.item.n ?? 1} · ${where}${fw}</small></span><span class="s">${'★'.repeat(r.item.q ?? 0)}</span><span></span></div>`;
            })
            .slice(Math.max(0, se.sel - 6), Math.max(0, se.sel - 6) + 9)
            .join('')}</div>`
        : '<div class="none">手边没有能下锅的东西。<br>快捷栏里、篮子里、旁边放着的冷藏箱和坛子里的都算。</div>';
      keys = `<span>${kbd('A')}${kbd('D')} 做法</span><span>${kbd('W')}${kbd('S')} 选</span><span>${kbd('E')} 放一份</span><span>${kbd('Q')} 拿出来</span><span>${kbd('Space')} 开始</span>${st.loose && !s.items.length ? `<span>${kbd('G')} 收起${STATION_NAME[st.kind].zh}</span>` : ''}`;
    } else if (s.phase === 'knife') {
      const last = se.lastCut < 0 ? '' : se.lastCut < 0.15 ? '正中！' : se.lastCut < 0.45 ? '还行' : '切歪了';
      body = `<div class="lbl"><span>在线中间按下去：切得匀，菜才好看</span><b>${se.cutsDone()} / ${se.cutsWanted()}</b></div><div class="track"><div class="tg"></div><div class="tg2"></div><div class="mk"></div></div><div class="big">${last}</div>`;
      keys = `<span>${kbd('Space')} 切</span>`;
    } else if (s.phase === 'keep') {
      const ready = keptEnough(s, now);
      const left = Math.max(0, (METHOD_STEPS[s.method].keepH ?? 0) * 3600 - (now - s.keepFrom));
      body = `<div class="big">${ready ? '好了' : `还要 ${(left / 3600).toFixed(1)} 小时`}</div><div class="note">${METHODS[s.method].name.zh}要游戏里的几个钟头。可以走开，回来再收。</div>`;
      keys = ready ? `<span>${kbd('E')} 收起来</span><span>${kbd('Esc')} 离开</span>` : `<span>${kbd('Esc')} 离开，过会儿再来</span>`;
    } else {
      // the flame, the doneness, and what the step under way asks
      const flame = s.lit ? `<div class="flame">${[1, 2, 3].map((h) => `<i class="${s.heat >= h ? 'on' : ''}"></i>`).join('')}<b>${HEAT_NAME[s.heat].zh}</b></div>` : '<div class="flame">离火了</div>';
      const bandsBar = BAND_COL.map((c, i) => `<span style="width:${(((BAND_EDGES[i + 1] - BAND_EDGES[i]) / D_MAX) * 100).toFixed(1)}%;background:${c}"></span>`).join('');
      const bandsTxt = BAND_NAME.map((n, i) => `<span style="width:${(((BAND_EDGES[i + 1] - BAND_EDGES[i]) / D_MAX) * 100).toFixed(1)}%">${n.zh}</span>`).join('');
      const b = band(s.pot.d);
      const heated = METHOD_STEPS[s.method].cookS > 0;
      const doneness = heated ? `<div class="done">${bandsBar}<div class="nd"></div></div><div class="bands">${bandsTxt}</div><div class="big">${BAND_NAME[b].zh}</div>` : '';
      if (s.phase === 'heat') {
        const m = METHOD_STEPS[s.method];
        const stir = m.stir === 'stir' ? `一直要翻炒（${kbd('Space')}），不然会糊` : m.stir === 'turn' ? (s.pot.turned ? '已经翻过面了' : `熟到一半记得翻面（${kbd('Space')}）`) : m.waitS > 0 ? '熟了就进入慢煮：火调小，等着就行' : '';
        body = `${doneness}${flame}<div class="note">${stir}</div>`;
        keys = `<span>${kbd('W')}${kbd('S')} / 滚轮 火力</span>${m.stir !== 'none' ? `<span>${kbd('Space')} ${m.stir === 'stir' ? '翻炒' : '翻面'}</span>` : ''}<span>${kbd('E')} 起锅</span>`;
      } else if (s.phase === 'wait' || (s.phase === 'plate' && s.lit)) {
        const done = potDone(s.pot);
        body = `${doneness}${flame}<div class="lbl"><span>${done ? '可以出锅了：小火能一直温着' : '慢慢煮着，可以走开，回来再装盘'}</span><b>${done ? '好了' : `${Math.ceil(Math.max(0, METHOD_STEPS[s.method].waitS - s.pot.waited))} 秒`}</b></div><div class="wait"><i></i></div>`;
        keys = `<span>${kbd('W')}${kbd('S')} 火力</span><span>${kbd('E')} ${done ? '装盘' : '早点出锅'}</span><span>${kbd('Esc')} 走开</span>`;
      } else if (s.phase === 'season') {
        const r = s.recipe ? recipeById(s.recipe) : null;
        const items = potItems(s, now);
        const have = [0, 0, 0, 0, 0];
        for (const p of items) {
          const i = ingredient(p.item);
          if (i) for (let k = 0; k < 5; k++) have[k] += i.taste[k];
        }
        const show = progress.hasPerk(PERK_TASTE) && !!r?.taste;
        const cols = TASTES.map((t, k) => {
          const lv = Math.min(3, have[k] / Math.max(1, items.length / 2) + s.added[k]);
          const target = show ? `<u style="bottom:${((r!.taste![k] / 3) * 100).toFixed(0)}%"></u>` : '';
          return `<div>${t.zh}<div class="col"><i style="height:${((lv / 3) * 100).toFixed(0)}%"></i>${target}</div>${kbd(t.label)}</div>`;
        }).join('');
        body = `${s.lit ? flame : ''}<div class="lbl"><span>${s.auto ? '自动调味：交给手感（七成）' : show ? '绿线是这道菜要的味道' : '尝一尝，按这道菜该有的味道加'}</span><b>${s.auto ? '自动' : ''}</b></div><div class="tastes">${cols}</div>`;
        keys = `<span>${TASTES.map((t) => kbd(t.label)).join('')} 加一撮</span><span>${kbd('R')} 自动调味</span><span>${kbd('E')} 调好了</span>`;
      } else {
        body = `${doneness}<div class="big">装盘</div>`;
        keys = `<span>${kbd('E')} 装盘</span>`;
      }
    }
    const waysRow = ways.length > 1 || (ways.length === 1 && s.phase === 'pick') ? `<div class="ways">${ways.map((m) => `<span class="${m === s.method ? 'on' : ''}">${METHODS[m].name.zh}</span>`).join('')}</div>` : '';
    this.el.innerHTML = `
      <div class="hd"><div class="st">${STATION_NAME[st.kind].zh} · ${METHODS[s.method].name.zh}</div><h3>${title}</h3><small class="${odd ? 'odd' : ''}">${sub}</small></div>
      ${waysRow}
      ${steps.length && !showDish ? `<div class="steps">${stepRow}</div>` : ''}
      ${showDish ? '' : `<div class="pot">${pot.join('')}</div>`}
      <div class="body">${body}</div>
      <div class="ft">${keys}${keys.includes('Esc') ? '' : `<span>${kbd('Esc')} 关上</span>`}</div>`;
    this.mk = this.el.querySelector('.track .mk');
    this.nd = this.el.querySelector('.done .nd');
    this.wt = this.el.querySelector('.wait i');
    this.at.fill(-1);
  }
}
