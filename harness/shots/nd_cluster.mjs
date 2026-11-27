// The cab's instruments in every vehicle one drives (the player's ask, 2026-11-26: Nomad Drive's binnacle, the dials
// showing what the vehicle really reads, no readings in the corner of the screen — src/game/modcar/cluster.ts). For
// each frame, from the driver's seat: by day with the engine running and the parking brake on — the cluster there,
// its (P) lit and nothing else, the needles where the fuel and the coolant are, nothing in the corner of the screen;
// then low fuel, the coolant hot, the main beam and the hazard lights — each lamp lit, the indicators blinking, the
// coolant's needle in its red; the engine stopped and started again — the charge and oil lamps lit, every lamp lit
// for the bulb check as the key turns. At night with the lamps on: the faces lit. Each state's pictures from the
// driver's eye, the whole view and the instruments close up (the same eye, the view narrowed onto them).
//   SHOTS_GPU=1 node harness/shots/nd_cluster.mjs [frame ...]       (pictures: loop/shots/nd_cluster, or $ND_CLUSTER_OUT)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const ALL = ['sedan', 'wagon', 'pickup', 'goat', 'rhino', 'buffalo', 'van', 'turtle', 'elephant', 'camel', 'rv', 'snail', 'fox', 'moto'];
const FRAMES = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const out = process.env.ND_CLUSTER_OUT || path.join(ROOT, 'loop/shots/nd_cluster');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));

/** in the page: seated at the wheel in the cab, the engine running, the parking brake on, looking ahead */
const SEAT = () => {
  const g = window.__rt.game;
  g.ui.showHelp(false);
  if (!g.seated) g.enter(g.vehicles[0]);
  window.__rt.setView('cockpit');
  const v = g.seated;
  v.sim.setParkBrake(true);
  if (!v.sys.running) {
    v.sys.crank(true);
    for (let t = 0; t < 2 && !v.sys.running; t += 1 / 60) g.step(1 / 60, 1);
    v.sys.crank(false);
  }
  for (let t = 0; t < 2; t += 1 / 60) {
    g.input.lookYaw = 0;
    g.input.lookPitch = 0;
    g.step(1 / 60, 1);
  }
  return !!v.sys.running;
};

/** in the page: what the cluster shows now */
const READ = () => {
  const g = window.__rt.game;
  const v = g.seated;
  const c = v.view.cluster;
  if (!c) return null;
  const lamps = Object.fromEntries(c.lamps.map((id) => [id, +c.lamp(id).toFixed(2)]));
  const d = v.sys.dash;
  return {
    lamps,
    // (a motorcycle's fuel and coolant are bars on its little screens: what they show)
    fuel: c.layout.bike ? c.display.fuel : c.reading('fuel'),
    temp: c.layout.bike ? Math.min(1, Math.max(0, (c.display.coolantC - 50) / 80)) : c.reading('temp'),
    speed: c.reading('speed'),
    dash: { fuel: d.fuel, coolantC: d.coolantC, gear: d.gearLabel, running: d.running },
    shown: { gear: c.display.gear, power: c.display.power },
    glow: c.faceMat?.uniforms?.uMapEmissive?.value ?? -1,
    corner: !!document.querySelector('.mc-dash'),
    style: c.spec.style,
  };
};

try {
  for (const frame of FRAMES) {
    for (const night of [false, true]) {
      const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=600&time=${night ? 22 : 11}&weather=clear`, { width: 1280, height: 720 });
      const ev = (fn, arg) => page.evaluate(fn, arg);
      // the whole view from the driver's eye, then the instruments close up (the view narrowed onto them)
      const shots = async (tag) => {
        await ev(() => window.__rt.render());
        await page.screenshot({ path: path.join(out, `${frame}_${tag}_eye.png`) });
        await ev(() => {
          const g = window.__rt.game;
          const cam = g.core.camera;
          const c = g.seated.view.cluster;
          const V = cam.position.constructor;
          const fov = cam.fov;
          cam.fov = c.layout.bike ? 30 : 24;
          cam.updateProjectionMatrix();
          cam.lookAt(c.group.getWorldPosition(new V()));
          cam.updateMatrixWorld(true);
          g.render();
          window.__fov = fov;
        });
        await page.screenshot({ path: path.join(out, `${frame}_${tag}_close.png`) });
        await ev(() => {
          const g = window.__rt.game;
          g.core.camera.fov = window.__fov;
          g.core.camera.updateProjectionMatrix();
          g.step(1 / 60, 1);
        });
      };
      const running = await ev(SEAT);
      if (!running) fail(`${frame}: the engine would not start`);
      if (!night) {
        // by day, the engine running, the parking brake on
        const r = await ev(READ);
        if (!r) {
          fail(`${frame}: no cluster in the cab`);
          await page.close();
          continue;
        }
        // (the lamps it has: a motorcycle's clocks have no parking brake's, charge's or dipped beam's)
        const has = (id) => id in r.lamps;
        const litNow = Object.entries(r.lamps).filter(([, l]) => l > 0.5).map(([id]) => id);
        ok(litNow.join(' ') === (has('park') ? 'park' : ''), `${frame} (${r.style}): engine running, parking brake on — lit: ${litNow.join(' ') || 'nothing'}`);
        ok(Math.abs(r.fuel - r.dash.fuel) < 0.03, `${frame}: the fuel needle at ${r.fuel.toFixed(2)} for ${r.dash.fuel.toFixed(2)} of the tank`);
        ok(Math.abs(r.temp - Math.min(1, Math.max(0, (r.dash.coolantC - 50) / 80))) < 0.03, `${frame}: the coolant's needle at ${r.temp.toFixed(2)} for ${r.dash.coolantC.toFixed(0)} °C`);
        ok(r.shown.gear === r.dash.gear && r.shown.power, `${frame}: the display shows the gear ${r.shown.gear}`);
        ok(!r.corner, `${frame}: nothing in the corner of the screen`);
        await shots('day');
        // low fuel, the coolant hot, the main beam, the hazard lights
        const warn = await ev(() => {
          const g = window.__rt.game;
          const v = g.seated;
          const tank = v.view.frame.mounts.find((m) => m.cat === 'fuelTank');
          const f = tank && v.build.parts[tank.id]?.fluids.fuel;
          if (f) {
            const total = Object.values(f).reduce((a, b) => a + (b ?? 0), 0) || 1;
            for (const k of Object.keys(f)) f[k] = ((f[k] ?? 0) / total) * 0.8;
          }
          v.sys.lights = 'high';
          v.view.hazard = true;
          const seen = { on: false, off: false };
          // (4 s: the fuel and the coolant needles are damped as real ones are — core/modcar/instruments.ts NEEDLE_TAU)
          for (let t = 0; t < 4; t += 1 / 60) {
            v.sys.coolantC = 119;
            g.step(1 / 60, 1);
            const c = v.view.cluster;
            if (c.lamp('turnL') > 0.5 && c.lamp('turnR') > 0.5) seen.on = true;
            if (c.lamp('turnL') < 0.1 && c.lamp('turnR') < 0.1) seen.off = true;
          }
          // (stopped on the blink's lit half, for the picture)
          for (let i = 0; i < 60 && !(v.view.cluster.lamp('turnL') > 0.5); i++) {
            v.sys.coolantC = 119;
            g.step(1 / 60, 1);
          }
          return { seen };
        });
        const w = await ev(READ);
        const lit = Object.entries(w.lamps).filter(([, l]) => l > 0.5).map(([id]) => id);
        for (const id of ['fuel', 'coolant', 'high', 'park'].filter(has)) ok(lit.includes(id), `${frame}: low fuel, hot, main beam, parking brake — ${id} lit (${lit.join(' ')})`);
        ok(!lit.includes('low'), `${frame}: the main beam's blue alone, the dipped beam's green out`);
        ok(warn.seen.on && warn.seen.off, `${frame}: the indicators blink with the hazard lights (lit ${warn.seen.on}, dark ${warn.seen.off})`);
        ok(w.temp > 0.84, `${frame}: the coolant's needle in its red at 119 °C (${w.temp.toFixed(2)})`);
        ok(w.fuel < 0.05, `${frame}: the fuel needle at E (${w.fuel.toFixed(2)})`);
        await shots('warn');
        // the engine stopped, the key on: charge and oil; the key turned: the bulb check
        const key = await ev(() => {
          const g = window.__rt.game;
          const v = g.seated;
          v.view.hazard = false;
          v.sys.lights = 'off';
          v.sys.coolantC = 85;
          v.sys.stop('');
          for (let t = 0; t < 0.6; t += 1 / 60) g.step(1 / 60, 1);
          const c = v.view.cluster;
          const stopped = c.lamps.filter((id) => c.lamp(id) > 0.4);
          v.sys.crank(true);
          for (let t = 0; t < 0.25; t += 1 / 60) g.step(1 / 60, 1);
          const check = c.lamps.filter((id) => c.lamp(id) > 0.2);
          for (let t = 0; t < 2 && !v.sys.running; t += 1 / 60) g.step(1 / 60, 1);
          v.sys.crank(false);
          for (let t = 0; t < 2.5; t += 1 / 60) g.step(1 / 60, 1);
          const after = c.lamps.filter((id) => c.lamp(id) > 0.5);
          return { stopped, check, all: c.lamps.length, after, running: v.sys.running };
        });
        ok(['oil', 'charge'].filter(has).every((id) => key.stopped.includes(id)), `${frame}: the engine stopped, the key on — ${key.stopped.join(' ')} lit`);
        ok(key.check.length === key.all, `${frame}: the key turned, every lamp lit for the bulb check (${key.check.length} of ${key.all})`);
        ok(key.running && !key.after.includes('oil') && !key.after.includes('charge'), `${frame}: running again, the check over — lit: ${key.after.join(' ') || 'nothing'}`);
      } else {
        // at night, the lamps on: the faces lit
        const n = await ev(() => {
          const g = window.__rt.game;
          const v = g.seated;
          v.sys.lights = 'low';
          for (let t = 0; t < 1; t += 1 / 60) g.step(1 / 60, 1);
          return null;
        });
        void n;
        const r = await ev(READ);
        ok(r && r.glow > 0.3 && (!('low' in r.lamps) || r.lamps.low > 0.5), `${frame}: at night with the lamps on the faces are lit (${r?.glow?.toFixed(2)}) and the dipped beam's lamp (${r?.lamps.low ?? 'none'})`);
        await shots('night');
      }
      const lastError = await ev(() => window.__rt.lastError);
      if (lastError) fail(`${frame}: a frame threw: ${lastError}`);
      if (errors.length) fail(`${frame}: page errors: ${errors.slice(0, 2).join(' | ')}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `nd_cluster: ${bad} failed` : 'nd_cluster ok');
process.exit(bad ? 1 : 0);
