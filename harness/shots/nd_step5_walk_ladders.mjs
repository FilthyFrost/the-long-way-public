// Step 5 verification: Nomad Drive free 3D walking in/out of campers (Whale, Old Elephant, Camel, Turtle),
// Turtle roof-down crouch / roof-up stand + new left-rear side ladder, Buffalo 0.80 m bed via lowered tailgate,
// Whale rear ladder onto always-solid roof, and moving-vehicle surface carry.
//   SHOTS_GPU=1 node harness/shots/nd_step5_walk_ladders.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openGame, startServer } from './lib.mjs';

const out = 'D:/cindy-scratch/phase3';
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (c, why) => {
  if (!c) bad++;
  console.log(c ? 'ok  ' : 'FAIL', why);
};

async function runFrame(page, secs) {
  await page.evaluate((s) => {
    const g = window.__rt.game;
    for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1);
    g.simulate(0);
  }, secs);
}

async function holdKey(page, code, secs) {
  await page.keyboard.down(code);
  await runFrame(page, secs);
  await page.keyboard.up(code);
  await runFrame(page, 0.2);
}

async function tapKey(page, code) {
  await page.keyboard.down(code);
  await runFrame(page, 0.05);
  await page.keyboard.up(code);
  await runFrame(page, 0.25);
}

async function placeModel(page, vi, mx, my, mz, lookMx, lookMy, lookMz, ground = true) {
  await page.evaluate(({ vi, mx, my, mz, lookMx, lookMy, lookMz, ground }) => {
    const g = window.__rt.game;
    const v = g.vehicles[vi];
    const cg = v.sys.derived.cg;
    const b = new Float64Array(9);
    v.sim.basis(b);
    const toW = (x, y, z) => {
      const dx = x - cg.x, dy = y - cg.y, dz = z - cg.z;
      return [
        v.sim.px + b[0] * dx + b[3] * dy + b[6] * dz,
        v.sim.py + b[1] * dx + b[4] * dy + b[7] * dz,
        v.sim.pz + b[2] * dx + b[5] * dy + b[8] * dz,
      ];
    };
    const [wx, wy, wz] = toW(mx, my, mz);
    const [tx, ty, tz] = toW(lookMx, lookMy, lookMz);
    const yaw = Math.atan2(tz - wz, tx - wx);
    g.player.detachVehicle();
    if (ground) g.player.walker.place(wx, wz, yaw, 0);
    else g.player.walker.placeAt(wx, wy, wz, yaw);
    const la = g.player.walker.lookAt(tx, ty, tz);
    g.input.lookYaw = la.yaw;
    g.input.lookPitch = Math.max(-0.5, Math.min(0.4, la.pitch));
    g.player.refreshInside();
    g.simulate(0);
  }, { vi, mx, my, mz, lookMx, lookMy, lookMz, ground });
}

try {
  // Spawn Whale (rv) on a flat stretch (s=900, seed=7)
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:rv&s=900&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => {
    await page.evaluate(() => {
      window.__rt.game.ui.showHelp(false);
      window.__rt.render();
      window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };

  // Helper to spawn another vehicle cleanly along the road spine and wait until its GLB panels are ready
  const spawnBeside = async (frame, deltaS) => {
    const idx = await ev(async ({ frame, deltaS }) => {
      const g = window.__rt.game;
      const B = await import('/src/core/modcar/build.ts');
      const S = await import('/src/core/world/spine.ts');
      const v0 = g.vehicles[0];
      const s0 = g.world.spine.sAtX(v0.sim.px);
      const st = new S.SpineSample();
      g.world.spine.at(s0 + deltaS, st);
      const v = g.addVehicle(B.stockBuild(frame), st.x, st.z, -st.phi);
      v.sim.setParkBrake(true);
      v.sys.stop('');
      return g.vehicles.indexOf(v);
    }, { frame, deltaS });
    await page.waitForFunction((i) => {
      const v = window.__rt.game.vehicles[i];
      return !!v && (v.view.hasPanel('door_side') || v.view.hasPanel('trunk') || v.view.hasPanel('hood'));
    }, idx, { timeout: 15000 });
    await ev(() => window.__rt.game.simulate(0.8));
    return idx;
  };

  // Stop Whale completely, shut off engine, park, exit driver seat
  await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.simulate(1.5);
    if (g.seated) g.getOut();
    g.simulate(0.4);
  });

  // ------------------------------------------------------------------ 1. Whale: free walk in & out + moving carry + built-in rear ladder
  await rt('openPanel', 0, 'door_side', true);
  await runFrame(page, 0.8);
  await placeModel(page, 0, -0.92, 0, 2.0, -0.92, 1.3, -0.5, true);
  await holdKey(page, 'KeyW', 1.2);
  const whaleIn = await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    return {
      aboard: g.player.aboard?.v === v,
      y: +(g.player.walker.y - v.sim.py).toFixed(2),
      tag: g.player.walker.floorTag,
      attached: g.player.attachedVehicle === v,
    };
  });
  ok(whaleIn.aboard && whaleIn.attached && whaleIn.tag.endsWith(':floor'), `Whale: free walk up steps into cabin with KeyW (${JSON.stringify(whaleIn)})`);
  await shot('01_whale_walked_in');

  // Test moving-vehicle surface carry inside Whale (coast Whale forward 1.2 s at ~5 m/s)
  const carryRes = await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const w = g.player.walker;
    v.sim.setParkBrake(false);
    v.sim.selector = 'N';
    v.awake = 5;
    const vx0 = v.sim.px, vz0 = v.sim.pz;
    const wx0 = w.x, wz0 = w.z;
    const b = new Float64Array(9);
    v.sim.basis(b);
    v.sim.vx = b[0] * 5.5;
    v.sim.vz = b[2] * 5.5;
    for (let i = 0; i < 72; i++) g.step(1 / 60, 1);
    const dv = Math.hypot(v.sim.px - vx0, v.sim.pz - vz0);
    const dw = Math.hypot(w.x - wx0, w.z - wz0);
    const stillIn = g.player.aboard?.v === v;
    v.sim.vx = 0;
    v.sim.vz = 0;
    v.sim.setParkBrake(true);
    for (let i = 0; i < 30; i++) g.step(1 / 60, 1);
    return { dv: +dv.toFixed(2), dw: +dw.toFixed(2), diff: +Math.abs(dv - dw).toFixed(3), stillIn };
  });
  ok(carryRes.dv > 3 && carryRes.diff < 0.25 && carryRes.stillIn, `Whale moving carry: player rides smoothly inside at speed (${JSON.stringify(carryRes)})`);

  // Walk freely back OUT of Whale through its open side door with KeyW
  await placeModel(page, 0, -0.92, 0.86, 0.45, -0.92, 1.3, 2.5, false);
  await holdKey(page, 'KeyW', 1.2);
  const whaleOut = await ev(() => ({ aboard: !!window.__rt.game.player.aboard, tag: window.__rt.game.player.walker.floorTag }));
  ok(!whaleOut.aboard, `Whale: free walk back out through open side door (${JSON.stringify(whaleOut)})`);

  // Climb Whale built-in rear ladder onto its always-solid roof
  await placeModel(page, 0, -5.85, 0, 0.74, -4.65, 2.0, 0.74, true);
  await holdKey(page, 'KeyW', 2.4);
  await runFrame(page, 0.5);
  const whaleRoof = await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    return { onRoof: g.player.onRoof === v, tag: g.player.walker.floorTag, y: +(g.player.walker.y - v.sim.py).toFixed(2), grounded: g.player.walker.grounded };
  });
  ok(whaleRoof.onRoof && whaleRoof.grounded && whaleRoof.tag.endsWith(':roof'), `Whale: climbed built-in rear ladder onto solid roof (${JSON.stringify(whaleRoof)})`);
  await shot('06_whale_on_roof');

  // ------------------------------------------------------------------ 2. Turtle: roof-down crouch, roof-up stand/jump, new left-rear side ladder
  const ti = await spawnBeside('turtle', 12);
  await rt('openPanel', ti, 'door_side', true);
  await runFrame(page, 0.8);
  // Roof is DOWN (roofT = 0): toggle crouch (C) and walk straight inside!
  await placeModel(page, ti, -0.86, 0, 1.95, -0.86, 0.9, -0.4, true);
  await tapKey(page, 'KeyC');
  await holdKey(page, 'KeyW', 1.4);
  const turtleDown = await ev((ti) => {
    const g = window.__rt.game;
    const v = g.vehicles[ti];
    return { aboard: g.player.aboard?.v === v, crouched: g.player.walker.crouched, roofT: +v.view.roofT.toFixed(2) };
  }, ti);
  // Try pressing C to stand while roof is still down -> must stay crouched!
  await tapKey(page, 'KeyC');
  const turtleBlockedStand = await ev(() => ({ crouched: window.__rt.game.player.walker.crouched }));
  ok(turtleDown.aboard && turtleDown.crouched && turtleBlockedStand.crouched, `Turtle roof down: crouched walk-in works, standing blocked by lowered ceiling (${JSON.stringify({ turtleDown, turtleBlockedStand })})`);
  await shot('02_turtle_crouch_roof_down');

  // Raise Turtle pop-up roof -> player stands up and jumps inside!
  await ev(async (ti) => {
    const g = window.__rt.game;
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    const v = g.vehicles[ti];
    C.camper.setUp(v, true);
    g.crouch = false;
  }, ti);
  await runFrame(page, 1.5);
  await holdKey(page, 'Space', 0.15);
  const turtleUp = await ev((ti) => {
    const g = window.__rt.game;
    const v = g.vehicles[ti];
    return { roofT: +v.view.roofT.toFixed(2), crouched: g.player.walker.crouched, jumps: g.player.walker.jumps };
  }, ti);
  ok(turtleUp.roofT > 0.9 && !turtleUp.crouched && turtleUp.jumps > 0, `Turtle roof up: stands upright and jumps freely inside (${JSON.stringify(turtleUp)})`);

  // Lower roof, fit new left-rear side ladder on Turtle, screenshot it, and climb onto roof!
  await ev(async (ti) => {
    const g = window.__rt.game;
    const C = await import('/src/game/modcar/v3/camper/index.ts');
    C.camper.setUp(g.vehicles[ti], false);
  }, ti);
  await placeModel(page, ti, -2.85, 0, -2.8, -2.85, 1.15, -0.5, true);
  await runFrame(page, 1.4);
  const fitLad = await ev(async (ti) => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const v = g.vehicles[ti];
    B.fitPart(v.build, 'ladder', B.newInstance('ladder'));
    g.changed(v, 'ladder');
    return { hasMount: v.view.frame.mounts.some((m) => m.id === 'ladder'), fitted: v.build.parts.ladder?.part ?? null };
  }, ti);
  await runFrame(page, 0.8);
  ok(fitLad.hasMount && fitLad.fitted === 'ladder', `Turtle: left-rear side ladder fitted (${JSON.stringify(fitLad)})`);
  await shot('03_turtle_side_ladder');

  // Walk into Turtle's left-rear ladder facing it and climb up onto its solid roof!
  await placeModel(page, ti, -2.85, 0, -1.72, -2.85, 1.5, -0.5, true);
  await holdKey(page, 'KeyW', 2.0);
  await runFrame(page, 0.5);
  const turtleRoof = await ev((ti) => {
    const g = window.__rt.game;
    const v = g.vehicles[ti];
    return { onRoof: g.player.onRoof === v, tag: g.player.walker.floorTag, grounded: g.player.walker.grounded, y: +(g.player.walker.y - v.sim.py).toFixed(2) };
  }, ti);
  ok(turtleRoof.onRoof && turtleRoof.grounded && turtleRoof.tag.endsWith(':roof'), `Turtle: climbed new left-rear side ladder onto solid roof (${JSON.stringify(turtleRoof)})`);
  await shot('04_turtle_on_roof');

  // Descend Turtle's left-rear side ladder from the roof (stand near head facing outward, press W to grab, then S down!)
  await placeModel(page, ti, -2.85, 2.08, -0.78, -2.85, 2.08, -2.5, false);
  await holdKey(page, 'KeyW', 0.45);
  await holdKey(page, 'KeyS', 1.6);
  const turtleDesc = await ev((ti) => ({ onRoof: window.__rt.game.player.onRoof === window.__rt.game.vehicles[ti], grounded: window.__rt.game.player.walker.grounded, tag: window.__rt.game.player.walker.floorTag }), ti);
  ok(!turtleDesc.onRoof && turtleDesc.grounded, `Turtle: descended left-rear side ladder back to ground (${JSON.stringify(turtleDesc)})`);

  // ------------------------------------------------------------------ 3. Buffalo: 0.80 m bed walked into over lowered tailgate (ND entry-assist)
  const bi = await spawnBeside('buffalo', -12);
  await rt('openPanel', bi, 'trunk', true);
  await runFrame(page, 0.8);
  await placeModel(page, bi, -3.75, 0, 0, -1.6, 1.1, 0, true);
  await holdKey(page, 'KeyW', 1.4);
  const bufBed = await ev((bi) => {
    const g = window.__rt.game;
    const v = g.vehicles[bi];
    const m = v.walkSolids.worldToModel(g.player.walker.x, g.player.walker.y, g.player.walker.z, { x: 0, y: 0, z: 0 });
    return { mx: +m.x.toFixed(2), my: +m.y.toFixed(2), tag: g.player.walker.floorTag, grounded: g.player.walker.grounded };
  }, bi);
  ok(bufBed.grounded && bufBed.tag.endsWith(':bed') && bufBed.mx > -2.4 && bufBed.mx < -1.1 && bufBed.my > 0.72, `Buffalo: walked straight into 0.80 m bed over lowered tailgate (${JSON.stringify(bufBed)})`);
  await shot('05_buffalo_bed_walked_in');

  // ------------------------------------------------------------------ 4. Old Elephant & Camel: free walk in through open entry door
  const ei = await spawnBeside('elephant', 26);
  await rt('openPanel', ei, 'door_side', true);
  await runFrame(page, 0.8);
  await placeModel(page, ei, -0.52, 0, 2.05, -0.52, 1.3, -0.4, true);
  await holdKey(page, 'KeyW', 1.4);
  const elephIn = await ev((ei) => ({ aboard: window.__rt.game.player.aboard?.v === window.__rt.game.vehicles[ei], tag: window.__rt.game.player.walker.floorTag }), ei);
  ok(elephIn.aboard && elephIn.tag.endsWith(':floor'), `Old Elephant: free walk up entry stairwell into cabin (${JSON.stringify(elephIn)})`);

  const ci = await spawnBeside('camel', -26);
  await rt('openPanel', ci, 'door_side', true);
  await runFrame(page, 0.8);
  await placeModel(page, ci, 2.37, 0, 2.05, 2.37, 1.3, -0.2, true);
  await holdKey(page, 'KeyW', 1.4);
  const camelIn = await ev((ci) => {
    const g = window.__rt.game;
    const v = g.vehicles[ci];
    const m = v.walkSolids.worldToModel(g.player.walker.x, g.player.walker.y, g.player.walker.z, { x: 0, y: 0, z: 0 });
    return { aboard: g.player.aboard?.v === v, tag: g.player.walker.floorTag, open: +v.view.panelOpen('door_side').toFixed(2), mx: +m.x.toFixed(2), my: +m.y.toFixed(2), mz: +m.z.toFixed(2) };
  }, ci);
  ok(camelIn.aboard && camelIn.tag.endsWith(':floor'), `Camel: free walk up bus stairwell + ND invisible entry plate into cabin (${JSON.stringify(camelIn)})`);
  await shot('07_camel_walked_in');

  ok(errors.length === 0, `no page/console errors (${errors.length})`);
  if (errors.length) console.log('errors:', errors);
} finally {
  await browser.close();
  server.close();
}

process.exit(bad ? 1 : 0);
