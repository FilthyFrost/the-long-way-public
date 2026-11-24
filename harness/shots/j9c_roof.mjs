// J9c (docs/V3/plan/growth.md §六 2), in the game: the roof rack's blueprint held to the Sugar Cube — 装上 车顶行李架 —
// the left button held a second, a rack on its roof and the sheet used up; the roof then a place for things: a box of
// components put up there rides on it as the car drives off; a second blueprint on it says the roof has a rack already.
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
  // the blueprint in the hands, held to the car
  await rt('hold', 'item:bp_roof_rack');
  await rt('aim', vi, 'roof', 1.6);
  await rt('simulate', 0.2);
  let words = await said();
  ok(/装上\s*车顶行李架/.test(words), `held to the car: 装上 车顶行李架 (${words.split('\n').filter((l) => l.includes('装上')).join(' · ')})`);
  await shot('01_blueprint.png');
  // the left button held a second
  const tel = await rt('useFor', 1.3);
  const roof = await page.evaluate((i) => window.__rt.game.vehicles[i].build.parts.roof?.part ?? null, vi);
  ok(roof === 'roof_rack', `held a second: a rack on the roof (${roof})`);
  ok(tel.held === '', `the sheet used up (${tel.held || 'nothing in the hands'})`);
  await rt('simulate', 0.5);
  words = await said();
  ok(words.includes('装上了车顶行李架'), 'said: 装上了车顶行李架');
  await shot('02_rack.png');
  // a second blueprint: the roof has its rack (what it says on a press where nothing else takes the button)
  const why = await page.evaluate(async (i) => {
    const B = await import('/src/game/modcar/v3/blueprints/system.ts');
    const a = B.blueprintAim('bp_roof_rack', window.__rt.game.vehicles[i]);
    return 'why' in a ? a.why : '';
  }, vi);
  ok(why === '车顶上已经有行李架', `a second blueprint on it: ${why || '—'}`);
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
    const eye = w.eye();
    g.input.lookYaw = Math.atan2(target.z - w.z, target.x - w.x);
    g.input.lookPitch = Math.atan2(target.y - eye.y, Math.hypot(target.x - w.x, target.z - w.z));
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
