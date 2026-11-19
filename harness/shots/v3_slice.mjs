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
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';

/** the spots: the sample stretch first (a valley of the plains, the forest), then one of each other kind of country */
export const SPOTS = [
  { name: 'plains', region: 'plains', km: 44.75 },
  { name: 'forest', region: 'forest', km: 350.55 },
  { name: 'alpine', region: 'alpine', km: 140.05 },
  { name: 'alpine_valley', region: 'alpine', km: 138.85 },
  { name: 'alpine_vista', region: 'alpine', km: 324.35, look: -0.8 },
  { name: 'desert', region: 'desert', km: 86.05 },
  { name: 'lakes', region: 'lakes', km: 374.3 },
  { name: 'maple', region: 'maple', km: 393.05 },
  { name: 'karst', region: 'karst_peaks', km: 751.45 },
];
const SEED = 7;

const only = process.argv.slice(2);
const hours = (process.env.V3_SLICE_HOURS || '15.5,18.8').split(',').map(Number);
const out = path.join(ROOT, 'loop/shots', process.env.V3_SLICE_OUT || 'v3_slice');
// (V3_SLICE_SIZE=1920x1080: the frame's size; 1280 by 720 by default, as every other script's)
const [W, Hgt] = (process.env.V3_SLICE_SIZE || '1280x720').split('x').map(Number);
fs.mkdirSync(out, { recursive: true });

/** the test hook's functions by name */
const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });

/** step the game until the world round the vehicle is built (the vehicle held where it stands), then build the rest at once */
async function built(page) {
  for (let round = 0; round < 14; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) break;
  }
  return page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    g.worldView.update(v.sim.px, v.sim.pz, 1e9);
    return g.worldView.pending === 0;
  });
}

/** what the game fetches as it goes has arrived */
const idle = (page) =>
  page.waitForFunction(
    async () => {
      const { loadStats } = await import('/src/game/modcar/assets.ts');
      return loadStats.done >= loadStats.requested;
    },
    null,
    { timeout: 120_000, polling: 50 },
  );

/** where the vehicle is by the road, and the region under it */
const vehicleNow = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    const pr = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
    const bl = { a: 0, b: 0, t: 0, ia: 0, ib: 0 };
    g.world.spine.plan.blend(pr.s, bl);
    const regions = window.__rt.devRegions();
    return { s: pr.s, d: pr.d, region: regions[bl.t > 0.5 ? bl.b : bl.a].id };
  });

/**
 * The frame as drawn: draw calls and triangles by the renderer's own counters, the painted crowns drawn, and (on a
 * GPU, SHOTS_GPU=1) the time a frame takes:  frames drawn one after another, each waited for to the end
 * (a pixel read back), the crowns set out again every frame as while driving. On a software renderer the time
 * means nothing and is not taken.
 */
const frameFigures = (page, frames = ON_GPU ? 40 : 0) =>
  page.evaluate((frames) => {
    const g = window.__rt.game;
    const crowns = g.worldView?.crowns ?? null;
    window.__rt.render();
    const s = g.core.stats;
    const out = { calls: s.calls, triangles: s.triangles, crowns: crowns ? { ...crowns.drawn, levels: [...crowns.drawn.levels] } : null, ms: null };
    if (frames > 0) {
      const gl = g.core.renderer.getContext();
      const px = new Uint8Array(4);
      const one = () => {
        if (crowns) crowns.changed = true;
        window.__rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let i = 0; i < 6; i++) one();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) one();
      out.ms = +((performance.now() - t0) / frames).toFixed(2);
    }
    return out;
  }, frames);

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
