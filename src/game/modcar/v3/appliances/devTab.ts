/**
 * The developer's tab 电器 of the appliances module (node M2): a motorhome furnished at a click — its living space an
 * empty shell (docs/V3/plan/finish.md §十九 step 7), the furniture first: a kitchen stand along the left wall and a
 * kitchen table ahead of it; then the coffee machine (its pot under the spout, beans in its hopper), a bag of beans, a
 * mug and the clock radio along the stand's top, the lamp and the solar lamp on the table, the television and the
 * record player on the floor by the door; each kind given into the hands; all of them switched on or off.
 *
 * It is made of the panel's own pieces (kernel/devTabs.ts DevPane).
 */
import { newItem, type ItemInstance } from '../../../../core/modcar/items';
import { aboardOf } from '../../../../core/modcar/aboard';
import { zonesFor } from '../../../../core/modcar/cargo';
import { appOf, COFFEE_POT, toggle } from '../../../../core/v3/appliances/appliances';
import { newInstance } from '../../../../core/modcar/build';
import { STATION_GENRES, TAPES } from '../../../../core/v3/nd/tapes';
import { VINYLS } from '../../../../core/v3/nd/vinyls';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import type { Loose } from '../../loose';
import type { ModVehicle } from '../../vehicle';
import type { Appliances } from './system';

interface Put {
  id: string;
  /** near which point (frame model space — the Whale's: where its galley and its dinette stood), or, for a thing on a piece of furniture, how far along the furniture from its middle (m, the vehicle's x) */
  at: [number, number];
  /** facing which way (0: forward, −π/2: to the right) */
  yaw: number;
  set?: (it: ItemInstance) => void;
}
/** the furniture (Nomad Drive's kitchen stand and kitchen table), then what goes on each, then what stands on the floor */
const STAND: Put = { id: 'nd_kitchen_stand', at: [-2.2, -0.75], yaw: Math.PI / 2 };
const TABLE: Put = { id: 'nd_dinner_table', at: [0.3, -0.62], yaw: 0 };
const ON_STAND: readonly Put[] = [
  // (the coffee machine, its pot under the spout and a bag's worth of beans in it: core/v3/nd/coffee.ts)
  { id: 'nd_coffee_machine', at: [-0.42, 0.05], yaw: -Math.PI / 2, set: (it) => void ((it.state ??= {}).ndCoffee = { fill: 1, cup: newItem(COFFEE_POT) }) },
  { id: 'nd_coffee_pack', at: [-0.1, 0.05], yaw: -Math.PI / 2 },
  { id: 'nd_mug', at: [0.15, 0.05], yaw: 0 },
  { id: 'junk_clockradio', at: [0.45, 0.05], yaw: -Math.PI / 2 },
];
const ON_TABLE: readonly Put[] = [
  { id: 'junk_lamp', at: [0.18, 0], yaw: -Math.PI / 2 },
  { id: 'junk_solar_lamp', at: [-0.22, 0], yaw: 0 },
];
const ON_FLOOR: readonly Put[] = [
  { id: 'junk_tv', at: [-1.75, 0.45], yaw: 0 },
  { id: 'junk_record', at: [-0.9, 0.1], yaw: Math.PI },
];

/**
 * A thing put in a motorhome near a point of its floor (frame model space), turned so — or on top of what stands there,
 * as one puts a thing on a table — once its model is measured; where the floor there has no room, wherever it has:
 * where it went (model space) and the thing, or null
 */
async function putIn(ctx: GameContext, v: ModVehicle, p: Put, x: number, z: number, zone?: string): Promise<{ x: number; z: number; zone: string; l: Loose } | null> {
  const it = newItem(p.id);
  p.set?.(it);
  const held = { kind: 'item' as const, item: it };
  await ctx.cargo.measured(held);
  const floor = zone ?? zonesFor(v.view.frame.id, v.build).find((q) => !q.wall && q.id !== 'pass' && q.id !== 'dash' && x >= q.x[0] && x <= q.x[1] && z >= q.z[0] && z <= q.z[1])?.id;
  const at = (floor ? ctx.cargo.spotIn(v, floor, held, { x, z }, p.yaw, 0) : null) ?? ctx.cargo.packSpot(v, held);
  if (!at) return null;
  return { x: at.spot.x, z: at.spot.z, zone: at.zone.id, l: ctx.cargo.stow(v, at.zone, at.spot, held) };
}

/** the vehicle with a living space one is in, sits in, or stands nearest to (within 12 m) */
function homeOf(ctx: GameContext): ModVehicle | null {
  const ab = ctx.player.aboard?.v;
  if (ab) return ab;
  if (ctx.seated && aboardOf(ctx.seated.view.frame.id)) return ctx.seated;
  const w = ctx.player.walker;
  let best: ModVehicle | null = null;
  let bd = 12;
  for (const v of ctx.vehicles) {
    if (!aboardOf(v.view.frame.id)) continue;
    const d = Math.hypot(v.sim.px - w.x, v.sim.pz - w.z);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/** furnish a motorhome: its furniture, then the appliances on it and by the door, each once its model is in (so the next is packed round it): how many things went in */
export async function furnish(ctx: GameContext, v: ModVehicle): Promise<number> {
  let n = 0;
  for (const [f, on] of [[STAND, ON_STAND], [TABLE, ON_TABLE]] as const) {
    const base = await putIn(ctx, v, f, f.at[0], f.at[1]);
    if (!base) continue;
    n++;
    for (const p of on) if (await putIn(ctx, v, p, base.x + p.at[0], base.z + p.at[1], base.zone)) n++;
  }
  for (const p of ON_FLOOR) if (await putIn(ctx, v, p, p.at[0], p.at[1])) n++;
  return n;
}

export function appliancesTab(sys: Appliances, game: () => GameContext | null): DevTab {
  let box: { textContent: string | null } | null = null;
  const status = (): string => {
    const ctx = game();
    if (!ctx) return '游戏还没开始。';
    const all = sys.all.filter((u) => !u.potOnly);
    const on = all.filter((u) => appOf(u.item).on);
    const home = homeOf(ctx);
    return `附近的电器 ${all.length} 件，开着 ${on.length} 件${on.length ? `（${on.map((u) => u.item.item).join('、')}）` : ''} · ${home ? `房车：${home.view.frame.name.zh}` : '附近没有能进车厢的车'}`;
  };
  const give = (ctx: GameContext, id: string): void => {
    const item = newItem(id);
    const left = ctx.player.receive({ kind: 'item', item });
    if (left > 0) {
      const w = ctx.player.walker;
      ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.6, w.y + 0.9, w.z + Math.sin(w.heading) * 0.6, w.heading));
    }
  };
  return {
    id: 'appliances',
    title: '电器',
    order: 40,
    sub: '房车里的电器（M2）',
    build(pane) {
      const say = pane.message();
      pane.heading('房车');
      pane.note('站在房车里、坐在房车里或站在旁边：车厢是空的，先靠左墙放一个橱柜、前面放一张方餐桌；咖啡机（壶在出水口下面，豆子装好了）、一袋咖啡豆、一个杯子和收音闹钟放到橱柜上，台灯和太阳能灯放到餐桌上，电视和唱片机放到车门边。');
      pane.buttons([
        {
          label: '一套电器放进房车',
          go: true,
          tip: '把橱柜、餐桌和八样电器放进最近的房车',
          click: () => {
            const ctx = game();
            const v = ctx ? homeOf(ctx) : null;
            if (!ctx || !v) return say('附近没有能进车厢的车。', true);
            void furnish(ctx, v).then((n) => say(`放进去了 ${n} 样。`));
          },
        },
        {
          label: '全部打开',
          click: () => {
            for (const u of sys.all) if (!u.potOnly) toggle(u.item, true);
            say('都打开了。');
          },
        },
        {
          label: '全部关掉',
          click: () => {
            for (const u of sys.all) if (!u.potOnly) toggle(u.item, false);
            say('都关掉了。');
          },
        },
      ], 3);
      pane.heading('拿到手上');
      const kinds: [string, string][] = [
        ['nd_coffee_machine', '咖啡机'],
        [COFFEE_POT, '咖啡壶'],
        ['nd_coffee_pack', '咖啡豆'],
        ['nd_mug', '搪瓷杯'],
        ['junk_clockradio', '收音闹钟'],
        ['junk_record', '唱片机'],
        ['junk_tv', '电视'],
        ['junk_lamp', '台灯'],
        ['junk_solar_lamp', '太阳能灯'],
      ];
      const rows: DevButton[] = kinds.map(([id, label]) => ({
        label,
        click: () => {
          const ctx = game();
          if (!ctx) return;
          give(ctx, id);
          say(`给了一个${label}。`);
        },
      }));
      for (let i = 0; i < rows.length; i += 3) pane.buttons(rows.slice(i, i + 3), 3);
      box = pane.box(status());
    },
    tick() {
      if (box) box.textContent = status();
    },
  };
}

/** Dedicated Music test tab listing all 51 individual vinyl records and all 51 individual cassette tapes by station */
export function musicTab(game: () => GameContext | null): DevTab {
  const giveItem = (ctx: GameContext, id: string): void => {
    const item = newItem(id);
    if (ctx.player.receive({ kind: 'item', item }) > 0) {
      const w = ctx.player.walker;
      ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.65, w.y + 0.9, w.z + Math.sin(w.heading) * 0.65, w.heading));
    }
  };
  const givePart = (ctx: GameContext, id: string): void => {
    const inst = newInstance(id);
    if (ctx.player.receive({ kind: 'part', inst }) > 0) {
      const w = ctx.player.walker;
      ctx.loose.drop(ctx.loose.addPart(inst, w.x + Math.cos(w.heading) * 0.65, w.y + 0.9, w.z + Math.sin(w.heading) * 0.65, w.heading));
    }
  };
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  return {
    id: 'music',
    title: '音乐',
    order: 41,
    sub: '51 首独立黑胶唱片 & 51 首独立车载磁带',
    build(pane) {
      const say = pane.message();
      pane.heading('播放设备');
      pane.buttons(
        [
          {
            label: '给一台唱片机',
            go: true,
            click: () => {
              const ctx = game();
              if (!ctx) return;
              giveItem(ctx, 'junk_record');
              say('给了一台唱片机，放下后手持黑胶点击即可播放。');
            },
          },
          {
            label: '给一台车载卡带机',
            click: () => {
              const ctx = game();
              if (!ctx) return;
              givePart(ctx, 'radio_tape');
              say('给了一台车载卡带机（零件），装到中控台即可插磁带。');
            },
          },
        ],
        2,
      );
      let mode: 'vinyl' | 'tape' = 'vinyl';
      let station = -1;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:5px;';
      const stBar = document.createElement('div');
      stBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
      const list = document.createElement('div');
      list.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:5px;max-height:420px;overflow-y:auto;padding-right:2px;';
      const render = (): void => {
        bar.innerHTML = '';
        for (const [m, text] of [
          ['vinyl', `黑胶唱片 (${VINYLS.length})`],
          ['tape', `车载磁带 (${TAPES.length})`],
        ] as const) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = text;
          b.style.cssText = `flex:1;padding:5px 6px;border-radius:8px;border:1.5px solid #17120f;font:inherit;font-size:12px;font-weight:700;cursor:pointer;background:${mode === m ? '#e9c14a' : 'rgba(255,255,255,0.1)'};color:${mode === m ? '#17120f' : '#eee'};`;
          b.onclick = () => {
            mode = m;
            render();
          };
          bar.appendChild(b);
        }
        stBar.innerHTML = '';
        for (let s = -1; s < STATION_GENRES.length; s++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = s < 0 ? '全部电台' : STATION_GENRES[s];
          b.style.cssText = `padding:3px 7px;border-radius:8px;border:none;font:inherit;font-size:11px;cursor:pointer;background:${station === s ? '#f6f2ea' : 'rgba(255,255,255,0.08)'};color:${station === s ? '#17120f' : '#ccc'};font-weight:${station === s ? '700' : '400'};`;
          b.onclick = () => {
            station = s;
            render();
          };
          stBar.appendChild(b);
        }
        list.innerHTML = '';
        const rows = mode === 'vinyl' ? VINYLS.map((v, idx) => ({ id: v.id, num: idx + 1, title: v.title, station: v.station, c1: v.label, c2: v.accent })) : TAPES.map((t, idx) => ({ id: t.id, num: idx + 1, title: t.title, station: t.station, c1: t.shell, c2: t.label }));
        for (const r of rows) {
          if (station >= 0 && r.station !== station) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.songId = r.id;
          b.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:8px;border:1px solid rgba(239,230,211,0.25);background:rgba(255,255,255,0.06);color:#fff;font:inherit;font-size:11.5px;text-align:left;cursor:pointer;';
          const sw = document.createElement('span');
          sw.style.cssText = `flex:none;width:14px;height:14px;border-radius:${mode === 'vinyl' ? '50%' : '3px'};background:${hex(r.c1)};border:2px solid ${hex(r.c2)};box-shadow:0 0 0 1px #111;`;
          const lb = document.createElement('span');
          lb.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          lb.textContent = `${String(r.num).padStart(2, '0')} ${r.title}`;
          b.append(sw, lb);
          b.onclick = () => {
            const ctx = game();
            if (!ctx) return;
            giveItem(ctx, r.id);
            say(`已生成 ${mode === 'vinyl' ? '黑胶' : '磁带'}《${r.title}》(${r.id})。`);
          };
          list.appendChild(b);
        }
      };
      render();
      wrap.append(bar, stBar, list);
      pane.body.appendChild(wrap);
    },
  };
}
