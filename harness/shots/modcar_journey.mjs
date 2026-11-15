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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 1280, height: 720 });
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
      const t = await rt('telemetry');
      if (!String(t.target).endsWith(':hood')) throw new Error(`the shut bonnet is not what E would do (target ${t.target})`);
      await rt('press');
      await rt('simulate', 0.8);
      return t.target;
    },
    (t) => done(t, 'hood') && t.held === 'bat_std' && String(t.target).startsWith('ghost:'),
  );
  await step('01_battery', () => fitFrom('bat_std', 'battery', 1.4, 1.5), (t) => done(t, 'hood', 'battery') && t.held === '');
  await step('02_wheel_FL', () => fitFrom('rim_steel13', 'hub_FL', 1.6, 1.6), (t) => t.held === '');
  await step('03_wheel_RR', () => fitFrom('rim_steel13', 'hub_RR', 1.6, 1.6), (t) => done(t, 'wheels') && t.held === '');
  await step('04_engine', () => fitFrom('eng_i4', 'engine', 1.9, 3.3), (t) => done(t, 'engine') && t.held === '');
  await step(
    '05_fuel',
    async () => {
      if (!(await rt('pickUp', 'tool:jerrycan'))) throw new Error('no jerrycan');
      await rt('aim', 0, 'fuelTank', 1.5, -1);
      const t = await rt('telemetry');
      if (!String(t.target).startsWith('pour:')) throw new Error(`not aimed at the filler (target ${t.target})`);
      await rt('useFor', 7);
      await rt('drop');
      return null;
    },
    (t) => done(t, 'fuel'),
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
  await step('08_drive_out', () => rt('drive', 9, 0.7, 0), (t) => t.place === 'road');
  await step('09_on_the_road', async () => {
    const r = await rt('drive', 8, 0.6, 0);
    await rt('setView', 'chase');
    return r;
  }, (t) => t.place === 'road' && t.kmh > 20);
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
