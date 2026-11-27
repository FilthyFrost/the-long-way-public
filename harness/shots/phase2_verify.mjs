// Playtest Round 2 Phase 2 real-browser GPU walkthrough + 720p gameplay video recording (#3, #10, #18, #23, #28)
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, startServer } from './lib.mjs';

const OUT = 'D:/cindy-scratch/phase2-verify';
const VID_DIR = path.join(OUT, 'videos');
fs.mkdirSync(VID_DIR, { recursive: true });

let bad = 0;
function ok(cond, msg) {
  console.log((cond ? 'ok   ' : 'FAIL ') + msg);
  if (!cond) bad++;
}

async function openRecorded(browser, url, videoName) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VID_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 60000 });
  return {
    ctx,
    page,
    errors,
    async finish() {
      const vp = await page.video()?.path();
      await ctx.close();
      if (vp && fs.existsSync(vp)) {
        const dest = path.join(VID_DIR, `${videoName}.webm`);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(vp, dest);
        console.log('vid  ' + dest);
        return dest;
      }
      return null;
    },
  };
}

/** Step smoothly at ~30fps real-time cadence so recorded videos play naturally and fluidly */
async function playSec(page, sec, fn) {
  const steps = Math.max(1, Math.round(sec * 30));
  for (let i = 0; i < steps; i++) {
    if (fn) await fn(i, steps);
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.frame(1 / 30);
    });
    await page.waitForTimeout(22);
  }
}

async function waitModels(page, ms = 1200) {
  await page.waitForTimeout(ms);
  await playSec(page, 0.25);
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  console.log('shot ' + p);
}

const { server, url } = await startServer();
const browser = await launchBrowser();

try {
  // ================================================================ PART A: #3 TURTLE HIGH-TOP WALK-IN & REAR STANDING
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:turtle&s=900&time=11&weather=clear`,
      '01_turtle_hightop_walkin',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);

    // Exit driver seat, stand outside right side looking at tall sliding door & high-top silhouette
    await page.keyboard.down('KeyQ');
    await playSec(page, 0.5);
    await page.keyboard.up('KeyQ');
    await playSec(page, 0.2);

    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.view.setPanelOpen('door_side', 1);
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const toW = (mx, my, mz) => ({
        x: v.sim.px + b[0] * (mx - cg.x) + b[3] * (my - cg.y) + b[6] * (mz - cg.z),
        y: v.sim.py + b[1] * (mx - cg.x) + b[4] * (my - cg.y) + b[7] * (mz - cg.z),
        z: v.sim.pz + b[2] * (mx - cg.x) + b[5] * (my - cg.y) + b[8] * (mz - cg.z),
      });
      const out = toW(-0.85, 0.0, 3.6);
      const tgt = toW(-0.85, 1.35, 0.0);
      const yaw = Math.atan2(tgt.z - out.z, tgt.x - out.x);
      g.player.walker.place(out.x, out.z, yaw);
      g.input.lookYaw = yaw;
      g.input.lookPitch = -0.04;
    });
    await playSec(page, 0.6);
    await shot(page, '01_turtle_hightop_exterior');

    // Move just outside open sliding door and WALK STRAIGHT IN standing upright (W key, roof CLOSED!)
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const toW = (mx, my, mz) => ({
        x: v.sim.px + b[0] * (mx - cg.x) + b[3] * (my - cg.y) + b[6] * (mz - cg.z),
        y: v.sim.py + b[1] * (mx - cg.x) + b[4] * (my - cg.y) + b[7] * (mz - cg.z),
        z: v.sim.pz + b[2] * (mx - cg.x) + b[5] * (my - cg.y) + b[8] * (mz - cg.z),
      });
      const approach = toW(-0.85, 0.0, 1.75);
      const inside = toW(-0.85, 0.42, 0.0);
      const yaw = Math.atan2(inside.z - approach.z, inside.x - approach.x);
      g.player.walker.place(approach.x, approach.z, yaw);
      g.input.lookYaw = yaw;
      g.input.lookPitch = -0.06;
    });
    await page.keyboard.down('KeyW');
    await playSec(page, 1.1);
    await page.keyboard.up('KeyW');

    const walkIn = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const m = v.walkSolids.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
      return {
        inside: v.walkSolids.insideLiving(w.x, w.y, w.z),
        roofT: v.view.roofT,
        crouch: w.crouch,
        m: { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) },
      };
    });
    ok(walkIn.inside && walkIn.roofT < 0.05 && !walkIn.crouch, `#3 walked straight into Turtle standing upright with roof closed (${JSON.stringify(walkIn)})`);

    // Turn aft toward rear decks and walk onto the rear axle + engine deck standing upright!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const b = new Float64Array(9);
      v.sim.basis(b);
      const yawAft = Math.atan2(-b[2], -b[0]);
      g.input.lookYaw = yawAft;
      g.input.lookPitch = -0.14;
    });
    await page.keyboard.down('KeyW');
    await playSec(page, 1.2);
    await page.keyboard.up('KeyW');
    await playSec(page, 0.3);

    const rearStand = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const m = v.walkSolids.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
      // Turn forward so screenshot shows the spacious high-top Turtle interior from the rear standing deck!
      const b = new Float64Array(9);
      v.sim.basis(b);
      g.input.lookYaw = Math.atan2(b[2], b[0]);
      g.input.lookPitch = -0.06;
      return {
        inside: v.walkSolids.insideLiving(w.x, w.y, w.z),
        m: { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) },
      };
    });
    await playSec(page, 0.45);
    await shot(page, '02_turtle_walkin_and_rear_standing');
    ok(rearStand.inside && rearStand.m.x < -1.4 && rearStand.m.y >= 0.72, `#3 standing upright on Turtle rear deck (${JSON.stringify(rearStand)})`);
    ok(errors.length === 0, `Turtle console clean (${errors.length} errors)`);
    await ses.finish();
  }

  // ================================================================ PART B: #10 CAMEL OPEN DRIVER CAB & FLAT REAR FLOOR
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:camel&s=900&time=11&weather=clear`,
      '02_camel_cab_and_flat_floor',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);

    // Panoramic driver cab sweep: straight ahead, then slight left/right look
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.input.lookYaw = 0;
      g.input.lookPitch = -0.08;
    });
    await playSec(page, 0.5);
    await shot(page, '03_camel_open_driver_cab');
    await playSec(page, 0.7, (i, n) =>
      page.evaluate(([k]) => {
        window.__rt.game.input.lookYaw = Math.sin(k * Math.PI * 2) * 0.45;
      }, [i / n]),
    );

    // Step out of seat into flat rear bus cabin, pan down over completely flat floor (where rear wheel humps used to be!)
    await page.keyboard.down('KeyQ');
    await playSec(page, 0.5);
    await page.keyboard.up('KeyQ');
    await playSec(page, 0.25);

    const camelRear = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const toW = (mx, my, mz) => ({
        x: v.sim.px + b[0] * (mx - cg.x) + b[3] * (my - cg.y) + b[6] * (mz - cg.z),
        y: v.sim.py + b[1] * (mx - cg.x) + b[4] * (my - cg.y) + b[7] * (mz - cg.z),
        z: v.sim.pz + b[2] * (mx - cg.x) + b[5] * (my - cg.y) + b[8] * (mz - cg.z),
      });
      const pStand = toW(-0.6, 0.84, 0.0);
      const yawAft = Math.atan2(-b[2], -b[0]);
      g.player.walker.place(pStand.x, pStand.z, yawAft);
      g.player.walker.y = pStand.y;
      g.input.lookYaw = yawAft;
      g.input.lookPitch = -0.22;
      // Place a kitchen stand & cabinet right over the rear axle (x = -2.85) flush along the flat bus walls!
      const busRotY = Math.atan2(-b[2], b[0]);
      const p1 = toW(-2.85, 0.84, 0.76);
      const ks = g.loose.addItem({ uid: 'p2-camel-ks', item: 'nd_kitchen_stand', qty: 1 }, p1.x, p1.y, p1.z, busRotY);
      g.loose.ride(ks, v);
      const p2 = toW(-2.85, 0.84, -0.76);
      const cab = g.loose.addItem({ uid: 'p2-camel-cab', item: 'nd_cabinet', qty: 1 }, p2.x, p2.y, p2.z, busRotY + Math.PI);
      g.loose.ride(cab, v);
      return true;
    });
    await waitModels(page, 1000);
    await shot(page, '04_camel_flat_floor_rear');

    // Walk toward rear & jump 3 times to prove zero clipping out of Camel interior
    await page.keyboard.down('KeyW');
    await playSec(page, 0.9);
    await page.keyboard.up('KeyW');
    for (let j = 0; j < 3; j++) {
      await page.keyboard.down('Space');
      await playSec(page, 0.12);
      await page.keyboard.up('Space');
      await playSec(page, 0.45);
    }
    const camelIn = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const m = v.walkSolids.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
      return { inside: v.walkSolids.insideLiving(w.x, w.y, w.z), y: +m.y.toFixed(2) };
    });
    ok(camelRear && camelIn.inside && camelIn.y >= 0.8, `#10 Camel flat 0.84 m floor + interior anti-ejection (${JSON.stringify(camelIn)})`);
    ok(errors.length === 0, `Camel console clean (${errors.length} errors)`);
    await ses.finish();
  }

  // ================================================================ PART C: #18 LOWERED CABINET, #23 COMPASS, #28 VINYL & CASSETTE
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:wagon&s=900&time=11&weather=clear`,
      '03_cabinet_compass_vinyl_cassette',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);

    // #28 Cassette deck test FIRST while seated in Wagon with radio_tape fitted!
    const tapeTest = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      // Fit radio_tape into wagon radio mount so we test real cassette deck behavior
      if (v.build.parts.radio) v.build.parts.radio.part = 'radio_tape';
      else v.build.parts.radio = { id: 'p2-deck', part: 'radio_tape', wear: 0, rust: 0, dirt: 0, paint: 0x2f3236, fluids: {}, sub: {} };
      v.changed();
      return true;
    });
    await waitModels(page, 900);

    // Verify empty tape deck rejects FM radio playback, then insert physical nd_tape_08
    const tapeRes = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const nt = g.systems.get('nd-tape');
      const rMount = v.view.frame.mounts.find((m) => m.cat === 'radio');
      g.cockpit.aimed = rMount;
      // Empty hands press + release -> must stay OFF (refuses FM!)
      g.player.slots[0] = null;
      g.player.sel = 0;
      nt.use.press(v, rMount, false);
      nt.use.release(v);
      const emptyRadioOn = v.radioOn;
      // Now hold physical nd_tape_08 and insert via harness / click
      const tapeL = g.loose.addItem({ uid: 'p2-t8', item: 'nd_tape_08', qty: 1 }, v.sim.px, 0, v.sim.pz, 0);
      g.player.slots[0] = { kind: 'item', item: tapeL.item };
      g.loose.remove(tapeL);
      nt.use.press(v, rMount, false);
      nt.use.release(v);
      g.input.lookYaw = 0.42;
      g.input.lookPitch = -0.25;
      return {
        emptyRadioOn,
        insertedTape: v.build.parts.radio?.tape?.item ?? null,
        radioOnAfterInsert: v.radioOn,
      };
    });
    await playSec(page, 0.7);
    await shot(page, '08_cassette_deck_insert');
    ok(
      tapeTest && !tapeRes.emptyRadioOn && tapeRes.insertedTape === 'nd_tape_08' && tapeRes.radioOnAfterInsert,
      `#28 radio_tape refuses empty FM and plays inserted physical cassette (${JSON.stringify(tapeRes)})`,
    );

    // Exit Wagon to open road to demo #18 lowered kitchen stand, #23 circular compass, and #28 physical vinyl turntable!
    await page.keyboard.down('KeyQ');
    await playSec(page, 0.5);
    await page.keyboard.up('KeyQ');
    await playSec(page, 0.25);

    // Setup lowered kitchen stand (0.722 m) + cassette stove + frying pan + turntable right ahead of player
    await page.evaluate(() => {
      const g = window.__rt.game;
      const w = g.player.walker;
      const yaw = g.input.lookYaw + Math.PI;
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const px = w.x + fx * 3.5;
      const pz = w.z + fz * 3.5;
      w.place(px, pz, yaw);
      const tx = px + fx * 0.95;
      const tz = pz + fz * 0.95;
      const ks = g.loose.addItem({ uid: 'p2-ks', item: 'nd_kitchen_stand', qty: 1 }, tx, w.y, tz, -yaw + Math.PI);
      g.loose.seat(ks, w.y);
      // Place stove + pan on left side, turntable on right side of lowered 0.722 m worktop
      const rx = -fz;
      const rz = fx;
      const st = g.loose.addItem({ uid: 'p2-stove', item: 'kit_stove', qty: 1 }, tx - rx * 0.34, w.y + 0.722, tz - rz * 0.34, -yaw + Math.PI);
      g.loose.seat(st, w.y + 0.722);
      const pan = g.loose.addItem({ uid: 'p2-pan', item: 'kit_pan', qty: 1 }, tx - rx * 0.34, w.y + 0.81, tz - rz * 0.34, -yaw + Math.PI);
      g.loose.seat(pan, w.y + 0.81);
      const rec = g.loose.addItem({ uid: 'p2-rec', item: 'junk_record', qty: 1 }, tx + rx * 0.32, w.y + 0.722, tz + rz * 0.32, -yaw + Math.PI);
      g.loose.seat(rec, w.y + 0.722);
      g.input.lookYaw = yaw;
      g.input.lookPitch = -0.52; // natural downward cooking gaze from 1.58 m eye onto 0.722 m counter!
    });
    await waitModels(page, 1200);
    await shot(page, '05_lowered_kitchen_stand_eyeview');

    // #23 Circular brass compass held face-on: pan smoothly left & right so video shows live North needle tracking!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const c = g.loose.addItem({ uid: 'p2-comp', item: 'nd_compass', qty: 1 }, g.player.walker.x, 0, g.player.walker.z, 0);
      g.player.slots[0] = { kind: 'item', item: c.item };
      g.loose.remove(c);
      g.player.sel = 0;
      g.input.lookPitch = -0.14;
    });
    await waitModels(page, 800);
    await playSec(page, 0.6); // let lid bounce fully open & needle settle
    await shot(page, '06_compass_circular_faceon');
    const baseYaw = await page.evaluate(() => window.__rt.game.input.lookYaw);
    await playSec(page, 0.9, (i, n) =>
      page.evaluate(([y]) => {
        window.__rt.game.input.lookYaw = y;
      }, [baseYaw + Math.sin((i / n) * Math.PI * 2) * 0.85]),
    );

    // #28 Turntable physical vinyl test: empty platter refuses playback -> hold physical nd_vinyl_09 -> place on platter -> watch spin & arm drop!
    const vinylRes = await page.evaluate(() => {
      const g = window.__rt.game;
      const app = g.systems.get('appliances');
      const recUnit = app.all.find((u) => u.item.item === 'junk_record');
      const w = g.player.walker;
      // Aim directly at turntable
      const dx = recUnit.x - w.x;
      const dz = recUnit.z - w.z;
      const yaw = Math.atan2(dz, dx);
      g.input.lookYaw = yaw;
      g.input.lookPitch = Math.atan2(recUnit.y - w.eye().y, Math.hypot(dx, dz));
      // 1) Try pressing empty turntable with empty hands -> must stay OFF!
      g.player.slots[0] = null;
      app.press(recUnit);
      const emptyOn = !!recUnit.item.state?.app?.on;
      // 2) Hold physical vinyl nd_vinyl_09 and click turntable -> places vinyl & starts spinning + swings tonearm!
      const vL = g.loose.addItem({ uid: 'p2-v9', item: 'nd_vinyl_09', qty: 1 }, w.x, 0, w.z, 0);
      g.player.slots[0] = { kind: 'item', item: vL.item };
      g.loose.remove(vL);
      g.player.sel = 0;
      app.press(recUnit);
      return {
        emptyOn,
        placedVinyl: recUnit.item.state?.app?.vinyl?.item ?? null,
        playing: !!recUnit.item.state?.app?.on,
      };
    });
    // Record 1.8 s of smooth vinyl drop + tonearm swing + 33 1/3 RPM platter/vinyl spinning!
    await playSec(page, 1.8);
    await shot(page, '07_turntable_vinyl_spinning_arm');
    ok(
      !vinylRes.emptyOn && vinylRes.placedVinyl === 'nd_vinyl_09' && vinylRes.playing,
      `#28 turntable refuses empty play and spins placed physical vinyl (${JSON.stringify(vinylRes)})`,
    );

    ok(errors.length === 0, `Cabinet/Compass/Vinyl/Cassette console clean (${errors.length} errors)`);
    await ses.finish();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`\nPHASE2_VERIFY_DONE bad=${bad}`);
process.exit(bad ? 1 : 0);
