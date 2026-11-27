// Getting in, with the real mouse (docs/V3/plan/finish.md §十八, 界面恢复 — the player's ask of 2026-11-26: standing at the
// back of a camper to open its door or its boot sat one in the driver's seat). On foot by six vehicles: from behind (its
// back, its door, its boot) a click never puts one in the driver's seat; beside the driver's door, the mark on the seat,
// a click does (a shut door there opened by the click before); beside the passenger's door, into that seat.
//   SHOTS_GPU=1 node harness/shots/ui_seats.mjs [frame ...]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const ALL = ['rv', 'elephant', 'camel', 'turtle', 'sedan', 'pickup'];
const frames = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (c, why) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', why); };
try {
  for (const frame of frames) {
    const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=600&time=10&weather=clear`, { width: 1280, height: 720 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const step = (s) => ev((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); g.simulate(0); }, s);
    const state = () => ev(() => { const g = window.__rt.game; const t = g.player.target; return { seated: !!g.seated, at: g.seatAt ?? '', t: t ? `${t.kind}:${t.mount?.id ?? t.seat ?? ''}` : '-', words: document.querySelector('.mc-bot')?.innerText.replace(/\s+/g, ' ') ?? '' }; });
    const click = async () => { await page.mouse.down(); await step(0.1); await page.mouse.up(); await step(0.5); };
    await page.mouse.move(640, 360); await page.mouse.click(640, 360); await step(0.5);
    await ev(() => { const g = window.__rt.game; if (g.seated) g.getOut(); g.simulate(0.5); g.seated?.sim.setParkBrake(true); });
    // the vehicle's middle, its axes, and its front seats' places (world)
    const geo = await ev(() => {
      const g = window.__rt.game; const v = g.vehicles[0]; const o = g.core.origin; const b = new Float64Array(9); v.sim.basis(b);
      const at = (m) => { if (!m) return null; const n = v.view.mountNode(m.id); if (!n) return null; const p = n.getWorldPosition(new (n.position.constructor)()); return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, side: m.side ?? 0 }; };
      const d = v.view.frame.mounts.find((m) => m.driver);
      const mounts = v.view.frame.mounts;
      const pass = mounts.find((m) => m.cat === 'seat' && !m.driver && Math.sign(m.pos.z) !== Math.sign(d.pos.z) && Math.abs(m.pos.z) > 0.15 && Math.abs(m.pos.x - d.pos.x) < 0.6);
      const sd = v.solid.update();
      return { c: { x: sd.x, z: sd.z }, hx: sd.hx, hz: sd.hz, fx: b[0], fz: b[2], lx: b[6], lz: b[8], driver: at(d), pass: at(pass), y: v.sim.position?.y ?? 0 };
    });
    // 1. from behind: stand 1.2 m off its back, look at its back at a hand's height, click
    const half = Math.max(geo.hx, geo.hz);
    for (const [lat, h] of [[0, 1.1], [0.5, 0.9], [-0.5, 1.4]]) {
      const bx = geo.c.x - geo.fx * (half + 1.2) + geo.lx * lat;
      const bz = geo.c.z - geo.fz * (half + 1.2) + geo.lz * lat;
      const tx = geo.c.x - geo.fx * (half - 0.2) + geo.lx * lat;
      const tz = geo.c.z - geo.fz * (half - 0.2) + geo.lz * lat;
      const ty = (geo.driver?.y ?? 0.5) + h - 0.3;
      await rt('aimPoint', tx, ty, tz, Math.atan2(bz - tz, bx - tx), Math.hypot(bx - tx, bz - tz));
      await step(0.2);
      const s0 = await state();
      await click();
      const s1 = await state();
      ok(!s1.seated, `${frame}: from behind (${lat} m across, the mark on ${s0.t}, "${s0.words}"): a click leaves one standing (seated: ${s1.seated} ${s1.at})`);
      if (s1.seated) { await ev(() => window.__rt.game.getOut()); await step(0.5); }
      // (a door opened at the back: shut it again for the next look)
    }
    // 2. beside the driver's door: the seat under the mark, a click: in, at the wheel
    for (const [name, seat, want] of [['driver', geo.driver, 'driver'], ['passenger', geo.pass, 'pass']]) {
      if (!seat) { console.log(`${frame}: no ${name} seat`); continue; }
      const s = seat.side || 1;
      const px = seat.x + geo.lx * 1.0 * s; const pz = seat.z + geo.lz * 1.0 * s;
      await rt('aimPoint', seat.x, seat.y + 0.1, seat.z, Math.atan2(pz - seat.z, px - seat.x), Math.hypot(px - seat.x, pz - seat.z));
      await step(0.2);
      let s0 = await state();
      await click();
      let s1 = await state();
      // (a shut door there: that click opened it — the seat behind it next)
      if (!s1.seated && s0.t.startsWith('part:door')) {
        await rt('aimPoint', seat.x, seat.y + 0.1, seat.z, Math.atan2(pz - seat.z, px - seat.x), Math.hypot(px - seat.x, pz - seat.z));
        await step(0.2);
        s0 = await state();
        await click();
        s1 = await state();
      }
      ok(s1.seated && (s1.at || 'driver') === want, `${frame}: beside the ${name}'s door, the mark on ${s0.t} ("${s0.words}"): a click sits one in it (${s1.seated} ${s1.at})`);
      if (s1.seated) { await ev(() => window.__rt.game.getOut()); await step(0.6); }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `ui_seats: ${bad} failed` : 'ui_seats ok');
process.exit(bad ? 1 : 0);
