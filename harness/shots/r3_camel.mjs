// R3 (docs/V3/plan/rv.md), in the game: the Camel — a school bus made a motorhome. By the road: yellow with its roof white,
// the hood in front. In by the entry door: emptied, only the floor, the walls and the windows. Fitted out with what one
// finds: a camp cot at the back, a kitchen stand along the wall with a cassette stove on it, a sofa; tired, 长按 睡觉 on
// the cot; out, started, driven round a bend with everything where it was put; a rack and a ladder on its roof, a box up
// there; the driver's view over its hood.
//   SHOTS_GPU=1 node harness/shots/r3_camel.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/r3');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:camel&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const words = () => page.evaluate(() => document.body.innerText);
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const v = g.seated;
        g.worldView.update(v ? v.sim.px : g.player.walker.x, v ? v.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  const standIn = (x, z, yaw, pitch) =>
    page.evaluate(
      ({ x, z, yaw, pitch }) => {
        const g = window.__rt.game;
        const ab = g.player.aboard;
        ab.w.place(x, z, yaw);
        g.input.lookYaw = ab.heading() + yaw;
        g.input.lookPitch = pitch;
        g.simulate(0.15);
      },
      { x, z, yaw, pitch },
    );
  const vi = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles.find((x) => x.build.frame === 'camel');
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.5);
    g.getOut();
    g.simulate(0.5);
    window.__v = v;
    return g.vehicles.indexOf(v);
  });
  ok(vi >= 0, `a Camel on the road (vehicle ${vi})`);
  await rt('setOrbit', 32, 8, 17.5, 1.5, vi);
  await shot('01_camel.png');
  await rt('setOrbit', 148, 10, 17.5, 1.5, vi);
  await shot('02_camel_back.png');
  // in by the entry door: emptied
  const board = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const A = await import('/src/core/modcar/aboard.ts');
    v.view.setPanelOpen('door_side', true);
    g.simulate(0.8);
    g.board(v, A.aboardOf('camel').doors[0]);
    g.simulate(0.3);
    return { aboard: g.player.aboard?.v === v, riders: g.loose.ridersOf(v).length, seatPass: !!v.build.parts.seat_pass };
  });
  ok(board.aboard && board.riders === 0 && !board.seatPass, `in by the entry door: emptied — nothing in it, no seat behind the door (${JSON.stringify(board)})`);
  await rt('setView', 'cockpit');
  await standIn(1.55, -0.1, Math.PI, -0.12);
  await shot('03_empty.png');
  // fitted out with what one finds: a cot at the back, a kitchen stand along the wall with a stove on it, a sofa
  const fit = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const It = await import('/src/core/modcar/items.ts');
    const put = async (id, near, yaw) => {
      const held = { kind: 'item', item: It.newItem(id) };
      await g.loose.objectFor(held);
      for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
      const at = g.cargo.spotIn(v, 'cabin', held, near, yaw, 0);
      if (!at) return null;
      return g.cargo.stow(v, at.zone, at.spot, held);
    };
    // (game frame: x along, z across — the left wall at z −1.17, the right at +1.17)
    const cot = await put('nd_cot', { x: -4.3, z: 0.0 }, Math.PI / 2);
    const stand = await put('nd_kitchen_stand', { x: -0.6, z: -0.8 }, Math.PI / 2);
    const sofa = await put('nd_sofa', { x: -1.6, z: 0.75 }, -Math.PI / 2);
    let stove = null;
    if (stand) {
      const sx = stand.riding.pos.x + v.sys.derived.cg.x;
      const sz = stand.riding.pos.z + v.sys.derived.cg.z;
      stove = await put('kit_stove', { x: sx, z: sz }, Math.PI / 2);
    }
    window.__fit = [cot, stand, sofa, stove].filter(Boolean);
    window.__cot = cot;
    g.simulate(0.3);
    const y = (l) => (l ? +(l.riding.pos.y + v.sys.derived.cg.y).toFixed(2) : null);
    return { cot: !!cot, stand: !!stand, sofa: !!sofa, stove: !!stove, ys: { cot: y(cot), stand: y(stand), sofa: y(sofa), stove: y(stove) } };
  });
  ok(fit.cot && fit.stand && fit.sofa && fit.stove && fit.ys.stove > fit.ys.stand + 0.8, `fitted out with what one finds: a cot at the back, a kitchen stand with a stove on it, a sofa (${JSON.stringify(fit)})`);
  await standIn(1.55, -0.1, Math.PI, -0.18);
  await shot('04_fitted.png');
  // Sleep removed (2026-11-27): verify placed camp cot stays in Camel and shows no sleep prompt
  await standIn(-3.3, 0.0, Math.PI, -0.95);
  const w = await words();
  ok(!/睡觉/.test(w), `placed camp cot in Camel has no sleep prompt`);
  await shot('05_cot.png');
  // out, the door shut, started, driven round a bend: everything where it was put
  await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const A = await import('/src/core/modcar/aboard.ts');
    g.alight(v, A.aboardOf('camel').doors[0]);
    g.simulate(0.3);
    v.view.setPanelOpen('door_side', false);
    g.enter(v);
    g.simulate(0.2);
    v.sys.startNow();
    v.sim.setParkBrake(false);
    window.__p0 = window.__fit.map((l) => l.riding.pos.clone());
    g.simulate(0.2);
  });
  const drive = (from, to) =>
    page.evaluate(
      ({ from, to }) => {
        const g = window.__rt.game;
        const v = window.__v;
        for (let i = from; i < to; i++) {
          const steer = i > 60 * 4 && i < 60 * 8 ? 0.05 : 0;
          g.scripted = { steer, throttle: i < 60 * 10 ? 0.6 : 0, brake: i >= 60 * 10 ? 0.7 : 0, handbrake: 0 };
          g.step(1 / 60, 1);
        }
        g.scripted = null;
        return +v.sim.kmh.toFixed(1);
      },
      { from, to },
    );
  const mid = await drive(0, 60 * 7);
  await rt('setOrbit', 140, 12, 18, 1.5, vi);
  await shot('06_driving.png');
  await rt('setView', 'cockpit');
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.input.lookYaw = 0;
    g.input.lookPitch = -0.08;
    g.simulate(0.05);
  });
  await shot('07_driver.png');
  await drive(60 * 7, 60 * 12);
  const run = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    const moved = Math.max(...window.__fit.map((l, k) => l.riding.pos.distanceTo(window.__p0[k])));
    return { kmh: +v.sim.kmh.toFixed(1), moved: +moved.toFixed(4), rides: window.__fit.every((l) => g.loose.ridersOf(v).includes(l)) };
  });
  ok(run.rides && run.moved < 0.02 && mid > 12, `driven 12 s round a bend (${mid} km/h at 7 s): the cot, the stand, the stove and the sofa where they were put (${JSON.stringify(run)})`);
  // its roof: a rack and a ladder fitted, a box up there
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    for (let i = 0; i < 60 * 2; i++) {
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      g.step(1 / 60, 1);
    }
    g.scripted = null;
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(0.5);
    g.getOut();
    g.simulate(0.3);
  });
  await rt('fit', vi, 'roof', 'roof_rack');
  await rt('fit', vi, 'ladder', 'ladder');
  const roof = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    await v.view.settled();
    const It = await import('/src/core/modcar/items.ts');
    const held = { kind: 'item', item: It.newItem('crate_junk') };
    await g.loose.objectFor(held);
    for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
    const at = g.cargo.spotIn(v, 'roof', held);
    const l = at ? g.cargo.stow(v, at.zone, at.spot, held) : null;
    g.simulate(0.5);
    return { rack: v.build.parts.roof?.part ?? null, ladder: v.build.parts.ladder?.part ?? null, box: l?.stow ?? null };
  });
  ok(roof.rack === 'roof_rack' && roof.ladder === 'ladder' && roof.box === 'roof', `its roof: a rack and a ladder, a box on the rack (${JSON.stringify(roof)})`);
  await rt('setOrbit', 215, 22, 17, 2.2, vi);
  await shot('08_roof.png');
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `r3_camel: ${bad} FAILED` : 'r3_camel: ok');
process.exit(bad ? 1 : 0);
