// Cooking in the real game (docs/V3/nodes/C1-cooking.md, node C1).
//
// A new game of version 2, kept. At the workshop: the kitchen corner stands in the yard to the left of the
// doors. The developer's tab 烹饪 hands over porcini and chanterelles; E at the hob opens the cooking panel
// (the modal: the keyboard's keys reach it), and the robot cook drives the panel's own keys through a
// mushroom soup — the knife, the flame, the seasoning, the wait, the plate. The dish is in the hands and it
// is the recipe (known from now on); eaten, it feeds and leaves its buff, whose tile shows by the vitals.
// Down the road at a camp's fire ring (lit by cooking at it): roast potatoes, which leave 耐饿 — the body's
// hunger slows; a pot of two greens that is no recipe gives a plain dish of their name; a pot of berries and
// a mushroom is nonsense: "说不清的一锅". Saved and opened again: the buff, the dish in the hands and the
// recipes known are back. A stew left on a high flame at a camp stove goes over while one is away.
//
// Pictures into loop/shots/v3_cooking/: the panel at each step, the pot on the flame by day and by night, the
// dishes in the hand, the stations — for looking at, drawn by the software renderer.
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
//   SHOTS_GL=llvmpipe node harness/shots/v3_cooking.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer, waitFrames } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/v3_cooking');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const SAVE = 'modcar.save.v1';

/** the test hook's functions by name, and the harness functions of a system */
const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
const harness = (page) => (system, name, ...args) => page.evaluate(({ system, name, args }) => window.__rt.game.systems.harness(system, name, ...args), { system, name, args });

/** step the game until the world round the vehicle is built (the vehicle held where it stands); false when it never is */
async function built(page) {
  for (let round = 0; round < 12; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) return true;
  }
  return false;
}

/** what is in each slot of the hotbar */
const hands = (page) =>
  page.evaluate(() =>
    window.__rt.game.player.slots.map((h) => (h?.kind === 'item' ? { item: h.item.item, n: h.item.n ?? 1, q: h.item.q ?? 0, dish: h.item.state?.dish ? { r: h.item.state.dish.r ?? null, zh: h.item.state.dish.zh, buff: h.item.state.dish.buff ?? null } : null } : null)),
  );

/** buttons of the developer's tab 烹饪 clicked by their labels */
async function devClick(page, labels) {
  const rt = hook(page);
  if ((await rt('devTab', 'cooking')) !== 'cooking') fail('the 烹饪 tab did not open');
  const said = await page.evaluate((labels) => {
    const pane = document.querySelector('.mc-dev .pane[data-p="cooking"]');
    const buttons = [...pane.querySelectorAll('.btns button')];
    const out = [];
    for (const l of labels) {
      const b = buttons.find((x) => x.textContent === l);
      if (!b) out.push(`no button ${l}`);
      else {
        b.click();
        out.push(pane.querySelector('.msg')?.textContent ?? '');
      }
    }
    return { out, buttons: buttons.length };
  }, labels);
  await page.evaluate(() => window.__rt.game.toggleDev(false));
  return said;
}

/** the robot cook through the panel open now; the game stepped until it is done; pictures at each new step */
async function robotCook(page, plan, hands, shots = '') {
  const hx = harness(page);
  if (!(await hx('cooking', 'robot', plan, hands))) return { why: 'the robot did not start', ...((await hx('cooking', 'robotReport')) ?? {}) };
  let report = null;
  let phase = '';
  for (let i = 0; i < 400; i++) {
    const r = await page.evaluate(() => {
      const g = window.__rt.game;
      g.simulate(0.5);
      return { rep: g.systems.harness('cooking', 'robotReport'), panel: g.systems.harness('cooking', 'panel') };
    });
    report = r.rep;
    if (shots && r.panel.phase && r.panel.phase !== phase) {
      phase = r.panel.phase;
      await waitFrames(page, 2);
      await page.screenshot({ path: path.join(out, `${shots}_${String(i).padStart(3, '0')}_${phase}.png`) });
    }
    if (!report || report.done) break;
  }
  return report;
}

/** stand off a station (from +x of it by default) looking at its point, and press E; what the mark was on */
async function useStation(page, st, from = 0, dist = 1.05) {
  const rt = hook(page);
  const on = await rt('aimPoint', st.x, st.y, st.z, from, dist);
  await rt('press');
  return on;
}

const station = async (page, kind) => (await harness(page)('cooking', 'stations')).find((s) => s.kind === kind) ?? null;

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const rt = hook(page);
  const hx = harness(page);
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  await page.goto(`${url}/modcar.html?world=2&time=11&weather=clear`, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.evaluate((k) => localStorage.removeItem(k), SAVE);
  await page.evaluate(() => window.__rt.game.ui.showHelp(false));
  const game = await page.evaluate(() => ({ version: window.__rt.game.world?.rules.version ?? window.__rt.params.world, keep: window.__rt.params.keep, modules: window.__rt.kernel().modules, tabs: window.__rt.kernel().devTabs }));
  console.log('new game', JSON.stringify(game));
  if (game.version !== 2 || !game.keep) fail(`not a kept game of version 2: ${JSON.stringify(game)}`);
  if (!game.modules.includes('cooking') || !game.tabs.includes('cooking')) fail('the cooking module or its tab is not in the game');
  // (a hiking pack on: six slots in the hotbar, room for what is cooked and what it is cooked of)
  await page.evaluate(async () => {
    const { newItem } = await import('/src/core/modcar/items.ts');
    window.__rt.game.player.wearPack(newItem('pack_hike'));
  });
  await rt('simulate', 2);

  // ------------------------------------------------------------------ the kitchen corner at the workshop
  const kitchen = await station(page, 'kitchen');
  console.log('the kitchen corner', JSON.stringify(kitchen));
  if (!kitchen) fail('no kitchen corner at the workshop');
  if (kitchen && kitchen.methods.length < 10) fail(`the kitchen corner offers only ${kitchen.methods.join(', ')}`);
  // (the corner from the yard, and close)
  await rt('aimPoint', kitchen.x, kitchen.y - 0.1, kitchen.z, 0.25, 3.2);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'kitchen_corner.png') });
  const given = await devClick(page, ['牛肝菌', '鸡油菌']);
  console.log('the 烹饪 tab', JSON.stringify(given));
  if (given.buttons < 200) fail(`the 烹饪 tab has only ${given.buttons} buttons`);
  const withForage = await hands(page);
  if (!withForage.some((h) => h?.item === 'porcini') || !withForage.some((h) => h?.item === 'chanterelle')) fail(`the tab did not hand over the mushrooms: ${JSON.stringify(withForage)}`);
  const onHob = await useStation(page, kitchen);
  const opened = await page.evaluate(() => ({ modal: window.__rt.kernel().modal, panel: window.__rt.game.systems.harness('cooking', 'panel'), shown: document.querySelector('.mc-cook')?.style.display !== 'none' && !!document.querySelector('.mc-cook'), text: document.querySelector('.mc-cook')?.textContent ?? '' }));
  console.log('E at the hob', onHob, JSON.stringify({ modal: opened.modal, phase: opened.panel.phase, method: opened.panel.method, rows: opened.panel.rows }));
  if (onHob !== 'device:cooking:kitchen') fail(`the mark at the hob is on ${onHob}`);
  if (opened.modal.open !== 'cooking' || !opened.shown) fail(`the cooking panel did not open: ${JSON.stringify(opened.modal)}`);
  // the keyboard's own keys reach the panel through the modal: D goes round the ways of cooking
  const m0 = opened.panel.method;
  await page.keyboard.press('KeyD');
  await waitFrames(page, 2);
  const m1 = (await hx('cooking', 'panel')).method;
  await page.keyboard.press('KeyA');
  await waitFrames(page, 2);
  const m2 = (await hx('cooking', 'panel')).method;
  console.log('A / D on the keyboard', m0, '->', m1, '->', m2);
  if (m1 === m0 || m2 !== m0) fail(`the keyboard's D and A did not go round the ways: ${m0} ${m1} ${m2}`);
  const walkerBefore = await page.evaluate(() => ({ x: window.__rt.game.player.walker.x, z: window.__rt.game.player.walker.z }));
  await page.keyboard.down('KeyW');
  await waitFrames(page, 8);
  await page.keyboard.up('KeyW');
  const walkerAfter = await page.evaluate(() => ({ x: window.__rt.game.player.walker.x, z: window.__rt.game.player.walker.z }));
  if (Math.hypot(walkerAfter.x - walkerBefore.x, walkerAfter.z - walkerBefore.z) > 0.02) fail('the walker moved while the panel was open');
  // the robot cook: a mushroom soup
  const soup = await robotCook(page, { recipe: 'mushroom_soup', seed: 5 }, { reaction: 0.4, error: 0.15 }, 'soup');
  console.log('the robot cook: mushroom soup', JSON.stringify(soup));
  if (!soup?.done || soup.why || soup.dish?.recipe !== 'mushroom_soup') fail(`the robot did not cook a mushroom soup: ${JSON.stringify(soup)}`);
  if (soup && !(soup.seconds >= 60 && soup.seconds <= 180)) fail(`the soup took ${soup?.seconds} s`);
  await waitFrames(page, 2);
  await page.screenshot({ path: path.join(out, 'soup_done.png') });
  const withSoup = await hands(page);
  const bowl = withSoup.find((h) => h?.item === 'dish_soup');
  console.log('in the hands', JSON.stringify(withSoup), 'known', await hx('cooking', 'known', 'mushroom_soup'));
  if (!bowl || bowl.dish?.r !== 'mushroom_soup') fail(`the soup is not in the hands as the recipe: ${JSON.stringify(withSoup)}`);
  if (!(await hx('cooking', 'known', 'mushroom_soup'))) fail('the mushroom soup is not known after cooking it');
  await page.keyboard.press('Escape');
  await waitFrames(page, 2);
  if ((await rt('kernel')).modal.open) fail('Escape did not shut the panel');
  // the dish in the hand, and eaten: it feeds and leaves its buff
  const slot = withSoup.findIndex((h) => h?.item === 'dish_soup');
  await rt('select', slot);
  await rt('look', 0, -0.55);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'soup_in_hand.png') });
  const fed0 = await page.evaluate(() => {
    const g = window.__rt.game;
    g.body.food = 40;
    g.body.water = 40;
    return { food: g.body.food, water: g.body.water };
  });
  await rt('takeFor', 5.2);
  await rt('simulate', 6);
  const fed = await page.evaluate(() => {
    const g = window.__rt.game;
    return { food: g.body.food, water: g.body.water, buffs: g.systems.harness('cooking', 'buffs'), tiles: [...document.querySelectorAll('.mc-buffs .bf')].filter((t) => t.style.display !== 'none').map((t) => `${t.title} ${t.querySelector('b')?.textContent}`) };
  });
  console.log('eaten', JSON.stringify(fed0), '->', JSON.stringify(fed));
  if (!(fed.food > fed0.food + 20)) fail(`the soup did not feed: ${fed0.food} -> ${fed.food}`);
  if (!(fed.water > fed0.water + 8)) fail(`the soup did not quench: ${fed0.water} -> ${fed.water}`);
  if (!fed.buffs.some((b) => b.id === 'keen')) fail(`the soup left no buff: ${JSON.stringify(fed.buffs)}`);
  if (!fed.tiles.some((t) => t.startsWith('眼尖'))) fail(`no tile of the buff by the vitals: ${JSON.stringify(fed.tiles)}`);
  await rt('look', 0.4, 0.1);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'buff_tile.png') });

  // ------------------------------------------------------------------ a camp's fire ring down the road
  const camp = await page.evaluate(() => {
    const g = window.__rt.game;
    const out = [];
    g.world.sites.between(150, 30000, out);
    for (const s of out) {
      const o = s.objects.find((x) => x.kind === 'firering');
      if (s.kind === 'camp' && o) return { id: s.id, s: s.s, x: o.x, y: o.y, z: o.z, sx: s.x, sz: s.z, phi: s.phi };
    }
    return null;
  });
  console.log('a camp with a fire ring', JSON.stringify(camp));
  if (!camp) fail('no camp with a fire ring down the road');
  await rt('enter', 1);
  await rt('placeVehicle', 1, camp.sx + Math.cos(camp.phi) * -14, camp.sz + Math.sin(camp.phi) * -14, camp.phi);
  if (!(await built(page))) fail('the world round the camp was never built');
  await rt('stand', camp.x + 2, camp.z, Math.PI, -0.3);
  await rt('simulate', 2);
  await hx('cooking', 'look');
  const fire = await station(page, 'fire');
  console.log('the fire ring', JSON.stringify(fire));
  if (!fire) fail('the camp\'s fire ring is no station');
  if (fire && fire.methods.join() !== 'roast,brew') fail(`the fire ring offers ${fire.methods.join(', ')} with nothing in the hands`);
  // (the hands emptied of what is left of the mushrooms)
  const clearRaw = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      for (let i = 0; i < g.player.slots.length; i++) if (!g.player.slots[i]?.item?.item?.startsWith('dish_')) g.player.slots[i] = null;
    });
  await clearRaw();
  await devClick(page, ['土豆']);
  const onFire = await useStation(page, fire);
  const lit = await station(page, 'fire');
  console.log('E at the fire', onFire, 'burning', lit?.fire);
  if (onFire !== `device:cooking:${fire.key}`) fail(`the mark at the fire is on ${onFire}`);
  if (!(lit?.fire > 0)) fail('the fire was not lit by cooking at it');
  const potatoes = await robotCook(page, { recipe: 'roast_potato', seed: 7 }, { reaction: 0.4, error: 0.15 }, 'roast');
  console.log('the robot cook: roast potatoes', JSON.stringify(potatoes));
  if (!potatoes?.done || potatoes.dish?.recipe !== 'roast_potato') fail(`no roast potatoes: ${JSON.stringify(potatoes)}`);
  // the pot on the flame by night: another roast, pictured on its spit
  await devClick(page, ['土豆']);
  await hx('cooking', 'key', 'KeyE');
  await hx('cooking', 'key', 'KeyE');
  await hx('cooking', 'key', 'Space');
  await rt('simulate', 20);
  await rt('aimPoint', fire.x, fire.y - 0.1, fire.z, 0.5, 1.6);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'fire_day.png') });
  await rt('setHour', 21.5);
  await rt('simulate', 0.5);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'fire_night.png') });
  await rt('setHour', 11);
  // eat the first potatoes: 耐饿, the body's hunger slows
  await page.keyboard.press('Escape');
  await waitFrames(page, 2);
  const roastSlot = (await hands(page)).findIndex((h) => h?.dish?.r === 'roast_potato');
  await rt('select', roastSlot);
  await rt('look', 0, -0.55);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'roast_in_hand.png') });
  const drain = await page.evaluate(() => {
    const g = window.__rt.game;
    g.body.food = 50;
    const before = g.body.food;
    g.simulate(20);
    return before - g.body.food;
  });
  await rt('takeFor', 5.2);
  await rt('simulate', 6);
  const slowed = await page.evaluate(() => {
    const g = window.__rt.game;
    g.body.gains.length = 0;
    const before = g.body.food;
    g.simulate(20);
    return { drain: before - g.body.food, foodK: g.bodyMods.foodK, buffs: g.systems.harness('cooking', 'buffs') };
  });
  console.log('hunger over 20 s before and after the roast potatoes', drain.toFixed(3), '->', JSON.stringify(slowed));
  if (!slowed.buffs.some((b) => b.id === 'hearty')) fail(`the potatoes left no 耐饿: ${JSON.stringify(slowed.buffs)}`);
  if (!(slowed.drain < drain * 0.85) || !(slowed.foodK < 0.8)) fail(`hunger did not slow: ${drain} -> ${slowed.drain}, foodK ${slowed.foodK}`);

  // a free pot that is no recipe gives a plain dish; a pot that is nonsense gives 说不清的一锅 (the roast left on
  // the spit for the pictures is plated first: the pot is empty again)
  await useStation(page, fire);
  await hx('cooking', 'key', 'KeyE');
  await rt('simulate', 0.2);
  await hx('cooking', 'key', 'KeyE');
  await hx('cooking', 'key', 'KeyE');
  await page.keyboard.press('Escape');
  await clearRaw();
  await devClick(page, ['蒲公英']);
  await useStation(page, fire);
  const free = await robotCook(page, { items: ['dandelion', 'dandelion'], method: 'roast', seed: 3 }, { reaction: 0.4, error: 0.15 }, '');
  console.log('a free pot', JSON.stringify(free));
  if (!free?.done || free.dish?.recipe !== null || free.dish?.name !== '烤蔬菜') fail(`two dandelions on the spit are not a plain 烤蔬菜: ${JSON.stringify(free)}`);
  await page.keyboard.press('Escape');
  await clearRaw();
  await devClick(page, ['野莓', '牛肝菌']);
  await useStation(page, fire);
  const odd = await robotCook(page, { items: ['wild_berry', 'porcini'], method: 'roast', seed: 4 }, { reaction: 0.4, error: 0.15 }, '');
  console.log('a pot of nonsense', JSON.stringify(odd));
  if (!odd?.done || odd.dish?.name !== '说不清的一锅') fail(`berries and a mushroom are not 说不清的一锅: ${JSON.stringify(odd)}`);
  await waitFrames(page, 2);
  await page.screenshot({ path: path.join(out, 'odd_done.png') });
  await page.keyboard.press('Escape');

  // ------------------------------------------------------------------ saved, opened again
  const kept = await page.evaluate(() => {
    const g = window.__rt.game;
    g.save();
    return { buffs: g.systems.harness('cooking', 'buffs').map((b) => b.id), cooked: g.systems.harness('cooking', 'cooked') };
  });
  const handsBefore = await hands(page);
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
  console.log('saved', JSON.stringify({ cooking: stored.slices?.cooking }), JSON.stringify(kept));
  if (!stored.slices?.cooking) fail('the save has no cooking slice');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await page.evaluate(() => window.__rt.game.ui.showHelp(false));
  await rt('simulate', 2);
  const back = await page.evaluate(() => {
    const g = window.__rt.game;
    return { buffs: g.systems.harness('cooking', 'buffs').map((b) => b.id), cooked: g.systems.harness('cooking', 'cooked'), soup: g.systems.harness('cooking', 'known', 'mushroom_soup'), potato: g.systems.harness('cooking', 'known', 'roast_potato'), last: window.__rt.lastError };
  });
  const handsBack = await hands(page);
  console.log('opened again', JSON.stringify(back), JSON.stringify(handsBack));
  if (JSON.stringify(back.buffs) !== JSON.stringify(kept.buffs)) fail(`the buffs are not back: ${JSON.stringify(back.buffs)} against ${JSON.stringify(kept.buffs)}`);
  if (JSON.stringify(back.cooked) !== JSON.stringify(kept.cooked)) fail(`the recipes cooked are not back: ${JSON.stringify(back.cooked)}`);
  if (!back.soup || !back.potato) fail('the recipes known are not back');
  if (JSON.stringify(handsBack) !== JSON.stringify(handsBefore)) fail(`the dishes in the hands are not back: ${JSON.stringify(handsBack)} against ${JSON.stringify(handsBefore)}`);
  if (!handsBack.some((h) => h?.dish)) fail('no dish in the hands after the reload');
  if (back.last) fail(`an error after the reload: ${back.last}`);

  // ------------------------------------------------------------------ a stew left on a high flame at a camp stove goes over
  await page.evaluate(() => {
    const g = window.__rt.game;
    for (let i = 0; i < g.player.slots.length; i++) if (!g.player.slots[i]?.item?.item?.startsWith('dish_')) g.player.slots[i] = null;
  });
  await rt('simulate', 1);
  await devClick(page, ['在这里生火', '牛肝菌', '土豆']);
  await rt('simulate', 2);
  await hx('cooking', 'look');
  const stove = await station(page, 'stove');
  console.log('a camp stove set down', JSON.stringify(stove));
  if (!stove) fail('the camp stove set down is no station');
  if (stove && !['fry', 'soup', 'stew', 'rice'].every((m) => stove.methods.includes(m))) fail(`the stove with a pot and a pan by it offers ${stove.methods.join(', ')}`);
  await rt('aimPoint', stove.x, stove.y + 0.3, stove.z, Math.PI * 0.75, 1.6);
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(out, 'stove_set_down.png') });
  const onStove = await useStation(page, stove, Math.PI * 0.75, 0.9);
  if (onStove !== `device:cooking:${stove.key}`) fail(`the mark at the stove is on ${onStove}`);
  const stew = await page.evaluate(() => {
    const g = window.__rt.game;
    for (let i = 0; i < 12 && g.systems.harness('cooking', 'panel').method !== 'stew'; i++) g.systems.harness('cooking', 'key', 'KeyD');
    return g.systems.harness('cooking', 'panel').method;
  });
  if (stew !== 'stew') fail(`the stove does not offer the stew: ${stew}`);
  // (the robot puts the pot together and is stopped once the knife work is done; the flame is turned up and one walks away)
  await hx('cooking', 'robot', { recipe: 'mushroom_potato_stew', heat: 3, forget: true, seed: 9 }, { reaction: 0.3, error: 0.1 });
  for (let i = 0; i < 80; i++) {
    const p = await page.evaluate(() => {
      window.__rt.game.simulate(0.5);
      return window.__rt.game.systems.harness('cooking', 'panel');
    });
    if (p.phase === 'heat' && p.heat === 3) break;
  }
  await page.keyboard.press('Escape');
  await rt('stand', stove.x + 9, stove.z, Math.PI, -0.1);
  await rt('simulate', 150);
  const over = await station(page, 'stove');
  console.log('the stew left on a high flame', JSON.stringify(over?.pot));
  if (!over?.pot?.lit || !(over.pot.d > 1.45)) fail(`the stew left on a high flame did not go over: ${JSON.stringify(over?.pot)}`);
  await rt('aimPoint', stove.x, stove.y + 0.25, stove.z, Math.PI * 0.75, 1.4);
  await waitFrames(page, 4);
  await page.screenshot({ path: path.join(out, 'stew_burnt.png') });

  const k = await rt('kernel');
  console.log('the cooking system in the live game', JSON.stringify({ ms: k.systems.cooking.ms.total, budget: k.systems.cooking.budgetMs, over: k.systems.cooking.over, errors: k.errors }));
  if (k.lastError) fail(`the kernel set something apart: ${k.lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  // what the cooking view adds to the frame
  const cost = await page.evaluate(() => {
    const g = window.__rt.game;
    const root = g.core.scene.getObjectByName('cooking');
    g.render();
    const withIt = { ...g.core.stats };
    root.visible = false;
    g.render();
    const without = { ...g.core.stats };
    root.visible = true;
    return { calls: withIt.calls - without.calls, triangles: withIt.triangles - without.triangles };
  });
  console.log('the cooking view as drawn here (a stove with a burnt stew on it)', JSON.stringify(cost));
  await page.evaluate((key) => ((window.__rt.game.saveOff = true), localStorage.removeItem(key)), SAVE);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 cooking ok');
process.exit(bad ? 1 : 0);
