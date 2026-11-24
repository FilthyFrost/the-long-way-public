// J6 (docs/V3/plan/growth.md §四, 定案 5), walked through in the game: the body's new marks and what they mean —
//   1. the HUD top left: health, food, water, energy, the bladder (five tiles), the states under them
//   2. clothes: the old jacket and shoes on the bench, put on with the right button held (the board's first step,
//      J5's workshop); the warmth they give; the Tab list's 我身上 shows them, a piece taken off into the hands
//   3. ill: spoiled food eaten — health off now and then, sick up; the stomach pills end it
//   4. hurt: a fall of ten metres — health off, 受伤 (a limp); the painkillers end it
//   5. a crash: a knock of the car one sits in at 12 m/s (as its simulation reports one) — health off
//   6. sleepy: an hour awake (energy under 20) — the badge, the view dimming; in the seat of the car standing with its
//      engine off, the right button held: the night goes by, rested, health back
//   7. coffee: energy back, kept awake; a good dish: health back and a buff (有劲) among the states
//   SHOTS_GPU=1 node harness/shots/j6_body.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j6_body');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&kit=j5&project=full&time=13`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  const body = () => ev(() => JSON.parse(JSON.stringify(window.__rt.game.body)));
  const badges = () => ev(() => [...document.querySelectorAll('.mc-vit .fx span')].map((e) => e.textContent));
  const sim = (s) => rt('simulate', s);
  const rightHold = (seconds) =>
    ev((s) => {
      const g = window.__rt.game;
      g.rightButton = true;
      for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1);
      g.rightButton = false;
      for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
    }, seconds);
  await sim(1);

  // ---- 1. the marks top left
  const tiles = await ev(() => [...document.querySelectorAll('.mc-vit .tile')].map((t) => t.getAttribute('data-k')));
  ok(tiles.join(',') === 'hp,food,water,energy,bladder', `five tiles: ${tiles.join(' ')}`);
  await rt('look', 0.1, -0.1);
  await shot('01_hud.png');

  // ---- 2. clothes
  const warm0 = await ev(() => window.__rt.game.warmth());
  ok(warm0 === 4, `the nightdress only: warmth ${warm0}`);
  for (const id of ['wear_jacket_torn', 'wear_shoes_torn']) {
    if (!(await rt('pickUp', `item:${id}`))) fail(`no ${id} on the bench`);
    await sim(0.1);
    const line = await ev(() => [...document.querySelectorAll('.mc-acts .act, .mc-keys .row, .mc-acts div')].map((e) => e.textContent).join(' | '));
    await rightHold(0.7);
    const worn = await ev((id) => Object.values(window.__rt.game.player.worn).some((it) => it?.item === id), id);
    ok(worn, `${id} put on with the right button held (${line.slice(0, 80)})`);
  }
  const warm1 = await ev(() => window.__rt.game.warmth());
  ok(warm1 === 10, `warmth with the old jacket and shoes: ${warm1}`);
  // the Tab list: what one has on (away from the car)
  await rt('stand', -4.6, 2.2, 0.4, -0.2);
  await ev(() => window.__rt.game.toggleCargoList());
  await sim(0.2);
  const rows = await ev(() => [...document.querySelectorAll('.mc-cargo .row, .mc-cl .row, .mc-list-rows .row')].map((e) => e.textContent));
  await shot('02_tab_worn.png');
  const listed = await ev(() => {
    const g = window.__rt.game;
    const src = g.listSrc ?? null;
    return src ? src.rows().map((r) => `${r.zone}:${r.name}`) : g.listV;
  });
  ok(Array.isArray(listed) && listed.some((r) => r.includes('破外套')) && listed.some((r) => r.includes('破鞋')), `Tab 我身上: ${JSON.stringify(listed)} ${rows.length}`);
  const off = await ev(() => {
    const g = window.__rt.game;
    const src = g.listSrc;
    const i = src.rows().findIndex((r) => r.name.includes('破外套'));
    const took = src.takeAt(i);
    return { took, held: g.player.held?.item?.item ?? null, jacket: !!g.player.worn.jacket };
  });
  ok(off.took && off.held === 'wear_jacket_torn' && !off.jacket, `the jacket taken off into the hands: ${JSON.stringify(off)}`);
  await ev(() => window.__rt.game.closeCargoList());
  await rightHold(0.7);
  ok(await ev(() => !!window.__rt.game.player.worn.jacket), 'and put on again');

  // ---- 3. ill
  await ev(() => window.__rt.game.player.slots.fill(null));
  await rt('hold', 'item:ing_spoiled');
  await rightHold(4.5);
  let b = await body();
  ok(!!b.effects.sick2, `spoiled food eaten: badly ill (${JSON.stringify(b.effects)})`);
  const hp0 = b.hp;
  let vomited = false;
  for (let k = 0; k < 8 && !vomited; k++) {
    await sim(10);
    vomited = await ev(() => document.querySelector('.mc-toast')?.textContent === '吐了……' && document.querySelector('.mc-toast').style.opacity !== '0');
  }
  b = await body();
  await shot('03_ill.png');
  ok(b.hp < hp0 && (await badges()).some((t) => t.includes('肚子疼')), `ill a while: health ${hp0.toFixed(0)} → ${b.hp.toFixed(0)}, sick up: ${vomited}, the badges ${JSON.stringify(await badges())}`);
  await rt('hold', 'item:med_stomach');
  await rightHold(2.6);
  b = await body();
  ok(!b.effects.sick2 && !b.effects.sick1, 'the stomach pills: well again');

  // ---- 4. a fall of ten metres
  await ev(() => window.__rt.game.player.slots.fill(null));
  await ev(() => {
    const g = window.__rt.game;
    g.body.hp = 100;
    const w = g.player.walker;
    w.place(-4.0, 1.2, 0.3, 0);
    w.y += 10;
    w.vy = 0;
    w.grounded = false;
  });
  for (let k = 0; k < 40; k++) {
    await sim(0.1);
    if (await ev(() => window.__rt.game.player.walker.grounded)) break;
  }
  await sim(0.2);
  b = await body();
  const speed = await ev(() => window.__rt.game.player.walker.speedScale);
  ok(b.hp < 80 && b.hp > 60 && !!b.effects.hurt, `a fall of 10 m: health ${b.hp.toFixed(0)}, hurt (${speed.toFixed(2)} of the pace)`);
  await shot('04_hurt.png');
  await rt('hold', 'item:med_pain_2');
  await rightHold(2.6);
  b = await body();
  ok(!b.effects.hurt && b.hp > 90, `the painkillers: no more limp, health ${b.hp.toFixed(0)}`);

  // ---- 5. a crash: a knock of the car one sits in at 12 m/s, as its simulation reports one (the garage's walls keep a
  // car in without a knock: on the road a post, a wreck, a building's corner)
  await ev(() => window.__rt.game.player.slots.fill(null));
  await rt('enter', 0);
  await sim(0.3);
  const crash = await ev(() => {
    const g = window.__rt.game;
    const v = g.seated;
    g.body.hp = 100;
    v.sim.hits += 1;
    v.sim.lastHitSpeed = 12;
    for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
    return { hp: g.body.hp, hurt: !!g.body.effects.hurt };
  });
  ok(crash.hp < 100 && crash.hp > 85, `a crash at 12 m/s from the seat: health 100 → ${crash.hp.toFixed(0)}`);
  await sim(0.5);

  // ---- 6. sleepy, and a night's sleep in the seat
  await ev(() => {
    const g = window.__rt.game;
    g.body.energy = 14;
    g.body.hp = 70;
  });
  await sim(0.5);
  ok((await badges()).some((t) => t.includes('困了')), `sleepy: ${JSON.stringify(await badges())}`);
  const keys = await ev(() => [...document.querySelectorAll('.mc-keys, .mc-acts')].map((e) => e.textContent).join(' '));
  // the view dims for a moment now and then
  let dimmed = 0;
  for (let k = 0; k < 40 && dimmed < 0.3; k++) {
    await sim(1);
    dimmed = await ev(() => Number(document.querySelector('.mc-fx .doze')?.style.opacity ?? 0));
  }
  await shot('05_sleepy.png');
  ok(dimmed >= 0.3, `the view dims now and then (${dimmed.toFixed(2)})`);
  const hour0 = await ev(() => window.__rt.game.env.clock.hourAt(window.__rt.game.time));
  await rightHold(1.2);
  await sim(1.0);
  await shot('06_asleep.png');
  await sim(2.5);
  b = await body();
  const hour1 = await ev(() => window.__rt.game.env.clock.hourAt(window.__rt.game.time));
  const toast = await ev(() => document.querySelector('.mc-toast')?.textContent ?? '');
  await shot('07_woke.png');
  ok(b.energy === 100 && b.hp > 90 && /睡了/.test(toast), `slept in the seat (${/睡觉/.test(keys) ? 'the line said 睡觉' : 'no line'}): ${toast}, energy ${b.energy}, health ${b.hp.toFixed(0)}, ${hour0.toFixed(1)} h → ${hour1.toFixed(1)} h`);
  await rt('exit');

  // ---- 7. coffee and a good dish
  await ev(() => {
    const g = window.__rt.game;
    g.body.energy = 30;
    g.drank('coffee', 0.25);
  });
  b = await body();
  ok(Math.round(b.energy) === 70 && !!b.effects.awake, `a mug of coffee: energy 30 → ${b.energy.toFixed(0)}, kept awake`);
  await ev(() => window.__rt.game.player.slots.fill(null));
  await rt('hold', 'item:dish_tomato_egg', { state: { meal: { food: 30, perfect: 1 } } });
  await ev(() => (window.__rt.game.body.hp = 60));
  await rightHold(6);
  await sim(5);
  b = await body();
  const bs = await badges();
  await rt('look', 0.1, -0.1);
  await shot('08_buff.png');
  ok(bs.some((t) => t.includes('有劲')) && b.hp > 68, `tomato and eggs, perfect: ${JSON.stringify(bs)}, health 60 → ${b.hp.toFixed(0)}`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j6_body: ${bad} FAILED` : 'j6_body: ok');
process.exit(bad ? 1 : 0);
