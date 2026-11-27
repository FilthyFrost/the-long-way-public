/**
 * The game's main menu (docs/V3/plan/growth.md 定案 7, J5): over the game as the page opens — 继续游戏 (with a save:
 * its day, where and how hard), 新游戏 (the three difficulties to choose from, the save's end said when there is
 * one), 设置 (the volume, the mouse, the picture, the assists), 按键 — and again as a pause when the mouse is let
 * go in play (Esc). The game stands still behind it.
 *
 * Plain DOM over the HUD, in the HUD's look (ui.ts: Arctic Drive's dark smoky glass in the cartoon frame): a column
 * down the left over the game's picture, darkened towards it.
 */
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '../../core/modcar/difficulty';
import { css, HELMETS, SKINS } from '../character/looks';
import type { Settings } from './settings';
import { SLOTS, type SlotMeta } from './slots';
import { HELP } from './ui';

export type MenuMode = 'title' | 'pause';
type Page = 'main' | 'new' | 'load' | 'settings' | 'keys' | 'credits';

/** what a new game is begun with besides its difficulty (docs/V3/plan/finish.md §十四: 选存档位 → 捏人 → 难度 → 旅程编号) */
export interface NewGame {
  /** the place it is kept in (0 … 2) */
  slot: number;
  /** how she looks (character/looks.ts) */
  skin: number;
  helmet: number;
  /** the journey's number: the same number is the same road (null: one drawn by chance) */
  seed: number | null;
}

/** a place for a game, as its card shows it */
export interface SlotCard {
  i: number;
  /** the one the page goes on with */
  active: boolean;
  /** a game is kept in it */
  has: boolean;
  meta: SlotMeta | null;
}

/** what the menu asks of the game */
export interface MenuHost {
  /** is there a game to go on with (a save read, or a game being played: the pause) */
  canResume(): boolean;
  /** the line under 继续游戏: the day, where, the difficulty */
  resumeLine(): string;
  /** back to the game (the menu shut by then) */
  resume(): void;
  /** a new game at that difficulty (and, from the new game's card: in which place, how she looks, the journey's number) */
  begin(d: Difficulty, o?: NewGame): void;
  /** the three places for a game */
  slots?(): SlotCard[];
  /** go on with the game kept in a place (the page opens again on it) */
  loadSlot?(i: number): void;
  deleteSlot?(i: number): void;
  /** a place's game handed to the browser as a file */
  exportSlot?(i: number): void;
  /** a file's text put into a place as its game: null when it went in, else why not */
  importSlot?(i: number, text: string): string | null;
  /** the pause: the game kept, and back to the title */
  toTitle?(): void;
  isFullscreen?(): boolean;
  toggleFullscreen?(): void;
  /** does a new game end one there is (a save, a game in play) */
  endsGame(): boolean;
  settings(): Settings;
  setSettings(s: Settings): void;
  /** the assists' names and whether each is on (assists.ts) */
  assists(): { label: string; on: boolean }[];
  toggleAssist(i: number): void;
  /** the pause's ways out when one cannot go on (docs/V3/plan/finish.md §四.2): is there a car to put back on the road, a place one slept to go back to */
  unstick?(): { car: boolean; bed: boolean };
  unstickCar?(): void;
  backToBed?(): void;
}

const CSS = `
.mc-ui.mc-menu-on > :not(.mc-menu) { visibility: hidden !important; }
.mc-menu { position: absolute; z-index: 8; inset: 0; pointer-events: auto; display: flex; align-items: stretch; user-select: none;
  background: linear-gradient(90deg, rgba(14,12,10,0.86) 0, rgba(14,12,10,0.62) 34%, rgba(14,12,10,0.18) 62%, rgba(14,12,10,0.05)); }
.mc-menu.pause { background: rgba(14,12,10,0.55); }
.mc-menu .col { width: 400px; padding: 64px 0 40px 76px; display: flex; flex-direction: column; }
.mc-menu .logo { font-size: 54px; font-weight: 800; letter-spacing: 0.12em; line-height: 1.05; text-shadow: 0 3px 0 rgba(10,8,6,0.6), 0 0 18px rgba(0,0,0,0.5); }
.mc-menu .logo i { display: block; width: 210px; height: 3px; margin: 12px 0 10px; background: linear-gradient(90deg, var(--gold), transparent); }
.mc-menu .tag { color: #efe7d4; font-size: 16px; letter-spacing: 0.2em; text-shadow: var(--say-shadow); margin-bottom: 46px; }
.mc-menu .btn { position: relative; display: block; box-sizing: border-box; width: 300px; margin: 0 0 14px; padding: 13px 22px 13px; text-align: left; cursor: pointer;
  font: 700 21px/1.2 "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; color: #fff; transition: transform 0.12s; }
.mc-menu .btn small { display: block; margin-top: 4px; font-size: 13px; font-weight: 400; color: var(--tx-2); }
.mc-menu .btn:hover, .mc-menu .btn.sel { transform: translateX(6px); border-color: var(--gold); }
.mc-menu .btn:hover::before, .mc-menu .btn.sel::before { content: ''; position: absolute; left: -16px; top: 50%; margin-top: -6px; border: 6px solid transparent; border-left: 8px solid var(--gold); }
.mc-menu .btn.small { width: 300px; margin-bottom: 10px; padding: 9px 22px; font-size: 16px; font-weight: 600; }
.mc-menu .out { margin: 22px 0 10px; color: var(--tx-2); font-size: 13px; letter-spacing: 0.2em; text-shadow: var(--say-shadow); }
.mc-menu .btn.main { background: var(--grain), var(--smoke), linear-gradient(180deg, rgba(62,48,26,0.95), rgba(44,34,20,0.92)); }
.mc-menu .page { flex: 1; display: flex; align-items: center; padding: 0 60px 0 10px; }
.mc-menu .card { width: min(720px, 100%); padding: 22px 28px 20px; }
.mc-menu .card h3 { margin: 0 0 4px; font-size: 26px; }
.mc-menu .card .lead { color: var(--tx-2); font-size: 14px; margin-bottom: 16px; }
.mc-menu .diffs { display: flex; gap: 14px; }
.mc-menu .diff { flex: 1; padding: 16px 16px 14px; cursor: pointer; border-radius: 12px; background: rgba(255,255,255,0.05); border: 2.5px solid rgba(239,230,211,0.25); }
.mc-menu .diff b { display: block; font-size: 24px; margin-bottom: 6px; }
.mc-menu .diff span { display: block; color: var(--tx-2); font-size: 14px; line-height: 1.5; min-height: 42px; }
.mc-menu .diff ul { margin: 10px 0 0; padding-left: 18px; color: #e6e2da; font-size: 13px; line-height: 1.6; }
.mc-menu .diff:hover { border-color: rgba(233,193,74,0.6); }
.mc-menu .diff.on { border-color: var(--gold); background: rgba(233,193,74,0.12); box-shadow: 0 0 0 2px var(--ink); }
.mc-menu .warn { margin-top: 14px; color: #ffb3a8; font-size: 14px; }
.mc-menu .row { display: flex; align-items: center; gap: 14px; padding: 7px 0; border-bottom: 1px solid var(--rule); font-size: 15px; }
.mc-menu .row.as label { flex: 1; width: auto; }
.mc-menu .row:last-child { border-bottom: 0; }
.mc-menu .row label { width: 150px; flex: none; color: #ece9e3; }
.mc-menu .row input[type=range] { flex: 1; accent-color: #e9c14a; }
.mc-menu .row .val { width: 54px; text-align: right; color: var(--tx-2); font-variant-numeric: tabular-nums; }
.mc-menu .seg { display: flex; gap: 6px; }
.mc-menu .seg span, .mc-menu .tog { padding: 3px 14px; border-radius: 999px; cursor: pointer; background: rgba(255,255,255,0.09); color: var(--tx-3); font-size: 14px; font-weight: 700; }
.mc-menu .seg span.on, .mc-menu .tog.on { background: #f2efe8; color: var(--ink); }
.mc-menu .tog { min-width: 22px; text-align: center; }
.mc-menu h5 { margin: 14px 0 2px; font-size: 13.5px; font-weight: 400; color: var(--tx-2); }
.mc-menu .acts { display: flex; gap: 12px; margin-top: 18px; }
.mc-menu .acts .btn { width: auto; min-width: 140px; margin: 0; text-align: center; }
.mc-menu .acts .btn:hover { transform: translateY(-2px); }
.mc-menu .acts .btn:hover::before { display: none; }
.mc-menu .keys { width: min(660px, 100%); padding: 16px 22px 14px; font-size: 14.5px; line-height: 1.55; }
.mc-menu .keys h3 { margin: 0 0 3px; font-size: 21px; }
.mc-menu .keys h5 { margin: 12px 0 4px; padding-bottom: 5px; border-bottom: 1px solid var(--rule); }
.mc-menu .keys table { width: 100%; border-collapse: collapse; }
.mc-menu .keys td { padding: 3px 0; vertical-align: top; }
.mc-menu .keys td.k { width: 172px; white-space: nowrap; font-weight: 700; }
.mc-menu .keys td.v { color: #ece9e3; }
.mc-menu .keys td.k b, .mc-menu .keys .foot b { display: inline-flex; align-items: center; justify-content: center; min-width: 23px; height: 23px; margin-right: 3px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; background: #f6f2ea; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); font: 700 13px/1 var(--key-font); vertical-align: middle; }
.mc-menu .keys .foot { display: none; }
.mc-menu .card.new { width: min(760px, 100%); padding: 16px 26px 16px; }
.mc-menu .card.new h3 { font-size: 22px; }
.mc-menu .card.new .lead { margin-bottom: 8px; }
.mc-menu .sec { margin: 9px 0 5px; color: var(--tx-2); font-size: 13px; letter-spacing: 0.16em; }
.mc-menu .places { display: flex; gap: 10px; }
.mc-menu .place { flex: 1; padding: 7px 12px 8px; cursor: pointer; border-radius: 10px; background: rgba(255,255,255,0.05); border: 2px solid rgba(239,230,211,0.25); font-size: 13px; line-height: 1.45; color: var(--tx-2); }
.mc-menu .place b { display: block; font-size: 16px; color: #fff; }
.mc-menu .place.on { border-color: var(--gold); background: rgba(233,193,74,0.12); }
.mc-menu .who { display: flex; gap: 18px; align-items: center; }
.mc-menu .who svg { flex: none; width: 92px; height: 92px; border-radius: 12px; background: rgba(255,255,255,0.06); }
.mc-menu .who .opts { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.mc-menu .sw { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--tx-2); }
.mc-menu .sw label { width: 44px; flex: none; color: #ece9e3; font-size: 14px; }
.mc-menu .sw span { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; box-sizing: border-box; border: 2.5px solid rgba(10,8,6,0.7); box-shadow: 0 0 0 1.5px rgba(239,230,211,0.3); }
.mc-menu .sw span.hel { border-radius: 9px 9px 6px 6px; position: relative; overflow: hidden; }
.mc-menu .sw span.hel i { position: absolute; left: 50%; top: 0; bottom: 0; width: 7px; margin-left: -3.5px; }
.mc-menu .sw span.on { box-shadow: 0 0 0 2.5px var(--gold); }
.mc-menu .sw em { font-style: normal; margin-left: 6px; }
.mc-menu .card.new .diff { padding: 9px 13px 8px; }
.mc-menu .card.new .diff b { font-size: 19px; margin-bottom: 2px; }
.mc-menu .card.new .diff span { min-height: 0; font-size: 13px; }
.mc-menu .card.new .diff ul { margin-top: 5px; font-size: 12.5px; line-height: 1.5; }
.mc-menu .trip { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.mc-menu .trip input { width: 150px; padding: 5px 10px; border-radius: 8px; border: 2px solid rgba(239,230,211,0.3); background: rgba(0,0,0,0.35); color: #fff; font: 700 16px/1.2 ui-monospace, Consolas, monospace; letter-spacing: 0.08em; }
.mc-menu .trip span { color: var(--tx-2); font-size: 13px; }
.mc-menu .games { display: flex; flex-direction: column; gap: 12px; }
.mc-menu .game { display: flex; gap: 14px; align-items: stretch; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 2px solid rgba(239,230,211,0.22); }
.mc-menu .game.on { border-color: var(--gold); }
.mc-menu .game .pic { flex: none; width: 176px; height: 99px; border-radius: 8px; background: rgba(0,0,0,0.4) center/cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--tx-3); font-size: 13px; }
.mc-menu .game .txt { flex: 1; display: flex; flex-direction: column; justify-content: center; font-size: 14px; line-height: 1.6; color: var(--tx-2); }
.mc-menu .game .txt b { font-size: 19px; color: #fff; }
.mc-menu .game .do { flex: none; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.mc-menu .game .do span { padding: 4px 14px; border-radius: 999px; cursor: pointer; text-align: center; background: rgba(255,255,255,0.09); color: #ece9e3; font-size: 13.5px; font-weight: 700; white-space: nowrap; }
.mc-menu .game .do span.go { background: #f2efe8; color: var(--ink); }
.mc-menu .game .do span.del.armed { background: #c9796a; color: #fff; }
.mc-menu .game .do span:hover { filter: brightness(1.15); }
.mc-menu .note { margin-top: 12px; min-height: 20px; color: #ffd9a8; font-size: 14px; }
.mc-menu .credits { width: min(680px, 100%); padding: 18px 26px 16px; font-size: 14px; line-height: 1.7; color: #ece9e3; }
.mc-menu .credits h3 { margin: 0 0 6px; font-size: 24px; }
.mc-menu .credits h5 { margin: 12px 0 2px; }
.mc-menu .credits p { margin: 2px 0; color: var(--tx-2); }
`;

/** the lines under each difficulty's name on the new game's card: what it changes, in a few words */
const POINTS: Record<Difficulty, string[]> = {
  easy: ['饿和渴慢三成', '路上吃的、油和药多四成', '车坏得慢'],
  normal: ['饿、渴、冷照常', '第一次玩选这个'],
  hard: ['饿和渴快三成半，冷得更快', '饿了、渴了、冻着了掉血多一半', '路上东西少三成，车坏得快'],
};

export class MainMenu {
  private readonly el: HTMLDivElement;
  private mode: MenuMode = 'title';
  private page: Page = 'main';
  private pick: Difficulty = 'normal';
  private openNow = false;
  /** the new game's card: the place chosen (−1: none yet — the first empty one, else the one gone on with), her look, the journey's number as typed */
  private slot = -1;
  private skin = 0;
  private helmet = 0;
  private trip = '';
  /** the page of kept games: the place whose 删除 was pressed once (pressed again it is emptied), the last thing said, the place a file is being read into */
  private armed = -1;
  private note = '';
  private into = -1;
  private readonly file: HTMLInputElement;

  constructor(
    root: HTMLElement,
    private readonly host: MenuHost,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'mc-menu';
    this.el.style.display = 'none';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
    // (a game read in from a file: the browser's own chooser, asked for by the page of kept games)
    this.file = document.createElement('input');
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.file.style.display = 'none';
    root.appendChild(this.file);
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      const i = this.into;
      this.file.value = '';
      if (!f || i < 0) return;
      void f.text().then((text) => {
        const why = this.host.importSlot?.(i, text) ?? '读不进来';
        this.note = why ?? `读进了第 ${i + 1} 个存档位`;
        if (this.page === 'load') this.show('load');
      });
    });
    window.addEventListener('keydown', (e) => {
      if (!this.openNow) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.page !== 'main') this.show('main');
        else if (this.mode === 'pause') this.resume();
      } else if (e.key === 'Enter' && this.page === 'new') {
        e.preventDefault();
        this.start();
      }
    }, true);
  }

  get isOpen(): boolean {
    return this.openNow;
  }

  get modeNow(): MenuMode {
    return this.mode;
  }

  get pageNow(): Page {
    return this.page;
  }

  /** open on its first page: the title as the page opens, the pause in play */
  open(mode: MenuMode): void {
    this.mode = mode;
    this.openNow = true;
    this.el.style.display = '';
    this.el.parentElement?.classList.add('mc-menu-on');
    this.el.classList.toggle('pause', mode === 'pause');
    this.show('main');
  }

  close(): void {
    this.openNow = false;
    this.el.style.display = 'none';
    this.el.parentElement?.classList.remove('mc-menu-on');
  }

  /** (the test hook's and the buttons') to a page */
  show(page: Page): void {
    if (page !== this.page) {
      this.armed = -1;
      if (page !== 'load') this.note = '';
    }
    this.page = page;
    if (page === 'new') {
      this.pick = this.pick ?? 'normal';
      // (the place a new game goes into unless another is chosen: the first with nothing in it, else the one gone on with)
      if (this.slot < 0) {
        const all = this.host.slots?.() ?? [];
        this.slot = (all.find((c) => !c.has) ?? all.find((c) => c.active) ?? { i: 0 }).i;
      }
    }
    this.el.innerHTML = this.column() + `<div class="page">${this.pageHtml()}</div>`;
  }

  /** a difficulty picked on the new game's card (the test hook's too) */
  choose(d: Difficulty): void {
    this.pick = d;
    if (this.page === 'new') this.show('new');
  }

  private resume(): void {
    this.close();
    this.host.resume();
  }

  /** the new game's card as it stands, begun (the journey's number: digits typed, else one drawn by chance) */
  private start(): void {
    const n = Number(this.trip.replace(/\D/g, '').slice(0, 9));
    this.host.begin(this.pick, { slot: Math.max(0, this.slot), skin: this.skin, helmet: this.helmet, seed: n > 0 ? n : null });
  }

  /** (the test hook's) the new game's card set: which place, how she looks, the journey's number */
  setNew(o: Partial<NewGame>): void {
    if (o.slot !== undefined) this.slot = o.slot;
    if (o.skin !== undefined) this.skin = o.skin;
    if (o.helmet !== undefined) this.helmet = o.helmet;
    if (o.seed !== undefined) this.trip = o.seed ? String(o.seed) : '';
    if (this.page === 'new') this.show('new');
  }

  private column(): string {
    const h = this.host;
    const sel = (p: Page): string => (this.page === p ? ' sel' : '');
    const cont = h.canResume() ? `<div class="btn mc-frame main" data-act="resume">${this.mode === 'pause' ? '继续' : `继续游戏<small>${h.resumeLine()}</small>`}</div>` : '';
    return (
      `<div class="col"><div class="logo">${this.mode === 'pause' ? '暂停' : '公路旅行'}<i></i></div>` +
      `<div class="tag">${this.mode === 'pause' ? h.resumeLine() : '从一副车架开始'}</div>` +
      cont +
      // (paused: the game kept and back to the title — a new game, another kept game are there)
      (this.mode === 'pause' && h.toTitle
        ? '<div class="btn mc-frame" data-act="title">存档并回主界面</div>'
        : `<div class="btn mc-frame${h.canResume() ? '' : ' main'}${sel('new')}" data-act="new">新游戏</div>` + (h.slots ? `<div class="btn mc-frame${sel('load')}" data-act="load">读取</div>` : '')) +
      `<div class="btn mc-frame${sel('settings')}" data-act="settings">设置</div>` +
      `<div class="btn mc-frame${sel('keys')}" data-act="keys">按键</div>` +
      (this.mode === 'title' ? `<div class="btn mc-frame small${sel('credits')}" data-act="credits">制作人员</div>` : '') +
      this.wayOut() +
      '</div>'
    );
  }

  /** paused in a game: the two ways out when one cannot go on — the car put back on the road, back to where one last slept */
  private wayOut(): string {
    const u = this.mode === 'pause' ? this.host.unstick?.() : undefined;
    if (!u || (!u.car && !u.bed)) return '';
    return (
      '<div class="out">走不了了？</div>' +
      (u.car ? '<div class="btn mc-frame small" data-act="unstick">把车放回路上</div>' : '') +
      (u.bed ? '<div class="btn mc-frame small" data-act="bed">回到上次睡觉的地方</div>' : '')
    );
  }

  private pageHtml(): string {
    if (this.page === 'new') {
      const cards = DIFFICULTIES.map((d) => {
        const def = DIFFICULTY[d];
        return `<div class="diff${this.pick === d ? ' on' : ''}" data-diff="${d}"><b>${def.name.zh}</b><span>${def.line.zh}</span><ul>${POINTS[d].map((p) => `<li>${p}</li>`).join('')}</ul></div>`;
      }).join('');
      const all = this.host.slots?.() ?? [];
      if (!all.length) {
        // (a game with one place for its save: the difficulty alone, as it was)
        const warn = this.host.endsGame() ? '<div class="warn">开始新游戏会清掉现在的存档。</div>' : '';
        return `<div class="card mc-frame"><h3>新游戏</h3><div class="lead">选个难度，开局以后就不能改了。</div><div class="diffs">${cards}</div>${warn}<div class="acts"><div class="btn mc-frame main" data-act="begin">开始</div><div class="btn mc-frame" data-act="main">返回</div></div></div>`;
      }
      const places = all
        .map((c) => `<div class="place${c.i === this.slot ? ' on' : ''}" data-place="${c.i}"><b>存档位 ${c.i + 1}</b>${c.has ? this.metaLine(c.meta) : '空的'}</div>`)
        .join('');
      const taken = all.find((c) => c.i === this.slot)?.has;
      const skins = SKINS.map((s, i) => `<span class="${i === this.skin ? 'on' : ''}" data-skin="${i}" title="${s.name}" style="background:${css(s.paint.lit)}"></span>`).join('');
      const helmets = HELMETS.map((h, i) => `<span class="hel${i === this.helmet ? ' on' : ''}" data-helmet="${i}" title="${h.name}" style="background:${css(h.shellLit)}"><i style="background:${css(h.stripe)}"></i></span>`).join('');
      return (
        `<div class="card new mc-frame"><h3>新游戏</h3><div class="lead">定下来就开始，难度和她的样子开局以后不能改。</div>` +
        `<div class="sec">存档位</div><div class="places">${places}</div>` +
        `<div class="sec">她</div><div class="who">${this.bust()}<div class="opts"><div class="sw"><label>肤色</label>${skins}<em>${SKINS[this.skin].name}</em></div><div class="sw"><label>头盔</label>${helmets}<em>${HELMETS[this.helmet].name}</em></div></div></div>` +
        `<div class="sec">难度</div><div class="diffs">${cards}</div>` +
        `<div class="sec">旅程编号</div><div class="trip"><input type="text" inputmode="numeric" maxlength="9" placeholder="随机" value="${this.trip}" data-text="trip"><span>不填就随机一条路；填同一个编号，走的是同一条路。</span></div>` +
        (taken ? '<div class="warn">这个存档位里现在的存档会被清掉。</div>' : '') +
        '<div class="acts"><div class="btn mc-frame main" data-act="begin">开始</div><div class="btn mc-frame" data-act="main">返回</div></div></div>'
      );
    }
    if (this.page === 'load') {
      const all = this.host.slots?.() ?? [];
      const rows = all
        .map((c) => {
          const pic = c.meta?.shot ? `<div class="pic" style="background-image:url('${c.meta.shot}')"></div>` : `<div class="pic">${c.has ? '没有画面' : '空的'}</div>`;
          const txt = c.has ? `<b>存档位 ${c.i + 1}${c.active ? ' · 现在这个' : ''}</b>${this.metaLine(c.meta)}<br>${c.meta ? this.metaMore(c.meta) : ''}` : `<b>存档位 ${c.i + 1}</b>空的`;
          const acts = c.has
            ? `<span class="go" data-load="${c.i}">${c.active ? '继续' : '读取'}</span><span data-exp="${c.i}">导出</span><span data-imp="${c.i}">导入</span><span class="del${this.armed === c.i ? ' armed' : ''}" data-del="${c.i}">${this.armed === c.i ? '再点一次删除' : '删除'}</span>`
            : `<span data-imp="${c.i}">导入</span>`;
          return `<div class="game${c.active ? ' on' : ''}">${pic}<div class="txt">${txt}</div><div class="do">${acts}</div></div>`;
        })
        .join('');
      return `<div class="card mc-frame"><h3>读取</h3><div class="lead">三个存档位。导出是把这一局存成一个文件，导入是从文件读回来。</div><div class="games">${rows}</div><div class="note">${this.note}</div><div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>`;
    }
    if (this.page === 'credits') {
      return (
        '<div class="credits mc-frame"><h3>制作人员</h3>' +
        '<h5>公路旅行 · The Long Way</h5><p>一个人，一副车架，一条一直往前的路。</p>' +
        '<h5>用了别人的东西</h5>' +
        '<p>画面的画法学自 Painted Valley（Patch，MIT 许可）；树、草、人物的一部分代码照着它写。</p>' +
        '<p>人物的动作：Quaternius 的 Universal Animation Library 1、2 和 Patch 的动作片段（CC0 1.0）。</p>' +
        '<p>发动机的声音用 Engine Simulator（Ange Yaghi，MIT 许可）录制；其余声音由游戏自己合成。</p>' +
        '<p>渲染：three.js（MIT 许可）。</p>' +
        '<p>完整的声明在游戏目录的 THIRD-PARTY-NOTICES.md 和 public/audio/LICENSES.md。</p>' +
        '<div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>'
      );
    }
    if (this.page === 'settings') {
      const s = this.host.settings();
      const seg = (key: string, opts: [string, string][], now: string): string => `<div class="seg">${opts.map(([v, t]) => `<span class="${v === now ? 'on' : ''}" data-set="${key}" data-val="${v}">${t}</span>`).join('')}</div>`;
      const assists = this.host
        .assists()
        .map((a, i) => `<div class="row as"><label>${a.label}</label><span class="tog${a.on ? ' on' : ''}" data-assist="${i}">${a.on ? '开' : '关'}</span></div>`)
        .join('');
      return (
        `<div class="card mc-frame"><h3>设置</h3>` +
        `<div class="row"><label>音量</label><input type="range" min="0" max="100" step="1" value="${Math.round(s.volume * 100)}" data-range="volume"><span class="val">${Math.round(s.volume * 100)}%</span></div>` +
        `<div class="row"><label>鼠标灵敏度</label><input type="range" min="40" max="250" step="5" value="${Math.round(s.look * 100)}" data-range="look"><span class="val">${Math.round(s.look * 100)}%</span></div>` +
        `<div class="row"><label>画质</label>${seg('quality', [['low', '低'], ['med', '中'], ['high', '高']], s.quality)}</div>` +
        `<div class="row"><label>视野</label><input type="range" min="-10" max="20" step="1" value="${Math.round(s.fov)}" data-range="fov"><span class="val">${s.fov > 0 ? '+' : ''}${Math.round(s.fov)}°</span></div>` +
        `<div class="row"><label>镜头晃动</label><input type="range" min="0" max="150" step="5" value="${Math.round(s.shake * 100)}" data-range="shake"><span class="val">${Math.round(s.shake * 100)}%</span></div>` +
        `<div class="row as"><label>鼠标上下反转</label><span class="tog${s.invertY ? ' on' : ''}" data-set="invertY">${s.invertY ? '开' : '关'}</span></div>` +
        (this.host.toggleFullscreen ? `<div class="row as"><label>全屏</label><span class="tog${this.host.isFullscreen?.() ? ' on' : ''}" data-set="fullscreen">${this.host.isFullscreen?.() ? '开' : '关'}</span></div>` : '') +
        `<h5>辅助</h5>${assists}` +
        `<div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>`
      );
    }
    if (this.page === 'keys') return `<div class="keys mc-frame">${HELP}<div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>`;
    return '';
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-act],[data-diff],[data-set],[data-assist],[data-place],[data-skin],[data-helmet],[data-load],[data-exp],[data-imp],[data-del]') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'resume') this.resume();
    else if (act === 'new' || act === 'settings' || act === 'keys' || act === 'main' || act === 'load' || act === 'credits') this.show(act);
    else if (act === 'begin') this.start();
    else if (act === 'title') this.host.toTitle?.();
    else if (t.dataset.place !== undefined) {
      this.slot = Number(t.dataset.place);
      this.show('new');
    } else if (t.dataset.skin !== undefined) {
      this.skin = Number(t.dataset.skin);
      this.show('new');
    } else if (t.dataset.helmet !== undefined) {
      this.helmet = Number(t.dataset.helmet);
      this.show('new');
    } else if (t.dataset.load !== undefined) this.host.loadSlot?.(Number(t.dataset.load));
    else if (t.dataset.exp !== undefined) {
      this.host.exportSlot?.(Number(t.dataset.exp));
      this.note = `第 ${Number(t.dataset.exp) + 1} 个存档位导出成了文件`;
      this.show('load');
    } else if (t.dataset.imp !== undefined) {
      this.into = Number(t.dataset.imp);
      this.file.click();
    } else if (t.dataset.del !== undefined) {
      const i = Number(t.dataset.del);
      if (this.armed === i) {
        this.host.deleteSlot?.(i);
        this.armed = -1;
        this.note = `第 ${i + 1} 个存档位清空了`;
      } else this.armed = i;
      this.show('load');
    } else if (t.dataset.set === 'invertY') {
      const s = this.host.settings();
      this.host.setSettings({ ...s, invertY: !s.invertY });
      this.show('settings');
    } else if (t.dataset.set === 'fullscreen') {
      this.host.toggleFullscreen?.();
      // (the browser takes a moment to go in or out)
      setTimeout(() => {
        if (this.openNow && this.page === 'settings') this.show('settings');
      }, 250);
    }
    else if (act === 'unstick' || act === 'bed') {
      // (back in the game first: what it does is seen)
      this.resume();
      if (act === 'unstick') this.host.unstickCar?.();
      else this.host.backToBed?.();
    }
    else if (t.dataset.diff) this.choose(t.dataset.diff as Difficulty);
    else if (t.dataset.set === 'quality') {
      const s = this.host.settings();
      const q = t.dataset.val as Settings['quality'];
      if (q !== s.quality) this.host.setSettings({ ...s, quality: q });
      this.show('settings');
    } else if (t.dataset.assist) {
      this.host.toggleAssist(Number(t.dataset.assist));
      this.show('settings');
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset.text === 'trip') {
      // (digits only, as typed: the card is not drawn again under the fingers)
      this.trip = t.value.replace(/\D/g, '').slice(0, 9);
      if (t.value !== this.trip) t.value = this.trip;
      return;
    }
    const key = t.dataset.range;
    if (!key) return;
    const s = this.host.settings();
    const val = t.parentElement?.querySelector('.val');
    if (key === 'fov') {
      const d = Number(t.value);
      this.host.setSettings({ ...s, fov: d });
      if (val) val.textContent = `${d > 0 ? '+' : ''}${d}°`;
      return;
    }
    const v = Number(t.value) / 100;
    this.host.setSettings(key === 'volume' ? { ...s, volume: v } : key === 'shake' ? { ...s, shake: v } : { ...s, look: v });
    if (val) val.textContent = `${Math.round(v * 100)}%`;
  }

  /** a kept game in a line: the day, how far, the car, how hard */
  private metaLine(m: SlotMeta | null): string {
    if (!m) return '有存档';
    return `第 ${m.day} 天 · ${m.km >= 10 ? Math.round(m.km) : m.km.toFixed(1)} km${m.car ? ` · ${m.car}` : ''}${m.difficulty ? ` · ${m.difficulty}` : ''}`;
  }

  /** … and under it: how long played, when it was last kept */
  private metaMore(m: SlotMeta): string {
    const h = Math.floor(m.minutes / 60);
    const played = m.minutes < 1 ? '' : `玩了 ${h > 0 ? `${h} 小时 ` : ''}${Math.round(m.minutes % 60)} 分钟 · `;
    const ago = Math.max(0, Math.round((Date.now() - m.at) / 60000));
    const when = ago < 1 ? '刚才' : ago < 60 ? `${ago} 分钟前` : ago < 1440 ? `${Math.floor(ago / 60)} 小时前` : `${Math.floor(ago / 1440)} 天前`;
    return `${played}${when}存的`;
  }

  /** her head and shoulders as chosen: the helmet's shell and stripe, her skin at the neck, her jacket (a drawing: the menu has no model of her) */
  private bust(): string {
    const skin = css(SKINS[this.skin].paint.lit);
    const shade = css(SKINS[this.skin].paint.shade);
    const h = HELMETS[this.helmet];
    return (
      '<svg viewBox="0 0 92 92">' +
      `<path d="M14 92 C16 70 30 64 46 64 C62 64 76 70 78 92 Z" fill="#2c3440" stroke="#0e0c0a" stroke-width="2.5"/>` +
      `<rect x="38" y="52" width="16" height="16" rx="5" fill="${shade}" stroke="#0e0c0a" stroke-width="2.5"/>` +
      `<path d="M22 38 C22 18 34 9 46 9 C58 9 70 18 70 38 L70 46 C70 54 62 58 46 58 C30 58 22 54 22 46 Z" fill="${css(h.shellLit)}" stroke="#0e0c0a" stroke-width="2.5"/>` +
      `<path d="M42 9.5 L50 9.5 L51 30 L41 30 Z" fill="${css(h.stripe)}"/>` +
      `<path d="M28 34 C28 30 34 28 46 28 C58 28 64 30 64 34 L64 44 C64 48 58 50 46 50 C34 50 28 48 28 44 Z" fill="#141a22" stroke="#0e0c0a" stroke-width="2"/>` +
      `<path d="M33 37 C36 34 44 33 52 34" stroke="rgba(255,255,255,0.35)" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
      `<circle cx="46" cy="60" r="0" fill="${skin}"/>` +
      '</svg>'
    );
  }
}
