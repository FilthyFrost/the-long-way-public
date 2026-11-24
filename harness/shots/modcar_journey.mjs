// The garage tutorial end to end in the browser (docs/MODCAR.md §10, the scripted run): pick up each
// missing part, hold it up to its ghost and fit it, pour petrol, get in, start, drive out of the door
// onto the road. A screenshot per step into loop/shots/modcar_journey/; exits non-zero on a failed step.
//   SHOTS_GPU=1 node harness/shots/modcar_journey.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_journey');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
const log = [];
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1${process.env.WORLD ? `&world=${process.env.WORLD}` : ''}`, { width: 1280, height: 720 });
  const rt = (fn, ...args) => page.evaluate(([f, a]) => window.__rt[f](...a), [fn, args]);
  const shot = async (name) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  const step = async (name, fn, check) => {
    let ok = true;
    let info = null;
    try {
      info = await fn();
      const tele = await rt('telemetry');
      if (check && !check(tele, info)) ok = false;
      log.push({ name, ok, tutorial: tele.tutorial, held: tele.held, target: tele.target, place: tele.place, info });
    } catch (e) {
      ok = false;
      log.push({ name, ok, error: String(e).slice(0, 300) });
    }
    if (!ok) failed++;
    await shot(name);
    console.log(`${ok ? ' ok ' : 'FAIL'} ${name}  ${JSON.stringify(log.at(-1)).slice(0, 220)}`);
  };
  const fitFrom = async (part, mount, dist, seconds) => {
    const now = await rt('telemetry');
    if (now.held !== part && !(await rt('pickUp', part))) throw new Error(`no ${part} lying about`);
    await rt('aim', 0, mount, dist);
    const t = await rt('telemetry');
    if (!String(t.target).startsWith('ghost:')) throw new Error(`not aimed at a ghost (target ${t.target})`);
    return rt('useFor', seconds);
  };
  // (the checklist's steps by id: t.steps lists the ones done)
  const done = (t, ...ids) => ids.every((id) => t.steps.includes(id));
  await step('00_spawn', async () => null, (t) => t.place === 'garage' && t.steps.length === 0);
  // the battery and the engine go in under the bonnet: held up to the shut bonnet, the battery's place
  // offers the bonnet to open (E), and one press opens it with the battery still in the hands
  await step(
    '00b_open_hood',
    async () => {
      if (!(await rt('pickUp', 'bat_std'))) throw new Error('no battery lying about');
      await rt('aim', 0, 'battery', 1.4);
      // held up to its place under the shut bonnet: the ghost is blocked (or E offers the bonnet itself)
      const t = await rt('telemetry');
      const ghosts = await page.evaluate(() => [...window.__rt.game.player.ghosts.ghosts.values()].filter((g) => g.key.includes(':battery:')).map((g) => g.kind));
      if (!String(t.target).endsWith(':hood') && !ghosts.includes('blocked')) throw new Error(`the shut bonnet does not stop the battery (target ${t.target}, ghosts ${ghosts})`);
      // so: look at the bonnet and open it, the battery still in the hands
      await rt('aim', 0, 'hood', 1.5);
      const h = await rt('telemetry');
      if (!String(h.target).endsWith(':hood')) throw new Error(`not aimed at the bonnet (target ${h.target})`);
      await rt('press');
      await rt('simulate', 0.8);
      await rt('aim', 0, 'battery', 1.4);
      return ghosts;
    },
    (t) => done(t, 'hood') && t.held === 'bat_std' && String(t.target).startsWith('ghost:'),
  );
  await step('01_battery', () => fitFrom('bat_std', 'battery', 1.4, 1.5), (t) => done(t, 'hood', 'battery') && t.held === '');
  await step('02_wheel_FL', () => fitFrom('rim_steel13', 'hub_FL', 1.6, 1.6), (t) => t.held === '');
  await step('03_wheel_RR', () => fitFrom('rim_steel13', 'hub_RR', 1.6, 1.6), (t) => done(t, 'wheels') && t.held === '');
  // (from where its ghost is in sight over the radiator: docs/V3/plan/hands.md — the mark goes by what one sees)
  await step('04_engine', () => fitFrom('eng_i4', 'engine', 1.4, 3.3), (t) => done(t, 'engine') && t.held === '');
  await step(
    '05_fuel',
    async () => {
      if (!(await rt('pickUp', 'tool:jerrycan'))) throw new Error('no jerrycan');
      // the filler flap on the body's side opened by hand (the other slot: empty hands), then the can held to it
      await rt('select', 1);
      await rt('aimCap', 0, 1.1);
      await rt('press');
      await rt('select', 0);
      await rt('aimCap', 0, 1.1);
      const t = await rt('telemetry');
      if (!String(t.target).startsWith('filler:')) throw new Error(`not aimed at the filler (target ${t.target})`);
      await rt('useFor', 7);
      await rt('drop');
      return null;
    },
    (t) => done(t, 'fuel'),
  );
  // a swap: the toilet onto the driver's seat brings the bucket seat into the hands; and back again
  await step(
    '05c_replace_seat',
    async () => {
      // (through the open door: the shut one is in the way of the mark — docs/V3/plan/hands.md, real shapes)
      await rt('openPanel', 0, 'door_FL', true);
      await fitFrom('seat_toilet', 'seat_driver', 1.2, 2.5);
      const t = await rt('telemetry');
      if (t.held !== 'seat_bucket') throw new Error(`the old seat is not in the hands (held ${t.held})`);
      const on = await rt('part', 0, 'seat_driver');
      if (on?.part !== 'seat_toilet') throw new Error(`the toilet is not on the seat mount (${JSON.stringify(on)})`);
      // (the old seat's ghost comes in a moment: its model)
      await rt('simulate', 0.6);
      await rt('aim', 0, 'seat_driver', 1.2);
      await rt('useFor', 2.5);
      // (the toilet seat out of the way)
      await page.evaluate(() => (window.__rt.game.player.held = null));
      await rt('openPanel', 0, 'door_FL', false);
      return (await rt('part', 0, 'seat_driver'))?.part;
    },
    (t, part) => part === 'seat_bucket' && t.held === '',
  );
  // a spray can on the front-left door (a coat where it lands: docs/V3/plan/growth.md §1.5); the right one scrubbed (its grime mask, docs/MODCAR.md §15): the sponge
  // takes its dust but not the barn's crust, the scraper the crust
  await step(
    '05d_paint',
    async () => {
      if (!(await rt('pickUp', 'tool:spray'))) throw new Error('no spray can');
      const before = (await rt('part', 0, 'door_FL'))?.coat;
      await rt('aim', 0, 'door_FL', 1.4);
      await rt('useFor', 1.6);
      await rt('drop');
      return { before, after: (await rt('part', 0, 'door_FL'))?.coat };
    },
    (t, r) => !r.before && r.after === true && t.held === '',
  );
  await step(
    '05e_wash',
    async () => {
      if (!(await rt('pickUp', 'tool:scraper'))) throw new Error('no scraper');
      // (the bonnet stands open: the right front door)
      await rt('aim', 0, 'door_FR', 1.0);
      const r = await rt('scrub', 2.2, 6, 0.3, 0.25);
      await rt('drop');
      const left = (g) => g?.cleaning?.find((c) => c.owner === 'p:door_FR')?.units?.find((u) => u.unit === 0)?.dirt ?? 1;
      await rt('hold', 'tool:scraper', { tier: 1 });
      await rt('aim', 0, 'door_FR', 0.95);
      const s = await rt('scrub', 2.6, 8, 0.42, 0.36);
      await page.evaluate(() => (window.__rt.game.player.held = null));
      return { started: r.started && s.started, sponged: left(r.grime), scraped: left(s.grime) };
    },
    (t, r) => r.started && r.sponged <= 1 && r.scraped <= r.sponged && t.held === '',
  );
  // what went under the bonnet is in: shut it again (it fills the windscreen)
  await step(
    '05f_shut_hood',
    async () => {
      await rt('aim', 0, 'hood', 1.5);
      const h = await rt('telemetry');
      if (!String(h.target).endsWith(':hood')) throw new Error(`not aimed at the bonnet (target ${h.target})`);
      await rt('press');
      await rt('simulate', 0.8);
      return page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('hood'));
    },
    (t, open) => open < 0.05 && done(t, 'shut'),
  );
  // the workshop's big doors are shut but for a crack: the button beside them opens them
  await step(
    '05b_open_door',
    async () => {
      const target = await rt('useDevice', 'door');
      if (target !== 'device:door') throw new Error(`not aimed at the door button (target ${target})`);
      await rt('simulate', 4);
      return target;
    },
    (t) => t.doorsOpen === true && t.doorGap > 3.5 && done(t, 'door'),
  );
  await step('06_get_in', () => rt('enter', 0), (t) => t.seated && done(t, 'seat'));
  await step('07_start', () => rt('crank', 1.6), (t, ran) => ran === true && done(t, 'start'));
  await step('07b_lights', () => rt('lights', 'low'), (t, on) => on === true);
  await step('08_drive_out', () => rt('drive', 9, 0.7, 0), (t) => t.place === 'road');
  await step('09_on_the_road', async () => {
    const r = await rt('drive', 8, 0.6, 0);
    await rt('setView', 'chase');
    return r;
  }, (t) => t.place === 'road' && t.kmh > 20);
  // stop, pull the handbrake, get out and look at it, get back in
  await step(
    '10_get_out',
    async () => {
      // (to a standstill: held on at a stop, the brake would back the car up)
      for (let k = 0; k < 60; k++) {
        const kmh = await page.evaluate(() => window.__rt.game.seated?.sim.kmh ?? 0);
        if (kmh < 0.8) break;
        await rt('drive', 0.2, 0, 0, 1);
      }
      // (and still: braked hard with the wheel straight it may spin round, slow along its length and still sliding
      // sideways — 17 km/h here — and one does not get out of that: the brakes held for it settle it in a second or two)
      await page.evaluate(() => {
        const g = window.__rt.game;
        for (let i = 0; i < 300 && g.seated && g.seated.sim.speed * 3.6 > 0.5; i++) g.step(1 / 60, 1);
      });
      await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(true));
      await rt('exit');
      await rt('setView', 'cockpit');
      return null;
    },
    (t) => !t.seated && t.place === 'road',
  );
  await step('11_get_in', () => rt('enter', 0), (t) => t.seated);
  if (errors.length) {
    console.log('page errors:', errors.slice(0, 5));
    failed++;
  }
} finally {
  fs.writeFileSync(path.join(out, 'journey.json'), JSON.stringify(log, null, 1));
  await browser.close();
  await server.close();
}
console.log(failed ? `${failed} step(s) failed` : 'journey ok');
process.exit(failed ? 1 : 0);
