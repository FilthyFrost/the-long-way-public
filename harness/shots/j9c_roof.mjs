// J9c (docs/V3/plan/growth.md §六 2, docs/V3/plan/finish.md §六 2), in the game: the roof rack's blueprint in the hands —
// 学会 车顶行李架 — the right button learns it and the sheet is used up; a second sheet says it is known already. The
// rack itself (made at a bench: f5_craft.mjs) is a part: held to the Sugar Cube's roof and the left button held, it is
// fitted as any part is. The roof then a place for things: a box of components put up there rides on it as the car
// drives off.
//   SHOTS_GPU=1 node harness/shots/j9c_roof.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j9c_roof');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
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
  const said = () => page.evaluate(() => document.body.innerText);
  const vi = await page.evaluate(() => window.__rt.game.vehicles.findIndex((v) => v.build.frame === 'sedan'));
  ok(vi >= 0, `the Sugar Cube by the road (${vi})`);
  ok(await page.evaluate((i) => !window.__rt.game.vehicles[i].build.parts.roof, vi), 'nothing on its roof');
  // the blueprint in the hands (out of the car): the right button learns it
  await rt('aim', vi, 'roof', 1.6);
  await rt('hold', 'item:bp_roof_rack');
  await rt('simulate', 0.2);
  let words = await said();
  ok(/学会\s*车顶行李架/.test(words), `the sheet in the hands: 学会 车顶行李架 (${words.split('\n').filter((l) => l.includes('学会')).join(' · ')})`);
  await shot('01_blueprint.png');
  let tel = await rt('rightFor', 0.15);
  const learned = await page.evaluate(() => [...window.__rt.game.learned]);
  ok(learned.includes('roof_rack') && tel.held === '', `the right button: learnt (${learned.join(', ')}), the sheet used up (${tel.held || 'nothing in the hands'})`);
  await rt('simulate', 0.3);
  words = await said();
  ok(words.includes('学会了：车顶行李架'), 'said: 学会了：车顶行李架');
  // a second sheet: known already — it stays in the hands and says so
  await rt('hold', 'item:bp_roof_rack');
  await rt('simulate', 0.2);
  tel = await rt('rightFor', 0.15);
  await rt('simulate', 0.1);
  words = await said();
  ok(tel.held === 'item:bp_roof_rack' && words.includes('已经会做车顶行李架了'), `a second sheet: 已经会做车顶行李架了, still in the hands (${tel.held})`);
  // the rack itself, as the bench makes it: a part, fitted by hand at its place on the roof
  await rt('hold', 'roof_rack');
  // (its model, and its ghost's with it, comes in over a moment of real time)
  let found = null;
  for (let tries = 0; tries < 12 && !found; tries++) {
    await page.waitForTimeout(400);
    await rt('simulate', 0.1);
    found = await findRoof();
  }
  async function findRoof() {
    return page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    const a = v.sim.yaw;
    const x = v.sim.px - Math.sin(a) * 1.5;
    const z = v.sim.pz + Math.cos(a) * 1.5;
    w.place(x, z, 0, 0);
    const yaw0 = Math.atan2(v.sim.pz - z, v.sim.px - x);
    // (the mark onto the rack's ghost on the roof: the middle of where it is seen)
    const hits = [];
    for (let dy = -0.6; dy <= 0.6; dy += 0.04) {
      for (let p = -0.3; p <= 0.5; p += 0.04) {
        g.input.lookYaw = yaw0 + dy;
        g.input.lookPitch = p;
        g.simulate(0);
        if (g.player.telemetry().target.startsWith(`ghost:${v.build.uid}:roof:`)) hits.push([yaw0 + dy, p]);
      }
    }
    if (!hits.length) return null;
    const my = hits.reduce((s, h) => s + h[0], 0) / hits.length;
    const mp = hits.reduce((s, h) => s + h[1], 0) / hits.length;
    const best = hits.reduce((b, h) => (Math.hypot(h[0] - my, h[1] - mp) < Math.hypot(b[0] - my, b[1] - mp) ? h : b));
    g.input.lookYaw = best[0];
    g.input.lookPitch = best[1];
    g.simulate(0.2);
    return { n: hits.length, target: g.player.telemetry().target };
    }, vi);
  }
  ok(!!found && found.target.includes(':roof:'), `the rack in the hands: its place on the roof lights up under the mark (${found ? `${found.n} looks land on it` : 'none'})`);
  words = await said();
  ok(/装上\s*行李架/.test(words), `held to the roof: 装上 行李架 (${words.split('\n').filter((l) => l.includes('装上')).join(' · ')})`);
  tel = await rt('useFor', 3);
  const roof = await page.evaluate((i) => window.__rt.game.vehicles[i].build.parts.roof?.part ?? null, vi);
  ok(roof === 'roof_rack' && tel.held === '', `the left button held: a rack on the roof (${roof}), out of the hands (${tel.held || 'empty'})`);
  await shot('02_rack.png');
  await page.evaluate(() => {
    window.__rt.game.player.held = null;
  });
  // the roof a place for things now: its floor as drawn, a box put up there
  const floor = await rt('floorOf', vi, 'roof');
  ok(!!floor && floor.floor > 0.3, `the roof's floor as drawn from above: ${floor ? `${(floor.floor * 100).toFixed(0)} % of it, ${floor.lo.toFixed(2)}–${floor.hi.toFixed(2)} m` : 'none'}`);
  await rt('hold', 'item:crate_parts');
  // (standing close by its side, looking down onto the roof just inside the rack's near rail — the rail is in the
  // way of anything further in from that low)
  const aimed = await page.evaluate(async (i) => {
    const C = await import('/src/core/modcar/cargo.ts');
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const zone = C.zonesFor(v.view.frame.id, v.build).find((z) => z.id === 'roof');
    if (!zone) return null;
    const model = v.view.model;
    model.updateMatrixWorld(true);
    const o = g.core.origin;
    const cx = (zone.x[0] + zone.x[1]) / 2;
    const at = (x, y, z) => {
      const p = model.position.clone().set(x, y, z);
      model.localToWorld(p);
      return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
    };
    const target = at(cx, zone.floor + 0.06, (zone.z[0] + zone.z[1]) / 2);
    const stand = at(cx, 0, zone.z[1] + 0.7);
    void THREE;
    if (g.seated) g.getOut();
    const w = g.player.walker;
    w.place(stand.x, stand.z, 0, 0);
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(target.x, target.y, target.z));
    g.viewMode = 'cockpit';
    g.simulate(0);
    return g.player.telemetry();
  }, vi);
  void aimed;
  // (where the line of sight lands, as the placing asks)
  console.log('landing', JSON.stringify(await page.evaluate(() => {
    const g = window.__rt.game;
    const ray = g.player.ray;
    const h = g.player.held;
    const far = g.cargo.landing(g.vehicles, ray, h, 3.2, null, 99);
    return { far: far ? { zone: far.zone.id, dist: far.dist } : null, origin: [ray.origin.x, ray.origin.y, ray.origin.z].map((x) => +x.toFixed(2)), dir: [ray.direction.x, ray.direction.y, ray.direction.z].map((x) => +x.toFixed(2)) };
  })));
  // (Q tapped looking at the roof: up there, where the eyes are on it)
  console.log('looking at', await page.evaluate(() => window.__rt.game.player.lookVehicle?.build.frame ?? null));
  await page.evaluate(() => window.__rt.game.player.drop());
  await rt('simulate', 0.3);
  const st = await rt('stowed', vi);
  ok(st.things.some((t) => t.zone === 'roof'), `the box on the roof: ${JSON.stringify(st.things)}`);
  await page.evaluate((i) => {
    // (a step back from the car, looking at its roof)
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    const a = v.sim.yaw;
    const x = v.sim.px + Math.sin(a) * 5.2 - Math.cos(a) * 1.5;
    const z = v.sim.pz + Math.cos(a) * 5.2 + Math.sin(a) * 1.5;
    w.place(x, z, 0, 0);
    g.input.lookYaw = Math.atan2(v.sim.pz - z, v.sim.px - x);
    g.input.lookPitch = -0.08;
  }, vi);
  await rt('simulate', 0.3);
  await shot('03_on_the_roof.png');
  // driven off: the box rides on the roof
  await rt('enter', vi);
  const before = await page.evaluate((i) => window.__rt.game.vehicles[i].sim.px, vi);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.seated.sim.setParkBrake(false);
    if (!g.seated.sys.running) g.seated.sys.startNow();
    for (let i = 0; i < 360; i++) {
      g.scripted = { steer: 0, throttle: 0.5, brake: 0, handbrake: 0 };
      g.step(1 / 60, 1);
    }
    g.scripted = null;
  });
  const moved = await page.evaluate(({ i, x0 }) => Math.abs(window.__rt.game.vehicles[i].sim.px - x0), { i: vi, x0: before });
  const st2 = await rt('stowed', vi);
  ok(moved > 5 && st2.things.some((t) => t.zone === 'roof'), `driven ${moved.toFixed(0)} m: the box rides on the roof still`);
  await rt('setView', 'chase');
  await shot('04_driving.png');
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j9c_roof: ${bad} FAILED` : 'j9c_roof: ok');
process.exit(bad ? 1 : 0);
