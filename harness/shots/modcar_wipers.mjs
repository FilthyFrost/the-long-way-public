// The wipers on the windscreen (docs/MODCAR.md §23): sat in a dusty sedan in the rain, the blades sweep the rain
// off their arcs of the glass and the dust with it; the dust left at the corners and above, and none taken while
// the rain is off (the wipers parked).
//   SHOTS_GPU=1 node harness/shots/modcar_wipers.mjs
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
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      await Promise.all(g.vehicles.map((v) => v.view.settled()));
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_wipers_${name}.png` });
  };
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  await rt('setWeather', 'clear');
  const builds = await rt('builds');
  const vi = builds.findIndex((b) => b.startsWith('stock:sedan') || b.startsWith('sedan'));
  await rt('setBuild', vi, 'stock:sedan');
  // a dusty body (no caked crust): the dust shows on the glass as a haze from its foot
  await page.evaluate((i) => {
    const b = window.__rt.game.vehicles[i].build;
    b.dirt = 0.9;
    b.crust = 0;
    b.wiped = 0;
  }, vi);
  await rt('enter', vi);
  // (under the workshop's roof no rain reaches the glass: out on the road)
  await rt('setWeather', 'rain');
  for (let k = 0; k < 8; k++) await rt('simulate', 0.25);
  let t = await rt('telemetry');
  console.log('garage, rain', JSON.stringify(t.wipers));
  if (t.wipers?.period > 0) fail(`the wipers ran under the workshop's roof (${JSON.stringify(t.wipers)})`);
  await rt('setWeather', 'clear');
  console.log(await rt('devGoKm', 4, true));
  await rt('setView', 'cockpit');
  await rt('look', 0, -0.12);
  for (let k = 0; k < 24; k++) await rt('simulate', 0.25);
  t = await rt('telemetry');
  console.log('dry', JSON.stringify(t.wipers));
  if (!t.wipers || t.wipers.blades < 2) fail(`the sedan has no wipers (${JSON.stringify(t.wipers)})`);
  if (t.wipers.period > 0 || t.wipers.wiped > 0) fail(`the wipers ran in the dry (${JSON.stringify(t.wipers)})`);
  await shot('dry');
  // the rain: the wipers start by themselves and take the dust off their arcs
  await rt('setWeather', 'rain');
  for (let k = 0; k < 12; k++) await rt('simulate', 0.25);
  t = await rt('telemetry');
  console.log('rain 3 s', JSON.stringify(t.wipers));
  if (!(t.wipers.period > 0)) fail(`the wipers did not start in the rain (${JSON.stringify(t.wipers)})`);
  await shot('rain');
  for (let k = 0; k < 28; k++) await rt('simulate', 0.25);
  t = await rt('telemetry');
  console.log('rain 10 s', JSON.stringify(t.wipers));
  if (Math.abs(t.wipers.wiped - t.wipers.dirt) > 0.02) fail(`the arcs are not clean after 10 s of wiping (${JSON.stringify(t.wipers)})`);
  await shot('wiped');
  // the rain stopped: the blades park, the arcs stay clean of the dust they took
  await rt('setWeather', 'clear');
  for (let k = 0; k < 40; k++) await rt('simulate', 0.25);
  t = await rt('telemetry');
  console.log('after', JSON.stringify(t.wipers));
  if (t.wipers.period > 0) fail(`the wipers did not park once the rain stopped (${JSON.stringify(t.wipers)})`);
  if (t.wipers.wiped < 0.5) fail(`the arcs lost what was wiped (${JSON.stringify(t.wipers)})`);
  await shot('after');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_wipers: ${bad} FAILED` : 'modcar_wipers: ok');
process.exit(bad ? 1 : 0);
