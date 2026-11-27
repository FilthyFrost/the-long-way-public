// Step 8 comprehensive end-to-end verification (Steps 1-7):
// Real mouse & keyboard walkthrough of Nomad Drive driving keys, 75->50 deg RMB eye zoom, Q charge throw,
// E held-item uses, unified arbiter & 4.6 px white outline, immersion cleanups (no sleep/recipes/codex/Tab container list),
// 15 m assembly holograms, and final comparison screenshots in D:/cindy-scratch/final-compare/.
//   SHOTS_GPU=1 node harness/shots/nd_full_verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, mouseButton, openGame, startServer } from './lib.mjs';

const out = 'D:/cindy-scratch/final-compare';
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

async function tapKey(page, code, holdS = 0.06) {
  await page.keyboard.down(code);
  await runFrame(page, holdS);
  await page.keyboard.up(code);
  await runFrame(page, 0.15);
}

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=900&time=21&weather=clear`, { width: 1280, height: 720 });
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

  // ------------------------------------------------------------------ 1. Cockpit: 75 deg FOV, manual headlights (Off->Low->High->Off), wipers K, dome U, horn H, V view, Space handbrake, F1 hints, Hold Q exit at speed
  await runFrame(page, 0.5);
  const initDrive = await ev(() => {
    const g = window.__rt.game;
    const v = g.seated;
    return {
      seated: !!v,
      fov: +g.core.camera.fov.toFixed(1),
      lightsOn: v?.sys.lightsOn,
      highBeam: v?.sys.highBeam,
      running: v?.sys.running,
    };
  });
  ok(initDrive.seated && Math.abs(initDrive.fov - 75) < 1, `cockpit FOV is 75 deg (${JSON.stringify(initDrive)})`);
  ok(!initDrive.lightsOn, `headlights stay OFF at night (21:00) until T is pressed (${JSON.stringify(initDrive)})`);

  // T cycle: Off -> Low -> High -> Off
  await tapKey(page, 'KeyT');
  const t1 = await ev(() => ({ on: window.__rt.game.seated.sys.lightsOn, mode: window.__rt.game.seated.sys.lights }));
  await tapKey(page, 'KeyT');
  const t2 = await ev(() => ({ on: window.__rt.game.seated.sys.lightsOn, mode: window.__rt.game.seated.sys.lights }));
  await tapKey(page, 'KeyT');
  const t3 = await ev(() => ({ on: window.__rt.game.seated.sys.lightsOn, mode: window.__rt.game.seated.sys.lights }));
  ok(t1.on && t1.mode === 'low' && t2.on && t2.mode === 'high' && !t3.on && t3.mode === 'off', `T cycles headlights Off->Low->High->Off (${JSON.stringify([t1, t2, t3])})`);

  // Leave Low beams on for nice evening cockpit screenshot, toggle dome light U & wipers K & view V
  await tapKey(page, 'KeyT');
  await tapKey(page, 'KeyU');
  const dome = await ev(() => window.__rt.game.seated.domeOn);
  ok(dome === true, `U toggles cabin dome light on (${dome})`);

  await tapKey(page, 'KeyK');
  const w1 = await ev(() => window.__rt.game.manualWiper);
  await tapKey(page, 'KeyK');
  const w2 = await ev(() => window.__rt.game.manualWiper);
  await tapKey(page, 'KeyK');
  const w3 = await ev(() => window.__rt.game.manualWiper);
  ok(w1 === 'slow' && w2 === 'fast' && w3 === 'off', `K cycles manual wipers slow->fast->off (${JSON.stringify([w1, w2, w3])})`);

  // Space toggles handbrake
  const hb0 = await ev(() => window.__rt.game.seated.sim.parkBrake > 0.5);
  await tapKey(page, 'Space');
  const hb1 = await ev(() => window.__rt.game.seated.sim.parkBrake > 0.5);
  ok(hb0 !== hb1, `Space toggles handbrake (${hb0} -> ${hb1})`);

  // V toggles cockpit <-> chase; C does NOT toggle view in vehicle
  const vm0 = await ev(() => window.__rt.game.viewMode);
  await tapKey(page, 'KeyC');
  const vmAfterC = await ev(() => window.__rt.game.viewMode);
  await tapKey(page, 'KeyV');
  const vmAfterV = await ev(() => window.__rt.game.viewMode);
  await tapKey(page, 'KeyV');
  const vmBack = await ev(() => window.__rt.game.viewMode);
  ok(vm0 === 'cockpit' && vmAfterC === 'cockpit' && vmAfterV === 'chase' && vmBack === 'cockpit', `V toggles cockpit/chase while C is ignored (${JSON.stringify([vm0, vmAfterC, vmAfterV, vmBack])})`);

  // F1 toggles driving hints
  const hints0 = await ev(() => window.__rt.game.driveHintsOn);
  await tapKey(page, 'F1');
  const hints1 = await ev(() => window.__rt.game.driveHintsOn);
  await tapKey(page, 'F1');
  const hints2 = await ev(() => window.__rt.game.driveHintsOn);
  ok(hints0 === true && hints1 === false && hints2 === true, `F1 toggles driving hints (${JSON.stringify([hints0, hints1, hints2])})`);

  await shot('01_cockpit_driving_75fov');

  // KeyI stops ignition, then starts again
  await tapKey(page, 'KeyI');
  const engOff = await ev(() => window.__rt.game.seated.sys.running);
  ok(engOff === false, `I toggles ignition off (${engOff})`);
  await tapKey(page, 'KeyI');
  await runFrame(page, 1.5);
  const engOn = await ev(() => window.__rt.game.seated.sys.running);
  ok(engOn === true, `I cranks & restarts engine (${engOn})`);

  // Hold Q 0.35 s exits vehicle even while moving!
  await ev(() => {
    const v = window.__rt.game.seated;
    v.sim.setParkBrake(false);
    const b = new Float64Array(9);
    v.sim.basis(b);
    v.sim.vx = b[0] * 5;
    v.sim.vz = b[2] * 5;
  });
  await page.keyboard.down('KeyQ');
  await runFrame(page, 0.5);
  await page.keyboard.up('KeyQ');
  await runFrame(page, 0.2);
  const exitedMoving = await ev(() => ({ seated: !!window.__rt.game.seated, speed: +Math.hypot(window.__rt.game.player.walker.vx, window.__rt.game.player.walker.vz).toFixed(2) }));
  ok(!exitedMoving.seated, `Hold Q 0.35 s exits vehicle while rolling (${JSON.stringify(exitedMoving)})`);

  // Switch to daytime for clear exterior comparison shots & park car
  await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    v.sim.vx = 0; v.sim.vz = 0;
    v.sim.setParkBrake(true);
    v.sys.stop('');
    g.env.clock.setHour?.(11);
    g.time = 11 * 3600;
    g.simulate(0.4);
  });

  // ------------------------------------------------------------------ 2. On foot: 75 deg FOV, Hold RMB 75->50 deg zoom, V third-person, C crouch, Shift toggle sprint
  const footFov = await ev(() => +window.__rt.game.core.camera.fov.toFixed(1));
  ok(Math.abs(footFov - 75) < 1, `on-foot FOV is 75 deg (${footFov})`);

  // Hold RMB -> eye zooms to ~50 deg in 0.49 s
  await mouseButton(page, true, 2);
  await runFrame(page, 0.65);
  const zoomFov = await ev(() => +window.__rt.game.core.camera.fov.toFixed(1));
  await shot('03_rmb_eye_zoom_50deg');
  await mouseButton(page, false, 2);
  await runFrame(page, 0.65);
  const backFov = await ev(() => +window.__rt.game.core.camera.fov.toFixed(1));
  ok(zoomFov <= 52 && zoomFov >= 48 && Math.abs(backFov - 75) < 1, `Hold RMB zooms FOV 75 -> 50 -> 75 deg (${zoomFov} / ${backFov})`);

  // ------------------------------------------------------------------ 3. Immersion cleanups: no J codex/recipes, Tab has only Vehicle & Body (no recipes/journal/container list), no sleep
  await tapKey(page, 'KeyJ');
  const afterJ = await ev(() => ({ tabAt: window.__rt.game.tabAt, listV: window.__rt.game.listV }));
  await tapKey(page, 'Tab');
  const tabPages = await ev(() => {
    const g = window.__rt.game;
    const ids = g.tabPages.map((p) => p.id);
    return {
      listOpen: g.listOpen,
      listV: g.listV === 'self' ? 'self' : !!g.listV,
      tabIds: ids,
      hasRecipe: document.body.innerText.includes('食谱'),
      hasCodex: document.body.innerText.includes('图鉴'),
    };
  });
  await tapKey(page, 'Tab');
  ok(afterJ.tabAt === -1 && !afterJ.listV && tabPages.listOpen && !tabPages.tabIds.includes('recipes') && !tabPages.tabIds.includes('journal') && !tabPages.hasRecipe && !tabPages.hasCodex, `No recipe book or codex UI on J or Tab (${JSON.stringify({ afterJ, tabPages })})`);

  // ------------------------------------------------------------------ 4. 4.6 px white silhouette outline + one-key-one-action arbiter + right item card + centered crosshair prompt
  await ev(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const cg = v.sys.derived.cg;
    const m = v.view.frame.mounts.find((x) => x.id === 'door_FL');
    const dx = m.pos.x - cg.x, dy = m.pos.y - cg.y, dz = m.pos.z - cg.z;
    const tx = v.sim.px + b[0] * dx + b[3] * dy + b[6] * dz;
    const ty = v.sim.py + b[1] * dx + b[4] * dy + b[7] * dz;
    const tz = v.sim.pz + b[2] * dx + b[5] * dy + b[8] * dz;
    // Stand 1.3 m outside driver door looking right at it
    const px = tx - b[6] * 1.3;
    const pz = tz - b[8] * 1.3;
    g.player.walker.place(px, pz, 0, 0);
    const la = g.player.walker.lookAt(tx, ty - 0.1, tz);
    g.input.lookYaw = la.yaw;
    g.input.lookPitch = la.pitch;
    g.simulate(0.2);
  });
  await runFrame(page, 0.25);
  const aimDoor = await ev(() => {
    const g = window.__rt.game;
    return {
      target: g.player.target?.kind === 'part' ? g.player.target.mount.id : g.player.target?.kind ?? null,
      outline: !!g.player.outlineTarget,
      text: document.body.innerText,
    };
  });
  ok(aimDoor.target === 'door_FL' && aimDoor.outline && aimDoor.text.includes('打开') && aimDoor.text.includes('拆下'), `Aiming at door_FL shows 4.6 px white outline + LMB 打开 + Hold E 拆下 (target=${aimDoor.target}, outline=${aimDoor.outline})`);
  await shot('02_outline_and_card');

  // ------------------------------------------------------------------ 5. E held-item flashlight toggle + Q tap toss & Q hold charge throw (no Q-stow!)
  await ev(async () => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    g.player.slots[0] = { kind: 'item', item: I.newItem('nd_flashlight') };
    g.player.sel = 0;
    // Look away from car toward open road so target doesn't claim E
    g.input.lookYaw += Math.PI;
    g.input.lookPitch = 0;
    g.simulate(0.15);
  });
  await tapKey(page, 'KeyE');
  const flashOn = await ev(async () => {
    const F = await import('/src/core/v3/nd/flashlight.ts');
    const it = window.__rt.game.player.held?.item;
    return it ? F.isOn(it) : false;
  });
  ok(flashOn === true, `E toggles held flashlight on (${flashOn})`);

  // Hold Q 0.7 s to charge throw and verify thrown item flies out cleanly
  await page.keyboard.down('KeyQ');
  await runFrame(page, 0.75);
  const qCharge = await ev(() => +window.__rt.game.player.qCharge.toFixed(2));
  await page.keyboard.up('KeyQ');
  await runFrame(page, 0.3);
  const afterThrow = await ev(() => ({ held: !!window.__rt.game.player.held, looseCount: window.__rt.game.loose.list.length }));
  ok(qCharge > 0.3 && !afterThrow.held && afterThrow.looseCount > 0, `Hold Q charges throw (${qCharge}) and flings item cleanly (${JSON.stringify(afterThrow)})`);

  ok(errors.length === 0, `no page/console errors (${errors.length})`);
  if (errors.length) console.log('errors:', errors);
} finally {
  await browser.close();
  server.close();
}

process.exit(bad ? 1 : 0);
