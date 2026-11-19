/**
 * The developer's tab 采集 of the forage module (node W3): everything of the system within a click. A grid of
 * the eighty kinds by category (a click puts a full stack into the hands; a switch says whether the kind is
 * also known from then on), the tools and the pages of the compendium, "regrow everything", rain and the end
 * of it, the tide now and the next low tide, the kinds that grow in the region one stands in (read from that
 * region's flora table), and a switch that marks every point within 150 m.
 *
 * It is made of the panel's own pieces (kernel/devTabs.ts DevPane), so it builds in the tests' stand-in too.
 */
import { BIOMES } from '../../../../core/world/biomes';
import { itemDef, newItem, stackMax } from '../../../../core/modcar/items';
import { FORAGE_KINDS } from '../../../../core/v3/forage/kinds';
import { tideAt } from '../../../../core/v3/forage/rules';
import { FORAGE_CATS, LOW_TIDE, type ForageCat } from '../../../../core/v3/forage/types';
import type { FloraTable } from '../../../../core/world/flora';
import { floraTableOf } from '../../../../core/world/floraTables';
import { plantDef } from '../../../../core/world/plants';
import { TerrainPoint, type World } from '../../../../core/world/terrain';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import { learn, progress } from '../progress/api';
import { BASKET, FORAGE_CAT_ORDER, FORAGE_DOMAIN, FORAGE_SKILL_ID, KNIFE, pageId, SICKLE, TROWEL } from './content';
import { KIND_INDEX, nameNow } from './knowledge';
import { MARK_M, type Forage } from './system';

const RARITY_ZH = { common: '常见', uncommon: '少见', rare: '稀有', legendary: '传说' } as const;
const WHEN_ZH = (k: (typeof FORAGE_KINDS)[number]): string => {
  const w = k.when;
  if (!w) return '';
  const out: string[] = [];
  if (w.afterRain) out.push('雨后多一倍');
  if (w.hours) out.push(`${w.hours[0]}–${w.hours[1]} 点`);
  if (w.lowTide) out.push('退潮时');
  return out.join('、');
};

/** the forage kinds a region's flora table can grow: what its trees, shrubs and ground plants bear */
export function kindsOfTable(t: FloraTable): string[] {
  const out = new Set<string>();
  for (const rules of [t.trees, t.shrubs, t.ground]) {
    for (const r of rules) {
      const b = plantDef(r.plant).bears;
      if (b) out.add(b.forage);
    }
  }
  return FORAGE_KINDS.filter((k) => out.has(k.id)).map((k) => k.id);
}

/** the region under a place of the world: its index in the registry */
function regionAt(world: World, x: number, z: number, tp: TerrainPoint): number {
  world.shape(x, z, tp);
  return tp.bt > 0.5 ? tp.bb : tp.ba;
}

export function forageTab(forage: Forage, game: () => GameContext | null): DevTab {
  /** a thing given through the tab is also known from then on */
  let known = true;
  let box: { textContent: string | null } | null = null;
  let regionBox: { textContent: string | null } | null = null;
  let regionShown = -2;
  const tp = new TerrainPoint();

  /** a thing into the hands as a pick would hand it over; what does not go in is put down by the feet */
  const give = (ctx: GameContext, id: string, n: number): number => {
    const d = itemDef(id);
    const item = newItem(id, { ...(n > 1 ? { n } : {}), ...(d.perish ? { t0: ctx.clock.worldSeconds } : {}), ...(KIND_INDEX.has(id) ? { q: 2 } : {}) });
    const left = ctx.player.receive({ kind: 'item', item });
    if (left > 0) {
      const w = ctx.player.walker;
      ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.5, w.y + 0.9, w.z + Math.sin(w.heading) * 0.5, w.heading));
    }
    return left;
  };

  const status = (): string => {
    const ctx = game();
    if (!ctx) return '游戏还没开始。';
    const world = ctx.world;
    const t = forage.telemetry() as { found: number; shown: number; picked: number; sinceRainH: number | null };
    const tide = forage.tide();
    // (the tide a quarter of an hour on: whether it rises)
    const rising = tideAt(ctx.clock.worldSeconds + 900) > tide.tide;
    const where = !world ? '还没有世界（在车库里）' : !world.flora ? '第 1 版世界：这里没有采集' : `附近 ${Math.round(forage.mark ? MARK_M : 70)} 米内 ${t.found} 株能结东西，现在看得到 ${t.shown} 个`;
    const rain = t.sinceRainH === null ? '还没下过雨' : `离上次下雨 ${t.sinceRainH.toFixed(1)} 小时`;
    const low = tide.tide <= LOW_TIDE ? '现在是退潮' : `下次退潮还有 ${(tide.nextLowS / 3600).toFixed(1)} 小时`;
    return `${where} · 采过还没长回来 ${t.picked} 个 · ${rain} · 潮水 ${tide.tide >= 0 ? '+' : ''}${tide.tide.toFixed(2)}（${rising ? '在涨' : '在落'}），${low} · 采集 ${progress.level(FORAGE_SKILL_ID)} 级`;
  };

  const regionWords = (): string => {
    const ctx = game();
    const world = ctx?.world;
    if (!ctx || !world) return '还没有世界。';
    const w = ctx.player.walker;
    const v = ctx.seated;
    const r = regionAt(world, v ? v.sim.px : w.x, v ? v.sim.pz : w.z, tp);
    regionShown = r;
    const b = BIOMES[r];
    if (!b) return '这里不属于哪个区域。';
    if (!world.flora) return `${b.label}：第 1 版世界，植被不由植被场决定，没有采集。`;
    const kinds = kindsOfTable(floraTableOf(b.id, b.kin));
    const by = new Map<ForageCat, string[]>();
    for (const id of kinds) {
      const k = FORAGE_KINDS[KIND_INDEX.get(id)!];
      const list = by.get(k.cat) ?? [];
      list.push(k.name.zh);
      by.set(k.cat, list);
    }
    const lines = FORAGE_CAT_ORDER.filter((c) => by.has(c)).map((c) => `${FORAGE_CATS[c].name.zh}：${by.get(c)!.join('、')}`);
    return `${b.label}（${kinds.length} 种）\n${lines.join('\n')}`;
  };

  const tab: DevTab = {
    id: 'forage',
    title: '采集',
    order: 10,
    sub: '八十种野货：长在哪、怎么采',
    build: (pane) => {
      const say = pane.message();
      const need = (): GameContext | null => {
        const ctx = game();
        if (!ctx) say('游戏还没开始。', true);
        return ctx;
      };
      pane.heading('现在');
      box = pane.box(status());
      pane.heading('动手');
      pane.buttons(
        [
          { label: '全部重新长出', go: true, tip: '所有采过的点马上重新结果。', click: () => say(`${forage.regrowAll()} 个采过的点重新长出来了。`) },
          {
            label: '下雨',
            tip: '天气改成下雨，并且算作「刚下过雨」：雨后才冒头的那一半蘑菇马上出来（十二个游戏小时内都在）。',
            click: () => {
              forage.rain(true);
              say('下雨了：雨后的蘑菇冒头了。');
            },
          },
          {
            label: '雨停',
            tip: '天气交还给预报。刚下过的雨照样算数。',
            click: () => {
              forage.rain(false);
              say('天气交还给预报了。');
            },
          },
        ],
        3,
      );
      pane.buttons(
        [
          {
            label: '标出 150 米内的采集点：关',
            tip: '打开后，150 米内每一个现在采得到的点都顶着一颗亮星，远近都看得见。',
            click: (b) => {
              forage.mark = !forage.mark;
              b.textContent = `标出 150 米内的采集点：${forage.mark ? '开' : '关'}`;
              b.classList?.toggle('on', forage.mark);
            },
          },
          {
            label: '调出来的同时认得它：开',
            tip: '开：点下面的格子，这种东西从此认得。关：只给东西，认不认得照旧（用来试「不认识的蘑菇」）。',
            click: (b) => {
              known = !known;
              b.textContent = `调出来的同时认得它：${known ? '开' : '关'}`;
              b.classList?.toggle('on', known);
            },
          },
        ],
        2,
      );
      pane.heading('工具与图鉴页');
      const one = (id: string): DevButton => ({
        label: itemDef(id).name.zh.replace('图鉴页：', '页·'),
        tip: `<b>${itemDef(id).name.zh}</b><br>${itemDef(id).blurb}`,
        click: () => {
          const ctx = need();
          if (!ctx) return;
          const left = give(ctx, id, 1);
          say(left > 0 ? `${itemDef(id).name.zh}：手上拿不下，放在脚边了。` : `${itemDef(id).name.zh}到手了。`);
        },
      });
      pane.buttons([KNIFE, TROWEL, SICKLE, BASKET].map(one));
      pane.buttons(FORAGE_CAT_ORDER.map((c) => one(pageId(c))));
      for (const cat of FORAGE_CAT_ORDER) {
        const kinds = FORAGE_KINDS.filter((k) => k.cat === cat);
        pane.heading(`${FORAGE_CATS[cat].name.zh}（${kinds.length}）`);
        pane.buttons(
          kinds.map((k) => ({
            label: k.name.zh,
            tip: `<b>${k.name.zh}</b> ${k.name.en} · ${RARITY_ZH[k.rarity]}${WHEN_ZH(k) ? ` · ${WHEN_ZH(k)}` : ''}<br>${k.blurb}<br>${k.where.zh}<br>一株 ${k.yield[0]}–${k.yield[1]} 份 · ${k.regrowDays} 天长回来${k.tool ? ` · 工具：${{ knife: '小刀', trowel: '小铲', sickle: '镰刀' }[k.tool]}` : ''}`,
            click: () => {
              const ctx = need();
              if (!ctx) return;
              if (known) learn(ctx, FORAGE_DOMAIN, k.id, 'told', { quiet: true });
              const n = stackMax(k.id);
              const left = give(ctx, k.id, n);
              const name = nameNow(KIND_INDEX.get(k.id)!).zh;
              say(left > 0 ? `${name} ×${n}：手上只拿得下 ${n - left} 个，其余放在脚边了。` : `${name} ×${n} 到手了。`);
            },
          })),
        );
      }
      pane.heading('这片区域长什么');
      const made = pane.box(regionWords());
      // (one category a line; the stand-in pane of the tests has no style to set)
      if (made.style) made.style.whiteSpace = 'pre-line';
      regionBox = made;
      pane.note('采集点不是存出来的，是世界的植被场算出来的：这里列的是脚下这种区域的植物表里能结东西的植物。雨后、清晨、夜里、退潮各有各的条件。');
    },
    tick: () => {
      if (box) box.textContent = status();
      const ctx = game();
      const world = ctx?.world;
      if (regionBox && ctx && world) {
        const w = ctx.player.walker;
        const v = ctx.seated;
        if (regionAt(world, v ? v.sim.px : w.x, v ? v.sim.pz : w.z, tp) !== regionShown) regionBox.textContent = regionWords();
      }
    },
  };
  return tab;
}
