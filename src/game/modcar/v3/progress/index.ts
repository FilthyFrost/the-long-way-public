/**
 * The progress module (node W3 opens it for foraging; node P1 builds the whole of progression on it): it owns
 * the game's one Progress — the skills' experience and the compendium (src/core/v3/progress/progress.ts) —
 * keeps it in the save as the slice "progress", brings out the lines said about it one at a time, and gives
 * the developer a tab, 成长, to set a skill's level and to learn or forget everything of a field of the
 * compendium.
 *
 * What other modules call is api.ts beside this file: the Progress, the helpers that change it and say so on
 * the event bus, and `announce`. This file is only the module: a system that brings the waiting lines out,
 * the slice, the tab.
 *
 * It imports in plain Node; nothing here touches the page.
 */
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { System } from '../../../../core/kernel/systems';
import { levelShare, skills, xpForLevel } from '../../../../core/v3/progress/progress';
import { SKILL_MAX_LEVEL, type ProgressSave } from '../../../../core/v3/progress/types';
import type { GameContext } from '../../kernel/context';
import type { DevButton, DevTab } from '../../kernel/devTabs';
import type { GameModule } from '../../kernel/modules';
import { clearLines, domains, forgetDomain, learnMany, linesWaiting, progress, progressChanged, setSkillLevel, stepLines } from './api';

/** the game the module is installed in (null until the system is set up, and after it is taken down) */
let game: GameContext | null = null;

// ------------------------------------------------------------------ the system

const system: System<GameContext> = {
  id: 'progress',
  budget: { cpuMs: 0.02 },
  // (a game begins with nothing learnt: the save's slice, read after every init, brings back what was)
  init: (ctx) => {
    game = ctx;
    progress.clear();
    progressChanged();
    clearLines(true);
  },
  lateUpdate: (dt, ctx) => stepLines(dt, ctx),
  dispose: () => {
    game = null;
    clearLines(false);
  },
  telemetry: () => {
    const out: Record<string, unknown> = { lines: linesWaiting() };
    for (const s of skills()) out[s.id] = { level: progress.level(s.id), xp: progress.xp(s.id) };
    for (const d of domains()) out[`known:${d.id}`] = progress.tally(d.id);
    return out;
  },
  // for test scripts: game.systems.harness('progress', name, ...args)
  harness: {
    level: (skill: unknown) => progress.level(String(skill)),
    xp: (skill: unknown) => progress.xp(String(skill)),
    hasPerk: (perk: unknown) => progress.hasPerk(String(perk)),
    knowledge: (domain: unknown, id: unknown) => progress.knowledge(String(domain), String(id)),
    tally: (domain: unknown) => progress.tally(String(domain)),
    setLevel: (skill: unknown, level: unknown) => (game ? setSkillLevel(game, String(skill), Number(level)) : 0),
    learnAll: (domain: unknown) => learnAll(String(domain)),
    forgetAll: (domain: unknown) => forgetDomain(String(domain)),
  },
};

/** everything of a domain known from now on (the developer's hand: 'told'); how many were news */
function learnAll(domain: string): number {
  const d = domains().find((x) => x.id === domain);
  return d && game ? learnMany(game, domain, d.ids(), 'told') : 0;
}

// ------------------------------------------------------------------ the save slice

/**
 * The skills' experience by skill and the compendium's entries that are not "never met": a few dozen bytes an
 * entry, so with every thing of every field met it is a few kilobytes and grows no further.
 */
const slice: SaveSlice<ProgressSave> = {
  id: 'progress',
  version: 1,
  snapshot: () => progress.snapshot(),
  restore: (data) => {
    progress.restore(data);
    progressChanged();
  },
  clear: () => {
    progress.clear();
    progressChanged();
  },
};

// ------------------------------------------------------------------ the developer's tab

/** the boxes kept up to date while the tab shows: one a skill, one a field of the compendium */
const skillBoxes = new Map<string, { textContent: string | null }>();
const domainBoxes = new Map<string, { textContent: string | null }>();

function skillWords(id: string): string {
  const def = skills().find((s) => s.id === id);
  if (!def) return '';
  const xp = progress.xp(id);
  const level = progress.level(id);
  const next = level < SKILL_MAX_LEVEL ? `到 ${level + 1} 级还差 ${Math.max(0, Math.ceil(xpForLevel(level + 1) - xp))}（这一级走了 ${Math.round(levelShare(xp) * 100)}%）` : '满级';
  const perks = def.perks.filter((p) => progress.hasPerk(p.id)).map((p) => p.name.zh);
  return `${def.name.zh} · ${level} 级 · 经验 ${Math.round(xp)} · ${next}${perks.length ? ` · 已有：${perks.join('、')}` : ''}`;
}

function domainWords(id: string): string {
  const d = domains().find((x) => x.id === id);
  if (!d) return '';
  const t = progress.tally(id);
  return `${d.name.zh}：共 ${d.ids().length} 种 · 见过或认得 ${t.met} 种 · 认得 ${t.known} 种`;
}

const tab: DevTab = {
  id: 'progress',
  title: '成长',
  order: 20,
  sub: '技能与图鉴',
  build: (pane) => {
    skillBoxes.clear();
    domainBoxes.clear();
    const say = pane.message();
    pane.heading('技能');
    if (skills().length === 0) pane.note('还没有哪个系统登记技能。');
    for (const s of skills()) {
      skillBoxes.set(s.id, pane.box(skillWords(s.id)));
      const to = (label: string, level: () => number, tip?: string): DevButton => ({
        label,
        tip,
        click: () => {
          if (!game) return say('游戏还没开始。', true);
          const now = setSkillLevel(game, s.id, level());
          say(`${s.name.zh}现在 ${now} 级。`);
          tab.tick?.();
        },
      });
      pane.buttons(
        [
          to('−1 级', () => progress.level(s.id) - 1),
          to('+1 级', () => progress.level(s.id) + 1),
          to('1 级', () => 1, '回到刚开始的样子。'),
          ...[5, 10, 15, 20].map((l) => to(`${l} 级`, () => l, s.perks.filter((p) => p.level === l).map((p) => `<b>${p.name.zh}</b><br>${p.blurb.zh}`).join('<br>') || undefined)),
        ],
      );
    }
    pane.heading('图鉴');
    if (domains().length === 0) pane.note('还没有哪个系统登记图鉴。');
    for (const d of domains()) {
      domainBoxes.set(d.id, pane.box(domainWords(d.id)));
      pane.buttons(
        [
          {
            label: `${d.name.zh}：全部认得`,
            go: true,
            tip: '这一类的每一种都算认识了（名字、卡片都显示真的）。',
            click: () => {
              say(`${d.name.zh}：新认得 ${learnAll(d.id)} 种。`);
              tab.tick?.();
            },
          },
          {
            label: `${d.name.zh}：全部忘掉`,
            tip: '这一类回到一种都没见过的样子。靠技能等级认得的那些仍然认得。',
            click: () => {
              say(`${d.name.zh}：忘掉了 ${forgetDomain(d.id)} 条。`);
              tab.tick?.();
            },
          },
        ],
        2,
      );
    }
    pane.note('技能靠做事涨经验，二十级，5、10、15、20 级各有一样新本事。图鉴记着见过什么、认得什么；都在存档里。');
  },
  tick: () => {
    for (const [id, box] of skillBoxes) box.textContent = skillWords(id);
    for (const [id, box] of domainBoxes) box.textContent = domainWords(id);
  },
};

export default { id: 'progress', systems: [system], slices: [slice], devTabs: [tab] } satisfies GameModule;
