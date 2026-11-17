// The starting garage's devices, each used the way a player would (walk up, look at it, press): the big
// doors, the light switch, the generator outside (the charger needs its power), the battery charger, the lift (empty, then with the car in its bay), the
// radio, the tap, the tyre changer and the paint gun. A screenshot per step into loop/shots/modcar_garage_devices/; exits non-zero on a failure.
//   SHOTS_GPU=1 node harness/shots/modcar_garage_devices.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_garage_devices');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
const log = [];
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 1280, height: 720 });
  const rt = (fn, ...args) => page.evaluate(([f, a]) => window.__rt[f](...a), [fn, args]);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = async (name, fn, check) => {
    let ok = true;
    let info = null;
    try {
      info = await fn();
      const tele = await rt('telemetry');
      if (check && !(await check(tele, info))) ok = false;
      log.push({ name, ok, info });
    } catch (e) {
      ok = false;
      log.push({ name, ok, error: String(e).slice(0, 300) });
    }
    if (!ok) failed++;
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(`${ok ? ' ok ' : 'FAIL'} ${name}  ${JSON.stringify(log.at(-1)).slice(0, 200)}`);
  };
  const use = async (id) => {
    const target = await rt('useDevice', id);
    if (target !== `device:${id}`) throw new Error(`not aimed at ${id} (target ${target})`);
    return target;
  };

  await step('door_open', async () => {
    await use('door');
    await rt('simulate', 4.5);
  }, (t) => t.doorsOpen === true && t.doorGap > 3.5);
  await step('door_close', async () => {
    await use('door');
    await rt('simulate', 4.5);
  }, (t) => t.doorsOpen === false && t.doorGap < 0.05);

  await step('lights_off', () => use('lights'), (t) => t.lamps === false);
  await step('lights_on', () => use('lights'), (t) => t.lamps === true);

  // (the charger needs the power: the generator outside started first, docs/MODCAR.md §14)
  await step('generator', async () => {
    for (let i = 0; i < 4 && !(await rt('workshop')).power; i++) {
      await rt('aimAt', 'gen_cord', 0, 1.0);
      await rt('holdFor', 0.7);
      await rt('simulate', 0.3);
    }
    return (await rt('workshop')).power;
  }, (t, on) => on === true);
  await step('charger', async () => {
    const before = await ev(() => window.__rt.game.loose.list.find((l) => l.part?.part === 'bat_std')?.part.fluids.charge ?? -1);
    await rt('simulate', 12);
    const after = await ev(() => window.__rt.game.loose.list.find((l) => l.part?.part === 'bat_std')?.part.fluids.charge ?? -1);
    await use('charger');
    return { before, after };
  }, (t, i) => i.after > i.before + 0.05);

  await step('lift_up', async () => {
    await use('lift');
    await rt('simulate', 4.5);
  }, (t) => t.lift > 0.99);
  await step('lift_down', async () => {
    await use('lift');
    await rt('simulate', 4.5);
  }, (t) => t.lift < 0.01);

  // the project car rolled in between the posts: the lift takes it up by the sills and lets it down again
  const carY = () => ev(() => window.__rt.game.vehicles[0].sim.py);
  await step('lift_car_up', async () => {
    await ev(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.sim.reset(-4.45, 0, 3.2, 0, g.garage.ground);
      v.awake = 3;
    });
    await rt('simulate', 2);
    const y0 = await carY();
    await use('lift');
    await rt('simulate', 4.5);
    return { y0, y1: await carY() };
  }, (t, i) => t.lift > 0.99 && t.liftCar !== '' && i.y1 - i.y0 > 1.5);
  await step('lift_car_down', async () => {
    const y1 = await carY();
    await use('lift');
    await rt('simulate', 5.5);
    return { y1, y2: await carY() };
  }, (t, i) => t.lift < 0.01 && t.liftCar === '' && i.y1 - i.y2 > 1.5);

  await step('radio', () => use('radio'), (t) => t.radio === true);

  await step('tap_fills_bottle', async () => {
    await rt('hold', 'tool:bottle', { litres: 0 });
    await use('sink');
    return ev(() => window.__rt.game.player.held?.tool?.litres ?? -1);
  }, (t, litres) => litres > 4.9);

  await step('tyrechanger_off', async () => {
    await rt('drop');
    // a wheel with a road tyre on the turntable, empty hands
    await ev(() => {
      const g = window.__rt.game;
      g.player.held = null;
      const s = g.garage.spots.find((x) => x.where === 'tyrechanger');
      const inst = window.__rt.newPart('rim_steel13', 'tire_road');
      g.loose.addPart(inst, s.x, s.y + 0.3, s.z, 0);
    });
    await rt('simulate', 1);
    await use('tyrechanger');
    await rt('simulate', 2);
    return ev(() => window.__rt.game.player.held?.inst?.part ?? '');
  }, (t, held) => held === 'tire_road');
  await step('tyrechanger_on', async () => {
    await use('tyrechanger');
    await rt('simulate', 2);
    const held = await ev(() => window.__rt.game.player.held?.inst?.part ?? '');
    const onTable = await ev(() => {
      const g = window.__rt.game;
      const s = g.garage.spots.find((x) => x.where === 'tyrechanger');
      const w = g.loose.list.find((l) => l.part?.part === 'rim_steel13' && Math.hypot(l.x - s.x, l.z - s.z) < 0.4);
      return w?.part.sub.tire?.part ?? '';
    });
    return { held, onTable };
  }, (t, i) => i.held === '' && i.onTable === 'tire_road');

  await step('paint_gun', async () => {
    await rt('hold', 'tool:spray', { colour: 13 });
    await use('paintbooth');
    await rt('simulate', 2.5);
    return ev(() => window.__rt.game.vehicles[0].build.paint);
  }, (t, paint) => paint === 13);

  if (errors.length) {
    console.log('page errors:', errors.slice(0, 5));
    failed++;
  }
} finally {
  fs.writeFileSync(path.join(out, 'devices.json'), JSON.stringify(log, null, 1));
  await browser.close();
  await server.close();
}
console.log(failed ? `${failed} step(s) failed` : 'devices ok');
process.exit(failed ? 1 : 0);
