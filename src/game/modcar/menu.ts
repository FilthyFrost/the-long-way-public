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
import type { Settings } from './settings';
import { HELP } from './ui';

export type MenuMode = 'title' | 'pause';
type Page = 'main' | 'new' | 'settings' | 'keys';

/** what the menu asks of the game */
export interface MenuHost {
  /** is there a game to go on with (a save read, or a game being played: the pause) */
  canResume(): boolean;
  /** the line under 继续游戏: the day, where, the difficulty */
  resumeLine(): string;
  /** back to the game (the menu shut by then) */
  resume(): void;
  /** a new game at that difficulty */
  begin(d: Difficulty): void;
  /** does a new game end one there is (a save, a game in play) */
  endsGame(): boolean;
  settings(): Settings;
  setSettings(s: Settings): void;
  /** the assists' names and whether each is on (assists.ts) */
  assists(): { label: string; on: boolean }[];
  toggleAssist(i: number): void;
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
    window.addEventListener('keydown', (e) => {
      if (!this.openNow) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.page !== 'main') this.show('main');
        else if (this.mode === 'pause') this.resume();
      } else if (e.key === 'Enter' && this.page === 'new') {
        e.preventDefault();
        this.host.begin(this.pick);
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
    this.page = page;
    if (page === 'new') this.pick = this.pick ?? 'normal';
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

  private column(): string {
    const h = this.host;
    const sel = (p: Page): string => (this.page === p ? ' sel' : '');
    const cont = h.canResume() ? `<div class="btn mc-frame main" data-act="resume">${this.mode === 'pause' ? '继续' : `继续游戏<small>${h.resumeLine()}</small>`}</div>` : '';
    return (
      `<div class="col"><div class="logo">${this.mode === 'pause' ? '暂停' : '公路旅行'}<i></i></div>` +
      `<div class="tag">${this.mode === 'pause' ? h.resumeLine() : '从一副车架开始'}</div>` +
      cont +
      `<div class="btn mc-frame${h.canResume() ? '' : ' main'}${sel('new')}" data-act="new">新游戏</div>` +
      `<div class="btn mc-frame${sel('settings')}" data-act="settings">设置</div>` +
      `<div class="btn mc-frame${sel('keys')}" data-act="keys">按键</div></div>`
    );
  }

  private pageHtml(): string {
    if (this.page === 'new') {
      const cards = DIFFICULTIES.map((d) => {
        const def = DIFFICULTY[d];
        return `<div class="diff${this.pick === d ? ' on' : ''}" data-diff="${d}"><b>${def.name.zh}</b><span>${def.line.zh}</span><ul>${POINTS[d].map((p) => `<li>${p}</li>`).join('')}</ul></div>`;
      }).join('');
      const warn = this.host.endsGame() ? '<div class="warn">开始新游戏会清掉现在的存档。</div>' : '';
      return `<div class="card mc-frame"><h3>新游戏</h3><div class="lead">选个难度，开局以后就不能改了。</div><div class="diffs">${cards}</div>${warn}<div class="acts"><div class="btn mc-frame main" data-act="begin">开始</div><div class="btn mc-frame" data-act="main">返回</div></div></div>`;
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
        `<h5>辅助</h5>${assists}` +
        `<div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>`
      );
    }
    if (this.page === 'keys') return `<div class="keys mc-frame">${HELP}<div class="acts"><div class="btn mc-frame" data-act="main">返回</div></div></div>`;
    return '';
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-act],[data-diff],[data-set],[data-assist]') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'resume') this.resume();
    else if (act === 'new' || act === 'settings' || act === 'keys' || act === 'main') this.show(act);
    else if (act === 'begin') this.host.begin(this.pick);
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
    const key = t.dataset.range;
    if (!key) return;
    const s = this.host.settings();
    const v = Number(t.value) / 100;
    this.host.setSettings(key === 'volume' ? { ...s, volume: v } : { ...s, look: v });
    const val = t.parentElement?.querySelector('.val');
    if (val) val.textContent = `${Math.round(v * 100)}%`;
  }
}
