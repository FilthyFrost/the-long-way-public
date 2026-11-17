// The axles' parts (docs/MODCAR.md §22), in the game:
//  1. a front wheel off: its brake disc and strut there behind it, riding with the wheel; aimed at with empty hands: the brakes;
//  2. a set of sport brakes in the hands: its ghosts at both ends of each axle; fitted: on the build, both discs drawn;
//  3. a lift kit on both axles: the body ten centimetres higher on the same spot;
//  4. without its differential the engine runs and nothing moves (and the self-check says why); with it back it drives;
//  5. a save from before the axles had parts: read back with the factory's fitted.
//   SHOTS_GPU=1 node harness/shots/modcar_axles.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      // (the parts' models in before the picture)
      await Promise.all(g.vehicles.map((v) => v.view.settled()));
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_axles_${name}.png` });
  };
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 11);
  const builds = await rt('builds');
  console.log('builds', JSON.stringify(builds));
  const vi = builds.findIndex((b) => b.startsWith('stock:sedan') || b.startsWith('sedan'));
  const car = vi >= 0 ? vi : 0;
  const frame = await page.evaluate((i) => window.__rt.game.vehicles[i].view.frame.id, car);
  const axleIds = await page.evaluate((i) => window.__rt.game.vehicles[i].view.frame.mounts.filter((m) => ['suspension', 'brakes', 'diff'].includes(m.cat)).map((m) => m.id), car);
  console.log('car', car, frame, 'axle mounts', axleIds.join(' '));
  for (const id of axleIds) if (!(await rt('part', car, id))) fail(`a new game's ${frame} has nothing on ${id}`);
  // (the project car the game starts with has no engine: a whole factory one, to drive)
  await rt('setBuild', car, `stock:${frame}`);
  const stockText = (await rt('builds'))[car];

  // 1. a front wheel off: what is behind it
  await rt('remove', car, 'hub_FL');
  await rt('aim', car, 'hub_FL', 1.25, -1);
  await page.evaluate(() => window.__rt.game.simulate(0.2));
  await shot('wheel_off');
  const units = await page.evaluate((i) => {
    const v = window.__rt.game.vehicles[i];
    const out = {};
    // (both units drawn, each on its wheel's pivot)
    v.view.root.traverse((o) => {
      if (o.name?.startsWith('part_brakes_F_') || o.name?.startsWith('part_susp_F_')) out[o.name] = o.parent?.name ?? '';
    });
    return out;
  }, car);
  console.log('units', JSON.stringify(units));
  for (const n of ['part_brakes_F_L', 'part_brakes_F_R', 'part_susp_F_L', 'part_susp_F_R']) if (!(n in units)) fail(`${n} is not drawn`);
  const t1 = await page.evaluate(() => window.__rt.game.player.telemetry());
  console.log('aimed at', t1.target);
  if (!String(t1.target).endsWith(':brakes_F')) fail(`with the wheel off the mark is not on the brakes (${t1.target})`);

  // 2. sport brakes in the hands: the ghosts; fitted
  await rt('hold', 'brakes_sport');
  await page.evaluate(() => window.__rt.game.simulate(0.1));
  const ghosts = await page.evaluate(() => {
    const g = window.__rt.game;
    let n = 0;
    g.core.scene.traverse((o) => {
      if (o.name?.startsWith('ghost:') && o.name.includes(':brakes_')) n++;
    });
    return { n, target: g.player.telemetry().target };
  });
  console.log('ghosts', JSON.stringify(ghosts));
  if (ghosts.n < 2) fail(`the brakes' ghosts are not at both axles (${ghosts.n})`);
  if (!String(ghosts.target).includes(':brakes_F')) fail(`the mark is not on the front brakes' ghost (${ghosts.target})`);
  await shot('ghosts');
  await rt('useFor', 1.0);
  const fitted = await rt('part', car, 'brakes_F');
  console.log('fitted', JSON.stringify(fitted));
  if (fitted?.part !== 'brakes_sport') fail(`the sport brakes did not go on (${fitted?.part})`);
  await shot('sport_fitted');
  // (the wheel back on, as it was)
  await rt('setBuild', car, stockText.replace(/;?-hub_FL/, ''));

  // 3. a lift kit: the body higher on the same spot
  const rideOf = async () => {
    await page.evaluate(() => window.__rt.game.simulate(2.5));
    return page.evaluate((i) => window.__rt.game.vehicles[i].sim.py, car);
  };
  const y0 = await rideOf();
  await rt('setOrbit', 90, 4, 6.5, 0.6, car);
  await shot('stock_side');
  await rt('fit', car, 'susp_F', 'susp_lift');
  await rt('fit', car, 'susp_R', 'susp_lift');
  const y1 = await rideOf();
  console.log('ride', y0.toFixed(3), '→', y1.toFixed(3));
  if (Math.abs(y1 - y0 - 0.1) > 0.03) fail(`the lift kit raised the body ${(y1 - y0).toFixed(3)} m, not 0.1`);
  await shot('lift_side');
  await rt('setBuild', car, stockText);

  // 4. without the differential
  await rt('remove', car, 'diff_R');
  await rt('enter', car);
  await rt('crank', 2.5);
  const d0 = await rt('drive', 3, 1, 0, 0);
  const why = await page.evaluate(() => window.__rt.game.seated?.sys.firstProblem()?.code ?? null);
  console.log('no diff', JSON.stringify(d0), JSON.stringify(why));
  if (!d0 || Math.abs(d0.kmh) > 2) fail(`without a differential it moved (${d0?.kmh} km/h)`);
  if (why !== 'no_diff') fail(`the self-check does not say the differential is missing (${why})`);
  await rt('exit');
  await rt('fit', car, 'diff_R', 'diff_open');
  await rt('enter', car);
  await rt('crank', 2.5);
  // (in the workshop: a little way only, before the wall)
  const x0 = await page.evaluate((i) => window.__rt.game.vehicles[i].sim.px, car);
  const d1 = await rt('drive', 1.2, 0.6, 0, 0);
  console.log('with diff', JSON.stringify(d1), 'moved', (d1.x - x0).toFixed(2));
  if (!d1 || Math.abs(d1.x - x0) < 0.8) fail(`with its differential back it does not drive (${(d1?.x - x0).toFixed(2)} m)`);
  await rt('exit');

  // 5. a save from before the axles had parts
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(400);
  const stripped = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('modcar.save.v1') ?? 'null');
    if (!s) return -1;
    let n = 0;
    for (const v of s.vehicles) {
      for (const id of Object.keys(v.build.parts)) {
        if (/^(susp|brakes|diff)_/.test(id)) {
          delete v.build.parts[id];
          n++;
        }
      }
    }
    localStorage.setItem('modcar.save.v1', JSON.stringify(s));
    return n;
  });
  console.log('taken out of the save', stripped);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const back = await page.evaluate(() => window.__rt.game.vehicles.map((v) => Object.keys(v.build.parts).filter((k) => /^(susp|brakes|diff)_/.test(k)).length));
  console.log('read back with', JSON.stringify(back));
  if (stripped <= 0) fail('the save had no axle parts to take out');
  if (back.some((n) => n === 0)) fail('a vehicle read back from an old save has no axle parts');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_axles: ${bad} FAILED` : 'modcar_axles: ok');
process.exit(bad ? 1 : 0);
