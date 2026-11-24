/**
 * The developer's panel (` — the key left of 1 — opens and shuts it). Its first tab is the parts bin, for
 * trying builds quickly: every part of the catalogue, the tools, and the four frames as they left the works or
 * bare, as tiles with a picture, by kind and searchable. Drag a tile out over the world and let go: the thing
 * lands there (the floor, a bench, a pickup's bed, a roof); a click puts it at one's feet. The other tabs
 * (devPanes.ts) send one to another kind of country and set the weather, the hour, the look and the terrain.
 * With the panel open the mouse is free: WASD still walks, a drag on the view turns it.
 *
 * The V3 systems add tabs of their own (kernel/devTabs.ts): they stand in a second row under these, which is
 * only there when there is one.
 */
import type * as THREE from 'three';
import { stockBuild } from '../../core/modcar/build';
import { CAT_LABEL, FRAMES } from '../../core/modcar/frames';
import { PALETTE, paintHex } from '../../core/modcar/palette';
import { SPRAY_TIERS, sprayColours } from '../../core/modcar/paint';
import { ITEM_CATS, ITEMS, itemCats, type ItemCat, type ItemDef } from '../../core/modcar/items';
import { PARTS } from '../../core/modcar/parts';
import { newTool, SCRAPERS, TOOL_INFO, toolName, type ToolKind } from '../../core/modcar/tools';
import { toolLook } from './loose';
import type { Category, PartDef } from '../../core/modcar/types';
import { panelPaint } from './assets';
import { LAB_CSS, LabPane, type LabHost } from './devLab';
import { PROVING_CSS, ProvingPane, type ProvingPaneHost } from './devProving';
import { PANE_CSS, WorldPanes, type PaneHost, type PaneId } from './devPanes';
import { devPane, type DevTab, type DevTabs } from './kernel/devTabs';
import { PartThumbs } from './thumbs';

export type DevItem =
  | { kind: 'part'; id: string }
  | { kind: 'tool'; tool: ToolKind; fuel?: 'petrol' | 'diesel'; litres?: number; tier?: 1 | 2 | 3; colour?: number }
  | { kind: 'item'; id: string }
  | { kind: 'vehicle'; frame: string; stock: boolean };

export interface DevPoint {
  x: number;
  y: number;
  z: number;
}

export interface DevHost extends PaneHost, LabHost, ProvingPaneHost {
  /** the world point under a point of the window (CSS px), or null where the view meets nothing near */
  devPick(clientX: number, clientY: number): DevPoint | null;
  /** put a thing at a world point, or (null) at the walker's feet */
  devSpawn(item: DevItem, at: DevPoint | null): void;
  /** what is being dragged, shown where it would land (null: nothing shown) */
  devPreview(item: DevItem | null, at: DevPoint | null): void;
  /** the things lying about, gone */
  devClear(): void;
  /** every vehicle like new, its tank, oil, water and battery full */
  devRepair(): void;
  /** materials: a hundred more of each (the bench can be tried without the recycler) */
  devStock(): void;
  /** the model an item's tile shows */
  devModel(item: DevItem): Promise<THREE.Object3D | null>;
  /** the bin opened (true) or shut */
  devOpened(open: boolean): void;
  /** the save cleared and a new game from the workshop (the page opened again); the moved dials back to the game's own too, asked */
  devNewGame(resetDials: boolean): void | Promise<void>;
  /** the tabs the V3 systems add (kernel/devTabs.ts) */
  readonly devTabs: DevTabs;
}

/** the item a tile's key stands for: part:<id>, tool:<kind>[:<fuel>[:<litres>]] (tool:scraper:<tier>), item:<id>, vehicle:<frame>:stock|bare */
export function devItemOf(key: string): DevItem | null {
  const [k, a, b, c] = key.split(':');
  if (k === 'part' && a) return { kind: 'part', id: a };
  if (k === 'item' && a) return { kind: 'item', id: a };
  if (k === 'tool' && a === 'scraper') return { kind: 'tool', tool: 'scraper', tier: b === '3' ? 3 : b === '2' ? 2 : 1 };
  if (k === 'tool' && a) return { kind: 'tool', tool: a as ToolKind, fuel: b === 'diesel' ? 'diesel' : b === 'petrol' ? 'petrol' : undefined, litres: c !== undefined ? Number(c) : undefined };
  if (k === 'vehicle' && a) return { kind: 'vehicle', frame: a, stock: b !== 'bare' };
  return null;
}

/** a tile's second line for an item: what it does, in a few words */
function itemMeta(d: (typeof ITEMS)[number]): string {
  const star = d.stars ? `${'★'.repeat(d.stars)} · ` : '';
  if (d.eat && d.eat.food) return `${star}饱腹 +${d.eat.food}`;
  if (d.drink) return `${star}${d.drink.litres} L`;
  if (d.heal?.hp) return `${star}生命 +${d.heal.hp}`;
  if (d.heal?.warm) return `${star}暖身`;
  if (d.revive) return `${star}倒下时用`;
  if (d.wear) return `${star}保暖 +${d.wear.warmth}`;
  if (d.pack) return `${star}+${d.pack.slots} 格`;
  if (d.holds) return `${star}装 ${d.holds.slots} 叠`;
  const s = Object.entries(d.salvage).map(([k, v]) => `${v}${k === 'scrap' ? '废料' : k === 'organics' ? '有机' : '化学'}`).join(' ');
  return `${star}${s || `${d.mass} kg`}`;
}

type TabId = PaneId | 'parts' | 'lab' | 'proving';

const TABS: [TabId, string][] = [
  ['parts', '零件'],
  ['lab', '手感'],
  ['proving', '试车场'],
  ['place', '传送'],
  ['weather', '天气'],
  ['time', '时间'],
  ['look', '画面'],
  ['terrain', '地形'],
];

const GROUPS: { id: string; zh: string; cats?: Category[] }[] = [
  { id: 'all', zh: '全部' },
  { id: 'power', zh: '动力', cats: ['engine', 'turbo', 'gearbox', 'radiator', 'fuelTank', 'exhaust'] },
  { id: 'wheels', zh: '车轮', cats: ['rim', 'tire'] },
  { id: 'chassis', zh: '底盘', cats: ['suspension', 'brakes', 'diff'] },
  { id: 'body', zh: '车身', cats: ['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'roof', 'armor', 'mirror'] },
  { id: 'cab', zh: '驾驶舱', cats: ['seat', 'steering', 'gearLever', 'handbrake', 'ignition'] },
  { id: 'electric', zh: '电气', cats: ['battery', 'headlight', 'taillight', 'horn', 'radio'] },
  { id: 'tools', zh: '工具' },
  { id: 'items', zh: '物品' },
  { id: 'vehicles', zh: '车辆' },
];

/** the item kinds, in the order the bin lists them */
const ITEM_ORDER: ItemCat[] = ['food', 'drink', 'med', 'wear', 'pack', 'lamp', 'gear', 'crate', 'junk'];

const CSS = `
.mc-dev { position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(372px, calc(100vw - 24px)); display: flex; flex-direction: column; z-index: 20; pointer-events: auto; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; color: #fff; box-sizing: border-box; border-radius: 14px; border: 3px solid #efe6d3; box-shadow: 0 0 0 2.5px #17120f, 0 6px 0 1px rgba(10,8,6,0.55); background: linear-gradient(180deg, rgba(8,8,8,0.96) 0px, rgba(18,18,17,0.95) 46px, rgba(30,29,28,0.94) 100%); user-select: none; overflow: hidden; }
.mc-dev .hd { padding: 11px 14px 6px; }
.mc-dev .hd h3 { margin: 0; font-size: 17px; display: flex; align-items: baseline; gap: 8px; }
.mc-dev .hd h3 small { flex: 1; min-width: 0; font-size: 12px; font-weight: 400; color: #c9c6c0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .hd h3 .restart { flex: none; align-self: center; padding: 3px 11px; border: 2px solid #17120f; border-radius: 8px; background: #f6f2ea; color: #17120f; box-shadow: 0 2px 0 #17120f; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.mc-dev .hd h3 .restart:hover, .mc-dev .hd h3 .restart.on { background: #e9c14a; }
.mc-dev .ask { margin: 8px 0 2px; padding: 9px 11px 10px; border-radius: 10px; background: rgba(255,255,255,0.06); box-shadow: inset 0 0 0 1.5px rgba(233,193,74,0.6); font-size: 13px; line-height: 1.5; }
.mc-dev .ask > b { display: block; font-size: 14px; margin-bottom: 2px; }
.mc-dev .ask .note { margin: 2px 0 4px; }
.mc-dev .ask .btns { margin-top: 8px; }
.mc-dev .ask button:disabled { opacity: 0.55; cursor: default; }
.mc-dev .hint { margin-top: 3px; font-size: 12px; color: #c9c6c0; line-height: 1.5; }
.mc-dev .hint b { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 5px; border: 1.5px solid #17120f; background: #f6f2ea; color: #17120f; font-size: 11px; text-align: center; }
.mc-dev input.q { margin: 6px 14px 4px; padding: 6px 10px; border: 1.5px solid rgba(239,230,211,0.35); border-radius: 9px; background: rgba(0,0,0,0.35); font: inherit; font-size: 13px; color: #fff; outline: none; }
.mc-dev input.q:focus { border-color: #e9c14a; box-shadow: 0 0 0 2px rgba(233,193,74,0.2); }
.mc-dev .chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 14px 8px; }
.mc-dev .chips span { padding: 2px 9px; border-radius: 10px; font-size: 12px; background: rgba(255,255,255,0.08); color: #c9c6c0; cursor: pointer; }
.mc-dev .chips span.on { background: #f6f2ea; color: #17120f; font-weight: 700; }
.mc-dev .list { flex: 1; overflow-y: auto; padding: 0 10px 8px 14px; overscroll-behavior: contain; }
.mc-dev .pane[data-p="parts"] input.q { margin-top: 8px; }
.mc-dev h5 { margin: 10px 0 5px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.14); font-size: 12px; font-weight: 400; color: #c9c6c0; letter-spacing: 0.06em; }
.mc-dev .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.mc-dev .tile { position: relative; padding: 4px 4px 5px; border-radius: 10px; background: linear-gradient(180deg, rgba(120,124,122,0.32), rgba(26,26,26,0.6) 40%, rgba(20,20,20,0.7)); box-shadow: inset 0 0 0 1.5px rgba(239,230,211,0.28); cursor: grab; touch-action: none; }
.mc-dev .tile:hover { box-shadow: inset 0 0 0 2px #efe6d3; }
.mc-dev .tile .pic { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 7px; background: radial-gradient(ellipse at 50% 70%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 70%); object-fit: contain; }
.mc-dev .tile .pic.wait { background: repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 6px, rgba(255,255,255,0.02) 6px 12px); }
.mc-dev .tile .nm { margin-top: 3px; font-size: 12px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .tile .mt { font-size: 10.5px; color: #a8a49e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .tag { display: inline-block; margin-left: 3px; padding: 0 4px; border-radius: 4px; font-size: 10px; line-height: 1.5; }
.mc-dev .tag.stock { background: rgba(143,212,122,0.18); color: #a6ea92; }
.mc-dev .tag.apoc { background: rgba(255,171,94,0.18); color: #ffbe82; }
.mc-dev .tag.meme { background: rgba(233,193,74,0.2); color: #f0d27a; }
.mc-dev .tag.bare { background: rgba(255,255,255,0.1); color: #c9c6c0; }
.mc-dev .ft { display: flex; gap: 6px; padding: 9px 14px 12px; border-top: 1px solid rgba(255,255,255,0.14); }
.mc-dev .ft button { flex: 1; padding: 6px 8px; border: 2px solid #17120f; border-radius: 9px; background: #f6f2ea; color: #17120f; box-shadow: 0 2px 0 #17120f; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.mc-dev .ft button:hover { background: #e9c14a; }
.mc-dev-drag { position: fixed; z-index: 30; pointer-events: none; transform: translate(-50%, -60%); padding: 3px 4px 4px; width: 92px; box-sizing: border-box; border-radius: 10px; border: 2.5px solid #efe6d3; box-shadow: 0 0 0 2px #17120f, 0 4px 10px rgba(0,0,0,0.4); background: rgba(24,23,22,0.92); font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; font-size: 11px; color: #fff; text-align: center; transition: opacity 0.1s; }
.mc-dev-drag img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; }
.mc-dev-drag.drop { opacity: 0.55; }
.mc-dev-drag.none::after { content: '这里放不下'; display: block; color: #ff9a7e; }
.mc-dev .tabs.more { flex-wrap: wrap; }
.mc-dev .tabs.more span { flex: 0 0 auto; padding-left: 9px; padding-right: 9px; }
`;

/** what the button at the top does, in the bubble beside the panel (no double quotes: it stands in an attribute) */
const RESTART_TIP = '<b>从头开始</b>：清空存档，回到车库，像第一次打开游戏那样从头玩。适合给别人从头演示。<small>点了会先问你一次。调过的参数默认留着。</small>';

/** a part's line under its name: its weight and where it comes from */
function partTags(p: PartDef): string {
  const t = p.tags ?? [];
  const tags: string[] = [];
  if (t.some((x) => x.startsWith('stock:'))) tags.push('<span class="tag stock">原装</span>');
  if (t.includes('apoc')) tags.push('<span class="tag apoc">末日</span>');
  if (t.includes('meme')) tags.push('<span class="tag meme">整活</span>');
  return `${p.mass} kg${tags.join('')}`;
}

/** under the title while one of the systems' tabs shows and has no words of its own */
const OWN_HINT = 'WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';

interface Tile {
  key: string;
  item: DevItem;
  el: HTMLElement;
  group: string;
  text: string;
  /** the picture's paint, where the item's own colour shows (a diesel can, a frame's factory colour) */
  paint?: number;
  paint2?: number;
  asked: boolean;
}

export class DevPanel {
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly q: HTMLInputElement;
  private readonly tiles: Tile[] = [];
  private readonly sections: { el: HTMLElement; tiles: Tile[] }[] = [];
  private readonly thumbs = new PartThumbs();
  private readonly seen: IntersectionObserver;
  private group = 'all';
  private shown = false;
  private raf = 0;
  private drag: { tile: Tile; x0: number; y0: number; x: number; y: number; moved: boolean; chip: HTMLDivElement | null; id: number } | null = null;
  private readonly panes: WorldPanes;
  /** the handling lab's tab (devLab.ts) and the proving ground's (devProving.ts) */
  private readonly lab: LabPane;
  private readonly proving: ProvingPane;
  /** the tab showing: one of the panel's own (TabId) or one a system registered */
  private current: string = 'parts';
  private readonly built = new Set<string>();
  private lastTick = 0;
  /** the systems' tabs whose tick has thrown (said once each) */
  private readonly tickFailed = new Set<string>();
  private stopWatching: () => void = () => {};

  constructor(private readonly host: DevHost) {
    if (!document.getElementById('mc-dev-css')) {
      const st = document.createElement('style');
      st.id = 'mc-dev-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (!document.getElementById('mc-dev-panes-css')) {
      const st = document.createElement('style');
      st.id = 'mc-dev-panes-css';
      st.textContent = PANE_CSS + LAB_CSS + PROVING_CSS;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.className = 'mc-dev';
    root.style.display = 'none';
    root.innerHTML = `<div class="hd"><h3><span>开发者面板</span><small class="sub"></small><button class="restart" data-act="restart" data-tip="${RESTART_TIP}">从头开始</button></h3><div class="hint"></div><div class="ask" style="display:none"></div></div>
<div class="tabs">${TABS.map(([id, zh]) => `<span data-t="${id}"${id === 'parts' ? ' class="on"' : ''}>${zh}</span>`).join('')}</div>
<div class="pane" data-p="parts">
<input class="q" type="search" placeholder="搜索：名字或编号（如 V8、马桶、rim）" />
<div class="chips">${GROUPS.map((g) => `<span data-g="${g.id}"${g.id === 'all' ? ' class="on"' : ''}>${g.zh}</span>`).join('')}</div>
<div class="list"></div>
<div class="ft"><button data-act="clear">清空地上的零件</button><button data-act="repair">修好并加满所有车</button><button data-act="stock">材料各 +100</button></div>
</div>${TABS.filter(([id]) => id !== 'parts').map(([id]) => `<div class="pane" data-p="${id}" style="display:none"></div>`).join('')}`;
    document.body.appendChild(root);
    this.root = root;
    this.list = root.querySelector('.list') as HTMLDivElement;
    this.q = root.querySelector('input.q') as HTMLInputElement;
    this.panes = new WorldPanes(host, root);
    this.lab = new LabPane(host);
    this.proving = new ProvingPane(host);
    // typing in a box of the panel is not walking (the key that shuts the panel still shuts it)
    for (const type of ['keydown', 'keyup'] as const) {
      root.addEventListener(type, (e) => {
        const t = e.target as HTMLElement;
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && e.code !== 'Backquote' && e.code !== 'IntlBackslash' && e.key !== 'Escape') e.stopPropagation();
      });
    }
    root.querySelector('.tabs')!.addEventListener('click', this.tabClicked);
    // the tabs the V3 systems registered, and any that comes later
    for (const t of host.devTabs.list()) this.addTab(t);
    this.stopWatching = host.devTabs.onAdd((t) => this.addTab(t));
    host.tune.onChange(() => this.header());
    this.header();
    this.seen = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) this.ask(e.target as HTMLElement);
    }, { root: this.list, rootMargin: '120px' });
    this.build();
    this.bind();
  }

  get open(): boolean {
    return this.shown;
  }

  /** the tab showing */
  get tab(): string {
    return this.current;
  }

  private readonly tabClicked = (e: Event): void => {
    const id = (e.target as HTMLElement).closest('span')?.dataset.t;
    if (id) this.showTab(id);
  };

  /**
   * One of the systems' tabs into the panel: its name in the second row (made with the first of them), in its
   * place by order, and an empty pane for its content, which is built the first time it is shown
   */
  private addTab(tab: DevTab): void {
    if (this.root.querySelector(`.pane[data-p="${tab.id}"]`)) return;
    let row = this.root.querySelector<HTMLElement>('.tabs.more');
    if (!row) {
      row = document.createElement('div');
      row.className = 'tabs more';
      this.root.querySelector('.tabs')!.after(row);
      row.addEventListener('click', this.tabClicked);
    }
    const name = document.createElement('span');
    name.dataset.t = tab.id;
    name.textContent = tab.title;
    // (before the first of the tabs after it that is already there)
    const ids = this.host.devTabs.list().map((t) => t.id);
    let next: Element | null = null;
    for (const id of ids.slice(ids.indexOf(tab.id) + 1)) {
      next = row.querySelector(`span[data-t="${id}"]`);
      if (next) break;
    }
    row.insertBefore(name, next);
    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.dataset.p = tab.id;
    pane.style.display = 'none';
    this.root.appendChild(pane);
  }

  /** the content of one of the systems' tabs made (a builder that throws leaves the panel whole: the tab says what went wrong) */
  private buildOwn(tab: DevTab, pane: HTMLElement): void {
    try {
      tab.build(devPane(pane));
    } catch (e) {
      console.error(`[dev tab ${tab.id}]`, e);
      const said = document.createElement('div');
      said.className = 'msg bad';
      said.style.padding = '10px 14px';
      said.textContent = `这个页签出错了：${e instanceof Error ? e.message : String(e)}`;
      pane.appendChild(said);
    }
  }

  private tickOwn(tab: DevTab): void {
    try {
      tab.tick?.();
    } catch (e) {
      // (said once: a tab that throws every time would fill the console)
      if (this.tickFailed.has(tab.id)) return;
      this.tickFailed.add(tab.id);
      console.error(`[dev tab ${tab.id}]`, e);
    }
  }

  /** show a tab (its content made the first time): one of the panel's own, or one a system registered */
  showTab(id: string): void {
    const own = this.host.devTabs.get(id);
    if (!own && !TABS.some(([t]) => t === id)) return;
    this.current = id;
    for (const s of this.root.querySelectorAll<HTMLElement>('.tabs span')) s.classList.toggle('on', s.dataset.t === id);
    for (const p of this.root.querySelectorAll<HTMLElement>('.pane')) {
      const on = p.dataset.p === id;
      p.style.display = on ? '' : 'none';
      if (on && id !== 'parts' && !this.built.has(id)) {
        this.built.add(id);
        if (own) this.buildOwn(own, p);
        else if (id === 'lab') this.lab.build(p);
        else if (id === 'proving') this.proving.build(p);
        else this.panes.build(id as PaneId, p);
      }
    }
    this.header();
    this.panes.tick();
    if (own) this.tickOwn(own);
  }

  private header(): void {
    const sub = this.root.querySelector('.hd .sub') as HTMLElement;
    const hint = this.root.querySelector('.hd .hint') as HTMLElement;
    const moved = this.host.tune.changed().length;
    const own = this.host.devTabs.get(this.current);
    if (own) {
      sub.textContent = own.sub ?? '';
      hint.innerHTML = own.hint ?? OWN_HINT;
    } else if (this.current === 'proving') {
      sub.textContent = '直线加速、刹车、定圆、绕桩、越野、坡道';
      hint.innerHTML = '点一段路就过去 · 开过起点线自动计时 · 可以让机器人开<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    } else if (this.current === 'lab') {
      sub.textContent = '换一个零件，看哪些数变了';
      hint.innerHTML = '先坐进一辆车，或者走到车旁边 · 测量时画面会停一下<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    } else if (this.current === 'parts') {
      sub.textContent = `${PARTS.length} 个零件 · 5 种工具 · 4 种车架`;
      hint.innerHTML = '拖到场景里松开就放在那儿 · 单击放到脚边<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    } else {
      sub.textContent = moved ? `改过 ${moved} 项参数` : '还没改过参数';
      hint.innerHTML = '鼠标放在参数上会显示它是干嘛的 · 改过的会自动记住<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    }
    // (how many dials each tab has moved, on its tab: the panel's own tabs, not the systems')
    for (const s of this.root.querySelectorAll<HTMLElement>('.tabs:not(.more) span')) {
      const t = s.dataset.t as TabId;
      const label = TABS.find(([id]) => id === t)?.[1] ?? '';
      const n = t === 'parts' || t === 'place' || t === 'lab' || t === 'proving' ? 0 : this.host.tune.changed(t).length;
      s.innerHTML = n ? `${label}<i>${n}</i>` : label;
    }
  }

  setOpen(open: boolean): void {
    if (open === this.shown) return;
    this.shown = open;
    this.root.style.display = open ? '' : 'none';
    if (!open) {
      this.endDrag(false);
      this.q.blur();
      this.askRestart(false);
      cancelAnimationFrame(this.raf);
    } else this.loop();
    this.host.devOpened(open);
  }

  // ------------------------------------------------------------------ from the start

  /** the question under the title — a new game from the workshop? — shown or put away */
  private askRestart(show: boolean): void {
    const ask = this.root.querySelector('.hd .ask') as HTMLElement;
    const button = this.root.querySelector('.hd .restart') as HTMLElement;
    if (ask.dataset.going) return;
    button.classList.toggle('on', show);
    if (!show) {
      ask.style.display = 'none';
      ask.innerHTML = '';
      return;
    }
    const n = this.host.tune.changed().length;
    ask.innerHTML = `<b>清空存档，回到车库从头开始？</b>
<div class="note">车的改装、地上的零件、教学清单的进度都会清掉，找不回来。页面会重新载入，就像第一次打开游戏。</div>
${n ? `<label class="check"><input type="checkbox" data-act="dials"> 同时把调过的 ${n} 项参数恢复默认</label><div class="note">不勾就留着这些参数。勾了也会先自动存一份给 Claude。</div>` : ''}
<div class="btns two"><button class="go" data-act="restart-yes">清空，从头开始</button><button data-act="restart-no">取消</button></div>`;
    ask.style.display = '';
  }

  private restart(): void {
    const ask = this.root.querySelector('.hd .ask') as HTMLElement;
    if (ask.dataset.going) return;
    ask.dataset.going = '1';
    const dials = (ask.querySelector('input[data-act="dials"]') as HTMLInputElement | null)?.checked ?? false;
    for (const el of ask.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) el.disabled = true;
    ask.insertAdjacentHTML('beforeend', '<div class="msg">正在清空存档，马上回到车库…</div>');
    void this.host.devNewGame(dials);
  }

  toggle(): void {
    this.setOpen(!this.shown);
  }

  /** pictures drawn so far (the harness) */
  get pictures(): number {
    return this.tiles.filter((t) => (t.el.querySelector('img.pic') as HTMLImageElement).src.startsWith('data:')).length;
  }

  private loop(): void {
    this.raf = requestAnimationFrame((now) => {
      if (!this.shown) return;
      this.thumbs.pump();
      // the live bits of the world tabs (where one is, the hour), a few times a second
      if (this.current !== 'parts' && now - this.lastTick > 200) {
        this.lastTick = now;
        this.panes.tick();
        if (this.current === 'lab') this.lab.tick();
        if (this.current === 'proving') this.proving.tick();
        const own = this.host.devTabs.get(this.current);
        if (own) this.tickOwn(own);
      }
      // walking or turning while a tile is held: where it would land moves with the view
      if (this.drag?.moved) this.aimAt(this.drag.x, this.drag.y);
      this.loop();
    });
  }

  /** the dragged thing shown where it would land under (x, y), the chip under the pointer */
  private aimAt(x: number, y: number): void {
    const d = this.drag;
    if (!d?.chip) return;
    d.chip.style.left = `${x}px`;
    d.chip.style.top = `${y}px`;
    const over = this.overPanel(x, y);
    const at = over ? null : this.host.devPick(x, y);
    this.host.devPreview(over ? null : d.tile.item, at);
    d.chip.classList.toggle('drop', !!at);
    d.chip.classList.toggle('none', !over && !at);
  }

  // ------------------------------------------------------------------ the tiles

  private build(): void {
    const add = (group: string, title: string, entries: { key: string; item: DevItem; name: string; meta: string; text: string; paint?: number; paint2?: number }[]): void => {
      if (!entries.length) return;
      const sec = document.createElement('section');
      sec.innerHTML = `<h5>${title}</h5><div class="grid"></div>`;
      const grid = sec.querySelector('.grid') as HTMLDivElement;
      const tiles: Tile[] = [];
      for (const e of entries) {
        const el = document.createElement('div');
        el.className = 'tile';
        el.dataset.key = e.key;
        el.title = `${e.name}（${e.key.split(':').slice(1).join(':')}）`;
        el.innerHTML = `<img class="pic wait" alt="" draggable="false"><div class="nm">${e.name}</div><div class="mt">${e.meta}</div>`;
        grid.appendChild(el);
        const t: Tile = { key: e.key, item: e.item, el, group, text: e.text.toLowerCase(), paint: e.paint, paint2: e.paint2, asked: false };
        tiles.push(t);
        this.tiles.push(t);
        this.seen.observe(el);
      }
      this.list.appendChild(sec);
      this.sections.push({ el: sec, tiles });
    };
    for (const g of GROUPS) {
      for (const cat of g.cats ?? []) {
        const parts = PARTS.filter((p) => p.cat === cat);
        add(
          g.id,
          CAT_LABEL[cat].zh,
          parts.map((p) => ({ key: `part:${p.id}`, item: { kind: 'part', id: p.id }, name: p.name.zh, meta: partTags(p), text: `${p.name.zh} ${p.name.en} ${p.id} ${CAT_LABEL[cat].zh}`, paint: p.panel ? panelPaint(p.panel.style, 0xa3472e) : undefined })),
        );
      }
    }
    const tool = (key: string, item: DevItem, name: string, meta: string, paint?: number, paint2?: number): { key: string; item: DevItem; name: string; meta: string; text: string; paint?: number; paint2?: number } => ({ key, item, name, meta, text: `${name} ${key}`, paint, paint2 });
    add('tools', '工具', [
      tool('tool:jerrycan:petrol:20', { kind: 'tool', tool: 'jerrycan', fuel: 'petrol', litres: 20 }, '汽油桶（满）', '20 L 汽油', 0xb8302a),
      tool('tool:jerrycan:diesel:20', { kind: 'tool', tool: 'jerrycan', fuel: 'diesel', litres: 20 }, '柴油桶（满）', '20 L 柴油', 0x2f6a3a),
      tool('tool:jerrycan:petrol:0', { kind: 'tool', tool: 'jerrycan', fuel: 'petrol', litres: 0 }, '空油桶', '空的', 0xb8302a),
      tool('tool:bottle', { kind: 'tool', tool: 'bottle' }, TOOL_INFO.bottle.name.zh, '5 L 水'),
      tool('tool:oilcan', { kind: 'tool', tool: 'oilcan' }, TOOL_INFO.oilcan.name.zh, '4 L 机油', 0xd8a531),
      tool('tool:scraper:1', { kind: 'tool', tool: 'scraper', tier: 1 }, SCRAPERS[1].name.zh, '刀口 10 cm', toolLook(newTool('scraper', { tier: 1 })).paint),
    ]);
    // the spray cans as Arctic Drive has them: the small in eight colours, the medium in all, the large in seven (full)
    add(
      'tools',
      '喷漆罐',
      ([1, 2, 3] as const).flatMap((tier) =>
        sprayColours(tier).map((c) => {
          const t = newTool('spray', { tier, colour: c });
          const look = toolLook(t);
          return { ...tool(`tool:spray:${tier}:${c}`, { kind: 'tool', tool: 'spray', tier, colour: c }, toolName(t), `${SPRAY_TIERS[tier].capacity} 单位 · 喷一个部件 ${(1 / SPRAY_TIERS[tier].speed).toFixed(1)} 秒`, look.paint, look.paint2), text: `${toolName(t)} ${PALETTE[c].name.en} 喷漆 spray tool:spray:${tier}:${c}` };
        }),
      ),
    );
    const itemTile = (d: ItemDef, cat: string): { key: string; item: DevItem; name: string; meta: string; text: string; paint?: number; paint2?: number } => ({ key: `item:${d.id}`, item: { kind: 'item', id: d.id }, name: d.name.zh, meta: itemMeta(d), text: `${d.name.zh} ${d.name.en} ${d.id} ${cat} 物品`, paint: d.paint, paint2: d.paint2 });
    for (const cat of ITEM_ORDER) {
      add(
        'items',
        ITEM_CATS[cat].zh,
        ITEMS.filter((d) => d.cat === cat).map((d) => itemTile(d, ITEM_CATS[cat].zh)),
      );
    }
    // the categories the V3 systems registered, after the nine and in the catalogue's order (items.ts itemCats):
    // the same tiles, so that what a system brings can be handed out from here (one with no kinds has no section)
    for (const cat of itemCats()) {
      if (cat.id in ITEM_CATS) continue;
      add(
        'items',
        cat.name.zh,
        ITEMS.filter((d) => d.cat === cat.id).map((d) => itemTile(d, `${cat.name.zh} ${cat.name.en}`)),
      );
    }
    add(
      'vehicles',
      '车辆',
      FRAMES.flatMap((f) => {
        const paint = paintHex(stockBuild(f.id).paint);
        return [
          { key: `vehicle:${f.id}:stock`, item: { kind: 'vehicle', frame: f.id, stock: true } as DevItem, name: `${f.name.zh}（原装）`, meta: `整车 · ${f.towed ? '挂在车后面拖' : '能开'}<span class="tag stock">原装</span>`, text: `${f.name.zh} ${f.name.en} ${f.id} 原装 整车${f.towed ? ' 挂车 trailer' : ''}`, paint },
          { key: `vehicle:${f.id}:bare`, item: { kind: 'vehicle', frame: f.id, stock: false } as DevItem, name: `${f.name.zh}（空车架）`, meta: '一个零件也没有<span class="tag bare">空架</span>', text: `${f.name.zh} ${f.name.en} ${f.id} 空车架 bare`, paint },
        ];
      }),
    );
  }

  /** draw a tile's picture once it is in view */
  private ask(el: HTMLElement): void {
    const t = this.tiles.find((x) => x.el === el);
    if (!t || t.asked) return;
    t.asked = true;
    // (the same model under two tiles — a frame stock and bare — is drawn once)
    const pictureKey = t.item.kind === 'vehicle' ? `vehicle:${t.item.frame}` : t.key;
    this.thumbs.request(
      pictureKey,
      () => this.host.devModel(t.item),
      (url) => {
        const img = t.el.querySelector('img.pic') as HTMLImageElement;
        img.classList.remove('wait');
        if (url) img.src = url;
      },
      t.paint,
      t.paint2,
    );
  }

  private filter(): void {
    const q = this.q.value.trim().toLowerCase();
    for (const s of this.sections) {
      let any = false;
      for (const t of s.tiles) {
        const on = (this.group === 'all' || t.group === this.group) && (!q || q.split(/\s+/).every((w) => t.text.includes(w)));
        t.el.style.display = on ? '' : 'none';
        if (on) any = true;
      }
      s.el.style.display = any ? '' : 'none';
    }
  }

  // ------------------------------------------------------------------ the mouse

  private bind(): void {
    this.root.querySelector('.hd')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'restart') this.askRestart(!(this.root.querySelector('.hd .restart') as HTMLElement).classList.contains('on'));
      else if (act === 'restart-no') this.askRestart(false);
      else if (act === 'restart-yes') this.restart();
    });
    this.q.addEventListener('input', () => this.filter());
    this.root.querySelector('.chips')!.addEventListener('click', (e) => {
      const g = (e.target as HTMLElement).closest('span')?.dataset.g;
      if (!g) return;
      this.group = g;
      for (const c of this.root.querySelectorAll('.chips span')) c.classList.toggle('on', (c as HTMLElement).dataset.g === g);
      this.filter();
      this.list.scrollTop = 0;
    });
    this.root.querySelector('.ft')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'clear') this.host.devClear();
      if (act === 'repair') this.host.devRepair();
      if (act === 'stock') this.host.devStock();
    });
    this.list.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement).closest('.tile') as HTMLElement | null;
      const tile = el ? this.tiles.find((t) => t.el === el) : undefined;
      if (!el || !tile) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.drag = { tile, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, chip: null, id: e.pointerId };
    });
    this.list.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
        d.moved = true;
        const chip = document.createElement('div');
        chip.className = 'mc-dev-drag';
        const src = (d.tile.el.querySelector('img.pic') as HTMLImageElement).src;
        chip.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}<div>${(d.tile.el.querySelector('.nm') as HTMLElement).textContent}</div>`;
        document.body.appendChild(chip);
        d.chip = chip;
      }
      d.x = e.clientX;
      d.y = e.clientY;
      if (d.moved) this.aimAt(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent): void => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved) this.host.devSpawn(d.tile.item, null);
      else if (!this.overPanel(e.clientX, e.clientY)) {
        const at = this.host.devPick(e.clientX, e.clientY);
        if (at) this.host.devSpawn(d.tile.item, at);
      }
      this.endDrag(true);
    };
    this.list.addEventListener('pointerup', up);
    this.list.addEventListener('pointercancel', () => this.endDrag(true));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drag) this.endDrag(true);
    });
  }

  private endDrag(release: boolean): void {
    const d = this.drag;
    if (!d) return;
    if (release && d.tile.el.hasPointerCapture(d.id)) d.tile.el.releasePointerCapture(d.id);
    d.chip?.remove();
    this.host.devPreview(null, null);
    this.drag = null;
  }

  private overPanel(x: number, y: number): boolean {
    const r = this.root.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  dispose(): void {
    this.setOpen(false);
    this.stopWatching();
    this.seen.disconnect();
    this.panes.dispose();
    this.root.remove();
  }
}
