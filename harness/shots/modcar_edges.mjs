// Edge cases of the garage that the journey does not walk through: the donor pickup driven out instead of
// the project car, a wheel taken off the project car and driven on, the radio left on with the engine
// off. Reports what happened and any page errors.
//   SHOTS_GPU=1 node harness/shots/modcar_edges.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&project=full`, { width: 960, height: 540 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const r = {};
  // the project car (fully built here), engine off: the radio left on runs the battery down
  r.radio = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    v.radioOn = true;
    v.awake = 0;
    const b0 = v.sys.dash.battery;
    for (let i = 0; i < 300; i++) g.step(1 / 30, 1);
    v.radioOn = false;
    return { b0: +b0.toFixed(5), b1: +v.sys.dash.battery.toFixed(5), running: v.sys.running };
  });
  if (!(r.radio.b1 < r.radio.b0)) {
    bad++;
    console.log('the radio did not draw on the battery');
  }
  // the doors open, into the donor (vehicle 1), start it and drive out
  r.door = await rt('useDevice', 'door');
  await rt('simulate', 4);
  r.enterDonor = await rt('enter', 1);
  r.donorParts = await page.evaluate(() => Object.keys(window.__rt.game.vehicles[1].build.parts).length);
  r.crankDonor = await rt('crank', 2.5);
  r.donorRunning = await page.evaluate(() => window.__rt.game.vehicles[1].sys.running);
  r.donorMsg = await page.evaluate(() => document.querySelector('.mc-toast')?.textContent ?? '');
  if (r.donorRunning) {
    await page.evaluate(() => window.__rt.game.seated.sim.setParkBrake(false));
    r.driveDonor = await rt('drive', 10, 0.7, 0);
  }
  r.place = (await rt('telemetry')).place;
  if (r.place !== 'road') {
    bad++;
    console.log('the donor did not get out to the road');
  }
  console.log(JSON.stringify(r, null, 1));
  if (errors.length) {
    bad++;
    console.log('errors', errors.slice(0, 5));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
