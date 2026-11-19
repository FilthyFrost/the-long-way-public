/**
 * The developer's tab 烹饪 of the cooking module (node C1): everything of cooking within a click — every
 * ingredient by its class (a stack into the hands: forage, the packed foods, the cuts of meat and the eggs;
 * fish once fishing registers their items), the cookware and the recipe pages, a fire here (a camp stove set
 * down at one's feet, with a pot and a pan), every recipe with "cook it now" (at once, three stars) and "teach
 * all", every buff with "give it", and the buffs now with their time.
 *
 * It is made of the panel's own pieces (kernel/devTabs.ts DevPane), so it builds in the tests' stand-in too.
 */
import { hasItem, itemDef, newItem, stackMax } from '../../../../core/modcar/items';
import { BUFFS } from '../../../../core/v3/cooking/buffs';
import { ingredients } from '../../../../core/v3/cooking/ingredients';
import { RECIPES } from '../../../../core/v3/cooking/recipes';
import type { BuffId, IngClass } from '../../../../core/v3/cooking/types';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import { forgetDomain, learn, learnMany, progress, progressChanged } from '../progress/api';
import { COOK_DOMAIN, COOK_SKILL_ID, DISH_CLASS_NAME, DISH_CLASSES, recipePageId } from './content';
import type { Cooking } from './system';

const CLASS_ZH: Readonly<Record<IngClass, string>> = { meat: '肉', poultry: '禽', fish: '鱼', shellfish: '贝', egg: '蛋', mushroom: '菌', veg: '菜', root: '根茎', fruit: '果', grain: '谷', nut: '坚果', herb: '香草', spice: '香料', flower: '花', sweet: '甜', liquid: '水与饮料' };
const CLASS_ORDER: readonly IngClass[] = ['mushroom', 'veg', 'root', 'fruit', 'grain', 'nut', 'herb', 'spice', 'flower', 'sweet', 'egg', 'meat', 'poultry', 'fish', 'shellfish', 'liquid'];
const COOKWARE = ['cook_bowl', 'cook_spit', 'cook_grill', 'cook_pan', 'cook_wok', 'cook_steamer', 'cook_pot', 'cook_dutch_oven', 'cook_kettle', 'cook_board', 'cook_mortar', 'cook_stove', 'cook_rack', 'cook_smoker', 'cook_jar', 'cook_cooler'];

export function cookingTab(c: Cooking, game: () => GameContext | null): DevTab {
  let box: { textContent: string | null } | null = null;

  /** a thing into the hands; what does not go in is put down by the feet */
  const give = (ctx: GameContext, id: string, n: number): number => {
    const d = itemDef(id);
    const item = newItem(id, { ...(n > 1 ? { n } : {}), ...(d.perish ? { t0: ctx.clock.worldSeconds } : {}), q: 2 });
    const left = ctx.player.receive({ kind: 'item', item });
    if (left > 0) {
      const w = ctx.player.walker;
      ctx.loose.drop(ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.5, w.y + 0.9, w.z + Math.sin(w.heading) * 0.5, w.heading));
    }
    return left;
  };

  /** a thing set down a step ahead of one's feet */
  const putDown = (ctx: GameContext, id: string, ahead: number, side: number): void => {
    const w = ctx.player.walker;
    const co = Math.cos(w.heading);
    const si = Math.sin(w.heading);
    ctx.loose.drop(ctx.loose.addItem(newItem(id), w.x + co * ahead - si * side, w.y + 0.6, w.z + si * ahead + co * side, w.heading));
  };

  const status = (): string => {
    const ctx = game();
    if (!ctx) return '游戏还没开始。';
    const t = c.telemetry() as { stations: number; pots: number; open: string | null; buffs: string[]; cooked: number };
    const known = RECIPES.filter((r) => progress.knowledge(COOK_DOMAIN, r.id) === 2).length;
    const m = ctx.bodyMods;
    const mods = `饥饿 ×${m.foodK.toFixed(2)} 口渴 ×${m.waterK.toFixed(2)} 体力 ×${m.staminaK.toFixed(2)} 保暖 +${m.warmth.toFixed(0)} 热天口渴 ×${m.heatWaterK.toFixed(2)}`;
    return `附近的灶 ${t.stations} 个，锅里有东西的 ${t.pots} 个${t.open ? `，正开着 ${t.open}` : ''} · 认得的菜谱 ${known} / ${RECIPES.length} · 做过的菜谱 ${t.cooked} 种 · 烹饪 ${progress.level(COOK_SKILL_ID)} 级\n增益：${t.buffs.length ? t.buffs.join('、') : '没有'}\n身体：${mods}`;
  };

  const tab: DevTab = {
    id: 'cooking',
    title: '烹饪',
    order: 12,
    sub: '食材、厨具、150 道菜、增益',
    build: (pane) => {
      const say = pane.message();
      const need = (): GameContext | null => {
        const ctx = game();
        if (!ctx) say('游戏还没开始。', true);
        return ctx;
      };
      pane.heading('现在');
      const made = pane.box(status());
      if ((made as HTMLElement).style) (made as HTMLElement).style.whiteSpace = 'pre-line';
      box = made;
      pane.heading('动手');
      pane.buttons(
        [
          {
            label: '在这里生火',
            go: true,
            tip: '脚前放一个便携灶，旁边放一口汤锅和一把平底锅：对着灶头按 E 就能做饭。',
            click: () => {
              const ctx = need();
              if (!ctx) return;
              putDown(ctx, 'cook_stove', 1.3, 0);
              putDown(ctx, 'cook_pot', 1.2, 0.7);
              putDown(ctx, 'cook_pan', 1.2, -0.7);
              c.lookNow();
              say('便携灶放好了，旁边有汤锅和平底锅。');
            },
          },
          {
            label: '全部菜谱都会',
            tip: '150 道菜谱从此都认得（做过的次数不变）。',
            click: () => {
              const ctx = need();
              if (!ctx) return;
              const n = learnMany(ctx, COOK_DOMAIN, RECIPES.map((r) => r.id), 'told');
              say(`学会了 ${n} 道菜谱。`);
            },
          },
          {
            label: '忘掉全部菜谱',
            tip: '菜谱图鉴清空，做过的次数也清零：用来试「？」和第一次做出来。',
            click: () => {
              forgetDomain(COOK_DOMAIN);
              c.cooked.clear();
              progressChanged();
              say('菜谱都忘了。');
            },
          },
        ],
        3,
      );
      pane.buttons(
        [
          {
            label: '清掉所有增益',
            click: () => {
              c.buffs.clear();
              say('增益都没了。');
            },
          },
          {
            label: '关上做饭面板',
            click: () => {
              c.closePanel();
              say('关上了。');
            },
          },
        ],
        2,
      );
      pane.heading('厨具与菜谱页');
      const one = (id: string): DevButton => ({
        label: itemDef(id).name.zh.replace('菜谱页：', '页·'),
        tip: `<b>${itemDef(id).name.zh}</b><br>${itemDef(id).blurb}`,
        click: () => {
          const ctx = need();
          if (!ctx) return;
          const left = give(ctx, id, 1);
          say(left > 0 ? `${itemDef(id).name.zh}：手上拿不下，放在脚边了。` : `${itemDef(id).name.zh}到手了。`);
        },
      });
      pane.buttons(COOKWARE.map(one));
      pane.buttons(DISH_CLASSES.map((cls) => one(recipePageId(cls))));
      pane.heading('食材（点一下给一叠）');
      const all = ingredients().filter((i) => hasItem(i.item));
      for (const cls of CLASS_ORDER) {
        const list = all.filter((i) => i.cls === cls);
        if (!list.length) continue;
        pane.heading(`${CLASS_ZH[cls]}（${list.length}）`);
        pane.buttons(
          list.map((i) => ({
            label: itemDef(i.item).name.zh,
            tip: `<b>${itemDef(i.item).name.zh}</b> · ${CLASS_ZH[i.cls]} · 一份 ${i.food} 点${i.raw ? '' : ' · 不能生吃'}<br>味道：咸${i.taste[0]} 甜${i.taste[1]} 酸${i.taste[2]} 辣${i.taste[3]} 鲜${i.taste[4]}`,
            click: () => {
              const ctx = need();
              if (!ctx) return;
              const n = Math.min(5, stackMax(i.item));
              // (a forage kind handed out is known too: the tab is for cooking, not for the veil)
              learn(ctx, 'forage', i.item, 'told', { quiet: true });
              const left = give(ctx, i.item, n);
              say(left > 0 ? `${itemDef(i.item).name.zh} ×${n}：拿不下的放在脚边了。` : `${itemDef(i.item).name.zh} ×${n} 到手了。`);
            },
          })),
        );
      }
      pane.heading('菜谱（点一下：马上做好一份，三星）');
      for (const cls of DISH_CLASSES) {
        const list = RECIPES.filter((r) => r.cls === cls);
        if (!list.length) continue;
        pane.heading(`${DISH_CLASS_NAME[cls].zh}（${list.length}）`);
        pane.buttons(
          list.map((r) => ({
            label: r.name.zh,
            tip: `<b>${r.name.zh}</b> ${r.name.en} · ${r.method}<br>${r.blurb}<br>增益：${BUFFS[r.buff].name.zh} ${Math.round(r.buffS / 60)} 分钟${progress.knowledge(COOK_DOMAIN, r.id) === 2 ? '' : ' · 还不认得'}`,
            click: () => {
              const ctx = need();
              if (!ctx) return;
              const d = c.cookNow(r.id, 3);
              say(d ? `${d.name.zh} ×${d.servings} 做好了。` : '做不出来。', !d);
            },
          })),
        );
      }
      pane.heading('增益（点一下：给五分钟）');
      pane.buttons(
        (Object.keys(BUFFS) as BuffId[]).map((id) => ({
          label: BUFFS[id].name.zh,
          tip: `<b>${BUFFS[id].name.zh}</b><br>${BUFFS[id].blurb.zh}`,
          click: () => {
            const ctx = need();
            if (!ctx) return;
            c.grant(ctx, id, 300, 'meal');
            say(`${BUFFS[id].name.zh} 五分钟。`);
          },
        })),
      );
      pane.note('做饭：对着篝火、放在地上的便携灶（灶头上方）、车库门口左边的厨房角按 E。做法由手边的锅决定；随便下锅也能出菜，碰巧是一道菜谱就学会了。');
    },
    tick: () => {
      if (box) box.textContent = status();
    },
  };
  return tab;
}
