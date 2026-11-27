// F8 (docs/V3/plan/finish.md §十一 3 验收), in the game — furniture against the walls of every vehicle one loads:
//  - in each of nine load spaces (the Mule's bed, the Loaf's cabin, the Snail's box, the Rhino's box, the Turtle's room,
//    the Whale's, the Old Elephant's, the Camel's, the Tadpole's box; the Buffalo's bed, between its wheel boxes, has no
//    walls of its own) a fridge, a cupboard and a bookshelf — those of them there is room for under its roof — held out
//    near a wall, in a corner, come onto the room's own squares (from its walls' rear left corner) with their backs to
//    the wall and go against it, less than 0.1° off square: against the flat walls of the rooms made square (the
//    Tadpole, the Snail, the Whale) less than 2 mm between the back and the wall, measured on the vehicle's own model
//    by rays from the back's face; against a body's own side (a van's, a canvas tilt's, a bus's, the Old Elephant's
//    bowed lining) against its innermost point;
//  - a piece put beside another stands in line with it, side against side;
//  - driven on a few metres, and taken out of a save and put back, they stand as they stood;
//  - the same in a Snail parked on a slope.
//   SHOTS_GPU=1 node harness/shots/f8_grid.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f8_grid');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));

// each load space: its frame, its place for things, the wall the pieces are stood against (an edge of the place that
// is a wall of the body), whether that wall is flat (a room made square: under 2 mm) or the body's own side (against
// its innermost point, a few centimetres off it elsewhere), where the vehicle stands, how far along the wall from its
// corner the row begins (2 cm: in the corner, against both walls), and where its picture is taken from (an orbit's
// angles, for a body one does not stand in)
const SPACES = [
  ['pickup', 'bed', 'x0', false, 'road', 0.3, [200, 40, 6.5]],
  ['van', 'cabin', 'z0', false, 'road', 0.02, [270, 14, 6.5]],
  ['snail', 'cabin', 'z0', true, 'road', 0.02, null],
  ['rhino', 'bed', 'z0', false, 'road', 0.02, [185, 12, 8]],
  ['turtle', 'cabin', 'x0', false, 'road', 0.02, null],
  ['rv', 'cabin', 'z1', true, 'road', 0.02, null],
  ['elephant', 'cabin', 'z1', false, 'road', 0.02, null],
  ['camel', 'cabin', 'z0', false, 'road', 2.72, null],
  ['trailer', 'cabin', 'z0', true, 'road', 0.02, null],
  ['snail', 'cabin', 'z0', true, 'slope', 0.02, null],
];
const PIECES = ['nd_fridge', 'nd_cabinet', 'nd_bookshelf'];

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=7&start=road&build=stock:sedan&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f);
  };
  // the tools of the page: the rays, the measuring, the putting down
  await page.evaluate(async (PIECES) => {
    const g = window.__rt.game;
    const car = g.vehicles[0];
    car.sim.setParkBrake(true);
    car.sys.stop('');
    g.simulate(1);
    g.getOut();
    g.simulate(0.3);
    const T = await import('/node_modules/.vite/deps/three.js');
    const B = await import('/src/core/modcar/build.ts');
    const C = await import('/src/core/modcar/cargo.ts');
    const I = await import('/src/core/modcar/items.ts');
    const A = await import('/src/core/modcar/aboard.ts');
    const K = await import('/src/game/modcar/v3/camper/index.ts');
    const rc = new T.Raycaster();
    const F = (window.__f8 = { T, B, C, I, A, K, car, v: null, zone: null, meshes: [], vi: -1, side: 'z0', start: 0.02, frame: '' });
    const H = (F.H = (fn, ...a) => g.systems.harness('nd-place', fn, ...a));
    /** the vehicle's own meshes as they are now (its look is rebuilt as it is driven) */
    F.collect = () => {
      F.meshes = [];
      F.v.view.root.traverse((o) => {
        if (o.isMesh && o.visible) F.meshes.push(o);
      });
      F.v.view.root.updateMatrixWorld(true);
    };
    /** the wall's edge of the place, which way is out of the room through it, whether the wall runs along x */
    F.wall = () => {
      const zone = F.zone;
      const alongX = F.side[0] === 'z';
      const edge = F.side === 'x0' ? zone.x[0] : F.side === 'x1' ? zone.x[1] : F.side === 'z0' ? zone.z[0] : zone.z[1];
      return { alongX, edge, outward: F.side[1] === '0' ? -1 : 1, lo: alongX ? zone.x[0] : zone.z[0], hi: alongX ? zone.x[1] : zone.z[1] };
    };
    /** from a point of the model's frame along a way of it: how far to the vehicle's own model (glass passed over) */
    F.cast = (x, y, z, dx, dz, far) => {
      const model = F.v.view.model;
      rc.set(new T.Vector3(x, y, z).applyMatrix4(model.matrixWorld), new T.Vector3(dx, 0, dz).transformDirection(model.matrixWorld));
      rc.far = far;
      for (const h of rc.intersectObjects(F.meshes, false)) {
        const mat = h.object.material;
        const name = (Array.isArray(mat) ? mat[h.face?.materialIndex ?? 0]?.name : mat?.name) ?? '';
        if (h.object.name.includes('glass') || String(name).includes('glass')) continue;
        return h.distance;
      }
      return null;
    };
    /** a rider in the model's frame: its footprint, how far off square, how far its back is from the wall behind it, how far over the floor */
    F.measure = (l) => {
      const model = F.v.view.model;
      const b = g.cargo.boxOf({ kind: 'item', item: l.item });
      model.updateMatrixWorld(true);
      l.obj.updateMatrixWorld(true);
      const toModel = new T.Matrix4().copy(model.matrixWorld).invert().multiply(l.obj.matrixWorld);
      const e = toModel.elements;
      // (its own x in the model's frame: its front; its back the other way)
      const fx = e[0];
      const fz = e[2];
      const len = Math.hypot(fx, fz);
      const deg = (Math.atan2(fz, fx) * 180) / Math.PI;
      const off = Math.abs((((deg % 90) + 90 + 45) % 90) - 45);
      const tilt = (Math.asin(Math.min(1, Math.abs(e[1]) / Math.hypot(e[0], e[1], e[2]))) * 180) / Math.PI;
      let gap = Infinity;
      // (rays from 5 cm inside its back's face, at four heights and three places across it: the least is where it touches)
      for (const hy of [0.06, 0.3, 0.6, 0.9]) {
        for (const wz of [0.15, 0.5, 0.85]) {
          const p = new T.Vector3(b.minX + 0.05, b.minY + (b.maxY - b.minY) * hy, b.minZ + (b.maxZ - b.minZ) * wz).applyMatrix4(toModel);
          const d = F.cast(p.x, p.y, p.z, -fx / len, -fz / len, 0.6);
          if (d !== null) gap = Math.min(gap, d - 0.05);
        }
      }
      const c = [];
      for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) c.push(new T.Vector3(x, b.minY, z).applyMatrix4(toModel));
      const r4 = (u) => +u.toFixed(4);
      const m = { id: l.item.item, gap: Number.isFinite(gap) ? +(gap * 1000).toFixed(2) : null, off: +off.toFixed(3), tilt: +tilt.toFixed(3), up: +((Math.min(...c.map((q) => q.y)) - F.zone.floor) * 1000).toFixed(1), x0: r4(Math.min(...c.map((q) => q.x))), x1: r4(Math.max(...c.map((q) => q.x))), z0: r4(Math.min(...c.map((q) => q.z))), z1: r4(Math.max(...c.map((q) => q.z))) };
      // (along the wall: where it begins and ends)
      const w = F.wall();
      m.a0 = w.alongX ? m.x0 : m.z0;
      m.a1 = w.alongX ? m.x1 : m.z1;
      return m;
    };
    F.riders = () => g.loose.ridersOf(F.v).filter((q) => PIECES.includes(q.item?.item));
    /** a piece held out, landing 1 cm off the wall, 2 cm on from the piece before it (or from where the row begins) */
    F.put = async (id, after) => {
      const zone = F.zone;
      const w = F.wall();
      const item = I.newItem(id);
      const held = { kind: 'item', item };
      await g.loose.objectFor(held);
      for (let i = 0; i < 80 && !g.cargo.boxOf(held); i++) await new Promise((r) => setTimeout(r, 50));
      const b = g.cargo.boxOf(held);
      const deep = b.maxX - b.minX;
      const wide = b.maxZ - b.minZ;
      const along = (after ? after.a1 : w.lo + F.start) + wide / 2 + 0.02;
      const across = w.edge - w.outward * (deep / 2 + 0.01);
      g.player.slots[0] = held;
      g.player.sel = 0;
      g.simulate(0.1);
      if (!H('start')) return { id, why: 'not held out ' + JSON.stringify({ held: !!g.player.held, seated: !!g.seated, pin: !!g.player.pin, aside: !!g.player.aside, aboard: !!g.player.aboard }) };
      H('landAt', F.vi, zone.id, w.alongX ? along : across, w.alongX ? across : along);
      g.simulate(0.4);
      const aim = H('aim');
      const grid = H('grid');
      const fr = H('frame');
      const placed = aim.ok && H('put');
      H('landAt', null);
      if (H('placing')) H('stop');
      g.simulate(0.3);
      if (!placed) {
        g.player.slots[0] = null;
        return { id, why: aim.why || 'not put' };
      }
      const l = g.loose.ridersOf(F.v).find((q) => q.item === item);
      return { ...F.measure(l), grid, own: Math.abs(fr.ox - zone.x[0]) < 1e-6 && Math.abs(fr.oz - zone.z[0]) < 1e-6, stood: true };
    };
    /** stopped, its brake on, out of the seat */
    F.out = () => {
      const v = g.seated;
      if (!v) return true;
      g.scripted = { steer: 0, throttle: 0, brake: 1, handbrake: 1 };
      for (let t = 0; t < 14 && v.sim.speed > 0.2; t += 1 / 60) g.step(1 / 60, 1);
      g.scripted = null;
      v.sim.setParkBrake(true);
      v.sys.stop('');
      g.simulate(0.6);
      g.getOut();
      g.simulate(0.3);
      return !g.seated;
    };
  }, PIECES);

  let total = 0;
  let worstGap = 0;
  let worstDeg = 0;
  let flatN = 0;
  let flatGap = 0;
  for (const [frame, zoneId, side, flat, where, start, orbit] of SPACES) {
    const tag = where === 'slope' ? `${frame} on a slope` : frame;
    const res = await page.evaluate(
      async ({ frame, zoneId, side, where, start, PIECES }) => {
        const g = window.__rt.game;
        const F = window.__f8;
        const { T, B, C, I, A, K, car } = F;
        F.out();
        const yaw = car.sim.yaw;
        let x = car.sim.px + Math.cos(yaw) * 16;
        let z = car.sim.pz + Math.sin(yaw) * 16;
        let heading = yaw;
        let grade = 0;
        if (where === 'slope') {
          // (a slope near by: a tenth to a fifth, much the same for four metres round — found on the ground itself)
          const gy = (px, pz) => g.groundAt(px, pz);
          const grad = (px, pz) => [(gy(px + 2, pz) - gy(px - 2, pz)) / 4, (gy(px, pz + 2) - gy(px, pz - 2)) / 4];
          let best = null;
          for (let r = 20; r <= 90 && !best; r += 5) {
            for (let k = 0; k < 24 && !best; k++) {
              const a = (k / 24) * Math.PI * 2;
              const px = car.sim.px + Math.cos(a) * r;
              const pz = car.sim.pz + Math.sin(a) * r;
              const [gx, gz] = grad(px, pz);
              const m = Math.hypot(gx, gz);
              if (m < 0.1 || m > 0.2) continue;
              let even = true;
              for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
                const [hx, hz] = grad(px + ox, pz + oz);
                if (Math.hypot(hx - gx, hz - gz) > 0.06) even = false;
              }
              if (even) best = { px, pz, gx, gz, m };
            }
          }
          if (!best) return { why: 'no slope found within 90 m' };
          x = best.px;
          z = best.pz;
          // (standing half across it: pitched and rolled both)
          heading = Math.atan2(best.gz, best.gx) + Math.PI / 3;
          grade = best.m;
        }
        const v = g.addVehicle(B.stockBuild(frame), x, z, heading);
        v.sim.setParkBrake(true);
        await v.view.ready;
        await v.view.settled();
        g.simulate(2.0);
        F.v = v;
        F.vi = g.vehicles.indexOf(v);
        F.side = side;
        F.start = start;
        F.frame = frame;
        const zone = (F.zone = C.zonesFor(frame, v.build).find((q) => q.id === zoneId));
        // (the Turtle's roof up: its room is under it)
        if (A.aboardOf(frame)?.roof) {
          K.camper.setUp(v, true);
          g.simulate(2.5);
        }
        // (what it came fitted with that stands in the room — the Old Elephant's sofa — carried out first)
        for (const l of [...g.loose.ridersOf(v)]) if (l.item && I.itemDef(l.item.item).cat === 'furniture') g.loose.remove(l);
        g.simulate(0.3);
        F.collect();
        const model = v.view.model;
        const up = new T.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
        const lean = (Math.acos(Math.min(1, up.y)) * 180) / Math.PI;
        // the wall itself along the place's edge: how far its face is from the edge (mm; less than none: into the place)
        const w = F.wall();
        const wall = [];
        for (const h of [0.12, 0.45, 0.8]) {
          if (zone.floor + h > zone.top - 0.05) continue;
          for (let k = 0; k < 14; k++) {
            const c = w.lo + 0.1 + ((k + 0.5) / 14) * (w.hi - w.lo - 0.2);
            const inside = w.edge - w.outward * 0.3;
            const d = F.cast(w.alongX ? c : inside, zone.floor + h, w.alongX ? inside : c, w.alongX ? 0 : w.outward, w.alongX ? w.outward : 0, 1.2);
            if (d !== null) wall.push(+((d - 0.3) * 1000).toFixed(1));
          }
        }
        // the fridge by the wall where the row begins, the cupboard beside it, the bookshelf beside that
        const done = [];
        let last = null;
        for (const id of PIECES) {
          const d = await F.put(id, last);
          done.push(d);
          if (d.stood) last = d;
        }
        // two along the wall: side against side
        const stood = done.filter((d) => d.stood).sort((a, b) => a.a0 - b.a0);
        const beside = [];
        for (let i = 1; i < stood.length; i++) beside.push(+((stood[i].a0 - stood[i - 1].a1) * 1000).toFixed(2));
        // (in the corner: its side against the wall the row begins at)
        const corner = stood.length && start < 0.04 ? +((stood[0].a0 - w.lo) * 1000).toFixed(2) : null;
        F.before = F.riders().map((l) => F.measure(l));
        return { vi: F.vi, walls: !!zone.walls, size: [+(zone.x[1] - zone.x[0]).toFixed(3), +(zone.z[1] - zone.z[0]).toFixed(3)], lean: +lean.toFixed(1), grade: +grade.toFixed(3), kmh: +(v.sim.speed * 3.6).toFixed(2), wall: wall.length ? [Math.min(...wall), Math.max(...wall), wall.length] : null, done, beside, corner };
      },
      { frame, zoneId, side, where, start, PIECES },
    );
    if (res.why) {
      fail(`${tag}: ${res.why}`);
      continue;
    }
    const stood = res.done.filter((d) => d.stood);
    const skipped = res.done.filter((d) => !d.stood);
    total += stood.length;
    for (const d of stood) {
      worstGap = Math.max(worstGap, Math.abs(d.gap ?? 999));
      worstDeg = Math.max(worstDeg, d.off, d.tilt);
    }
    const words = stood.map((d) => `${d.id.replace('nd_', '')} ${d.gap} mm, ${d.off}°${Math.abs(d.up) > 5 ? `, ${d.up} mm over the floor` : ''}`).join('; ');
    // (a flat wall: under 2 mm; a body's own side: against its innermost point, never into it, 4 cm off it at the most)
    ok(
      res.walls && stood.length >= 1 && stood.every((d) => d.gap !== null && (flat ? Math.abs(d.gap) < 2 : d.gap > -2 && d.gap < 40) && d.off < 0.1 && d.tilt < 0.1 && d.grid && d.own),
      `${tag} (${res.size[0]} × ${res.size[1]} m, ${flat ? 'flat walls' : "the body's own sides"}${where === 'slope' ? `, the ground ${Math.round(res.grade * 100)} in a hundred, leaning ${res.lean}°, ${res.kmh} km/h` : ''}), on the room's own squares, backs to the wall: ${words}${skipped.length ? ` — no room for: ${skipped.map((d) => `${d.id.replace('nd_', '')} (${d.why})`).join(', ')}` : ''} · the wall along that edge ${res.wall ? `${res.wall[0]}…${res.wall[1]} mm from it` : 'not met'}`,
    );
    if (where === 'slope') ok(res.lean > 4 && res.kmh < 0.5, `${tag}: it stands leaning ${res.lean}° and does not creep`);
    if (flat) {
      flatN += stood.length;
      for (const d of stood) flatGap = Math.max(flatGap, Math.abs(d.gap ?? 999));
      ok(res.wall && res.wall[0] > -2, `${tag}: nothing of the wall along that edge comes more than 2 mm into the place (${res.wall ? res.wall[0] : '—'} mm at the most)`);
    }
    if (res.corner !== null) ok(Math.abs(res.corner) < 2, `${tag}: in the corner, its side against the other wall (${res.corner} mm from it)`);
    if (res.beside.length) ok(res.beside.every((b) => Math.abs(b) < 2), `${tag}: side against side (${res.beside.join(', ')} mm between them)`);

    // looked at: from inside a room one stands in, from outside an open one
    if (stood.length) {
      const pose = await page.evaluate(async () => {
        const g = window.__rt.game;
        const F = window.__f8;
        const def = F.A.aboardOf(F.frame);
        const v = F.v;
        if (!def) return { room: false };
        const door = def.doors[0];
        v.view.setPanelOpen(door.mount, true);
        g.simulate(1.0);
        g.board(v, door);
        g.simulate(0.4);
        const ab = g.player.aboard;
        if (!ab) return { room: true, aboard: false };
        const w = F.wall();
        const mid = (F.before[0].a0 + F.before[F.before.length - 1].a1) / 2;
        // (stood on the room's own floor, as far from that wall as it lets one, a step along from them)
        let best = null;
        for (const a of def.areas) {
          const lo = w.alongX ? a.x0 : a.z0;
          const hi = w.alongX ? a.x1 : a.z1;
          const along = Math.min(hi - 0.2, Math.max(lo + 0.2, mid + 1.3));
          const across = w.outward < 0 ? (w.alongX ? a.z1 : a.x1) - 0.2 : (w.alongX ? a.z0 : a.x0) + 0.2;
          const far = Math.abs(across - w.edge) + Math.abs(along - mid) * 0.5;
          if (!best || far > best.far) best = { sx: w.alongX ? along : across, sz: w.alongX ? across : along, far };
        }
        const at = w.edge - w.outward * 0.3;
        const yaw = Math.atan2((w.alongX ? at : mid) - best.sz, (w.alongX ? mid : at) - best.sx);
        ab.w.place(best.sx, best.sz, yaw);
        g.input.lookYaw = ab.heading() + yaw;
        g.input.lookPitch = -0.22;
        g.simulate(0.2);
        return { room: true, aboard: true };
      });
      if (pose.room && pose.aboard) {
        await rt('setView', 'cockpit');
        await shot(`${frame}${where === 'slope' ? '_slope' : ''}.png`);
        await page.evaluate(() => {
          const g = window.__rt.game;
          const F = window.__f8;
          const door = F.A.aboardOf(F.frame).doors[0];
          g.alight(F.v, door);
          g.simulate(0.3);
          F.v.view.setPanelOpen(door.mount, false);
          g.simulate(0.8);
        });
      } else {
        if (pose.room) fail(`${tag}: not walked into for its picture`);
        const open = (on) =>
          page.evaluate((on) => {
            const F = window.__f8;
            for (const p of ['trunk', 'door_side']) if (F.v.view.hasPanel(p)) F.v.view.setPanelOpen(p, on);
            window.__rt.game.simulate(0.8);
          }, on);
        await open(true);
        const [az, el, dist] = orbit ?? [180, 25, 7];
        await rt('setOrbit', az, el, dist, 1.4, res.vi);
        await shot(`${frame}.png`);
        await open(false);
      }
    }

    // driven on a few metres (a trailer stays, and the one on the slope), then out of a save and back: as they stood
    const after = await page.evaluate(
      async ({ where }) => {
        const g = window.__rt.game;
        const F = window.__f8;
        const v = F.v;
        // (where they stand in the vehicle's own frame, to a millimetre; the wall behind them — a tailgate shut again — to one too)
        const same = (a, b) => a.length === b.length && a.every((m, i) => Math.abs((m.gap ?? 999) - (b[i].gap ?? 999)) < 1 && Math.abs(m.off - b[i].off) < 0.02 && Math.abs(m.x0 - b[i].x0) < 0.001 && Math.abs(m.z0 - b[i].z0) < 0.001 && Math.abs(m.up - b[i].up) < 1);
        let moved = 0;
        let why = '';
        if (!v.view.frame.towed && where !== 'slope') {
          const x0 = v.sim.px;
          const z0 = v.sim.pz;
          if (F.A.aboardOf(F.frame)?.roof) {
            F.K.camper.setUp(v, false);
            g.simulate(3.0);
          }
          window.__rt.enter(F.vi);
          if (g.seated !== v) why = 'not in its seat';
          for (let k = 0; k < 6 && !v.sys.running; k++) window.__rt.crank(1.6);
          if (!v.sys.running) why = why || 'its engine did not start';
          v.sim.setParkBrake(false);
          g.scripted = { steer: 0.1, throttle: 0.6, brake: 0, handbrake: 0 };
          for (let t = 0; t < 3.5; t += 1 / 60) g.step(1 / 60, 1);
          g.scripted = null;
          if (!F.out()) why = why || 'not out of the seat';
          moved = +Math.hypot(v.sim.px - x0, v.sim.pz - z0).toFixed(1);
        }
        F.collect();
        const afterDrive = F.riders().map((l) => F.measure(l));
        const saved = JSON.parse(JSON.stringify(g.ridersSaved(v)));
        for (const l of [...g.loose.ridersOf(v)]) g.loose.remove(l);
        g.restoreRiders(v, saved, F.A.roomRev(F.frame));
        for (let i = 0; i < 60; i++) {
          g.simulate(0.1);
          await new Promise((r) => setTimeout(r, 30));
          if (F.riders().length === F.before.length && F.riders().every((l) => l.obj && l.obj.children.length)) break;
        }
        g.simulate(0.4);
        F.collect();
        const afterSave = F.riders().map((l) => F.measure(l));
        const drove = same(F.before, afterDrive);
        const kept = same(F.before, afterSave);
        const brief = (list) => list.map((m) => `${m.id.replace('nd_', '')} ${m.gap}/${m.off}/${m.x0}/${m.z0}/${m.up}`).join(' ');
        const res = { moved, why, drove, kept, detail: drove && kept ? '' : `before ${brief(F.before)} | driven ${brief(afterDrive)} | loaded ${brief(afterSave)}` };
        // (gone, for the next one's turn)
        for (const l of [...g.loose.ridersOf(v)]) g.loose.remove(l);
        g.removeVehicle(v);
        g.simulate(0.3);
        return res;
      },
      { where },
    );
    ok(!after.why && after.drove && after.kept, `${tag}: ${after.moved ? `driven on ${after.moved} m and ` : ''}taken out of a save and put back, they stand as they stood${after.why ? ` — ${after.why}` : ''}${after.detail ? ` — ${after.detail}` : ''}`);
  }
  ok(total >= 18 && flatN >= 10 && flatGap < 2 && worstDeg < 0.1, `${total} pieces stood against walls in ${SPACES.length} load spaces, at most ${worstDeg.toFixed(3)}° off square; ${flatN} of them against the flat walls of the rooms made square: at most ${flatGap.toFixed(2)} mm off the wall (against a body's own side: ${worstGap.toFixed(1)} mm at the most)`);

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f8_grid: ${bad} FAILED` : 'f8_grid: ok');
process.exit(bad ? 1 : 0);
