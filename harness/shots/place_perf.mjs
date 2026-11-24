// Placing's own gate (docs/V3/plan/prompts.md §七 1): at the four spots where placing once cost the most — the
// workshop with the line of sight on the Sugar Cube, the motorhome's rear bumper and its side from outside, its floor
// from inside — the live loop's frame with a can held out to be placed, against the same view with it only held.
// Fails (exit 1) where placing makes the frame more than 5 % (and 0.3 ms) longer, or the placing itself takes over 1 ms.
//   SHOTS_GPU=1 node harness/shots/place_perf.mjs
import { ON_GPU, launchBrowser, startServer } from './lib.mjs';

if (!ON_GPU) console.log('(not on the GPU: SHOTS_GPU=1 for real frame times)');
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const rows = [];
try {
  const open = async (addr) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    // (the address as written: a new game names no world)
    await Object.getPrototypeOf(page).goto.call(page, addr, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => window.__rt && window.__rt.ready === true, null, { timeout: 180_000 });
    await page.evaluate(async () => {
      const rt = window.__rt;
      const g = rt.game;
      g.ui.showHelp(false);
      if (g.seated) rt.exit();
      for (const v of g.vehicles) await v.view.settled();
      const IT = await import('/src/core/modcar/items.ts');
      const A = await import('/src/core/modcar/aboard.ts');
      const rec = { ms: [], place: 0 };
      const f = g.frame.bind(g);
      g.frame = (dt) => {
        const t0 = performance.now();
        f(dt);
        rec.ms.push(performance.now() - t0);
      };
      const sys = g.systems.get('nd-place');
      const pf = sys.frame.bind(sys);
      sys.frame = (...a) => {
        const t0 = performance.now();
        pf(...a);
        rec.place += performance.now() - t0;
      };
      const world = (v, x, y, z) => {
        const m = v.view.model;
        m.updateMatrixWorld(true);
        const q = m.localToWorld(new g.core.camera.position.constructor(x, y, z));
        const o = g.core.origin;
        return { x: q.x + o.x, y: q.y + o.y, z: q.z + o.z };
      };
      window.__pp = {
        hold(id) {
          const p = g.player;
          for (let i = 0; i < p.slots.length; i++) p.slots[i] = null;
          p.sel = 0;
          p.receive({ kind: 'item', item: IT.newItem(id) });
        },
        /** outside, standing at a point of vehicle vi's model looking at another */
        outside(vi, sx, sz, tx, ty, tz) {
          if (g.player.aboard) g.player.leaveAboard();
          const v = g.vehicles[vi];
          const s = world(v, sx, 0, sz);
          const t = world(v, tx, ty, tz);
          g.player.walker.place(s.x, s.z, 0, 0);
          const w = g.player.walker;
          const eye = w.eye();
          g.input.lookYaw = Math.atan2(t.z - w.z, t.x - w.x);
          g.input.lookPitch = Math.atan2(t.y - eye.y, Math.hypot(t.x - w.x, t.z - w.z));
        },
        /** in vehicle vi's living space at (x, z), looking at a point of its model */
        inside(vi, x, z, tx, ty, tz) {
          const v = g.vehicles[vi];
          if (!g.player.aboard) g.board(v, A.aboardOf(v.view.frame.id).doors[0]);
          const ab = g.player.aboard;
          ab.w.place(x, z, 0);
          const e = { x: 0, y: 0, z: 0 };
          const t = { x: 0, y: 0, z: 0 };
          ab.toWorld(ab.w.x, ab.w.floorAt(ab.w.x, ab.w.z) + 1.62, ab.w.z, { x: 0, y: 0, z: 0 }, e);
          ab.toWorld(tx, ty, tz, { x: 0, y: 0, z: 0 }, t);
          g.input.lookYaw = Math.atan2(t.z - e.z, t.x - e.x);
          g.input.lookPitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
        },
        frameOf(frame) {
          return g.vehicles.findIndex((v) => v.view.frame.id === frame);
        },
        placing(on) {
          const h = g.systems.harness('nd-place', 'placing');
          if (on && !h) g.systems.harness('nd-place', 'start');
          if (!on && h) g.systems.harness('nd-place', 'stop');
          return g.systems.harness('nd-place', 'placing');
        },
        sway(t) {
          g.input.lookYaw += Math.sin(t * 3.1) * 0.0015;
        },
        reset() {
          rec.ms.length = 0;
          rec.place = 0;
        },
        result() {
          const n = Math.max(1, rec.ms.length);
          return { frames: rec.ms.length, mean: rec.ms.reduce((a, b) => a + b, 0) / n, place: rec.place / n };
        },
      };
    });
    return page;
  };
  const measure = async (page, secs = 3) => {
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__pp.reset());
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
      await page.evaluate((t) => window.__pp.sway(t), (Date.now() - t0) / 1000);
      await page.waitForTimeout(50);
    }
    return page.evaluate(() => window.__pp.result());
  };
  const spot = async (page, name, setup) => {
    const j = (fn, ...a) => page.evaluate(({ fn, a }) => window.__pp[fn](...a), { fn, a });
    await j('placing', false);
    await setup(j);
    const held = await measure(page);
    if (!(await j('placing', true))) {
      console.log(`FAIL ${name}: no placing`);
      bad++;
      return;
    }
    await setup(j);
    const placing = await measure(page);
    await j('placing', false);
    const slower = placing.mean - held.mean;
    const ok = (slower <= Math.max(0.3, held.mean * 0.05) || !ON_GPU) && placing.place <= 1;
    if (!ok) bad++;
    rows.push({ name, held: +held.mean.toFixed(2), placing: +placing.mean.toFixed(2), place: +placing.place.toFixed(2), fps: +(placing.frames / 3).toFixed(0) });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} held ${held.mean.toFixed(2)} ms · placing ${placing.mean.toFixed(2)} ms (${(placing.frames / 3).toFixed(0)} fps) · placing itself ${placing.place.toFixed(2)} ms`);
  };
  // 1. the workshop of a new game: 2.4 m off the Sugar Cube's left, the line of sight on it
  const a = await open(`${url}/modcar.html?new=1`);
  await a.evaluate(() => window.__pp.hold('nd_baked_beans'));
  const sedan = await a.evaluate(() => window.__pp.frameOf('sedan'));
  await spot(a, 'workshop_sugar_cube', (j) => j('outside', sedan, 0, 2.4, 0, 0.9, 0));
  await a.close();
  // 2–4. a motorhome by the road: its rear bumper and its side from outside, its floor from inside
  const b = await open(`${url}/modcar.html?world=5&start=road&build=stock:rv&seed=7&s=300&time=11&weather=clear`);
  await b.evaluate(() => window.__pp.hold('nd_baked_beans'));
  await spot(b, 'rv_rear_bumper', (j) => j('outside', 0, -5.0, 0.3, -4.1, 0.75, 0.3));
  await spot(b, 'rv_side', (j) => j('outside', 0, -2.0, -2.6, -2.0, 1.6, -1.2));
  await spot(b, 'rv_inside_floor', (j) => j('inside', 0, -0.3, 0.45, 0.4, 0.86, 0.6));
  await b.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `\n${bad} spot(s) over` : '\nall spots: placing costs the frame nothing to speak of');
process.exit(bad ? 1 : 0);
