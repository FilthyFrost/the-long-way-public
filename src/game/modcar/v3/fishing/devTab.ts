/**
 * The developer's tab 钓鱼 of the fishing module (docs/V3/plan/fishing.md): off to any of the ten waters at a click
 * (standing on the shore by its jetty; a water of another world opens the page in that world); a rod with its bait and
 * a creel into the hands, or any rod, any bait, a creel, a bottle, a crate; the water's sky moment called now, its pond
 * stocked afresh, a fish sent to the float. Its box says where one is and what the pond holds.
 */
import { newItem, putInside, type ItemInstance } from '../../../../core/modcar/items';
import { FISH } from '../../../../core/v3/fishing/lite/fish';
import { BAITS, RODS } from '../../../../core/v3/fishing/lite/gear';
import { BOTTLE, CREEL, CRATE } from '../../../../core/v3/fishing/lite/items';
import { crateContents } from '../../../../core/v3/fishing/lite/log';
import { SPOTS } from '../../../../core/v3/fishing/lite/spots';
import { TIERS } from '../../../../core/v3/fishing/lite/types';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { DevTab } from '../../kernel/devTabs';
import type { Fishing } from './system';

/** a thing into the hands, or at one's feet when they are full */
function give(ctx: GameContext, item: ItemInstance): void {
  if (ctx.player.receive({ kind: 'item', item }) > 0) {
    const w = ctx.player.walker;
    ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.6, w.y + 0.9, w.z + Math.sin(w.heading) * 0.6, w.heading));
  }
}

/** a crate off a wreck as one would come up out of this water */
function crateFill(spot: number): ItemInstance {
  const c = newItem(CRATE);
  const now = itemNow();
  for (const [what, n] of crateContents(spot, Math.random())) putInside(c, newItem(what, n > 1 ? { n } : {}), now);
  return c;
}

/** the page again, in the world of a water, sent there */
function reloadTo(spot: number): void {
  const q = new URLSearchParams(location.search);
  q.set('seed', String(SPOTS[spot].seed));
  q.set('world', '5');
  q.set('fish', String(spot));
  location.search = q.toString();
}

export function fishingTab(sys: Fishing, game: () => GameContext | null): DevTab {
  let box: HTMLElement | null = null;
  return {
    id: 'fishing',
    title: '钓鱼',
    order: 30,
    sub: '鱼竿、鱼饵和十片钓场',
    build(pane) {
      const say = pane.message();
      const at = (f: (ctx: GameContext) => void) => () => {
        const ctx = game();
        if (ctx) f(ctx);
      };
      pane.heading('去钓场');
      pane.note('站到那片湖的栈桥边上。别的世界里的湖，会换到那个世界重新打开页面。');
      pane.buttons(
        SPOTS.map((sp, i) => ({
          label: `${i + 1} ${sp.zh}`,
          tip: `${sp.blurb}<br>天象：${sp.eventZh}`,
          click: at((ctx) => {
            if (sys.goTo(ctx, i)) say(`去${sp.zh}`);
            else reloadTo(i);
          }),
        })),
        2,
      );
      pane.heading('拿东西');
      pane.buttons(
        [
          { label: '一套：竿 + 蚯蚓 + 鱼篓', go: true, tip: '「柳枝」竹竿挂好 40 条蚯蚓，再加一个鱼篓', click: at((ctx) => sys.giveKit(ctx)) },
          { label: '鱼篓', click: at((ctx) => give(ctx, newItem(CREEL))) },
          { label: '漂流瓶', click: at((ctx) => give(ctx, { ...newItem(BOTTLE), state: { bottle: { s: Math.max(0, sys.spot) } } })) },
          { label: '沉船木箱', click: at((ctx) => give(ctx, crateFill(Math.max(0, sys.spot)))) },
        ],
        2,
      );
      pane.heading('鱼竿（空钩）');
      pane.buttons(RODS.map((r) => ({ label: r.zh.replace(/「|」/g, ''), tip: `力量 ${r.power} · 抛 ${r.cast} 米 · 收线 ${r.reel} 米/秒<br>${r.note}`, click: at((ctx) => give(ctx, newItem(r.id))) })), 2);
      pane.heading('鱼饵');
      pane.buttons(
        BAITS.map((b) => ({
          label: b.zh,
          tip: `只钓${TIERS[b.tier]?.zh ?? ''}的鱼<br>${b.note}`,
          click: at((ctx) => give(ctx, newItem(`bait_${b.id}`, b.lure ? {} : { n: Math.min(40, b.pack * 2) }))),
        })),
        3,
      );
      pane.heading('钓竿挂好的饵');
      pane.buttons(
        [
          { label: '亮片 + 碳素竿', click: at((ctx) => sys.giveKit(ctx, 'rod_swift', 'bait_spoon', 1)) },
          { label: '河虾 + 专业竿', click: at((ctx) => sys.giveKit(ctx, 'rod_pro', 'bait_shrimp', 20)) },
          { label: '鱿鱼条 + 海竿', click: at((ctx) => sys.giveKit(ctx, 'rod_sea', 'bait_squid_strip', 20)) },
          { label: '星屑饵 + 专业竿', click: at((ctx) => sys.giveKit(ctx, 'rod_pro', 'bait_stardust', 5)) },
        ],
        3,
      );
      pane.heading('这片钓场');
      pane.buttons(
        [
          { label: '叫出天象', tip: '这片钓场的天象马上来，持续 45 游戏分钟', click: at((ctx) => sys.forceMoment(ctx)) },
          { label: '重新放鱼', click: at((ctx) => sys.restock(ctx)) },
          { label: '让一条鱼来咬', tip: '浮漂在水里时：最近的一条鱼马上游过来', click: () => say(sys.rush() ? '来了一条' : '先把浮漂抛进水里', false) },
        ],
        3,
      );
      box = pane.box();
    },
    tick() {
      const ctx = game();
      if (!box || !ctx) return;
      const t = sys.telemetry();
      const pond = sys.spot >= 0 ? sys.pondCensus() : null;
      const lines = [
        sys.spot >= 0 ? `在 ${SPOTS[sys.spot].zh}（第 ${sys.spot + 1} 片）· 天象「${SPOTS[sys.spot].eventZh}」${t.moment ? '正在' : '没有'}` : '不在十片钓场边上',
        `钩上：${t.hook || '没饵'} · ${t.phase || '—'}${t.phase === 'fight' ? ` · 张力 ${t.tension}` : ''}`,
        pond ? `塘里 ${pond.n} 条：${TIERS.map((x, i) => `${x.zh} ${pond.tiers[i]}`).join(' · ')}${pond.lord ? ' · 湖主在' : ''}${pond.sky ? ' · 天象鱼在' : ''}` : '',
        `抛了 ${t.casts} 竿 · 钓上 ${t.catches} 条 · 图鉴 ${FISH.filter((f) => (sys.log.kinds[f.id]?.n ?? 0) > 0).length}/${FISH.length}`,
      ];
      box.textContent = lines.filter(Boolean).join('\n');
      void itemNow;
      void putInside;
    },
  };
}
