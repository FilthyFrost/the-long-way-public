// The kitchen, step 3 (docs/V3/plan/cooking.md §5), walked through in the game: a kitchen laid out on the ground,
// then a whole meal with E and F alone —
//   1. a canister changed (its ghost in the bay; the cover, the lever, the old one out, the new one in), the old one
//      set down where one aims (its ghost on the ground)
//   2. a tomato onto the board (its ghost there), three strokes, the cut tomato taken up
//   3. into the pan on the stove (ghost; the count on the mark), an egg after it, a pinch of salt
//   4. the knob: the flame; the pan asks to be tossed; just right — the ring round the rim
//   5. a plate under it: the dish, its stars, "new recipe"; eaten: it feeds, and the plate is back
//   6. what no recipe knows: a failed dish, noted, and said the next time the same things go in
//   7. a bowl: tossed three times, a salad; the pan taken off and set down by itself; the gas running out
//   SHOTS_GPU=1 node harness/shots/k3_kitchen.mjs [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/k3_kitchen');
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
  // ---- the page's side: a few helpers under window.__k
  await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    const IT = await import('/src/core/modcar/items.ts');
    const K = await import('/src/game/modcar/v3/kitchen/index.ts');
    const D = await import('/src/game/modcar/v3/kitchen/devTab.ts');
    const KIT = await import('/src/core/v3/kitchen/kit.ts');
    const SS = await import('/src/core/world/spine.ts');
    const sys = K.kitchen;
    const sim = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) g.simulate(1 / 30); };
    const unit = (item, nth = 0) => sys.list.filter((u) => u.item.item === item)[nth] ?? null;
    const word = () => {
      const t = g.player.target;
      if (!t) return '';
      if (t.kind !== 'device') return t.kind;
      const h = g.player.held;
      const take = h && t.device.take ? t.device.take(h) : null;
      return `${t.device.id.split(':').pop()}|${(take ? take.word : t.device.word).zh}${take && !take.ok ? '|off' : ''}`;
    };
    window.__k = {
      sys,
      KIT,
      IT,
      sim,
      unit,
      word,
      /** on foot on the road ahead of the car, a kitchen at one's feet */
      async setup() {
        const st = new SS.SpineSample();
        g.world.spine.at(318, st);
        rt.stand(st.x, st.z, st.phi, -0.5);
        const n = D.layKitchen(g);
        await g.loose.settled();
        sim(1.5);
        return n;
      },
      /** stand off a point of a thing (its own frame), on its front side, looking at it */
      aim(item, local, dist = 1.15, nth = 0) {
        const u = unit(item, nth);
        if (!u) return `no ${item}`;
        const o = g.core.origin;
        const p = u.loose.obj.localToWorld(u.loose.obj.position.clone().set(local[0], local[1], local[2]));
        rt.aimPoint(p.x + o.x, p.y + o.y, p.z + o.z, u.loose.yaw, dist);
        sim(0.2);
        return word();
      },
      /** look at a point of the ground beside a thing (so many metres to one's right of it, so many nearer one) from where one stands */
      aimGround(item, right, nearer = 0) {
        const u = unit(item);
        const w = g.player.walker;
        const yaw = u.loose.yaw;
        const x = u.loose.x + Math.sin(yaw) * right + Math.cos(yaw) * nearer;
        const z = u.loose.z - Math.cos(yaw) * right + Math.sin(yaw) * nearer;
        const eye = w.eye();
        g.input.lookYaw = Math.atan2(z - w.z, x - w.x);
        g.input.lookPitch = Math.atan2(u.loose.y - eye.y, Math.hypot(x - w.x, z - w.z));
        sim(0.2);
        return word();
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
      /** F pressed and let go at once */
      tapF() {
        g.rightButton = true;
        for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
        g.rightButton = false;
        for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
        return word();
      },
      holdF(seconds) {
        g.rightButton = true;
        for (let t = 0; t < seconds; t += 1 / 60) g.step(1 / 60, 1);
        g.rightButton = false;
        for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
      },
      held: () => rt.game.player.telemetry(),
      tele: () => sys.telemetry(),
      kit: (item, nth = 0) => JSON.parse(JSON.stringify(unit(item, nth)?.item.state?.kit ?? null)),
      /** until a stove's pot is in a phase, or asks to be stirred (at most so many seconds) */
      until(what, max = 60) {
        const u = unit('kit_stove');
        for (let t = 0; t < max; t += 1 / 30) {
          if (what === 'ask' ? KIT.asksStir(u.item) : KIT.phaseOf(u.item) === what) return t;
          g.simulate(1 / 30);
        }
        return -1;
      },
      food: () => g.body.food,
      book: () => JSON.parse(JSON.stringify(sys.book)),
      said: () => g.ui.root?.querySelector?.('.toast')?.textContent ?? '',
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
  const BAY = [0.02, 0.1, -0.125];

  // ---- 0. a kitchen at one's feet
  const n = await k('setup');
  let t = await k('tele');
  ok(n >= 15 && t.units.length === 9, `a kitchen laid out: ${n} things, ${t.units.length} of them worked with E (${t.units.map((u) => u.item).join(' ')})`);
  await k('aim', STOVE, [0, 0.1, 0], 2.0);
  await shot('01_laid_out.png');

  // ---- 1. the canister
  let w = await k('hold', 'kit_gas');
  w = await k('aim', STOVE, BAY);
  t = await k('tele');
  ok(/换上这罐燃气/.test(w) && t.ghosts.includes('can:kit_gas*'), `a canister in the hands at the stove: ${w} · ghosts ${t.ghosts.join(' ')}`);
  await shot('02_canister_ghost.png');
  await k('press');
  await k('sim', 0.75);
  await shot('03_canister_out.png');
  await k('sim', 0.6);
  await shot('04_canister_in.png');
  await k('sim', 1.6);
  let h = await k('held');
  ok(h.held === 'item:kit_gas' && (await k('kit', STOVE)).gas === 2400, `E: changed — the old one in the hands (${h.held}), the stove full (${JSON.stringify(await k('kit', STOVE))})`);
  // the old one set down where one aims
  w = await k('aimGround', STOVE, 1.0, 0.1);
  t = await k('tele');
  ok(/放下/.test(w) && t.ghosts.some((g) => g.startsWith('place:kit_gas')), `aimed at the ground with it: ${w} · ${t.ghosts.join(' ')}`);
  await shot('05_set_down_ghost.png');
  await k('press');
  await k('sim', 0.6);
  h = await k('held');
  ok(h.held === '', `E: set down (hands: "${h.held}")`);

  // ---- 2. the board
  await k('hold', 'ing_tomato', { n: 2 });
  w = await k('aim', 'kit_board', [0, 0.03, 0.03]);
  t = await k('tele');
  ok(/放到案板上/.test(w) && t.ghosts.includes('food:ing_tomato*'), `a tomato at the board: ${w} · ${t.ghosts.join(' ')}`);
  await shot('06_board_ghost.png');
  await k('press');
  h = await k('held');
  ok((await k('kit', 'kit_board')).food?.id === 'tomato' && h.heldN === 1, `E: one tomato on the board, one left in the hands (${h.heldN})`);
  await k('empty');
  w = await k('aim', 'kit_board', [0, 0.03, 0.03]);
  ok(/切.*番茄.*0\/3/.test(w), `empty hands at the board: ${w}`);
  await k('press');
  await page.evaluate(() => window.__k.sim(0.1));
  await shot('07_chopping.png');
  await k('press');
  w = await k('press');
  ok((await k('kit', 'kit_board')).food?.cut === 1 && /拿起切好的/.test(w), `three strokes: cut (${w})`);
  await k('sim', 0.5);
  await shot('08_cut.png');
  await k('press');
  h = await k('held');
  ok(h.held === 'item:cut_tomato' && (await k('kit', 'kit_board')) === null, `E: the cut tomato in the hands (${h.held})`);

  // ---- 3. into the pan
  w = await k('aim', STOVE, TOP);
  t = await k('tele');
  ok(/煎炒：放进.*番茄.*1\/5/.test(w) && t.ghosts.includes('food:cut_tomato*'), `the cut tomato at the pan: ${w} · ${t.ghosts.join(' ')}`);
  await shot('09_pan_ghost.png');
  await k('press');
  await k('hold', 'ing_egg');
  w = await k('aim', STOVE, TOP);
  ok(/2\/5/.test(w), `an egg after it: ${w}`);
  await k('press');
  ok(JSON.stringify((await k('kit', STOVE)).pot.items) === '[{"id":"tomato","cut":1},{"id":"egg"}]', `in the pan: ${JSON.stringify((await k('kit', STOVE)).pot)}`);
  await k('hold', 'kit_spice');
  w = await k('aim', STOVE, TOP);
  ok(/撒.*盐/.test(w), `the seasonings in the hands: ${w}`);
  await k('press');
  ok((await k('kit', STOVE)).pot.season?.[0] === 'salt', 'E: a pinch of salt');
  await k('empty');
  await k('sim', 0.4);
  await shot('10_in_the_pan.png');

  // ---- 4. the flame
  w = await k('aim', STOVE, KNOB, 1.0);
  ok(/knob\|点火$/.test(w), `the knob: ${w}`);
  await k('press');
  ok((await k('kit', STOVE)).fire === 2, 'E: alight');
  await k('aim', STOVE, TOP, 1.25);
  let dt = await k('until', 'ask');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(dt > 2 && /翻炒一下！/.test(w), `after ${dt.toFixed(1)} s the pan asks to be tossed: ${w}`);
  await shot('11_asks_to_be_tossed.png');
  await k('press');
  ok((await k('kit', STOVE)).pot.stirs === 1, 'E: tossed');
  dt = await k('until', 'right');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(dt > 1 && /正好/.test(w), `${dt.toFixed(1)} s more: ${w}`);
  await shot('12_just_right.png');

  // ---- 5. the plate
  await k('hold', 'kit_plate', { n: 2 });
  w = await k('aim', STOVE, TOP, 1.25);
  ok(/装盘$/.test(w), `a plate in the hands: ${w}`);
  await k('press');
  h = await k('held');
  let book = await k('book');
  ok(h.held === 'item:dish_tomato_egg' && book.made.tomato_egg?.n === 1 && book.made.tomato_egg?.p === 1, `E: ${h.held} in the hands, in the book ${JSON.stringify(book.made)}`);
  ok(h.counts.split(',').includes('1'), `one plate left of the two (${h.counts})`);
  await k('sim', 0.25);
  await shot('13_dished_up.png');
  await k('aim', STOVE, KNOB, 1.0);
  // (the dish is what F is for now: the knob is turned with E)
  await k('press');
  ok((await k('kit', STOVE)).fire === undefined, 'the flame off');
  const before = await k('food');
  // (looking away from the kitchen: F held on a thing picks it up once the meal is done)
  await page.evaluate(() => { window.__rt.game.body.food = 40; window.__rt.look(window.__rt.game.input.lookYaw, 0.6); });
  await k('holdF', 6);
  await k('sim', 6);
  h = await k('held');
  const fed = await k('food');
  ok(fed > 60 && !`${h.slot1} ${h.slot2}`.includes('dish_') && h.counts.split(',').includes('2'), `eaten: food 40 → ${fed.toFixed(0)} (it was ${before.toFixed(0)}), the plate back (${h.slot1} ${h.slot2} ${h.counts})`);

  // ---- 6. what no recipe knows
  await k('empty');
  for (const id of ['ing_watermelon', 'ing_tuna']) {
    await k('hold', id);
    await k('aim', STOVE, TOP, 1.25);
    await k('press');
  }
  await k('empty');
  await k('aim', STOVE, KNOB, 1.0);
  await k('press');
  await k('until', 'right');
  await k('hold', 'kit_plate');
  await k('aim', STOVE, TOP, 1.25);
  await k('press');
  h = await k('held');
  book = await k('book');
  ok(h.held === 'item:dish_mess' && book.fails.length === 1, `watermelon and tuna, fried: ${h.held}; noted ${JSON.stringify(book.fails)}`);
  await k('sim', 0.2);
  await shot('14_failed.png');
  await k('empty');
  await k('hold', 'ing_tuna');
  await k('aim', STOVE, TOP, 1.25);
  await k('press');
  await k('hold', 'ing_watermelon');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(/上次这样做砸了/.test(w), `the same things again: ${w}`);
  await shot('15_warned.png');
  // (taken back out: the pan is raw, the flame — still on from the last pot — is put out first)
  await k('empty');
  await k('aim', STOVE, KNOB, 1.0);
  await k('press');
  w = await k('aim', STOVE, TOP, 1.25);
  ok(/取回金枪鱼/.test(w), `empty hands at a raw pan: ${w}`);
  await k('press');
  h = await k('held');
  ok(h.held === 'item:ing_tuna' && (await k('kit', STOVE)).pot === undefined, `E: taken back (${h.held})`);

  // ---- 7. a bowl; the pan by itself; the gas runs out
  await k('empty');
  for (const id of ['ing_lettuce', 'ing_tomato']) {
    await k('hold', id);
    w = await k('aim', 'kit_bowl', [0, 0.06, 0], 1.3);
    await k('press');
  }
  await k('empty');
  w = await k('aim', 'kit_bowl', [0, 0.06, 0], 1.3);
  ok(/拌一拌（0\/3）/.test(w), `the bowl: ${w}`);
  await k('press');
  await k('press');
  w = await k('press');
  ok(/拌好了/.test(w), `three tosses: ${w}`);
  await k('hold', 'kit_dish');
  await k('aim', 'kit_bowl', [0, 0.06, 0], 1.3);
  await k('press');
  h = await k('held');
  ok(h.held === 'item:dish_salad', `a bowl under it: ${h.held}`);
  await shot('16_salad.png');
  await k('empty');
  w = await k('aim', STOVE, TOP, 1.25);
  w = await k('tapF');
  h = await k('held');
  ok(h.held === 'item:kit_pan' && (await k('kit', STOVE))?.on === undefined, `F on the pan: taken off (${h.held})`);
  w = await k('aimGround', STOVE, 1.0, 0.45);
  await shot('17_pan_set_down_ghost.png');
  await k('press');
  await k('sim', 0.6);
  t = await k('tele');
  ok(t.units.some((u) => u.item === 'kit_pan'), `E: the pan stands by itself (${t.units.map((u) => u.item).join(' ')})`);
  await page.evaluate(() => { window.__k.KIT.kitState(window.__k.unit('kit_stove').item).gas = 3; });
  await k('aim', STOVE, KNOB, 1.0);
  await k('press');
  await k('sim', 5);
  const st = await k('kit', STOVE);
  ok(st.gas === 0 && st.fire === undefined, `three seconds of gas: out (${JSON.stringify(st)})`);
  w = await k('aim', STOVE, KNOB, 1.0);
  ok(/燃气罐空了/.test(w), `the knob now: ${w}`);
  await shot('18_out_of_gas.png');

  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(`the script threw: ${e?.stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
