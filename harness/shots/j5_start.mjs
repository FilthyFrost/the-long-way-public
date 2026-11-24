// J5 (docs/V3/plan/growth.md §一 1–3, 定案 1, 7), walked through in the game: the main menu, a new game at a difficulty,
// and from there out of the workshop the way the board says —
//   0. the title (no save: 新游戏 only), the new game's card (three difficulties), 开始: the game behind it begins
//   1. the workshop as the start has it: the Sugar Cube a bare shell, its twenty-nine parts about the room, the start's
//      junk by the recycler, the board on the wall and in the corner; nothing else (no other vehicle, no fun parts)
//   2. the power (the generator's rope, outside); the two boxes and the dead television into the recycler (the board
//      counts 0/3 → 3/3, 50 scrap: the plastic scraper's cost exactly); the scraper made at the bench; the windscreen
//      scraped
//   3. to start: the engine, the battery, the ignition, the radiator, water in it (the bottle filled at the sink),
//      petrol from the can; to drive: four wheels, the steering wheel, the driver's seat, the gear lever, the handbrake
//      (the gearbox and the exhaust are on the shell: under its floor) — the doors' button refuses before (车还开不了),
//      opens after
//   4. to be a car: the doors, the bonnet, the boot lid, the lamps, the mirrors, the bumpers, the other seats, the horn
//   5. in, the key, out of the doors onto the road: the worn little four pulls it
//   The game's seconds are counted, and a person's minutes estimated from how far one walks between the things
//   (1.4 m/s, carrying) and a few seconds to find and line up each (the plan's mark: 15–25 minutes).
//   SHOTS_GPU=1 node harness/shots/j5_start.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j5_start');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
// a person's time: metres walked, things found and lined up, buttons held
const person = { walked: 0, finds: 0, held: 0 };
let at = null;
const walkTo = (x, z) => {
  if (at) person.walked += Math.hypot(x - at.x, z - at.z);
  at = { x, z };
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&kit=j5&time=10`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  const tele = () => rt('telemetry');
  const steps = async () => (await tele()).steps;
  const board = () => ev(() => window.__rt.game.tutorialSteps().map((s) => ({ id: s.id, done: s.done, group: s.group ?? null, text: s.text })));
  const clockS = () => ev(() => window.__rt.game.time);
  const walker = () => ev(() => ({ x: window.__rt.game.player.walker.x, z: window.__rt.game.player.walker.z }));
  const lyingAt = (id) =>
    ev((id) => {
      const l = window.__rt.game.loose.list.find((x) => x.part?.part === id || (x.tool && `tool:${x.tool.kind}` === id) || (x.item && `item:${x.item.item}` === id));
      return l ? { x: l.x, z: l.z } : null;
    }, id);

  // ---- 0. the title, the new game's card, 开始
  const m0 = await rt('menu', 'title');
  const hasResume = await ev(() => !!document.querySelector('.mc-menu [data-act=resume]'));
  ok(m0.open && m0.mode === 'title' && !hasResume, `the title: open, no 继续 without a save (${JSON.stringify(m0)})`);
  await shot('00_title.png');
  await page.click('.mc-menu [data-act=new]');
  await page.click('.mc-menu [data-diff=hard]');
  await shot('01_new_game.png');
  await page.click('.mc-menu [data-diff=normal]');
  await page.click('.mc-menu [data-act=begin]');
  const m1 = await rt('menu');
  ok(!m1.open && m1.difficulty === 'normal', `开始: the menu shut, the game begun at 普通 (${JSON.stringify(m1)})`);
  const t0 = await clockS();
  await rt('simulate', 1.0);

  // ---- 1. the workshop as the start has it
  const kit = await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles;
    const kinds = g.loose.list.map((l) => l.part?.part ?? (l.tool ? `tool:${l.tool.kind}` : `item:${l.item?.item}`));
    return { vehicles: v.length, onCar: Object.keys(v[0].build.parts).sort(), parts: g.loose.list.filter((l) => l.part).length, kinds, conds: g.loose.list.filter((l) => l.part).map((l) => l.part.cond) };
  });
  ok(kit.vehicles === 1, `one vehicle in the yard, the Sugar Cube (${kit.vehicles})`);
  ok(kit.onCar.join(',') === 'brakes_F,brakes_R,diff_R,exhaust,fuelTank,gearbox,susp_F,susp_R', `the shell: ${kit.onCar.join(' ')}`);
  ok(kit.parts === 29 && kit.conds.every((c) => c >= 0.4 && c <= 0.7), `twenty-nine parts about the room, all old (${kit.parts}; ${Math.min(...kit.conds)}–${Math.max(...kit.conds)})`);
  const ALLOWED = new Set(['item:crate_parts', 'item:junk_tv_dead', 'item:drink_water', 'item:food_biscuits', 'item:forage_knife', 'item:forage_basket', 'item:wear_jacket_torn', 'item:wear_shoes_torn', 'tool:jerrycan', 'tool:bottle', 'tool:sponge']);
  const extra = kit.kinds.filter((k) => k.includes(':') && !ALLOWED.has(k));
  ok(extra.length === 0, `nothing else lying about but the start's things: ${extra.join(' ') || 'none'} (${kit.kinds.filter((k) => k.includes(':')).join(' ')})`);
  await shot('02_spawn.png');
  // the board on the wall
  const chalk = await ev(() => {
    const g = window.__rt.game;
    let p = null;
    g.garage.root.traverse((o) => {
      if (o.name === 'garage:chalkboard') p = o.getWorldPosition(o.position.clone());
    });
    const o = g.core.origin;
    return p ? { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z } : null;
  });
  if (chalk) {
    await rt('aimPoint', chalk.x, chalk.y, chalk.z, 0, 2.6);
    await shot('03_board.png');
  }
  at = await walker();
  at = { x: -5.6, z: -1.25 };

  // ---- 2. the workshop's steps
  // (J6: one wakes in the nightdress — the old jacket and shoes on the bench, put on with the right button held)
  for (const id of ['item:wear_jacket_torn', 'item:wear_shoes_torn']) {
    const p = await lyingAt(id);
    if (p) walkTo(p.x, p.z);
    person.finds++;
    await rt('pickUp', id);
    await ev(() => {
      const g = window.__rt.game;
      g.rightButton = true;
      for (let t = 0; t < 0.7; t += 1 / 60) g.step(1 / 60, 1);
      g.rightButton = false;
      g.step(1 / 60, 1);
    });
    person.held += 0.7;
  }
  ok((await steps()).includes('clothes'), 'the old jacket and shoes on (the board\'s first step)');
  // the doors' button before the car can drive: why
  const shut = await rt('useDevice', 'door');
  await rt('simulate', 1);
  const why0 = await ev(() => window.__rt.game.garage.doorLock?.()?.zh ?? null);
  ok(shut === 'device:door' && !(await tele()).doorsOpen && why0 === '车还开不了', `the doors' button before the car can drive: shut, ${why0}`);
  // the power
  const cord = await rt('aimAt', 'gen_cord', 0, 1.0);
  walkTo(...Object.values(await walker()));
  person.finds++;
  let pulls = 0;
  while (!(await rt('workshop')).power && pulls < 5) {
    await rt('holdFor', 0.7);
    person.held += 0.7;
    await rt('simulate', 0.3);
    pulls++;
  }
  await rt('simulate', 1.5);
  ok(cord === 'device:gen_cord' && (await steps()).includes('power'), `the generator pulled (${pulls} pulls): the power on`);
  await shot('04_power.png');
  // the junk into the recycler
  for (const id of ['item:crate_parts', 'item:crate_parts', 'item:junk_tv_dead']) {
    const p = await lyingAt(id);
    if (p) walkTo(p.x, p.z);
    person.finds++;
    await rt('pickUp', id);
    const t = await rt('aimAt', 'recycler', Math.PI, 0.95);
    walkTo(...Object.values(await walker()));
    await rt('press');
    await rt('simulate', 0.6);
    if (id === 'item:junk_tv_dead') await shot('05_recycling.png');
    if (t !== 'device:recycler') fail(`not at the recycler with ${id} (${t})`);
  }
  await rt('simulate', 3);
  const scrapLine = (await board()).find((s) => s.id === 'scrap');
  const stock = (await rt('workshop')).stock;
  ok(scrapLine.done && /3\/3/.test(scrapLine.text) && stock.scrap === 50, `the three into the recycler: ${scrapLine.text}, ${stock.scrap} scrap`);
  // a part of the car is not for the recycler
  await rt('pickUp', 'bat_std');
  await rt('aimAt', 'recycler', Math.PI, 0.95);
  const keepWord = await ev(() => {
    const g = window.__rt.game;
    const t = g.player.target;
    const take = t?.kind === 'device' && t.device.take ? t.device.take(g.player.held) : null;
    return take ? `${take.ok}:${take.word.zh}` : String(t?.kind);
  });
  ok(keepWord === 'false:车上要用', `the battery held to the recycler: ${keepWord}`);
  await page.evaluate(() => {
    const g = window.__rt.game;
    const h = g.player.held;
    g.player.held = null;
    g.loose.addPart(h.inst, 2.18, 1.1, -4.6, 0);
  });
  // the scraper at the bench
  await rt('aimAt', 'bench', Math.PI, 1.0);
  walkTo(...Object.values(await walker()));
  person.finds++;
  await rt('press');
  await rt('simulate', 0.5);
  await rt('craftAll', 'scraper_1');
  person.held += 4;
  await rt('simulate', 0.6);
  await rt('aimLoose', 'tool:scraper', 0.9);
  await rt('press');
  ok((await tele()).held === 'tool:scraper' && (await steps()).includes('scraper') && (await rt('workshop')).stock.scrap === 0, 'the scraper made from the 50, in the hands');
  // the windscreen (as modcar_grime scrapes it: from in front, two full passes, then its corners)
  {
    const ws = await ev(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const p = v.view.windscreenAt(v.view.root.position.clone());
      const o = g.core.origin;
      const b = new Float64Array(9);
      v.sim.basis(b);
      return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, fwd: Math.atan2(b[2], b[0]) };
    });
    await rt('aimPoint', ws.x, ws.y, ws.z, ws.fwd + 0.2, 1.05);
    walkTo(...Object.values(await walker()));
    person.finds++;
    const done5 = (r) => (r.grime.cleaning.find((c) => c.owner === 'body')?.doneDirt ?? []).includes(5);
    let last = await rt('scrub', 4.0, 18, 0.62, 0.42);
    last = await rt('scrub', 4.0, 18, 0.62, 0.42);
    person.held += 8;
    for (const [cx, cy] of [[-0.45, 0.1], [0.45, 0.1], [0, 0.32], [0, -0.25], [-0.45, 0.1], [0.45, 0.1], [0, 0.32], [0, -0.25]]) {
      if (done5(last)) break;
      last = await rt('scrub', 1.6, 8, 0.3, 0.16, cx, cy);
      person.held += 1.6;
    }
  }
  ok((await steps()).includes('windscreen'), 'the windscreen scraped');
  await shot('06_windscreen.png');
  await page.evaluate(() => (window.__rt.game.player.held = null));

  // ---- 3. the car: a part from where it lies onto its place
  // (stand where its ghost is in sight — beside the car through where a door goes, over the open bay, behind it — and
  // look at it, as one would walk round to it)
  const aimGhost = async (mount) => {
    // (the ghost's model comes in a moment after the part is taken up)
    // (the ghosts show on the vehicle one looks at: first towards its place)
    let info = null;
    for (let k = 0; k < 40 && !info; k++) {
      if (k % 10 === 0) await rt('aim', 0, mount, 1.6, k >= 20 ? -1 : 0);
      else await page.waitForTimeout(50);
      info = await ghostInfo(mount);
    }
    if (!info) return '';
    return aimAt(info, mount);
  };
  const ghostInfo = (mount) =>
    ev((m) => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      g.simulate(0);
      const c = g.player.ghosts.centerOf(`${v.build.uid}:${m}:`);
      if (!c) return null;
      const o = g.core.origin;
      const b = new Float64Array(9);
      v.sim.basis(b);
      const side = v.view.frame.mounts.find((x) => x.id === m)?.side ?? 0;
      return { x: c.x + o.x, y: c.y + o.y, z: c.z + o.z, fx: b[0], fz: b[2], lx: b[6], lz: b[8], uid: v.build.uid, side };
    }, mount);
  const aimAt = async (info, mount) => {
    const want = `ghost:${info.uid}:${mount}:`;
    const lats = info.side ? [1.0, 1.3, 0.8, 1.7].map((l) => l * info.side).concat([0, -1.0, -1.3]) : [1.0, -1.0, 1.3, -1.3, 0.8, -0.8, 1.7, -1.7, 0];
    for (const lat of lats) {
      for (const lon of [0, -0.4, 0.4, -0.8, 0.8, -1.3, 1.3, -1.8, 1.8]) {
        if (lat === 0 && Math.abs(lon) < 1.2) continue;
        const px = info.x + info.fx * lon + info.lx * lat;
        const pz = info.z + info.fz * lon + info.lz * lat;
        const t = String(await rt('aimPoint', info.x, info.y, info.z, Math.atan2(pz - info.z, px - info.x), Math.hypot(px - info.x, pz - info.z)));
        if (t.startsWith(want)) return t;
      }
    }
    return '';
  };
  const putBack = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const h = g.player.held;
      g.player.held = null;
      if (h?.kind === 'part') g.loose.addPart(h.inst, -4.5, 0.6, 2.0, 0);
    });
  const fit = async (part, mount, seconds = 3.6) => {
    const p = await lyingAt(part);
    if (!p) throw new Error(`no ${part} lying about`);
    walkTo(p.x, p.z);
    person.finds += 2;
    if (!(await rt('pickUp', part))) throw new Error(`could not take up ${part}`);
    const target = await aimGhost(mount);
    walkTo(...Object.values(await walker()));
    if (!target) {
      await putBack();
      throw new Error(`${part}: its ghost on ${mount} not in sight from anywhere round the car`);
    }
    await rt('useFor', seconds);
    person.held += seconds * 0.7;
    await rt('simulate', 0.2);
    const on = await rt('part', 0, mount);
    if (on?.part !== part) {
      await putBack();
      throw new Error(`${part} not on ${mount} after ${seconds} s held (${JSON.stringify(on)}; ${target})`);
    }
    if ((await tele()).held) await page.evaluate(() => (window.__rt.game.player.held = null));
  };
  const tryFit = async (part, mount, seconds) => {
    try {
      await fit(part, mount, seconds);
      return true;
    } catch (e) {
      fail(e.message);
      return false;
    }
  };
  // to start
  await tryFit('eng_i4', 'engine', 4.2);
  await tryFit('bat_std', 'battery', 2.2);
  await tryFit('ign_key', 'ignition', 2.2);
  await tryFit('rad_std', 'radiator', 2.6);
  // water: the bottle filled at the sink, poured into the radiator
  {
    const p = await lyingAt('tool:bottle');
    walkTo(p.x, p.z);
    person.finds += 2;
    await rt('pickUp', 'tool:bottle');
    const sink = await rt('useDevice', 'sink');
    walkTo(...Object.values(await walker()));
    const litres = await ev(() => window.__rt.game.player.held?.tool?.litres ?? 0);
    ok(sink === 'device:sink' && litres > 4.9, `the bottle at the sink: ${litres} L`);
    const f = await rt('aimFiller', 0, 'water');
    walkTo(...Object.values(await walker()));
    await rt('useFor', 4.6);
    person.held += 4.6;
    const cool = await ev(() => window.__rt.game.vehicles[0].build.parts.radiator?.fluids.coolantL ?? 0);
    ok(f && (await steps()).includes('water'), `water poured into the radiator: ${cool.toFixed(1)} L`);
    await page.evaluate(() => (window.__rt.game.player.held = null));
  }
  // petrol: the filler's flap opened by hand, the can held to it
  {
    const p = await lyingAt('tool:jerrycan');
    walkTo(p.x, p.z);
    person.finds += 2;
    await rt('pickUp', 'tool:jerrycan');
    await rt('select', 1);
    await rt('aimCap', 0, 1.1);
    walkTo(...Object.values(await walker()));
    await rt('press');
    await rt('select', 0);
    await rt('aimCap', 0, 1.1);
    const t = String((await tele()).target);
    await rt('useFor', 7);
    person.held += 7;
    await rt('drop');
    ok(t.startsWith('filler:') && (await steps()).includes('fuel'), `petrol in (${t})`);
  }
  const canStart = (await board()).filter((s) => s.group === 'start');
  ok(canStart.every((s) => s.done), `to start: ${canStart.map((s) => (s.done ? '✓' : '✗') + s.id).join(' ')}`);
  await rt('look', -0.2, -0.1);
  await shot('07_can_start.png');
  // to drive
  for (const hub of ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR']) await tryFit('rim_steel13', hub, 2.4);
  await tryFit('steer_bad', 'steering', 2.2);
  await tryFit('seat_bucket', 'seat_driver', 2.8);
  await tryFit('gl_stock', 'gearLever', 2.2);
  await tryFit('hb_stock', 'handbrake', 2.2);
  const b2 = await board();
  const canDrive = b2.filter((s) => s.group === 'drive');
  ok(canDrive.every((s) => s.done), `to drive: ${canDrive.map((s) => (s.done ? '✓' : '✗') + s.id).join(' ')}`);
  const tDrive = await clockS();
  const personDrive = { ...person };
  // the board after the first two groups: the doors may open now
  const why1 = await ev(() => window.__rt.game.garage.doorLock?.() ?? null);
  ok(why1 === null, `the doors' lock lifted (${JSON.stringify(why1)})`);
  if (chalk) {
    await rt('aimPoint', chalk.x, chalk.y, chalk.z, 0, 2.6);
    await shot('08_board_can_drive.png');
  }
  // ---- 4. to be a car
  for (const [part, mount, side] of [
    ['door_stock', 'door_FL', -1],
    ['door_stock', 'door_RL', -1],
    ['door_stock', 'door_FR', 1],
    ['door_stock', 'door_RR', 1],
    ['horn_beep', 'horn', 0],
    ['hood_stock', 'hood', 0],
    ['trunk_stock', 'trunk', 0],
    ['hl_round', 'headlight_L', 0],
    ['hl_round', 'headlight_R', 0],
    ['tl_stock', 'taillight_L', 0],
    ['tl_stock', 'taillight_R', 0],
    ['mir_stock', 'mirror_L', -1],
    ['mir_stock', 'mirror_R', 1],
    ['bf_stock', 'bumperFront', 0],
    ['br_stock', 'bumperRear', 0],
  ])
    await tryFit(part, mount, 3.0);
  // the other seats: through the open door (the doors are on now)
  await rt('openPanel', 0, 'door_FR', true);
  await tryFit('seat_bucket', 'seat_pass', 2.8);
  await rt('openPanel', 0, 'door_FR', false);
  await rt('openPanel', 0, 'door_RL', true);
  await tryFit('seat_bench', 'seat_rear', 3.2);
  await rt('openPanel', 0, 'door_RL', false);
  const car = (await board()).filter((s) => s.group === 'car');
  ok(car.every((s) => s.done), `to be a car: ${car.map((s) => (s.done ? '✓' : '✗') + s.id).join(' ')}`);
  await rt('setOrbit', 215, 14, 6.2, 0.8, 0);
  await shot('09_whole_car.png');
  await rt('setView', 'cockpit');

  // ---- 5. out
  const door = await rt('useDevice', 'door');
  walkTo(...Object.values(await walker()));
  person.finds++;
  await rt('simulate', 4);
  ok(door === 'device:door' && (await tele()).doorsOpen, 'the doors open');
  await shot('10_doors_open.png');
  await rt('enter', 0);
  walkTo(0.4, -1.2);
  person.finds++;
  const ran = await rt('crank', 1.6);
  person.held += 1.6;
  ok(ran === true && (await steps()).includes('start'), 'in, the key: it runs');
  await shot('11_running.png');
  const misfire = await ev(() => window.__rt.game.vehicles[0].build.parts.engine?.cond);
  await rt('drive', 9, 0.7, 0);
  ok((await tele()).place === 'road', `out onto the road (the engine at ${Math.round(misfire * 100)} %)`);
  await shot('12_out.png');
  const r = await rt('drive', 8, 1.0, 0);
  const kmh = (await tele()).kmh;
  await rt('setView', 'chase');
  await shot('13_on_the_road.png');
  console.log(`  on the road: ${kmh?.toFixed?.(0)} km/h after 8 s at full throttle`);
  void r;
  const tEnd = await clockS();
  const mins = (p) => (p.walked / 1.4 + p.finds * 4 + p.held) / 60;
  console.log(`the game's time: to drive ${(tDrive - t0).toFixed(0)} s, out of the doors ${(tEnd - t0).toFixed(0)} s`);
  console.log(`a person (walked ${person.walked.toFixed(0)} m at 1.4 m/s, ${person.finds} finds × 4 s, ${person.held.toFixed(0)} s held): able to drive ${mins(personDrive).toFixed(1)} min, the whole car and out ${mins(person).toFixed(1)} min`);
  fs.writeFileSync(path.join(out, 'timing.json'), JSON.stringify({ gameToDrive: tDrive - t0, gameOut: tEnd - t0, person, personDrive, minutesToDrive: mins(personDrive), minutesOut: mins(person) }, null, 1));
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j5_start: ${bad} FAILED` : 'j5_start: ok');
process.exit(bad ? 1 : 0);
