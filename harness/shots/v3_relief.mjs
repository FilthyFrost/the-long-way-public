// Stage L1 of node L (docs/V3/nodes/L-landscape.md): the relief of a world of version 2 as the game draws it.
//
// Every region of the registry at a representative spot of one of its chapters, from the driver's seat and from a
// slightly raised chase view behind the vehicle, by day; the mountain region also at its most dramatic valley spot
// (walls high on both sides) and at a vista spot (one side open onto the ranges beyond), there with the head turned
// towards the open side as well. A spot is a seed and a distance along the road (km): the world of seed 7, as a new
// game is, gone to by the developer's teleport.
//
// The spots are chosen on the land of the commit the script runs on and written to spots.json beside the pictures.
// To take the SAME spots on another commit (the "before" of a change), give that file back:
//   SHOTS_GL=llvmpipe node harness/shots/v3_relief.mjs                                   (chooses, writes spots.json)
//   V3_RELIEF_SPOTS=loop/shots/v3_relief/spots.json V3_RELIEF_OUT=v3_relief_before \
//     SHOTS_GL=llvmpipe node harness/shots/v3_relief.mjs                                 (on the other commit)
//   SHOTS_GL=llvmpipe node harness/shots/v3_relief.mjs alpine forest                     (those regions only)
// V3_RELIEF_OUT names another folder under loop/shots for the pictures.
//
// How a spot is chosen: along the chapter, every 400 m between 1.5 km after its start and 1.5 km before its end
// (and not within 150 m of a bridge), the skyline either side of the road (the highest elevation angle of the land out to 8 km over four bearings from
// 60 to 105 degrees off the heading); the representative spot is the one whose higher side is nearest the
// chapter's median, the valley spot the one whose lower side is highest, the vista spot the one whose two sides
// differ most with the lower under twelve degrees (or the one that differs most, if none is that open).
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const only = process.argv.slice(2);
const out = path.join(ROOT, 'loop/shots', process.env.V3_RELIEF_OUT || 'v3_relief');
fs.mkdirSync(out, { recursive: true });
const given = process.env.V3_RELIEF_SPOTS ? JSON.parse(fs.readFileSync(path.resolve(ROOT, process.env.V3_RELIEF_SPOTS), 'utf8')) : null;
const SEED = given?.seed ?? 7;
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};

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
  // (everything the world view wants, built now whatever the machine's pace: the far land too)
  return page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    g.worldView.update(v.sim.px, v.sim.pz, 1e9);
    return g.worldView.pending === 0;
  });
}

/** what the game fetches as it goes (a wreck by the road is loaded when it is come to) has arrived */
const idle = (page) =>
  page.waitForFunction(
    async () => {
      const { loadStats } = await import('/src/game/modcar/assets.ts');
      return loadStats.done >= loadStats.requested;
    },
    null,
    { timeout: 120_000, polling: 50 },
  );

/** the vehicle one sits in: where it is by the road and which region is under it */
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

/** the skyline either side of the road along a chapter, every 400 m (see the header) */
const survey = (page, chapter) =>
  page.evaluate(
    async ({ start, length }) => {
      const w = window.__rt.game.world;
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const { TerrainPoint } = await import('/src/core/world/terrain.ts');
      const st = new SpineSample();
      const tp = new TerrainPoint();
      const rows = [];
      const br = { river: null, mask: 0 };
      for (let s = start + 1500; s < start + length - 1500; s += 400) {
        // (not on a bridge, nor so near one that its girders fill the picture)
        let bridge = false;
        for (const ds of [-150, -75, 0, 75, 150]) {
          w.water.bridgeAt(s + ds, br);
          if (br.mask > 0) bridge = true;
        }
        if (bridge) continue;
        w.spine.at(s, st);
        const eye = st.y + 1.4;
        const side = [0, 0];
        for (const deg of [-105, -90, -75, -60, 60, 75, 90, 105]) {
          const az = st.phi + (deg * Math.PI) / 180;
          let best = -90;
          for (let d = 40; d < 8000; d *= 1.06) {
            w.shape(st.x + Math.cos(az) * d, st.z + Math.sin(az) * d, tp, d > 3000);
            const e = (Math.atan2(Math.max(tp.bed, tp.wl) - eye, d) * 180) / Math.PI;
            if (e > best) best = e;
          }
          const k = deg < 0 ? 0 : 1;
          if (best > side[k] || side[k] === 0) side[k] = best;
        }
        rows.push({ s, left: side[0], right: side[1] });
      }
      return rows;
    },
    { start: chapter.start, length: chapter.length },
  );

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=${SEED}&start=road&build=stock:pickup&s=300&time=13&weather=clear`, { width: 1280, height: 720 });
  const rt = hook(page);
  const w = await page.evaluate(() => ({ version: window.__rt.game.world.rules.version }));
  if (w.version !== 2) fail(`the page's world is of version ${w.version}`);
  await rt('setHour', 13);
  await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
  const regions = await rt('devRegions');

  // ------------------------------------------------------------------ the spots: given, or chosen here
  let spots = given?.spots ?? null;
  if (!spots) {
    spots = [];
    for (const [i, r] of regions.entries()) {
      if (only.length && !only.includes(r.id)) continue;
      const went = await rt('devGoRegion', r.id, true);
      if (!went.startsWith(`${r.zh}：`)) fail(`${r.id}: the panel said "${went}"`);
      await page.evaluate(() => window.__rt.game.simulate(0));
      const chapter = (await rt('devJourney', 1))[0];
      const rows = await survey(page, chapter);
      if (rows.length === 0) {
        fail(`${r.id}: a chapter too short to survey (${JSON.stringify(chapter)})`);
        continue;
      }
      const hi = (q) => Math.max(q.left, q.right);
      const lo = (q) => Math.min(q.left, q.right);
      const sorted = rows.map(hi).sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      const rep = rows.reduce((a, q) => (Math.abs(hi(q) - median) < Math.abs(hi(a) - median) ? q : a));
      const tag = String(i).padStart(2, '0');
      spots.push({ name: `${tag}_${r.id}`, region: r.id, km: +(rep.s / 1000).toFixed(3), sky: [+rep.left.toFixed(1), +rep.right.toFixed(1)] });
      if (r.id === 'alpine') {
        const valley = rows.reduce((a, q) => (lo(q) > lo(a) ? q : a));
        // (the most open of those whose lower side is under twelve degrees; failing those, the most open of all)
        const open = rows.filter((q) => lo(q) < 12);
        const vista = (open.length ? open : rows).reduce((a, q) => (hi(q) - lo(q) > hi(a) - lo(a) ? q : a));
        spots.push({ name: `${tag}_${r.id}_valley`, region: r.id, km: +(valley.s / 1000).toFixed(3), sky: [+valley.left.toFixed(1), +valley.right.toFixed(1)] });
        if (vista) spots.push({ name: `${tag}_${r.id}_vista`, region: r.id, km: +(vista.s / 1000).toFixed(3), sky: [+vista.left.toFixed(1), +vista.right.toFixed(1)], openSide: vista.left < vista.right ? -1 : 1 });
        else fail('alpine: no spot of its chapter opens on one side');
      }
    }
    fs.writeFileSync(path.join(out, 'spots.json'), JSON.stringify({ seed: SEED, spots }, null, 1) + '\n');
  }

  // ------------------------------------------------------------------ the pictures
  const shot = async (name) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  for (const spot of spots) {
    if (only.length && !only.includes(spot.region)) continue;
    await rt('devGoKm', spot.km, true);
    if (!(await built(page))) fail(`${spot.name}: the world round the vehicle was never built`);
    await idle(page);
    // (the vehicle settles on its springs: the game stepped by a fixed time, waiting between steps for what it fetches)
    for (let round = 0; round < 3; round++) {
      await rt('simulate', 0.5);
      await idle(page);
    }
    const at = await vehicleNow(page);
    console.log(`${spot.name.padEnd(20)} ${spot.km.toFixed(2)} km  skyline left ${spot.sky[0]}°, right ${spot.sky[1]}°  (${at.region})`);
    if (at.region !== spot.region) fail(`${spot.name}: the region under the vehicle is ${at.region}`);
    if (Math.abs(at.s - spot.km * 1000) > 25 || Math.abs(at.d) > 4.5) fail(`${spot.name}: the vehicle is not where it was sent (${JSON.stringify(at)})`);
    // from the driver's seat, looking down the road
    await rt('setView', 'cockpit');
    await rt('look', 0, 0);
    await shot(`${spot.name}_seat`);
    // at a vista, the head turned towards the open side
    if (spot.openSide) {
      await rt('look', spot.openSide * 0.8, 0.05);
      await shot(`${spot.name}_seat_side`);
      await rt('look', 0, 0);
    }
    // a slightly raised chase view: behind the vehicle and a little above it, looking nearly level
    await rt('setOrbit', 180, 3, 16, 4.5);
    await shot(`${spot.name}_chase`);
    await rt('setView', 'cockpit');
    const last = await page.evaluate(() => window.__rt.lastError);
    if (last) fail(`${spot.name}: ${last}`);
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 4).join(' | ')}`);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 relief ok');
process.exit(bad ? 1 : 0);
