// Playtest Round 3 full real-browser GPU verification + 720p gameplay videos covering all 11 issues (#1-#11)
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, startServer } from './lib.mjs';

const OUT = 'D:/cindy-scratch/round3-verify';
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

async function playSec(page, sec, fn) {
  const steps = Math.max(1, Math.round(sec * 30));
  for (let i = 0; i < steps; i++) {
    if (fn) await fn(i, steps);
    await page.evaluate(() => window.__rt.game.frame(1 / 30));
    await page.waitForTimeout(20);
  }
}

async function waitModels(page, ms = 1400) {
  await page.waitForTimeout(ms);
  await playSec(page, 0.3);
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  console.log('shot ' + p);
}

async function exitSeat(page) {
  await page.keyboard.down('KeyQ');
  await playSec(page, 0.55);
  await page.keyboard.up('KeyQ');
  await playSec(page, 0.25);
}

const { server, url } = await startServer();
const browser = await launchBrowser();

try {
  // =========================================================================
  // VIDEO 1: #1 Placement grid & yaw, #2 Coffee pour no-loop, #3 Coffee R-snap, #7 Elephant anti-teleport
  // =========================================================================
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:elephant&s=900&time=11&weather=clear`,
      '01_placement_coffee_antiteleport',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);
    await exitSeat(page);

    // Stand inside Old Elephant aisle holding nd_kitchen_stand aiming across former -0.99 seam along left wall!
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
      // Place walker aft of the house battery looking down onto the left wall floor across the former -0.99 seam!
      const st = toW(-1.35, 0.62, 0.35);
      const tgt = toW(-1.65, 0.62, -0.78);
      const yaw = Math.atan2(tgt.z - st.z, tgt.x - st.x);
      const eyeY = st.y + 1.5;
      const pitch = Math.atan2(tgt.y - eyeY, Math.hypot(tgt.x - st.x, tgt.z - st.z));
      g.player.walker.place(st.x, st.z, yaw);
      g.player.walker.y = st.y;
      g.input.lookYaw = yaw;
      g.input.lookPitch = pitch;
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-stand', item: 'nd_kitchen_stand', qty: 1 } };
      g.player.sel = 0;
    });
    await waitModels(page, 900);

    // Press R -> aim across former -0.99 seam along left wall -> verify ok -> place!
    await page.keyboard.press('KeyR');
    await playSec(page, 0.55);
    const standCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const np = g.systems.get('nd-place');
      return { on: !!np?.thing, ok: !!np?.aim?.ok, stowZone: np?.aim?.stow?.zone?.id ?? null, why: np?.aim?.why ?? '' };
    });
    ok(standCheck.on && standCheck.ok && standCheck.stowZone === 'cabin', `#1 kitchen stand fits cleanly across Elephant -0.99 seam (${JSON.stringify(standCheck)})`);
    await page.evaluate(() => window.__rt.game.systems.get('nd-place')?.put?.());
    await waitModels(page, 700);

    // Hold coffee machine -> R mode onto kitchen stand countertop -> turn with Q -> verify placed yaw matches preview!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const stand = g.loose.list.find((l) => l.item?.item === 'nd_kitchen_stand');
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-cm', item: 'nd_coffee_machine', qty: 1, state: { ndCoffee: { fill: 1.0 } } } };
      g.player.sel = 0;
      if (stand) {
        const w = g.player.walker;
        const eyeY = w.eye().y;
        const dx = stand.x - w.x;
        const dz = stand.z - w.z;
        g.input.lookYaw = Math.atan2(dz, dx);
        g.input.lookPitch = Math.atan2(stand.y + 0.72 - eyeY, Math.hypot(dx, dz));
      }
    });
    await waitModels(page, 500);
    await page.keyboard.press('KeyR');
    await playSec(page, 0.45);
    await page.keyboard.press('KeyQ');
    await playSec(page, 0.4);
    const cmRes = await page.evaluate(() => {
      const g = window.__rt.game;
      const np = g.systems.get('nd-place');
      const prevYaw = np?.poseYaw ? np.poseYaw() : np?.yaw ?? 0;
      const okAim = !!np?.aim?.ok;
      const yAim = np?.aim?.y ?? 0;
      np?.put?.();
      g.frame(1 / 30);
      const placed = g.loose.list.find((l) => l.item?.item === 'nd_coffee_machine');
      const diff = placed ? Math.abs(Math.atan2(Math.sin(placed.yaw - prevYaw), Math.cos(placed.yaw - prevYaw))) : 99;
      return { okAim, yAim: +yAim.toFixed(2), placedY: placed ? +placed.y.toFixed(2) : -1, riding: !!placed?.riding, yawDiff: +diff.toFixed(3) };
    });
    ok(cmRes.okAim && cmRes.riding && cmRes.yawDiff < 0.08, `#1 countertop placement preserves exact preview yaw (${JSON.stringify(cmRes)})`);
    await playSec(page, 0.4);
    await shot(page, '01_placement_elephant_counter_aligned');

    // #3 Coffee maker R-mode magnetic snap (no direct LMB conflict!)
    await page.evaluate(() => {
      const g = window.__rt.game;
      const cm = g.loose.list.find((l) => l.item?.item === 'nd_coffee_machine');
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-pot1', item: 'coffee_pot', qty: 1, litres: 0 } };
      g.player.sel = 0;
      if (cm) {
        const w = g.player.walker;
        const eyeY = w.eye().y;
        const dx = cm.x - w.x;
        const dy = cm.y + 0.14 - eyeY;
        const dz = cm.z - w.z;
        g.input.lookYaw = Math.atan2(dz, dx);
        g.input.lookPitch = Math.atan2(dy, Math.hypot(dx, dz));
      }
    });
    await waitModels(page, 500);
    const directCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const cm = g.loose.list.find((l) => l.item?.item === 'nd_coffee_machine');
      const coffeeSys = g.systems.get('nd-coffee');
      const m = coffeeSys?.list?.find?.((x) => x.l === cm);
      return {
        takeResult: m ? coffeeSys.take(m, 'cup', g.player.held) : 'none',
        cupBefore: cm?.item?.state?.ndCoffee?.cup?.item ?? null,
      };
    });
    ok(directCheck.takeResult === null && directCheck.cupBefore === null, `#3 coffee maker rejects direct LMB cup docking (${JSON.stringify(directCheck)})`);

    // Press R -> verify magnetic snap onto coffee maker!
    await page.keyboard.press('KeyR');
    await playSec(page, 0.55);
    const snapCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const np = g.systems.get('nd-place');
      return { ok: !!np?.aim?.ok, slotWord: np?.aim?.slot?.word ?? null };
    });
    ok(snapCheck.ok && snapCheck.slotWord === '放上咖啡机', `#3 R-mode magnetically snaps coffee pot onto coffee maker (${JSON.stringify(snapCheck)})`);
    await shot(page, '02_coffee_r_snap_preview');

    // Click LMB (via put) to dock pot!
    await page.evaluate(() => window.__rt.game.systems.get('nd-place')?.put?.());
    await playSec(page, 0.35);
    const docked = await page.evaluate(() => {
      const g = window.__rt.game;
      const cm = g.loose.list.find((l) => l.item?.item === 'nd_coffee_machine');
      return { cup: cm?.item?.state?.ndCoffee?.cup?.item ?? null, handEmpty: g.player.held === null };
    });
    ok(docked.cup === 'coffee_pot' && docked.handEmpty, `#3 R-mode LMB docks coffee pot under spout (${JSON.stringify(docked)})`);

    // #2 Coffee pot -> mug continuous LMB hold (3.2 s) NEVER ping-pongs back!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const stand = g.loose.list.find((l) => l.item?.item === 'nd_kitchen_stand');
      const v = g.vehicles[0];
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-pot2', item: 'coffee_pot', qty: 1, litres: 0.85, state: { liquid: 'coffee' } } };
      g.player.sel = 0;
      const b = new Float64Array(9);
      v.sim.basis(b);
      // Place empty mug cleanly on the stand countertop to the side of the coffee maker
      const mx = stand.x + b[0] * 0.32;
      const mz = stand.z + b[2] * 0.32;
      const my = stand.y + 0.725;
      const ml = g.loose.addItem({ uid: 'r3-mug', item: 'nd_mug', qty: 1, litres: 0 }, mx, my, mz, 0);
      g.loose.ride(ml, v);
      const w = g.player.walker;
      const eyeY = w.eye().y;
      g.input.lookYaw = Math.atan2(ml.z - w.z, ml.x - w.x);
      g.input.lookPitch = Math.atan2(ml.y + 0.05 - eyeY, Math.hypot(ml.x - w.x, ml.z - w.z));
    });
    await waitModels(page, 600);
    await page.evaluate(() => {
      window.__rt.game.player.primary = true;
    });
    const samples = [];
    for (let s = 0; s < 16; s++) {
      await playSec(page, 0.2);
      const snap = await page.evaluate(() => {
        const g = window.__rt.game;
        const pot = g.player.held?.item;
        const mug = g.loose.list.find((l) => l.item?.item === 'nd_mug')?.item;
        return { pot: +(pot?.litres ?? 0).toFixed(3), mug: +(mug?.litres ?? 0).toFixed(3) };
      });
      samples.push(snap);
    }
    await page.evaluate(() => {
      window.__rt.game.player.primary = false;
    });
    await playSec(page, 0.25);
    const maxMug = Math.max(...samples.map((s) => s.mug));
    const endMug = samples[samples.length - 1].mug;
    const endPot = samples[samples.length - 1].pot;
    ok(maxMug >= 0.30 && endMug >= maxMug - 0.005 && endPot <= 0.56, `#2 continuous pot->mug LMB hold fills mug & NEVER reverses back (maxMug=${maxMug}, endMug=${endMug}, endPot=${endPot})`);
    await shot(page, '03_coffee_pour_no_pingpong');

    // #7 Walk aft onto Old Elephant rear engine deck (headroom 1.38 m) -> auto-crouch, zero teleport outside!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      g.player.slots[0] = null;
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const wx = v.sim.px + b[0] * (-3.4 - cg.x) + b[3] * (0.62 - cg.y) + b[6] * (0 - cg.z);
      const wy = v.sim.py + b[1] * (-3.4 - cg.x) + b[4] * (0.62 - cg.y) + b[7] * (0 - cg.z);
      const wz = v.sim.pz + b[2] * (-3.4 - cg.x) + b[5] * (0.62 - cg.y) + b[8] * (0 - cg.z);
      const yawAft = Math.atan2(-b[2], -b[0]);
      g.player.walker.place(wx, wz, yawAft);
      g.player.walker.y = wy;
      g.input.lookYaw = yawAft;
      g.input.lookPitch = -0.15;
    });
    await page.keyboard.down('KeyW');
    await playSec(page, 1.5);
    await page.keyboard.up('KeyW');
    await playSec(page, 0.3);
    const walkRes = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const m = v.walkSolids.worldToModel(w.x, w.y, w.z, { x: 0, y: 0, z: 0 });
      return { mx: +m.x.toFixed(2), my: +m.y.toFixed(2), mz: +m.z.toFixed(2), crouched: w.crouched };
    });
    ok(Math.abs(walkRes.mz) < 1.15 && walkRes.mx < -3.6 && walkRes.mx > -5.6, `#7 Old Elephant rear deck walk stays strictly inside with zero teleport (${JSON.stringify(walkRes)})`);
    await shot(page, '04_elephant_rear_deck_no_teleport');

    ok(errors.length === 0, `Video 1 zero runtime errors (${errors.join('; ')})`);
    await ses.finish();
  }

  // =========================================================================
  // VIDEO 2: #8 Low vs High beams, #6 Driver-only dome light, #4 No black items, #5 Real desk lamp
  // =========================================================================
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:elephant&s=900&time=23&weather=clear`,
      '02_lighting_desklamp_domelight_beams',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);

    // #8 Night highway headlight beams while seated in driver seat!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.domeOn = false;
      v.sys.dash.lights = 'off';
      g.viewMode = 'cockpit';
      g.input.lookYaw = 0;
      g.input.lookPitch = -0.04;
    });
    await playSec(page, 0.35);
    await page.keyboard.press('KeyT');
    await playSec(page, 0.65);
    const lowCheck = await page.evaluate(() => ({ mode: window.__rt.game.vehicles[0].sys.dash.lights }));
    ok(lowCheck.mode === 'low', `#8 first T switches to low beam (${JSON.stringify(lowCheck)})`);
    await shot(page, '09_headlight_low_beam_wide');

    await page.keyboard.press('KeyT');
    await playSec(page, 0.65);
    const highCheck = await page.evaluate(() => ({ mode: window.__rt.game.vehicles[0].sys.dash.lights }));
    ok(highCheck.mode === 'high', `#8 second T switches to high beam (${JSON.stringify(highCheck)})`);
    await shot(page, '10_headlight_high_beam_far');

    // Turn headlights off, then test #6 single driver-seat KeyU dome light!
    await page.keyboard.press('KeyT');
    await playSec(page, 0.25);
    await page.keyboard.press('KeyU');
    await playSec(page, 0.75);
    const driverDomeCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const p = g.systems.get('power');
      g.input.lookYaw = 1.15;
      g.input.lookPitch = -0.08;
      return { domeOn: v.domeOn, ceil: +(p?.ceilingOf?.(v) ?? -1).toFixed(3) };
    });
    await playSec(page, 0.35);
    ok(driverDomeCheck.domeOn === true && driverDomeCheck.ceil > 0.75, `#6 driver KeyU turns on unified single dome light (${JSON.stringify(driverDomeCheck)})`);
    await shot(page, '05_domelight_driver_only');

    // Step out into lit rear RV -> first verify KeyU in rear does NOT toggle domeOn!
    await exitSeat(page);
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
      const vYaw = Math.atan2(-b[2], b[0]);
      // Open cooler on clear right-aisle floor with bright salmon, egg & tomato clearly visible
      const cp = toW(-1.60, 0.62, 0.25);
      const cl = g.loose.addItem(
        {
          uid: 'r3-cooler',
          item: 'kit_cooler',
          qty: 1,
          inside: [
            { uid: 'r3-fish', item: 'ing_salmon', qty: 1 },
            { uid: 'r3-egg', item: 'ing_egg', qty: 1 },
            { uid: 'r3-tom', item: 'ing_tomato', qty: 1 },
          ],
          state: { open: ['LID'] },
        },
        cp.x,
        cp.y,
        cp.z,
        vYaw + Math.PI / 2,
      );
      g.loose.ride(cl, v);
      // Kitchen stand + desk lamp cleanly separated against left wall
      const sp = toW(-2.65, 0.62, -0.82);
      const sl = g.loose.addItem({ uid: 'r3-stand2', item: 'nd_kitchen_stand', qty: 1 }, sp.x, sp.y, sp.z, vYaw - Math.PI / 2);
      g.loose.ride(sl, v);
      const lp = toW(-2.65, 1.345, -0.80);
      const ll = g.loose.addItem({ uid: 'r3-lamp', item: 'junk_lamp', qty: 1 }, lp.x, lp.y, lp.z, vYaw - Math.PI / 2);
      g.loose.ride(ll, v);
      const pp = toW(-0.95, 0.62, 0.15);
      const yaw = Math.atan2(cp.z - pp.z, cp.x - pp.x);
      g.player.walker.place(pp.x, pp.z, yaw);
      g.player.walker.y = pp.y;
      g.input.lookYaw = yaw;
      g.input.lookPitch = -0.82;
    });
    await waitModels(page, 1000);
    // Press KeyU while standing in RV rear -> domeOn MUST remain true (ignored outside driver seat!)
    await page.keyboard.press('KeyU');
    await playSec(page, 0.4);
    const rearUCheck = await page.evaluate(() => ({ domeOn: window.__rt.game.vehicles[0].domeOn }));
    ok(rearUCheck.domeOn === true, `#6 KeyU while standing in RV rear does not toggle dome light (${JSON.stringify(rearUCheck)})`);

    // #4 Check open cooler child items (salmon, eggs, tomato) receive warm RV cabin lamp -> NO black items!
    const coolerLampCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const cl = g.loose.list.find((l) => l.item?.item === 'kit_cooler');
      const kids = cl ? g.loose.mats.owners(`nd-store:${cl.uid}:`) : [];
      const firstLook = kids.length ? g.loose.mats.lookOf(kids[0]) : null;
      const c = firstLook?.shared?.uCabinLamp?.value;
      return { count: kids.length, lampSum: c ? +(c.r + c.g + c.b).toFixed(3) : 0 };
    });
    ok(coolerLampCheck.count >= 2 && coolerLampCheck.lampSum > 0.5, `#4 open cooler child items receive warm RV cabin lamp (${JSON.stringify(coolerLampCheck)})`);
    await shot(page, '06_cooler_items_bright_night');

    // Hold a dinner table in R-mode aimed at open center RV floor -> verify valid bright true-color preview (zero black silhouette)!
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
      const tgt = toW(-2.75, 0.62, 0.35);
      const w = g.player.walker;
      const eyeY = w.eye().y;
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-table', item: 'nd_dinner_table', qty: 1 } };
      g.player.sel = 0;
      g.input.lookYaw = Math.atan2(tgt.z - w.z, tgt.x - w.x);
      g.input.lookPitch = Math.atan2(tgt.y - eyeY, Math.hypot(tgt.x - w.x, tgt.z - w.z));
    });
    await waitModels(page, 550);
    await page.keyboard.press('KeyR');
    await playSec(page, 0.55);
    const heldLampCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const c = g.heldThing.look?.shared?.uCabinLamp?.value;
      return { lampSum: c ? +(c.r + c.g + c.b).toFixed(3) : 0 };
    });
    ok(heldLampCheck.lampSum > 0.5, `#4 held & R-mode placement preview receives warm RV cabin lamp (${JSON.stringify(heldLampCheck)})`);
    await shot(page, '07_rmode_preview_bright_night');
    await page.keyboard.press('KeyR');
    await playSec(page, 0.25);

    // #5 Desk lamp real 3D spotlight: turn dome OFF, turn desk lamp ON, look at desk lamp + glowing shade + lit counter!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.domeOn = false;
      g.player.slots[0] = null;
      const lamp = g.loose.list.find((l) => l.item?.item === 'junk_lamp');
      if (lamp?.item) {
        lamp.item.state = { app: { on: true } };
        g.loose.touch(lamp);
      }
      const b = new Float64Array(9);
      v.sim.basis(b);
      const mug = g.loose.addItem({ uid: 'r3-mug2', item: 'nd_mug', qty: 1, litres: 0.2 }, lamp.x + b[6] * 0.25, lamp.y, lamp.z + b[8] * 0.25, 0);
      g.loose.ride(mug, v);
      const cg = v.sys.derived.cg;
      const vx = v.sim.px + b[0] * (-1.55 - cg.x) + b[3] * (0.62 - cg.y) + b[6] * (-0.05 - cg.z);
      const vy = v.sim.py + b[1] * (-1.55 - cg.x) + b[4] * (0.62 - cg.y) + b[7] * (-0.05 - cg.z);
      const vz = v.sim.pz + b[2] * (-1.55 - cg.x) + b[5] * (0.62 - cg.y) + b[8] * (-0.05 - cg.z);
      const yawLamp = Math.atan2(lamp.z - vz, lamp.x - vx);
      g.player.walker.place(vx, vz, yawLamp);
      g.player.walker.y = vy;
      const eyeY = g.player.walker.eye().y;
      g.input.lookYaw = yawLamp;
      g.input.lookPitch = Math.atan2(lamp.y + 0.14 - eyeY, Math.hypot(lamp.x - vx, lamp.z - vz));
    });
    await playSec(page, 1.2);
    const deskLampCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const appSys = g.systems.get('appliances');
      const u = appSys?.all?.find?.((x) => x.kind === 'lamp');
      const p = g.systems.get('power');
      return { glow: +(u?.glow ?? 0).toFixed(2), ceilOff: +(p?.ceilingOf?.(g.vehicles[0]) ?? 0).toFixed(3) };
    });
    ok(deskLampCheck.glow > 0.85 && deskLampCheck.ceilOff < 0.05, `#5 desk lamp lit smoothly with dome off (real 3D spotlight, ${JSON.stringify(deskLampCheck)})`);
    await shot(page, '08_desk_lamp_real_spotlight');

    ok(errors.length === 0, `Video 2 zero runtime errors (${errors.join('; ')})`);
    await ses.finish();
  }

  // =========================================================================
  // VIDEO 3: #11 Toilet seat shifted back, #9 51-song Music panel & colorful vinyls, #10 Remodeled Compass
  // =========================================================================
  {
    const ses = await openRecorded(
      browser,
      `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:elephant&s=900&time=11&weather=clear`,
      '03_music_panel_compass_toilet',
    );
    const { page, errors } = ses;
    await waitModels(page, 1800);

    // #11 Fit seat_toilet onto Old Elephant driver seat FIRST while seated -> capture seated POV!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.build.parts.seat_driver = { uid: 'r3-toilet', part: 'seat_toilet', cond: 1, dirt: 0, rust: 0, wear: 0, crust: 0, paint: 0xf4f2ec, fluids: {}, sub: {} };
      v.changed();
      g.viewMode = 'cockpit';
      g.input.lookYaw = 0;
      g.input.lookPitch = -0.16;
    });
    await waitModels(page, 1000);
    await playSec(page, 0.55);
    await shot(page, '15_toilet_seat_driver_pov');

    // Step out beside open driver door to show exterior side view of seat_toilet clearance behind the steering wheel!
    await exitSeat(page);
    await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.view.setPanelOpen('door_FL', 1);
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const toW = (mx, my, mz) => ({
        x: v.sim.px + b[0] * (mx - cg.x) + b[3] * (my - cg.y) + b[6] * (mz - cg.z),
        y: v.sim.py + b[1] * (mx - cg.x) + b[4] * (my - cg.y) + b[7] * (mz - cg.z),
        z: v.sim.pz + b[2] * (mx - cg.x) + b[5] * (my - cg.y) + b[8] * (mz - cg.z),
      });
      const out = toW(3.0, 0.0, -2.55);
      const tgt = toW(3.05, 1.55, -0.55);
      const yaw = Math.atan2(tgt.z - out.z, tgt.x - out.x);
      g.player.walker.place(out.x, out.z, yaw);
      g.input.lookYaw = yaw;
      g.input.lookPitch = 0.05;
    });
    await playSec(page, 0.55);
    await shot(page, '14_toilet_seat_side_view');

    // #9 Open DevPanel (`Backquote`) -> check 磁带 & 黑胶 chips and 音乐 tab!
    await page.keyboard.press('Backquote');
    await playSec(page, 0.45);
    const devCheck = await page.evaluate(() => {
      const g = window.__rt.game;
      const panel = g.devPanel;
      const chips = [...document.querySelectorAll('.mc-dev .chips span')].map((s) => s.textContent?.trim());
      const musicTabBtn = [...document.querySelectorAll('.mc-dev .tabs span')].find((s) => s.textContent?.trim() === '音乐');
      if (musicTabBtn) musicTabBtn.click();
      return { open: !!panel?.open, chips, clickedMusic: !!musicTabBtn };
    });
    await playSec(page, 0.5);
    const musicSongsCount = await page.evaluate(() => document.querySelectorAll('.mc-dev button[data-song-id]').length);
    ok(devCheck.chips.includes('磁带') && devCheck.chips.includes('黑胶') && devCheck.clickedMusic && musicSongsCount === 51, `#9 DevPanel exposes 磁带/黑胶 filters and 音乐 tab with all 51 songs (${JSON.stringify({ chips: devCheck.chips, count: musicSongsCount })})`);
    await shot(page, '11_music_tab_51_songs');
    await page.keyboard.press('Backquote');
    await playSec(page, 0.25);

    // Spawn a flat display table with the spinning turntable + 3 vividly colored album-sleeved vinyls & 2 cassettes!
    await page.evaluate(() => {
      const g = window.__rt.game;
      const w = g.player.walker;
      const yaw = w.heading + Math.PI; // face away from vehicle onto clear ground
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const rx = -fz;
      const rz = fx;
      w.place(w.x + fx * 1.1, w.z + fz * 1.1, yaw);
      const bx = w.x + fx * 1.15;
      const bz = w.z + fz * 1.15;
      const y = w.y;
      // Flat dinner table surface at y + 0.74 so colorful vinyl sleeves & turntable display at close range without grass clipping
      const tbl = g.loose.addItem({ uid: 'r3-showtbl', item: 'nd_dinner_table', qty: 1 }, bx, y, bz, -yaw + Math.PI / 2);
      g.loose.seat(tbl, y);
      const topY = tbl.y + 0.75;
      const rec = g.loose.addItem(
        { uid: 'r3-rec', item: 'junk_record', qty: 1, state: { app: { on: true, vinyl: { uid: 'r3-spin', item: 'nd_vinyl_08', qty: 1 }, vinylAt: 0 } } },
        bx - rx * 0.30,
        topY,
        bz - rz * 0.30,
        -yaw + Math.PI,
      );
      g.loose.seat(rec, topY);
      const v1 = g.loose.addItem({ uid: 'r3-v1', item: 'nd_vinyl_01', qty: 1 }, bx + rx * 0.16 - fx * 0.14, topY, bz + rz * 0.16 - fz * 0.14, -yaw + 0.12);
      const v2 = g.loose.addItem({ uid: 'r3-v2', item: 'nd_vinyl_08', qty: 1 }, bx + rx * 0.42 + fx * 0.12, topY, bz + rz * 0.42 + fz * 0.12, -yaw - 0.18);
      const v3 = g.loose.addItem({ uid: 'r3-v3', item: 'nd_vinyl_10', qty: 1 }, bx + rx * 0.08 + fx * 0.16, topY, bz + rz * 0.08 + fz * 0.16, -yaw + 0.25);
      const c1 = g.loose.addItem({ uid: 'r3-c1', item: 'nd_tape_03', qty: 1 }, bx - rx * 0.28 - fx * 0.22, topY, bz - rz * 0.28 - fz * 0.22, -yaw + 0.15);
      const c2 = g.loose.addItem({ uid: 'r3-c2', item: 'nd_tape_15', qty: 1 }, bx - rx * 0.08 - fx * 0.22, topY, bz - rz * 0.08 - fz * 0.22, -yaw - 0.10);
      for (const it of [v1, v2, v3, c1, c2]) g.loose.seat(it, topY);
      const eyeY = w.eye().y;
      g.input.lookYaw = yaw;
      g.input.lookPitch = Math.atan2(topY + 0.04 - eyeY, 1.15);
    });
    await waitModels(page, 900);
    await playSec(page, 0.85);
    await shot(page, '12_colorful_vinyls_and_turntable');

    // #10 Hold remodeled brass compass -> face North (-Z), then turn smoothly East (+X) showing crisp N/E/S/W 360° dial!
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.player.slots[0] = { kind: 'item', item: { uid: 'r3-compass', item: 'nd_compass', qty: 1 } };
      g.player.sel = 0;
      g.input.lookYaw = -Math.PI / 2;
      g.input.lookPitch = -0.05;
    });
    await waitModels(page, 900);
    await playSec(page, 0.85);
    await shot(page, '13_compass_dial_closeup');
    const nStart = await page.evaluate(() => window.__rt.game.systems.get('nd-kit')?.harness?.compass?.()?.needle ?? 0);
    await playSec(page, 1.1, (i, n) =>
      page.evaluate(([k, tot]) => {
        window.__rt.game.input.lookYaw = -Math.PI / 2 + (Math.PI / 2) * (k / tot);
      }, [i, n]),
    );
    const compassTurn = await page.evaluate(() => {
      const c = window.__rt.game.systems.get('nd-kit')?.harness?.compass?.();
      const hasDial = !!window.__rt.game.heldThing.model?.getObjectByName('P_dial');
      return { hasDial, lid: +(c?.lid ?? 0).toFixed(2), needle: +(c?.needle ?? 0).toFixed(2) };
    });
    ok(compassTurn.hasDial && compassTurn.lid > 0.9 && Math.abs(compassTurn.needle - nStart) > 0.8, `#10 compass P_dial present & needle rotates cleanly tracking North (${JSON.stringify(compassTurn)})`);

    ok(errors.length === 0, `Video 3 zero runtime errors (${errors.join('; ')})`);
    await ses.finish();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`\nROUND 3 VERIFY SUMMARY: bad=${bad}`);
process.exit(bad > 0 ? 1 : 0);
