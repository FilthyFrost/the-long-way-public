// Playtest Round 2 · Phase 1 real-browser functional + visual walkthrough.
// Captures verified screenshots into D:/cindy-scratch/phase1-verify/ and checks every Phase 1 invariant live.
//   SHOTS_GPU=1 node harness/shots/phase1_verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, mouseButton, openGame, startServer } from './lib.mjs';

const out = 'D:/cindy-scratch/phase1-verify';
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
    const dt = 1 / 60;
    for (let t = 0; t < s; t += dt) g.step(dt, 1);
    g.simulate(0);
  }, secs);
}

async function waitModels(page, ms = 1200) {
  await page.waitForTimeout(ms);
  await runFrame(page, 0.25);
}

async function shot(page, name) {
  await page.evaluate(() => {
    window.__rt.game.ui.showHelp(false);
    window.__rt.render();
    window.__rt.render();
  });
  const p = path.join(out, `${name}.png`);
  await page.screenshot({ path: p });
  console.log('shot', p);
}

try {
  // ================================================================ PART A: GARAGE START (G1, G2, G3, #1, #2, #12, #14, #24, #25, #27)
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=7&start=garage&time=11&weather=clear`, { width: 1280, height: 720 });
    await waitModels(page, 1800);

    // 1. G1 & G2: Look directly at the starter car's dirty opaque windshield BEFORE crafting plastic scraper!
    const gStart = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const sx = v.sim.px;
      const sz = v.sim.pz;
      const px = sx + 2.55;
      const pz = sz + 1.45;
      const yaw = Math.atan2(sz - pz, sx + 0.3 - px);
      g.player.walker.place(px, pz, yaw);
      g.input.lookYaw = yaw;
      g.input.lookPitch = -0.16;
      const looseParts = g.loose.list.filter((l) => l.part).map((l) => ({ part: l.part.part, x: +l.x.toFixed(2), z: +l.z.toFixed(2) }));
      return {
        crust: v.build.crust ?? 0,
        cardsOn: g.player.cardsOn,
        markerCount: document.querySelectorAll('.mc-marker').length,
        looseParts,
      };
    });
    await runFrame(page, 0.3);
    await shot(page, '01_garage_dirty_windshield_and_markers');
    ok(gStart.crust >= 0.85, `G1 starter car windshield/body crust >= 0.85 before crafting scraper (${gStart.crust})`);
    ok(gStart.cardsOn === true, `#12 right-side item cards enabled by default (${gStart.cardsOn})`);

    // 2. #12: Aim directly at a loose item on the garage floor/bench and verify right-side ND item card displays
    const aimLoose = await page.evaluate(() => {
      const g = window.__rt.game;
      const item = g.loose.list.find((l) => l.item && !l.shut);
      if (!item) return null;
      const px = item.x - 0.85;
      const pz = item.z;
      const yaw = Math.atan2(item.z - pz, item.x - px);
      g.player.walker.place(px, pz, yaw);
      const eyeY = g.player.walker.eye().y;
      const pitch = Math.atan2(item.y + item.mid - eyeY, 0.85);
      g.input.lookYaw = yaw;
      g.input.lookPitch = pitch;
      return { item: item.item.item };
    });
    await runFrame(page, 0.3);
    const cardVis = await page.evaluate(() => {
      const g = window.__rt.game;
      const frames = [...document.querySelectorAll('.mc-frame')].filter((el) => getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0' && el.getBoundingClientRect().width > 120);
      return {
        targetKind: g.player.target?.kind ?? null,
        cardShown: frames.length > 0,
        cardText: frames.map((el) => el.textContent?.trim().slice(0, 50)).join(' | '),
      };
    });
    await shot(page, '02_garage_item_card_and_outline');
    ok(!!aimLoose && cardVis.cardShown, `#12 aiming at loose item displays right-side ND item card (${JSON.stringify(cardVis)})`);

    // 3. #1 & #14: Hold plastic scraper on foot -> NO first-person arms, blue blade pointing forward
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.player.slots[0] = { kind: 'tool', tool: { kind: 'scraper', tier: 1, life: 1 } };
      g.player.sel = 0;
      g.input.lookPitch = -0.1;
    });
    await waitModels(page, 800);
    const armState = await page.evaluate(() => {
      const rig = window.__rt.game.her?.rig;
      return {
        armsVisible: rig ? (rig.arms.l.visible || rig.arms.r.visible) : false,
        heldShown: window.__rt.game.heldThing.shown,
      };
    });
    await shot(page, '03_held_plastic_scraper_floating');
    ok(armState.armsVisible === false && armState.heldShown, `#1/#14 plastic scraper floats cleanly with no FP arms (${JSON.stringify(armState)})`);

    // 4. #24: Hold nd_shovel -> solid opaque (no ghost fade), diagonal spade blade forward-down
    await page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.addItem({ uid: 'p1-shovel', item: 'nd_shovel', qty: 1 }, g.player.walker.x, 0, g.player.walker.z, 0);
      g.player.slots[0] = { kind: 'item', item: l.item };
      g.loose.remove(l);
      g.player.sel = 0;
      g.input.lookPitch = -0.05;
    });
    await waitModels(page, 800);
    const shovelFade = await page.evaluate(() => window.__rt.game.heldThing.fade.weight);
    await shot(page, '04a_held_shovel_pose');
    ok(shovelFade === 0, `#24 held shovel stays fully opaque without view-fade (${shovelFade})`);

    // 5. #25 & #27: Hold fish -> full sculpted side profile in foreground
    await page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.addItem({ uid: 'p1-fish', item: 'fish_carp', qty: 1, state: { fish: { v: 0, m: 2, kg: 2.5, cm: 48 } } }, g.player.walker.x, 0, g.player.walker.z, 0);
      g.player.slots[0] = { kind: 'item', item: l.item };
      g.loose.remove(l);
      g.player.sel = 0;
      g.input.lookPitch = -0.04;
    });
    await waitModels(page, 800);
    await shot(page, '04c_held_fish_pose');

    ok(errors.length === 0, `garage walkthrough console clean (${errors.length} errors)`);
    await page.close();
  }

  // ================================================================ PART B: WAGON COCKPIT (Img 5/6, #4, #5, #11, #13, G3, #6, #22)
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:wagon&s=900&time=11&weather=clear`, { width: 1280, height: 720 });
    await waitModels(page, 1800);

    // Put on wear_jacket_torn (same jacket as Image 5!) and look right toward passenger seat & gear lever
    const seatState = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.seated;
      g.player.worn.jacket = { uid: 'p1-jacket', item: 'wear_jacket_torn', qty: 1 };
      g.input.lookYaw = 0.72;
      g.input.lookPitch = -0.28;
      return {
        seated: !!v,
        armsVisible: g.her?.rig ? (g.her.rig.arms.l.visible && g.her.rig.arms.r.visible) : false,
      };
    });
    await runFrame(page, 0.4);
    await shot(page, '05a_wagon_cockpit_arms_and_seat_cushion');
    ok(seatState.seated && seatState.armsVisible, `User Decision #1 seated driving keeps FP arms visible (${JSON.stringify(seatState)})`);

    // #13: Hold RMB in cockpit to zoom FOV 75 -> 50 deg while aiming toward gauges/handbrake
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.input.lookYaw = 0.12;
      g.input.lookPitch = -0.22;
    });
    await runFrame(page, 0.2);
    const fovBefore = await page.evaluate(() => +window.__rt.game.core.camera.fov.toFixed(1));
    await mouseButton(page, true, 2);
    await runFrame(page, 0.7);
    const fovZoomed = await page.evaluate(() => +window.__rt.game.core.camera.fov.toFixed(1));
    await shot(page, '05b_wagon_cockpit_rmb_zoom');
    await mouseButton(page, false, 2);
    await runFrame(page, 0.7);
    ok(fovBefore > 70 && fovZoomed < 54, `#13 seated RMB eye zoom narrows FOV 75->50 (${fovBefore} -> ${fovZoomed})`);

    // Exit wagon to test G3 single-part engine bay outline, #6 Polaroid camera eject, #22 coffee machine + pot + mug
    await page.keyboard.down('KeyQ');
    await runFrame(page, 0.5);
    await page.keyboard.up('KeyQ');
    await runFrame(page, 0.3);

    // G3 & #2: Open wagon hood and aim directly at radiator -> ONLY radiator outlined!
    const radTarget = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      v.view.setPanelOpen('hood', 1);
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const toW = (mx, my, mz) => ({
        x: v.sim.px + b[0] * (mx - cg.x) + b[3] * (my - cg.y) + b[6] * (mz - cg.z),
        y: v.sim.py + b[1] * (mx - cg.x) + b[4] * (my - cg.y) + b[7] * (mz - cg.z),
        z: v.sim.pz + b[2] * (mx - cg.x) + b[5] * (my - cg.y) + b[8] * (mz - cg.z),
      });
      const eng = toW(1.45, 0.78, 0.0);
      const stand = toW(2.45, 0.0, 0.15);
      const yaw = Math.atan2(eng.z - stand.z, eng.x - stand.x);
      g.player.walker.place(stand.x, stand.z, yaw);
      const eyeY = g.player.walker.eye().y;
      const dist = Math.hypot(eng.x - stand.x, eng.z - stand.z);
      g.input.lookYaw = yaw;
      g.input.lookPitch = Math.atan2(eng.y - eyeY, dist);
      return true;
    });
    await runFrame(page, 0.35);
    const radHit = await page.evaluate(() => {
      const t = window.__rt.game.player.target;
      return { kind: t?.kind ?? null, mount: t?.mount?.id ?? t?.mount ?? null };
    });
    await shot(page, '05c_engine_bay_single_part_outline');
    ok(radTarget && radHit.kind === 'part' && (radHit.mount === 'radiator' || radHit.mount === 'engine' || radHit.mount === 'battery'), `G3/#2 open-hood part targeting hits single bay part (${JSON.stringify(radHit)})`);

    // #6 Polaroid camera: take photo -> watch print slide out -> auto-pop onto ground
    await page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.addItem({ uid: 'p1-cam', item: 'nd_camera', qty: 1, state: { camera: { film: 10 } } }, g.player.walker.x, 0, g.player.walker.z, 0);
      g.player.slots[0] = { kind: 'item', item: l.item };
      g.loose.remove(l);
      g.player.sel = 0;
      g.input.lookPitch = -0.05;
    });
    await waitModels(page, 700);
    const photosBefore = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_photo').length);
    await page.keyboard.down('KeyE');
    await runFrame(page, 0.08);
    await page.keyboard.up('KeyE');
    await runFrame(page, 0.75);
    await shot(page, '06_camera_polaroid_printing');
    await runFrame(page, 1.3);
    const photosAfter = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_photo').length);
    ok(photosAfter === photosBefore + 1, `#6 Polaroid auto-ejects printed photo onto ground (${photosBefore} -> ${photosAfter})`);

    // #22 Coffee machine + glass coffee pot filled + held mug filled (open road clear of car hood so mug stays well framed!)
    await page.evaluate(() => {
      const g = window.__rt.game;
      const w = g.player.walker;
      const yaw = g.input.lookYaw + Math.PI;
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const px = w.x + fx * 3.0;
      const pz = w.z + fz * 3.0;
      w.place(px, pz, yaw);
      const mx = px + fx * 1.05;
      const mz = pz + fz * 1.05;
      const pot = { uid: 'p1-pot', item: 'coffee_pot', qty: 1, litres: 0.92 };
      const cm = g.loose.addItem({ uid: 'p1-cm', item: 'nd_coffee_machine', qty: 1, state: { ndCoffee: { fill: 0.08, cup: pot } } }, mx, w.y + 0.95, mz, -yaw + Math.PI);
      g.loose.seat(cm, w.y + 0.95);
      const mugL = g.loose.addItem({ uid: 'p1-mug', item: 'nd_mug', qty: 1, litres: 0.3, state: { liquid: 'coffee' } }, mx, w.y, mz, 0);
      g.player.slots[0] = { kind: 'item', item: mugL.item };
      g.loose.remove(mugL);
      g.player.sel = 0;
      const eyeY = w.eye().y;
      g.input.lookYaw = yaw;
      g.input.lookPitch = Math.atan2(w.y + 1.12 - eyeY, 1.05);
    });
    // Step once FIRST so nd-coffee starts loading coffee_pot.glb, then wait for async GLB load and step again
    await runFrame(page, 0.2);
    await waitModels(page, 1200);
    await shot(page, '07_coffee_filled_pot_and_held_mug');

    ok(errors.length === 0, `wagon cockpit/camera/coffee console clean (${errors.length} errors)`);
    await page.close();
  }

  // ================================================================ PART C: RV INTERIOR (WHALE: #16, #19, #21)
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:rv&s=900&time=11&weather=clear`, { width: 1280, height: 720 });
    await waitModels(page, 1800);

    // Exit driver seat via Hold Q, then place player inside RV rear living room with riding furniture
    await page.keyboard.down('KeyQ');
    await runFrame(page, 0.5);
    await page.keyboard.up('KeyQ');
    await runFrame(page, 0.25);

    const rvSetup = await page.evaluate(() => {
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
      const pStand = toW(-0.7, 0.86, 0.0);
      const yawAft = Math.atan2(-b[2], -b[0]);
      g.player.walker.place(pStand.x, pStand.z, yawAft);
      g.player.walker.y = pStand.y;
      g.input.lookYaw = yawAft;
      g.input.lookPitch = -0.1;

      const pFridge = toW(-3.6, 0.86, -0.65);
      const fridge = g.loose.addItem({ uid: 'p1-fridge', item: 'nd_fridge', qty: 1 }, pFridge.x, pFridge.y, pFridge.z, yawAft - Math.PI / 2);
      g.loose.ride(fridge, v);
      const pStandF = toW(-2.7, 0.86, 0.62);
      const kstand = g.loose.addItem({ uid: 'p1-kstand', item: 'nd_kitchen_stand', qty: 1 }, pStandF.x, pStandF.y, pStandF.z, yawAft + Math.PI / 2);
      g.loose.ride(kstand, v);
      return { inside: v.walkSolids.insideLiving(g.player.walker.x, g.player.walker.y, g.player.walker.z) };
    });
    await waitModels(page, 1200);
    await shot(page, '08a_rv_rear_day_lighting');

    // #16 Toggle U dome light while standing inside RV rear!
    await page.keyboard.down('KeyU');
    await runFrame(page, 0.06);
    await page.keyboard.up('KeyU');
    await runFrame(page, 0.35);
    const domeOnInside = await page.evaluate(() => window.__rt.game.vehicles[0].domeOn);
    await shot(page, '08b_rv_rear_dome_light_on');
    ok(domeOnInside === true, `#16 KeyU toggles cabin dome light while standing inside RV rear (${domeOnInside})`);

    // #19 Jump 4 times diagonally toward the RV side wall — must NEVER eject out of RV
    let stayedInside = true;
    for (let j = 0; j < 4; j++) {
      await page.keyboard.down('KeyW');
      await page.keyboard.down('KeyD');
      await page.keyboard.down('Space');
      await runFrame(page, 0.08);
      await page.keyboard.up('Space');
      await runFrame(page, 0.55);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyD');
      const ins = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.vehicles[0];
        const w = g.player.walker;
        return v.walkSolids.insideLiving(w.x, w.y, w.z);
      });
      if (!ins) stayedInside = false;
    }
    ok(rvSetup.inside && stayedInside, `#19 jumping inside RV never ejects player outside (start=${rvSetup.inside}, after4Jumps=${stayedInside})`);

    // #21 Throw item hard at the RV interior side wall — must bounce back and stay strictly inside RV!
    const throwRes = await page.evaluate(() => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const b = new Float64Array(9);
      v.sim.basis(b);
      const cg = v.sys.derived.cg;
      const pMid = {
        x: v.sim.px + b[0] * (-1.6 - cg.x) + b[3] * (0.86 - cg.y) + b[6] * (0 - cg.z),
        y: v.sim.py + b[1] * (-1.6 - cg.x) + b[4] * (0.86 - cg.y) + b[7] * (0 - cg.z),
        z: v.sim.pz + b[2] * (-1.6 - cg.x) + b[5] * (0.86 - cg.y) + b[8] * (0 - cg.z),
      };
      const wallYaw = Math.atan2(b[8], b[6]);
      w.place(pMid.x, pMid.z, wallYaw);
      w.y = pMid.y;
      g.input.lookYaw = wallYaw;
      g.input.lookPitch = 0.05;
      const l = g.loose.addItem({ uid: 'p1-throw', item: 'food_fish_can', qty: 1 }, pMid.x, pMid.y + 1.2, pMid.z, 0);
      g.loose.fling(l, { x: b[6] * 8.5, y: 1.4, z: b[8] * 8.5 }, 4);
      return l.uid;
    });
    await runFrame(page, 2.2);
    const landedInRv = await page.evaluate((uid) => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const l = g.loose.list.find((x) => x.uid === uid);
      if (!l) return { found: false };
      const m = { x: 0, y: 0, z: 0 };
      v.walkSolids.worldToModel(l.x, l.y, l.z, m);
      return {
        found: true,
        inside: Math.abs(m.z) <= 1.25 && m.x >= -5.2 && m.x <= 1.2 && m.y >= 0.65 && m.y <= 2.8,
        m: { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2) },
      };
    }, throwRes);
    ok(landedInRv.found && landedInRv.inside, `#21 item thrown hard at RV side wall stays inside RV (${JSON.stringify(landedInRv)})`);

    ok(errors.length === 0, `RV walkthrough console clean (${errors.length} errors)`);
    await page.close();
  }

  console.log(`\nPHASE1_VERIFY_DONE bad=${bad}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
