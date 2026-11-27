// F3 (docs/V3/plan/finish.md §四.2), in the game: nothing strands one. The Sugar Cube on the road —
//   on its roof with one in it: on its wheels again after five seconds; with one on foot far off and looking at it it
//   stays as it lies, and is righted when one comes near, or looks away;
//   dropped through the ground: back on the road at once, in its lane, at rest;
//   two wheels hanging over a hole, all but still: towed back to the road after five seconds;
//   on ice, the throttle held and no way made: towed after eight — but not held back by its own handbrake;
//   in the water over its axles: towed after two;
//   paused: 把车放回路上 puts it on the road by one, 回到上次睡觉的地方 goes back to where one last slept;
//   a dry radiator: the big bottle of drinking water held to its cap pours in with the left button (and is still drunk
//   from with the right).
//   SHOTS_GPU=1 node harness/shots/f3_rescue.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f3_rescue');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=8.5&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const sim = (s) => rt('simulate', s);
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  /** the car now: how upright, how far from the road's middle line, how fast, what the screen says */
  const car = () =>
    ev(() => {
      const g = window.__rt.game;
      const v = g.seated ?? g.focus ?? g.vehicles[0];
      const b = new Float64Array(9);
      v.sim.basis(b);
      const pr = { s: 0, d: 0 };
      g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
      return { up: +b[4].toFixed(3), d: +pr.d.toFixed(2), s: +pr.s.toFixed(1), kmh: +v.sim.bodyKmh.toFixed(1), y: +v.sim.py.toFixed(2), x: +v.sim.px.toFixed(1), z: +v.sim.pz.toFixed(1), said: document.querySelector('.mc-toast') && document.querySelector('.mc-toast').style.opacity !== '0' ? document.querySelector('.mc-toast').textContent : '', seated: !!g.seated };
    });
  /** the car turned onto its roof where it stands */
  const onRoof = () =>
    ev(() => {
      const g = window.__rt.game;
      const s = (g.seated ?? g.focus ?? g.vehicles[0]).sim;
      const { qx, qy, qz, qw } = s;
      s.qx = s.pqx = qw;
      s.qy = s.pqy = qz;
      s.qz = s.pqz = -qy;
      s.qw = s.pqw = -qx;
      s.py += 0.9;
      s.ppy = s.py;
      s.vx = s.vy = s.vz = 0;
      s.avx = s.avy = s.avz = 0;
    });
  await sim(1);
  await ev(() => window.__rt.game.seated.sim.setParkBrake(true));
  const c0 = await car();
  ok(c0.seated && c0.up > 0.98 && Math.abs(c0.d) < 4, `in the Sugar Cube on the road (${JSON.stringify(c0)})`);

  // ---- 1. on its roof, with one in it
  await onRoof();
  await sim(3);
  let c = await car();
  ok(c.up < -0.5, `turned onto its roof: three seconds on it lies there still (up ${c.up})`);
  await shot('01_on_its_roof.png');
  await sim(3.5);
  c = await car();
  ok(c.up > 0.95 && /扶正/.test(c.said), `five seconds: on its wheels again where it lay (up ${c.up}, ${c.said})`);

  // ---- 2. on its roof, one on foot: far off and looking at it it stays; near, it is righted; out of sight, it is righted
  await rt('exit');
  const stand = async (dist, look) =>
    ev(({ dist, look }) => {
      const g = window.__rt.game;
      const v = g.focus;
      const w = g.player.walker;
      const yaw = v.sim.yaw;
      // (out to its left, off the road)
      const x = v.sim.px - Math.sin(yaw) * -dist * 0 + Math.cos(yaw + Math.PI / 2) * dist;
      const z = v.sim.pz - Math.sin(yaw + Math.PI / 2) * dist;
      w.place(x, z, 0, 0);
      const a = w.lookAt(v.sim.px, v.sim.py, v.sim.pz);
      g.input.lookYaw = look ? a.yaw : a.yaw + Math.PI;
      g.input.lookPitch = look ? a.pitch : 0;
      g.viewMode = 'cockpit';
      g.simulate(0);
      window.__rt.render();
      return { dist: Math.hypot(w.x - v.sim.px, w.z - v.sim.pz) };
    }, { dist, look });
  await sim(0.5);
  let at = await stand(26, true);
  await onRoof();
  await sim(7);
  await ev(() => window.__rt.render());
  c = await car();
  ok(c.up < -0.5, `on foot ${at.dist.toFixed(0)} m off and looking at it: seven seconds, it lies as it fell (up ${c.up})`);
  await shot('02_seen_from_afar.png');
  at = await stand(7, true);
  await sim(0.4);
  c = await car();
  ok(c.up > 0.95 && /扶正/.test(c.said), `come within ten metres (${at.dist.toFixed(0)} m): righted (up ${c.up})`);
  at = await stand(26, false);
  await onRoof();
  await sim(6);
  c = await car();
  ok(c.up > 0.95, `${at.dist.toFixed(0)} m off with one's back to it: righted after five seconds (up ${c.up})`);

  // ---- 3. through the ground
  await rt('enter', 0);
  await sim(0.3);
  await ev(() => {
    const s = window.__rt.game.seated.sim;
    // (off to the side of the road, and down through it)
    s.pz += 22;
    s.ppz = s.pz;
    s.py -= 30;
    s.ppy = s.py;
  });
  await sim(0.2);
  c = await car();
  ok(c.up > 0.95 && Math.abs(c.d) < 2.2 && Math.abs(c.d) > 1 && c.kmh < 2 && /拖回了路上/.test(c.said), `dropped through the ground beside the road: back in its lane at once (${JSON.stringify(c)})`);
  await shot('03_back_on_the_road.png');

  // ---- 4. hung up: set down off the road on a level plate, the ground gone from under its left wheels
  await sim(3);
  const hung = await ev(() => {
    const g = window.__rt.game;
    const s = g.seated.sim;
    const real = g.ground;
    const yaw = s.yaw;
    // (14 m out to its left; the car's left on the plan is (−sin yaw, −cos yaw): a pit under everything further left
    // of its middle than 5 cm — it was 25 cm, and once the Sugar Cube's seats sat 3 cm lower (docs/V3/plan/finish.md
    // §18, the driver's eye) it rested there on three wheels, its front left one on the pit's edge: not hung up)
    const lx = -Math.sin(yaw);
    const lz = -Math.cos(yaw);
    const cx = s.px + Math.cos(yaw + Math.PI / 2) * 14;
    const cz = s.pz - Math.sin(yaw + Math.PI / 2) * 14;
    const gs = { h: 0, nx: 0, ny: 1, nz: 0, mu: 1, rr: 0, surface: 0 };
    real.sample(cx, cz, gs);
    const h0 = gs.h;
    window.__real = real;
    g.ground = {
      sample(x, z, o) {
        real.sample(x, z, o);
        if (Math.hypot(x - cx, z - cz) < 7) {
          o.h = (x - cx) * lx + (z - cz) * lz > 0.05 ? h0 - 3 : h0;
          o.nx = 0;
          o.ny = 1;
          o.nz = 0;
        }
      },
    };
    s.reset(cx, h0 + 0.05, cz, yaw, g.ground);
    g.seated.sys.bind(s);
    g.simulate(2.5);
    return { off: s.wheels.filter((w) => !w.contact).length, kmh: s.bodyKmh };
  });
  c = await car();
  // (it rocks on the edge at first: a wheel or three in the air from one moment to the next)
  ok(hung.off >= 1 && Math.abs(c.d) > 10 && !c.said, `the ground gone from under its left wheels, ${Math.abs(c.d).toFixed(0)} m off the road: ${hung.off} wheels in the air, ${hung.kmh.toFixed(1)} km/h`);
  await shot('04_hung_up.png');
  // (it rocks a moment on the edge before it lies still: five seconds from then)
  let waited = 0;
  for (; waited < 9; waited += 0.5) {
    await sim(0.5);
    c = await car();
    if (/拖回了路上/.test(c.said)) break;
  }
  await ev(() => (window.__rt.game.ground = window.__real));
  await sim(0.3);
  c = await car();
  ok(c.up > 0.95 && Math.abs(c.d) < 2.2 && /拖回了路上/.test(c.said) && waited >= 2 && waited <= 7, `hung up and still five seconds (${waited.toFixed(1)} s on): towed back to the road (${JSON.stringify(c)})`);

  // ---- 5. on ice, the throttle held; and held back by its own handbrake (that is not being stuck)
  await sim(3);
  const before = await car();
  await ev(() => {
    const s = window.__rt.game.seated.sim;
    s.setParkBrake(true);
  });
  await page.keyboard.down('KeyW');
  await sim(9.5);
  c = await car();
  ok(Math.hypot(c.x - before.x, c.z - before.z) < 1 && !/拖回/.test(c.said), `the throttle held nine seconds against its own handbrake: left where it is (${c.said || 'nothing said'})`);
  await page.keyboard.up('KeyW');
  await sim(0.5);
  await ev(() => {
    const g = window.__rt.game;
    const s = g.seated.sim;
    s.setParkBrake(false);
    // (off the road first, so that being put back shows: 14 m out to its left — and there a sheet of ice, level, with no
    // grip for the tyres at all: its wheels spin and it goes nowhere)
    const yaw = s.yaw;
    const x = s.px + Math.cos(yaw + Math.PI / 2) * 14;
    const z = s.pz - Math.sin(yaw + Math.PI / 2) * 14;
    const real = g.ground;
    const gs = { h: 0, nx: 0, ny: 1, nz: 0, mu: 1, rr: 0, surface: 0 };
    real.sample(x, z, gs);
    const h0 = gs.h;
    window.__real = real;
    g.ground = {
      sample(px, pz, o) {
        real.sample(px, pz, o);
        if (Math.hypot(px - x, pz - z) < 9) {
          o.h = h0;
          o.nx = 0;
          o.ny = 1;
          o.nz = 0;
          o.mu = 0.0003;
        }
      },
    };
    s.reset(x, h0 + 0.05, z, yaw, g.ground);
    g.seated.sys.bind(s);
    s.setParkBrake(false);
  });
  await sim(1);
  const iced = await car();
  await page.keyboard.down('KeyW');
  await sim(7);
  c = await car();
  ok(Math.hypot(c.x - iced.x, c.z - iced.z) < 1.5 && !/拖回/.test(c.said), `on ice, the throttle held seven seconds: spinning its wheels where it is (${Math.hypot(c.x - iced.x, c.z - iced.z).toFixed(2)} m)`);
  await sim(1.5);
  await page.keyboard.up('KeyW');
  await ev(() => (window.__rt.game.ground = window.__real));
  c = await car();
  ok(Math.abs(iced.d) > 10 && Math.abs(c.d) < 2.2 && /拖回了路上/.test(c.said), `eight seconds: towed back to the road from ${Math.abs(iced.d).toFixed(0)} m off it (${JSON.stringify(c)})`);

  // ---- 6. in the water over its axles
  const water = await ev(async () => {
    const g = window.__rt.game;
    const W = await import('/src/game/modcar/v3/fishing/water.ts');
    const S = await import('/src/core/world/spine.ts');
    const st = new S.SpineSample();
    for (let s = 300; s < 9000; s += 25) {
      g.world.spine.at(s, st);
      for (const side of [-1, 1]) {
        for (let d = 14; d < 90; d += 6) {
          const x = st.x - Math.sin(st.phi) * d * side;
          const z = st.z + Math.cos(st.phi) * d * side;
          const depth = W.waterDepth(g.world, x, z);
          if (depth > 0.9 && depth < 3) return { s, x, z, depth };
        }
      }
    }
    return null;
  });
  if (!water) fail('no water within 9 km of the road to drive into');
  else {
    await ev((s) => window.__rt.game.teleport(s, false), water.s);
    await sim(1.5);
    const wet = await ev((w) => {
      const g = window.__rt.game;
      const s = g.seated.sim;
      g.worldView?.update(w.x, w.z, 60);
      const gs = { h: 0, nx: 0, ny: 1, nz: 0, mu: 1, rr: 0, surface: 0 };
      g.ground.sample(w.x, w.z, gs);
      s.reset(w.x, gs.h + 0.1, w.z, s.yaw, g.ground);
      g.seated.sys.bind(s);
      g.simulate(1.2);
      return { ground: gs.h, y: s.py };
    }, water);
    c = await car();
    ok(Math.abs(c.d) > 10 && !/拖回/.test(c.said), `driven into ${water.depth.toFixed(1)} m of water ${Math.abs(c.d).toFixed(0)} m from the road: a second in, still there (ground ${wet.ground.toFixed(2)}, car ${wet.y.toFixed(2)})`);
    await shot('06_in_the_water.png');
    await sim(1.5);
    c = await car();
    ok(Math.abs(c.d) < 2.2 && c.up > 0.95 && /拖回了路上/.test(c.said), `two seconds in the water: towed back to the road (${JSON.stringify(c)})`);
  }

  // ---- 7. paused: the two ways out
  await sim(3);
  // (a sleep in the seat here: this is where one last slept)
  await ev(() => {
    const g = window.__rt.game;
    g.seated.sys.stop?.();
    g.seated.sim.setParkBrake(true);
    g.body.energy = 12;
  });
  await sim(1);
  const slept = await ev(() => {
    const g = window.__rt.game;
    if (g.seated.sys.running) g.seated.sys.ignition?.(false);
    // (the right button held in the seat: sleep, as on 11-24)
    g.rightButton = true;
    for (let t = 0; t < 1.3; t += 1 / 60) g.step(1 / 60, 1);
    g.rightButton = false;
    g.simulate(4);
    return { energy: g.body.energy, can: g.canBackToBed(), running: g.seated.sys.running };
  });
  const bedAt = (await car()).s;
  ok(slept.energy === 100 && slept.can, `slept in the seat at ${bedAt.toFixed(0)} m along the road (${JSON.stringify(slept)})`);
  await ev((s) => window.__rt.game.teleport(s, false), bedAt + 900);
  await sim(2);
  // on foot, the car left 60 m off the road: 把车放回路上 brings it to the road by one
  await rt('exit');
  await sim(0.3);
  await ev(() => {
    const g = window.__rt.game;
    const s = g.focus.sim;
    const yaw = s.yaw;
    const gs = { h: 0, nx: 0, ny: 1, nz: 0, mu: 1, rr: 0, surface: 0 };
    const x = s.px + Math.cos(yaw + Math.PI / 2) * 60;
    const z = s.pz - Math.sin(yaw + Math.PI / 2) * 60;
    g.ground.sample(x, z, gs);
    s.reset(x, gs.h + 0.1, z, yaw, g.ground);
    g.focus.sys.bind(s);
    g.simulate(0.5);
  });
  const lost = await car();
  await rt('menu', 'pause');
  const outs = await ev(() => [...document.querySelectorAll('.mc-menu [data-act=unstick], .mc-menu [data-act=bed]')].map((e) => e.textContent));
  ok(outs.join('|') === '把车放回路上|回到上次睡觉的地方', `paused: the two ways out (${outs.join(' · ')})`);
  await shot('07_paused.png');
  await page.click('.mc-menu [data-act=unstick]');
  await sim(0.5);
  c = await car();
  const me = await ev(() => {
    const g = window.__rt.game;
    const w = g.player.walker;
    return { d: Math.hypot(w.x - g.focus.sim.px, w.z - g.focus.sim.pz), open: g.menu.isOpen };
  });
  ok(Math.abs(lost.d) > 40 && Math.abs(c.d) < 2.2 && me.d < 15 && !me.open && /放回了路上/.test(c.said), `把车放回路上: the car from ${Math.abs(lost.d).toFixed(0)} m off onto the road ${me.d.toFixed(0)} m from one (${c.said})`);
  await rt('menu', 'pause');
  await page.click('.mc-menu [data-act=bed]');
  await sim(1);
  c = await car();
  ok(Math.abs(c.s - bedAt) < 15 && Math.abs(c.d) < 4, `回到上次睡觉的地方: the car at ${c.s.toFixed(0)} m, where one slept (${bedAt.toFixed(0)} m)`);
  await shot('08_back_where_one_slept.png');

  // ---- 8. a dry radiator, and only drinking water to hand
  await rt('exit');
  await sim(0.3);
  await rt('openPanel', 0, 'hood', true);
  await ev(() => {
    const g = window.__rt.game;
    g.player.slots.fill(null);
    g.vehicles[0].build.parts.radiator.fluids.coolantL = 0;
    g.body.water = 40;
  });
  await rt('hold', 'item:drink_water');
  const aimed = await rt('aimFiller', 0, 'water', 0.85);
  await sim(0.2);
  const tel = await rt('telemetry');
  const line = await ev(() => [...document.querySelectorAll('.mc-acts .act, .mc-keys .row, .mc-acts div')].map((e) => e.textContent).join(' | '));
  ok(aimed && String(tel.target).startsWith('filler:') && /加水/.test(line) && !/抽回/.test(line), `the bottle of water at the radiator's cap: the mark is on ${tel.target} (${line.slice(0, 60)})`);
  await ev(() => {
    const g = window.__rt.game;
    g.mouseDown(0);
    // (a second of it: some goes in, some is left to drink)
    for (let i = 0; i < 60 && (g.player.held?.item?.litres ?? 0) > 0.9; i++) {
      g.step(1 / 60, 1);
    }
    g.mouseUp(0);
    g.simulate(0.3);
  });
  await shot('09_water_into_the_radiator.png');
  const poured = await ev(() => {
    const g = window.__rt.game;
    return { radiator: g.vehicles[0].build.parts.radiator.fluids.coolantL ?? 0, bottle: g.player.held?.item?.litres ?? -1, said: document.querySelector('.mc-toast')?.textContent ?? '' };
  });
  ok(poured.radiator > 0.5 && poured.bottle > 0.3 && Math.abs(poured.radiator + poured.bottle - 2) < 0.02, `the left button held: ${poured.radiator.toFixed(2)} L into the radiator, ${poured.bottle.toFixed(2)} L left in the bottle (${poured.said})`);
  // (and the right button still drinks from it)
  await ev(() => {
    const g = window.__rt.game;
    g.input.lookPitch = 0.3;
    g.simulate(0.1);
    g.rightButton = true;
    for (let t = 0; t < 2; t += 1 / 60) g.step(1 / 60, 1);
    g.rightButton = false;
    g.simulate(5.5);
  });
  const drunk = await ev(() => ({ water: window.__rt.game.body.water, bottle: window.__rt.game.player.held?.item?.litres ?? -1 }));
  ok(drunk.water > 45 && drunk.bottle < poured.bottle - 0.1, `the right button: drunk from (water 40 → ${drunk.water.toFixed(0)}, ${drunk.bottle.toFixed(2)} L left)`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  server.close?.();
}
console.log(bad ? `f3_rescue: ${bad} FAILED` : 'f3_rescue ok');
process.exit(bad ? 1 : 0);
