// The instruments in each of the fourteen cabs (the player's ask of 2026-11-26: Nomad Drive's binnacle, the dials
// showing what the vehicle reads, no readings in the corner of the screen — cluster.ts). From the driver's seat: the
// cluster there, its faces drawn, the frame's own needles hidden; its needles turning with the speed and the revs
// driven up to, its display showing the gear; nothing in the corner of the screen, in the cab or behind the car; no
// look at the dials drawing the view in. And F4's fix kept: the mouse stopped, the view stops. (harness/shots/nd_cluster.mjs
// sets the lamps going and takes each cab's pictures.)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const ALL = ['sedan', 'pickup', 'moto', 'van', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino', 'rv', 'turtle', 'elephant', 'camel'];
const FRAMES = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const out = path.join(ROOT, 'loop/shots/f4_gauges');
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
  for (const frame of FRAMES) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=600&time=10&weather=clear`, { width: 1280, height: 720 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (f) => {
      await ev(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, f) });
    };
    // in the seat: the cluster, its faces drawn; the frame's own needles hidden behind it
    const cab = await ev(() => {
      const g = window.__rt.game;
      g.simulate(1);
      window.__rt.setView('cockpit');
      g.simulate(0.5);
      const v = g.seated.view;
      const c = v.cluster;
      const ns = Object.entries(v.needles);
      return { cluster: !!c, faces: !!c && c.group.visible, own: ns.filter(([, n]) => n.visible).map(([k]) => k), speed: c ? c.reading('speed') : -1 };
    });
    ok(cab.cluster && cab.faces && cab.own.length === 0, `${frame}: the cluster in the cab, its faces drawn, the frame's own needles hidden (${JSON.stringify(cab)})`);
    // the mouse stopped, the view stops: her head follows the look at once (F4's fix — animator.ts lookToward)
    const still = await ev(() => {
      const g = window.__rt.game;
      const cam = g.core.camera;
      const V3 = cam.position.constructor;
      const root = g.seated.view.root;
      g.input.lookYaw = 0.9;
      g.input.lookPitch = 0.12;
      g.step(1 / 60, 1);
      const at = () => {
        cam.updateMatrixWorld();
        root.updateWorldMatrix(true, false);
        const inv = root.matrixWorld.clone().invert();
        return { p: cam.getWorldPosition(new V3()).applyMatrix4(inv), d: cam.getWorldDirection(new V3()).transformDirection(inv) };
      };
      const a = at();
      let moved = 0;
      let turned = 0;
      for (let i = 0; i < 45; i++) {
        g.step(1 / 60, 1);
        const b = at();
        moved = Math.max(moved, a.p.distanceTo(b.p));
        turned = Math.max(turned, a.d.angleTo(b.d));
      }
      g.input.lookYaw = 0;
      g.input.lookPitch = 0;
      g.simulate(0.2);
      return { moved, turned };
    });
    ok(still.moved < 0.006 && still.turned < 0.006, `${frame}: the mouse stopped, the view stops: in the three quarters of a second after, the eye moved ${(still.moved * 1000).toFixed(1)} mm and turned ${((still.turned * 180) / Math.PI).toFixed(2)}°`);
    // driven up to speed: the needles turned from where they rested; the corner of the screen with the readings
    await ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      v.sim.setParkBrake(false);
      g.scripted = { steer: 0, throttle: 0.7, brake: 0, handbrake: 0 };
      for (let t = 0; t < 9; t += 1 / 60) g.step(1 / 60, 1);
      g.scripted = { steer: 0, throttle: 0.35, brake: 0, handbrake: 0 };
      for (let t = 0; t < 1.5; t += 1 / 60) g.step(1 / 60, 1);
    });
    await shot(`${frame}_cab.png`);
    const read = await ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      const c = v.view.cluster;
      const d = v.sys.dash;
      return {
        kmh: v.sim.kmh,
        speed: c.reading('speed') * c.speedScale.max,
        rpm: c.reading('rpm') * c.rpmScale.max * 1000,
        engine: d.rpm,
        gear: d.gearLabel,
        gearShown: c.display.gear,
        corner: !!document.querySelector('.mc-dash'),
        look: g.gaugeLook,
      };
    });
    ok(read.kmh > 25 && Math.abs(read.speed - read.kmh) < Math.max(3, read.kmh * 0.05) && Math.abs(read.rpm - read.engine) < 250, `${frame}: at ${read.kmh.toFixed(0)} km/h the speedometer reads ${read.speed.toFixed(0)}, the rev counter ${read.rpm.toFixed(0)} (${read.engine.toFixed(0)} rpm)`);
    ok(read.gearShown === read.gear && !read.corner, `${frame}: the display shows the gear ${read.gearShown} (${read.gear}); nothing in the corner of the screen`);
    ok(read.look === 0, `${frame}: no look at the dials draws the view in (${read.look})`);
    // behind the car: nothing in the corner of the screen either
    const behind = await ev(() => {
      const g = window.__rt.game;
      window.__rt.setView('chase');
      g.step(1 / 60, 1);
      const corner = !!document.querySelector('.mc-dash');
      window.__rt.setView('cockpit');
      g.step(1 / 60, 1);
      return { corner };
    });
    ok(!behind.corner, `${frame}: behind the car nothing in the corner of the screen (${JSON.stringify(behind)})`);
    if (errors.length) fail(`${frame}: page errors: ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f4_gauges: ${bad} failed` : 'f4_gauges ok');
process.exit(bad ? 1 : 0);
