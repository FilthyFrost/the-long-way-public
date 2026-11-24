// ND6's places in the game (docs/ND/PLAN.md): Nomad Drive's WatchTower, Graveyard and the rest — seen from the road,
// walked round, up and into; what they were found with; their doors and lids at work.
//   SHOTS_GPU=1 node harness/shots/nd6_places.mjs [watchtower,graveyard,…|all] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd6');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[3] || '7';
let fails = 0;
const check = (ok, what) => {
  console.log(ok ? 'ok  ' : 'FAIL', what);
  if (!ok) fails++;
};

// (u, v: the card's frame; y: over its floor; hour: the clock for the shot)
const PLACES = {
  watchtower: {
    open: ['DOOR_cabin'],
    views: [
      ['20_watchtower_from_the_road.png', [3, -15, 0], [0, 0], 0.3, 15.5],
      ['21_up_its_stairs.png', [-3.0, 3.6, 2.33], [3.3, 3.3], 0.25, 15.5],
      ['22_on_its_walkway.png', [-3.35, 3.35, 6.97], [3.35, -3.35], -0.05, 15.5],
      ['23_in_its_cabin.png', [0.0, 2.2, 7.04], [0.0, -1.0], -0.3, 15.5],
      ['24_its_lamp_at_night.png', [6, -14, 0], [0, 0], 0.35, 21.5],
    ],
    probe: async (ctx) => {
      // (standing on its walkway: held up by it, not fallen through)
      const { page, W, P } = ctx;
      const a = W(-3.35, 3.35);
      const y = await page.evaluate(({ a, P }) => { const g = window.__rt.game; g.player.walker.place(a.x, a.z, 0); g.player.walker.y = P.y + 6.97; for (let i = 0; i < 30; i++) g.step(1 / 60, 1); return g.player.walker.y - P.y; }, { a, P });
      check(Math.abs(y - 6.97) < 0.1, `standing on its walkway (${y.toFixed(2)} m)`);
    },
  },
  graveyard: {
    open: [],
    views: [
      ['30_graveyard_from_the_road.png', [2, -12, 0], [0, 0], -0.05, 16.5],
      ['31_among_the_tombs.png', [-4.6, -3.6, 0], [1.2, 1.7], -0.25, 16.5],
      ['32_a_lid_slid_aside.png', [1.2, -3.9, 0], [1.2, -1.7], -0.6, 16.5],
      ['33_its_lamp_at_night.png', [3.6, -9.5, 0], [0, 0], 0.05, 21.5],
    ],
    probe: async (ctx) => {
      const { page, H, P } = ctx;
      const inTomb = async () => page.evaluate(({ P }) => {
        const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
        return window.__rt.game.loose.list.filter((l) => {
          const dx = l.x - P.x, dz = l.z - P.z;
          const u = c * dx + s * dz, v = -s * dx + c * dz;
          return Math.abs(u - 1.2) < 0.6 && Math.abs(v - 1.7) < 1.1 && l.y - P.y < 0.5;
        }).map((l) => ({ what: l.item?.item ?? '?', shut: !!l.shut }));
      }, { P });
      for (let i = 0; i < 20; i++) await page.evaluate(() => window.__rt.game.step(1 / 60, 1));
      const a = await inTomb();
      console.log('in tomb 6 (its lid shut)', JSON.stringify(a));
      await H('nd-build', 'door', P.id, true, 'DOOR_tomb6');
      for (let i = 0; i < 30; i++) await page.evaluate(() => window.__rt.game.step(1 / 60, 1));
      const b = await inTomb();
      console.log('in tomb 6 (its lid slid aside)', JSON.stringify(b));
      if (a.length) check(a.every((x) => x.shut) && b.every((x) => !x.shut), 'what is in a tomb is out of reach till its lid is slid aside');
      else console.log('(nothing in tomb 6 this time)');
    },
  },
  radiostation: {
    open: ['DOOR_entry', 'DOOR_lk3', 'DOOR_lk5a', 'DOOR_lk8b'],
    views: [
      ['50_radiostation_from_the_road.png', [-3, -20, 0], [0, 2], 0.3, 15.5],
      ['51_its_hall.png', [-0.2, -0.6, 0], [-6.0, -4.0], -0.12, 15.5],
      ['52_its_lockers.png', [-3.4, 0.6, 0], [-3.4, 2.4], -0.15, 15.5],
      ['53_up_its_stair.png', [-7.4, -4.8, 0.57], [-7.4, 0.0], 0.25, 15.5],
      ['54_on_its_roof.png', [-6.2, 2.0, 4.66], [5.4, 5.6], 0.35, 15.5],
      ['55_its_lights_at_night.png', [4, -24, 0], [2, 0], 0.5, 21.5],
    ],
    probe: async (ctx) => {
      const { page, H, P, W } = ctx;
      const doors = await H('nd-build', 'doors', P.id);
      const lk = doors.filter((d) => d.name.startsWith('DOOR_lk'));
      const eb = doors.filter((d) => d.name.startsWith('DOOR_ebox'));
      check(lk.length === 23, `23 locker doors (${lk.length}), ${lk.filter((d) => d.locked).length} locked`);
      check(lk.every((d) => !d.stuck) && eb.length === 2 && eb.every((d) => !d.locked) && eb[0].stuck === eb[1].stuck, 'lockers locked or not, the electric box stuck or not, its two doors alike');
      // (up its stair: the stair's foot to its head, onto the parapet and down onto the roof)
      const walk = async (from, to, y0, n) => page.evaluate(({ a, b, y0, n, P }) => {
        const g = window.__rt.game;
        g.player.walker.place(a.x, a.z, 0);
        g.player.walker.y = P.y + y0;
        g.input.lookYaw = Math.atan2(b.z - a.z, b.x - a.x);
        g.input.lookPitch = 0;
        for (let i = 0; i < 5; i++) g.step(1 / 60, 1);
        return n;
      }, { a: W(from[0], from[1]), b: W(to[0], to[1]), y0, n, P });
      await walk([-7.4, -6.0], [-7.4, 2.0], 0.0, 0);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 14; i++) await page.evaluate(() => { const g = window.__rt.game; for (let k = 0; k < 30; k++) g.step(1 / 60, 1); });
      await page.keyboard.up('KeyW');
      const up = await page.evaluate((P) => window.__rt.game.player.walker.y - P.y, P);
      check(Math.abs(up - 4.93) < 0.15, `up its 26 treads to its landing (${up.toFixed(2)} m)`);
      await walk([-7.4, 2.0], [-4.0, 2.0], 4.93, 0);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 4; i++) await page.evaluate(() => { const g = window.__rt.game; for (let k = 0; k < 30; k++) g.step(1 / 60, 1); });
      await page.keyboard.up('KeyW');
      const on = await page.evaluate((P) => { const w = window.__rt.game.player.walker; return { y: w.y - P.y, x: w.x, z: w.z }; }, P);
      check(Math.abs(on.y - 4.66) < 0.12, `over its parapet onto the roof (${on.y.toFixed(2)} m)`);
    },
  },
  containeryard: {
    open: ['DOOR_c4l', 'DOOR_c4r', 'DOOR_c8l', 'DOOR_c8r'],
    views: [
      ['40_containeryard_from_the_road.png', [2, -17, 0], [0, 0], 0.02, 15.5],
      ['41_in_its_lanes.png', [-2.0, 3.4, 0], [8.3, 3.2], -0.02, 15.5],
      ['42_into_a_container.png', [6.0, 7.9, 0], [0.0, 7.9], -0.12, 15.5],
      ['43_one_lying_askew.png', [3.6, -5.4, 0], [-0.6, -1.2], -0.1, 15.5],
      ['44_its_floodlights_at_night.png', [2.0, -15.0, 0], [2.0, 0.0], 0.08, 22.0],
    ],
    probe: async (ctx) => {
      const { page, H, P } = ctx;
      const doors = await H('nd-build', 'doors', P.id);
      const by = Object.fromEntries(doors.map((d) => [d.name, d]));
      const cs = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
      check(doors.length === 16, `two doors to each of its eight containers (${doors.length})`);
      check(cs.every((c) => by[`DOOR_${c}l`] && by[`DOOR_${c}r`] && by[`DOOR_${c}l`].stuck === by[`DOOR_${c}r`].stuck), 'each right door found as its left one');
      check(doors.every((d) => !d.locked), 'no container door locked (stuck or not)');
      console.log('stuck:', cs.filter((c) => by[`DOOR_${c}l`].stuck).join(',') || 'none');
      // (what is in a container — its middle (Blender x, y) and heading: the card's u = x, v = -y)
      const inside = (cx, cy, yaw) => page.evaluate(({ P, cx, cy, yaw }) => {
        const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
        const a = (yaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        return window.__rt.game.loose.list.filter((l) => {
          const dx = l.x - P.x, dz = l.z - P.z;
          const u = c * dx + s * dz, v = -s * dx + c * dz;
          const X = u - cx, Y = -v - cy;
          const lx = ca * X + sa * Y, ly = -sa * X + ca * Y;
          return Math.abs(lx) < 2.95 && Math.abs(ly) < 1.05 && l.y - P.y < 1.2;
        }).map((l) => ({ what: l.item?.item ?? '?', shut: !!l.shut }));
      }, { P, cx, cy, yaw });
      const settle = () => page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 30; i++) g.step(1 / 60, 1); });
      await settle();
      const a = await inside(1.0, -7.9, 0);
      await H('nd-build', 'door', P.id, true, 'DOOR_c4r');
      await settle();
      const b = await inside(1.0, -7.9, 0);
      await H('nd-build', 'door', P.id, false, 'DOOR_c4r');
      await settle();
      const c = await inside(1.0, -7.9, 0);
      console.log('in c4: shut', JSON.stringify(a), 'its right door open', JSON.stringify(b), 'shut again', JSON.stringify(c));
      if (a.length) check(a.every((x) => x.shut) && b.every((x) => !x.shut) && c.every((x) => x.shut), 'what is in a container is out of reach till either of its doors is open');
      else console.log('(nothing in c4 this time)');
      const d = await inside(-0.6, 1.2, 45);
      await H('nd-build', 'door', P.id, true, 'DOOR_c8l');
      await settle();
      const e = await inside(-0.6, 1.2, 45);
      console.log('in c8 (askew): shut', JSON.stringify(d), 'open', JSON.stringify(e));
      if (d.length) check(d.every((x) => x.shut) && e.every((x) => !x.shut), 'the same in a container lying askew');
      else console.log('(nothing in c8 this time)');
    },
  },
};

PLACES.factory2 = {
  open: [],
  views: [
    ['60_warehouse_from_the_road.png', [2, -20, 0], [2.6, 2.6], 0.12, 15.5],
    ['61_under_its_shutter.png', [3.5, -6.5, 0], [3.5, 2.0], -0.05, 15.5],
    ['62_among_its_shelves.png', [3.5, 1.5, 0], [-3.0, 4.4], -0.15, 15.5],
    ['63_on_its_roof.png', [-2.6, 7.0, 5.7], [8.0, -2.0], -0.05, 15.5],
  ],
  probe: async (ctx) => {
    const { walk, P } = ctx;
    const a = await walk([-4.55, -4.0], [-4.55, 8.0], 0.0, 7);
    check(Math.abs(a.y - 6.42) < 0.15, `up its 35 treads to the landing (${a.y.toFixed(2)} m)`);
    const b = await walk([-4.85, 7.15], [0.0, 7.15], 6.42, 2.5);
    check(Math.abs(b.y - 5.7) < 0.12, `over its parapet and down the step onto the roof (${b.y.toFixed(2)} m)`);
  },
};
PLACES.windfarm = {
  open: ['DOOR_base_a'],
  reach: 48,
  views: [
    ['90_windfarm_from_the_road.png', [0, -45, 0], [0, 0], 0.45, 15.5],
    ['92_up_its_spiral.png', [-34.95, -1.0, 0.4], [-34.95, 0.0], 1.25, 15.5],
    ['91_into_its_tower.png', [-34.95, -3.6, 0.13], [-34.95, 0.0], 0.3, 15.5],
    ['93_at_its_head.png', [-35.9, -0.5, 50.03], [-34.95, 5.0], -0.1, 15.5],
    ['94_in_its_nacelle.png', [-33.45, 5.6, 50.03], [-34.95, -1.5], 0.1, 15.5],
    ['95_its_lights_at_night.png', [0, -45, 0], [0, 0], 0.5, 21.5],
  ],
  probe: async (ctx) => {
    const { page, H, P } = ctx;
    await H('nd-build', 'door', P.id, true, 'DOOR_base_a');
    // (at the foot of the first tower's spiral, inside it: just before its first tread)
    await page.evaluate((P) => {
      const g = window.__rt.game;
      const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
      const a = ((244 - 16.4) * Math.PI) / 180;
      const u = -34.95 + 0.95 * Math.cos(a), v = -(0.95 * Math.sin(a));
      g.player.walker.place(P.x + c * u - s * v, P.z + s * u + c * v, 0);
      g.player.walker.y = P.y + 0.42;
      for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
    }, P);
    // (up it: kept walking round it anticlockwise, 0.95 m off its column)
    await page.keyboard.down('KeyW');
    let res = { y: 0 };
    let t = 0;
    let shot = false;
    for (; t < 75; t += 0.5) {
      res = await page.evaluate((P) => {
        const g = window.__rt.game;
        const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
        for (let n = 0; n < 5; n++) {
          const w = g.player.walker;
          const dx = w.x - P.x, dz = w.z - P.z;
          const u = c * dx + s * dz, v = -s * dx + c * dz;
          const X = u + 34.95, Y = -v;
          const r = Math.hypot(X, Y), ph = Math.atan2(Y, X);
          const bx = -Math.sin(ph) + 1.6 * (0.95 - r) * Math.cos(ph);
          const by = Math.cos(ph) + 1.6 * (0.95 - r) * Math.sin(ph);
          const du = bx, dv = -by;
          g.input.lookYaw = Math.atan2(s * du + c * dv, c * du - s * dv);
          g.input.lookPitch = 0.2;
          for (let k = 0; k < 6; k++) g.step(1 / 60, 1);
        }
        return { y: g.player.walker.y - P.y };
      }, P);
      if (!shot && res.y > 18) {
        await page.evaluate(() => { const g = window.__rt.game; g.input.lookPitch = 0.6; g.input.lookYaw -= 0.7; g.step(1 / 60, 1); });
        shot = true;
        await page.evaluate(() => window.__rt.render());
        await page.screenshot({ path: path.join(out, '92b_climbing_its_spiral.png') });
        console.log('shot 92b_climbing_its_spiral.png');
      }
      if (res.y > 49.85) break;
    }
    await page.keyboard.up('KeyW');
    console.log(`climbed to ${res.y.toFixed(2)} m in ${(t + 0.5).toFixed(1)} s`);
    check(res.y > 49.85, `up the 274 treads of its spiral to its head (${res.y.toFixed(2)} m in ${(t + 0.5).toFixed(0)} s)`);
    // (on the nacelle's floor behind the tower's head: held up by it)
    const y = await page.evaluate((P) => {
      const g = window.__rt.game;
      const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
      const u = -34.95 + 1.5, v = -(-3.2);
      g.player.walker.place(P.x + c * u - s * v, P.z + s * u + c * v, 0);
      g.player.walker.y = P.y + 50.1;
      for (let i = 0; i < 40; i++) g.step(1 / 60, 1);
      return g.player.walker.y - P.y;
    }, P);
    check(Math.abs(y - 50.03) < 0.1, `standing in its nacelle (${y.toFixed(2)} m)`);
  },
};
PLACES.factory1 = {
  open: ['DOOR_main', 'DOOR_roof'],
  views: [
    ['80_bigworks_from_the_road.png', [0, -24, 0], [0, 0], 0.25, 15.5],
    ['81_its_dock.png', [2.0, -9.0, 0], [3.0, -3.16], 0.02, 15.5],
    ['82_its_hall.png', [6.0, -1.8, 1.02], [-4.0, 4.0], 0.15, 15.5],
    ['83_up_its_stair.png', [8.2, 6.9, 4.92], [1.5, 6.3], 0.25, 15.5],
    ['84_from_its_gallery.png', [-3.0, 7.5, 8.8], [6.0, -1.0], -0.3, 15.5],
    ['85_on_its_roof.png', [-7.0, -1.0, 12.72], [3.0, 6.5], -0.1, 15.5],
    ['86_its_lamps_at_night.png', [2, -16, 0], [2, -3.16], 0.1, 21.5],
  ],
  probe: async (ctx) => {
    const { walk, H, P } = ctx;
    const a = await walk([9.6, -4.3], [5.0, -4.3], 0.0, 3);
    check(Math.abs(a.y - 1.02) < 0.1, `up the dock's steps (${a.y.toFixed(2)} m)`);
    const b = await walk([0.8, 7.5], [9.0, 7.5], 1.02, 4.5);
    check(Math.abs(b.y - 4.92) < 0.12, `up its first flight to the landing (${b.y.toFixed(2)} m)`);
    const c = await walk([8.2, 6.3], [-1.0, 6.3], 4.92, 4.5);
    check(Math.abs(c.y - 8.8) < 0.12, `up the second to the gallery (${c.y.toFixed(2)} m)`);
    const d = await walk([0.8, 7.5], [9.0, 7.5], 8.8, 4.5);
    check(Math.abs(d.y - 12.72) < 0.12, `up the third into its housing on the roof (${d.y.toFixed(2)} m)`);
    await H('nd-build', 'door', P.id, true, 'DOOR_roof');
    const e = await walk([8.07, 6.6], [8.07, 2.0], 12.72, 2.5);
    const ev = -(-Math.sin(P.yaw) * (e.x - P.x) + Math.cos(P.yaw) * (e.z - P.z));
    check(Math.abs(e.y - 12.72) < 0.12 && ev > -5.2, `out of its door onto the roof (${e.y.toFixed(2)} m, y ${ev.toFixed(2)})`);
    const f = await walk([-6.65, 7.5], [-6.65, 2.0], 8.8, 3);
    check(Math.abs(f.y - 7.04) < 0.12, `down from the gallery onto the mezzanine (${f.y.toFixed(2)} m)`);
  },
};
PLACES.factory3 = {
  open: ['DOOR_main'],
  views: [
    ['70_works_from_the_road.png', [2, -20, 0], [0, -2], 0.3, 15.5],
    ['71_its_ground_floor.png', [3.0, -5.6, 0], [-3.0, -1.5], -0.1, 15.5],
    ['72_up_its_stair.png', [-5.1, 1.55, 3.42], [-1.5, 2.6], -0.3, 15.5],
    ['73_its_top_floor.png', [4.6, -5.6, 6.83], [-3.0, 0.0], 0.05, 15.5],
    ['74_its_lamp_at_night.png', [1.5, -12, 0], [1.5, -6.7], 0.1, 21.5],
  ],
  probe: async (ctx) => {
    const { walk } = ctx;
    // (a storey's two flights: up along the back wall to the landing, round, back up beside it to the floor)
    const a = await walk([-5.0, 2.65], [-1.0, 2.65], 0.0, 3);
    check(Math.abs(a.y - 1.8) < 0.12, `up its first flight to the landing (${a.y.toFixed(2)} m)`);
    const b = await walk([-1.8, 1.55], [-6.0, 1.55], 1.8, 3.5);
    check(Math.abs(b.y - 3.42) < 0.12, `round and up the second to the first floor (${b.y.toFixed(2)} m)`);
    const c = await walk([-5.0, 2.65], [-1.0, 2.65], 3.42, 3);
    const d = await walk([-1.8, 1.55], [-6.0, 1.55], c.y, 3.5);
    check(Math.abs(d.y - 6.83) < 0.12, `and up again to the top floor (${d.y.toFixed(2)} m)`);
  },
};

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
    check(things.length >= 6, `${prefab}: furnished (${things.length} things)`);
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
