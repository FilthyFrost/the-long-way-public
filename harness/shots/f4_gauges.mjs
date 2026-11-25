// F4 (docs/V3/plan/finish.md §五), in the game: the instruments in each of the fourteen cabs. From the driver's seat,
// two pictures of each — looking down the road, and looking at the instruments — and what the plate shows against
// what the vehicle's dashboard data says: the speed and the revs driven up to, the fuel, the lamps (the handbrake,
// the lamps switched on, the main beam), the gear, the odometer, the tyres; at night, lit. Looking at the plate, the
// wheel and her hands on it fade there and the plate comes four tenths bigger; looking away, they are back.
//   SHOTS_GPU=1 node harness/shots/f4_gauges.mjs [frame ...]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const ALL = ['sedan', 'pickup', 'moto', 'van', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino', 'rv', 'turtle', 'elephant', 'camel'];
const FRAMES = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const out = path.join(ROOT, 'loop/shots/f4_gauges');
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
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=600&time=10&weather=clear`, { width: 1280, height: 720 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (f) => {
      await ev(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, f) });
    };
    const has = await ev(() => {
      const g = window.__rt.game;
      g.simulate(1);
      window.__rt.setView('cockpit');
      g.simulate(0.5);
      const c = g.seated.view.cluster;
      return c ? { w: c.width, h: c.height, old: Object.values(g.seated.view.needles).some((n) => n.visible) } : null;
    });
    ok(!!has && !has.old, `${frame}: the instruments' plate is in the cab (${has ? `${(has.w * 100).toFixed(0)} × ${(has.h * 100).toFixed(0)} cm` : 'none'}), the frame's own needles behind it`);
    if (!has) {
      await page.close();
      continue;
    }
    // the mouse stopped, the view stops: her head follows the look at once (a head that came after carried the eye on for
    // half a second, the mark with it — animator.ts lookToward)
    const still = await ev(() => {
      const g = window.__rt.game;
      const cam = g.core.camera;
      const V3 = cam.position.constructor;
      const root = g.seated.view.root;
      // (out of the side window and a little up: nowhere near the instruments, a look at which draws the eye in)
      g.input.lookYaw = 0.9;
      g.input.lookPitch = 0.12;
      g.step(1 / 60, 1);
      // (in the vehicle's own space: where the eye is and where it looks)
      const at = () => {
        cam.updateMatrixWorld();
        root.updateWorldMatrix(true, false);
        const inv = root.matrixWorld.clone().invert();
        return { p: cam.getWorldPosition(new V3()).applyMatrix4(inv), d: cam.getWorldDirection(new V3()).transformDirection(inv) };
      };
      const a = at();
      let moved = 0;
      let turned = 0;
      for (let i = 0; i < 45; i++) {
        g.step(1 / 60, 1);
        const b = at();
        moved = Math.max(moved, a.p.distanceTo(b.p));
        turned = Math.max(turned, a.d.angleTo(b.d));
      }
      g.input.lookYaw = 0;
      g.input.lookPitch = 0;
      g.simulate(0.2);
      return { moved, turned };
    });
    ok(still.moved < 0.006 && still.turned < 0.006, `${frame}: the mouse stopped, the view stops: in the three quarters of a second after, the eye moved ${(still.moved * 1000).toFixed(1)} mm and turned ${((still.turned * 180) / Math.PI).toFixed(2)}°`);
    // driven up to speed: the needles against the data
    await ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      v.sim.setParkBrake(false);
      g.scripted = { steer: 0, throttle: 0.7, brake: 0, handbrake: 0 };
      for (let t = 0; t < 9; t += 1 / 60) g.step(1 / 60, 1);
      g.scripted = { steer: 0, throttle: 0.35, brake: 0, handbrake: 0 };
      for (let t = 0; t < 1.5; t += 1 / 60) g.step(1 / 60, 1);
    });
    await shot(`${frame}_1_road.png`);
    const read = await ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      const c = v.view.cluster;
      const d = v.sys.dash;
      return { kmh: v.sim.kmh, needle: c.reading('speed') * 180, rpm: d.rpm, rpmNeedle: c.reading('rpm') * 8000, fuel: d.fuel, fuelNeedle: c.reading('fuel'), gear: d.gearLabel, odo: d.odoKm, shown: c.shown };
    });
    ok(
      read.kmh > 25 && Math.abs(read.needle - read.kmh) < 4 && Math.abs(read.rpmNeedle - read.rpm) < 350 && Math.abs(read.fuelNeedle - read.fuel) < 0.05 && read.odo > 0.05 && read.shown.includes(`|${read.gear}|`),
      `${frame}: at ${read.kmh.toFixed(0)} km/h the speedometer reads ${read.needle.toFixed(0)}, the rev counter ${read.rpmNeedle.toFixed(0)} of ${read.rpm.toFixed(0)}, the fuel ${read.fuelNeedle.toFixed(2)} of ${read.fuel.toFixed(2)}, the gear ${read.gear}, the odometer ${read.odo.toFixed(2)} km`,
    );
    // looking at the instruments: where the plate's middle is from the eye
    // (the wheel's blended programs are compiled in the background while one sits at it: given the time)
    await page.waitForTimeout(500);
    const look = await ev(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0.3, brake: 0, handbrake: 0 };
      const cam = g.core.camera;
      const V3 = cam.position.constructor;
      const cl = g.seated.view.cluster;
      const c = cl.group.getWorldPosition(new V3());
      let best = null;
      for (let yaw = -0.7; yaw <= 0.7; yaw += 0.02) {
        for (let pitch = -1.0; pitch <= 0.1; pitch += 0.02) {
          g.input.lookYaw = yaw;
          g.input.lookPitch = pitch;
          g.simulate(0);
          cam.updateMatrixWorld();
          const q = c.clone().applyMatrix4(cam.matrixWorldInverse.copy(cam.matrixWorld).invert());
          const e = Math.hypot(q.x, q.y) / Math.max(0.01, -q.z);
          if (-q.z > 0 && (!best || e < best.e)) best = { e, yaw, pitch };
        }
      }
      g.input.lookYaw = best.yaw;
      g.input.lookPitch = best.pitch;
      // how wide the plate is on the screen (px of 1280)
      const wide = () => {
        cam.updateMatrixWorld();
        cl.group.updateWorldMatrix(true, false);
        const a = new V3(-cl.width / 2, 0, 0).applyMatrix4(cl.group.matrixWorld).project(cam);
        const b = new V3(cl.width / 2, 0, 0).applyMatrix4(cl.group.matrixWorld).project(cam);
        return Math.abs(b.x - a.x) * 640;
      };
      g.simulate(0);
      const k0 = g.gaugeLook;
      const w0 = wide();
      // (a tenth of a second on it: not yet; a second: all the way)
      for (let t = 0; t < 0.1; t += 1 / 60) g.step(1 / 60, 1);
      const kEarly = g.gaugeLook;
      for (let t = 0; t < 1; t += 1 / 60) g.step(1 / 60, 1);
      const wheel = g.seated.view.mats.lookOf('m:steering');
      const arm = g.her.rig?.arms?.l?.material?.uniforms?.uSeeK?.value?.x ?? -1;
      // what of the instruments the cab's own body stands before, from the eye as it is now (the wheel is looked
      // through): points on every dial and every cell of the strip
      const view = g.seated.view;
      cam.updateMatrixWorld();
      cl.group.updateWorldMatrix(true, true);
      const eye = cam.getWorldPosition(new V3());
      const within = (o, root) => {
        for (let p = o; p; p = p.parent) if (p === root) return true;
        return false;
      };
      const shownAll = (o) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
      };
      const steer = view.shown.get('steering')?.holder ?? null;
      const body = [];
      const mine = [];
      view.root.traverse((o) => {
        if (!o.isMesh || !shownAll(o)) return;
        if (within(o, cl.group)) mine.push(o);
        else if (!steer || !within(o, steer)) body.push(o);
      });
      const ray = { ray: { origin: eye, direction: new V3() }, near: 0, far: 1, params: {}, firstHitOnly: false };
      const blocked = (p, meshes, short) => {
        const dir = p.clone().sub(eye);
        ray.far = dir.length() - short;
        ray.ray.direction.copy(dir.normalize());
        for (const m of meshes) {
          const hits = [];
          m.raycast(ray, hits);
          if (hits.length) return true;
        }
        return false;
      };
      const kk = (cl.spec.scale ?? 1) / 100;
      const L = cl.layout;
      const pts = [];
      for (const d of L.dials) {
        pts.push([d.x, d.y]);
        for (let i = 0; i < 8; i++) pts.push([d.x + Math.cos((i * Math.PI) / 4) * d.r * 0.75, d.y + Math.sin((i * Math.PI) / 4) * d.r * 0.75]);
      }
      for (const c2 of L.cells) for (const f of [0.25, 0.5, 0.75]) pts.push([c2.x + c2.w * f, L.stripY]);
      let hid = 0;
      for (const [x, y] of pts) if (blocked(new V3(x * kk, y * kk, 0.001).applyMatrix4(cl.group.matrixWorld), body, 0.004)) hid++;
      // the key: of what the eye sees of it past the cab and the wheel, how much the plate and its case leave in sight
      let seen = 0;
      let kept = 0;
      for (const [mount, sh] of view.shown) {
        if ((view.catOf.get(mount) ?? '') !== 'ignition') continue;
        const others = body.filter((m) => !within(m, sh.holder));
        const wheelMeshes = [];
        steer?.traverse((o) => {
          if (o.isMesh) wheelMeshes.push(o);
        });
        sh.holder.traverse((o) => {
          if (!o.isMesh || !shownAll(o)) return;
          const pos = o.geometry.getAttribute('position');
          o.updateWorldMatrix(true, false);
          const step = Math.max(1, Math.floor(pos.count / 40));
          for (let i = 0; i < pos.count; i += step) {
            const p = new V3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (blocked(p, others, 0.012) || blocked(p, wheelMeshes, 0.012)) continue;
            seen++;
            if (!blocked(p, mine, 0.012)) kept++;
          }
        });
      }
      return { k0, kEarly, k: g.gaugeLook, w0, w1: wide(), wheel: wheel ? wheel.shared.uSeeThrough.value.x : -1, box: wheel ? wheel.shared.uSeeThrough.value.y : -1, arm, best, hid: hid / pts.length, seen, kept };
    });
    ok(
      look.k0 === 0 && look.kEarly === 0 && look.k > 0.99 && look.w1 / look.w0 > 1.33 && look.w1 / look.w0 < 1.47 && look.wheel > 0.99 && look.box === 1 && (look.arm > 0.99 || look.arm === -1),
      `${frame}: the mark on the instruments: after a tenth of a second nothing yet (${look.kEarly.toFixed(2)}), after a second the wheel faded there (${look.wheel.toFixed(2)}, her hands ${look.arm.toFixed(2)}) and the plate ${(look.w1 / look.w0).toFixed(2)} times as wide (${look.w0.toFixed(0)} → ${look.w1.toFixed(0)} px)`,
    );
    await shot(`${frame}_2_gauges.png`);
    // nothing of the cab's own before the instruments (a tenth of their points at most: the column's end), and the
    // key still in sight where it was (the plate has a bite out of it for it where it must)
    ok(look.hid <= 0.1 && (look.seen < 8 || look.kept >= look.seen * 0.6), `${frame}: the cab's own body stands before ${(look.hid * 100).toFixed(0)} % of the instruments; of the key's ${look.seen} points in sight the plate leaves ${look.kept}`);
    // looking away: the wheel whole again within two thirds of a second, the view as it was
    const away = await ev((best) => {
      const g = window.__rt.game;
      g.input.lookYaw = best.yaw + 0.9;
      g.input.lookPitch = 0;
      for (let t = 0; t < 0.25; t += 1 / 60) g.step(1 / 60, 1);
      const still = g.gaugeLook;
      for (let t = 0; t < 0.45; t += 1 / 60) g.step(1 / 60, 1);
      const wheel = g.seated.view.mats.lookOf('m:steering');
      const out = { still, k: g.gaugeLook, wheel: wheel ? wheel.shared.uSeeThrough.value.x : -1 };
      g.input.lookYaw = 0;
      g.simulate(0.2);
      return out;
    }, look.best);
    ok(away.still > 0.99 && away.k === 0 && away.wheel === 0, `${frame}: looking away: still in after a quarter of a second (${away.still.toFixed(2)}), over after seven tenths (${away.k.toFixed(2)}, the wheel ${away.wheel.toFixed(2)})`);
    // the corner of the screen: nothing of the vehicle's in the cab (its instruments are there); from outside, its speed
    // and its fuel; asked for (the assist), all of it in the cab as well
    const corner = await ev(() => {
      const g = window.__rt.game;
      const el = document.querySelector('.mc-dash');
      const see = () => {
        g.simulate(0.1);
        const shown = getComputedStyle(el).display !== 'none';
        const vis = (sel) => shown && !!el.querySelector(sel) && getComputedStyle(el.querySelector(sel)).display !== 'none';
        return { shown, compact: el.classList.contains('compact'), spd: shown ? el.querySelector('.spd')?.textContent : '', fuel: vis('.fuelBar'), gear: vis('.gear'), lamps: vis('.lamps'), tyres: vis('.tyres'), kmh: Math.abs(g.seated.sim.kmh) };
      };
      const cab = see();
      window.__rt.setView('chase');
      const out = see();
      window.__rt.setView('cockpit');
      g.assists.screenDash = true;
      const asked = see();
      g.assists.screenDash = false;
      g.simulate(0.1);
      return { cab, out, asked };
    });
    ok(
      !corner.cab.shown && corner.out.shown && corner.out.compact && Math.abs(Number(corner.out.spd) - corner.out.kmh) < 3 && corner.out.fuel && !corner.out.gear && !corner.out.lamps && !corner.out.tyres && corner.asked.shown && !corner.asked.compact && corner.asked.gear && corner.asked.lamps,
      `${frame}: the corner of the screen: in the cab ${corner.cab.shown ? 'the panel' : 'nothing'}; from outside the speed (${corner.out.spd}) and the fuel${corner.out.gear || corner.out.lamps ? ' and more' : ' alone'}; with the assist on, all of it in the cab (${corner.asked.shown && corner.asked.gear ? 'yes' : 'no'})`,
    );
    // the lamps: the handbrake, the lamps, the main beam; at night, lit
    const lamps = await ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      g.scripted = { steer: 0, throttle: 0, brake: 0.6, handbrake: 0 };
      for (let t = 0; t < 6 && v.sim.speed > 0.05; t += 1 / 60) g.step(1 / 60, 1);
      g.scripted = null;
      v.sim.setParkBrake(true);
      v.sys.lights = 'high';
      g.env.clock.setHour(22.5, g.time);
      g.simulate(1.5);
      const c = v.view.cluster;
      return { shown: c.shown, glow: c.mat.uniforms.uMapEmissive.value, hb: v.sys.dash.handbrake, lights: v.sys.dash.lightsOn };
    });
    await shot(`${frame}_3_night.png`);
    // (the key string: on | the eight lamps in their order — handbrake, oil, battery, temp, fuel, engine, lights, high | …)
    const bits = lamps.shown.split('|')[1] ?? '';
    ok((lamps.hb || frame === 'moto') && lamps.lights && bits[0] === (lamps.hb ? '1' : '0') && bits[6] === '1' && bits[7] === '1' && lamps.glow > 0.4, `${frame}: standing on the handbrake at night with the main beam on: its lamps lit (${bits}), the plate glowing (${lamps.glow.toFixed(2)})`);
    const lastError = await ev(() => window.__rt.lastError);
    if (lastError) fail(`${frame}: a frame threw: ${lastError}`);
    if (errors.length) fail(`${frame}: page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  server.close?.();
}
console.log(bad ? `f4_gauges: ${bad} FAILED` : 'f4_gauges ok');
process.exit(bad ? 1 : 0);
