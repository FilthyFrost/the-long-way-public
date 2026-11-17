// The workshop as a place in the world (docs/MODCAR.md §17): a new game's world has the road beginning at the
// workshop's gate, level with its yard; a vehicle drives out of the yard through the gate onto the road with no fade
// and nothing thrown away (the garage, the other vehicles, the things lying about all still there); on down the road
// and back again into the yard; out once more, saved down the road and read back: the same world, the vehicle where
// it stood with one in its seat, the workshop still at the road's start.
//   SHOTS_GPU=1 node harness/shots/modcar_seamless.mjs
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
      // (the world round the eye built first)
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const f = g.seated ?? null;
        g.worldView.update(f ? f.sim.px : g.player.walker.x, f ? f.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_seamless_${name}.png` });
  };
  /** brake to a standstill (held on at a stop, the brake would back it up), the handbrake on */
  const stop = async () => {
    for (let k = 0; k < 60 && (await state()).kmh > 0.8; k++) await rt('drive', 0.2, 0, 0, 1);
    await page.evaluate(() => window.__rt.game.seated?.sim.setParkBrake(true));
    await rt('simulate', 0.3);
  };
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.seated;
      return {
        place: g.place,
        seamless: g.seamless,
        garage: !!g.garage,
        world: !!g.world,
        vehicles: g.vehicles.length,
        loose: g.loose.list.length,
        fading: g.fadeT >= 0,
        seated: v ? g.vehicles.indexOf(v) : -1,
        x: v ? v.sim.px : g.player.walker.x,
        z: v ? v.sim.pz : g.player.walker.z,
        kmh: v ? v.sim.kmh : 0,
        project: g.vehicles[0] ? { x: g.vehicles[0].sim.px, z: g.vehicles[0].sim.pz } : null,
      };
    });
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 10.5);

  // 1. one world: the road begins at the gate, level with the yard
  const start = await page.evaluate(() => {
    const g = window.__rt.game;
    const p = { x: 0, y: 0, z: 0, phi: 0, kappa: 0, grade: 0, bank: 0 };
    g.world.spine.at(0, p);
    const a = { h: 0 };
    g.ground.sample(25.2, -0.25, a);
    const b = { h: 0 };
    g.ground.sample(27, -0.25, b);
    return { x: p.x, y: p.y, z: p.z, phi: p.phi, drive: a.h, road: b.h };
  });
  const s0 = await state();
  console.log('start', JSON.stringify(start), JSON.stringify(s0));
  if (!s0.seamless || !s0.world || !s0.garage) fail(`not one world with the workshop in it (${JSON.stringify(s0)})`);
  if (s0.place !== 'garage') fail(`a new game does not begin in the yard (${s0.place})`);
  if (Math.abs(start.x - 26) > 0.01 || Math.abs(start.z) > 0.01 || Math.abs(start.y) > 0.01) fail(`the road does not begin at the gate (${JSON.stringify(start)})`);
  if (Math.abs(start.drive - start.road) > 0.12) fail(`the drive and the road do not meet level (${start.drive} / ${start.road})`);
  await rt('stand', 9, 0.5, 0, -0.04);
  await shot('door');

  // 2. the pickup down the drive, out of the gate onto the road: no fade, nothing thrown away
  await rt('placeVehicle', 1, 13.5, -0.25, 0);
  await rt('simulate', 0.5);
  if (!(await rt('enter', 1))) fail('could not get into the pickup');
  if (!(await rt('crank', 2.5))) fail('the pickup would not start');
  let fadedOnce = false;
  for (let k = 0; k < 12; k++) {
    await rt('drive', 0.5, 0.7);
    const s = await state();
    if (s.fading) fadedOnce = true;
  }
  const out = await state();
  console.log('out', JSON.stringify(out));
  if (out.place !== 'road') fail(`out of the gate is not the road (${out.place} at x ${out.x.toFixed(1)})`);
  if (fadedOnce) fail('it faded out on the way out');
  if (!out.garage || out.vehicles !== s0.vehicles || out.loose !== s0.loose) fail(`something was thrown away on the way out (${JSON.stringify(out)} vs ${JSON.stringify(s0)})`);
  if (!(out.x > 40)) fail(`the pickup did not get down the road (x ${out.x})`);
  // (on down the road a while)
  await rt('drive', 6, 0.8);
  const far = await state();
  console.log('far', JSON.stringify(far));
  if (!(far.x > out.x + 50)) fail(`the pickup did not go on down the road (x ${far.x})`);
  await stop();
  await shot('road');

  // 3. back: turned round on the road, driven back up into the yard
  const back0 = await state();
  await page.evaluate(({ x, z }) => {
    const g = window.__rt.game;
    const v = g.seated;
    const at = { h: 0 };
    g.ground.sample(x, z, at);
    v.sim.reset(x, at.h + 0.05, z, Math.PI, g.ground);
    v.awake = 3;
  }, { x: back0.x, z: -0.25 });
  for (let k = 0; k < 40; k++) {
    const s = await state();
    if (s.x < 16) break;
    await rt('drive', 0.5, s.x < 30 ? 0.35 : 0.8);
  }
  await stop();
  const home = await state();
  console.log('home', JSON.stringify(home));
  if (home.place !== 'garage') fail(`driven back, not in the yard (${home.place} at x ${home.x.toFixed(1)})`);
  if (!home.project || Math.hypot(home.project.x - s0.project.x, home.project.z - s0.project.z) > 0.3) fail('the project car is not where it was');
  if (home.loose !== s0.loose) fail(`the things lying about are not all there (${home.loose} of ${s0.loose})`);
  await rt('exit');
  await rt('stand', 30, -9, Math.PI * 0.95, -0.06);
  await shot('back');

  // 4. out again, saved down the road, read back: the same world, the pickup where it stood with one in it
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[1];
    const at = { h: 0 };
    g.ground.sample(13.5, -0.25, at);
    v.sim.reset(13.5, at.h + 0.05, -0.25, 0, g.ground);
    v.awake = 3;
  });
  await rt('enter', 1);
  await rt('crank', 2);
  await rt('drive', 7, 0.8);
  // (to a standstill, the handbrake on: a save is where things stand)
  await stop();
  const seed = await page.evaluate(() => window.__rt.game.params.seed);
  const saved = await state();
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(800);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('simulate', 0.4);
  const again = await state();
  const seed2 = await page.evaluate(() => window.__rt.game.params.seed);
  console.log('read back', JSON.stringify({ saved, again, seed, seed2 }));
  if (seed2 !== seed) fail(`read back into another world (${seed} → ${seed2})`);
  if (!again.seamless || !again.garage) fail('read back without the workshop in the world');
  if (again.seated !== 1) fail(`not back in the pickup's seat (${again.seated})`);
  if (Math.hypot(again.x - saved.x, again.z - saved.z) > 1) fail(`the pickup is not where it stood (${saved.x.toFixed(1)}, ${saved.z.toFixed(1)} → ${again.x.toFixed(1)}, ${again.z.toFixed(1)})`);
  if (again.place !== 'road') fail(`read back not on the road (${again.place})`);
  if (again.vehicles !== s0.vehicles || again.loose !== s0.loose) fail(`not everything came back (${again.vehicles} vehicles, ${again.loose} things)`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => {
    try {
      localStorage.removeItem('modcar.save.v1');
    } catch {
      /* none */
    }
  });
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_seamless: ${bad} FAILED` : 'seamless ok');
process.exit(bad ? 1 : 0);
