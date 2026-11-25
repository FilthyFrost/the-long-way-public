// J9e (docs/V3/plan/growth.md §六 2), in the game: the ladder and the motorcycle rack, Nomad Drive's way.
//   The ladder: its blueprint held to the Sugar Cube — 长按 装上 梯子 — fits a ladder up its right side; walked into
//   facing it, it is taken hold of and climbed (the ND climbing), one is drawn onto the roof and stands there (the roof
//   rack's slats under the feet), takes the box of components off the rack and puts it back with Q, walks about, is
//   offered no 上车 up there; with one's back to the ladder at its head, walking on takes hold of it from above, S goes
//   down, one is on the ground again. The Whale's own ladder up its back climbed too.
//   The motorcycle rack: its blueprint at the car's back — 长按 装上 摩托车架 — puts a rack in the hitch's place; the
//   Swallow ridden up beside it, 长按 装上 燕子 lifts it onto the tray across the back; it cannot be got on there; the car
//   driven 14 s and round a bend, the Swallow stays on the tray (its pose against the car's not moving); 长按 卸下 燕子
//   puts it down standing beside the car on its side stand.
//   SHOTS_GPU=1 node harness/shots/j9e_ladder_moto.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j9e');
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
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
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
    console.log('shot', f);
  };
  const said = () => page.evaluate(() => document.body.innerText);
  const lines = async (re) => (await said()).split('\n').filter((l) => re.test(l)).join(' · ');
  const vi = await page.evaluate(() => window.__rt.game.vehicles.findIndex((v) => v.build.frame === 'sedan'));
  ok(vi >= 0, `the Sugar Cube by the road (${vi})`);
  ok(await page.evaluate((i) => !window.__rt.game.vehicles[i].build.parts.ladder, vi), 'no ladder on it');

  // ---------------------------------------------------------------- the ladder: its sheet learnt, the ladder fitted by hand
  // (docs/V3/plan/finish.md §六 2: a sheet is learnt with the right button; what it makes is a part like any other)
  await rt('aim', vi, 'ladder', 1.7);
  await rt('hold', 'item:bp_ladder');
  await rt('simulate', 0.2);
  ok(/学会\s*梯子/.test(await said()), `the sheet in the hands: 学会 梯子 (${await lines(/学会/)})`);
  await shot('01_ladder_blueprint.png');
  let tel = await rt('rightFor', 0.15);
  ok(tel.held === '' && (await page.evaluate(() => window.__rt.game.learned.has('ladder'))), `the right button: learnt, the sheet used up (${tel.held || 'nothing in the hands'})`);
  await rt('simulate', 0.3);
  ok((await said()).includes('学会了：梯子'), 'said: 学会了：梯子');
  // the ladder itself, as the bench makes it: held to the car's side, the left button held
  await rt('hold', 'ladder');
  // (its model, and its ghost's with it, comes in over a moment of real time)
  for (let tries = 0; tries < 12; tries++) {
    await page.waitForTimeout(400);
    await rt('aim', vi, 'ladder', 1.7);
    await rt('simulate', 0.2);
    if ((await rt('telemetry')).target.includes(':ladder:')) break;
  }
  ok(/装上\s*梯子/.test(await said()), `the ladder held to the car: 长按 装上 梯子 (${await lines(/装上/)})`);
  tel = await rt('useFor', 3);
  const ladder = await page.evaluate((i) => window.__rt.game.vehicles[i].build.parts.ladder?.part ?? null, vi);
  ok(ladder === 'ladder' && tel.held === '', `the left button held: a ladder up its side (${ladder}), out of the hands`);
  await rt('simulate', 0.3);
  // (where there is no place for one: the motorcycle has no roof to go up to, the Whale has its own ladder; the
  // motorcycle takes no rack behind it either)
  const places = await page.evaluate(async () => {
    const F = await import('/src/core/modcar/frames.ts');
    const L = await import('/src/core/modcar/ladders.ts');
    const has = (frame, cat) => F.frameDef(frame).mounts.some((m) => m.cat === cat);
    return { car: has('sedan', 'ladder'), moto: has('moto', 'ladder'), rv: has('rv', 'ladder'), rvOwn: !!L.ladderSpot('rv')?.builtin, motoHitch: has('moto', 'hitch') };
  });
  ok(places.car && !places.moto && !places.rv && places.rvOwn && !places.motoHitch, `where a ladder goes: ${JSON.stringify(places)}`);
  await page.evaluate(() => { window.__rt.game.player.held = null; });
  // (a rack on its roof and a box of components on the rack: what one goes up there for)  await page.evaluate(() => { window.__rt.game.player.held = null; });
  // (a rack on its roof and a box of components on the rack: what one goes up there for)
  const boxUp = await page.evaluate(async (i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const Bu = await import('/src/core/modcar/build.ts');
    Bu.fitPart(v.build, 'roof', Bu.newInstance('roof_rack'));
    v.changed();
    g.cargo.invalidate(v);
    const It = await import('/src/core/modcar/items.ts');
    const held = { kind: 'item', item: It.newItem('crate_parts') };
    await g.loose.objectFor(held);
    await new Promise((r) => setTimeout(r, 0));
    g.simulate(0.2);
    const at = g.cargo.spotIn(v, 'roof', held, { x: -0.55, z: -0.15 });
    if (!at) return null;
    g.cargo.stow(v, at.zone, at.spot, held);
    return { y: +at.spot.y.toFixed(3) };
  }, vi);
  ok(!!boxUp, `a rack on the roof and a box of components on it (${JSON.stringify(boxUp)})`);
  await rt('setOrbit', 118, 16, 6.5, 1.2, vi);
  await shot('02_ladder_fitted.png');
  await rt('setView', 'cockpit');

  // ---------------------------------------------------------------- climbed: up onto the roof
  const lad = await H('ladder', 'ladder', vi);
  ok(!!lad, `its ladder to climb: foot ${lad?.foot.map((x) => x.toFixed(2)).join(', ')}, head ${lad?.head.map((x) => x.toFixed(2)).join(', ')}`);
  // (on the ground 0.6 m out in front of its line, facing it)
  await page.evaluate((l) => {
    const fx = Math.cos(l.face);
    const fz = Math.sin(l.face);
    window.__rt.stand(l.foot[0] - fx * 0.6, l.foot[2] - fz * 0.6, l.face, 0.1);
  }, lad);
  await step(4);
  await page.keyboard.down('KeyW');
  await step(30);
  let st = await H('nd-climb', 'state');
  ok((st.phase === 'on' || st.phase === 'grab') && String(st.key).startsWith('veh:'), `walked into it facing it: taken hold of (${JSON.stringify(st)})`);
  await step(14);
  // (half way up, looking down over the roof's edge at the rack)
  await page.evaluate(() => { window.__rt.game.input.lookPitch = -0.5; });
  await step(2);
  await shot('03_climbing.png');
  await page.evaluate(() => { window.__rt.game.input.lookPitch = 0; });
  let t = 0;
  for (; t < 6; t += 0.25) {
    await step(15);
    st = await H('nd-climb', 'state');
    if (!st.phase) break;
  }
  await step(10);
  await page.keyboard.up('KeyW');
  await step(20);
  let up = await H('ladder', 'state');
  const floors = await H('ladder', 'floors', vi);
  console.log('up there', JSON.stringify(up), 'floors', JSON.stringify(floors));
  ok(up.up === 'sedan' && up.onFloor && String(up.floorTag).startsWith('modcar:sedan') && up.floor !== null && Math.abs(up.feet[1] - up.floor) < 0.03, `up its ladder in ${(t + 0.75).toFixed(1)} s: standing on its roof, on the rack's slats (feet ${up.feet?.[1]} m, the floor ${up.floor?.toFixed(3)} m)`);
  ok(st.rungs >= 1, `the rungs heard (${st.rungs})`);
  // (looking along the roof to the front, the box on the rack at one's feet)
  await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    g.input.lookYaw = Math.atan2(-Math.sin(v.sim.yaw), Math.cos(v.sim.yaw)) + 0.35;
    g.input.lookPitch = -0.55;
  }, vi);
  await step(3);
  await shot('04_on_the_roof.png');
  // walked about up there: a step forward along the roof and back
  const before = await page.evaluate(() => { const w = window.__rt.game.player.walker; return { x: w.x, z: w.z }; });
  await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    g.input.lookYaw = Math.atan2(-Math.sin(v.sim.yaw), Math.cos(v.sim.yaw));
    g.input.lookPitch = -0.2;
  }, vi);
  await page.keyboard.down('KeyW');
  await step(14);
  await page.keyboard.up('KeyW');
  await step(10);
  up = await H('ladder', 'state');
  const walked = await page.evaluate((b) => { const w = window.__rt.game.player.walker; return Math.hypot(w.x - b.x, w.z - b.z); }, before);
  ok(up.up === 'sedan' && up.onFloor && walked > 0.2, `walked ${walked.toFixed(2)} m along the roof, still up there (feet ${up.feet?.[1]} m)`);
  // the box on the rack, in reach: taken up, put back with Q
  const aimBox = await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const l = g.cargo.ridersOf(v).find((x) => x.stow === 'roof');
    if (!l) return null;
    const w = g.player.walker;
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(l.x, l.y + 0.1, l.z));
    g.simulate(0);
    return String(g.player.telemetry().target);
  }, vi);
  const offered = await lines(/拿|捡|取/);
  ok(!!aimBox && /loose/.test(aimBox), `the box on the rack at one's feet: ${aimBox} (${offered || '—'})`);
  await shot('05_box_on_the_rack.png');
  tel = await rt('press');
  await rt('simulate', 0.2);
  ok(/crate_parts/.test(String(tel.held)), `taken up off the rack from up there (in the hands: ${tel.held || '—'})`);
  await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    const m = v.view.model;
    m.updateMatrixWorld(true);
    const o = g.core.origin;
    const p = m.position.clone().set(-0.6, 1.5, 0.1);
    m.localToWorld(p);
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(p.x + o.x, p.y + o.y, p.z + o.z));
    g.simulate(0);
  }, vi);
  await page.evaluate(() => window.__rt.game.player.drop());
  await rt('simulate', 0.3);
  const back = await rt('stowed', vi);
  ok(back.things.some((x) => x.zone === 'roof' && /crate_parts/.test(x.what)), `Q: put back on the rack (${JSON.stringify(back.things)})`);
  // (no 上车 up there: looking down at the car's body)
  const noEnter = await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    g.input.lookYaw = Math.atan2(v.sim.pz - w.z, v.sim.px - w.x);
    g.input.lookPitch = -1.2;
    g.simulate(0);
    return { target: String(g.player.telemetry().target), onRoof: g.player.onRoof?.build.frame ?? null };
  }, vi);
  const enterWords = await lines(/上车/);
  ok(noEnter.onRoof === 'sedan' && !/enter/.test(noEnter.target) && !enterWords, `up there no 上车 on its body (the mark on ${noEnter.target}; ${enterWords || 'no 上车'})`);

  // ---------------------------------------------------------------- down again: from above, with one's back to it
  await page.evaluate((l) => {
    const g = window.__rt.game;
    // (back to the ladder: facing out over the edge it is at)
    g.input.lookYaw = l.face + Math.PI;
    g.input.lookPitch = -0.3;
  }, lad);
  // (to the roof's edge by the ladder's head first: where one was let go is a little in from it)
  await page.evaluate(({ l, i }) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    // (along the roof towards the ladder's head: its x in the car's terms)
    const m = v.view.model;
    m.updateMatrixWorld(true);
    const o = g.core.origin;
    const p = m.position.clone().set(-0.9, 1.6, 0.3);
    m.localToWorld(p);
    w.x = p.x + o.x;
    w.z = p.z + o.z;
    g.input.lookYaw = l.face + Math.PI;
  }, { l: lad, i: vi });
  await step(4);
  await page.keyboard.down('KeyW');
  let took = null;
  for (let k = 0; k < 40 && !took; k++) {
    await step(3);
    const s = await H('nd-climb', 'state');
    if (s.phase) took = s;
  }
  await page.keyboard.up('KeyW');
  ok(!!took && String(took.key).startsWith('veh:'), `at its head with one's back to it, walking on: taken hold of from above (${JSON.stringify(took)})`);
  await step(20);
  await page.keyboard.down('KeyS');
  for (t = 0; t < 6; t += 0.25) {
    await step(15);
    st = await H('nd-climb', 'state');
    if (!st.phase) break;
  }
  await page.keyboard.up('KeyS');
  await step(40);
  up = await H('ladder', 'state');
  const feet = await page.evaluate((i) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    return { y: w.y - g.world.heightAt(w.x, w.z), inside: w.insideSolid(0.02) };
  }, vi);
  ok(!st.phase && !up.up && feet.y < 0.1 && !feet.inside, `down its ladder in ${(t + 0.25).toFixed(1)} s: on the ground beside the car (feet ${feet.y.toFixed(2)} m over it), off its roof`);
  // (where one came down, from a few steps back: the ladder up the car's side)
  await page.evaluate((l) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const fx = Math.cos(l.face);
    const fz = Math.sin(l.face);
    const x = l.foot[0] - fx * 2.6 + fz * 0.9;
    const z = l.foot[2] - fz * 2.6 - fx * 0.9;
    window.__rt.stand(x, z, Math.atan2(l.foot[2] - z, l.foot[0] - x), 0.0);
    void w;
  }, lad);
  await step(3);
  await shot('06_climbed_down.png');
  // (the car's body in the walker's way again: walked at it by its front door — away from the ladder — one stops at its side)
  await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const m = v.view.model;
    m.updateMatrixWorld(true);
    const o = g.core.origin;
    const p = m.position.clone().set(0.4, 0, 1.9);
    m.localToWorld(p);
    const x = p.x + o.x;
    const z = p.z + o.z;
    window.__rt.stand(x, z, Math.atan2(v.sim.pz - z, v.sim.px - x), 0);
  }, vi);
  await page.keyboard.down('KeyW');
  await step(40);
  await page.keyboard.up('KeyW');
  const nearBody = await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const w = g.player.walker;
    return { d: Math.hypot(w.x - v.sim.px, w.z - v.sim.pz), y: w.y - g.world.heightAt(w.x, w.z), inside: w.insideSolid(0.02) };
  }, vi);
  ok(!nearBody.inside && nearBody.y < 0.1 && nearBody.d > 0.8, `walked at the car: kept out of its body (${JSON.stringify(nearBody)})`);

  // ---------------------------------------------------------------- the Whale's own ladder up its back
  const whale = await page.evaluate(async (i) => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const car = g.vehicles[i];
    const yaw = car.sim.yaw;
    // (behind the car on the road, 14 m back)
    const x = car.sim.px - Math.cos(yaw) * 14;
    const z = car.sim.pz + Math.sin(yaw) * 14;
    const rv = g.addVehicle(B.stockBuild('rv'), x, z, yaw);
    await rv.view.ready;
    g.simulate(1);
    return g.vehicles.indexOf(rv);
  }, vi);
  const rvLad = await H('ladder', 'ladder', whale);
  ok(!!rvLad, `the Whale has its own ladder up its back (head ${rvLad?.head.map((x) => x.toFixed(2)).join(', ')})`);
  if (rvLad) {
    await page.evaluate((l) => {
      const fx = Math.cos(l.face);
      const fz = Math.sin(l.face);
      window.__rt.stand(l.foot[0] - fx * 0.6, l.foot[2] - fz * 0.6, l.face, 0.1);
    }, rvLad);
    await step(4);
    await page.keyboard.down('KeyW');
    for (t = 0; t < 7; t += 0.25) {
      await step(15);
      st = await H('nd-climb', 'state');
      if (t > 0.5 && !st.phase) break;
    }
    await step(10);
    await page.keyboard.up('KeyW');
    await step(20);
    up = await H('ladder', 'state');
    ok(up.up === 'rv' && up.onFloor && Math.abs(up.feet[1] - up.floor) < 0.03, `up the Whale's ladder: on its roof, ${up.feet?.[1]} m up`);
    await page.evaluate((i) => {
      const g = window.__rt.game;
      const v = g.vehicles[i];
      g.input.lookYaw = Math.atan2(-Math.sin(v.sim.yaw), Math.cos(v.sim.yaw)) - 0.25;
      g.input.lookPitch = -0.3;
    }, whale);
    await step(3);
    await shot('07_whale_roof.png');
    // (nobody drives it off with one up there — no 上车 from its roof — but rolled along all the same: carried with it
    // at a crawl, put down on the ground beside its ladder once it goes faster than a walk)
    const rolled = await page.evaluate((i) => {
      const g = window.__rt.game;
      const v = g.vehicles[i];
      const w = g.player.walker;
      const fx = Math.cos(v.sim.yaw);
      const fz = -Math.sin(v.sim.yaw);
      v.sim.setParkBrake(false);
      const push = (speed, frames) => {
        const x0 = v.sim.px;
        const z0 = v.sim.pz;
        const wx0 = w.x;
        const wz0 = w.z;
        for (let k = 0; k < frames; k++) {
          v.awake = 3;
          v.sim.vx = fx * speed;
          v.sim.vz = fz * speed;
          g.step(1 / 60, 1);
        }
        return { car: Math.hypot(v.sim.px - x0, v.sim.pz - z0), walker: Math.hypot(w.x - wx0, w.z - wz0), up: g.systems.harness('ladder', 'state').up, kmh: v.sim.kmh };
      };
      const crawl = push(0.8, 45);
      const fast = push(3.2, 40);
      v.sim.vx = v.sim.vz = 0;
      v.sim.setParkBrake(true);
      for (let k = 0; k < 30; k++) g.step(1 / 60, 1);
      return { crawl, fast, feet: w.y - g.world.heightAt(w.x, w.z), inside: w.insideSolid(0.02) };
    }, whale);
    console.log('rolled', JSON.stringify(rolled));
    ok(rolled.crawl.up === 'rv' && rolled.crawl.car > 0.3 && Math.abs(rolled.crawl.walker - rolled.crawl.car) < 0.05, `the Whale rolled at a crawl with one on its roof: carried with it (it went ${rolled.crawl.car.toFixed(2)} m, the feet ${rolled.crawl.walker.toFixed(2)} m)`);
    ok(!rolled.fast.up && Math.abs(rolled.feet) < 0.1 && !rolled.inside, `faster than a walk (${rolled.fast.kmh.toFixed(1)} km/h): put down on the ground beside it (feet ${rolled.feet.toFixed(2)} m over it)`);
  }
  await page.evaluate((i) => { const g = window.__rt.game; g.removeVehicle(g.vehicles[i]); }, whale);

  // ---------------------------------------------------------------- the motorcycle rack: its sheet learnt, the rack fitted by hand
  await rt('hold', 'item:bp_moto_rack');
  await rt('simulate', 0.2);
  ok(/学会\s*摩托车架/.test(await said()), `the sheet in the hands: 学会 摩托车架 (${await lines(/学会/)})`);
  tel = await rt('rightFor', 0.15);
  ok(tel.held === '' && (await page.evaluate(() => window.__rt.game.learned.has('moto_rack'))), 'the right button: learnt, the sheet used up');
  await rt('hold', 'moto_rack');
  // (its model, and its ghost's with it, comes in over a moment of real time)
  for (let tries = 0; tries < 12; tries++) {
    await page.waitForTimeout(400);
    await rt('aim', vi, 'hitch', 1.6);
    await rt('simulate', 0.3);
    if ((await rt('telemetry')).target.includes(':hitch:')) break;
  }
  const hitchAt = (await rt('telemetry')).target;
  ok(hitchAt.includes(':hitch:') && /装上\s*摩托车架/.test(await said()), `the rack held to the car's back: 长按 装上 摩托车架 (${await lines(/装上/)}; the mark on ${hitchAt || 'nothing'})`);
  tel = await rt('useFor', 3);
  const rack = await page.evaluate((i) => window.__rt.game.vehicles[i].build.parts.hitch?.part ?? null, vi);
  ok(rack === 'moto_rack' && tel.held === '', `the left button held: a motorcycle rack in the hitch's place (${rack}), out of the hands`);
  await rt('simulate', 0.3);
  const ball = await page.evaluate(async (i) => {
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    return T.hitchLocal(window.__rt.game.vehicles[i]);
  }, vi);
  ok(ball === null, 'a rack in the hitch’s place: nothing to hitch a trailer to');
  // the Swallow ridden up behind it
  const swallow = await page.evaluate(async (i) => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const car = g.vehicles[i];
    const yaw = car.sim.yaw;
    // (2.6 m behind the car, a little to its left, standing along the road)
    const x = car.sim.px - Math.cos(yaw) * 4.9 - Math.sin(yaw) * 0.9;
    const z = car.sim.pz + Math.sin(yaw) * 4.9 - Math.cos(yaw) * 0.9;
    const m = g.addVehicle(B.stockBuild('moto'), x, z, yaw + 0.2);
    await m.view.ready;
    g.simulate(1.5);
    return { i: g.vehicles.indexOf(m), mass: m.sys.derived.mass, carMass: car.sys.derived.mass };
  }, vi);
  ok(swallow.i >= 0, `the Swallow standing behind the car (${swallow.mass.toFixed(0)} kg)`);
  // at the rack: the word
  const trayAt = await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const h = v.view.frame.mounts.find((m) => m.cat === 'hitch');
    const m = v.view.model;
    m.updateMatrixWorld(true);
    const o = g.core.origin;
    const p = m.position.clone().set(h.pos.x - 0.48, h.pos.y + 0.25, h.pos.z + 0.45);
    m.localToWorld(p);
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, yaw: v.sim.yaw };
  }, vi);
  // (the scene from a few steps back: the rack across the car's back, the Swallow standing beside it)
  await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const yaw = v.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    const x = v.sim.px - fx * 6.4 - fz * 2.6;
    const z = v.sim.pz - fz * 6.4 + fx * 2.6;
    const tx = v.sim.px - fx * 3.0;
    const tz = v.sim.pz - fz * 3.0;
    window.__rt.stand(x, z, Math.atan2(tz - z, tx - x), -0.2);
  }, vi);
  await step(3);
  await shot('08_rack_and_swallow.png');
  // (standing behind the car's right, looking at the tray)
  await rt('aimPoint', trayAt.x, trayAt.y, trayAt.z, Math.atan2(Math.sin(trayAt.yaw) - Math.cos(trayAt.yaw) * 0.6, -Math.cos(trayAt.yaw) - Math.sin(trayAt.yaw) * 0.6), 1.25);
  await rt('simulate', 0.1);
  const loadWords = await lines(/装上/);
  ok(/装上\s*燕子/.test(loadWords), `at the rack, the Swallow beside it: 长按 装上 燕子 (${loadWords || '—'})`);
  await shot('08b_load_prompt.png');
  await rt('useFor', 1.2);
  await rt('simulate', 0.8);
  let on = await H('moto-rack', 'state', vi);
  const carried = await page.evaluate(({ m, i }) => { const g = window.__rt.game; return { by: g.vehicles[m].carriedBy === g.vehicles[i], mass: g.vehicles[i].sys.derived.mass }; }, { m: swallow.i, i: vi });
  ok(on.moto === swallow.i && on.phase === 'on' && carried.by, `held: the Swallow up on the tray across the back (${JSON.stringify(on)})`);
  ok(carried.mass > swallow.carMass + swallow.mass * 0.9, `the car carries its weight (${swallow.carMass.toFixed(0)} → ${carried.mass.toFixed(0)} kg)`);
  ok((await said()).includes('装上了燕子'), 'said: 装上了燕子');
  await rt('setOrbit', 150, 18, 7.5, 1.0, vi);
  await shot('09_swallow_on_the_rack.png');
  await rt('setView', 'cockpit');
  // (it cannot be got on there)
  const ride = await page.evaluate((m) => {
    const g = window.__rt.game;
    g.enter(g.vehicles[m]);
    g.simulate(0.05);
    return { seated: g.seated ? g.vehicles.indexOf(g.seated) : -1 };
  }, swallow.i);
  const why = await lines(/先从车架上卸下来/);
  ok(ride.seated === -1 && !!why, `on the rack it cannot be got on: ${why || '—'}`);

  // ---------------------------------------------------------------- driven off with it, round a bend
  const driveFor = (from, to) =>
    page.evaluate(
      ({ i, m, from, to }) => {
        const g = window.__rt.game;
        const v = g.vehicles[i];
        if (from === 0) {
          g.enter(v);
          v.sim.setParkBrake(false);
          if (!v.sys.running) v.sys.startNow();
          window.__ride = { maxOff: 0, maxRel: 0, rows: [], x0: v.sim.px, z0: v.sim.pz };
        }
        const st = window.__ride;
        const H = (fn, ...a) => g.systems.harness('moto-rack', fn, ...a);
        for (let k = from; k < to; k++) {
          // (an S-bend: left across the narrow road, then right back along it — its fences either side)
          const steer = k > 60 * 4 && k < 60 * 7 ? -0.12 : k >= 60 * 7 && k < 60 * 10 ? 0.12 : 0;
          const stopping = k >= 60 * 12;
          const stopped = stopping && Math.abs(v.sim.kmh) < 1;
          g.scripted = { steer, throttle: stopping ? 0 : 0.4, brake: stopping && !stopped ? 0.6 : 0, handbrake: stopped ? 1 : 0 };
          g.step(1 / 60, 1);
          const sx = H('state', i);
          if (!sx?.moto) continue;
          const off = Math.hypot(sx.at[0] - sx.tray[0], sx.at[1] - sx.tray[1], sx.at[2] - sx.tray[2]);
          st.maxOff = Math.max(st.maxOff, off);
          st.maxRel = Math.max(st.maxRel, Math.abs(Math.abs(sx.rel) - Math.PI / 2));
          if (k % 60 === 0) st.rows.push({ t: k / 60, kmh: +v.sim.kmh.toFixed(1), yaw: +v.sim.yaw.toFixed(2), off: +off.toFixed(4), rel: sx.rel });
        }
        g.scripted = null;
        return { rows: st.rows, maxOff: st.maxOff, maxRel: st.maxRel, went: Math.hypot(v.sim.px - st.x0, v.sim.pz - st.z0), chaseBack: v.chaseBack, carried: g.vehicles[m].carriedBy === v };
      },
      { i: vi, m: swallow.i, from, to },
    );
  await driveFor(0, 60 * 7);
  // (in the bend: from behind and to its left, and as the chase view has it)
  await rt('setOrbit', 215, 16, 8.5, 1.0, vi);
  await shot('10_bend_orbit.png');
  await rt('setView', 'chase');
  await rt('simulate', 0);
  await shot('11_bend_chase.png');
  const drive = await driveFor(60 * 7, 60 * 14);
  for (const r of drive.rows) console.log('  ', JSON.stringify(r));
  ok(drive.went > 20 && drive.carried && drive.maxOff < 0.01 && drive.maxRel < 0.01, `driven ${drive.went.toFixed(0)} m in 14 s round a bend: the Swallow on the tray all the way (at most ${(drive.maxOff * 100).toFixed(2)} cm, ${drive.maxRel.toFixed(4)} rad off its place)`);
  ok(drive.chaseBack > 0.5, `the chase view stands back over it (${drive.chaseBack} m more)`);
  // ---------------------------------------------------------------- put down beside the car
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.seated.sim.setParkBrake(true);
    g.getOut();
    g.simulate(0.3);
  });
  const trayNow = await page.evaluate((i) => {
    const g = window.__rt.game;
    const v = g.vehicles[i];
    const h = v.view.frame.mounts.find((m) => m.cat === 'hitch');
    const m = v.view.model;
    m.updateMatrixWorld(true);
    const o = g.core.origin;
    const p = m.position.clone().set(h.pos.x - 0.48, h.pos.y + 0.6, h.pos.z);
    m.localToWorld(p);
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, yaw: v.sim.yaw };
  }, vi);
  await rt('aimPoint', trayNow.x, trayNow.y, trayNow.z, Math.atan2(Math.sin(trayNow.yaw) - Math.cos(trayNow.yaw) * 0.4, -Math.cos(trayNow.yaw) - Math.sin(trayNow.yaw) * 0.4), 1.5);
  await rt('simulate', 0.1);
  const downWords = await lines(/卸下/);
  ok(/卸下\s*燕子/.test(downWords), `at the Swallow on the rack: 长按 卸下 燕子 (${downWords || '—'})`);
  await rt('useFor', 1.2);
  await rt('simulate', 1.5);
  const down = await page.evaluate(({ i, m }) => {
    const g = window.__rt.game;
    const car = g.vehicles[i];
    const b = g.vehicles[m];
    const s = b.sim;
    const cg = b.sys.derived.cg;
    // (its model's origin under its wheels, against the ground there)
    const oy = s.py - cg.y;
    const gy = g.world.heightAt(s.px, s.pz);
    // (off the car's body: the two boxes apart)
    const sd = car.solid.update();
    const dx = s.px - sd.x;
    const dz = s.pz - sd.z;
    const c = Math.cos(-sd.yaw);
    const sn = Math.sin(-sd.yaw);
    const lx = Math.abs(dx * c - dz * sn) - sd.hx;
    const lz = Math.abs(dx * sn + dz * c) - sd.hz;
    return { carried: !!b.carriedBy, onRack: g.systems.harness('moto-rack', 'state', i)?.moto ?? null, roll: s.roll, pitch: s.pitch, above: oy - gy, clear: Math.max(lx, lz), kmh: s.kmh, carMass: car.sys.derived.mass, stand: b.view.ridden };
  }, { i: vi, m: swallow.i });
  ok(!down.carried && down.onRack === null && !down.stand, `held: put down off the rack (${JSON.stringify(down)})`);
  ok(Math.abs(down.roll) < 0.12 && Math.abs(down.above) < 0.15 && down.clear > 0.2 && down.kmh < 1, `standing beside the car on its side stand: roll ${down.roll.toFixed(3)}, its wheels ${down.above.toFixed(3)} m off the ground, ${down.clear.toFixed(2)} m clear of the car`);
  ok(Math.abs(down.carMass - swallow.carMass) < 1, `the car's weight back as it was (${down.carMass.toFixed(0)} kg)`);
  await page.evaluate(({ i, m }) => {
    const g = window.__rt.game;
    const b = g.vehicles[m];
    const w = g.player.walker;
    const car = g.vehicles[i];
    const yaw = car.sim.yaw;
    const x = b.sim.px - Math.cos(yaw) * 3.5 + Math.sin(yaw) * 2.2;
    const z = b.sim.pz + Math.sin(yaw) * 3.5 + Math.cos(yaw) * 2.2;
    window.__rt.stand(x, z, Math.atan2(b.sim.pz - z, b.sim.px - x), -0.18);
    void w;
  }, { i: vi, m: swallow.i });
  await step(3);
  await shot('12_swallow_put_down.png');
  // (kept with the save: the slice says which is on which, and takes it back)
  const kept = await page.evaluate(async ({ i, m }) => {
    const g = window.__rt.game;
    const I = await import('/src/game/modcar/v3/moto-rack/index.ts');
    const car = g.vehicles[i];
    const b = g.vehicles[m];
    I.motoRacks.load(b, car, false);
    g.simulate(0.1);
    const snap = I.motoRacks.slice.snapshot();
    I.motoRacks.slice.clear();
    const cleared = !b.carriedBy;
    I.motoRacks.slice.restore(JSON.parse(JSON.stringify(snap)), 1);
    g.simulate(0.1);
    const back = I.motoRacks.carrierOf(b) === car;
    I.motoRacks.unload(b, false);
    g.simulate(0.3);
    return { snap, cleared, back, after: !!b.carriedBy };
  }, { i: vi, m: swallow.i });
  ok(kept.snap?.links?.length === 1 && kept.cleared && kept.back && !kept.after, `kept with the save (the slice 'moto-rack': ${JSON.stringify(kept.snap)}), taken back on the tray`);

  // ---------------------------------------------------------------- the plan of the default world
  const planned = await page.evaluate(async () => {
    const S = await import('/src/core/modcar/schedule.ts');
    const seed = window.__rt.game.world.seed;
    const p = S.placesPlan(seed, 60);
    // (the third chapter's blueprint places, the ladder's sheet among what they have; the second's, the roof rack's)
    const lad = p.filter((f) => 'blueprint' in f.thing && f.thing.blueprint === 3).map((f) => +(f.s / 1000).toFixed(1));
    const rr = p.filter((f) => 'blueprint' in f.thing && f.thing.blueprint === 2).map((f) => +(f.s / 1000).toFixed(1));
    const mr = p.filter((f) => f.entry === 'moto_rack').map((f) => +(f.s / 1000).toFixed(1));
    const moto = S.vehiclePlan(seed, 60).find((v) => v.frame === 'moto');
    return { lad, rr, mr, moto: moto ? +(moto.s / 1000).toFixed(1) : null };
  });
  console.log('planned', JSON.stringify(planned));
  ok(planned.lad.length === 8 && planned.lad.every((km) => km >= 30 && km <= 50) && planned.rr.length === 6 && planned.rr.every((km) => km >= 12 && km <= 30), `the default world's blueprint places: the third chapter's at ${planned.lad.join(', ')} km, the second's at ${planned.rr.join(', ')}`);
  ok(planned.moto !== null && planned.mr.length === 1 && planned.mr[0] - planned.moto >= 2 && planned.mr[0] - planned.moto <= 5, `its motorcycle rack's blueprint at ${planned.mr[0]} km, after the Swallow at ${planned.moto} km`);
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j9e_ladder_moto: ${bad} FAILED` : 'j9e_ladder_moto: ok');
process.exit(bad ? 1 : 0);
