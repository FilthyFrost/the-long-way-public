// F5 (docs/V3/plan/finish.md §六), in the game: recycling and making.
//  - in the starting workshop, the power on: a box of old components, a dead television, a box of electrical
//    components, a bag of crackers, a full jerrycan and an engine into the recycler — scrap for each, components for
//    what has a motor or a board in it, nothing for the petrol in the can;
//  - the bench's list has what one knows how to make and nothing else: the plastic scraper;
//  - a blueprint in the hands, the right button: learnt, the sheet used up, and it is on the list; made, its cost is
//    taken in both materials and the thing lies on the bench; short of components, the list says by how many;
//  - saved and read back: the materials, what was learnt; a game kept before there were two materials: its chemicals
//    are its components, its organics gone;
//  - down the road: the second chapter's blueprint places each have the next sheet not learnt yet.
//   SHOTS_GPU=1 node harness/shots/f5_craft.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f5_craft');
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
  // ------------------------------------------------------------------ the workshop
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    const ws = () => rt('workshop');
    const shot = async (name) => {
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, name) });
    };
    await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
    await ready();
    await rt('setHour', 13);
    await rt('simulate', 1);
    // the generator pulled into life
    await rt('aimAt', 'gen_cord', 0, 1.0);
    for (let pulls = 0; pulls < 5 && !(await ws()).power; pulls++) {
      await rt('holdFor', 0.7);
      await rt('simulate', 0.3);
    }
    await rt('simulate', 1.5);
    ok((await ws()).power, 'the workshop has power');
    const s0 = (await ws()).stock;
    ok(Object.keys(s0).sort().join() === 'components,scrap', `two materials: ${JSON.stringify(s0)}`);

    // 1. into the recycler, one after another
    const engine = await page.evaluate(async () => {
      const C = await import('/src/core/modcar/crafting.ts');
      const B = await import('/src/core/modcar/build.ts');
      return C.partSalvage(B.newInstance('eng_i4'));
    });
    const feed = async (what, opts) => {
      const before = (await ws()).stock;
      await rt('hold', what, opts);
      await rt('aimAt', 'recycler', Math.PI, 0.95);
      await rt('press');
      await rt('simulate', 4);
      const after = (await ws()).stock;
      return { scrap: after.scrap - before.scrap, components: after.components - before.components, held: (await rt('telemetry')).held };
    };
    const gave = (g, scrap, comp) => g.scrap === scrap && g.components === comp && g.held === '';
    let g = await feed('item:crate_parts');
    ok(gave(g, 20, 0), `a box of old components: 20 scrap (${JSON.stringify(g)})`);
    g = await feed('item:junk_tv_dead');
    ok(gave(g, 10, 3), `a dead television: 10 scrap and 3 components (${JSON.stringify(g)})`);
    await shot('01_recycled.png');
    g = await feed('item:crate_chem');
    ok(gave(g, 0, 12), `a box of electrical components (元件箱): 12 components (${JSON.stringify(g)})`);
    g = await feed('item:food_chips');
    ok(gave(g, 1, 0), `a bag of crackers: one scrap, as anything gives (${JSON.stringify(g)})`);
    g = await feed('tool:jerrycan', { fuel: 'petrol', litres: 20 });
    ok(gave(g, 3, 0), `a jerrycan with 20 L in it: its own 3 scrap, nothing for the petrol (${JSON.stringify(g)})`);
    g = await feed('eng_i4');
    ok(gave(g, engine.scrap, engine.components ?? 0) && (engine.components ?? 0) > 0, `an engine: ${engine.scrap} scrap and ${engine.components} components (${JSON.stringify(g)})`);
    // (more boxes, to make things with)
    for (let i = 0; i < 4; i++) await feed('item:crate_parts');
    const s1 = (await ws()).stock;
    console.log('the materials now', JSON.stringify(s1));

    // 2. the bench's list: what one knows how to make, nothing else
    const openBench = async () => {
      await page.evaluate(() => {
        window.__rt.game.player.held = null;
      });
      const bt = await rt('aimAt', 'bench', Math.PI, 1.0);
      await rt('press');
      await rt('simulate', 0.5);
      return bt;
    };
    const list = () =>
      page.evaluate(() => {
        const el = document.querySelector('.mc-craft');
        if (!el || getComputedStyle(el).display === 'none') return null;
        return {
          rows: [...el.querySelectorAll('.row')].map((r) => r.querySelector('.nm')?.childNodes[0]?.textContent ?? ''),
          costs: [...el.querySelectorAll('.row small')].map((r) => r.textContent),
          tabs: el.querySelectorAll('.tabs button').length,
          locked: el.querySelectorAll('.row.locked').length,
          more: el.querySelector('.more')?.textContent ?? '',
          go: el.querySelector('button.go')?.textContent ?? '',
          goOff: !!el.querySelector('button.go')?.disabled,
          stock: [...el.querySelectorAll('.stock span')].map((s) => `${s.getAttribute('title')} ${s.textContent}`),
          foot: el.querySelector('.ft')?.textContent ?? '',
        };
      });
    const closeBench = async () => {
      await page.keyboard.press('Escape');
      await rt('simulate', 0.3);
    };
    ok((await openBench()) === 'device:bench', 'at the bench');
    let l = await list();
    ok(!!l && l.rows.join() === '塑料清理铲' && l.tabs === 0 && l.locked === 0, `its list: what one knows how to make and nothing else (${l ? l.rows.join('、') : 'not open'}; ${l?.tabs} tabs, ${l?.locked} locked)`);
    ok(!!l && l.more.includes('图纸') && l.stock.join().includes('废料') && l.stock.join().includes('元件') && l.foot.includes('滚轮'), `it says where more comes from, and has the two materials (${l?.stock.join(', ')}; ${l?.foot})`);
    await shot('02_bench_one.png');
    // (what is not learnt cannot be made, whoever asks)
    const sneaked = await rt('craftAll', 'flashlight');
    ok((await ws()).stock.scrap === s1.scrap && !(await page.evaluate(() => window.__rt.game.loose.list.some((x) => x.item?.item === 'nd_flashlight'))), `a thing not learnt is not made (${JSON.stringify(sneaked).slice(0, 60)})`);
    await closeBench();

    // 3. a blueprint: the right button learns it
    await rt('hold', 'item:bp_flashlight');
    await rt('simulate', 0.2);
    const words = await page.evaluate(() => document.body.innerText);
    ok(/学会\s*手电筒/.test(words), `a sheet in the hands: 学会 手电筒`);
    const card = await page.evaluate(async () => (await import('/src/core/modcar/items.ts')).itemDef('bp_flashlight'));
    ok(card.name.zh === '图纸：手电筒' && card.blurb.includes('废料 30、元件 2'), `its card: ${card.name.zh} — ${card.blurb}`);
    await shot('03_sheet.png');
    const tel = await rt('rightFor', 0.15);
    await rt('simulate', 0.3);
    const known = await page.evaluate(() => [...window.__rt.game.learned]);
    ok(known.join() === 'flashlight' && tel.held === '' && (await page.evaluate(() => document.body.innerText)).includes('学会了：手电筒'), `the right button: learnt (${known.join()}), the sheet used up, said 学会了：手电筒`);
    await openBench();
    l = await list();
    ok(!!l && l.rows.join() === '塑料清理铲,手电筒' && l.costs[1] === '30 废料 · 2 元件', `the bench's list has it now: ${l?.rows.join('、')} (${l?.costs[1]})`);
    // the wheel picks it, the button makes it
    await page.evaluate(() => document.querySelector('.mc-craft').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
    await rt('simulate', 0.3);
    const picked = await page.evaluate(() => document.querySelector('.mc-craft .row.sel .nm')?.childNodes[0]?.textContent ?? '');
    l = await list();
    ok(picked === '手电筒' && l.go === '制作' && !l.goOff, `the wheel picks it (${picked}); the button: ${l.go}`);
    await shot('04_bench_two.png');
    const before = (await ws()).stock;
    await page.evaluate(() => document.querySelector('.mc-craft button.go').click());
    await rt('simulate', 0.2);
    // (the hammer's blows)
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__rt.game.workshop.strike());
      await rt('simulate', 0.9);
    }
    await rt('simulate', 2.5);
    const after = (await ws()).stock;
    const torch = await page.evaluate(() => window.__rt.game.loose.list.filter((x) => x.item?.item === 'nd_flashlight').map((x) => +x.y.toFixed(2)));
    ok(before.scrap - after.scrap === 30 && before.components - after.components === 2 && torch.length === 1 && torch[0] > 0.9, `made: 30 scrap and 2 components taken (${JSON.stringify(before)} → ${JSON.stringify(after)}), a flashlight on the bench (${torch.join()})`);
    await shot('05_made.png');

    // (the flashlight taken up off the bench: the mark is on the bench again)
    await rt('aimLoose', 'item:nd_flashlight', 0.9);
    await rt('press');
    ok((await rt('telemetry')).held === 'item:nd_flashlight', 'the flashlight taken up off the bench');

    // 4. short of components: the list says by how many
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.learn('metal_detector');
      g.stock.scrap = 500;
      g.stock.components = 5;
    });
    await openBench();
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.mc-craft .row')];
      rows[rows.length - 1].click();
    });
    await rt('simulate', 0.3);
    l = await list();
    ok(!!l && l.rows[l.rows.length - 1] === '金属探测器' && l.goOff && l.go === '材料不够：还差 7 元件', `a thing that asks for more components than there are: ${l?.go}`);
    await closeBench();

    // 5. saved and read back: the materials, what was learnt
    await page.evaluate(() => window.__rt.game.save());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    await rt('simulate', 0.5);
    const back = { stock: (await ws()).stock, learned: await page.evaluate(() => [...window.__rt.game.learned].sort()) };
    ok(back.stock.scrap === 500 && back.stock.components === 5 && back.learned.join() === 'flashlight,metal_detector', `saved and read back: ${JSON.stringify(back)}`);
    // (and the bench still has them)
    // 6. a game kept before there were two materials
    const old = await page.evaluate(() => {
      // (the game keeps itself as the page goes: not this time, the kept one is being made an old one)
      window.__rt.game.saveOff = true;
      const key = Object.keys(localStorage).find((k) => k.startsWith('modcar.save'));
      const s = JSON.parse(localStorage.getItem(key));
      s.stock = { scrap: 12, organics: 30, chemicals: 7 };
      delete s.learned;
      localStorage.setItem(key, JSON.stringify(s));
      return key;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    await rt('simulate', 0.5);
    const migrated = { stock: (await ws()).stock, learned: await page.evaluate(() => [...window.__rt.game.learned]) };
    ok(migrated.stock.scrap === 12 && migrated.stock.components === 7 && Object.keys(migrated.stock).length === 2 && migrated.learned.length === 0, `a game kept before (${old}: 12 scrap, 30 organics, 7 chemicals): ${JSON.stringify(migrated.stock)}`);
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('modcar.save')) localStorage.removeItem(k);
    });
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ down the road: the sheets' places
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=200&time=11&weather=clear`, { width: 1280, height: 720 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    // where the plan puts the second chapter's blueprint places in this world (its planner over its places, as the game lays them)
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
      const out = [];
      for (const x of sites) {
        const list = planner.findsAt(x.id);
        list.forEach((f, k) => {
          if (!('blueprint' in f.thing) || f.thing.blueprint !== 2 || !L.planBoxes(x).length) return;
          out.push({ id: x.id, s: x.s, kind: x.kind, box: L.planBoxes(x)[L.boxesOfFinds(x, list)[k]].id });
        });
      }
      return out;
    });
    console.log('the second chapter\'s blueprint places with a box:', JSON.stringify(where.map((w) => `${w.kind} at ${(w.s / 1000).toFixed(1)} km`)));
    ok(where.length >= 4 && where.every((w) => w.s >= 12000 && w.s <= 32000), `${where.length} of them, between the 12th and the 32nd kilometre`);
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
    const sheetsIn = (id) =>
      page.evaluate((id) => {
        const pc = window.__rt.game.places?.containerOf(id);
        return pc?.contents ? pc.contents.filter((h) => h.kind === 'item' && h.item.item.startsWith('bp_')).map((h) => h.item.item) : null;
      }, id);
    // the first of them: the first sheet of the list; learnt, the next place has the next one — never one known already
    const order = ['bp_crowbar', 'bp_jerrycan', 'bp_tire_kit'];
    const found = [];
    for (let i = 0; i < Math.min(3, where.length); i++) {
      const w = where[i];
      const there = await goTo(w);
      const sheets = await sheetsIn(w.box);
      found.push(sheets?.join() ?? '—');
      ok(there && Array.isArray(sheets) && sheets.includes(order[i]), `the ${w.kind} at ${(w.s / 1000).toFixed(1)} km: its box has ${sheets?.join() || 'no sheet'} (the next not learnt: ${order[i]})`);
      // (taken and learnt, as one would)
      await rt('learn', order[i].slice(3));
    }
    ok(new Set(found).size === found.length, `a different sheet at each: ${found.join(', ')}`);
    const kept = await page.evaluate(() => Object.fromEntries(window.__rt.game.sheets));
    ok(Object.keys(kept).length >= 3, `the game remembers what each place had (${Object.values(kept).map((v) => v.r).join(', ')})`);
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  server.close?.();
}
console.log(bad ? `f5_craft: ${bad} FAILED` : 'f5_craft ok');
process.exit(bad ? 1 : 0);
