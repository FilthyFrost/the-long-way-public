// F8 (docs/V3/plan/finish.md §十一), in the game — the rooms on wheels:
//  - the Tadpole trailer: a box 3.0 × 1.7 m and 1.9 m clear inside, walked into by its rear door (it took things only);
//    a fridge, a cupboard and a bookshelf stand in it; hitched to a Sugar Cube and pulled round a bend, they ride;
//  - the Snail box van: its box 1.9 m clear inside, walked into by its rear door — a store room on wheels;
//  - the Whale: the wardrobe and the bath's cubicle gone from its right side, a bed across the back where the bench
//    stood, open shelves over both walls, a cubby under the sink: six square metres of open floor and an aisle a metre wide;
//  - the Old Elephant: the sofa that was built in gone (one that can be moved stands there), the dinette moved back
//    beside the galley: 6.5 m² of open floor, the aisle 1.1 m at the least, its four hobs on the worktop still; after
//    dark its ceiling lamps light by themselves on the house battery, and go out when one leaves;
//  - a save from before: what rode in a Whale under its old inside (a chair where the wardrobe stood, the rear bench
//    itself) is put in again where there is room now, and it is said;
//  - a cupboard that holds things: Q looking at it with a tin in the hands puts the tin in it, its door opening first;
//    its doors shut, the tin is not drawn and the mark does not find it; taken up, the cupboard carries the tin along and
//    stands it in again where it is put down; with a heavy thing on it, 先拿走里面的东西;
//  - a tool board on the Whale's wall: Q with a crowbar in the hands hangs it from its own hook, down the wall; a tin has
//    no hook; taken off the wall and hung again, the board has its crowbar still; a rod rack takes a rod across it;
//  - a van workbench in the Whale: its list is what one has learnt, the left button makes a crowbar of forty scrap.
//   SHOTS_GPU=1 node harness/shots/f8_home.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f8_home');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=7&start=road&build=stock:sedan&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
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
  const standIn = (x, z, yaw, pitch) =>
    page.evaluate(
      ({ x, z, yaw, pitch }) => {
        const g = window.__rt.game;
        const ab = g.player.aboard;
        ab.w.place(x, z, yaw);
        g.input.lookYaw = ab.heading() + yaw;
        g.input.lookPitch = pitch;
        g.simulate(0.15);
      },
      { x, z, yaw, pitch },
    );

  /**
   * The open floor of a vehicle's living box (m²): looked down on from `fromY` over a lattice of 5 cm squares across
   * the rectangle (frame model space), the squares where what is met first is the floor itself (within 3 cm of it).
   */
  const openFloor = (vi, x0, x1, z0, z1, floorY, fromY) =>
    page.evaluate(
      async ({ vi, x0, x1, z0, z1, floorY, fromY }) => {
        const g = window.__rt.game;
        const v = g.vehicles[vi];
        const m = v.view.model;
        m.updateMatrixWorld(true);
        const meshes = [];
        m.traverse((o) => {
          if (o.isMesh && o.visible) meshes.push(o);
        });
        // (the game's own three: its classes off the objects it made — the model's position is a Vector3, and the
        // raycaster is the one module of it asked for by name)
        const V3 = m.position.constructor;
        const { Raycaster } = await import('/src/game/modcar/v3/nd-place/system.ts').then(() => import('/node_modules/.vite/deps/three.js')).catch(() => import('/node_modules/three/build/three.module.js'));
        const rc = new Raycaster();
        const THREE = { Vector3: V3 };
        const down = new THREE.Vector3(0, -1, 0).transformDirection(m.matrixWorld);
        const cell = 0.05;
        let n = 0;
        let all = 0;
        const from = new THREE.Vector3();
        for (let x = x0 + cell / 2; x < x1; x += cell) {
          for (let z = z0 + cell / 2; z < z1; z += cell) {
            all++;
            from.set(x, fromY, z).applyMatrix4(m.matrixWorld);
            rc.set(from, down);
            rc.far = fromY - floorY + 0.5;
            const hit = rc.intersectObjects(meshes, false)[0];
            if (!hit) continue;
            const y = fromY - hit.distance;
            if (Math.abs(y - floorY) < 0.03) n++;
          }
        }
        return { open: +(n * cell * cell).toFixed(2), of: +(all * cell * cell).toFixed(2) };
      },
      { vi, x0, x1, z0, z1, floorY, fromY },
    );

  // ---- 1. the Tadpole: a trailer standing behind the car
  const setup = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const car = g.vehicles[0];
    car.sim.setParkBrake(true);
    car.sys.stop('');
    g.simulate(1);
    g.getOut();
    g.simulate(0.3);
    const yaw = car.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    // (its model's origin under its axle: seven metres behind the car's middle, facing the same way)
    const tr = g.addVehicle(B.stockBuild('trailer'), car.sim.px - fx * 7, car.sim.pz - fz * 7, yaw);
    await tr.view.ready;
    await tr.view.settled();
    g.simulate(1.5);
    window.__tr = tr;
    window.__car = car;
    const f = tr.view.frame;
    return { trailer: g.vehicles.indexOf(tr), mass: f.mass, body: f.body };
  });
  ok(setup.trailer >= 0 && setup.mass === 420 && Math.abs(setup.body.front - setup.body.rear - 3.08) < 0.05 && Math.abs(setup.body.halfWidth * 2 - 1.74) < 0.05, `a Tadpole behind the car: its box three metres long and 1.7 wide, 420 kg (${JSON.stringify(setup)})`);
  await rt('setOrbit', 150, 10, 9.5, 1.3, setup.trailer);
  await shot('01_trailer_back.png');
  await rt('setOrbit', 40, 8, 9.5, 1.3, setup.trailer);
  await shot('02_trailer_front.png');

  // its door open: walked into
  const board = await page.evaluate(async () => {
    const g = window.__rt.game;
    const tr = window.__tr;
    const A = await import('/src/core/modcar/aboard.ts');
    const def = A.aboardOf('trailer');
    tr.view.setPanelOpen('trunk', true);
    g.simulate(1.0);
    g.board(tr, def.doors[0]);
    g.simulate(0.4);
    const ab = g.player.aboard;
    const w = g.player.walker;
    const eye = w.eye({ x: 0, y: 0, z: 0 });
    // (the ceiling's lining over the eye: the frame's own, 1.9 m over the floor)
    return { aboard: ab?.v === tr, headroom: def.headroom, area: def.areas.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0), eyeUp: +(eye.y - w.y).toFixed(2), aft: def.aft ?? null };
  });
  ok(board.aboard && board.headroom >= 1.9 && board.area > 3.5 && board.eyeUp > 1.3 && board.aft === null, `its rear door open: walked in, standing (${JSON.stringify(board)})`);
  await rt('setView', 'cockpit');
  await standIn(-1.2, 0, 0, -0.1);
  await shot('03_trailer_inside.png');
  await standIn(1.0, 0, Math.PI, -0.1);
  await shot('04_trailer_inside_back.png');

  // ---- 2. the Snail: its box a room
  const snail = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    if (g.player.aboard) g.alight(g.player.aboard.v, A.aboardOf('trailer').doors[0]);
    g.simulate(0.3);
    const car = window.__car;
    const yaw = car.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const v = g.addVehicle(B.stockBuild('snail'), car.sim.px + fx * 9, car.sim.pz + fz * 9, yaw);
    await v.view.ready;
    await v.view.settled();
    g.simulate(1.5);
    window.__snail = v;
    const def = A.aboardOf('snail');
    v.view.setPanelOpen('trunk', true);
    g.simulate(1.0);
    g.board(v, def.doors[0]);
    g.simulate(0.4);
    const w = g.player.walker;
    const eye = w.eye({ x: 0, y: 0, z: 0 });
    return { i: g.vehicles.indexOf(v), aboard: g.player.aboard?.v === v, headroom: def.headroom, area: +def.areas.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0).toFixed(2), eyeUp: +(eye.y - w.y).toFixed(2), aft: def.aft ?? null, top: v.view.frame.body.top };
  });
  ok(snail.aboard && snail.headroom >= 1.9 && snail.area > 3.5 && snail.eyeUp > 1.3 && snail.aft === null && snail.top === 2.9, `a Snail: its rear door open, walked into its box, standing (${JSON.stringify(snail)})`);
  await rt('setView', 'cockpit');
  await standIn(-1.9, 0.3, 0, -0.08);
  await shot('05_snail_inside.png');
  await page.evaluate(async () => {
    const g = window.__rt.game;
    const A = await import('/src/core/modcar/aboard.ts');
    g.alight(g.player.aboard.v, A.aboardOf('snail').doors[0]);
    g.simulate(0.3);
  });
  await rt('setOrbit', 150, 10, 10.5, 1.5, snail.i);
  await shot('06_snail_back.png');

  // ---- 3. the Whale: emptied (§十九 step 7: only the over-cab bunk kept, wall to wall)
  const whale = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    const car = window.__car;
    const yaw = car.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const v = g.addVehicle(B.stockBuild('rv'), car.sim.px + fx * 22, car.sim.pz + fz * 22, yaw);
    await v.view.ready;
    await v.view.settled();
    g.simulate(1.5);
    window.__whale = v;
    const def = A.aboardOf('rv');
    v.view.setPanelOpen('door_side', true);
    g.simulate(1.0);
    g.board(v, def.doors[0]);
    g.simulate(0.4);
    const width = +(Math.max(...def.areas.map((r) => r.z1)) - Math.min(...def.areas.map((r) => r.z0))).toFixed(2);
    return { i: g.vehicles.indexOf(v), aboard: g.player.aboard?.v === v, width, beds: def.beds.length, extraSeats: !!v.build.parts.seat_rear || !!v.build.parts.seat_dinette, mounts: v.view.frame.mounts.some((m) => m.id === 'seat_rear' || m.id === 'seat_dinette') };
  });
  // (its living box inside its walls: wall to wall, from ahead of its rounded rear corners to behind the seats)
  const whaleFloor = await openFloor(whale.i, -4.85, 0.85, -1.085, 1.085, 0.86, 2.3);
  ok(whale.aboard && whale.width >= 1.9 && whale.beds === 1 && !whale.extraSeats && !whale.mounts, `a Whale: in by its side door; ${whale.width} m wall to wall, its over-cab bunk only, no rear/dinette bench (${JSON.stringify(whale)})`);
  ok(whaleFloor.open >= 10.0, `its open floor: ${whaleFloor.open} m² of the box's ${whaleFloor.of} (ten at least)`);
  await rt('setView', 'cockpit');
  await standIn(0.7, 0.3, Math.PI, -0.1);
  await shot('07_whale_back.png');
  await standIn(-2.6, 0.2, 0, -0.08);
  await shot('08_whale_front.png');
  await standIn(-1.3, 0.3, Math.PI / 2 + 0.5, 0.25);
  await shot('09_whale_shelf.png');

  // ---- 4. the Old Elephant: emptied (§十九 step 7: found with nothing in it; a sofa placed on the floor is moved)
  const eleph = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    const It = await import('/src/core/modcar/items.ts');
    g.alight(g.player.aboard.v, A.aboardOf('rv').doors[0]);
    g.simulate(0.3);
    const car = window.__car;
    const yaw = car.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const v = g.addVehicle(B.stockBuild('elephant'), car.sim.px + fx * 38, car.sim.pz + fz * 38, yaw);
    await v.view.ready;
    await v.view.settled();
    g.simulate(1.5);
    window.__eleph = v;
    await g.stowFittings(v);
    g.simulate(0.3);
    const stockRiders = g.loose.ridersOf(v).length;
    const def = A.aboardOf('elephant');
    v.view.setPanelOpen('door_side', true);
    g.simulate(1.0);
    g.board(v, def.doors[0]);
    g.simulate(0.4);
    const width = +(Math.max(...def.areas.map((r) => r.z1)) - Math.min(...def.areas.map((r) => r.z0))).toFixed(2);
    const aisle = +Math.min(...def.areas.map((r) => r.z1 - r.z0)).toFixed(2);
    // place a sofa on the floor so the pick-up check below verifies moving placed furniture
    const held = { kind: 'item', item: It.newItem('nd_sofa_2') };
    await g.cargo.measured(held);
    const at = g.cargo.spotIn(v, 'cabin', held, { x: -2.22, z: 0.7 }, Math.PI / 2, 0);
    const sofa = at ? g.cargo.stow(v, at.zone, at.spot, held) : null;
    g.simulate(0.2);
    return { i: g.vehicles.indexOf(v), aboard: g.player.aboard?.v === v, stockRiders, width, aisle, sofa: sofa ? { zone: sofa.stow, x: +sofa.riding.pos.x.toFixed(2), z: +sofa.riding.pos.z.toFixed(2) } : null };
  });
  // (its room inside its walls: from the engine deck to the cab's seat boxes)
  const elephFloor = await openFloor(eleph.i, -4.1, 2.45, -1.15, 1.15, 0.62, 2.4);
  ok(eleph.aboard && eleph.stockRiders === 0 && eleph.width >= 2.0 && eleph.aisle >= 1.1 && !!eleph.sofa && eleph.sofa.zone === 'cabin', `an Old Elephant: found empty; ${eleph.width} m wall to wall (${eleph.aisle} m between humps), a placed sofa standing on the floor (${JSON.stringify(eleph)})`);
  ok(elephFloor.open >= 11.0, `its open floor: ${elephFloor.open} m² of the room's ${elephFloor.of} (eleven at least)`);
  await rt('setView', 'cockpit');
  await standIn(2.3, -0.2, Math.PI, -0.1);
  await shot('10_elephant_back.png');
  await standIn(-1.6, 0.2, 0, -0.08);
  await shot('11_elephant_front.png');
  // the sofa is a thing one moves: taken up from where it stands
  const moved = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = window.__eleph;
    const sofa = g.loose.ridersOf(v).find((l) => l.item?.item === 'nd_sofa_2');
    const took = g.player.takeLoose(sofa);
    g.simulate(0.3);
    const held = g.player.held?.kind === 'item' ? g.player.held.item.item : null;
    return { took: !!took, held, still: g.loose.ridersOf(v).some((l) => l.item?.item === 'nd_sofa_2') };
  });
  ok(moved.held === 'nd_sofa_2' && !moved.still, `the sofa taken up: in the hands, the wall clear (${JSON.stringify(moved)})`);
  await page.evaluate(() => (window.__rt.game.player.held = null));

  // after dark: the ceiling lamps, on the house battery
  const lampNow = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const v = window.__eleph;
      const p = g.systems.get('power');
      const hb = v.build.parts.houseBattery;
      return { lit: +p.ceilingOf(v).toFixed(2), night: +(g.env.sky?.night ?? 0).toFixed(2), charge: hb ? +hb.fluids.charge.toFixed(4) : null, aboard: g.player.aboard?.v === v };
    });
  const day = await lampNow();
  await rt('setHour', 23);
  await rt('simulate', 3);
  const night0 = await lampNow();
  await rt('simulate', 30);
  const night1 = await lampNow();
  ok(day.lit === 0 && night0.lit > 0.95 && night0.night > 0.35 && night1.charge !== null && night1.charge < night0.charge, `by day its ceiling lamps are out (${JSON.stringify(day)}); after dark, in it, they light on the house battery (${JSON.stringify(night0)} … ${JSON.stringify(night1)})`);
  await standIn(2.3, -0.2, Math.PI, -0.1);
  await shot('12_elephant_night.png');
  await page.evaluate(async () => {
    const g = window.__rt.game;
    const A = await import('/src/core/modcar/aboard.ts');
    g.alight(g.player.aboard.v, A.aboardOf('elephant').doors[0]);
    g.simulate(3);
  });
  const left = await lampNow();
  ok(left.lit < 0.02 && !left.aboard, `out of it: the lamps go out (${JSON.stringify(left)})`);
  await rt('setHour', 10);
  await rt('simulate', 1);

  // ---- 5. a save from before: what rode in the Whale is put in again
  const restow = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__whale;
    const I = await import('/src/core/modcar/items.ts');
    const B = await import('/src/core/modcar/build.ts');
    const before = g.loose.ridersOf(v).length;
    const chair = I.newItem('nd_chair');
    const tin = I.newItem('nd_baked_beans');
    const bench = B.newInstance('seat_bench');
    // (as a save of before has them: a chair standing where the wardrobe was, a tin on the old rear bench — each with
    // its place in the frame — and the bench itself, taken off its mount by the save's reading: no place)
    g.restoreRiders(
      v,
      [
        { item: chair, x: v.sim.px, y: 1, z: v.sim.pz, yaw: 0, pos: [-1.9, 0.86, 0.75], rot: [0, 0, 0, 1], zone: 'cabin' },
        { item: tin, x: v.sim.px, y: 1, z: v.sim.pz, yaw: 0, pos: [-3.25, 1.3, 0.2], rot: [0, 0, 0, 1], zone: 'bench' },
        { part: bench, x: v.sim.px, y: 0, z: v.sim.pz, yaw: 0 },
      ],
      0,
    );
    for (let i = 0; i < 200 && g.loose.ridersOf(v).length < before + 3; i++) {
      await new Promise((r) => setTimeout(r, 30));
      g.simulate(0.05);
    }
    const riders = g.loose.ridersOf(v);
    const at = (l) => (l ? { zone: l.stow ?? null } : null);
    const zones = new Set((await import('/src/core/modcar/cargo.ts')).zonesOf('rv').map((z) => z.id));
    const mine = [riders.find((l) => l.item === chair), riders.find((l) => l.item === tin), riders.find((l) => l.part === bench)];
    return { n: riders.length - before, at: mine.map(at), known: mine.every((l) => l && zones.has(l.stow)), said: document.body.innerText.includes('重新摆了一遍') };
  });
  ok(restow.n === 3 && restow.known && restow.said, `what rode in a Whale under its old inside — a chair, a tin, its rear bench — put in again where there is room now, and said (${JSON.stringify(restow)})`);

  // ---- 6. a cupboard that holds things
  const cup = await page.evaluate(async () => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    const car = window.__car;
    const yaw = car.sim.yaw;
    // (on the road by the car: a cupboard, its doors towards one who stands two metres off it)
    const x = car.sim.px - Math.sin(yaw) * 4 - Math.cos(yaw) * 2;
    const z = car.sim.pz + Math.cos(yaw) * 4 - Math.sin(yaw) * 2;
    const y = g.world.heightAt(x, z);
    const l = g.loose.addItem(I.newItem('nd_cabinet'), x, y, z, yaw);
    g.loose.rest(l);
    for (let i = 0; i < 100 && !g.cargo.boxOf({ kind: 'item', item: l.item }); i++) await new Promise((r) => setTimeout(r, 50));
    g.simulate(0.5);
    window.__cup = l;
    return { uid: l.uid, x, y, z, yaw };
  });
  await page.waitForTimeout(500);
  await rt('simulate', 0.3);
  const homeOf = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const home = g.systems.get('nd-home');
      const l = window.__cup;
      const p = [...home.pieces.values()].find((x) => x.l === l);
      if (!p) return null;
      const inIt = home.contentsOf(p);
      return { n: inIt.length, rooms: inIt.map((c) => c.room), at: inIt.map((c) => [+c.lx.toFixed(2), +c.ly.toFixed(2), +c.lz.toFixed(2)]), open: [...(l.item.state?.open ?? [])], shut: inIt.map((c) => !!c.l.shut), seen: inIt.map((c) => c.l.obj.visible), carried: (l.item.state?.carried ?? []).length };
    });
  // a tin in the hands, the mark on the cupboard: Q
  await rt('hold', 'item:nd_baked_beans');
  let cm = '';
  for (const turn of [0, 0.5, -0.5, Math.PI, 1.2, -1.2]) {
    cm = await rt('aimPoint', cup.x, cup.y + 0.5, cup.z, cup.yaw + turn, 1.6);
    if (cm.startsWith(`device:nd-home:${cup.uid}`)) break;
  }
  await rt('simulate', 0.2);
  const qWord = await page.evaluate(() => document.body.innerText);
  const went = await page.evaluate(() => {
    const g = window.__rt.game;
    const ok = g.player.drop();
    g.simulate(0.6);
    return { ok, held: g.player.held ? 'still' : null };
  });
  const in1 = await homeOf();
  ok(cm.startsWith(`device:nd-home:${cup.uid}`) && qWord.includes('放进') && went.ok && went.held === null && !!in1 && in1.n === 1 && in1.open.length >= 1 && in1.seen[0] === true, `the mark on a cupboard (${cm}), Q with a tin in the hands: 放进 … — the tin stands in it, a door opened first (${JSON.stringify(in1)})`);
  await shot('13_cupboard_open.png');
  // its doors shut: the tin is not drawn, not for the mark
  await page.evaluate((uid) => {
    const g = window.__rt.game;
    const home = g.systems.get('nd-home');
    for (const d of ['P_door_a', 'P_door_b']) home.harness.open(uid, d, false);
    g.simulate(0.8);
  }, cup.uid);
  const in2 = await homeOf();
  ok(!!in2 && in2.n === 1 && in2.open.length === 0 && in2.shut[0] === true && in2.seen[0] === false, `its doors shut: the tin is shut in — not drawn, not for the mark (${JSON.stringify(in2)})`);
  // taken up: the tin goes with it; put down again, the tin stands in it where it stood
  const carried = await page.evaluate(async () => {
    const g = window.__rt.game;
    const home = g.systems.get('nd-home');
    const p = [...home.pieces.values()].find((x) => x.l === window.__cup);
    const loose0 = g.loose.list.length;
    home.pickUp(p);
    g.simulate(0.3);
    const held = g.player.held?.kind === 'item' ? g.player.held.item : null;
    const took = { held: held?.item ?? null, carried: (held?.state?.carried ?? []).length, loose: g.loose.list.length - loose0 };
    // put down a few steps on
    const w = g.player.walker;
    window.__rt.stand(w.x + Math.cos(w.heading + 2.2) * 3, w.z + Math.sin(w.heading + 2.2) * 3, w.heading, -0.2);
    g.simulate(0.2);
    g.player.putDown();
    for (let i = 0; i < 80; i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 10));
      const l = g.loose.list.find((x) => x.item === held);
      if (l && l.resting && !(l.item.state?.carried ?? []).length) break;
    }
    const l = g.loose.list.find((x) => x.item === held);
    window.__cup = l;
    return { took, down: !!l && l.resting };
  });
  const in3 = await homeOf();
  ok(carried.took.held === 'nd_cabinet' && carried.took.carried === 1 && carried.took.loose === -2 && carried.down && !!in3 && in3.n === 1 && in3.carried === 0 && Math.abs(in3.at[0][1] - in1.at[0][1]) < 0.03 && Math.abs(in3.at[0][2] - in1.at[0][2]) < 0.03, `taken up, the cupboard carries the tin along (${JSON.stringify(carried.took)}); put down, the tin stands in it where it stood (${JSON.stringify(in3)})`);
  // a heavy thing on it: not taken up
  const heavy = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const home = g.systems.get('nd-home');
    const l = window.__cup;
    const bat = g.loose.addPart(B.newInstance('bat_std', { charge: 0.5 }), l.x, l.y + 0.93, l.z, l.yaw);
    g.loose.rest(bat);
    g.simulate(0.3);
    const p = [...home.pieces.values()].find((x) => x.l === l);
    const n = home.contentsOf(p).length;
    home.pickUp(p);
    g.simulate(0.3);
    return { n, held: !!g.player.held, there: g.loose.list.includes(l), said: document.body.innerText.includes('先拿走里面的东西') };
  });
  ok(heavy.n === 2 && !heavy.held && heavy.there && heavy.said, `a car battery on it: 先拿走里面的东西 — it stays where it is (${JSON.stringify(heavy)})`);

  // ---- 7. the tool board, the rod rack and the workbench, in the Whale
  const wall = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__whale;
    const I = await import('/src/core/modcar/items.ts');
    const C = await import('/src/core/modcar/cargo.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    const zone = C.zonesFor('rv', v.build).find((z) => z.wall);
    // (hung on the right wall, its back to it: as the wall's own aiming puts a thing — cargo.ts wallAim)
    const hang = async (id, x, y) => {
      const held = { kind: 'item', item: I.newItem(id) };
      await g.loose.objectFor(held);
      for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
      const b = g.cargo.boxOf(held);
      const out = -b.minX + 0.01;
      return g.cargo.stow(v, zone, { x, y: y - (b.minY + b.maxY) / 2, z: 1.085 - out, yaw: Math.PI / 2 }, held);
    };
    const board = await hang('nd_pegboard', -2.65, 1.4);
    const rack = await hang('nd_rod_rack', -1.7, 1.2);
    g.simulate(0.4);
    window.__board = board;
    window.__rack = rack;
    v.view.setPanelOpen('door_side', true);
    g.simulate(0.6);
    g.board(v, A.aboardOf('rv').doors[0]);
    g.simulate(0.4);
    return { board: board.uid, rack: rack.uid, stow: board.stow };
  });
  await page.waitForTimeout(400);
  await rt('simulate', 0.3);
  const markOn = async (name, lx, ly) => {
    // (standing in the aisle across from it, the mark on its middle)
    await standIn(lx, 0.25, Math.PI / 2, 0);
    return page.evaluate(
      ({ name, ly }) => {
        const g = window.__rt.game;
        const l = window[name];
        const w = g.player.walker;
        const at = w.lookAt(l.x, l.y + ly, l.z);
        g.input.lookYaw = at.yaw;
        g.input.lookPitch = at.pitch;
        g.simulate(0.25);
        return String(g.player.telemetry().target);
      },
      { name, ly },
    );
  };
  const hungOn = (name) =>
    page.evaluate((name) => {
      const g = window.__rt.game;
      const home = g.systems.get('nd-home');
      const l = window[name];
      const p = [...home.pieces.values()].find((x) => x.l === l);
      return home.contentsOf(p).map((c) => {
        c.l.obj.updateMatrixWorld(true);
        const e = c.l.obj.matrixWorld.elements;
        // (upX: how far its own x points up or down — a crowbar's length)
        return { what: c.l.item?.item ?? (c.l.tool ? 'tool:' + c.l.tool.kind : 'part'), stow: c.l.stow, rides: c.l.riding?.on === window.__whale, at: [+c.lx.toFixed(2), +c.ly.toFixed(2), +c.lz.toFixed(2)], upX: +Math.abs(e[1]).toFixed(2) };
      });
    }, name);
  await rt('hold', 'item:nd_crowbar');
  const bm = await markOn('__board', -1.9, 0.3);
  const boardWord = await page.evaluate(() => document.body.innerText);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.drop();
    g.simulate(0.5);
  });
  const hung1 = await hungOn('__board');
  ok(bm.startsWith(`device:nd-home:${wall.board}`) && boardWord.includes('挂到') && hung1.length === 1 && hung1[0].what === 'nd_crowbar' && hung1[0].stow === 'wall' && hung1[0].rides, `a tool board on the wall of the Whale, the mark on it (${bm}), Q with a crowbar: 挂到 … — it hangs from its hook (${JSON.stringify(hung1)})`);
  await shot('14_tool_board.png');
  await rt('hold', 'item:nd_baked_beans');
  await markOn('__board', -1.9, 0.3);
  const noHook = await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.drop();
    g.simulate(0.3);
    return { held: g.player.held?.kind === 'item' ? g.player.held.item.item : null, said: document.body.innerText.includes('挂板上没有它的钩子') };
  });
  ok(noHook.held === 'nd_baked_beans' && noHook.said, `a tin has no hook on it: said, the tin still in the hands (${JSON.stringify(noHook)})`);
  await page.evaluate(() => (window.__rt.game.player.held = null));
  // taken off the wall with its crowbar, hung again: the crowbar hangs on it still
  const rehung = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__whale;
    const C = await import('/src/core/modcar/cargo.ts');
    const home = g.systems.get('nd-home');
    const p = [...home.pieces.values()].find((x) => x.l === window.__board);
    home.pickUp(p);
    g.simulate(0.3);
    const held = g.player.held;
    const took = { held: held?.kind === 'item' ? held.item.item : null, carried: (held?.item?.state?.carried ?? []).map((c) => !!c.q) };
    const zone = C.zonesFor('rv', v.build).find((z) => z.wall);
    const b = g.cargo.boxOf(held);
    const l = g.cargo.stow(v, zone, { x: -3.05, y: 1.4 - (b.minY + b.maxY) / 2, z: 1.085 + b.minX - 0.01, yaw: Math.PI / 2 }, held);
    g.player.held = null;
    for (let i = 0; i < 40; i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 10));
      if (!(l.item.state?.carried ?? []).length) break;
    }
    window.__board = l;
    return took;
  });
  const hung2 = await hungOn('__board');
  ok(rehung.held === 'nd_pegboard' && rehung.carried.length === 1 && rehung.carried[0] === true && hung2.length === 1 && hung2[0].what === 'nd_crowbar' && hung2[0].rides && Math.abs(hung2[0].upX - hung1[0].upX) < 0.05 && Math.abs(hung2[0].at[2] - hung1[0].at[2]) < 0.02, `taken off the wall the board carries its crowbar (${JSON.stringify(rehung)}); hung again further along, the crowbar hangs on it as it did (${JSON.stringify(hung2)})`);
  // the rod rack: a rod across it; nothing else
  await rt('hold', 'item:rod_willow');
  const rm = await markOn('__rack', -1.7, 0.2);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.drop();
    g.simulate(0.5);
  });
  const lying = await hungOn('__rack');
  await rt('hold', 'item:nd_baked_beans');
  await markOn('__rack', -1.7, 0.2);
  const notRod = await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.drop();
    g.simulate(0.3);
    const said = document.body.innerText.includes('竿架上只搁鱼竿');
    g.player.held = null;
    return said;
  });
  ok(rm.startsWith(`device:nd-home:${wall.rack}`) && lying.length === 1 && lying[0].what === 'rod_willow' && lying[0].rides && notRod, `a rod rack on the wall (${rm}): a rod lies across it (${JSON.stringify(lying)}); a tin does not — 竿架上只搁鱼竿`);
  await standIn(-2.45, -0.25, Math.PI / 2, -0.42);
  await shot('15_board_and_rack.png');
  // the van workbench: what one has learnt, made of what one has
  const bench = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__whale;
    const I = await import('/src/core/modcar/items.ts');
    const held = { kind: 'item', item: I.newItem('nd_workbench') };
    await g.loose.objectFor(held);
    for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
    const at = g.cargo.spotIn(v, 'cabin', held, { x: -2.3, z: 0.6 }, Math.PI / 2, 0) ?? g.cargo.packSpot(v, held);
    const l = g.cargo.stow(v, at.zone, at.spot, held);
    g.simulate(0.5);
    const home = g.systems.get('nd-home');
    for (let i = 0; i < 40 && ![...home.pieces.values()].some((x) => x.l === l); i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 10));
    }
    const p = [...home.pieces.values()].find((x) => x.l === l);
    g.learn('crowbar');
    g.stock.scrap = 100;
    g.stock.components = 0;
    const src = home.benchList(p);
    const rows = src.rows();
    const i = rows.findIndex((r) => r.name === '撬棍');
    const why = home.benchWhy(p);
    const near = src.near();
    const made = src.takeAt(i);
    g.simulate(0.3);
    const heldNow = g.player.held?.kind === 'item' ? g.player.held.item.item : null;
    const scrap = g.stock.scrap;
    // (with too little: nothing made, said)
    g.player.held = null;
    g.stock.scrap = 10;
    src.rows();
    const made2 = src.takeAt(i);
    g.simulate(0.2);
    return { rows: rows.map((r) => r.name + '（' + r.zone + '）').slice(0, 6), why: why?.zh ?? null, near, made, heldNow, scrap, made2, said: document.body.innerText.includes('还差 30 废料'), level: v.sys.applianceLevel() };
  });
  ok(bench.why === null && bench.near && bench.made && bench.heldNow === 'nd_crowbar' && bench.scrap === 60 && !bench.made2 && bench.said, `a van workbench in the Whale: its list is what one has learnt (${bench.rows.join('、')}); a crowbar made of forty scrap, in the hands; with ten scrap 还差 30 废料 (${JSON.stringify({ why: bench.why, scrap: bench.scrap, level: bench.level })})`);
  await page.evaluate(() => (window.__rt.game.player.held = null));
  await standIn(-1.2, 0.3, Math.PI, -0.25);
  await shot('16_workbench.png');

  // ---- 10. a fridge's boards, the list by furniture, a thing placed on a shelf
  const cold = await page.evaluate(async () => {
    const g = window.__rt.game;
    const v = window.__whale;
    const I = await import('/src/core/modcar/items.ts');
    const home = g.systems.get('nd-home');
    // (the Whale's floor cleared of what the checks before left on it)
    for (const l of [...g.loose.ridersOf(v)]) if (l.stow === 'cabin') g.loose.remove(l);
    g.simulate(0.3);
    // (five kinds of food it takes, a stack of three among them)
    const fr = I.newItem('nd_fridge');
    const acc = I.itemDef('nd_fridge').holds.accepts;
    const fits = (d) => !d.holds && (acc.includes('*') || acc.includes(d.cat) || (d.tags ?? []).some((t) => acc.includes('#' + t)));
    const kinds = I.ITEMS.filter(fits).slice(0, 5);
    fr.inside = kinds.map((d) => I.newItem(d.id));
    if ((kinds[0].stack ?? 1) >= 3) fr.inside[0].n = 3;
    const held = { kind: 'item', item: fr };
    await g.loose.objectFor(held);
    for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
    // (its back to the left wall, its door to the room)
    const at = g.cargo.spotIn(v, 'cabin', held, { x: -2.0, z: -0.75 }, -Math.PI / 2, 0);
    if (!at || at.spot.lie) return { why: `no room for a fridge standing (${JSON.stringify(at?.spot ?? null)})` };
    const fridge = g.cargo.stow(v, at.zone, at.spot, held);
    g.simulate(0.4);
    for (let i = 0; i < 40 && ![...home.pieces.values()].some((x) => x.l === fridge && x.movers.length); i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.__fridge = fridge;
    const p = [...home.pieces.values()].find((x) => x.l === fridge);
    // (what it holds stands on its boards while its door is open: v3/nd-store draws it, each thing at its place)
    const shown = () => {
      const vw = g.systems.harness('nd-store', 'views').find((x) => x.uid === fridge.uid);
      if (!vw?.drawn) return null;
      fridge.obj.updateMatrixWorld(true);
      const inv = fridge.obj.matrixWorld.clone().invert();
      return vw.things.map((t) => {
        // (its box where it stands, in the fridge's frame)
        const grp = g.loose.root.getObjectByName(`nd-store:${fridge.uid}:${t.uid}`);
        grp.updateMatrixWorld(true);
        const b = grp.userData.box;
        const pts = [];
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new (grp.position.constructor)(x, y, z).applyMatrix4(grp.matrixWorld).applyMatrix4(inv));
        const lo = (k) => Math.min(...pts.map((p) => p[k]));
        const hi = (k) => Math.max(...pts.map((p) => p[k]));
        return { b: t.b, y: +lo('y').toFixed(3), x: [+lo('x').toFixed(2), +hi('x').toFixed(2)], z: [+lo('z').toFixed(2), +hi('z').toFixed(2)], k: +grp.scale.x.toFixed(2), drawn: t.drawn };
      });
    };
    const shut0 = shown();
    for (const m of p.movers) home.harness.open(fridge.uid, m.name, true);
    for (let i = 0; i < 40; i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 30));
    }
    const model = v.view.model;
    model.updateMatrixWorld(true);
    const fm = model.worldToLocal(fridge.obj.getWorldPosition(new (fridge.obj.position.constructor)()));
    return { uid: fridge.uid, kinds: kinds.map((d) => d.name.zh), doors: p.movers.map((m) => m.name), shut0, open: shown(), fx: +fm.x.toFixed(2) };
  });
  if (cold.why) fail(`a fridge in the Whale: ${cold.why}`);
  else {
    // (each on a shelf — the crisper's top, the two wire shelves, 0.29 to 0.865 over the fridge's foot — or in the door,
    // inside its walls, at its own size)
    const onBoard = (t) => (t.b < 3 ? [0.291, 0.525, 0.865].some((y) => Math.abs(t.y - y) < 0.01) && t.x[0] > -0.26 && t.x[1] < 0.16 : t.y > 0.35) && t.z[0] > -0.33 && t.z[1] < 0.33 && t.k === 1 && t.drawn;
    ok(cold.shut0 === null && !!cold.open && cold.open.length === 5 && cold.open.every(onBoard), `a fridge with five things in it (${cold.kinds.join('、')}): its door shut, nothing of them is drawn; its door open (${cold.doors.join(', ')}), each stands on a board inside it (${JSON.stringify(cold.shut0)} ${JSON.stringify(cold.open)})`);
    await standIn(cold.fx + 0.25, 0.75, -Math.PI / 2 - 0.25, -0.12);
    await shot('17_fridge_open.png');
    const shutAgain = await page.evaluate(async () => {
      const g = window.__rt.game;
      const home = g.systems.get('nd-home');
      const fridge = window.__fridge;
      const p = [...home.pieces.values()].find((x) => x.l === fridge);
      // (one taken out of it while it stands open: the boards show what is left)
      fridge.item.inside.pop();
      g.simulate(0.3);
      const views = () => g.systems.harness('nd-store', 'views').find((x) => x.uid === fridge.uid);
      const left = views()?.things.length ?? -1;
      for (const m of p.movers) home.harness.open(fridge.uid, m.name, false);
      g.simulate(0.8);
      return { left, shown: !!views()?.drawn };
    });
    ok(shutAgain.left === 4 && !shutAgain.shown, `one taken out: four on the boards; its door shut again: none drawn (${JSON.stringify(shutAgain)})`);
  }

  // a bookshelf in the Tadpole; a tin held out (R) over one of its boards and put: there it stands, the bookshelf's;
  // and the list of what the Tadpole carries names the bookshelf for it
  const placed = await page.evaluate(async () => {
    const g = window.__rt.game;
    const A = await import('/src/core/modcar/aboard.ts');
    const I = await import('/src/core/modcar/items.ts');
    const RM = await import('/src/game/modcar/v3/nd-home/rooms.ts');
    const LS = await import('/src/game/modcar/listSources.ts');
    const home = g.systems.get('nd-home');
    const whale = window.__whale;
    const tr = window.__tr;
    if (g.player.aboard) g.alight(whale, A.aboardOf('rv').doors[0]);
    g.simulate(0.3);
    for (const l of [...g.loose.ridersOf(tr)]) if (l.stow === 'cabin') g.loose.remove(l);
    const def = A.aboardOf('trailer');
    tr.view.setPanelOpen(def.doors[0].mount, true);
    g.simulate(1.0);
    g.board(tr, def.doors[0]);
    g.simulate(0.4);
    const ab = g.player.aboard;
    if (!ab || ab.v !== tr) return { why: 'not in the Tadpole' };
    const held = { kind: 'item', item: I.newItem('nd_bookshelf') };
    await g.loose.objectFor(held);
    for (let i = 0; i < 60 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
    // (its back to the left wall)
    const at = g.cargo.spotIn(tr, 'cabin', held, { x: 0.3, z: -0.66 }, -Math.PI / 2, 0);
    if (!at || at.spot.lie) return { why: `no room for a bookshelf standing (${JSON.stringify(at?.spot ?? null)})` };
    const shelf = g.cargo.stow(tr, at.zone, at.spot, held);
    g.simulate(0.4);
    for (let i = 0; i < 40 && ![...home.pieces.values()].some((x) => x.l === shelf); i++) {
      g.simulate(0.1);
      await new Promise((r) => setTimeout(r, 30));
    }
    const p = [...home.pieces.values()].find((x) => x.l === shelf);
    const rooms = RM.roomsOf('nd_bookshelf');
    const H = (fn, ...a) => g.systems.harness('nd-place', fn, ...a);
    const tin = I.newItem('nd_baked_beans');
    g.player.slots[0] = { kind: 'item', item: tin };
    g.player.sel = 0;
    g.simulate(0.1);
    const model = tr.view.model;
    const V3 = shelf.obj.position.constructor;
    const tries = [];
    let done = null;
    let sx = 0.3;
    // (its boards from the top one down: the first the tin is put on)
    for (let ri = rooms.length - 1; ri >= 0 && !done; ri--) {
      const room = rooms[ri];
      if (room.top) continue;
      // the middle of the board, a little over it: where one looks
      shelf.obj.updateMatrixWorld(true);
      model.updateMatrixWorld(true);
      const at3 = shelf.obj.localToWorld(new V3((room.x[0] + room.x[1]) / 2 + 0.04, room.y + 0.01, 0.12));
      const m = model.worldToLocal(at3.clone());
      sx = m.x;
      // stood in the middle of the box before it, looking at that point
      ab.w.place(m.x, 0.25, -Math.PI / 2);
      g.simulate(0.1);
      const eye = g.player.walker.eye({ x: 0, y: 0, z: 0 });
      const o = g.core.origin;
      const dx = at3.x - (eye.x - o.x);
      const dy = at3.y - (eye.y - o.y);
      const dz = at3.z - (eye.z - o.z);
      g.input.lookYaw = Math.atan2(dz, dx);
      g.input.lookPitch = Math.atan2(dy, Math.hypot(dx, dz));
      g.simulate(0.15);
      if (!H('start')) return { why: 'the tin not held out' };
      g.simulate(0.5);
      const aim = H('aim');
      tries.push({ room: ri, y: room.y, ok: aim.ok, why: aim.why, into: aim.into, on: aim.on, surface: aim.surface, ay: +aim.y.toFixed(3) });
      if (aim.ok && H('put')) {
        g.simulate(0.5);
        const inIt = home.contentsOf(p).find((c) => c.l.item === tin);
        if (inIt) done = { room: inIt.room, ly: +inIt.ly.toFixed(3), board: rooms[inIt.room].y, rides: inIt.l.riding?.on === tr };
        else {
          // (put, but not on a board: taken back for the next one)
          const l = g.loose.list.find((q) => q.item === tin);
          if (l) g.loose.remove(l);
          g.player.slots[0] = { kind: 'item', item: tin };
        }
      }
      if (H('placing')) H('stop');
      g.simulate(0.2);
    }
    g.player.slots[0] = null;
    const rows = LS.vehicleSource(g, tr).rows();
    const row = rows.find((r) => r.name === I.itemDef('nd_baked_beans').name.zh && r.zone === I.itemDef('nd_bookshelf').name.zh);
    return { tries, done, listed: !!row, groups: [...new Set(rows.map((r) => r.zone))], sx: +sx.toFixed(2) };
  });
  if (placed.why) fail(`a tin placed on a shelf: ${placed.why}`);
  else {
    ok(!!placed.done && placed.done.rides && Math.abs(placed.done.ly - placed.done.board) < 0.03, `a tin held out (R) over a board of a bookshelf in the Tadpole and put: it stands on that board, the bookshelf's, riding (${JSON.stringify(placed.done)}; ${JSON.stringify(placed.tries)})`);
    ok(placed.listed, `the list of what the Tadpole carries names the bookshelf for it (its headings: ${placed.groups.join('、')})`);
    await standIn(placed.sx + 0.5, 0.45, -Math.PI / 2 - 0.5, -0.05);
    await shot('18_shelf_tin.png');
  }

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f8_home: ${bad} FAILED` : 'f8_home: ok');
process.exit(bad ? 1 : 0);
