// J4 (docs/V3/plan/growth.md §一 4), walked through in the game: a whole meal and a cup of coffee with the left button
// and the right, every step's picture —
//   1. a kitchen laid out on the road; a tomato onto the board, three strokes, the cut tomato taken up
//   2. into the pan on the stove with an egg; the knob: the flame; tossed when it asks; just right
//   3. the pan lifted off the burner with what is in it (the left button held), carried to a plate lying by the
//      kitchen and dished up there (端着锅对着盘子): the plate where it lies is the dish
//   4. the dish taken up and eaten with the right button: it feeds, the plate is back in the hands
//   5. the pan put back on the burner, a pot swapped for it (the one on it comes into the hands)
//   6. coffee: beans into the machine's hopper (held), the pot under its spout, the switch: ground and brewed, the
//      coffee runs into the pot; the pot taken (held), poured into a mug lying by it (held); the mug drunk
//   The game's seconds from the tomato onto the board to the meal eaten are said (the plan's mark: three minutes for
//   one doing it the first time without the words).
//   SHOTS_GPU=1 node harness/shots/j4_kitchen.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j4_kitchen');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:pickup&s=300&time=10.5&weather=clear`, { width: 1280, height: 720 });
  await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    g.ui.showHelp?.(false);
    const K = await import('/src/game/modcar/v3/kitchen/index.ts');
    const D = await import('/src/game/modcar/v3/kitchen/devTab.ts');
    const KIT = await import('/src/core/v3/kitchen/kit.ts');
    const IT = await import('/src/core/modcar/items.ts');
    const SS = await import('/src/core/world/spine.ts');
    const sys = K.kitchen;
    let clock = 0;
    const sim = (s) => {
      for (let t = 0; t < s - 1e-9; t += 1 / 30) g.simulate(1 / 30);
      clock += s;
    };
    const unit = (item) => sys.list.find((u) => u.item.item === item) ?? null;
    const word = () => {
      const t = g.player.target;
      if (!t) return '';
      if (t.kind !== 'device') return t.kind;
      const h = g.player.held;
      const take = h && t.device.take ? t.device.take(h) : null;
      return `${t.device.id.split(':').pop()}|${(take ? take.word : t.device.word).zh}${take && !take.ok ? '|off' : ''}`;
    };
    const lying = (item) => g.loose.list.find((l) => l.item?.item === item) ?? null;
    window.__k = {
      clock: () => clock,
      async setup() {
        const st = new SS.SpineSample();
        g.world.spine.at(318, st);
        rt.stand(st.x, st.z, st.phi, -0.5);
        window.__at = { x: st.x, z: st.z, phi: st.phi };
        const n = D.layKitchen(g);
        await g.loose.settled();
        sim(1.5);
        clock = 0;
        return n;
      },
      aim(item, local, dist = 1.15) {
        const u = unit(item);
        if (!u) return `no ${item}`;
        const o = g.core.origin;
        const p = u.loose.obj.localToWorld(u.loose.obj.position.clone().set(local[0], local[1], local[2]));
        rt.aimPoint(p.x + o.x, p.y + o.y, p.z + o.z, u.loose.yaw, dist);
        sim(0.2);
        return word();
      },
      /** look at the thing lying about of that uid */
      aimUid(uid, dist = 0.9) {
        const l = g.loose.list.find((x) => x.uid === uid);
        if (!l) return `no ${uid}`;
        rt.aimPoint(l.x, l.y + (l.mid ?? 0.03), l.z, l.yaw + 0.5, dist);
        sim(0.2);
        return word();
      },
      /** look at a thing lying about (its middle) from a step off */
      aimLying(item, dist = 0.9) {
        const l = lying(item);
        if (!l) return `no ${item}`;
        rt.aimPoint(l.x, l.y + (l.mid ?? 0.03), l.z, l.yaw + 0.5, dist);
        sim(0.2);
        return word();
      },
      /** a thing laid on the road at so many metres ahead and to the right of where the kitchen was laid */
      lay(id, ahead, right, opts = {}) {
        const a = window.__at;
        const fx = Math.cos(a.phi);
        const fz = Math.sin(a.phi);
        const it = IT.newItem(id, opts);
        const l = g.loose.addItem(it, a.x + fx * ahead - fz * right, 1.0, a.z + fz * ahead + fx * right, a.phi + Math.PI);
        g.loose.drop(l);
        sim(0.8);
        return l.uid;
      },
      hold(id, o = {}) {
        rt.hold(`item:${id}`, o);
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
      holdL(seconds = 1.0) {
        g.player.press();
        for (let t = 0; t < seconds; t += 1 / 60) g.step(1 / 60, 1);
        clock += seconds;
        g.player.release();
        for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
        return word();
      },
      /** the right button: a press, then the eating or drinking goes on by itself for so long */
      right(press = 0.1, after = 0) {
        g.rightButton = true;
        for (let t = 0; t < press; t += 1 / 60) g.step(1 / 60, 1);
        g.rightButton = false;
        for (let t = 0; t < after; t += 1 / 60) g.step(1 / 60, 1);
        clock += press + after;
      },
      held: () => {
        const h = g.player.held;
        return h?.kind === 'item' ? { item: h.item.item, litres: h.item.litres ?? 0, pot: KIT.potOf(h.item)?.items.length ?? 0 } : null;
      },
      slots: () => g.player.slots.map((h) => (h?.kind === 'item' ? h.item.item : null)),
      kit: (item) => JSON.parse(JSON.stringify(unit(item)?.item.state?.kit ?? null)),
      until(what, max = 60) {
        const u = unit('kit_stove');
        for (let t = 0; t < max; t += 1 / 30) {
          if (what === 'ask' ? KIT.asksStir(u.item) : KIT.phaseOf(u.item) === what) return t;
          g.simulate(1 / 30);
          clock += 1 / 30;
        }
        return -1;
      },
      sim,
      lyingKind: (uid) => g.loose.list.find((l) => l.uid === uid)?.item?.item ?? null,
      food: () => g.body.food,
      setFood: (v) => void (g.body.food = v),
      book: () => JSON.parse(JSON.stringify(sys.book)),
      coffee: () => g.systems.get('nd-coffee').telemetry(),
      machine: () => g.systems.harness('nd-coffee', 'machines')[0] ?? null,
      aimPart(kind, dist = 0.8) {
        const m = g.systems.harness('nd-coffee', 'machines')[0];
        if (!m) return 'no machine';
        const p = g.systems.harness('nd-coffee', 'partAt', m.uid, kind);
        rt.aimPoint(p.x, p.y, p.z, p.from, dist);
        sim(0.2);
        return word();
      },
    };
  });
  const k = (fn, ...args) => page.evaluate(({ fn, args }) => window.__k[fn](...args), { fn, args });
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  const STOVE = 'kit_stove';
  const TOP = [0, 0.15, 0.068];
  const KNOB = [0.15, 0.05, -0.036];

  // ---- 1. the board
  const n = await k('setup');
  ok(n >= 15, `a kitchen laid out (${n} things)`);
  await k('aim', STOVE, [0, 0.1, 0], 2.0);
  await shot('01_kitchen.png');
  await k('hold', 'ing_tomato');
  let w = await k('aim', 'kit_board', [0, 0.03, 0.03]);
  ok(/放上案板/.test(w), `a tomato at the board: ${w}`);
  await k('press');
  await shot('02_on_the_board.png');
  for (let i = 0; i < 3; i++) w = await k('press');
  ok((await k('kit', 'kit_board'))?.food?.cut === 1, 'three strokes: cut');
  await k('sim', 0.4);
  await shot('03_cut.png');
  await k('press');
  ok((await k('held'))?.item === 'cut_tomato', `the cut tomato in the hands (${JSON.stringify(await k('held'))})`);

  // ---- 2. the pan
  w = await k('aim', STOVE, TOP);
  ok(/放进 <b>番茄/.test(w), `the cut tomato at the pan: ${w}`);
  await k('press');
  await k('hold', 'ing_egg');
  await k('aim', STOVE, TOP);
  await k('press');
  ok((await k('kit', STOVE))?.pot?.items?.length === 2, 'the tomato and the egg in the pan');
  await k('empty');
  await k('aim', STOVE, KNOB, 1.0);
  await k('press');
  ok((await k('kit', STOVE))?.fire === 2, 'the knob: alight');
  await k('aim', STOVE, TOP, 1.25);
  await k('until', 'ask');
  await k('aim', STOVE, TOP, 1.25);
  await shot('04_cooking.png');
  await k('press');
  await k('until', 'right');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(/正好/.test(w), `just right: ${w}`);
  await shot('05_just_right.png');
  await k('aim', STOVE, KNOB, 1.0);
  await k('press');

  // ---- 3. the pan off the burner, carried to a plate
  await k('aim', STOVE, TOP, 1.25);
  await k('holdL', 1.0);
  let h = await k('held');
  ok(h?.item === 'kit_pan' && h.pot === 2, `the pan in the hands with what is in it (${JSON.stringify(h)})`);
  const plate = await k('lay', 'kit_plate', 1.2, 0.9);
  w = await k('aimUid', plate, 0.85);
  ok(/装盘/.test(w), `the pan at a plate lying by the kitchen: ${w}`);
  await shot('06_pan_at_the_plate.png');
  await k('press');
  const dish = await k('lyingKind', plate);
  h = await k('held');
  ok(dish === 'dish_tomato_egg' && h?.item === 'kit_pan' && h.pot === 0, `dished up where it lies: ${dish}, the pan in the hands emptied (${JSON.stringify(h)})`);
  await k('sim', 0.6);
  await shot('07_dished_up.png');

  // ---- 4. eaten
  await k('empty');
  await k('aimUid', plate, 0.85);
  await k('press');
  h = await k('held');
  const mealFood = await page.evaluate(() => window.__rt.game.player.held?.item?.state?.meal?.food ?? 0);
  ok(h?.item === 'dish_tomato_egg', `the dish taken up (${JSON.stringify(h)})`);
  await k('setFood', 40);
  await page.evaluate(() => window.__rt.look(window.__rt.game.input.lookYaw, 0.4));
  await k('right', 0.1, 1.2);
  await shot('08_eating.png');
  await k('right', 0.0, 9);
  const fed = await k('food');
  const slots = await k('slots');
  const meal = await k('clock');
  ok(fed >= 40 + mealFood - 1 && mealFood > 0 && slots.includes('kit_plate'), `eaten: food 40 → ${fed.toFixed(0)} (the dish's ${mealFood}), the plate back in the hands (${slots.join(' ')})`);
  console.log(`the meal, the tomato onto the board to the plate empty: ${meal.toFixed(0)} s of the game's time`);

  // ---- 5. the pan back on the burner, a pot swapped for it
  await k('empty');
  await k('hold', 'kit_pan');
  await k('aim', STOVE, TOP, 1.25);
  await k('press');
  ok((await k('kit', STOVE))?.on === 'kit_pan', 'the pan back on the burner');
  await k('hold', 'kit_pot');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(/换锅/.test(w), `a pot at the burner with the pan on it: ${w}`);
  await k('press');
  ok((await k('kit', STOVE))?.on === 'kit_pot' && (await k('held'))?.item === 'kit_pan', 'swapped: the pot on the burner, the pan in the hands');
  await shot('09_swapped.png');

  // ---- 6. coffee
  await k('empty');
  // (away from the kitchen's own things, so the mark finds them and nothing else)
  await k('lay', 'nd_coffee_machine', 2.6, -1.6);
  const mug = await k('lay', 'nd_mug', 2.6, -1.2);
  await k('hold', 'nd_coffee_pack');
  w = await k('aimPart', 'hopper');
  ok(/倒进咖啡豆/.test(w), `the beans at the hopper: ${w}`);
  await k('holdL', 1.3);
  let c = (await k('coffee')).machines[0];
  ok(c?.fill > 0.9, `the beans in: ${JSON.stringify(c)}`);
  await k('hold', 'coffee_pot');
  w = await k('aimPart', 'cup');
  ok(/放上 <b>咖啡壶/.test(w), `the pot at the spout: ${w}`);
  await k('press');
  w = await k('aimPart', 'switch');
  await k('press');
  await k('sim', 1.2);
  c = (await k('coffee')).machines[0];
  ok(c?.brew !== null && c.cup?.item === 'coffee_pot', `the switch: grinding, then brewing (${JSON.stringify(c)})`);
  await k('sim', 8.4);
  await k('aimPart', 'cup', 0.9);
  await shot('10_coffee_running.png');
  await k('sim', 2.5);
  c = (await k('coffee')).machines[0];
  ok(c?.cup?.litres > 0.9, `a pot of coffee: ${JSON.stringify(c?.cup)}`);
  await k('empty');
  await k('aimPart', 'cup');
  await k('press');
  await k('sim', 0.3);
  h = await k('held');
  ok(h?.item === 'coffee_pot' && h.litres > 0.9, `the pot taken off (${JSON.stringify(h)})`);
  w = await k('aimUid', mug, 0.75);
  await k('holdL', 2.4);
  await shot('11_poured_into_the_mug.png');
  const mugL = await page.evaluate(() => window.__rt.game.loose.list.find((l) => l.item?.item === 'nd_mug')?.item.litres ?? 0);
  ok(mugL > 0.2, `poured into the mug: ${mugL.toFixed(2)} L (${w})`);
  await k('empty');
  await k('aimUid', mug, 0.75);
  await k('press');
  h = await k('held');
  ok(h?.item === 'nd_mug', `the mug taken up (${JSON.stringify(h)})`);
  const warm0 = await page.evaluate(() => window.__rt.game.body.effects.warm1 ?? 0);
  await page.evaluate(() => window.__rt.look(window.__rt.game.input.lookYaw, 0.3));
  await k('right', 2.5, 0.3);
  await shot('12_drinking.png');
  const after = await page.evaluate(() => ({ warm: window.__rt.game.body.effects.warm1 ?? 0, l: window.__rt.game.player.held?.item?.litres ?? -1 }));
  ok(after.warm > warm0 && after.l < mugL, `drunk: warm ${warm0} → ${after.warm}, the mug ${mugL.toFixed(2)} → ${after.l.toFixed(2)} L`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j4_kitchen: ${bad} FAILED` : 'j4_kitchen: ok');
process.exit(bad ? 1 : 0);
