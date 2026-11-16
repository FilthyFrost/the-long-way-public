/**
 * The developer's panel (` — the key left of 1 — opens and shuts it). Its first tab is the parts bin, for
 * trying builds quickly: every part of the catalogue, the tools, and the four frames as they left the works or
 * bare, as tiles with a picture, by kind and searchable. Drag a tile out over the world and let go: the thing
 * lands there (the floor, a bench, a pickup's bed, a roof); a click puts it at one's feet. The other tabs
 * (devPanes.ts) send one to another kind of country and set the weather, the hour, the look and the terrain.
 * With the panel open the mouse is free: WASD still walks, a drag on the view turns it.
 */
import type * as THREE from 'three';
import { stockBuild } from '../../core/modcar/build';
import { CAT_LABEL, FRAMES } from '../../core/modcar/frames';
import { paintHex } from '../../core/modcar/palette';
import { PARTS } from '../../core/modcar/parts';
import { TOOL_INFO, type ToolKind } from '../../core/modcar/tools';
import type { Category, PartDef } from '../../core/modcar/types';
import { panelPaint } from './assets';
import { PANE_CSS, WorldPanes, type PaneHost, type PaneId } from './devPanes';
import { PartThumbs } from './thumbs';

export type DevItem =
  | { kind: 'part'; id: string }
  | { kind: 'tool'; tool: ToolKind; fuel?: 'petrol' | 'diesel'; litres?: number }
  | { kind: 'vehicle'; frame: string; stock: boolean };

export interface DevPoint {
  x: number;
  y: number;
  z: number;
}

export interface DevHost extends PaneHost {
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
  /** the model an item's tile shows */
  devModel(item: DevItem): Promise<THREE.Object3D | null>;
  /** the bin opened (true) or shut */
  devOpened(open: boolean): void;
  /** the save cleared and a new game from the workshop (the page opened again); the moved dials back to the game's own too, asked */
  devNewGame(resetDials: boolean): void | Promise<void>;
}

/** the item a tile's key stands for: part:<id>, tool:<kind>[:<fuel>[:<litres>]], vehicle:<frame>:stock|bare */
export function devItemOf(key: string): DevItem | null {
  const [k, a, b, c] = key.split(':');
  if (k === 'part' && a) return { kind: 'part', id: a };
  if (k === 'tool' && a) return { kind: 'tool', tool: a as ToolKind, fuel: b === 'diesel' ? 'diesel' : b === 'petrol' ? 'petrol' : undefined, litres: c !== undefined ? Number(c) : undefined };
  if (k === 'vehicle' && a) return { kind: 'vehicle', frame: a, stock: b !== 'bare' };
  return null;
}

const TABS: [PaneId | 'parts', string][] = [
  ['parts', '零件'],
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
  { id: 'body', zh: '车身', cats: ['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'roof', 'armor', 'mirror'] },
  { id: 'cab', zh: '驾驶舱', cats: ['seat', 'steering', 'gearLever', 'handbrake', 'ignition'] },
  { id: 'electric', zh: '电气', cats: ['battery', 'headlight', 'taillight', 'horn', 'radio'] },
  { id: 'tools', zh: '工具' },
  { id: 'vehicles', zh: '车辆' },
];

const CSS = `
.mc-dev { position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(372px, calc(100vw - 24px)); display: flex; flex-direction: column; z-index: 20; pointer-events: auto; font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; color: #2b2622; background: rgba(250,244,228,0.97); border-radius: 14px; box-shadow: 0 4px 0 rgba(60,40,24,0.25), 0 0 0 1px rgba(60,40,24,0.14); user-select: none; }
.mc-dev .hd { padding: 12px 14px 6px; }
.mc-dev .hd h3 { margin: 0; font-size: 17px; display: flex; align-items: baseline; gap: 8px; }
.mc-dev .hd h3 small { flex: 1; min-width: 0; font-size: 12px; font-weight: 400; color: #7a6a5a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .hd h3 .restart { flex: none; align-self: center; padding: 3px 10px; border: 0; border-radius: 8px; background: rgba(163,71,46,0.11); color: #a3472e; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.mc-dev .hd h3 .restart:hover, .mc-dev .hd h3 .restart.on { background: #a3472e; color: #fbf3e1; }
.mc-dev .ask { margin: 8px 0 2px; padding: 9px 11px 10px; border-radius: 10px; background: #fffaf0; box-shadow: 0 0 0 1.5px rgba(163,71,46,0.45); font-size: 13px; line-height: 1.5; }
.mc-dev .ask > b { display: block; font-size: 14px; margin-bottom: 2px; }
.mc-dev .ask .note { margin: 2px 0 4px; }
.mc-dev .ask .btns { margin-top: 8px; }
.mc-dev .ask button:disabled { opacity: 0.55; cursor: default; }
.mc-dev .hint { margin-top: 3px; font-size: 12px; color: #7a6a5a; line-height: 1.5; }
.mc-dev .hint b { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 4px; background: #2b2622; color: #fbf3e1; font-size: 11px; text-align: center; }
.mc-dev input.q { margin: 6px 14px 4px; padding: 6px 10px; border: 1px solid rgba(60,40,24,0.22); border-radius: 9px; background: #fffaf0; font: inherit; font-size: 13px; color: #2b2622; outline: none; }
.mc-dev input.q:focus { border-color: #a3472e; box-shadow: 0 0 0 2px rgba(163,71,46,0.15); }
.mc-dev .chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 14px 8px; }
.mc-dev .chips span { padding: 2px 9px; border-radius: 10px; font-size: 12px; background: rgba(60,40,24,0.07); color: #5a4c40; cursor: pointer; }
.mc-dev .chips span.on { background: #2b2622; color: #fbf3e1; }
.mc-dev .list { flex: 1; overflow-y: auto; padding: 0 10px 8px 14px; overscroll-behavior: contain; }
.mc-dev .pane[data-p="parts"] input.q { margin-top: 8px; }
.mc-dev h5 { margin: 10px 0 5px; font-size: 12px; color: #a3472e; letter-spacing: 0.06em; }
.mc-dev .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mc-dev .tile { position: relative; padding: 4px 4px 5px; border-radius: 9px; background: #fffaf0; box-shadow: 0 1px 0 rgba(60,40,24,0.18), 0 0 0 1px rgba(60,40,24,0.08); cursor: grab; touch-action: none; }
.mc-dev .tile:hover { box-shadow: 0 1px 0 rgba(60,40,24,0.18), 0 0 0 2px rgba(163,71,46,0.55); }
.mc-dev .tile .pic { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 6px; background: radial-gradient(ellipse at 50% 70%, #efe4cc 0%, #f7efdd 70%); object-fit: contain; }
.mc-dev .tile .pic.wait { background: repeating-linear-gradient(135deg, #f3ead6 0 6px, #efe4cc 6px 12px); }
.mc-dev .tile .nm { margin-top: 3px; font-size: 12px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .tile .mt { font-size: 10.5px; color: #8a7a6a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-dev .tag { display: inline-block; margin-left: 3px; padding: 0 4px; border-radius: 4px; font-size: 10px; line-height: 1.5; }
.mc-dev .tag.stock { background: rgba(63,125,58,0.14); color: #3f7d3a; }
.mc-dev .tag.apoc { background: rgba(163,71,46,0.14); color: #a3472e; }
.mc-dev .tag.meme { background: rgba(196,140,40,0.18); color: #946414; }
.mc-dev .tag.bare { background: rgba(60,40,24,0.1); color: #5a4c40; }
.mc-dev .ft { display: flex; gap: 6px; padding: 8px 14px 12px; border-top: 1px solid rgba(60,40,24,0.1); }
.mc-dev .ft button { flex: 1; padding: 6px 8px; border: 0; border-radius: 9px; background: #2b2622; color: #fbf3e1; font: inherit; font-size: 12.5px; cursor: pointer; }
.mc-dev .ft button:hover { background: #a3472e; }
.mc-dev-drag { position: fixed; z-index: 30; pointer-events: none; transform: translate(-50%, -60%); padding: 3px 4px 4px; width: 92px; border-radius: 9px; background: rgba(255,250,240,0.92); box-shadow: 0 3px 8px rgba(40,28,18,0.35); font-family: "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif; font-size: 11px; color: #2b2622; text-align: center; transition: opacity 0.1s; }
.mc-dev-drag img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; }
.mc-dev-drag.drop { opacity: 0.55; }
.mc-dev-drag.none::after { content: '这里放不下'; display: block; color: #a3472e; }
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

interface Tile {
  key: string;
  item: DevItem;
  el: HTMLElement;
  group: string;
  text: string;
  /** the picture's paint, where the item's own colour shows (a diesel can, a frame's factory colour) */
  paint?: number;
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
  private current: PaneId | 'parts' = 'parts';
  private readonly built = new Set<string>();
  private lastTick = 0;

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
      st.textContent = PANE_CSS;
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
<div class="ft"><button data-act="clear">清空地上的零件</button><button data-act="repair">修好并加满所有车</button></div>
</div>${TABS.filter(([id]) => id !== 'parts').map(([id]) => `<div class="pane" data-p="${id}" style="display:none"></div>`).join('')}`;
    document.body.appendChild(root);
    this.root = root;
    this.list = root.querySelector('.list') as HTMLDivElement;
    this.q = root.querySelector('input.q') as HTMLInputElement;
    this.panes = new WorldPanes(host, root);
    // typing in a box of the panel is not walking (the key that shuts the panel still shuts it)
    for (const type of ['keydown', 'keyup'] as const) {
      root.addEventListener(type, (e) => {
        const t = e.target as HTMLElement;
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && e.code !== 'Backquote' && e.code !== 'IntlBackslash' && e.key !== 'Escape') e.stopPropagation();
      });
    }
    root.querySelector('.tabs')!.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest('span')?.dataset.t;
      if (id) this.showTab(id as PaneId | 'parts');
    });
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
  get tab(): PaneId | 'parts' {
    return this.current;
  }

  /** show a tab (its content made the first time) */
  showTab(id: PaneId | 'parts'): void {
    if (!TABS.some(([t]) => t === id)) return;
    this.current = id;
    for (const s of this.root.querySelectorAll<HTMLElement>('.tabs span')) s.classList.toggle('on', s.dataset.t === id);
    for (const p of this.root.querySelectorAll<HTMLElement>('.pane')) {
      const on = p.dataset.p === id;
      p.style.display = on ? '' : 'none';
      if (on && id !== 'parts' && !this.built.has(id)) {
        this.built.add(id);
        this.panes.build(id, p);
      }
    }
    this.header();
    this.panes.tick();
  }

  private header(): void {
    const sub = this.root.querySelector('.hd .sub') as HTMLElement;
    const hint = this.root.querySelector('.hd .hint') as HTMLElement;
    const moved = this.host.tune.changed().length;
    if (this.current === 'parts') {
      sub.textContent = `${PARTS.length} 个零件 · 5 种工具 · 4 种车架`;
      hint.innerHTML = '拖到场景里松开就放在那儿 · 单击放到脚边<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    } else {
      sub.textContent = moved ? `改过 ${moved} 项参数` : '还没改过参数';
      hint.innerHTML = '鼠标放在参数上会显示它是干嘛的 · 改过的会自动记住<br>WASD 照常走动 · 在画面上按住拖动转视角 · <b>`</b> 关闭';
    }
    // (how many dials each tab has moved, on its tab)
    for (const s of this.root.querySelectorAll<HTMLElement>('.tabs span')) {
      const t = s.dataset.t as PaneId | 'parts';
      const label = TABS.find(([id]) => id === t)?.[1] ?? '';
      const n = t === 'parts' || t === 'place' ? 0 : this.host.tune.changed(t).length;
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
    const add = (group: string, title: string, entries: { key: string; item: DevItem; name: string; meta: string; text: string; paint?: number }[]): void => {
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
        const t: Tile = { key: e.key, item: e.item, el, group, text: e.text.toLowerCase(), paint: e.paint, asked: false };
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
    const tool = (key: string, item: DevItem, name: string, meta: string, paint?: number): { key: string; item: DevItem; name: string; meta: string; text: string; paint?: number } => ({ key, item, name, meta, text: `${name} ${key}`, paint });
    add('tools', '工具', [
      tool('tool:jerrycan:petrol:20', { kind: 'tool', tool: 'jerrycan', fuel: 'petrol', litres: 20 }, '汽油桶（满）', '20 L 汽油', 0xb8302a),
      tool('tool:jerrycan:diesel:20', { kind: 'tool', tool: 'jerrycan', fuel: 'diesel', litres: 20 }, '柴油桶（满）', '20 L 柴油', 0x2f6a3a),
      tool('tool:jerrycan:petrol:0', { kind: 'tool', tool: 'jerrycan', fuel: 'petrol', litres: 0 }, '空油桶', '空的', 0xb8302a),
      tool('tool:bottle', { kind: 'tool', tool: 'bottle' }, TOOL_INFO.bottle.name.zh, '5 L 水'),
      tool('tool:oilcan', { kind: 'tool', tool: 'oilcan' }, TOOL_INFO.oilcan.name.zh, '4 L 机油', 0xd8a531),
      tool('tool:spray', { kind: 'tool', tool: 'spray' }, TOOL_INFO.spray.name.zh, '滚轮换颜色', paintHex(13)),
      tool('tool:sponge', { kind: 'tool', tool: 'sponge' }, TOOL_INFO.sponge.name.zh, '擦洗', 0xe8d257),
    ]);
    add(
      'vehicles',
      '车辆',
      FRAMES.flatMap((f) => {
        const paint = paintHex(stockBuild(f.id).paint);
        return [
          { key: `vehicle:${f.id}:stock`, item: { kind: 'vehicle', frame: f.id, stock: true } as DevItem, name: `${f.name.zh}（原装）`, meta: '整车 · 能开<span class="tag stock">原装</span>', text: `${f.name.zh} ${f.name.en} ${f.id} 原装 整车`, paint },
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
    this.seen.disconnect();
    this.panes.dispose();
    this.root.remove();
  }
}
