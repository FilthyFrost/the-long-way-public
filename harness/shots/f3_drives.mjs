// F3 (docs/V3/plan/finish.md §四; docs/V3/plan/rv.md: 装好、开出去 5 km), in the game: each of the fourteen vehicles one
// drives, as it comes from the factory, driven five kilometres along the road by a hand that follows its lane at
// 60 km/h (the slow ones at what they reach), with the game's aids as a new game has them. Asked of each: it gets
// there, it never leaves the road's width, it never rolls past its limit (20°, the four homes 15°), it is never
// towed back or righted, and it pulls up at the end.
//   SHOTS_GPU=1 node harness/shots/f3_drives.mjs [km] [frame ...]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const KM = Number(process.argv[2] ?? 5);
const ALL = ['sedan', 'pickup', 'moto', 'van', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino', 'rv', 'turtle', 'elephant', 'camel'];
const FRAMES = process.argv.length > 3 ? process.argv.slice(3) : ALL;
const HOMES = new Set(['rv', 'turtle', 'elephant', 'camel']);
const out = path.join(ROOT, 'loop/shots/f3_drives');
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
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=200&time=8.5&weather=clear`, { width: 1280, height: 720 });
    const res = await page.evaluate(async (km) => {
      const g = window.__rt.game;
      const v = g.seated;
      if (!v) return { error: 'not seated' };
      const SS = await import('/src/core/world/spine.ts');
      const st = new SS.SpineSample();
      const pr = { s: 0, d: 0 };
      const sp = g.world.spine;
      sp.project(v.sim.px, v.sim.pz, NaN, pr);
      const s0 = pr.s;
      const lane = Math.max(1.2, Math.min(2.2, Math.abs(pr.d))) * (pr.d < 0 ? -1 : 1);
      const basis = new Float64Array(9);
      const steerTo = (hint) => {
        sp.project(v.sim.px, v.sim.pz, hint, pr);
        const look = 14 + Math.abs(v.sim.kmh) * 0.25;
        sp.at(pr.s + look, st);
        const tx = st.x - Math.sin(st.phi) * lane;
        const tz = st.z + Math.cos(st.phi) * lane;
        v.sim.basis(basis);
        const head = Math.atan2(basis[2], basis[0]);
        let a = Math.atan2(tz - v.sim.pz, tx - v.sim.px) - head;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return Math.max(-1, Math.min(1, a * 2.2));
      };
      v.sim.setParkBrake(false);
      const want = 60;
      let hint = pr.s;
      let roll = 0;
      let off = 0;
      let up = 1;
      let top = 0;
      let said = '';
      let t = 0;
      const toast = () => {
        const e = document.querySelector('.mc-toast');
        return e && e.style.opacity !== '0' ? e.textContent : '';
      };
      for (; t < 900 && pr.s - s0 < km * 1000; t += 1 / 60) {
        const steer = steerTo(hint);
        hint = pr.s;
        const k = v.sim.kmh;
        g.scripted = { steer, throttle: Math.max(0, Math.min(1, (want - k) * 0.09 + 0.15)), brake: k > want + 8 ? 0.35 : 0, handbrake: 0 };
        g.step(1 / 60, 1);
        const r = Math.abs(v.sim.roll) * 57.2958;
        if (r > roll) roll = r;
        if (Math.abs(pr.d) > off) off = Math.abs(pr.d);
        v.sim.basis(basis);
        if (basis[4] < up) up = basis[4];
        if (k > top) top = k;
        if (!said) {
          const x = toast();
          if (/拖回|扶正|放回/.test(x)) said = x;
        }
      }
      const went = pr.s - s0;
      // pull up
      let stopT = 0;
      for (; stopT < 40 && (v.sim.speed > 0.05 || !v.sim.hold); stopT += 1 / 60) {
        const steer = steerTo(hint);
        hint = pr.s;
        g.scripted = { steer, throttle: 0, brake: v.sim.vForward > 0.5 ? 0.45 : 0.15, handbrake: 0 };
        g.step(1 / 60, 1);
      }
      g.scripted = null;
      return { went, minutes: t / 60, roll, off, up, top, said, stopT, stopped: v.sim.speed < 0.1, esc: v.sim.esc, abs: v.sim.abs, guard: v.sim.rollGuard, lastError: window.__rt.lastError ?? '' };
    }, KM);
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, `${frame}.png`) });
    if (res.error) fail(`${frame}: ${res.error}`);
    else {
      const lim = frame === 'moto' ? 90 : HOMES.has(frame) ? 15 : 20;
      ok(
        res.went >= KM * 1000 - 1 && res.off < 6 && res.roll <= lim && res.up > 0.7 && !res.said && res.stopped && res.guard && res.esc && res.abs && !res.lastError,
        `${frame}: ${(res.went / 1000).toFixed(2)} km in ${res.minutes.toFixed(1)} min (top ${res.top.toFixed(0)} km/h), at most ${res.off.toFixed(1)} m off the road's middle, rolled ${res.roll.toFixed(1)}° at most, pulled up in ${res.stopT.toFixed(1)} s${res.said ? ` — ${res.said}` : ''}${res.lastError ? ` — ${res.lastError}` : ''}`,
      );
    }
    if (errors.length) fail(`${frame}: page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  server.close?.();
}
console.log(bad ? `f3_drives: ${bad} FAILED` : 'f3_drives ok');
process.exit(bad ? 1 : 0);
