// The second version of the world's generator in the real game (docs/V3/nodes/W1-worldgen.md step W1.3).
//
// A new game is of version 2 with every region of the registry, and begins in the region asked for. The
// developer's panel lists every region and shows the journey ahead. A robot drives through the first border
// between two regions: no error, and the land under the wheels never jumps. The panel's own function takes the
// vehicle to each region of the registry in turn: it stands on the road, upright, in the region asked for (a
// picture of each from above the road, by day, into loop/shots/v3_world/, and two from further in: from higher
// up and from the driver's seat). The game is saved and opened again:
// the same world, the same place. A save written under another revision of the generator is opened: its
// vehicle stands on the road at the distance it had reached, and the line is said. A save of a world with more
// regions than this build has is set aside, with a line saying why, and a new game begins. A world of version
// 1 does not deal the regions added since, and the panel says so.
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
//   SHOTS_GL=llvmpipe node harness/shots/v3_world.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer, waitFrames } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/v3_world');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const SAVE = 'modcar.save.v1';
/** a vehicle on the road stands this far right of the centre line (ModGame.placeOnRoad, teleport) */
const LANE = 1.6;

/** the test hook's functions by name */
const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });

/** the vehicle one sits in (else the one last driven): where it is by the road, how it stands, which region is under it */
const vehicleNow = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    const pr = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
    const b = new Float64Array(9);
    v.sim.basis(b);
    const bl = { a: 0, b: 0, t: 0, ia: 0, ib: 0 };
    g.world.spine.plan.blend(pr.s, bl);
    const regions = window.__rt.devRegions();
    return { s: pr.s, d: pr.d, up: b[4], x: v.sim.px, z: v.sim.pz, kmh: v.sim.kmh, exploded: v.sim.exploded, seated: !!g.seated, place: g.place, frame: v.build.frame, region: regions[bl.t > 0.5 ? bl.b : bl.a].id };
  });

/** step the game until the world round the vehicle is built (the vehicle held where it stands); false when it never is */
async function built(page) {
  for (let round = 0; round < 12; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      // (the handbrake alone: the foot brake held at a standstill is the reverse gear)
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) return true;
  }
  return false;
}

/** the world a page's game runs in */
const worldNow = (page) =>
  page.evaluate(async () => {
    const g = window.__rt.game;
    const rules = await import('/src/core/world/rules.ts');
    return { version: g.world.rules.version, count: g.world.rules.regionCount, seed: g.params.seed, rev: rules.WORLD_REV, registry: window.__rt.devRegions().length, start: window.__rt.params.biome, keep: window.__rt.params.keep };
  });

try {
  // ------------------------------------------------------------------ a new game, kept: its world, the panel, a save and what becomes of it
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    const said = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      else said.push(m.text());
    });
    const rt = hook(page);
    const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
    const toast = () => page.evaluate(() => document.querySelector('.mc-toast')?.textContent ?? '');
    /** the page opened again without the game writing itself over what the script put in the store */
    const reopen = async () => {
      await page.evaluate(() => (window.__rt.game.saveOff = true));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
    };
    await page.goto(`${url}/modcar.html?world=2`, { waitUntil: 'domcontentloaded' });
    await ready();

    const w = await worldNow(page);
    console.log('new game', JSON.stringify(w));
    if (!w.keep) fail('the new game is not a kept one');
    if (w.version !== 2) fail(`a new game's world is of version ${w.version}, not 2`);
    if (w.count !== w.registry) fail(`a new game's world knows ${w.count} regions; the registry holds ${w.registry}`);
    const first = (await rt('devJourney', 1))[0];
    if (first.id !== w.start || first.chapter !== 0) fail(`the journey begins in ${first.id}, not in ${w.start}`);

    // the developer's panel: every region of the registry, the journey ahead, and what the tab had before
    if ((await rt('devTab', 'place')) !== 'place') fail('the 传送 tab did not open');
    const panel = await page.evaluate(() => {
      const pane = document.querySelector('.mc-dev .pane[data-p="place"]');
      const texts = (sel) => [...pane.querySelectorAll(sel)].map((e) => e.textContent.trim());
      return {
        regions: texts('button[data-region]'),
        out: pane.querySelectorAll('button[data-region].out').length,
        cells: pane.querySelectorAll('.journey .jcell').length,
        classes: [...pane.querySelectorAll('.journey .jcell')].map((e) => ['calm', 'scenic', 'highlight'].find((k) => e.classList.contains(k)) ?? ''),
        legend: texts('.jleg span'),
        places: pane.querySelectorAll('button[data-place]').length,
        km: !!pane.querySelector('input.km'),
        steps: pane.querySelectorAll('button[data-km]').length,
        seed: !!pane.querySelector('button[data-act="seed"]'),
        bring: !!pane.querySelector('input.bring'),
        where: pane.querySelector('.where')?.textContent ?? '',
      };
    });
    const regions = await rt('devRegions');
    console.log('panel', JSON.stringify({ ...panel, classes: panel.classes.join(',').replace(/calm/g, 'c').replace(/scenic/g, 's').replace(/highlight/g, 'H') }));
    if (panel.regions.join('|') !== regions.map((r) => r.zh).join('|')) fail(`the tab's regions are not the registry's: ${panel.regions}`);
    if (panel.out !== 0) fail(`${panel.out} regions are shown as not of this world, in a new world that knows them all`);
    if (panel.cells !== 60 || panel.classes.some((c) => !c)) fail(`the journey shows ${panel.cells} regions, 60 wanted, each of an intensity`);
    const totals = panel.legend.map((t) => Number(/(\d+)\s*$/.exec(t)?.[1] ?? NaN));
    if (panel.legend.length !== 3 || totals.reduce((a, b) => a + b, 0) !== 60) fail(`the totals by intensity do not add up to 60: ${panel.legend}`);
    for (const [i, k] of ['calm', 'scenic', 'highlight'].entries()) if (totals[i] !== panel.classes.filter((c) => c === k).length) fail(`the legend counts ${totals[i]} ${k} regions, the strip shows ${panel.classes.filter((c) => c === k).length}`);
    if (panel.places < 13 || !panel.km || panel.steps < 4 || !panel.seed || !panel.bring || !panel.where) fail(`the tab lost something it had: ${JSON.stringify(panel)}`);
    // (a cell under the mouse says what it is)
    const cell = await page.$('.mc-dev .journey .jcell:nth-child(2)');
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => document.querySelector('.mc-dev-tip')?.style.display !== 'none', null, { timeout: 20000 }).catch(() => {});
    const tip = await page.evaluate(() => {
      const t = document.querySelector('.mc-dev-tip');
      return t && t.style.display !== 'none' ? t.textContent : '';
    });
    if (!/旅程的第 2 个区域/.test(tip) || !/km/.test(tip)) fail(`no help bubble on a region of the journey (${tip})`);
    await waitFrames(page, 2);
    await page.screenshot({ path: path.join(out, 'panel.png'), clip: { x: 560, y: 0, width: 720, height: 720 } });
    await page.mouse.move(200, 300);
    await page.evaluate(() => window.__rt.game.toggleDev(false));

    // off down the road in the pickup, through the panel's function, to the registry's last region
    await rt('enter', 1);
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.seated.sys.startNow();
      g.seated.sim.setParkBrake(true);
    });
    const target = regions[regions.length - 1];
    const went = await rt('devGoRegion', target.id, true);
    if (!went.startsWith(`${target.zh}：`)) fail(`the panel did not go to ${target.id}: ${went}`);
    if (!(await built(page))) fail('the world round the vehicle was never built after the teleport');
    const there = await vehicleNow(page);
    console.log('teleported', went, JSON.stringify(there));
    if (!there.seated || there.place !== 'road' || there.region !== target.id) fail(`after the teleport: ${JSON.stringify(there)}`);

    // saved, opened again: the same world, the same place, in the seat
    await page.evaluate(() => window.__rt.game.save());
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
    console.log('saved world', JSON.stringify(stored.world), 'seat', stored.seat, 'vehicle s', stored.vehicles[stored.seat]?.s);
    if (stored.world?.seed !== w.seed || stored.world?.version !== 2 || stored.world?.regionCount !== w.count || stored.world?.rev !== w.rev) fail(`the save does not say which world it is of: ${JSON.stringify(stored.world)}`);
    if (!(Math.abs(stored.vehicles[stored.seat]?.s - there.s) < 1)) fail(`the save does not keep how far along the road the vehicle is (${stored.vehicles[stored.seat]?.s} against ${there.s})`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    const w2 = await worldNow(page);
    const back = await vehicleNow(page);
    const line = await toast();
    console.log('opened again', JSON.stringify(w2), JSON.stringify(back), line);
    if (w2.version !== 2 || w2.count !== w.count || w2.seed !== w.seed) fail(`the game opened again is of another world: ${JSON.stringify(w2)}`);
    if (!back.seated || back.frame !== 'pickup' || Math.hypot(back.x - there.x, back.z - there.z) > 1.5 || back.region !== target.id) fail(`the game opened again is not where it was left: ${JSON.stringify(back)}`);
    if (line.includes('世界有了变化')) fail('a save of this revision was taken for one of another');

    // a save written under another revision, its positions those of a road that ran elsewhere: back on the road
    const kept = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
    const seatS = kept.vehicles[kept.seat].s;
    kept.world.rev = w.rev + 7;
    for (const v of kept.vehicles) {
      if (v.s === undefined) continue;
      v.x += 40;
      v.z += 350;
      v.yaw += 1.3;
    }
    kept.player.x += 40;
    kept.player.z += 350;
    await page.evaluate(({ k, text }) => ((window.__rt.game.saveOff = true), localStorage.setItem(k, text)), { k: SAVE, text: JSON.stringify(kept) });
    await reopen();
    const moved = await vehicleNow(page);
    const movedLine = await toast();
    const upright = await built(page).then(() => vehicleNow(page));
    console.log('another revision', JSON.stringify(moved), JSON.stringify({ up: upright.up, d: upright.d }), movedLine);
    if (!movedLine.includes('世界有了变化，车和人已放回路上')) fail(`the line for a save of another revision was not said (${movedLine})`);
    if (!said.some((t) => t.includes('[world]') && t.includes('put back on the road'))) fail('the English of that line was not written out');
    if (!moved.seated || Math.abs(moved.s - seatS) > 0.6 || Math.abs(moved.d - LANE) > 0.4) fail(`the vehicle is not on the road at the distance it had reached (${seatS}): ${JSON.stringify(moved)}`);
    if (upright.up < 0.9 || upright.exploded || Math.abs(upright.d) > 4.5) fail(`the vehicle does not stand on the road: ${JSON.stringify(upright)}`);
    await page.evaluate(() => window.__rt.game.save());
    const after = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
    if (after.world?.rev !== w.rev) fail(`the save made fit is not written under this revision (${after.world?.rev})`);
    if (await rt('kernel').then((k) => k.lastError)) fail(`the kernel set something apart: ${(await rt('kernel')).lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);

    // a save of a world with more regions than this build has: set aside, a line saying why, a new game
    errors.length = 0;
    after.world.regionCount = w.registry + 5;
    await page.evaluate(({ k, text }) => ((window.__rt.game.saveOff = true), localStorage.setItem(k, text)), { k: SAVE, text: JSON.stringify(after) });
    await reopen();
    const fresh = await page.evaluate((k) => {
      const g = window.__rt.game;
      return { place: g.place, seated: !!g.seated, battery: !!g.vehicles[0].build.parts.battery, version: g.world.rules.version, count: g.world.rules.regionCount, aside: !!localStorage.getItem(`${k}.unread`), last: window.__rt.lastError };
    }, SAVE);
    console.log('too many regions', JSON.stringify(fresh));
    if (fresh.place !== 'garage' || fresh.seated || fresh.battery) fail('a save of a world this build cannot make did not give way to a new game');
    if (!fresh.aside) fail('that save was not set aside');
    if (fresh.version !== 2 || fresh.count !== w.registry) fail(`the new game after it is of version ${fresh.version} with ${fresh.count} regions`);
    if (!/regions/.test(fresh.last) || !fresh.last.includes(String(w.registry + 5))) fail(`no line says why the save was set aside (${fresh.last})`);
    // (the kernel writes what it sets apart to the console: the one error this page may have)
    const other = errors.filter((e) => !e.includes('[kernel] save'));
    if (other.length) fail(`page errors: ${other.slice(0, 3).join(' | ')}`);
    await page.evaluate((k) => ((window.__rt.game.saveOff = true), localStorage.removeItem(k), localStorage.removeItem(`${k}.unread`)), SAVE);
    await ctx.close();
  }

  // ------------------------------------------------------------------ on the road: through the first border, then to every region
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&start=road&build=stock:pickup&s=300&time=13&weather=clear`, { width: 1280, height: 720 });
    const rt = hook(page);
    const w = await worldNow(page);
    if (w.version !== 2 || w.count !== w.registry) fail(`the road page's world: ${JSON.stringify(w)}`);
    const journey = await rt('devJourney', 3);
    const border = journey[1].start;
    console.log('journey', journey.map((x) => `${x.chapter}:${x.id}(${x.intensity}) ${(x.start / 1000).toFixed(2)}+${(x.length / 1000).toFixed(2)} km`).join('  '));
    if (journey[0].id !== w.start) fail(`the road begins in ${journey[0].id}, not in ${w.start}`);

    // the robot from a kilometre and a half short of the border to a kilometre past it: across the whole of
    // where the two regions blend, the game stepped as it runs (no drawing)
    await rt('devGoKm', (border - 1500) / 1000, true);
    if (!(await built(page))) fail('the world before the border was never built');
    let drive = null;
    for (let round = 0; round < 60; round++) {
      drive = await page.evaluate(
        async ({ to, lane, first }) => {
          const { RobotDriver } = await import('/src/core/driver/robot.ts');
          const { GroundSample } = await import('/src/core/world/ground.ts');
          const g = window.__rt.game;
          const v = g.seated;
          if (first) {
            window.__robot = new RobotDriver({ lane, cruise: 19 });
            window.__drive = { steps: 0, jump: 0, jumpAt: 0, dMin: Infinity, dMax: -Infinity, air: 0, airMax: 0, kmhMax: 0, from: NaN, ground: NaN };
            v.sim.setParkBrake(false);
          }
          const robot = window.__robot;
          const st = window.__drive;
          const gs = new GroundSample();
          const dt = 1 / 60;
          for (let i = 0; i < 400 && !(robot.s >= to); i++) {
            const input = robot.update(dt, v.sim, g.world.spine);
            g.scripted = { steer: input.steer, throttle: input.throttle, brake: input.brake, handbrake: 0 };
            g.step(dt, 1);
            st.steps++;
            // the land under the middle of the vehicle, step to step: a break in it would show as a jump
            g.ground.sample(v.sim.px, v.sim.pz, gs);
            if (st.ground === st.ground && Math.abs(gs.h - st.ground) > st.jump) {
              st.jump = Math.abs(gs.h - st.ground);
              st.jumpAt = robot.s;
            }
            st.ground = gs.h;
            if (!(st.from === st.from)) st.from = robot.s;
            st.dMin = Math.min(st.dMin, robot.d);
            st.dMax = Math.max(st.dMax, robot.d);
            st.kmhMax = Math.max(st.kmhMax, v.sim.kmh);
            // (all four wheels off the ground: how long at most)
            st.air = v.sim.wheels.some((wh) => wh.contact) ? 0 : st.air + dt;
            st.airMax = Math.max(st.airMax, st.air);
          }
          g.scripted = null;
          return { ...st, s: robot.s, done: robot.s >= to, exploded: v.sim.exploded, last: window.__rt.lastError };
        },
        { to: border + 1000, lane: LANE, first: round === 0 },
      );
      if (drive.done || drive.exploded || drive.steps > 24000) break;
    }
    console.log('robot', JSON.stringify(drive));
    if (!drive.done) fail(`the robot did not get through the border at ${Math.round(border)} m (it is at ${Math.round(drive.s)} after ${drive.steps} steps)`);
    if (!(drive.from < border - 1000)) fail(`the drive did not begin before the border (${drive.from})`);
    if (drive.exploded) fail('the vehicle came apart on the way');
    if (drive.jump > 0.2) fail(`the land under the wheels jumps by ${drive.jump.toFixed(2)} m at ${Math.round(drive.jumpAt)} m`);
    // (on the paved road all the way: its surface ends 4.5 m either side of the centre line)
    if (drive.dMin < -4.3 || drive.dMax > 4.3) fail(`the robot left the road: between ${drive.dMin.toFixed(1)} and ${drive.dMax.toFixed(1)} m off its centre line`);
    if (drive.airMax > 0.6) fail(`the vehicle was off the ground for ${drive.airMax.toFixed(2)} s`);
    if (drive.kmhMax < 40) fail(`the vehicle never got going (${drive.kmhMax.toFixed(0)} km/h at most)`);
    if (drive.last) fail(`an error on the way: ${drive.last}`);
    const past = await vehicleNow(page);
    if (past.region !== journey[1].id) fail(`past the border the region is ${past.region}, not ${journey[1].id}`);

    // to every region of the registry in turn, through the panel's function
    const regions = await rt('devRegions');
    await rt('setHour', 13);
    // (the pictures without the game's cards and gauges over them)
    await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
    for (const [i, r] of regions.entries()) {
      const went = await rt('devGoRegion', r.id, true);
      const ok = await built(page);
      const at = await vehicleNow(page);
      const stop = (await rt('devJourney', 1))[0];
      console.log(`${String(i).padStart(2)} ${r.id.padEnd(14)} ${went}  d ${at.d.toFixed(2)} up ${at.up.toFixed(3)} ${at.kmh.toFixed(1)} km/h`);
      if (!went.startsWith(`${r.zh}：`)) fail(`${r.id}: the panel said "${went}"`);
      if (!ok) fail(`${r.id}: the world round the vehicle was never built`);
      if (at.region !== r.id) fail(`${r.id}: the region under the vehicle is ${at.region}`);
      if (Math.abs(at.s - (stop.start + 300)) > 25) fail(`${r.id}: the vehicle is ${Math.round(at.s - stop.start)} m into the region, 300 wanted`);
      if (Math.abs(at.d) > 4.5) fail(`${r.id}: the vehicle is ${at.d.toFixed(1)} m off the road's centre line`);
      if (at.up < 0.9 || at.exploded) fail(`${r.id}: the vehicle does not stand upright (${at.up.toFixed(2)})`);
      if (Math.abs(at.kmh) > 3) fail(`${r.id}: the vehicle does not stand still (${at.kmh.toFixed(1)} km/h)`);
      const last = await page.evaluate(() => window.__rt.lastError);
      if (last) fail(`${r.id}: ${last}`);
      // from above the road, behind the vehicle and to its left, looking on down the road
      const name = `${String(i).padStart(2, '0')}_${r.id}`;
      await rt('setOrbit', 205, 20, 44, 4.5, 0);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      // and well inside the region, past where it blends with the one before and into the stretches that may
      // hold its landforms: from higher up, and from the driver's seat
      await rt('devGoKm', (stop.start + 2600) / 1000, true);
      if (!(await built(page))) fail(`${r.id}: the world further in was never built`);
      const inside = await vehicleNow(page);
      if (inside.region !== r.id || Math.abs(inside.d) > 4.5 || inside.up < 0.9) fail(`${r.id}, further in: ${JSON.stringify(inside)}`);
      await rt('setOrbit', 200, 22, 80, 6, 0);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_in.png`) });
      await rt('setView', 'cockpit');
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_seat.png`) });
      const lastIn = await page.evaluate(() => window.__rt.lastError);
      if (lastIn) fail(`${r.id}, further in: ${lastIn}`);
    }
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ a world of version 1 does not deal the regions added since
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=1&start=road&build=stock:pickup&s=300`, { width: 960, height: 540 });
    const rt = hook(page);
    const w = await worldNow(page);
    const regions = await rt('devRegions');
    if (w.version !== 1 || w.count !== 6) fail(`world=1 gives version ${w.version} with ${w.count} regions`);
    const unknown = regions.filter((r) => !r.known);
    if (unknown.length !== regions.length - 6) fail(`a version 1 world shows ${unknown.length} regions as not its own, of ${regions.length}`);
    const before = await vehicleNow(page);
    for (const r of unknown.slice(0, 2)) {
      const went = await rt('devGoRegion', r.id, true);
      console.log('version 1:', went);
      if (!went.startsWith('这个世界') || !went.includes(r.zh)) fail(`a version 1 world asked for ${r.id} said "${went}"`);
    }
    const still = await vehicleNow(page);
    if (Math.abs(still.s - before.s) > 1) fail('the vehicle moved though the world has no such region');
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 world ok');
process.exit(bad ? 1 : 0);
