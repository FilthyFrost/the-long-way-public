/**
 * The developer's tab 厨房 of the kitchen module (docs/V3/plan/cooking.md §6): a kitchen laid out at one's feet at a
 * click — the stove with a full canister and a pan on it, the board, a pot, a bowl, plates and bowls, the seasonings, a
 * spare canister, the other vessels behind, a few ingredients to hand; any piece of cookware, any ingredient (by its
 * group) and any dish given into the hands; the stove's canister burnt down to its last seconds; the recipe book
 * filled or emptied; and "try a pot": a way and up to five things chosen, what they would come to said at once,
 * without cooking.
 */
import { aboardOf } from '../../../../core/modcar/aboard';
import { itemDef, newItem, putInside, type ItemInstance } from '../../../../core/modcar/items';
import { fillBook, newBook, tally } from '../../../../core/v3/kitchen/book';
import { cook } from '../../../../core/v3/kitchen/cook';
import { DISHES, WAYS, type Way } from '../../../../core/v3/kitchen/dishes';
import { BOARD, BOWL, COOKWARE_ITEMS, COOLER, dishItem, GAS, ingItem, PLATE, SPICE, STOVE, VESSEL } from '../../../../core/v3/kitchen/items';
import { canister, kitState, loadCanister, putVessel } from '../../../../core/v3/kitchen/kit';
import { FOODS, type Group } from '../../../../core/v3/kitchen/pantry';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import type { ModVehicle } from '../../vehicle';
import type { Kitchen } from './system';

const GROUPS: readonly [Group, string][] = [
  ['veg', '蔬菜'],
  ['aromatic', '葱姜蒜辣'],
  ['mushroom', '菌菇'],
  ['green', '野菜香草'],
  ['fruit', '水果'],
  ['grain', '谷物主食'],
  ['egg', '蛋'],
  ['dairy', '奶'],
  ['meat', '肉'],
  ['seafood', '鱼和水产'],
  ['misc', '其他'],
];

/** a cooler with what keeps worst in it: meat, fish, milk, eggs, greens (each at the cooler's rate) */
export function stockedCooler(): ItemInstance {
  const c = newItem(COOLER);
  const now = itemNow();
  for (const [id, n] of [['beef', 2], ['salmon', 2], ['milk', 1], ['egg', 4], ['lettuce', 2], ['strawberry', 3]] as const) putInside(c, newItem(ingItem(id), n > 1 ? { n } : {}), now);
  return c;
}

/** a thing into the hands, or at one's feet when they are full */
function give(ctx: GameContext, item: ItemInstance): void {
  if (ctx.player.receive({ kind: 'item', item }) > 0) {
    const w = ctx.player.walker;
    ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.6, w.y + 0.9, w.z + Math.sin(w.heading) * 0.6, w.heading));
  }
}

/**
 * A kitchen set out on the ground before one (or the floor one stands on), everything facing one: how many things.
 * The stove has a full canister in it and the pan on its burner.
 */
export function layKitchen(ctx: GameContext): number {
  const w = ctx.player.walker;
  const fx = Math.cos(w.heading);
  const fz = Math.sin(w.heading);
  // (to one's right: forward turned a quarter clockwise seen from above)
  const rx = -fz;
  const rz = fx;
  const yaw = w.heading + Math.PI;
  let n = 0;
  const put = (item: ItemInstance, ahead: number, right: number): void => {
    const x = w.x + fx * ahead + rx * right;
    const z = w.z + fz * ahead + rz * right;
    const y = ctx.loose.surfaceAt(x, z, w.y + 1.3);
    ctx.loose.drop(ctx.loose.addItem(item, x, y + 0.02, z, yaw));
    n++;
  };
  const stove = newItem(STOVE);
  loadCanister(stove, newItem(GAS));
  putVessel(stove, newItem(VESSEL.fry));
  put(stove, 1.2, 0);
  put(newItem(BOARD), 1.1, -0.52);
  put(newItem(SPICE), 1.42, 0.45);
  put(newItem(PLATE, { n: 4 }), 0.85, 0.42);
  put(newItem(BOWL, { n: 4 }), 0.85, 0.68);
  put(newItem(VESSEL.boil), 1.68, -0.5);
  put(newItem(VESSEL.mix), 1.68, -0.1);
  put(newItem(GAS), 1.62, 0.3);
  put(newItem(VESSEL.grill), 2.15, -0.66);
  put(newItem(VESSEL.steam), 2.15, -0.24);
  put(newItem(VESSEL.bake), 2.15, 0.16);
  put(newItem(VESSEL.brew), 2.15, 0.54);
  put(stockedCooler(), 2.25, 1.15);
  // a few ingredients to hand, nearest one
  const pantry = ['tomato', 'egg', 'potato', 'beef', 'rice', 'lettuce', 'onion'];
  pantry.forEach((id, i) => put(newItem(ingItem(id), { n: 3 }), 0.62, -0.75 + i * 0.2));
  return n;
}

/** the vehicle with a living space one is in, sits in, or stands nearest to (within 12 m) */
export function homeOf(ctx: GameContext): ModVehicle | null {
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

/**
 * A kitchen set out in a motorhome (its zones: core/modcar/cargo.ts): the board, the stove (a full canister in it, the
 * pan on it) and the seasonings along the galley's worktop, facing the aisle; plates, bowls and a few ingredients on
 * the dinette's table; a pot, the bowl and a spare canister on the floor by the door. Each once its model is in, so
 * that the next is packed round it: how many went in.
 */
export async function layKitchenInHome(ctx: GameContext, v: ModVehicle): Promise<number> {
  const stove = newItem(STOVE);
  loadCanister(stove, newItem(GAS));
  putVessel(stove, newItem(VESSEL.fry));
  const aisle = -Math.PI / 2;
  const things: readonly [ItemInstance, string, number, number, number][] = [
    [newItem(BOARD), 'galley', -1.72, -0.74, aisle],
    [stove, 'galley', -1.32, -0.74, aisle],
    [newItem(SPICE), 'galley', -0.95, -0.82, aisle],
    [newItem(PLATE, { n: 4 }), 'table', 0.3, -0.52, 0],
    [newItem(BOWL, { n: 4 }), 'table', 0.48, -0.52, 0],
    [newItem(ingItem('tomato'), { n: 3 }), 'table', 0.26, -0.74, 0],
    [newItem(ingItem('egg'), { n: 3 }), 'table', 0.38, -0.74, 0],
    [newItem(ingItem('potato'), { n: 3 }), 'table', 0.5, -0.74, 0],
    [newItem(ingItem('beef'), { n: 3 }), 'table', 0.28, -0.92, 0],
    [newItem(ingItem('lettuce'), { n: 3 }), 'table', 0.46, -0.92, 0],
    [newItem(VESSEL.boil), 'lounge', -1.0, 0.55, aisle],
    [newItem(VESSEL.mix), 'lounge', -0.62, 0.55, aisle],
    [newItem(GAS), 'lounge', -0.3, 0.6, 0],
    [stockedCooler(), 'lounge', 0.45, 0.62, aisle],
  ];
  let n = 0;
  for (const [item, zone, x, z, yaw] of things) {
    const held = { kind: 'item' as const, item };
    await ctx.cargo.measured(held);
    const at = ctx.cargo.spotIn(v, zone, held, { x, z }, yaw, 0) ?? ctx.cargo.packSpot(v, held);
    if (!at) continue;
    ctx.cargo.stow(v, at.zone, at.spot, held);
    n++;
  }
  return n;
}

export function kitchenTab(sys: Kitchen, game: () => GameContext | null): DevTab {
  let box: { textContent: string | null } | null = null;
  let many = 1;
  const status = (): string => {
    const ctx = game();
    if (!ctx) return '游戏还没开始。';
    const t = tally(sys.book);
    const lit = sys.list.filter((u) => u.kind === 'stove' && (u.item.state?.kit?.fire ?? 0) > 0).length;
    return `附近的厨具 ${sys.list.length} 件，点着的炉子 ${lit} 个 · 食谱本：做过 ${t.made}/${t.total} 道，完美 ${t.perfect} 道，记下的失败搭配 ${sys.book.fails.length} 个`;
  };
  return {
    id: 'kitchen',
    title: '厨房',
    order: 45,
    sub: '做饭（烹饪系统）',
    hint: '拿着东西看哪里能放，哪里就有它的投影：点左键放下 / 下锅 / 装盘，对着锅和案板点左键操作，按住左键把锅端起来、把厨具拿起来。J 打开食谱本。',
    build(pane) {
      const say = pane.message();
      const ctx0 = (): GameContext | null => {
        const ctx = game();
        if (!ctx) say('游戏还没开始。', true);
        return ctx;
      };
      pane.heading('一套厨房');
      pane.note('在面前的地上摆好：卡式炉（装了满罐燃气，炉头上放着平底锅）、案板、汤锅、搅拌碗、盘子和碗各四个、调料盒、一罐备用燃气，后排是烤盘、蒸笼、铸铁焖烤锅、水壶和一个装着肉、鱼、奶、蛋、菜的保温箱（Tab 打开），脚边是几样常用食材。蒸笼要架在炉头上的空汤锅上。');
      pane.buttons(
        [
          {
            label: '摆一套厨房',
            go: true,
            tip: '在面前摆好一整套厨具和几样食材',
            click: () => {
              const ctx = ctx0();
              if (ctx) say(`摆好了 ${layKitchen(ctx)} 样。`);
            },
          },
          {
            label: '摆进房车',
            tip: '站在房车里或旁边：案板、卡式炉、调料盒摆上厨房台面，盘子、碗和几样食材放到餐桌上，汤锅、搅拌碗和备用燃气放在车门边的地上',
            click: () => {
              const ctx = ctx0();
              const v = ctx ? homeOf(ctx) : null;
              if (!ctx || !v) return say('附近没有能进车厢的车。', true);
              void layKitchenInHome(ctx, v).then((k) => say(`放进${v.view.frame.name.zh}里 ${k} 样。`));
            },
          },
        ],
        3,
      );
      pane.buttons(
        [
          {
            label: '炉子的气快烧完',
            tip: '把附近每个炉子里的燃气调到只剩 20 秒，试换罐',
            click: () => {
              let n = 0;
              for (const u of sys.list) {
                if (u.kind !== 'stove' || u.item.state?.kit?.gas === undefined) continue;
                kitState(u.item).gas = 20;
                n++;
              }
              say(n ? `${n} 个炉子只剩 20 秒的气了。` : '附近没有装着燃气罐的炉子。', !n);
            },
          },
          {
            label: '给一个空罐',
            tip: '一个烧空了的燃气罐，试"点不着"',
            click: () => {
              const ctx = ctx0();
              if (ctx) give(ctx, canister(0));
            },
          },
          {
            label: '打开食谱本',
            tip: '和按 J 一样',
            click: () => void sys.showBook(true),
          },
        ],
        3,
      );
      pane.heading('厨具，拿到手上');
      const ware: DevButton[] = COOKWARE_ITEMS.map((r) => ({
        label: r.name.zh,
        click: () => {
          const ctx = ctx0();
          if (!ctx) return;
          give(ctx, newItem(r.id, r.stack ? { n: 2 } : {}));
          say(`给了${r.name.zh}。`);
        },
      }));
      for (let i = 0; i < ware.length; i += 3) pane.buttons(ware.slice(i, i + 3), 3);
      pane.heading('食材，拿到手上');
      pane.buttons(
        [1, 3, 10].map((k) => ({
          label: `每次给 ${k} 个`,
          click: (b: HTMLButtonElement) => {
            many = k;
            say(`每次给 ${k} 个。`);
            void b;
          },
        })),
        3,
      );
      for (const [group, title] of GROUPS) {
        pane.note(title);
        const foods: DevButton[] = FOODS.filter((f) => f.group === group).map((f) => ({
          label: `${f.zh}${'★'.repeat(f.star)}`,
          click: () => {
            const ctx = ctx0();
            if (!ctx) return;
            give(ctx, newItem(ingItem(f.id), many > 1 ? { n: many } : {}));
            say(`给了${f.zh} ×${many}。`);
          },
        }));
        for (let i = 0; i < foods.length; i += 3) pane.buttons(foods.slice(i, i + 3), 3);
      }
      pane.heading('食谱本');
      pane.buttons(
        [
          {
            label: '全部菜谱解锁',
            click: () => {
              fillBook(sys.book);
              say(`${DISHES.length} 道菜都记进食谱本了。`);
            },
          },
          {
            label: '全部做到完美',
            click: () => {
              fillBook(sys.book, true);
              say('都记成做到过完美了。');
            },
          },
          {
            label: '清空食谱本',
            click: () => {
              const b = newBook();
              sys.book.made = b.made;
              sys.book.fails = b.fails;
              delete sys.book.pin;
              say('食谱本清空了。');
            },
          },
        ],
        3,
      );
      // ---- try a pot, a dish into the hands: their own controls (only where there is a page)
      if (typeof document !== 'undefined' && pane.body.appendChild) {
        pane.heading('试一锅');
        pane.note('选做法和最多五样食材：不用真的做，直接看会出什么菜（火候按"正好"算）。');
        const row = document.createElement('div');
        row.className = 'btns three';
        const sel = (options: [string, string][]): HTMLSelectElement => {
          const s = document.createElement('select');
          for (const [v, t] of options) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            s.appendChild(o);
          }
          s.style.cssText = 'background:#1d2127;color:#e8e8e8;border:1px solid #3a4048;border-radius:4px;padding:3px 4px;font:inherit;min-width:0';
          row.appendChild(s);
          return s;
        };
        const way = sel((Object.keys(WAYS) as Way[]).map((w) => [w, `${WAYS[w].zh}（${itemDef(VESSEL[w]).name.zh}）`]));
        const food: [string, string][] = [['', '—'], ...FOODS.map((f): [string, string] => [f.id, f.zh])];
        const picks = [0, 1, 2, 3, 4].map(() => sel(food));
        pane.body.appendChild(row);
        const out = pane.box('选几样食材看看。');
        const cut = document.createElement('input');
        cut.type = 'checkbox';
        const lab = document.createElement('label');
        lab.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:12px;opacity:.85;margin:2px 0 6px';
        lab.appendChild(cut);
        lab.appendChild(document.createTextNode('切好并调过味（看能不能做到完美）'));
        pane.body.insertBefore(lab, out);
        const tryPot = (): void => {
          const items = picks.map((p) => p.value).filter(Boolean);
          if (!items.length) return void (out.textContent = '选几样食材看看。');
          const o = cook({ way: way.value as Way, items, done: 1, cut: cut.checked ? 1 : 0, seasoned: cut.checked });
          out.textContent = o.fail
            ? `失败料理：${o.zh}（饱腹 +${o.food}）`
            : `${o.perfect ? '完美的' : ''}${o.zh} ${'★'.repeat(o.stars)} · 饱腹 +${o.food}${o.servings > 1 ? ` · ${o.servings} 份` : ''}`;
        };
        for (const s of [way, cut, ...picks]) s.addEventListener('change', tryPot);
        pane.heading('拿一道菜');
        const row2 = document.createElement('div');
        row2.className = 'btns two';
        const dish = document.createElement('select');
        dish.style.cssText = 'background:#1d2127;color:#e8e8e8;border:1px solid #3a4048;border-radius:4px;padding:3px 4px;font:inherit;min-width:0';
        for (const d of [...DISHES].sort((a, b) => a.stars - b.stars)) {
          const o = document.createElement('option');
          o.value = d.id;
          o.textContent = `${'★'.repeat(d.stars)} ${d.zh}`;
          dish.appendChild(o);
        }
        for (const k of ['mess', 'burnt', 'raw']) {
          const o = document.createElement('option');
          o.value = k;
          o.textContent = `失败 · ${itemDef(dishItem(k)).name.zh}`;
          dish.appendChild(o);
        }
        row2.appendChild(dish);
        const btn = document.createElement('button');
        btn.textContent = '拿到手上';
        btn.addEventListener('click', () => {
          const ctx = ctx0();
          if (!ctx) return;
          const id = dishItem(dish.value);
          give(ctx, newItem(id, { state: { meal: { food: 30, ware: PLATE } } }));
          say(`给了${itemDef(id).name.zh}。`);
        });
        row2.appendChild(btn);
        pane.body.appendChild(row2);
      }
      box = pane.box(status());
    },
    tick() {
      if (box) box.textContent = status();
    },
  };
}
