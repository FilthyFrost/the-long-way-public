// R1 (docs/V3/plan/rv.md), in the game: the Turtle — a camper van with an elevating roof. Parked with its engine off,
// 长按 升起车顶 on its shell from outside lifts the roof on its bellows; with it up the key does nothing but say 先把顶放下;
// in by the sliding door one stands up in the room; 长按 睡觉 on the bed, tired, sleeps six hours from nothing (eight
// in a seat); a cassette stove put on the galley's worktop; out, the roof lowered, driven off round a bend with the
// stove still on the worktop.
//   SHOTS_GPU=1 node harness/shots/r1_turtle.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/r1');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:turtle&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
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
  // parked: the engine off, the handbrake on, out of it
  const vi = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles.find((x) => x.build.frame === 'turtle');
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.5);
    g.getOut();
    g.simulate(0.5);
    window.__v = v;
    return g.vehicles.indexOf(v);
  });
  ok(vi >= 0, `a Turtle on the road (vehicle ${vi})`);
  const state = () =>
    page.evaluate(async () => {
      const C = await import('/src/game/modcar/v3/camper/index.ts');
      const v = window.__v;
      return { up: C.camper.isUp(v), t: +v.view.roofT.toFixed(3), running: v.sys.running, aboard: !!window.__rt.game.player.aboard, energy: window.__rt.game.body.energy };
    });
  await rt('setOrbit', 35, 10, 9.5, 1.1, vi);
  await shot('01_turtle.png');
  // from beside it, at the shell's edge: 长按 升起车顶
  const edge = await page.evaluate(() => {
    const v = window.__v;
    const s = v.sim;
    // (the shell's right edge over the sliding door: model (0.1, 2.06, 0.84) — through the centre of gravity)
    const cg = v.sys.derived.cg;
    const lx = 0.1 - cg.x;
    const ly = 2.06 - cg.y;
    const lz = 0.84 - cg.z;
    const q = new (window.__rt.game.core.scene.position.constructor)(lx, ly, lz);
    const Q = v.view.root.quaternion;
    q.applyQuaternion(Q);
    return { x: s.px + q.x, y: s.py + q.y, z: s.pz + q.z, yaw: s.yaw };
  });
  // (stood off to the right of the vehicle, square to its side: aimPoint's angle from +x towards +z, the sim's yaw the other way)
  await rt('aimPoint', edge.x, edge.y, edge.z, Math.PI / 2 - edge.yaw, 1.3);
  await rt('simulate', 0.1);
  let w = await words();
  ok(/升起车顶/.test(w), `at the shell: 长按 升起车顶 (${w.split('\n').filter((l) => l.includes('车顶')).join(' · ') || '—'})`);
  await shot('02_raise_prompt.png');
  await rt('useFor', 1.0);
  await rt('simulate', 2.0);
  let st = await state();
  ok(st.up && st.t > 0.99, `held: the roof up (${JSON.stringify(st)})`);
  await rt('setOrbit', 35, 10, 9.5, 1.3, vi);
  await shot('03_roof_up.png');
  // the key turned with the roof up: 先把顶放下
  const blocked = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    g.enter(v);
    g.simulate(0.2);
    const b = g.blockedStart(v);
    g.simulate(0.1);
    return { blocked: b, running: v.sys.running, said: document.body.innerText.includes('先把顶放下') };
  });
  ok(blocked.blocked && !blocked.running && blocked.said, `in the seat with the roof up the key does nothing: 先把顶放下 (${JSON.stringify(blocked)})`);
  // the roof down, the sliding door open: no standing up in there (先把顶升起来); up again, in
  const boardDown = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    g.getOut();
    C.camper.setUp(v, false);
    g.simulate(2.0);
    v.view.setPanelOpen('door_side', true);
    g.simulate(0.8);
    g.board(v, A.aboardOf('turtle').doors[0]);
    g.simulate(0.1);
    return { aboard: !!g.player.aboard, said: document.body.innerText.includes('先把顶升起来') };
  });
  ok(!boardDown.aboard && boardDown.said, `the roof down: not in (先把顶升起来) (${JSON.stringify(boardDown)})`);
  const boardUp = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    C.camper.setUp(v, true);
    g.simulate(2.0);
    g.board(v, A.aboardOf('turtle').doors[0]);
    g.simulate(0.3);
    return { aboard: !!g.player.aboard, eyeY: +g.player.walker.eye().y.toFixed(2), floor: +(v.sim.py - v.sys.derived.cg.y + 0.42).toFixed(2) };
  });
  ok(boardUp.aboard, `the roof up: in by the sliding door, standing (${JSON.stringify(boardUp)})`);
  // looking back at the bed, the galley on the left (the eye's view, not the orbit's)
  await rt('setView', 'cockpit');
  await rt('look', Math.PI, -0.18);
  await rt('simulate', 0.2);
  await shot('04_inside.png');
  // a cassette stove on the galley's worktop
  const stove = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const It = await import('/src/core/modcar/items.ts');
    const held = { kind: 'item', item: It.newItem('kit_stove') };
    await g.loose.objectFor(held);
    // (its own box once its model is measured: packed by its real size)
    for (let i = 0; i < 40 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
    const at = g.cargo.spotIn(v, 'galley', held);
    if (!at) return null;
    window.__stove = g.cargo.stow(v, at.zone, at.spot, held);
    return { zone: at.zone.id, y: +at.spot.y.toFixed(3), x: +at.spot.x.toFixed(2) };
  });
  ok(!!stove && stove.zone === 'galley' && Math.abs(stove.y - 1.22) < 0.03, `a cassette stove on the galley's worktop (${JSON.stringify(stove)})`);
  // tired, at the bed: 长按 睡觉 — six hours from nothing (a seat's eight: seven from here)
  const bed = await page.evaluate(() => {
    const g = window.__rt.game;
    g.body.energy = 10;
    g.simulate(0.1);
    return { energy: g.body.energy };
  });
  await rt('look', Math.PI, -0.62);
  await rt('simulate', 0.2);
  w = await words();
  ok(/睡觉/.test(w), `tired, looking at the bed: 长按 睡觉 (${w.split('\n').filter((l) => l.includes('睡')).join(' · ') || '—'}; energy ${bed.energy})`);
  await shot('05_bed.png');
  const hour0 = await page.evaluate(() => window.__rt.game.env.clock.hourAt(window.__rt.game.time));
  await rt('useFor', 1.2);
  await rt('simulate', 4.0);
  const slept = await page.evaluate(() => ({ energy: window.__rt.game.body.energy, said: document.body.innerText.match(/睡了 (\d+) 小时/)?.[1] ?? null, hour: window.__rt.game.env.clock.hourAt(window.__rt.game.time) }));
  const hours = Number(slept.said);
  ok(slept.energy >= 99 && hours === 5, `held: slept ${slept.said} hours in the bed (energy 10 → ${slept.energy.toFixed(0)}; a seat would be 7), the clock ${hour0.toFixed(1)} → ${slept.hour.toFixed(1)} h`);
  // rested: the bed says 还不困 on the press
  await rt('useFor', 0.2);
  await rt('simulate', 0.1);
  w = await words();
  ok(/还不困/.test(w), 'rested, pressed on the bed: 还不困');
  // out, the roof down from outside, the key turned, driven off round a bend
  const drove = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__v;
    const A = await import('/src/core/modcar/aboard.ts');
    g.alight(v, A.aboardOf('turtle').doors[0]);
    g.simulate(0.3);
    return { aboard: !!g.player.aboard };
  });
  ok(!drove.aboard, 'out by the sliding door');
  await rt('aimPoint', edge.x, edge.y + 0.62, edge.z, Math.PI / 2 - edge.yaw, 1.3);
  await rt('simulate', 0.1);
  w = await words();
  ok(/放下车顶/.test(w), `at the lifted shell: 长按 放下车顶 (${w.split('\n').filter((l) => l.includes('车顶')).join(' · ') || '—'})`);
  await rt('useFor', 1.0);
  await rt('simulate', 2.0);
  st = await state();
  ok(!st.up && st.t < 0.01, `held: the roof down (${JSON.stringify(st)})`);
  const run = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__v;
    v.view.setPanelOpen('door_side', false);
    g.enter(v);
    g.simulate(0.2);
    const blocked = g.blockedStart(v);
    if (!blocked) v.sys.startNow();
    v.sim.setParkBrake(false);
    const s0 = window.__stove;
    const p0 = { x: s0.riding.pos.x, y: s0.riding.pos.y, z: s0.riding.pos.z };
    for (let i = 0; i < 60 * 12; i++) {
      const steer = i > 60 * 4 && i < 60 * 8 ? 0.06 : 0;
      g.scripted = { steer, throttle: i < 60 * 10 ? 0.4 : 0, brake: i >= 60 * 10 ? 0.6 : 0, handbrake: 0 };
      g.step(1 / 60, 1);
    }
    g.scripted = null;
    const p1 = s0.riding.pos;
    return { blocked, running: v.sys.running, kmh: +v.sim.kmh.toFixed(1), moved: +Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).toFixed(4), rides: g.loose.ridersOf(v).includes(s0) };
  });
  ok(!run.blocked && run.running && run.rides && run.moved < 0.01, `the roof down: it starts; driven 12 s round a bend, the stove still on the worktop (${JSON.stringify(run)})`);
  await rt('setOrbit', 140, 14, 9.5, 1.3, vi);
  await shot('06_driving.png');
  // kept: the save's slice says which roofs are up
  const kept = await page.evaluate(async () => {
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    const v = window.__v;
    C.camper.setUp(v, true);
    const snap = C.camper.slice.snapshot();
    C.camper.slice.restore({ up: [] });
    const cleared = C.camper.isUp(v);
    C.camper.slice.restore(snap);
    return { snap, cleared, back: C.camper.isUp(v) };
  });
  ok(!kept.cleared && kept.back, `kept with the save (${JSON.stringify(kept.snap)})`);
  // the Whale's over-cab bunk is a bed too: in its living space, tired, looking up at it — 长按 睡觉
  const whale = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    const t = window.__v;
    C.camper.setUp(t, false);
    if (g.seated) g.getOut();
    const yaw = t.sim.yaw;
    const w = g.addVehicle(B.stockBuild('rv'), t.sim.px - Math.cos(yaw) * 14, t.sim.pz + Math.sin(yaw) * 14, yaw);
    await w.view.settled();
    g.simulate(1.0);
    w.view.setPanelOpen('door_side', true);
    g.simulate(0.8);
    g.board(w, A.aboardOf('rv').doors[0]);
    g.simulate(0.2);
    g.body.energy = 20;
    window.__w = w;
    return { aboard: g.player.aboard?.v === w, index: g.vehicles.indexOf(w) };
  });
  ok(whale.aboard, `in the Whale's living space (${JSON.stringify(whale)})`);
  // (facing forward, up at the bunk over the cab)
  await rt('setView', 'cockpit');
  await page.evaluate(() => {
    const g = window.__rt.game;
    const ab = g.player.aboard;
    g.input.lookYaw = ab.heading();
    g.input.lookPitch = -0.08;
    g.simulate(0.2);
  });
  w = await words();
  ok(/睡觉/.test(w), `tired, looking up at the Whale's bunk: 长按 睡觉 (${w.split('\n').filter((l) => l.includes('睡')).join(' · ') || '—'})`);
  await shot('07_whale_bunk.png');
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `r1_turtle: ${bad} FAILED` : 'r1_turtle: ok');
process.exit(bad ? 1 : 0);
