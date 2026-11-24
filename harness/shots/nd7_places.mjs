// ND7's small places in the game (docs/ND/PLAN.md): Nomad Drive's minor places — the bus stop, the outhouses, the
// mailboxes, the windmill, the hay, the crosses, the wrecks — seen from the road and close to; what they were found
// with, where it lies; their doors and lids at work, the windmill's wheel turning with the wind.
//   SHOTS_GPU=1 node harness/shots/nd7_places.mjs [busstop,toilets,…|all] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd7');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[3] || '7';
let fails = 0;
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fails++;
};
const settle = (page, n = 30) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
// (the things lying within a rectangle of the card's frame, their height over its floor, out of reach or not)
const within = (page, P, u0, u1, v0, v1) =>
  page.evaluate(({ P, u0, u1, v0, v1 }) => {
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    return window.__rt.game.loose.list
      .map((l) => {
        const dx = l.x - P.x, dz = l.z - P.z;
        return { l, u: c * dx + s * dz, v: -s * dx + c * dz };
      })
      .filter((q) => q.u > u0 && q.u < u1 && q.v > v0 && q.v < v1)
      .map((q) => ({ what: q.l.item?.item ?? q.l.tool?.kind ?? q.l.part?.part ?? '?', y: +(q.l.y - P.y).toFixed(2), shut: !!q.l.shut }));
  }, { P, u0, u1, v0, v1 });

// (u, v: the card's frame — v towards the road is negative; y: over its floor; hour: the clock for the shot)
const PLACES = {
  busstop: {
    open: [],
    views: [
      ['10_busstop_from_the_road.png', [1.5, -9, 0], [0, 0], 0.05, 15.5],
      ['11_its_bench.png', [0.9, -2.4, 0], [-0.2, 0.6], -0.3, 15.5],
    ],
    probe: async ({ page, P }) => {
      const bench = await within(page, P, -1.4, 1.4, 0.15, 0.9);
      console.log('on the bench', JSON.stringify(bench));
      check(bench.every((t) => Math.abs(t.y - 0.45) < 0.08), 'what is on the bench lies on it (0.45 m)');
    },
  },
  toilets: {
    open: ['DOOR_wc_a', 'DOOR_wc_b'],
    least: 3,
    views: [
      ['20_outhouses_from_the_road.png', [0.5, -8, 0], [0, 0], 0.05, 15.5],
      ['21_into_one.png', [1.97, -2.3, 0], [1.97, 0.3], -0.25, 15.5],
    ],
    probe: async ({ page, H, P }) => {
      const doors = await H('nd-build', 'doors', P.id);
      check(doors.length === 2 && doors.every((d) => !d.locked), `two doors, never locked (${doors.map((d) => d.name + (d.stuck ? ':stuck' : '')).join(', ')})`);
      await H('nd-build', 'door', P.id, false, 'DOOR_wc_a');
      await settle(page);
      const a = (await within(page, P, 1.4, 2.6, -0.6, 0.6)).filter((t) => t.what === 'nd_wc');
      await H('nd-build', 'door', P.id, true, 'DOOR_wc_a');
      await settle(page);
      const b = (await within(page, P, 1.4, 2.6, -0.6, 0.6)).filter((t) => t.what === 'nd_wc');
      console.log('the bowl, its door shut', JSON.stringify(a), 'open', JSON.stringify(b));
      check(a.length === 1 && a[0].shut && b.length === 1 && !b[0].shut, 'the first always has its bowl, out of reach till its door is open');
    },
  },
  mailboxes: {
    open: ['DOOR_mail0', 'DOOR_mail2', 'DOOR_mail3', 'DOOR_mail4'],
    least: 3,
    views: [
      ['30_mailboxes_from_the_road.png', [0.3, -4.5, 0], [0, 0], -0.15, 15.5],
      ['31_their_doors_open.png', [-1.0, -1.7, 0], [-1.0, 0.0], -0.45, 15.5],
      ['32_into_one.png', [-1.89, -0.8, 0], [-1.89, 0.05], -0.42, 15.5],
      ['33_a_parcel_box.png', [-0.81, -0.75, 0], [-0.81, 0.05], -0.62, 15.5],
      ['34_a_big_one.png', [-0.27, -0.85, 0], [-0.27, 0.05], -0.4, 15.5],
    ],
    probe: async ({ page, H, P }) => {
      const doors = await H('nd-build', 'doors', P.id);
      check(doors.length === 8 && doors.every((d) => !d.locked), `eight doors and lids, never locked (${doors.filter((d) => d.stuck).length} stuck)`);
      for (let i = 0; i < 8; i++) await H('nd-build', 'door', P.id, false, `DOOR_mail${i}`);
      await settle(page);
      const a = await within(page, P, -2.2, 2.2, -0.3, 0.3);
      for (let i = 0; i < 8; i++) await H('nd-build', 'door', P.id, true, `DOOR_mail${i}`);
      await settle(page);
      const b = await within(page, P, -2.2, 2.2, -0.3, 0.3);
      console.log('in the boxes, shut', JSON.stringify(a), 'open', JSON.stringify(b));
      if (a.length) check(a.every((t) => t.shut) && b.every((t) => !t.shut), 'what is in a mailbox is out of reach till its door or lid is open');
      check(b.length > 0 && b.every((t) => t.y > 0.79 && t.y < 0.9), `what is in a mailbox lies on its floor (${b.map((t) => t.y).join(', ')} m)`);
      // (a door hinged at its foot comes down and out; a lid at its back goes up)
      const pose = await page.evaluate(() => {
        const sc = window.__rt.game.core.scene;
        const f = sc.getObjectByName('DOOR_mail0');
        const t = sc.getObjectByName('DOOR_mail2');
        return { front: f ? [f.quaternion.x, f.quaternion.y, f.quaternion.z, f.quaternion.w] : null, lid: t ? [t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w] : null };
      });
      console.log('turned', JSON.stringify(pose));
      check(!!pose.front && Math.abs(pose.front[3]) < 0.9 && !!pose.lid && Math.abs(pose.lid[3]) < 0.9, 'their doors and lids tilt open about their hinges');
      for (let i = 0; i < 8; i++) await H('nd-build', 'door', P.id, false, `DOOR_mail${i}`);
    },
  },
  windmill: {
    open: [],
    views: [
      ['40_windmill_from_the_road.png', [1.2, -7, 0], [0, 0], 0.22, 15.5],
      ['41_its_wheel.png', [0.5, -3.4, 0], [0.05, -0.17], 0.42, 15.5],
    ],
    probe: async ({ page }) => {
      await settle(page, 240);
      const wind = await page.evaluate(() => window.__rt.game.env?.state?.wind ?? 4);
      const turn = await page.evaluate(() => {
        const g = window.__rt.game;
        const w = g.core.scene.getObjectByName('N_spin_wheel');
        if (!w) return null;
        const q0 = w.quaternion.clone();
        for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
        const d = Math.abs(q0.x * w.quaternion.x + q0.y * w.quaternion.y + q0.z * w.quaternion.z + q0.w * w.quaternion.w);
        return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI / 0.05 / 6;
      });
      const want = 80 * Math.min(1, wind / 18);
      console.log('its wheel at', turn?.toFixed(1), 'rpm in', wind.toFixed(1), 'm/s: about', want.toFixed(1));
      check(turn !== null && Math.abs(turn - want) < want * 0.3 + 1, `its wheel turns with the wind (${turn?.toFixed(1)} rpm in ${wind.toFixed(1)} m/s; 80 × the wind's share, ±8 % its own, ±12 % gusts)`);
    },
  },
  hays: {
    open: [],
    views: [
      ['50_hay_from_the_road.png', [2, -11, 0], [0, 0], -0.05, 15.5],
      ['51_among_the_bales.png', [1.8, -3.6, 0], [-0.5, 1.0], -0.25, 15.5],
    ],
    probe: async ({ page, P }) => {
      const all = await within(page, P, -2.0, 2.0, -3.9, 3.9);
      const tops = all.filter((t) => t.y > 0.3);
      console.log('on the bales', JSON.stringify(tops));
      check(tops.length > 0 && tops.every((t) => Math.abs(t.y - 0.66) < 0.06 || Math.abs(t.y - 1.32) < 0.06), 'what is on the bales lies on their tops (0.66, 1.32 m)');
    },
  },
  crosses: {
    open: [],
    views: [['60_crosses_from_the_road.png', [0.5, -6.5, 0], [0, 0], -0.2, 15.5]],
  },
  wreck1: {
    open: [],
    views: [
      ['70_wreck1_from_the_road.png', [3.5, -7.5, 0], [0, 0], -0.1, 15.5],
      ['71_by_it.png', [2.6, -2.2, 0], [0, 0.2], -0.2, 15.5],
    ],
    probe: wreckProbe,
  },
  wreck2: {
    open: [],
    views: [
      ['72_wreck2_from_the_road.png', [3.5, -7.5, 0], [0, 0], -0.1, 15.5],
      ['73_by_it.png', [2.6, -2.2, 0], [0, 0.2], -0.2, 15.5],
    ],
    probe: wreckProbe,
  },
  wreck3: {
    open: [],
    views: [
      ['74_wreck3_from_the_road.png', [3.5, -7.5, 0], [0, 0], -0.1, 15.5],
      ['75_by_it.png', [2.6, -2.2, 0], [0, 0.2], -0.2, 15.5],
    ],
    probe: wreckProbe,
  },
};

/** a wreck place: the road's own wreck (a vehicle of the game's) lies in its middle, across the verge, one walks into
 * it and not through it */
async function wreckProbe({ page, P, walk }) {
  const wr = await page.evaluate((P) => {
    const g = window.__rt.game;
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    return g.vehicles.slice(1).map((v) => {
      const dx = v.sim.px - P.x, dz = v.sim.pz - P.z;
      return { name: v.view.frame?.name?.zh ?? '?', u: +(c * dx + s * dz).toFixed(2), v: +(-s * dx + c * dz).toFixed(2), yaw: +(v.sim.yaw + P.yaw).toFixed(2) };
    });
  }, P);
  console.log('its wreck', JSON.stringify(wr));
  check(wr.length === 1 && Math.hypot(wr[0].u, wr[0].v) < 0.8, `its wreck lies in its middle (${wr.map((w) => `${w.name} at ${w.u}, ${w.v}`).join('; ')})`);
  const w = await walk([0, -4.5], [0, 4.5], 0.0, 4);
  const v = -Math.sin(P.yaw) * (w.x - P.x) + Math.cos(P.yaw) * (w.z - P.z);
  check(v < -1.6, `one walks into it, not through it (stopped at v ${v.toFixed(2)})`);
}

const which = (process.argv[2] || 'all') === 'all' ? Object.keys(PLACES) : process.argv[2].split(',');
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const prefab of which) {
    const cfg = PLACES[prefab];
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=${prefab}&time=15.5&weather=clear`, { width: 1280, height: 720 });
    const sim = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
    const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
    const P = (await H('nd-build', 'places')).find((p) => p.prefab === prefab);
    if (!P) throw new Error(`no ${prefab} laid`);
    console.log(prefab, JSON.stringify(P));
    const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
    await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(0, -22));
    for (let i = 0; i < 90; i++) {
      await sim(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await page.evaluate(({ x, z, yaw }) => { const g = window.__rt.game; if (g.seated) g.getOut(); window.__rt.placeVehicle(0, x, z, yaw); }, { ...W(-26, -8), yaw: P.yaw });
    await sim(8);
    const things = await page.evaluate(({ x, z, reach }) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - x, l.z - z) < reach).map((l) => l.item?.item ?? l.tool?.kind ?? l.part?.part ?? '?'), { x: P.x, z: P.z, reach: cfg.reach ?? 24 });
    console.log('found', things.length, JSON.stringify(things));
    check(things.length >= (cfg.least ?? 6), `${prefab}: furnished (${things.length} things)`);
    const doors = await H('nd-build', 'doors', P.id);
    console.log('doors', doors.length, JSON.stringify(doors.map((d) => `${d.name}${d.locked ? ':locked' : ''}${d.stuck ? ':stuck' : ''}${d.open > 0.5 ? ':open' : ''}`)));
    // (stood at a point of the card, feet at y over its floor, looking at another; W held `secs`: where one is then)
    const walk = async (from, to, y0, secs) => {
      const a = W(from[0], from[1]);
      const b = W(to[0], to[1]);
      await page.evaluate(({ a, b, y0, P }) => {
        const g = window.__rt.game;
        g.player.walker.place(a.x, a.z, 0);
        g.player.walker.y = P.y + y0 + 0.02;
        g.input.lookYaw = Math.atan2(b.z - a.z, b.x - a.x);
        g.input.lookPitch = 0;
        for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
      }, { a, b, y0, P });
      await page.keyboard.down('KeyW');
      for (let t = 0; t < secs; t += 0.5) await page.evaluate(() => { const g = window.__rt.game; for (let k = 0; k < 30; k++) g.step(1 / 60, 1); });
      await page.keyboard.up('KeyW');
      await page.evaluate(() => { const g = window.__rt.game; for (let k = 0; k < 12; k++) g.step(1 / 60, 1); });
      return page.evaluate((P) => { const w = window.__rt.game.player.walker; return { y: w.y - P.y, x: w.x, z: w.z }; }, P);
    };
    await cfg.probe?.({ page, H, P, W, walk });
    for (const n of cfg.open) await H('nd-build', 'door', P.id, true, n);
    await sim(4);
    let hour = 15.5;
    for (const [f, from, to, pitch, h] of cfg.views) {
      if (h !== hour) {
        hour = h;
        await page.evaluate((h) => window.__rt.setHour(h), h);
        await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 400; i++) g.step(1 / 60, 1); });
      }
      const a = W(from[0], from[1]);
      const b = W(to[0], to[1]);
      await page.evaluate(({ a, b, y, pitch, fy }) => {
        const g = window.__rt.game;
        window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch);
        if (y > 0.01) g.player.walker.y = fy + y;
        else g.player.walker.y = Math.min(g.player.walker.y, fy + 0.5);
        g.simulate(0);
      }, { a, b, y: from[2], pitch, fy: P.y });
      await sim(2);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, f) });
      console.log('shot', f);
    }
    if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
