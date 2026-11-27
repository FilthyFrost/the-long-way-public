// The kitchen, steps 4 and 5 (docs/V3/plan/cooking.md): the second batch and the cooler, walked through in the game —
//   1. a steamer at a bare burner is refused, and says why; a pot of water on the burner, and the steamer's ghost on it
//   2. on the pot: trout and ginger in, the flame lit, the steam rising; dished up, its card
//   3. the kettle on the burner, lemon and honey, the flame: the steam out of its spout once it boils
//   4. the cooler: Tab opens it, its things listed; twenty hours on, the beef in it still good, the beef left out going off
//   SHOTS_GPU=1 node harness/shots/k5_kitchen.mjs [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/k5_kitchen');
fs.mkdirSync(out, { recursive: true });
const hour = process.argv[2] || '10.5';
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:pickup&s=300&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    const IT = await import('/src/core/modcar/items.ts');
    const K = await import('/src/game/modcar/v3/kitchen/index.ts');
    const D = await import('/src/game/modcar/v3/kitchen/devTab.ts');
    const KIT = await import('/src/core/v3/kitchen/kit.ts');
    const TIME = await import('/src/game/modcar/itemTime.ts');
    const SS = await import('/src/core/world/spine.ts');
    const sys = K.kitchen;
    const sim = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) g.simulate(1 / 30); };
    const unit = (item) => sys.list.find((u) => u.item.item === item) ?? null;
    const word = () => {
      const t = g.player.target;
      if (!t) return '';
      if (t.kind !== 'device') return t.kind;
      const h = g.player.held;
      const take = h && t.device.take ? t.device.take(h) : null;
      return `${t.device.id.split(':').pop()}|${(take ? take.word : t.device.word).zh}`;
    };
    const looseOf = (item) => g.loose.list.find((l) => l.item?.item === item) ?? null;
    window.__k = {
      async setup() {
        const st = new SS.SpineSample();
        g.world.spine.at(318, st);
        rt.stand(st.x, st.z, st.phi, -0.5);
        const n = D.layKitchen(g);
        await g.loose.settled();
        sim(1.5);
        return n;
      },
      aim(item, local, dist = 1.1) {
        const u = unit(item);
        const o = g.core.origin;
        const p = u.loose.obj.localToWorld(u.loose.obj.position.clone().set(local[0], local[1], local[2]));
        rt.aimPoint(p.x + o.x, p.y + o.y, p.z + o.z, u.loose.yaw, dist);
        sim(0.2);
        return word();
      },
      aimLoose(item, dist = 1.3) {
        const l = looseOf(item);
        rt.aimPoint(l.x, l.y + l.mid, l.z, l.yaw, dist);
        sim(0.2);
        return String(g.player.telemetry().target);
      },
      hold(id) {
        rt.hold(`item:${id}`);
        sim(0.1);
        return word();
      },
      empty() {
        const p = g.player;
        for (let i = 0; i < p.slots.length; i++) p.slots[i] = null;
        sim(0.1);
      },
      press() {
        rt.press();
        sim(0.1);
        return word();
      },
      /** the left button held so long (s), then let go: a pick-up (docs/V3/plan/growth.md J1) */
      holdL(seconds = 1.0) {
        g.mouseDown(0);
        for (let t = 0; t < seconds; t += 1 / 60) g.step(1 / 60, 1);
        g.mouseUp(0);
        for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
        return word();
      },
      tapF() {
        g.rightButton = true;
        for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
        g.rightButton = false;
        for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
        return word();
      },
      ghosts: () => sys.ghosts.map((x) => `${x.slot}:${x.item}${x.focused ? '*' : ''}`).join(' '),
      kit: (item) => JSON.parse(JSON.stringify(unit(item)?.item.state?.kit ?? null)),
      until(what, max = 60) {
        const u = unit('kit_stove');
        for (let t = 0; t < max; t += 1 / 30) {
          if (KIT.asksStir(u.item)) KIT.stir(u.item);
          if (KIT.phaseOf(u.item) === what) return t;
          g.simulate(1 / 30);
        }
        return -1;
      },
      sim,
      held: () => g.player.telemetry().held,
      listOpen: () => {
        const el = document.querySelector('.mc-cargo');
        return el ? getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.textContent : '';
      },
      /** the freshness of the beef left out at one's feet, and of the beef in the cooler */
      beef() {
        const now = TIME.itemNow();
        const outside = g.loose.list.find((l) => l.item?.item === 'ing_beef')?.item;
        const box = looseOf('kit_cooler')?.item;
        const inside = box?.inside?.find((x) => x.item === 'ing_beef');
        return { out: outside ? +IT.freshNow(outside, now).toFixed(3) : -1, inCooler: inside ? +IT.freshNow(inside, now).toFixed(3) : -1 };
      },
    };
  });
  const k = (fn, ...args) => page.evaluate(({ fn, args }) => window.__k[fn](...args), { fn, args });
  const shot = async (f, wait = 0) => {
    // (real time for what is drawn to arrive: the models, the pictures)
    for (let i = 0; i < wait; i++) {
      await page.waitForTimeout(100);
      await k('sim', 1 / 30);
    }
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  const TOP = [0, 0.16, 0.07];
  const KNOB = [0.145, 0.045, -0.03];

  const n = await k('setup');
  ok(n >= 20, `a kitchen laid out with the cooler: ${n} things`);
  // ---- 1. the steamer: refused at a bare burner; on a pot of water
  await k('empty');
  await k('aim', 'kit_stove', TOP);
  ok((await k('holdL')).startsWith('top|') && (await k('held')) === 'item:kit_pan', 'the left button held on the pan: taken off');
  await k('empty');
  await k('hold', 'kit_steamer');
  const refused = await k('aim', 'kit_stove', TOP);
  ok(refused === 'top|先放汤锅' && !(await k('ghosts')).includes('kit_steamer'), `a steamer at the bare burner: ${refused}`);
  await k('empty');
  await k('hold', 'kit_pot');
  await k('aim', 'kit_stove', TOP);
  await k('press');
  ok((await k('kit', 'kit_stove'))?.on === 'kit_pot', 'a pot on the burner');
  await k('hold', 'kit_steamer');
  const onPot = await k('aim', 'kit_stove', TOP);
  const g1 = await k('ghosts');
  ok(onPot === 'top|架上蒸笼' && g1.includes('pot:kit_steamer*'), `the steamer at the pot: ${onPot} · ${g1}`);
  await shot('k5_1_steamer_ghost.png', 8);
  await k('press');
  const st = await k('kit', 'kit_stove');
  ok(st?.on === 'kit_steamer' && st?.under === 'kit_pot', `E: on the pot (${JSON.stringify(st)})`);
  // ---- 2. trout and ginger, steamed
  for (const id of ['ing_trout', 'ing_ginger']) {
    await k('hold', id);
    await k('aim', 'kit_stove', TOP);
    await k('press');
  }
  await k('empty');
  await k('aim', 'kit_stove', KNOB);
  await k('press');
  const t = await k('until', 'right', 60);
  ok(t > 0, `steamed to just right in ${t.toFixed(1)} s`);
  await k('aim', 'kit_stove', TOP, 1.35);
  await shot('k5_2_steaming.png', 12);
  await k('hold', 'kit_plate');
  await k('aim', 'kit_stove', TOP);
  await k('press');
  const dish = await k('held');
  ok(/^item:dish_/.test(dish) && !/dish_(mess|burnt|raw)$/.test(dish), `dished up: ${dish}`);
  await shot('k5_3_steamed_dish.png', 10);
  // ---- 3. the kettle
  await k('empty');
  await k('aim', 'kit_stove', KNOB);
  await k('press');
  await k('aim', 'kit_stove', TOP);
  await k('holdL');
  ok((await k('held')) === 'item:kit_steamer', 'held: the steamer off the pot');
  await k('empty');
  await k('aim', 'kit_stove', TOP);
  await k('holdL');
  ok((await k('held')) === 'item:kit_pot', 'held: the pot off the burner');
  await k('empty');
  await k('hold', 'kit_kettle');
  await k('aim', 'kit_stove', TOP);
  await k('press');
  for (const id of ['ing_lemon', 'ing_honey']) {
    await k('hold', id);
    await k('aim', 'kit_stove', TOP);
    await k('press');
  }
  await k('empty');
  await k('aim', 'kit_stove', KNOB);
  await k('press');
  const tk = await k('until', 'right', 40);
  ok(tk > 0, `the kettle boils in ${tk.toFixed(1)} s`);
  await k('sim', 2);
  await k('aim', 'kit_stove', TOP, 1.35);
  await shot('k5_4_kettle.png', 12);
  // ---- 4. the cooler
  await k('empty');
  const on = await k('aimLoose', 'kit_cooler');
  // (from above, the mark is on its lid — the lid's own, v3/lids: a press opens it — and Tab lists what is in it the same)
  ok(/^(loose:|device:lids:)/.test(on), `the mark on the cooler or its lid (${on})`);
  await page.keyboard.press('Tab');
  await k('sim', 0.3);
  const list = await k('listOpen');
  ok(!!list && list.includes('保温箱') && list.includes('牛肉'), `Tab: its list (${String(list).slice(0, 80)})`);
  await shot('k5_5_cooler_list.png', 6);
  await page.keyboard.press('Tab');
  await k('sim', 0.3);
  const before = await k('beef');
  await page.evaluate((h) => window.__rt.setHour(h), (Number(hour) + 20) % 24);
  await k('sim', 0.5);
  const after = await k('beef');
  ok(after.inCooler > 0.8 && after.out < 0.5 && after.out >= 0, `twenty hours on: beef in the cooler ${before.inCooler} → ${after.inCooler}, beef left out ${before.out} → ${after.out}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(`threw: ${e?.stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
