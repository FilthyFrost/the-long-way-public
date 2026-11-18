// The second version of the world's generator in the real game (docs/V3/nodes/W1-worldgen.md step W1.3).
//
// A new game is of version 2 with every region of the registry, and begins in the region asked for. The
// developer's panel lists every region and shows the journey ahead. A robot drives through the first border
// between two regions: no error, and the land under the wheels never jumps. The panel's own function takes the
// vehicle to each region of the registry in turn: it stands on the road, upright, in the region asked for (a
// picture of each from above the road, by day, into loop/shots/v3_world/, and two from further in: from higher
// up and from the driver's seat; and where a region's mark is not at its start — a cluster of towers or
// buttes, a terraced hillside, a lake of the wetland — the first stretch that holds one is found and pictured
// too, from across the road, at eye level and, for the landforms, from far back). The game is saved and opened again:
// the same world, the same place. A save written under another revision of the generator is opened: its
// vehicle stands on the road at the distance it had reached, and the line is said. A save of a world with more
// regions than this build has is set aside, with a line saying why, and a new game begins. A save from before
// there were versions goes on in a world of version 1 whatever the address asks for, and is written as it
// always was. A world of version 1 does not deal the regions added since, and the panel says so.
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
//   SHOTS_GL=llvmpipe node harness/shots/v3_world.mjs
// With region ids after it, only those regions are gone to and pictured (to look at one while its palette row
// or its numbers are tuned):
//   SHOTS_GL=llvmpipe node harness/shots/v3_world.mjs terraces karst_peaks
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer, waitFrames } from './lib.mjs';

/** region ids named on the command line: only their pictures are taken (and what is checked on the way to them) */
const only = process.argv.slice(2);
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

/** the regions whose mark is not at their start, and what it is */
const SIGHT_OF = { karst_peaks: 'cluster of towers', red_canyon: 'cluster of buttes', terraces: 'terraced side', wetland: 'lake' };
const SIGHTS = Object.keys(SIGHT_OF);

/**
 * Where a region shows what makes it, in one of its chapters (a stop of the journey): the first stretch with a
 * cluster of anchored landforms (karst, red canyon), with a hillside or a valley cut into benches (terraces),
 * with a lake (wetland). The road point to stand at, the side it is on, the point to look at (tx, tz), the
 * road's right-hand normal there (nx, nz); null: the chapter has none.
 */
const sightOf = (page, id, chapter) =>
  page.evaluate(
    async ({ id, start, length }) => {
      const g = window.__rt.game;
      const w = g.world;
      const SLOT = w.rules.slot;
      const k0 = Math.round(start / SLOT);
      const k1 = Math.round((start + length) / SLOT);
      const pr = { s: 0, d: 0 };
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const st = new SpineSample();
      /** the place on the road at arc length s, looking at (tx, tz) or (no point given) out to one side and a little ahead */
      const at = (kind, k, s, side, what, tx, tz) => {
        w.spine.at(s, st);
        const nx = -Math.sin(st.phi);
        const nz = Math.cos(st.phi);
        if (tx === undefined) {
          tx = st.x + nx * side * 220 + Math.cos(st.phi) * 110;
          tz = st.z + nz * side * 220 + Math.sin(st.phi) * 110;
        }
        return { kind, k, s, side, what, tx, tz, nx, nz };
      };
      for (let k = Math.max(1, k0); k < k1; k++) {
        if (id === 'karst_peaks' || id === 'red_canyon') {
          const fs = w.features ? w.features.of(k) : [];
          if (!fs.length) continue;
          // the landform of the cluster whose foot is nearest the road, and the road point abreast of it
          let best = null;
          for (const f of fs) {
            w.spine.project(f.x, f.z, NaN, pr);
            const off = Math.abs(pr.d) - f.r;
            if (!best || off < best.off) best = { off, s: pr.s, d: pr.d, f };
          }
          return at('landform', k, best.s, Math.sign(best.d) || 1, { landforms: fs.length, kind: best.f.kind, height: Math.round(best.f.h), radius: Math.round(best.f.r), foot: Math.round(best.off) }, best.f.x, best.f.z);
        }
        if (id === 'terraces') {
          const kind = w.land.kindOf(k);
          if (kind !== 'hillside' && kind !== 'valley') continue;
          const { LandParams } = await import('/src/core/world/landform.ts');
          const lp = new LandParams();
          const s = (k + 0.5) * SLOT;
          w.land.at(s, lp);
          if (!(lp.terrace > 0.5)) continue;
          // (a hillside rises on one side; a valley on both: its right)
          return at('terrace', k, s, kind === 'hillside' ? w.land.sideOf(k) : 1, { country: kind, strength: lp.terrace, step: lp.step, tilt: +lp.tilt.toFixed(3), wall: Math.round(lp.wall) });
        }
        if (id === 'wetland') {
          const f = w.water.feature(k);
          if (!f || f.kind !== 'lake') continue;
          w.spine.project(f.cx, f.cz, NaN, pr);
          return at('lake', k, Math.max(40, f.s - 60), Math.sign(pr.d) || 1, { level: +f.level.toFixed(1), across: Math.round(Math.abs(pr.d)) }, f.cx, f.cz);
        }
      }
      return null;
    },
    { id, start: chapter.start, length: chapter.length },
  );

/**
 * What stands where a picture of a region's mark is taken, asked of the land itself: how far the nearest
 * anchored landform is from the vehicle; how fully the side looked at is cut into benches and how many of
 * them the first 150 m of it climb (steps of level ground between risers); whether water lies where the look goes.
 */
const sightSeen = (page, id, sight) =>
  page.evaluate(
    async ({ sight }) => {
      const g = window.__rt.game;
      const w = g.world;
      const v = g.seated ?? g.focus;
      const { TerrainPoint } = await import('/src/core/world/terrain.ts');
      const tp = new TerrainPoint();
      const out = {};
      if (sight.kind === 'landform') {
        let nearest = Infinity;
        for (let k = sight.k - 1; k <= sight.k + 1; k++) for (const f of w.features.of(k)) nearest = Math.min(nearest, Math.hypot(f.x - v.sim.px, f.z - v.sim.pz) - f.r);
        out.nearest = nearest;
        w.shape(sight.tx, sight.tz, tp);
        out.landform = +tp.landform.toFixed(1);
      }
      if (sight.kind === 'terrace') {
        const { LandParams } = await import('/src/core/world/landform.ts');
        const lp = new LandParams();
        w.land.at(sight.s, lp);
        out.terrace = lp.terrace;
        // out from the road on that side, metre by metre: level ground (a bench) and steep ground (a riser) in turn
        let benches = 0;
        let level = false;
        let last = NaN;
        for (let d = 20; d <= 170; d += 1) {
          w.shape(v.sim.px + sight.nx * sight.side * d, v.sim.pz + sight.nz * sight.side * d, tp);
          if (last === last) {
            const flat = Math.abs(tp.h - last) < 0.12;
            if (flat && !level) benches++;
            level = flat;
          }
          last = tp.h;
        }
        out.benches = benches;
      }
      if (sight.kind === 'lake') {
        w.shape(sight.tx, sight.tz, tp);
        out.water = Math.max(0, tp.wl - tp.bed);
      }
      return out;
    },
    { sight },
  );

/** the world a page's game runs in */
const worldNow = (page) =>
  page.evaluate(async () => {
    const g = window.__rt.game;
    const rules = await import('/src/core/world/rules.ts');
    return { version: g.world.rules.version, count: g.world.rules.regionCount, seed: g.params.seed, rev: rules.WORLD_REV, registry: window.__rt.devRegions().length, start: window.__rt.params.biome, keep: window.__rt.params.keep };
  });

try {
  // ------------------------------------------------------------------ a new game, kept: its world, the panel, a save and what becomes of it
  if (!only.length) {
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

    // a save from before there were versions (its world named by the seed alone, everything in the yard), under
    // an address that asks for version 2: the game goes on in the save's world, which is of version 1
    const old = JSON.parse(JSON.stringify(after));
    old.world = { seed: w.seed };
    old.place = 'garage';
    delete old.seat;
    for (const [i, v] of old.vehicles.entries()) {
      if (v.s === undefined) continue;
      Object.assign(v, { x: 18, z: 13 + 4 * i, yaw: 0 });
      delete v.s;
    }
    Object.assign(old.player, { x: -4.6, z: -0.4, heading: 0.15 });
    delete old.player.s;
    await page.evaluate(({ k, text }) => ((window.__rt.game.saveOff = true), localStorage.setItem(k, text)), { k: SAVE, text: JSON.stringify(old) });
    await reopen();
    const w1 = await worldNow(page);
    const oldLine = await toast();
    const oldState = await page.evaluate(() => ({ place: window.__rt.game.place, vehicles: window.__rt.game.vehicles.length, search: location.search }));
    console.log('a save of version 1', JSON.stringify(w1), JSON.stringify(oldState), oldLine);
    if (!oldState.search.includes('world=2')) fail(`the address no longer asks for version 2 (${oldState.search})`);
    if (w1.version !== 1 || w1.count !== 6 || w1.seed !== w.seed || !w1.keep) fail(`a save from before there were versions is gone on with in another world: ${JSON.stringify(w1)}`);
    if (oldState.place !== 'garage' || oldState.vehicles !== old.vehicles.length) fail(`that save did not come back as it was: ${JSON.stringify(oldState)}`);
    if (oldLine.includes('世界有了变化')) fail('a save of version 1 was taken for one whose world has changed');
    await page.evaluate(() => window.__rt.game.save());
    const oldAgain = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
    if (JSON.stringify(oldAgain.world) !== JSON.stringify({ seed: w.seed })) fail(`a version 1 save is written with more than its seed: ${JSON.stringify(oldAgain.world)}`);
    if (oldAgain.vehicles.some((v) => 's' in v) || 's' in oldAgain.player) fail('a version 1 save is written with distances along the road');
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
    if (!only.length) {
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
    }

    // to every region of the registry in turn, through the panel's function
    const regions = await rt('devRegions');
    await rt('setHour', 13);
    // (the pictures without the game's cards and gauges over them)
    await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
    for (const [i, r] of regions.entries()) {
      if (only.length && !only.includes(r.id)) continue;
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
      // and well inside the region, past where it blends with the one before: from higher up, and from the
      // driver's seat
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

      // what makes the region: a cluster of towers or buttes, a terraced hillside, a lake of the wetland. None
      // of them is in a region's first stretch (the director gives it no landforms, and a terraced side or a
      // lake is where the stretch's country has one): so the first stretch of the region that holds one is
      // found, in this chapter or the next ones of the region, and the pictures are taken there, looking at it
      if (!SIGHTS.includes(r.id)) continue;
      let sight = null;
      let chapter = stop;
      for (let tries = 0; tries < 6 && !sight; tries++) {
        sight = await sightOf(page, r.id, chapter);
        if (sight) break;
        // (none in this chapter of the region: on to its next one)
        const on = await rt('devGoRegion', r.id, true);
        if (!on.startsWith(`${r.zh}：`)) break;
        await page.evaluate(() => window.__rt.game.simulate(0));
        chapter = (await rt('devJourney', 1))[0];
      }
      if (!sight) {
        fail(`${r.id}: no stretch with ${SIGHT_OF[r.id]} in six chapters of the region`);
        continue;
      }
      await rt('devGoKm', sight.s / 1000, true);
      if (!(await built(page))) fail(`${r.id}: the world at its ${SIGHT_OF[r.id]} was never built`);
      const by = await vehicleNow(page);
      const seen = await sightSeen(page, r.id, sight);
      console.log(`   ${SIGHT_OF[r.id]}: stretch ${sight.k}, ${(sight.s / 1000).toFixed(2)} km, on the ${sight.side > 0 ? 'right' : 'left'}  ${JSON.stringify(sight.what)}  ${JSON.stringify(seen)}`);
      if (by.region !== r.id || Math.abs(by.d) > 4.5 || by.up < 0.9 || Math.abs(by.s - sight.s) > 25) fail(`${r.id}, at its ${SIGHT_OF[r.id]}: ${JSON.stringify(by)}`);
      if (sight.kind === 'landform' && !(seen.nearest < 500)) fail(`${r.id}: no landform within 500 m of where the picture is taken (the nearest is ${Math.round(seen.nearest)} m off)`);
      if (sight.kind === 'terrace' && !(seen.terrace > 0.5 && seen.benches >= 2)) fail(`${r.id}: no terraced side where the picture is taken: ${JSON.stringify(seen)}`);
      if (sight.kind === 'lake' && !(seen.water > 0)) fail(`${r.id}: no water where the picture looks: ${JSON.stringify(seen)}`);
      // three-quarter, from behind the vehicle on the side away from it, looking across the road at it
      await rt('setOrbit', sight.side > 0 ? 250 : 110, 9, 64, 9, 0);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_at.png`) });
      // from further back and higher: the far field behind it (the towers to the skyline, the mesas)
      if (sight.kind === 'landform') {
        await rt('setOrbit', sight.side > 0 ? 222 : 138, 8, 330, 55, 0);
        await page.evaluate(() => window.__rt.render());
        await page.screenshot({ path: path.join(out, `${name}_far.png`) });
      }
      // and at eye level, standing at the road's edge on its side, looking at it
      await rt('stand', by.x + sight.nx * (sight.side * 4.2 - by.d), by.z + sight.nz * (sight.side * 4.2 - by.d), Math.atan2(sight.tz - by.z, sight.tx - by.x), sight.kind === 'lake' ? -0.04 : 0.1);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_eye.png`) });
      await rt('enter', 0);
      const lastAt = await page.evaluate(() => window.__rt.lastError);
      if (lastAt) fail(`${r.id}, at its ${SIGHT_OF[r.id]}: ${lastAt}`);
    }
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ a world of version 1 does not deal the regions added since
  if (!only.length) {
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
