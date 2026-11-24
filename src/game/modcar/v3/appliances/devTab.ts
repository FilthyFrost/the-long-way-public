/**
 * The developer's tab 电器 of the appliances module (node M2): a motorhome furnished at a click — the coffee machine
 * (its pot under the spout, beans in its hopper) on the galley's worktop, the lamp on the dinette's table, the solar
 * lamp beside it, the television and the record player by the door, the clock radio, a bag of beans and a mug beside
 * the coffee machine; each kind given into the hands; all of them switched on or off.
 *
 * It is made of the panel's own pieces (kernel/devTabs.ts DevPane).
 */
import { newItem, type ItemInstance } from '../../../../core/modcar/items';
import { aboardOf } from '../../../../core/modcar/aboard';
import { appOf, COFFEE_POT, toggle } from '../../../../core/v3/appliances/appliances';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import type { ModVehicle } from '../../vehicle';
import type { Appliances } from './system';

/** what goes where in a motorhome (its zones: core/modcar/cargo.ts) */
/** what goes where in a motorhome (its zones: core/modcar/cargo.ts), near which point of it (frame model space), facing which way (0: forward, −π/2: to the right) */
const FURNISH: readonly { id: string; zone: string; at: [number, number]; yaw: number; set?: (it: ItemInstance) => void }[] = [
  // (the coffee machine, its pot under the spout and a bag's worth of beans in it: core/v3/nd/coffee.ts)
  { id: 'nd_coffee_machine', zone: 'galley', at: [-1.55, -0.85], yaw: -Math.PI / 2, set: (it) => void ((it.state ??= {}).ndCoffee = { fill: 1, cup: newItem(COFFEE_POT) }) },
  { id: 'nd_coffee_pack', zone: 'galley', at: [-1.38, -0.62], yaw: -Math.PI / 2 },
  { id: 'nd_mug', zone: 'galley', at: [-0.95, -0.75], yaw: 0 },
  { id: 'junk_clockradio', zone: 'galley', at: [-1.2, -0.74], yaw: -Math.PI / 2 },
  { id: 'junk_lamp', zone: 'table', at: [0.43, -0.85], yaw: -Math.PI / 2 },
  { id: 'junk_tv', zone: 'lounge', at: [-1.0, 0.45], yaw: 0 },
  { id: 'junk_record', zone: 'lounge', at: [-0.15, 0.1], yaw: Math.PI },
  { id: 'junk_solar_lamp', zone: 'table', at: [0.235, -0.47], yaw: 0 },
];

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

/** put the motorhome's furniture in, each once its model is in (so the next is packed round it): how many went in */
export async function furnish(ctx: GameContext, v: ModVehicle): Promise<number> {
  let n = 0;
  for (const f of FURNISH) {
    const it = newItem(f.id);
    f.set?.(it);
    const held = { kind: 'item' as const, item: it };
    await ctx.cargo.measured(held);
    const at = ctx.cargo.spotIn(v, f.zone, held, { x: f.at[0], z: f.at[1] }, f.yaw, 0) ?? ctx.cargo.packSpot(v, held);
    if (!at) continue;
    ctx.cargo.stow(v, at.zone, at.spot, held);
    n++;
  }
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
      pane.note('站在房车里、坐在房车里或站在旁边：咖啡机（壶在出水口下面，豆子装好了）放到厨房台面，台灯和太阳能灯放到餐桌，电视和唱片机放到车门边，收音闹钟放在咖啡机旁边，旁边再放一袋咖啡豆和一个杯子。');
      pane.buttons([
        {
          label: '一套电器放进房车',
          go: true,
          tip: '把八样东西放进最近的房车',
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
