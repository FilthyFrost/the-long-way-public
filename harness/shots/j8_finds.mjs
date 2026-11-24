// J8 (docs/V3/plan/growth.md §六 3–5), in the game: the first cassette stove and the first coffee machine of world 7 are
// where the plan puts them — in a box at the place of their sort the plan's planner chose (the same the robot traveller
// counts) — found there (the box opened, the thing in it aimed at: its mark and its card on screen), their cards saying
// what goes with them (配套).
//   SHOTS_GPU=1 node harness/shots/j8_finds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j8_finds');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=200&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f, lit = true) => {
    await page.evaluate(async (lit) => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!lit) g.player.clearHighlight();
      for (let i = 0; i < 2; i++) window.__rt.render();
    }, lit);
    await page.screenshot({ path: path.join(out, f) });
  };
  // where the plan puts its things in this world (its planner over its places, as the game lays them)
  const where = await page.evaluate(async () => {
    const S = await import('/src/core/modcar/schedule.ts');
    const L = await import('/src/core/modcar/loot.ts');
    const g = window.__rt.game;
    const finds = S.placesPlan(g.params.seed, 4000, g.difficulty);
    const planner = new S.SitePlanner(finds);
    const sites = [];
    g.world.sites.between(0, 60000, sites);
    sites.sort((a, b) => a.s - b.s);
    planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: L.planBoxes(x).length, ground: L.planGround(x) })));
    const at = (entry) => {
      for (const x of sites) {
        const list = planner.findsAt(x.id);
        const k = list.findIndex((f) => f.entry === entry);
        if (k >= 0 && L.planBoxes(x).length) return { id: x.id, s: x.s, kind: x.kind, box: L.planBoxes(x)[L.boxesOfFinds(x, list)[k]].id, due: list[k].s };
      }
      return null;
    };
    return { stove: at('stove'), coffee: at('coffee'), fuel: at('fuel') };
  });
  console.log('the plan:', JSON.stringify(where));
  // at the place, its containers laid out (their things where one sees them)
  const goTo = async (w) => {
    await rt('devGoKm', w.s / 1000, false);
    for (let k = 0; k < 80; k++) {
      await rt('simulate', 0.25);
      const p = await rt('places');
      const lp = p?.live?.find((x) => x.id === w.id);
      if (lp && lp.laid === lp.containers) return true;
      await page.waitForTimeout(60);
    }
    return false;
  };
  const contentsOf = (id) =>
    page.evaluate((id) => {
      const pc = window.__rt.game.places?.containerOf(id);
      return pc?.contents ? pc.contents.map((h) => (h.kind === 'item' ? h.item.item : h.kind === 'tool' ? `tool:${h.tool.kind}` : h.inst.part)) : null;
    }, id);
  // a container's things now: shut or not, where they are (world), what
  const things = (id) =>
    page.evaluate((id) => {
      const pc = window.__rt.game.places?.containerOf(id);
      return pc ? pc.things.map((l) => ({ what: l.item?.item ?? l.tool?.kind ?? l.part?.part, shut: !!l.shut, x: l.x, y: l.y + l.mid, z: l.z })) : null;
    }, id);
  // standing out of a container's front as it is drawn (its first place for things), looking at it
  const frontOf = (id) =>
    page.evaluate((id) => {
      const g = window.__rt.game;
      const s = g.places?.containerOf(id)?.slots?.[0];
      if (!s) return null;
      s.frame.updateWorldMatrix(true, false);
      const e = s.frame.matrixWorld.elements;
      const o = g.core.origin;
      return { x: e[12] + o.x, y: e[13] + o.y, z: e[14] + o.z, from: Math.atan2(e[2], e[0]) };
    }, id);
  for (const [name, id, f] of [
    ['stove', 'kit_stove', '01_stove.png'],
    ['coffee', 'nd_coffee_machine', '02_coffee.png'],
  ]) {
    const w = where[name];
    if (!w) {
      fail(`the plan has no ${name} in the first 60 km`);
      continue;
    }
    ok(await goTo(w), `at the ${w.kind} at ${(w.s / 1000).toFixed(1)} km (due at ${(w.due / 1000).toFixed(1)} km), its boxes laid out`);
    const c = await contentsOf(w.box);
    ok(Array.isArray(c) && c.includes(id), `its box holds the ${name}: ${JSON.stringify(c)}`);
    const fr = await frontOf(w.box);
    const zh = await page.evaluate(async (id) => (await import('/src/core/modcar/items.ts')).itemDef(id).name.zh, id);
    const kind = await page.evaluate((id) => window.__rt.game.places?.containerOf(id)?.c.kind ?? '?', w.box);
    if (fr) {
      // a box with doors, drawers or a lid: opened with E first (the mark on the box itself)
      const m0 = await rt('aimPoint', fr.x, fr.y + 0.1, fr.z, fr.from, 1.3);
      const open0 = await page.evaluate((id) => window.__rt.game.places?.isOpen(id) ?? false, w.box);
      if (/^device:box:/.test(m0) && !open0) {
        await rt('press');
        await rt('simulate', 0.8);
      }
      const opened = await page.evaluate((id) => window.__rt.game.places?.isOpen(id) ?? false, w.box);
      const t = ((await things(w.box)) ?? []).find((x) => x.what === id);
      ok(!!t && !t.shut, `the ${name} in reach in its ${kind} (${opened ? 'opened' : 'open shelves'})`);
    }
    const t = ((await things(w.box)) ?? []).find((x) => x.what === id);
    if (t && fr) {
      // (looked at from in front of the box, a step back and from above: the box and the thing in it in sight —
      // round it, the first way the mark falls on it from)
      let m = '';
      for (const turn of [0, 0.5, -0.5, Math.PI]) {
        m = await rt('aimPoint', t.x, t.y, t.z, fr.from + turn, 1.35);
        if (/^(loose|device):/.test(m) && !/^device:box:/.test(m)) break;
      }
      await rt('simulate', 0.3);
      // (a stove or a coffee machine in a box is the device it is: what it lacks said on it, held long to take it)
      ok(/^(loose|device):/.test(m) && !/^device:box:/.test(m), `aimed at it in its box: ${m}`);
      await shot(f);
      const said = await page.evaluate(() => document.body.innerText.split('\n').filter((l) => l.trim()));
      ok(said.some((l) => l.includes(zh)), `its name on screen: ${said.slice(-12).join(' · ')}`);
      // taken (held long): in the hands, the place round it
      const tel = await rt('useFor', 1.2);
      ok(tel.held === `item:${id}`, `held long: the ${name} in the hands (${tel.held})`);
      await page.evaluate((from) => {
        // (a step back from the box, looking out over the place)
        const g = window.__rt.game;
        g.input.lookYaw = from + Math.PI * 0.85;
        g.input.lookPitch = -0.12;
      }, fr.from);
      await rt('simulate', 0.4);
      await shot(f.replace('.png', '_held.png'));
      await page.evaluate(() => {
        window.__rt.game.player.held = null;
      });
    }
    // its card: what goes with it
    const rows = await page.evaluate((id) => {
      const g = window.__rt.game;
      window.__rt.hold(`item:${id}`);
      const card = g.player.cardOf(g.player.held);
      g.player.held = null;
      return card.rows.map((r) => `${r.label}:${r.value}`);
    }, id);
    ok(rows.some((r) => r.startsWith('配套:')), `its card: ${rows.join(' · ')}`);
  }
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j8_finds: ${bad} FAILED` : 'j8_finds: ok');
process.exit(bad ? 1 : 0);
