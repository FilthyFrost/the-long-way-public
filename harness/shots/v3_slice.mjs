// The landscape's sample stretch (docs/V3/nodes/L-landscape.md, "样板段"): the same spots of a world of version 2,
// at the same hours, from the driver's seat and from a slightly raised chase view behind the vehicle — the pictures
// every round of the work is judged by, beside Painted Valley's own (harness/shots/reference_pv.mjs).
//
// A spot is a distance along the road of the world of seed 7 (km), gone to by the developer's teleport; the spots
// are the stage's sample stretch (a temperate valley and its forest) and, for seeing what a change does elsewhere,
// one spot of each kind of country the relief pictures use (harness/shots/v3_relief.mjs, spots.json).
//
//   SHOTS_GPU=1 node harness/shots/v3_slice.mjs                      every spot, at 15:30 and 18:48
//   SHOTS_GPU=1 node harness/shots/v3_slice.mjs plains forest        those spots only
//   V3_SLICE_HOURS=15.5 V3_SLICE_OUT=v3_slice_before SHOTS_GPU=1 node harness/shots/v3_slice.mjs
// The pictures go to loop/shots/<V3_SLICE_OUT or v3_slice>/<spot>_<view>_<hour>.png, with what each one is in
// shots.json beside them (the spot, the hour, the region under the vehicle, frame figures from the renderer).
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
import { built, idle, vehicleNow, frameFigures, hook } from './landscapeCapture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';

/** the spots: the sample stretch first (a valley of the plains, the forest), then one of each other kind of country */
export const SPOTS = [
  { name: 'plains', region: 'plains', km: 3.125 },
  { name: 'forest', region: 'forest', km: 388.125 },
  { name: 'alpine', region: 'alpine', km: 394.375 },
  { name: 'alpine_valley', region: 'alpine', km: 221.875 },
  { name: 'alpine_vista', region: 'alpine', km: 278.125, look: -0.8 },
  { name: 'desert', region: 'desert', km: 118.125 },
  { name: 'lakes', region: 'lakes', km: 326.875 },
  { name: 'maple', region: 'maple', km: 234.375 },
  { name: 'karst', region: 'karst_peaks', km: 739.375 },
];
const SEED = 7;

const only = process.argv.slice(2);
const hours = (process.env.V3_SLICE_HOURS || '15.5,18.8').split(',').map(Number);
const out = path.join(ROOT, 'loop/shots', process.env.V3_SLICE_OUT || 'v3_slice');
// (V3_SLICE_SIZE=1920x1080: the frame's size; 1280 by 720 by default, as every other script's)
const [W, Hgt] = (process.env.V3_SLICE_SIZE || '1280x720').split('x').map(Number);
fs.mkdirSync(out, { recursive: true });

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const record = [];
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=${SEED}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: W, height: Hgt });
  const rt = hook(page);
  const w = await page.evaluate(() => ({ version: window.__rt.game.world.rules.version }));
  if (w.version !== 2) fail(`the page's world is of version ${w.version}`);
  await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
  const shot = async (file) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, file) });
  };
  for (const spot of SPOTS) {
    if (only.length && !only.includes(spot.name) && !only.includes(spot.region)) continue;
    await rt('devGoKm', spot.km, true);
    if (!(await built(page))) fail(`${spot.name}: the world round the vehicle was never built`);
    await idle(page);
    for (let round = 0; round < 3; round++) {
      await rt('simulate', 0.5);
      await idle(page);
    }
    const at = await vehicleNow(page);
    if (at.region !== spot.region) fail(`${spot.name}: the region under the vehicle is ${at.region}`);
    for (const hour of hours) {
      await rt('setHour', hour);
      await rt('simulate', 0.1);
      const h = String(hour).replace('.', 'h');
      await rt('setView', 'cockpit');
      await rt('look', spot.look ?? 0, spot.look ? 0.05 : 0);
      const seat = await frameFigures(page, hour === hours[0] ? undefined : 0);
      await shot(`${spot.name}_seat_${h}.png`);
      await rt('setOrbit', 180, 3, 16, 4.5);
      const chase = await frameFigures(page, 0);
      await shot(`${spot.name}_chase_${h}.png`);
      await rt('setView', 'cockpit');
      record.push({ spot: spot.name, km: spot.km, hour, region: at.region, seat, chase });
      console.log(`${spot.name.padEnd(14)} ${spot.km.toFixed(2)} km ${String(hour).padEnd(5)} ${at.region.padEnd(12)} seat ${JSON.stringify(seat)} chase ${JSON.stringify(chase)}`);
    }
    const last = await page.evaluate(() => window.__rt.lastError);
    if (last) fail(`${spot.name}: ${last}`);
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 4).join(' | ')}`);
  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify({ seed: SEED, gpu: ON_GPU, hours, shots: record }, null, 1) + '\n');
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 slice ok');
process.exit(bad ? 1 : 0);
