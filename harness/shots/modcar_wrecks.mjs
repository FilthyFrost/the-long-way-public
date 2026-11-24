// Wrecks by the road as loot (docs/MODCAR.md §19) and tyres that wear (§18), in the game:
//  1. the world's wrecks down the first 30 km, each one of our frames with what is left of it (core/modcar/wrecks.ts);
//  2. one gone to on foot: there as a vehicle where the world laid it, at rest on the ground, the world's own box of it
//     gone, what was left in it in its boot; a find on it catching the light; its bonnet opened: what is under it said;
//  3. touched (a part taken off), left far behind: kept as it was left, and back so on coming again;
//  4. saved and read back: still kept; got into: one's own (it stays when one goes);
//  5. untouched wrecks come and go as one passes (none left behind, none twice), and the frame time near one;
//  6. the dash's four tyres in their stages' colours, a blown one blinking.
//   SHOTS_GPU=1 node harness/shots/modcar_wrecks.mjs
import { launchBrowser, ON_GPU, startServer } from './lib.mjs';

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
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const f = g.seated ?? null;
        g.worldView.update(f ? f.sim.px : g.player.walker.x, f ? f.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_wrecks_${name}.png` });
  };
  const wrecks = () => rt('wrecks');
  /** the wreck with this id there now (null: not) */
  const liveOf = async (id) => ((await wrecks())?.list ?? []).find((l) => l.id === id) ?? null;
  /** on foot to a wreck's spot by the road, and wait until it is there with its loot in */
  const goTo = async (w) => {
    await rt('devGoKm', w.s / 1000, false);
    for (let k = 0; k < 60; k++) {
      await rt('simulate', 0.25);
      const l = await liveOf(w.id);
      if (l?.ready) return l;
      await page.waitForTimeout(50);
    }
    return liveOf(w.id);
  };
  /** stand a few metres off a wreck, looking at it */
  const standBy = async (l, dist = 6.5) => {
    await page.evaluate(
      ({ x, z, dist }) => {
        const g = window.__rt.game;
        const w = g.player.walker;
        // (from the road side: towards the road from the wreck)
        const p = { x: 0, y: 0, z: 0, phi: 0, kappa: 0, grade: 0, bank: 0 };
        g.world.spine.at(g.world.spine.sAtX(x), p);
        let dx = p.x - x;
        let dz = p.z - z;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n;
        dz /= n;
        const sx = x + dx * dist + -dz * 1.5;
        const sz = z + dz * dist + dx * 1.5;
        window.__rt.stand(sx, sz, Math.atan2(z - sz, x - sx), -0.12);
        void w;
      },
      { x: l.x, z: l.z, dist },
    );
  };
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 11);

  // 1. the world's wrecks down the first 30 km
  const spots = await rt('wreckSpots', 0, 30000);
  const frames = {};
  for (const w of spots) frames[w.frame] = (frames[w.frame] ?? 0) + 1;
  console.log('wrecks in 30 km', spots.length, JSON.stringify(frames), 'with finds', spots.filter((w) => w.finds.length).length, 'stripped', spots.filter((w) => w.stripped).length);
  if (spots.length < 12) fail(`too few wrecks by the road (${spots.length} in 30 km)`);
  if (new Set(spots.map((w) => w.id)).size !== spots.length) fail('two wrecks with one id');
  // (the first one worth stopping for: a car with a find and something in the boot; else any car)
  const pick =
    spots.find((w) => !w.stripped && w.frame !== 'moto' && w.rare.length && w.things && w.hood) ??
    spots.find((w) => !w.stripped && w.frame !== 'moto' && w.finds.length && w.hood) ??
    spots.find((w) => !w.stripped && w.frame !== 'moto' && w.hood) ??
    spots[0];
  // (and one to get into: a driver's seat on it, at a yard the plan picked for a vehicle to find — docs/V3/plan/growth.md
  // §六 2 — and one by the road one may not: for its parts only)
  const far = await rt('wreckSpots', 0, 90000);
  const ride = far.find((w) => w.seat && w.takeable && w.id !== pick.id) ?? null;
  const verge = spots.find((w) => w.seat && !w.takeable && w.id !== pick.id && w.frame !== 'moto') ?? null;
  console.log('pick', JSON.stringify(pick));
  console.log('to take', ride ? `${ride.id} (${ride.siteKind}, ${(ride.s / 1000).toFixed(1)} km, ${ride.frame})` : '—', '· by the road', verge ? `${verge.id} (${verge.siteKind}, ${(verge.s / 1000).toFixed(1)} km)` : '—', '· finds in 90 km', far.filter((w) => w.takeable).length, 'of', far.length);

  // 2. gone to on foot: there as a vehicle where the world laid it
  let l = await goTo(pick);
  console.log('there', JSON.stringify(l));
  if (!l) fail('the wreck did not come');
  else {
    if (!l.ready) fail('the wreck never got its loot in');
    if (Math.hypot(l.x - pick.x, l.z - pick.z) > 2.5) fail(`the wreck is not where the world laid it (${l.x.toFixed(1)}, ${l.z.toFixed(1)} vs ${pick.x.toFixed(1)}, ${pick.z.toFixed(1)})`);
    if (l.parts !== pick.parts) fail(`the wreck is not the one rolled (${l.parts} parts, ${pick.parts} rolled)`);
    if (l.frame !== pick.frame) fail(`the wreck is another frame (${l.frame}, ${pick.frame} rolled)`);
    if (l.riders < Math.min(1, pick.things)) fail(`nothing in its boot (${l.riders} of ${pick.things})`);
    await rt('simulate', 3);
    const rest = await page.evaluate((i) => {
      const g = window.__rt.game;
      const v = g.vehicles[i];
      const at = { h: 0 };
      g.ground.sample(v.sim.px, v.sim.pz, at);
      // (the walker's solids by it: no box of the world's for it any more, its own body only)
      const out = [];
      g.player.solids.solidsNear(v.sim.px, v.sim.pz, 4, out);
      return { speed: v.sim.speed, exploded: v.sim.exploded, y: v.sim.py, ground: at.h, boxes: out.filter((s) => s.tag.endsWith(':wreck')).length, asleep: v.awake <= 0 };
    }, l.index);
    console.log('at rest', JSON.stringify(rest));
    if (rest.exploded) fail('the wreck blew up in the physics');
    if (rest.speed > 0.15) fail(`the wreck does not come to rest (${rest.speed.toFixed(2)} m/s)`);
    if (Math.abs(rest.y - rest.ground) > 2) fail(`the wreck is not on the ground (${rest.y.toFixed(2)} vs ${rest.ground.toFixed(2)})`);
    if (rest.boxes) fail(`the world's box of the wreck is still there (${rest.boxes})`);
    l = await liveOf(pick.id);
    if (l.touched) fail('the wreck counts as touched before it was');
    await standBy(l);
    await rt('simulate', 2.5);
    await shot('there');
    const fl = (await wrecks()).flares;
    console.log('flares', fl);
    if (pick.rare.some((f) => !/^(eng_|turbo|rad_|bat_|gb_)/.test(f)) && fl === 0) fail('a find on it never caught the light');
    // its bonnet up: what is under it said (a find with its stars), its boot: what was left in it
    const said = await page.evaluate(
      async ({ i }) => {
        const g = window.__rt.game;
        const v = g.vehicles[i];
        const out = {};
        for (const m of ['hood', 'trunk']) {
          if (!v.build.parts[m]) continue;
          window.__rt.openPanel(i, m, true);
          out[m] = g.ui.toast?.textContent ?? '';
        }
        return out;
      },
      { i: l.index },
    );
    console.log('opened', JSON.stringify(said));
    if (said.hood !== undefined && !/引擎盖/.test(said.hood)) fail(`nothing said on opening the bonnet (${said.hood})`);
    await shot('opened');
  }

  // 3. touched (a part taken off), left far behind: kept, and back so
  l = await liveOf(pick.id);
  const mount = await page.evaluate((i) => {
    const v = window.__rt.game.vehicles[i];
    return Object.keys(v.build.parts).find((m) => !/hood|trunk|door/.test(m)) ?? Object.keys(v.build.parts)[0];
  }, l.index);
  await rt('remove', l.index, mount);
  const partsLeft = (await liveOf(pick.id)).parts;
  await rt('devGoKm', pick.s / 1000 + 1.5, false);
  await rt('simulate', 1.5);
  let t = await wrecks();
  console.log('away', JSON.stringify({ live: t.live, kept: t.kept, spawned: t.spawned, despawned: t.despawned }));
  if (t.list.some((x) => x.id === pick.id)) fail('the wreck is still there 1.5 km on');
  if (t.kept < 1) fail('the wreck touched was not kept');
  l = await goTo(pick);
  console.log('back', JSON.stringify(l));
  if (!l) fail('the kept wreck did not come back');
  else if (l.parts !== partsLeft) fail(`the kept wreck came back otherwise (${l.parts} parts, left with ${partsLeft})`);
  else if (!l.touched) fail('the kept wreck came back untouched');

  // 4. saved and read back: still kept; got into: one's own
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(600);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const savedKept = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1') ?? '{}').wrecks ?? null);
  console.log('read back', JSON.stringify({ kept: savedKept ? Object.keys(savedKept.kept).length : -1 }));
  if (!savedKept || !savedKept.kept[pick.id]) fail('the kept wreck is not in the save');
  l = await goTo(pick);
  if (!l || l.parts !== partsLeft) fail(`read back, the kept wreck is not as it was left (${l?.parts} parts, ${partsLeft})`);
  // (a wreck by the road: for its parts only — got into, it says so, and one stays on foot)
  if (!verge) fail('no wreck by the road with a driver’s seat in 30 km');
  l = verge ? await goTo(verge) : null;
  if (l) {
    const seated = await rt('enter', l.index);
    const said = await page.evaluate(() => document.body.innerText);
    console.log('by the road', JSON.stringify({ id: verge.id, seated, said: said.includes('只能拆零件') }));
    if (seated) fail('got into a wreck by the road: it is for its parts only');
    if (!said.includes('只能拆零件')) fail('getting into a wreck by the road did not say it is for its parts only');
    await standBy(l, 4.5);
    await shot('verge_parts_only');
  }
  if (!ride) fail('no vehicle to find with a driver’s seat in 90 km');
  l = ride ? await goTo(ride) : null;
  if (l) {
    const can = await page.evaluate((i) => {
      const v = window.__rt.game.vehicles[i];
      return !!v.view.frame.mounts.find((m) => m.driver && v.build.parts[m.id]);
    }, l.index);
    if (can) {
      await standBy(l, 6.5);
      // (the word said at the wreck by the road gone first)
      await rt('simulate', 3);
      await page.waitForTimeout(2500);
      // (a bare frame of the plan's sort, its parts lying beside it: the engine, the radiator, the battery, the wheels)
      const beside = await page.evaluate((i) => {
        const g = window.__rt.game;
        const v = g.vehicles[i];
        const near = g.loose.list.filter((x) => x.part && Math.hypot(x.x - v.sim.px, x.z - v.sim.pz) < 7).map((x) => x.part.part);
        return { frame: v.build.frame, engine: !!Object.values(v.build.parts).find((p) => p.part.startsWith('eng_')), near };
      }, l.index);
      console.log('the find', JSON.stringify(beside));
      if (beside.engine) fail('the find has its engine in it: it should lie beside it');
      if (beside.near.length < 4) fail(`too few parts beside the find (${beside.near.join(', ')})`);
      await shot('find_in_the_yard');
      const seated = await rt('enter', l.index);
      t = await wrecks();
      if (!seated) fail('the vehicle to find could not be got into');
      if (t.list.some((x) => x.id === ride.id) || t.gone < 1) fail('got into, the wreck is not one’s own');
      await shot('find_taken');
      await page.evaluate((i) => {
        window.__taken = window.__rt.game.vehicles[i];
      }, l.index);
      await rt('exit');
      // (far off and back: the one taken still about — the wrecks by the road came and went meanwhile)
      await rt('devGoKm', pick.s / 1000 + 2, false);
      await rt('simulate', 1);
      const kept = await page.evaluate(() => window.__rt.game.vehicles.includes(window.__taken));
      console.log('taken', JSON.stringify({ kept, gone: (await wrecks()).gone }));
      if (!kept) fail('the wreck one took went when one left it');
    } else console.log('(no driver’s seat on it: not got into)');
  }

  // 5. untouched wrecks come and go as one passes: none left behind, none twice; the frame time near one
  await rt('devGoKm', 6, false);
  await rt('simulate', 1);
  const seen = new Set();
  let twice = 0;
  let most = 0;
  for (let km = 6; km <= 16; km += 0.25) {
    await rt('devGoKm', km, false);
    await rt('simulate', 0.6);
    t = await wrecks();
    most = Math.max(most, t.live);
    for (const x of t.list) {
      if (x.dist > 450) fail(`a wreck left behind (${x.id} at ${x.dist} m)`);
      seen.add(x.id);
    }
    const ids = t.list.map((x) => x.id);
    if (new Set(ids).size !== ids.length) twice++;
  }
  console.log('passed', JSON.stringify({ seen: seen.size, most, twice, spawned: t.spawned, despawned: t.despawned }));
  if (twice) fail(`a wreck there twice (${twice})`);
  if (seen.size < 3) fail(`too few wrecks passed in 10 km (${seen.size})`);
  // (the frame near a wreck: stepped and drawn)
  const near = spots.find((w) => w.s > 16000 && !w.stripped && w.id !== ride?.id) ?? spots.at(-1);
  l = await goTo(near);
  if (l) {
    await standBy(l, 8);
    const ms = await page.evaluate(async () => {
      const g = window.__rt.game;
      for (let i = 0; i < 30; i++) {
        g.step(1 / 60, 1);
        g.render();
      }
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) {
        g.step(1 / 60, 1);
        g.render();
      }
      return (performance.now() - t0) / 60;
    });
    console.log('frame by a wreck', ms.toFixed(2), 'ms');
    // (a frame time means something on a GPU only: a software renderer takes hundreds of milliseconds here)
    if (ON_GPU && ms > 40) fail(`the frame by a wreck is slow (${ms.toFixed(1)} ms)`);
    if (!ON_GPU) console.log('(software renderer: the frame time by a wreck is printed, not judged)');
    await shot('passing');
  }

  // 6. the dash's four tyres: worn through their stages, one blown
  const dash = await page.evaluate(() => {
    const g = window.__rt.game;
    // (the pickup from the yard brought along and sat in)
    const v = g.vehicles.find((x) => x.build.frame === 'pickup' && !g.wrecks?.isWreck(x));
    if (!v) return null;
    const hubs = v.sys.derived.wheels.map((w) => w.hub);
    const treads = [0.9, 0.6, 0.3, 0.1];
    hubs.forEach((h, i) => {
      const t = v.build.parts[h]?.sub.tire;
      if (t) t.tread = treads[i];
    });
    const rr = v.build.parts[hubs[3]]?.sub.tire;
    if (rr) rr.flat = true;
    g.changed(v, 'tyres');
    g.enter(v);
    g.simulate(0.5);
    return { tyres: v.sys.dash.tyres, html: document.querySelector('.mc-dash .tyres')?.innerHTML ?? '' };
  });
  console.log('dash tyres', JSON.stringify(dash));
  if (!dash) fail('no pickup to sit in');
  else {
    const cls = [...dash.html.matchAll(/class="([^"]+)"/g)].map((m) => m[1]);
    if (cls.join(' ') !== 's0 s1 s2 flat') fail(`the dash's tyres are not in their stages (${cls.join(' ')})`);
    await shot('dash');
  }
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
console.log(bad ? `modcar_wrecks: ${bad} FAILED` : 'wrecks ok');
process.exit(bad ? 1 : 0);
